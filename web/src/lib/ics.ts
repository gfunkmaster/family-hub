/**
 * Hela schemat som en iCalendar-fil (RFC 5545). Ren logik: inget nätverk, ingen DOM.
 * Tiderna följer samma regler som Google Kalender-länken (`eventSpan`): svensk tid, heldag utan starttid.
 */
import type { Item } from "@family-hub/logic";
import { eventSpan, itemCalendarEvent } from "./links.ts";

export interface IcsDay { date: string; chosen: { item: Item }[] }

const CRLF = "\r\n";
const encoder = new TextEncoder();

/** Escapar TEXT-värden: backslash, komma, semikolon och radbrytning. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Viker en rad så att ingen rad blir längre än 75 oktetter (UTF-8). Delar aldrig ett tecken. Returnerar rader utan CRLF. */
export function icsFold(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    // Fortsättningsraderna börjar med ett blanksteg, som också räknas.
    const limit = out.length === 0 ? 75 : 74;
    if (curBytes + n > limit) {
      out.push(out.length === 0 ? cur : ` ${cur}`);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += n;
  }
  out.push(out.length === 0 ? cur : ` ${cur}`);
  return out;
}

// Europas sommartidsregler. Det är tidszonsregler, inte en återkommande händelse.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Stockholm",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

function eventLines(it: Item, date: string, runId: string, now: Date): string[] | null {
  const ev = itemCalendarEvent(it, date);
  const span = eventSpan(ev);
  if (!span) return null;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${runId}-${date}-${it.id}@family-hub`,
    `DTSTAMP:${utcStamp(now)}`,
    span.allDay ? `DTSTART;VALUE=DATE:${span.start}` : `DTSTART;TZID=Europe/Stockholm:${span.start}`,
    span.allDay ? `DTEND;VALUE=DATE:${span.end}` : `DTEND;TZID=Europe/Stockholm:${span.end}`,
    `SUMMARY:${icsEscape(ev.title)}`,
  ];
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  if (ev.details) lines.push(`DESCRIPTION:${icsEscape(ev.details)}`);
  lines.push("END:VEVENT");
  return lines;
}

/** Finns det minst en händelse att ladda ner? Vilodagar och ogiltiga datum räknas inte. */
export function hasIcsEvents(days: IcsDay[]): boolean {
  return days.some((d) => d.chosen.length > 0 && eventSpan({ title: "", date: d.date }) != null);
}

/** Schemat som .ics-text, en VEVENT per vald aktivitet. Null när det inte finns någon händelse. */
export function scheduleIcs(days: IcsDay[], opts: { runId: string; now: Date }): string | null {
  const events: string[] = [];
  for (const d of days) {
    for (const c of d.chosen) {
      const lines = eventLines(c.item, d.date, opts.runId, opts.now);
      if (lines) events.push(...lines);
    }
  }
  if (!events.length) return null;
  const all = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//family-hub//Familjeschema//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE,
    ...events,
    "END:VCALENDAR",
  ];
  return all.flatMap(icsFold).join(CRLF) + CRLF;
}
