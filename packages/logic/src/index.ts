/**
 * Pure logic for Familjeaktiviteter: ages, costs, travel, scoring, day plans and period schedules.
 * No DOM, no network. The build inlines this file (types stripped) into the single-page app,
 * and the tests import it directly.
 */

// ---------- Types ----------

export type Level = "passar ej" | "oklart" | "troligt" | "säkert";
export type Tier = "gratis" | "under300" | "mer" | "okänt";
export type Mode = "walk" | "transit" | "car";
export type YesNo = "ja" | "nej" | "oklart";

export interface Coords { lat: number; lng: number }

export interface Child { id?: string; name?: string; birthdate: string; approx?: boolean }
export interface Nap { from: string; to: string }
export interface Place { id: string; name?: string; address?: string; city?: string; lat?: number; lng?: number; geoNote?: string }

export interface Profile {
  adults?: number;
  budgetMax?: number | null;
  /** Högsta kostnad per vecka (måndag–söndag) för schemats aktiviteter, inklusive resa. Null eller saknas: ingen gräns. */
  weekBudget?: number | null;
  children?: Child[];
  naps?: Nap[];
  needs?: { stroller?: boolean; changing?: boolean };
  interests?: string[];
  avoid?: string[];
  homeCity?: string;
  availability?: { weekdays?: boolean; weekends?: boolean };
  leaveUntil?: string | null;
  autoRun?: "helg" | "vecka" | "ingen";
  places?: Place[];
}

export interface City {
  id?: string;
  name?: string;
  origin?: string;
  defaultPlaceId?: string | null;
  transport?: { car?: boolean; transit?: boolean };
  maxTravelMin?: number | null;
  carCostPerKm?: number | null;
  transitTicket?: { adult?: number | null; child?: number | null; note?: string };
  childFreeTransitUnder?: number | null;
  sources?: { name: string; url: string; kind?: string }[];
}

export interface Leg { min?: number | null; km?: number | null; note?: string; parking?: number; ticketAdult?: number | null }
export type Travel = Partial<Record<Mode, Leg>>;

export interface DayEntry { date: string; from?: string; to?: string; adult?: number | null }
/** Förbokning: om den krävs, när bokningen öppnar ("YYYY-MM-DD" eller "YYYY-MM-DDTHH:MM", svensk tid) och var man bokar. */
export interface Booking { required?: YesNo | null; opensAt?: string | null; url?: string | null; note?: string | null }

export interface Item {
  id: string;
  title: string;
  kind?: "event" | "place";
  venue?: string;
  lat?: number;
  lng?: number;
  indoor?: boolean;
  durationMin?: number;
  dates?: DayEntry[];
  prices?: { adult?: number | null; child?: number | null; childFreeUnder?: number | null };
  travel?: Travel;
  ageFit?: { level?: Level; minMonths?: number | null; maxMonths?: number | null; note?: string };
  practical?: { stroller?: YesNo; changing?: YesNo };
  booking?: Booking;
  note?: string;
  conflict?: string | null;
  tags?: string[];
  verified?: boolean;
  sources?: { title?: string; url: string }[];
}

export interface Rating { verdict: "bra" | "nej" | "besokt"; stars?: number | null; tags?: string[] }

export interface Origin extends Coords { name?: string }

export interface ScoreContext {
  profile: Profile;
  city: City;
  cityId: string;
  date: string;
  ratings?: Record<string, Rating>;
  tagWeights?: Record<string, number>;
  origin?: Origin | null;
}

// ---------- Basics ----------

