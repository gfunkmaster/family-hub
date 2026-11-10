/**
 * Validering av det den schemalagda körningen skickar in. Ren logik utan beroenden,
 * så att en felaktig körning aldrig kan skriva skräp i databasen.
 */
import { BOOKING_OPENS, LEVELS, safeUrl, type City, type FoodSpot, type Item, type PackedFood, type Profile } from "@family-hub/logic";

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{1,2}:\d{2}$/;
const ID = /^[A-Za-z0-9_.~:@+-]{1,120}$/;
const KINDS = ["helg", "vecka", "manad", "egna"] as const;
const YES_NO = ["ja", "nej", "oklart"] as const;
const VERDICTS = ["bra", "nej", "besokt"] as const;
const REQUEST_STATUS = ["ny", "pågår", "klar", "fel"] as const;
export type RequestStatus = (typeof REQUEST_STATUS)[number];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || v === null || isNum(v);
// Date.parse godtar "2026-02-30" (blir 2 mars), så datumet måste överleva en tur och retur.
const isIsoDate = (v: unknown): v is string => {
  if (!isStr(v) || !ISO_DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => isStr(v) && (list as readonly string[]).includes(v);

const validTime = (v: unknown): v is string => isStr(v) && HHMM.test(v) && Number(v.split(":")[0]) < 24 && Number(v.split(":")[1]) < 60;

export function isValidId(id: string): boolean { return ID.test(id); }

function checkItem(it: unknown, i: number, errors: string[]): void {
  const at = `items[${i}]`;
  if (!isObj(it)) { errors.push(`${at} är inget objekt`); return; }
  if (!isStr(it.id) || !ID.test(it.id)) errors.push(`${at}.id saknas eller har otillåtna tecken`);
  if (!isStr(it.title) || !it.title.trim()) errors.push(`${at}.title saknas`);
  if (it.kind !== undefined && it.kind !== "event" && it.kind !== "place") errors.push(`${at}.kind måste vara event eller place`);
  if (!optNum(it.lat) || !optNum(it.lng)) errors.push(`${at}.lat/lng måste vara tal`);
  if (isNum(it.lat) && (it.lat < -90 || it.lat > 90)) errors.push(`${at}.lat utanför -90..90`);
  if (isNum(it.lng) && (it.lng < -180 || it.lng > 180)) errors.push(`${at}.lng utanför -180..180`);
  if (!Array.isArray(it.dates)) errors.push(`${at}.dates måste vara en lista`);
  else it.dates.forEach((d, j) => {
    if (!isObj(d) || !isIsoDate(d.date)) { errors.push(`${at}.dates[${j}].date måste vara YYYY-MM-DD`); return; }
    if (d.from !== undefined && !(isStr(d.from) && HHMM.test(d.from))) errors.push(`${at}.dates[${j}].from måste vara HH:MM`);
    if (d.to !== undefined && !(isStr(d.to) && HHMM.test(d.to))) errors.push(`${at}.dates[${j}].to måste vara HH:MM`);
    if (!optNum(d.adult)) errors.push(`${at}.dates[${j}].adult måste vara tal eller null`);
  });
  if (it.prices !== undefined) {
    if (!isObj(it.prices)) errors.push(`${at}.prices är inget objekt`);
    else for (const k of ["adult", "child", "childFreeUnder"]) if (!optNum(it.prices[k])) errors.push(`${at}.prices.${k} måste vara tal eller null`);
  }
  if (it.ageFit !== undefined) {
    if (!isObj(it.ageFit)) errors.push(`${at}.ageFit är inget objekt`);
    else {
      if (it.ageFit.level !== undefined && !oneOf(LEVELS, it.ageFit.level)) errors.push(`${at}.ageFit.level måste vara ${LEVELS.join(", ")}`);
      if (!optNum(it.ageFit.minMonths) || !optNum(it.ageFit.maxMonths)) errors.push(`${at}.ageFit.minMonths/maxMonths måste vara tal eller null`);
    }
  }
  if (isObj(it.practical)) for (const k of ["stroller", "changing"]) {
    const v = it.practical[k];
    if (v !== undefined && !oneOf(YES_NO, v)) errors.push(`${at}.practical.${k} måste vara ja, nej eller oklart`);
  }
  if (it.booking !== undefined && it.booking !== null) {
    const b = it.booking;
    if (!isObj(b)) errors.push(`${at}.booking är inget objekt`);
    else {
      if (b.required !== undefined && b.required !== null && !oneOf(YES_NO, b.required)) errors.push(`${at}.booking.required måste vara ja, nej eller oklart`);
      if (b.opensAt !== undefined && b.opensAt !== null && !(isStr(b.opensAt) && BOOKING_OPENS.test(b.opensAt) && isIsoDate(b.opensAt.slice(0, 10)) && (b.opensAt.length === 10 || validTime(b.opensAt.slice(11))))) errors.push(`${at}.booking.opensAt måste vara YYYY-MM-DD eller YYYY-MM-DDTHH:MM`);
      if (b.url !== undefined && b.url !== null && !safeUrl(b.url)) errors.push(`${at}.booking.url måste vara en http(s)-adress`);
      // En lång anteckning kortas vid visning. Den får inte fälla en hel körning.
      if (b.note !== undefined && b.note !== null && !isStr(b.note)) errors.push(`${at}.booking.note måste vara text eller null`);
    }
  }
  if (it.sources !== undefined) {
    if (!Array.isArray(it.sources)) errors.push(`${at}.sources måste vara en lista`);
    else it.sources.forEach((s, j) => { if (!isObj(s) || !safeUrl(s.url)) errors.push(`${at}.sources[${j}].url måste vara en http(s)-adress`); });
  }
  if (it.tags !== undefined && !(Array.isArray(it.tags) && it.tags.every(isStr))) errors.push(`${at}.tags måste vara en lista med text`);
}

export interface PlaceInput { name: string; address?: string; lat?: number; lng?: number; radiusKm?: number }

function checkPlace(v: unknown, at: string, errors: string[], needCoords: boolean): void {
  if (!isObj(v)) { errors.push(`${at} är inget objekt`); return; }
  if (!isStr(v.name) || !v.name.trim()) errors.push(`${at}.name saknas`);
  if (!optNum(v.lat) || !optNum(v.lng)) errors.push(`${at}.lat/lng måste vara tal`);
  if (needCoords && !(isNum(v.lat) && isNum(v.lng))) errors.push(`${at} måste ha lat och lng`);
  if (v.radiusKm !== undefined && v.radiusKm !== null && !(isNum(v.radiusKm) && v.radiusKm > 0 && v.radiusKm <= 200)) errors.push(`${at}.radiusKm måste vara 1–200`);
}

function checkSources(v: unknown, at: string, errors: string[], required: boolean): void {
  if (v === undefined && !required) return;
  if (!Array.isArray(v) || (required && v.length === 0)) { errors.push(`${at} måste vara en lista med minst en källa`); return; }
  v.forEach((s, j) => { if (!isObj(s) || !safeUrl(s.url)) errors.push(`${at}[${j}].url måste vara en http(s)-adress`); });
}

function checkFood(f: unknown, i: number, itemIds: Set<string>, errors: string[]): void {
  const at = `food[${i}]`;
  if (!isObj(f)) { errors.push(`${at} är inget objekt`); return; }
  if (!isStr(f.id) || !ID.test(f.id)) errors.push(`${at}.id saknas eller har otillåtna tecken`);
  if (!isStr(f.title) || !f.title.trim()) errors.push(`${at}.title saknas`);
  if (!optNum(f.lat) || !optNum(f.lng)) errors.push(`${at}.lat/lng måste vara tal`);
  if (f.near !== undefined && !(Array.isArray(f.near) && f.near.every((n) => isStr(n) && itemIds.has(n)))) errors.push(`${at}.near får bara peka på förslag i körningen`);
  for (const k of ["highChair", "microwave", "changing"]) if (f[k] !== undefined && !oneOf(YES_NO, f[k])) errors.push(`${at}.${k} måste vara ja, nej eller oklart`);
  checkSources(f.sources, `${at}.sources`, errors, true);
}

/** Matlådor: åldersråden ska gå att spåra till Livsmedelsverket, så minst en källa ska ligga där. */
function checkPacked(p: unknown, i: number, errors: string[]): void {
  const at = `packed[${i}]`;
  if (!isObj(p)) { errors.push(`${at} är inget objekt`); return; }
  if (!isStr(p.id) || !ID.test(p.id)) errors.push(`${at}.id saknas eller har otillåtna tecken`);
  if (!isStr(p.title) || !p.title.trim()) errors.push(`${at}.title saknas`);
  if (!(isNum(p.fromMonths) && p.fromMonths >= 0 && p.fromMonths <= 216)) errors.push(`${at}.fromMonths måste vara 0–216`);
  if (!optNum(p.toMonths)) errors.push(`${at}.toMonths måste vara tal eller null`);
  if (!(Array.isArray(p.ingredients) && p.ingredients.length && p.ingredients.every(isStr))) errors.push(`${at}.ingredients måste vara en lista med text`);
  if (!(Array.isArray(p.steps) && p.steps.length && p.steps.every(isStr))) errors.push(`${at}.steps måste vara en lista med text`);
  checkSources(p.sources, `${at}.sources`, errors, true);
  if (Array.isArray(p.sources) && !p.sources.some((s) => isObj(s) && isStr(s.url) && /^https:\/\/(www\.)?livsmedelsverket\.se\//.test(s.url))) errors.push(`${at}.sources måste ha minst en källa på livsmedelsverket.se`);
}

export interface RunInput {
  city: string | null; place: PlaceInput | null; food: FoodSpot[]; packed: PackedFood[];
  from: string; to: string; kind: string; dates: string[];
  origin: { name?: string; lat: number; lng: number } | null;
  summary: string; createdAt: string;
  weather: { date: string; high?: number | null; low?: number | null; precip?: number | null; precipMm?: number | null }[];
  items: Item[];
}

export function parseRun(body: unknown): Result<RunInput> {
  const errors: string[] = [];
  if (!isObj(body)) return { ok: false, errors: ["Kroppen är inget objekt"] };
  const hasCity = isStr(body.city) && ID.test(body.city);
  if (body.city !== undefined && body.city !== null && !hasCity) errors.push("city har otillåtna tecken");
  if (body.place !== undefined && body.place !== null) checkPlace(body.place, "place", errors, false);
  if (!hasCity && !isObj(body.place)) errors.push("city eller place krävs");
  if (!isIsoDate(body.from) || !isIsoDate(body.to)) errors.push("from och to måste vara YYYY-MM-DD");
  else if (body.to < body.from) errors.push("to är före from");
  if (!oneOf(KINDS, body.kind)) errors.push(`kind måste vara ${KINDS.join(", ")}`);
  if (!Array.isArray(body.dates) || !body.dates.every(isIsoDate)) errors.push("dates måste vara en lista med YYYY-MM-DD");
  else if (body.dates.length > 62) errors.push("dates får ha högst 62 dagar");
  if (body.origin !== undefined && body.origin !== null && !(isObj(body.origin) && isNum(body.origin.lat) && isNum(body.origin.lng))) errors.push("origin måste ha lat och lng, eller vara null");
  if (body.summary !== undefined && !isStr(body.summary)) errors.push("summary måste vara text");
  if (body.createdAt !== undefined && !(isStr(body.createdAt) && !Number.isNaN(Date.parse(body.createdAt)))) errors.push("createdAt måste vara en ISO-tid");
  if (body.weather !== undefined) {
    if (!Array.isArray(body.weather)) errors.push("weather måste vara en lista");
    else body.weather.forEach((w, i) => {
      if (!isObj(w) || !isIsoDate(w.date)) errors.push(`weather[${i}].date måste vara YYYY-MM-DD`);
      else for (const k of ["high", "low", "precip", "precipMm"]) if (!optNum(w[k])) errors.push(`weather[${i}].${k} måste vara tal eller null`);
    });
  }
  if (!Array.isArray(body.items)) errors.push("items måste vara en lista");
  else {
    if (body.items.length > 60) errors.push("items får ha högst 60 förslag");
    body.items.forEach((it, i) => checkItem(it, i, errors));
    const ids = body.items.filter(isObj).map((it) => it.id);
    if (new Set(ids).size !== ids.length) errors.push("items har dubbla id");
    const itemIds = new Set(ids.filter(isStr));
    if (body.food !== undefined) {
      if (!Array.isArray(body.food)) errors.push("food måste vara en lista");
      else { if (body.food.length > 60) errors.push("food får ha högst 60 ställen"); body.food.forEach((f, i) => checkFood(f, i, itemIds, errors)); }
    }
  }
  if (body.packed !== undefined) {
    if (!Array.isArray(body.packed)) errors.push("packed måste vara en lista");
    else { if (body.packed.length > 20) errors.push("packed får ha högst 20 förslag"); body.packed.forEach((p, i) => checkPacked(p, i, errors)); }
  }
  if (errors.length) return { ok: false, errors };
  const b = body as Obj;
  return {
    ok: true,
    value: {
      city: hasCity ? (b.city as string) : null,
      place: isObj(b.place) ? (b.place as unknown as PlaceInput) : null,
      food: (b.food as FoodSpot[] | undefined) ?? [],
      packed: (b.packed as PackedFood[] | undefined) ?? [],
      from: b.from as string, to: b.to as string, kind: b.kind as string,
      dates: b.dates as string[],
      origin: (b.origin as RunInput["origin"]) ?? null,
      summary: (b.summary as string | undefined) ?? "",
      createdAt: (b.createdAt as string | undefined) ?? new Date().toISOString(),
      weather: (b.weather as RunInput["weather"] | undefined) ?? [],
      items: b.items as Item[],
    },
  };
}

export function parseRequestPatch(body: unknown): Result<{ status: RequestStatus; runId: string | null }> {
  if (!isObj(body)) return { ok: false, errors: ["Kroppen är inget objekt"] };
  const errors: string[] = [];
  if (!oneOf(REQUEST_STATUS, body.status)) errors.push(`status måste vara ${REQUEST_STATUS.join(", ")}`);
  if (body.runId !== undefined && body.runId !== null && !(isStr(body.runId) && ID.test(body.runId))) errors.push("runId har otillåtna tecken");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { status: body.status as RequestStatus, runId: (body.runId as string | null | undefined) ?? null } };
}

const AUTO_RUN = ["helg", "vecka", "ingen"] as const;
const minutesOf = (t: string) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
const optBool = (v: unknown) => v === undefined || typeof v === "boolean";

function tagList(v: unknown, at: string, errors: string[]): string[] {
  if (v === undefined) return [];
  if (!(Array.isArray(v) && v.every(isStr))) { errors.push(`${at} måste vara en lista med text`); return []; }
  const out: string[] = [];
  for (const t of v) { const x = t.trim().toLowerCase().slice(0, 40); if (x && !out.includes(x)) out.push(x); }
  if (out.length > 30) errors.push(`${at} får ha högst 30 ord`);
  return out;
}

/**
 * Familjens profil, från Familj-sidan eller importen. Allt kontrolleras och okända fält tas bort,
 * eftersom profilen styr både rangordningen och agentens instruktioner.
 */
export function parseProfile(body: unknown): Result<Profile> {
  if (!isObj(body)) return { ok: false, errors: ["profile är inget objekt"] };
  const errors: string[] = [];
  const b = body;
  if (b.adults !== undefined && !(isNum(b.adults) && Number.isInteger(b.adults) && b.adults >= 1 && b.adults <= 6)) errors.push("adults måste vara 1–6");
  if (!optNum(b.budgetMax) || (isNum(b.budgetMax) && (b.budgetMax < 0 || b.budgetMax > 100000))) errors.push("budgetMax måste vara 0–100 000 kr eller tomt");

  const children: NonNullable<Profile["children"]> = [];
  if (b.children !== undefined) {
    if (!Array.isArray(b.children) || b.children.length > 8) errors.push("children måste vara en lista med högst 8 barn");
    else b.children.forEach((c, i) => {
      if (!isObj(c) || !isIsoDate(c.birthdate)) { errors.push(`children[${i}].birthdate måste vara YYYY-MM-DD`); return; }
      if (c.name !== undefined && !isStr(c.name)) errors.push(`children[${i}].name måste vara text`);
      if (c.id !== undefined && !(isStr(c.id) && ID.test(c.id))) errors.push(`children[${i}].id har otillåtna tecken`);
      if (!optBool(c.approx)) errors.push(`children[${i}].approx måste vara sant eller falskt`);
      children.push({
        ...(isStr(c.id) ? { id: c.id } : {}),
        ...(isStr(c.name) && c.name.trim() ? { name: c.name.trim().slice(0, 40) } : {}),
        birthdate: c.birthdate, ...(c.approx === true ? { approx: true } : {}),
      });
    });
  }

  const naps: NonNullable<Profile["naps"]> = [];
  if (b.naps !== undefined) {
    if (!Array.isArray(b.naps) || b.naps.length > 4) errors.push("naps måste vara en lista med högst 4 sovtider");
    else b.naps.forEach((n, i) => {
      if (!isObj(n) || !validTime(n.from) || !validTime(n.to)) { errors.push(`naps[${i}] måste ha from och to som HH:MM`); return; }
      if (minutesOf(n.to) <= minutesOf(n.from)) { errors.push(`naps[${i}]: to måste vara efter from`); return; }
      naps.push({ from: n.from, to: n.to });
    });
    naps.sort((x, y) => minutesOf(x.from) - minutesOf(y.from));
  }

  const places: NonNullable<Profile["places"]> = [];
  if (b.places !== undefined) {
    if (!Array.isArray(b.places) || b.places.length > 20) errors.push("places måste vara en lista med högst 20 platser");
    else b.places.forEach((p, i) => {
      const at = `places[${i}]`;
      if (!isObj(p) || !isStr(p.id) || !ID.test(p.id)) { errors.push(`${at}.id saknas eller har otillåtna tecken`); return; }
      const name = isStr(p.name) ? p.name.trim().slice(0, 60) : "", address = isStr(p.address) ? p.address.trim().slice(0, 120) : "";
      if (!name && !address) errors.push(`${at} behöver ett namn eller en adress`);
      if (p.city !== undefined && p.city !== "" && !(isStr(p.city) && ID.test(p.city))) errors.push(`${at}.city har otillåtna tecken`);
      const hasLat = p.lat !== undefined && p.lat !== null, hasLng = p.lng !== undefined && p.lng !== null;
      if (hasLat !== hasLng) errors.push(`${at} måste ha både lat och lng, eller ingen`);
      else if (hasLat && !(isNum(p.lat) && isNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)) errors.push(`${at}.lat/lng är inga giltiga koordinater`);
      places.push({
        id: p.id, ...(name ? { name } : {}), ...(address ? { address } : {}),
        ...(isStr(p.city) && p.city ? { city: p.city } : {}),
        ...(hasLat && isNum(p.lat) && isNum(p.lng) ? { lat: p.lat, lng: p.lng } : {}),
        ...(isStr(p.geoNote) && p.geoNote ? { geoNote: p.geoNote.slice(0, 120) } : {}),
      });
    });
    if (new Set(places.map((p) => p.id)).size !== places.length) errors.push("places har dubbla id");
  }

  if (b.needs !== undefined && !(isObj(b.needs) && optBool(b.needs.stroller) && optBool(b.needs.changing))) errors.push("needs måste vara {stroller, changing} som sant eller falskt");
  if (b.availability !== undefined && !(isObj(b.availability) && optBool(b.availability.weekdays) && optBool(b.availability.weekends))) errors.push("availability måste vara {weekdays, weekends} som sant eller falskt");
  if (b.homeCity !== undefined && b.homeCity !== "" && !(isStr(b.homeCity) && ID.test(b.homeCity))) errors.push("homeCity har otillåtna tecken");
  if (b.leaveUntil !== undefined && b.leaveUntil !== null && b.leaveUntil !== "" && !isIsoDate(b.leaveUntil)) errors.push("leaveUntil måste vara YYYY-MM-DD eller tomt");
  if (b.autoRun !== undefined && !oneOf(AUTO_RUN, b.autoRun)) errors.push(`autoRun måste vara ${AUTO_RUN.join(", ")}`);
  const interests = tagList(b.interests, "interests", errors), avoid = tagList(b.avoid, "avoid", errors);
  if (errors.length) return { ok: false, errors };

  const needs = isObj(b.needs) ? b.needs : {}, avail = isObj(b.availability) ? b.availability : {};
  return {
    ok: true,
    value: {
      adults: isNum(b.adults) ? b.adults : 2,
      budgetMax: isNum(b.budgetMax) ? b.budgetMax : null,
      children, naps, places, interests, avoid,
      needs: { stroller: needs.stroller === true, changing: needs.changing === true },
      availability: { weekdays: avail.weekdays === true, weekends: avail.weekends !== false },
      leaveUntil: isIsoDate(b.leaveUntil) ? b.leaveUntil : null,
      autoRun: oneOf(AUTO_RUN, b.autoRun) ? b.autoRun : "helg",
      ...(isStr(b.homeCity) && b.homeCity ? { homeCity: b.homeCity } : {}),
    },
  };
}

/**
 * En stad, från Städer-sidan eller importen. Okända fält tas bort och tal måste vara rimliga,
 * eftersom stadens värden styr restid, kostnad och vad direktsökningen får som startlista.
 */
export function parseCity(id: string, body: unknown): Result<City & { name: string }> {
  if (!isObj(body)) return { ok: false, errors: [`cities.${id} är inget objekt`] };
  const errors: string[] = [];
  const at = `cities.${id}`;
  if (!ID.test(id)) errors.push(`${at}: id har otillåtna tecken`);
  if (!isStr(body.name) || !body.name.trim()) errors.push(`${at}.name saknas`);
  const range = (v: unknown, lo: number, hi: number, label: string) => {
    if (v === undefined || v === null || v === "") return null;
    if (!(isNum(v) && v >= lo && v <= hi)) { errors.push(`${at}.${label} måste vara ${lo}–${hi} eller tomt`); return null; }
    return v;
  };
  const maxTravelMin = range(body.maxTravelMin, 5, 300, "maxTravelMin");
  const carCostPerKm = range(body.carCostPerKm, 0, 20, "carCostPerKm");
  const childFree = range(body.childFreeTransitUnder, 0, 18, "childFreeTransitUnder");

  const sources: { name: string; url: string; kind?: string }[] = [];
  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources) || body.sources.length > 60) errors.push(`${at}.sources måste vara en lista med högst 60 källor`);
    else body.sources.forEach((src, j) => {
      const url = isObj(src) ? safeUrl(src.url) : null;
      if (!isObj(src) || !isStr(src.name) || !src.name.trim() || !url) { errors.push(`${at}.sources[${j}] måste ha name och en http(s)-adress`); return; }
      sources.push({ name: src.name.trim().slice(0, 80), url, ...(isStr(src.kind) && src.kind.trim() ? { kind: src.kind.trim().slice(0, 30) } : {}) });
    });
  }

  const tt = isObj(body.transitTicket) ? body.transitTicket : undefined;
  if (body.transitTicket !== undefined && body.transitTicket !== null && !tt) errors.push(`${at}.transitTicket måste vara {adult, child, note}`);
  const adult = tt ? range(tt.adult, 0, 2000, "transitTicket.adult") : null, child = tt ? range(tt.child, 0, 2000, "transitTicket.child") : null;
  if (body.transport !== undefined && !(isObj(body.transport) && optBool(body.transport.car) && optBool(body.transport.transit))) errors.push(`${at}.transport måste vara {car, transit} som sant eller falskt`);
  if (body.defaultPlaceId !== undefined && body.defaultPlaceId !== null && body.defaultPlaceId !== "" && !(isStr(body.defaultPlaceId) && ID.test(body.defaultPlaceId))) errors.push(`${at}.defaultPlaceId har otillåtna tecken`);
  if (errors.length) return { ok: false, errors };

  const tr = isObj(body.transport) ? body.transport : {};
  return {
    ok: true,
    value: {
      name: (body.name as string).trim().slice(0, 60),
      ...(isStr(body.origin) && body.origin.trim() ? { origin: body.origin.trim().slice(0, 120) } : {}),
      defaultPlaceId: isStr(body.defaultPlaceId) && body.defaultPlaceId ? body.defaultPlaceId : null,
      transport: { car: tr.car !== false, transit: tr.transit !== false },
      maxTravelMin, carCostPerKm,
      transitTicket: { adult, child, ...(tt && isStr(tt.note) && tt.note.trim() ? { note: tt.note.trim().slice(0, 200) } : {}) },
      childFreeTransitUnder: childFree,
      sources,
    },
  };
}

