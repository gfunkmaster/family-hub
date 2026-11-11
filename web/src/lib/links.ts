/**
 * Länkar ut från ett förslag: karta och Google Kalender. Ren logik, inga nätverksanrop.
 * Google Kalenders mall-länk kräver inget API: den öppnar ett ifyllt utkast som användaren sparar själv.
 */
import { addDays, type Item } from "@family-hub/logic";

export interface MapTarget { lat?: number; lng?: number; venue?: string; title?: string }

/** Google Maps-länk (öppnar appen på mobilen). Koordinater går före adress. Null när inget går att söka på. */
export function mapsUrl(t: MapTarget, area?: string): string | null {
  if (typeof t.lat === "number" && typeof t.lng === "number" && Number.isFinite(t.lat) && Number.isFinite(t.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`;
  }
  // Parenteser som "(22 km söder om Växjö)" eller "(plan 4)" förvirrar kartsökningen.
  const text = [(t.venue || t.title)?.replace(/\s*\([^)]*\)/g, ""), area].filter((x) => x && x.trim()).join(", ");
  return t.venue || t.title ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : null;
}

export interface CalendarEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, svensk tid. Utan start blir det en heldagshändelse. */
  start?: string;
  /** HH:MM. Saknas den används `durationMin`, annars två timmar. */
  end?: string;
  durationMin?: number;
  location?: string;
  details?: string;
}

// Samma format som valideringen godtar: "9:30" och "09:30".
const HHMM = /^(\d{1,2}):([0-5]\d)$/;
/** Är det ett giltigt klockslag ("9:30" eller "09:30")? */
export const isClockTime = (t: string | undefined): t is string => t != null && toMin(t) != null;
const toMin = (t: string) => { const m = HHMM.exec(t.trim()); return m && Number(m[1]) < 24 ? Number(m[1]) * 60 + Number(m[2]) : null; };
const stamp = (date: string, min: number) => `${date.replaceAll("-", "")}T${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}00`;

export interface EventSpan {
  /** Heldag: start och slut är YYYYMMDD (slut = nästa dag). Annars YYYYMMDDTHHMMSS i svensk tid. */
  allDay: boolean;
  start: string;
  end: string;
}

/** Start och slut för en händelse. Utan giltig starttid heldag, annars högst till 23:59. Null om datumet är ogiltigt. */
export function eventSpan(e: CalendarEvent): EventSpan | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return null;
  const start = e.start ? toMin(e.start) : null;
  if (start == null) {
    return { allDay: true, start: e.date.replaceAll("-", ""), end: addDays(e.date, 1).replaceAll("-", "") };
  }
  const given = e.end ? toMin(e.end) : null;
  const end = Math.min(given != null && given > start ? given : start + (e.durationMin && e.durationMin > 0 ? e.durationMin : 120), 23 * 60 + 59);
  return { allDay: false, start: stamp(e.date, start), end: stamp(e.date, end) };
}

/** Kalenderhändelse för ett förslag en viss dag. Ett evenemang får sina tider, en plats blir en heldagshändelse med öppettiderna. */
export function itemCalendarEvent(it: Item, date: string): CalendarEvent {
  const entry = it.dates?.find((d) => d.date === date);
  return {
    title: it.title, date,
    ...(it.kind === "event" && entry?.from ? { start: entry.from, end: entry.to, durationMin: it.durationMin } : {}),
    location: it.venue,
    details: [entry?.from && it.kind !== "event" ? `Öppet ${entry.from}–${entry.to ?? ""}` : null, it.note, it.sources?.[0]?.url].filter(Boolean).join("\n"),
  };
}

/** Länk som öppnar ett ifyllt utkast i Google Kalender, i svensk tid. Null om datumet är ogiltigt. */
export function calendarUrl(e: CalendarEvent): string | null {
  const span = eventSpan(e);
  if (!span) return null;
  const dates = `${span.start}/${span.end}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, ctz: "Europe/Stockholm" });
  if (e.location) q.set("location", e.location);
  if (e.details) q.set("details", e.details);
  return `https://calendar.google.com/calendar/render?${q}`;
}