export const LEVELS: readonly Level[] = ["passar ej", "oklart", "troligt", "säkert"];
export const TIER_LABEL: Record<Tier, string> = { gratis: "Gratis", under300: "Under 300 kr", mer: "Kostar mer", okänt: "Pris okänt" };

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function esc(s: unknown): string { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c); }
export function safeUrl(u: unknown): string | null {
  try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; }
}
export function slug(s: unknown): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "x";
}
export function toMin(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export function fmtMin(n: number): string { const h = Math.floor(n / 60), m = n % 60; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); }
export function parseDate(d: string): Date { const [y = 1970, m = 1, dd = 1] = String(d).split("-").map(Number); return new Date(y, m - 1, dd); }
export function isoDate(dt: Date): string { return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0"); }
export function addDays(iso: string, n: number): string { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); }
export function datesBetween(from: string, to: string): string[] { const out: string[] = []; let d = from, g = 0; while (d <= to && g++ < 62) { out.push(d); d = addDays(d, 1); } return out; }
export function isWeekend(iso: string): boolean { const g = parseDate(iso).getDay(); return g === 0 || g === 6; }
/** Svensk decimalform utan locale-beroende: 3.3 → "3,3". */
export function svNum(n: number): string { return String(Math.round(n * 10) / 10).replace(".", ","); }
export interface Weather { date: string; high?: number | null; low?: number | null; precip?: number | null; precipMm?: number | null }
/** Nederbörd som text: risk i procent (`precip`) eller mängd i mm (`precipMm`). Tom sträng när inget är känt. */
export function fmtPrecip(w: Weather | null | undefined, long = false): string {
  if (!w) return "";
  if (w.precipMm != null) return svNum(w.precipMm) + " mm" + (long ? " nederbörd" : "");
  if (w.precip != null) return svNum(w.precip) + " %" + (long ? " risk för nederbörd" : "");
  return "";
}
/** Väntas regn enligt prognosen? Minst 1 mm eller minst 50 % risk. Okänt väder är inte regn. */
export function isRainy(w: Weather | null | undefined): boolean {
  if (!w) return false;
  const mm = typeof w.precipMm === "number" ? w.precipMm : null, pct = typeof w.precip === "number" ? w.precip : null;
  return (mm != null && mm >= 1) || (pct != null && pct >= 50);
}
export interface Clothing { headline: string; items: string[] }
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
/**
 * Klädtips efter dagens väder och yngsta barnets ålder. Tumregler, inte ett löfte om att det räcker.
 * Saknas temperaturen är svaret null: vi gissar inte väder.
 */