export interface RatingInput { key: string; city: string; itemId: string; title: string; tags: string[]; verdict: "bra" | "nej" | "besokt"; stars: number | null; runId: string | null; ratedAt: string }

export function parseRating(body: unknown): Result<RatingInput> {
  if (!isObj(body)) return { ok: false, errors: ["rating är inget objekt"] };
  const errors: string[] = [];
  if (!isStr(body.key) || !ID.test(body.key)) errors.push("rating.key saknas");
  if (!isStr(body.city) || !isStr(body.itemId) || !isStr(body.title)) errors.push("rating.city, itemId och title krävs");
  if (!oneOf(VERDICTS, body.verdict)) errors.push("rating.verdict måste vara bra, nej eller besokt");
  if (body.stars !== undefined && body.stars !== null && !(isNum(body.stars) && body.stars >= 1 && body.stars <= 5)) errors.push("rating.stars måste vara 1–5");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      key: body.key as string, city: body.city as string, itemId: body.itemId as string, title: body.title as string,
      tags: Array.isArray(body.tags) ? body.tags.filter(isStr) : [],
      verdict: body.verdict as RatingInput["verdict"], stars: (body.stars as number | null | undefined) ?? null,
      runId: isStr(body.runId) ? body.runId : null,
      ratedAt: isStr(body.ratedAt) && !Number.isNaN(Date.parse(body.ratedAt)) ? body.ratedAt : new Date().toISOString(),
    },
  };
}