export function clothingFor(w: Weather | null | undefined, youngestMonths?: number | null): Clothing | null {
  const high = numOrNull(w?.high), low = numOrNull(w?.low);
  if (!w || (high == null && low == null)) return null;
  const hi = high ?? (low as number), lo = low ?? hi;
  const items: string[] = [];
  let headline: string;
  if (hi >= 22) { headline = "Varmt: lätta kläder och skydd mot solen"; items.push("Tunna, luftiga kläder i bomull eller ull", "Solhatt eller keps och solskydd på bar hud", "Vatten att dricka, och skugga för vagnen"); }
  else if (hi >= 15) { headline = "Milt: långärmat och en tunn jacka"; items.push("Långärmad tröja eller body och långbyxor", "Tunn jacka eller kofta, tas av när solen kommer"); }
  else if (hi >= 8) { headline = "Svalt: underställ och en riktig jacka"; items.push("Underställ av ull eller fleece närmast kroppen", "Tröja, byxor och en jacka som skyddar mot vind", "Tunn mössa, och tunna vantar om det blåser"); }
  else if (hi >= 0) { headline = "Kallt: varma lager, mössa och vantar"; items.push("Underställ av ull, en fleece eller ulltröja och ett varmt ytterskikt (overall)", "Mössa som täcker öronen, vantar och varma strumpor", "Varma skor eller stövlar med ull i, och en åkpåse eller fårskinn i vagnen"); }
  else { headline = "Mycket kallt: håll pauserna korta"; items.push("Tjockt underställ av ull, fleece och en varm overall", "Mössa, halsvärmare, vantar och varma, torra strumpor", "Skyddskräm i ansiktet, åkpåse i vagnen och byt till torra kläder vid behov", "Planera korta utomhuspass med inomhuspauser"); }
  if (hi - lo >= 8) items.push("Stor skillnad mellan morgon och eftermiddag: klä i lager som går att ta av");
  const mm = numOrNull(w.precipMm), pct = numOrNull(w.precip);
  if (isRainy(w)) items.push("Regn väntas: regnjacka och regnbyxor, och gummistövlar eller vattentäta skor", "Regnskydd till vagnen och torra kläder i väskan");
  else if ((mm != null && mm > 0) || (pct != null && pct >= 30)) items.push("Risk för skurar: ett regnskal i väskan");
  if (youngestMonths != null && youngestMonths < 12 && hi < 22) items.push("Bebis i vagn: ett lager mer än du själv. Känn i nacken: svettig är för varmt, kall är för kallt");
  return { headline, items };
}
export function isoWeek(iso: string): number {
  const d = parseDate(iso); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

// ---------- Age ----------

export function ageMonths(birthdate: string, onDate: string): number {
  const b = parseDate(birthdate), o = parseDate(onDate);
  let m = (o.getFullYear() - b.getFullYear()) * 12 + (o.getMonth() - b.getMonth());
  if (o.getDate() < b.getDate()) m -= 1;
  return Math.max(0, m);
}
export function stageFor(months: number): string {
  if (months < 6) return "Bebis";
  if (months < 12) return "Krypålder";
  if (months < 24) return "1 år";
  if (months < 36) return "2 år";
  if (months < 72) return "Förskoleålder";
  if (months < 156) return "Skolbarn";
  return "Tonåring";
}
export function ageLabel(months: number): string { return months < 24 ? months + " mån" : Math.floor(months / 12) + " år"; }

/** Conservative: the family's fit is the worst fit among the children. */
export function ageFitFor(item: Item, children: Child[] | undefined, date: string): { level: Level; note: string } {
  const a = item.ageFit ?? { level: "oklart" as Level, minMonths: 0, maxMonths: null };
  if (!children || !children.length) return { level: a.level ?? "oklart", note: a.note ?? "" };
  let worst = 3;
  for (const c of children) {
    const m = ageMonths(c.birthdate, date);
    let lvl = LEVELS.indexOf(a.level ?? "oklart"); if (lvl < 0) lvl = 1;
    if ((a.minMonths != null && m < a.minMonths) || (a.maxMonths != null && m > a.maxMonths)) lvl = 0;
    worst = Math.min(worst, lvl);
  }
  return { level: LEVELS[worst] ?? "oklart", note: a.note ?? "" };
}

// ---------- Booking ----------

export const BOOKING_OPENS = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/;
export interface BookingStatus {
  /** "krävs": arrangören kräver bokning. "kanske": det finns bokningsuppgifter men inget besked om krav. "ej": drop-in. */
  state: "krävs" | "kanske" | "ej";
  /** Bokningen har inte öppnat än: öppnar en senare dag, eller idag på ett angivet klockslag. */
  opensLater: boolean;
  /** Bokningen öppnade en tidigare dag. */
  opened: boolean;
  opensDate: string | null; opensTime: string | null; url: string | null; note: string;
}
/**
 * Vad som gäller för förbokning på ett förslag, sett från `today` (YYYY-MM-DD). Null när inget är känt: vi gissar inte.
 * Bara "oklart" utan öppningstid, länk eller anteckning räknas som okänt.
 */
export function bookingStatus(item: Pick<Item, "booking">, today: string): BookingStatus | null {
  const b = item.booking;
  if (!b) return null;
  const m = BOOKING_OPENS.exec(b.opensAt ?? "");
  const opensDate = m?.[1] ?? null, opensTime = m?.[2] ?? null;
  const url = safeUrl(b.url), note = (typeof b.note === "string" ? b.note : "").trim().slice(0, 300);
  const state = b.required === "ja" ? "krävs" : b.required === "nej" ? "ej" : "kanske";
  if (state === "kanske" && !opensDate && !url && !note) return null;
  const opensLater = opensDate != null && (opensDate > today || (opensDate === today && opensTime != null));
  return { state, opensLater, opened: opensDate != null && opensDate < today, opensDate, opensTime, url, note };
}

// ---------- Cost ----------

export function dayEntry(item: Item, date: string): DayEntry | null { return (item.dates ?? []).find((d) => d.date === date) ?? null; }

export interface CostPart { total: number | null; unknown: string[] }

/** Entry cost for the family. Unknown prices are reported as unknown, never guessed. */
export function entryCost(item: Item, profile: Profile, date: string): CostPart & { known: number } {
  const adults = profile.adults ?? 2, p = item.prices ?? {}, d = dayEntry(item, date);
  const adultPrice = d && d.adult != null ? d.adult : p.adult;
  let total = 0; const unknown: string[] = [];
  if (adultPrice == null) unknown.push("vuxenpris"); else total += adults * adultPrice;
  for (const c of profile.children ?? []) {
    const years = Math.floor(ageMonths(c.birthdate, date) / 12);
    if (p.childFreeUnder != null && years < p.childFreeUnder) continue;
    if (p.child == null) { unknown.push("barnpris"); continue; }
    total += p.child;
  }
  return { total: unknown.length ? null : total, known: total, unknown: [...new Set(unknown)] };
}

export function travelCost(item: Item, profile: Profile, city: City, mode: Mode, date: string, trOverride?: Travel): CostPart {
  const adults = profile.adults ?? 2, t = (trOverride ?? item.travel ?? {})[mode];
  if (mode === "walk") return { total: 0, unknown: [] };
  if (!t) return { total: null, unknown: ["resväg"] };
  if (mode === "car") {
    if (t.km == null || city.carCostPerKm == null) return { total: null, unknown: ["bilkostnad"] };
    return { total: Math.round(t.km * 2 * city.carCostPerKm + (t.parking ?? 0)), unknown: [] };
  }
  const ticket = t.ticketAdult ?? city.transitTicket?.adult;
  if (ticket == null) return { total: null, unknown: ["biljettpris"] };
  let total = adults * ticket * 2; const unknown: string[] = [];
  for (const c of profile.children ?? []) {
    const years = Math.floor(ageMonths(c.birthdate, date) / 12);
    if (city.childFreeTransitUnder != null && years < city.childFreeTransitUnder) continue;
    const ct = city.transitTicket?.child;
    if (ct == null) { unknown.push("barnbiljett"); continue; }
    total += ct * 2;
  }
  return { total: unknown.length ? null : total, unknown };
}

export function tierFor(entry: number | null): Tier { if (entry == null) return "okänt"; if (entry === 0) return "gratis"; if (entry <= 300) return "under300"; return "mer"; }

// ---------- Travel ----------

/** Straight-line distance between two points, km. */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function hasCoords(p: unknown): p is Coords {
  if (!p || typeof p !== "object") return false;
  const q = p as Partial<Coords>;
  return typeof q.lat === "number" && typeof q.lng === "number" && Number.isFinite(q.lat) && Number.isFinite(q.lng);
}
/** Parse "56.87, 14.80" (as copied from Google Maps) or "56,87 14,80" into coordinates. */
export function parseCoords(s: unknown): Coords | null {
  const str = String(s ?? "").trim(); if (!str) return null;
  let parts = str.split(/[\s;]+|,\s+/).filter(Boolean);
  const only = parts[0];
  if (parts.length === 1 && only && (only.match(/,/g) ?? []).length === 1 && only.includes(".")) parts = only.split(",");
  if (parts.length !== 2) return null;
  const num = (x: string) => (/^-?\d{1,3}([.,]\d+)?$/.test(x) ? parseFloat(x.replace(",", ".")) : NaN);
  const lat = num(parts[0] ?? ""), lng = num(parts[1] ?? "");
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}
/**
 * Rough travel estimate: road ≈ 1.3 × straight line. Walk 4.5 km/h with stroller; car 35 km/h in town,
 * 65 km/h beyond 10 km, +5 min to park; transit is a coarse guess (20 km/h + 10 min waiting and walking).
 */
export function estimateTravel(origin: Origin | null | undefined, item: Partial<Coords>): Travel | null {
  if (!hasCoords(origin) || !hasCoords(item)) return null;
  const road = haversineKm(origin, item) * 1.3;
  const out: Travel = {};
  if (road <= 3) out.walk = { min: Math.max(1, Math.round((road / 4.5) * 60)), note: "ca" };
  const carMin = road < 10 ? (road / 35) * 60 : (10 / 35) * 60 + ((road - 10) / 65) * 60;
  out.car = { km: Math.round(road * 10) / 10, min: Math.round(carMin + 5), note: "ca" };
  if (road > 0.8) out.transit = { min: Math.round((road / 20) * 60 + 10), note: "grov uppskattning" };
  return out;
}
export function travelSource(item: Item, origin?: Origin | null): { tr: Travel; basis: string | null; estimated: boolean } {
  const est = estimateTravel(origin, item);
  return est && origin ? { tr: est, basis: "från " + (origin.name || "vald plats"), estimated: true } : { tr: item.travel ?? {}, basis: null, estimated: false };
}

export interface TravelChoice {
  mode: Mode; min: number | null; note: string;
  withinLimit: boolean | null; options: { mode: Mode; min: number | null; note: string }[];
  basis: string | null; estimated: boolean; tr: Travel;
}
/** Pick a travel mode: a walk of at most 20 min, otherwise the fastest allowed mode. */
export function travelFor(item: Item, city: City | null | undefined, origin?: Origin | null): TravelChoice | null {
  const src = travelSource(item, origin);
  const tr = src.tr, allowed = city?.transport ?? { car: true, transit: true };
  const opts: { mode: Mode; min: number | null; note: string }[] = [];
  if (tr.walk && tr.walk.min != null) opts.push({ mode: "walk", min: tr.walk.min, note: tr.walk.note ?? "" });
  if (tr.transit && allowed.transit !== false) opts.push({ mode: "transit", min: tr.transit.min ?? null, note: tr.transit.note ?? "" });
  if (tr.car && allowed.car !== false) opts.push({ mode: "car", min: tr.car.min ?? null, note: tr.car.note ?? "" });
  const first = opts[0];
  if (!first) return null;
  const walk = opts.find((o) => o.mode === "walk" && o.min != null && o.min <= 20);
  const pick = walk ?? opts.filter((o) => o.mode !== "walk" || (o.min ?? 999) <= 35).sort((a, b) => (a.min ?? 999) - (b.min ?? 999))[0] ?? first;
  const limit = city?.maxTravelMin ?? 60;
  return { ...pick, withinLimit: pick.min == null ? null : pick.min <= limit, options: opts, basis: src.basis, estimated: src.estimated, tr };
}

export function familyCost(item: Item, profile: Profile, city: City, date: string, origin?: Origin | null) {
  const e = entryCost(item, profile, date), tf = travelFor(item, city, origin);
  const t = tf ? travelCost(item, profile, city, tf.mode, date, tf.tr) : { total: null, unknown: ["resväg"] };
  const total = e.total != null && t.total != null ? e.total + t.total : null;
  return { entry: e.total, entryKnown: e.known, travel: t.total, total, mode: tf ? tf.mode : null, unknown: [...e.unknown, ...t.unknown] };
}

// ---------- Scoring ----------

export function ratingKey(city: string, item: Pick<Item, "id" | "title">): string { return slug(city) + "--" + slug(item.id || item.title); }

export function scoreItem(item: Item, ctx: ScoreContext): number {
  const { profile, city, cityId, date, ratings } = ctx;
  const fit = ageFitFor(item, profile.children, date);
  let s = [-6, 1, 2, 3][LEVELS.indexOf(fit.level)] ?? 0;
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  for (const i of profile.interests ?? []) if (tags.includes(String(i).toLowerCase())) s += 1;
  for (const a of profile.avoid ?? []) if (tags.includes(String(a).toLowerCase())) s -= 2;
  const r = ratings?.[ratingKey(cityId, item)];
  if (r) { if (r.verdict === "bra") s += 2; if (r.verdict === "nej") s -= 4; if (r.verdict === "besokt") s += (r.stars ?? 3) >= 4 ? 1 : -1; }
  for (const tag of tags) { const w = ctx.tagWeights?.[tag]; if (w) s += Math.max(-2, Math.min(2, w * 0.5)); }
  const c = familyCost(item, profile, city, date, ctx.origin);
  if (profile.budgetMax != null && c.total != null && c.total > profile.budgetMax) s -= 2;
  const tf = travelFor(item, city, ctx.origin);
  if (tf && tf.withinLimit === false) s -= 2;
  if (item.conflict) s -= 0.5;
  return s;
}

/** Learn tag weights from ratings: liked +1, disliked −1, visited by stars. */
export function tagWeightsFrom(ratingsList: Rating[]): Record<string, number> {
  const w: Record<string, number> = {};
  for (const r of ratingsList) {
    const d = r.verdict === "bra" ? 1 : r.verdict === "nej" ? -1 : r.verdict === "besokt" ? ((r.stars ?? 3) - 3) / 2 : 0;
    for (const t of r.tags ?? []) { const k = String(t).toLowerCase(); w[k] = (w[k] ?? 0) + d; }
  }
  return w;
}

// ---------- Day plan ----------

export type BlockKind = "aktivitet" | "vila" | "mat" | "resa" | "info";
export interface Block { start: number; end: number; kind: BlockKind; title: string; note: string; itemId?: string; time: string; endTime: string }
export type PlanItem = Item & { _travelMin?: number; _travelNote?: string };

/** Deterministic day plan around nap windows and opening hours. */
export interface PlanOpts {
  dayStart?: string; dayEnd?: string; lunch?: string;
  /** Restid från föregående aktivitet till nästa. Utan den (eller vid null) används aktivitetens restid hemifrån. */
  travelBetween?: (from: PlanItem, to: PlanItem) => { min: number; note?: string } | null;
  /** Lägg till resan hem efter dagens sista aktivitet. */
  homeTrip?: boolean;
}
export function autoPlan(items: PlanItem[], profile: Profile, date: string, opts?: PlanOpts): Block[] {
  const o = { dayStart: "09:00", dayEnd: "17:30", lunch: "11:45", ...opts };
  const dayStart = toMin(o.dayStart) ?? 540, end = toMin(o.dayEnd) ?? 1050, lunchAt = toMin(o.lunch) ?? 705;
  const naps = (profile.naps ?? [])
    .map((n) => ({ from: toMin(n.from), to: toMin(n.to), used: false }))
    .filter((n): n is { from: number; to: number; used: boolean } => n.from != null && n.to != null)
    .sort((a, b) => a.from - b.from);
  type Raw = Omit<Block, "time" | "endTime">;
  const blocks: Raw[] = [];
  let cur = dayStart, lunchDone = false;
  const takeNap = (n: { from: number; to: number; used: boolean }) => {
    // En tupplur som redan har passerat ger inget block, och tiden går aldrig bakåt.
    if (n.to > cur) { blocks.push({ start: Math.max(cur, n.from), end: n.to, kind: "vila", title: "Tupplur", note: "Vagnpromenad eller vila" }); cur = n.to; }
    n.used = true;
  };
  const queue = items
    .map((it) => { const d = dayEntry(it, date); const open = toMin(d?.from); return { it, open: open ?? cur, close: toMin(d?.to) ?? end, dur: it.durationMin ?? 90, trav: it._travelMin ?? 0, fixed: it.kind === "event" && open != null }; })
    .sort((a, b) => a.open - b.open);
  let prev: PlanItem | null = null;
  for (const q of queue) {
    // Efter dagens första aktivitet räknas resan från den förra aktiviteten, inte hemifrån.
    const hop = prev && o.travelBetween ? o.travelBetween(prev, q.it) : null;
    const trav = hop ? hop.min : q.trav, travNote = hop ? hop.note ?? "" : q.it._travelNote ?? "";
    const leave = q.open - trav;
    const napNotes: string[] = [];
    const napNote = (t: string) => { if (!napNotes.includes(t)) napNotes.push(t); };
    for (const n of naps) {
      if (n.used || n.from > Math.max(cur, leave)) continue;
      // Ett evenemang börjar på en fast tid: tuppluren kortas till avresan i stället för att skjuta upp evenemanget.
      // Resten av tuppluren hanteras med evenemanget nedan, så att det som blir över efter evenemanget inte försvinner.
      if (q.fixed && n.to > leave) {
        const from = Math.max(cur, n.from);
        if (leave - from >= 15) blocks.push({ start: from, end: leave, kind: "vila", title: "Tupplur", note: `Kortare: ${q.it.title} börjar ${fmtMin(q.open)}. Låt barnet sova vidare i vagnen.` });
        else napNote("Tuppluren krockar med avresan, låt barnet sova i vagnen");
        cur = Math.max(cur, leave); n.from = Math.max(n.from, leave);
      } else takeNap(n);
    }
    if (!lunchDone && cur >= lunchAt - 15) {
      // Före ett evenemang med fast tid äts lunch bara om den hinns före avresan. Annars blir det lunch efteråt.
      const room = q.fixed ? leave - cur : Number.POSITIVE_INFINITY;
      const n = naps.find((x) => !x.used && x.from < cur + 45 && x.to > cur && x.to - cur <= room);
      if (n) { blocks.push({ start: Math.max(cur, n.from), end: n.to, kind: "vila", title: "Tupplur + lunch", note: "Ät medan barnet sover i vagnen" }); cur = n.to; n.used = true; lunchDone = true; }
      else if (room >= 45) { blocks.push({ start: cur, end: cur + 45, kind: "mat", title: "Lunch", note: "" }); cur += 45; lunchDone = true; }
    }
    let start = Math.max(cur + trav, q.open);
    let fin = start + q.dur;
    const clash = naps.find((n) => !n.used && start < n.to && fin > n.from);
    if (clash && q.fixed) {
      // Evenemanget kortas eller flyttas inte för tupplurar som infaller under det. Det som blir över efteråt finns kvar.
      for (const n of naps) {
        if (n.used || !(start < n.to && fin > n.from)) continue;
        if (n.to > fin) n.from = fin; else n.used = true;
        napNote("Tupplur under evenemanget, i vagnen eller i famnen");
      }
    } else if (clash) {
      if (clash.from - start >= 45) fin = clash.from;
      else { cur = Math.max(cur, clash.from); takeNap(clash); start = Math.max(cur + trav, q.open); fin = start + q.dur; }
    }
    if (fin > q.close) fin = q.close;
    if (start >= fin || fin > end) { blocks.push({ start: cur, end: cur, kind: "info", title: q.it.title, note: "Får inte plats i dagen" }); continue; }
    if (trav > 0) blocks.push({ start: start - trav, end: start, kind: "resa", title: "Resa", note: travNote });
    blocks.push({ start, end: fin, kind: "aktivitet", title: q.it.title, itemId: q.it.id, note: [q.it.venue, ...napNotes].filter(Boolean).join(". ") });
    cur = fin; prev = q.it;
  }
  const home = prev?._travelMin ?? 0;
  if (o.homeTrip && prev && home > 0) {
    blocks.push({ start: cur, end: cur + home, kind: "resa", title: "Resa hem", note: prev._travelNote ?? "" });
    cur += home;
  }
  for (const n of naps) if (!n.used && n.from >= cur && n.to <= end) takeNap(n);
  if (!lunchDone && lunchAt >= dayStart) {
    // Upptaget vid lunchtid: lunch direkt efter det som pågår, så att dagen alltid har en måltid.
    let at = lunchAt;
    for (let moved = true; moved;) { moved = false; for (const b of blocks) if (b.kind !== "info" && at < b.end && at + 45 > b.start) { at = b.end; moved = true; } }
    if (at + 45 <= end) blocks.push({ start: at, end: at + 45, kind: "mat", title: "Lunch", note: at > lunchAt + 60 ? "Sen lunch, ta med mellanmål" : "" });
  }
  return blocks.sort((a, b) => a.start - b.start || a.end - b.end).map((b) => ({ ...b, time: fmtMin(b.start), endTime: fmtMin(b.end) }));
}

// ---------- Periods and schedules ----------

export function nextThursdayRun(now: Date): Date {
  const add = (4 - now.getDay() + 7) % 7;
  const run = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add, 18, 48);
  if (run <= now) run.setDate(run.getDate() + 7);
  return run;
}
/** Saturday–Sunday pairs, starting with the current weekend if today is Saturday or Sunday. */
export function upcomingWeekends(now: Date, count: number): [string, string][] {
  const out: [string, string][] = [];
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = d.getDay() === 0 ? -1 : (6 - d.getDay() + 7) % 7;
  const sat = new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);
  for (let i = 0; i < count; i++) {
    const s = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 7 * i);
    const su = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
    out.push([isoDate(s), isoDate(su)]);
  }
  return out;
}
/** Days the family is free: weekends unless switched off; weekdays only on parental leave (until leaveUntil). */
export function activeDays(dates: string[], profile: Profile | null | undefined): string[] {
  const a = profile?.availability ?? { weekdays: false, weekends: true };
  const until = profile?.leaveUntil;
  return dates.filter((d) => (isWeekend(d) ? a.weekends !== false : !!a.weekdays && (!until || d <= until)));
}
export type PeriodKind = "helg" | "vecka" | "manad";
/** helg: next weekends; vecka: rest of this week, then Mon–Sun weeks; manad: rest of this month, then whole months. */
export function periodOptions(now: Date, kind: PeriodKind | string): { from: string; to: string }[] {
  const today = isoDate(now), out: { from: string; to: string }[] = [];
  if (kind === "helg") return upcomingWeekends(now, 6).map(([a, b]) => ({ from: a, to: b }));
  if (kind === "vecka") {
    const monday = addDays(today, -((now.getDay() + 6) % 7));
    out.push({ from: today, to: addDays(monday, 6) });
    for (let i = 1; i <= 4; i++) out.push({ from: addDays(monday, 7 * i), to: addDays(monday, 7 * i + 6) });
    return out;
  }
  if (kind === "manad") {
    for (let i = 0; i < 3; i++) {
      const first = new Date(now.getFullYear(), now.getMonth() + i, 1), last = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      out.push({ from: i === 0 ? today : isoDate(first), to: isoDate(last) });
    }
  }
  return out;
}
export interface ScheduleOpts {
  gap?: number;
  /** Familjens kända kostnad för förslaget den dagen. Null när den är okänd: då räknas den inte mot budgeten. */
  costFn?: (it: Item, date: string) => number | null;
  /** Högsta kända kostnad per vecka (måndag–söndag). Null: ingen gräns. */
  weekBudget?: number | null;
  weather?: Weather[];
}
export interface ScheduledDay {
  date: string; pick: Item | null; alts: Item[];
  /** Varför dagen ser ut som den gör, t.ex. "Inomhus: regn väntas". */
  why: string[];
  /** Det fanns förslag, men inget rymdes i veckans budget. */
  overBudget: boolean;
}
/** Måndagen i datumets vecka (YYYY-MM-DD). */
export function weekStart(iso: string): string { return addDays(iso, -((parseDate(iso).getDay() + 6) % 7)); }
/**
 * One main activity per free day: best score that day, not the same item within `gap` days, never one that does not fit the age.
 * Regn väntas: inomhus går före utomhus. Ett återkommande pass hålls helst kvar på veckodagen det först fick.
 * Med `weekBudget` väljs bara det som ryms i det som är kvar av veckan; okända priser räknas inte, de gissas aldrig.
 */
export function schedulePeriod(items: Item[], days: string[], scoreFn: (it: Item, date: string) => number, opts?: ScheduleOpts): ScheduledDay[] {
  const gap = opts?.gap ?? 2, lastUsed: Record<string, number> = {}, weekdayOf: Record<string, number> = {}, spent: Record<string, number> = {};
  const budget = opts?.weekBudget ?? null;
  return days.map((d, i) => {
    const rain = isRainy(opts?.weather?.find((w) => w.date === d)), weekday = parseDate(d).getDay(), week = weekStart(d);
    const cands = items.filter((it) => dayEntry(it, d)).map((it) => {
      const base = scoreFn(it, d);
      let score = base;
      if (rain && it.indoor === false) score -= 3;
      if (rain && it.indoor === true) score += 1;
      if (weekdayOf[it.id] === weekday) score += 1.5;
      return { it, base, score };
    }).filter((c) => c.base > -3).sort((a, b) => b.score - a.score);
    const ok = cands.filter((c) => { const u = lastUsed[c.it.id]; return u == null || i - u > gap; });
    const left = budget == null ? null : budget - (spent[week] ?? 0);
    const cost = (it: Item) => opts?.costFn?.(it, d) ?? null;
    const fits = ok.filter((c) => { const k = cost(c.it); return left == null || k == null || k <= left; });
    const pick = fits[0] ?? null;
    const why: string[] = [];
    if (pick) {
      lastUsed[pick.it.id] = i;
      if (weekdayOf[pick.it.id] === weekday) why.push("Samma veckodag som förra gången");
      else if (weekdayOf[pick.it.id] == null) weekdayOf[pick.it.id] = weekday;
      spent[week] = (spent[week] ?? 0) + (cost(pick.it) ?? 0);
      if (rain && pick.it.indoor === true) why.push("Inomhus: regn väntas");
      if (rain && pick.it.indoor === false) why.push("Utomhus trots regn: inget inomhus passade den dagen");
      if (ok[0] && ok[0].it.id !== pick.it.id) why.push("Valt för att rymmas i veckobudgeten");
    }
    return { date: d, pick: pick ? pick.it : null, alts: fits.slice(1, 3).map((c) => c.it), why, overBudget: !pick && ok.length > 0 };
  });
}