export interface RequestInput { id: string | null; city: string | null; place: PlaceInput | null; radiusKm: number | null; mode: "direkt" | "kö"; from: string; to: string; kind: string; origin: Obj | null; note: string; status: RequestStatus; runId: string | null; createdAt: string }

export function parseRequest(body: unknown): Result<RequestInput> {
  if (!isObj(body)) return { ok: false, errors: ["request är inget objekt"] };
  const errors: string[] = [];
  if (!isStr(body.city) && !isObj(body.place)) errors.push("request.city eller place krävs");
  if (isObj(body.place)) checkPlace(body.place, "request.place", errors, false);
  if (body.mode !== undefined && body.mode !== "direkt" && body.mode !== "kö") errors.push("request.mode måste vara direkt eller kö");
  if (!isIsoDate(body.from) || !isIsoDate(body.to)) errors.push("request.from och to måste vara YYYY-MM-DD");
  if (body.kind !== undefined && !oneOf(KINDS, body.kind)) errors.push(`request.kind måste vara ${KINDS.join(", ")}`);
  if (body.status !== undefined && !oneOf(REQUEST_STATUS, body.status)) errors.push(`request.status måste vara ${REQUEST_STATUS.join(", ")}`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: isStr(body.id) && ID.test(body.id) ? body.id : null,
      city: isStr(body.city) ? body.city : null,
      place: isObj(body.place) ? (body.place as unknown as PlaceInput) : null,
      radiusKm: isNum(body.radiusKm) ? body.radiusKm : null,
      mode: body.mode === "direkt" ? "direkt" : "kö",
      from: body.from as string, to: body.to as string,
      kind: (body.kind as string | undefined) ?? "egna",
      origin: isObj(body.origin) ? body.origin : null,
      note: isStr(body.note) ? body.note : "",
      status: (body.status as RequestStatus | undefined) ?? "ny",
      runId: isStr(body.runId) ? body.runId : null,
      createdAt: isStr(body.createdAt) && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : new Date().toISOString(),
    },
  };
}