// ---------- Mat ----------

/** Ett ställe att äta eller köpa mat nära en eller flera aktiviteter. */
export interface FoodSpot {
  id: string;
  title: string;
  venue?: string;
  lat?: number;
  lng?: number;
  near?: string[];
  highChair?: YesNo;
  microwave?: YesNo;
  changing?: YesNo;
  priceNote?: string;
  hoursNote?: string;
  note?: string;
  sources?: { title?: string; url: string }[];
}

/** Ett förslag på mat att ta med hemifrån. Åldersråden ska gå att spåra till Livsmedelsverket. */
export interface PackedFood {
  id: string;
  title: string;
  fromMonths: number;
  toMonths?: number | null;
  ingredients: string[];
  steps: string[];
  keeps?: string;
  note?: string;
  sources: { title?: string; url: string }[];
}

/** Matställen sorterade efter avstånd från en punkt; de som pekar ut aktiviteten (near) först vid lika avstånd. */
export function nearestFood(food: FoodSpot[], point: Partial<Coords> & { id?: string }, limit = 3): (FoodSpot & { distanceKm: number | null })[] {
  return food
    .map((f) => ({ ...f, distanceKm: hasCoords(f) && hasCoords(point) ? Math.round(haversineKm(point, f) * 10) / 10 : null }))
    .filter((f) => f.distanceKm != null || (point.id != null && (f.near ?? []).includes(point.id)))
    .sort((a, b) => {
      const da = a.distanceKm ?? 999, db = b.distanceKm ?? 999;
      if (da !== db) return da - db;
      const na = point.id && (a.near ?? []).includes(point.id) ? 0 : 1, nb = point.id && (b.near ?? []).includes(point.id) ? 0 : 1;
      return na - nb;
    })
    .slice(0, limit);
}

/** Matlådeförslag som passar barnets ålder i månader. */
export function packedFor(packed: PackedFood[], months: number): PackedFood[] {
  return packed.filter((p) => months >= p.fromMonths && (p.toMonths == null || months <= p.toMonths));
}

/** Samlad packlista: unika ingredienser från valda förslag, i ursprunglig ordning. */
export function packingList(chosen: PackedFood[]): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const p of chosen) for (const i of p.ingredients) { const k = i.trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(i.trim()); } }
  return out;
}

/** Ungefärlig radie i km för en restid i minuter (bil i stadstrafik, 35 km/h, fågelvägen = väg / 1,3). */
export function radiusKmForMinutes(minutes: number): number {
  return Math.max(1, Math.round(((minutes / 60) * 35) / 1.3));
}
