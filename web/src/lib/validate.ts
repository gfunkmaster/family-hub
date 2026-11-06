/**
 * Validering av det den schemalagda körningen skickar in. Ren logik utan beroenden,
 * så att en felaktig körning aldrig kan skriva skräp i databasen.
 */
import { LEVELS, safeUrl, type City, type Item, type Profile } from "@family-hub/logic";

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{1,2}:\d{2}$/;
const ID = /^[A-Za-z0-9_.~:@+-]{1,120}$/;
const KINDS = ["helg", "vecka", "manad", "egna"] as const;
const YES_NO = ["ja", "nej", "oklart"] as const;
const VERDICTS = ["bra", "nej", "besokt"] as const;
const REQUEST_STATUS = ["ny", "klar"] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optNum = (v: unknown) => v === undefined || v === null || isNum(v);
const isIsoDate = (v: unknown): v is string => isStr(v) && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => isStr(v) && (list as readonly string[]).includes(v);

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
  if (it.sources !== undefined) {
    if (!Array.isArray(it.sources)) errors.push(`${at}.sources måste vara en lista`);
    else it.sources.forEach((s, j) => { if (!isObj(s) || !safeUrl(s.url)) errors.push(`${at}.sources[${j}].url måste vara en http(s)-adress`); });
  }
  if (it.tags !== undefined && !(Array.isArray(it.tags) && it.tags.every(isStr))) errors.push(`${at}.tags måste vara en lista med text`);
}

export interface RunInput {
  city: string; from: string; to: string; kind: string; dates: string[];
  origin: { name?: string; lat: number; lng: number } | null;
  summary: string; createdAt: string;
  weather: { date: string; high?: number | null; low?: number | null; precip?: number | null; precipMm?: number | null }[];
  items: Item[];
}

export function parseRun(body: unknown): Result<RunInput> {
  const errors: string[] = [];
  if (!isObj(body)) return { ok: false, errors: ["Kroppen är inget objekt"] };
  if (!isStr(body.city) || !ID.test(body.city)) errors.push("city saknas");
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
  }
  if (errors.length) return { ok: false, errors };
  const b = body as Obj;
  return {
    ok: true,
    value: {
      city: b.city as string, from: b.from as string, to: b.to as string, kind: b.kind as string,
      dates: b.dates as string[],
      origin: (b.origin as RunInput["origin"]) ?? null,
      summary: (b.summary as string | undefined) ?? "",
      createdAt: (b.createdAt as string | undefined) ?? new Date().toISOString(),
      weather: (b.weather as RunInput["weather"] | undefined) ?? [],
      items: b.items as Item[],
    },
  };
}

export function parseRequestPatch(body: unknown): Result<{ status: "ny" | "klar"; runId: string | null }> {
  if (!isObj(body)) return { ok: false, errors: ["Kroppen är inget objekt"] };
  const errors: string[] = [];
  if (!oneOf(REQUEST_STATUS, body.status)) errors.push("status måste vara ny eller klar");
  if (body.runId !== undefined && body.runId !== null && !(isStr(body.runId) && ID.test(body.runId))) errors.push("runId har otillåtna tecken");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { status: body.status as "ny" | "klar", runId: (body.runId as string | null | undefined) ?? null } };
}

export function parseProfile(body: unknown): Result<Profile> {
  if (!isObj(body)) return { ok: false, errors: ["profile är inget objekt"] };
  const errors: string[] = [];
  if (body.children !== undefined && !(Array.isArray(body.children) && body.children.every((c) => isObj(c) && isIsoDate(c.birthdate)))) errors.push("children[].birthdate måste vara YYYY-MM-DD");
  if (body.naps !== undefined && !(Array.isArray(body.naps) && body.naps.every((n) => isObj(n) && isStr(n.from) && HHMM.test(n.from) && isStr(n.to) && HHMM.test(n.to)))) errors.push("naps[] måste ha from och to som HH:MM");
  if (!optNum(body.adults) || !optNum(body.budgetMax)) errors.push("adults och budgetMax måste vara tal");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body as Profile };
}

export function parseCity(id: string, body: unknown): Result<City & { name: string }> {
  if (!isObj(body)) return { ok: false, errors: [`cities.${id} är inget objekt`] };
  const errors: string[] = [];
  if (!ID.test(id)) errors.push(`cities.${id}: id har otillåtna tecken`);
  if (!isStr(body.name) || !body.name.trim()) errors.push(`cities.${id}.name saknas`);
  if (body.sources !== undefined && !(Array.isArray(body.sources) && body.sources.every((s) => isObj(s) && isStr(s.name) && safeUrl(s.url)))) errors.push(`cities.${id}.sources[] måste ha name och en http(s)-adress`);
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: body as unknown as City & { name: string } };
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

export interface RequestInput { id: string | null; city: string; from: string; to: string; kind: string; origin: Obj | null; note: string; status: "ny" | "klar"; runId: string | null; createdAt: string }

export function parseRequest(body: unknown): Result<RequestInput> {
  if (!isObj(body)) return { ok: false, errors: ["request är inget objekt"] };
  const errors: string[] = [];
  if (!isStr(body.city)) errors.push("request.city saknas");
  if (!isIsoDate(body.from) || !isIsoDate(body.to)) errors.push("request.from och to måste vara YYYY-MM-DD");
  if (body.kind !== undefined && !oneOf(KINDS, body.kind)) errors.push(`request.kind måste vara ${KINDS.join(", ")}`);
  if (body.status !== undefined && !oneOf(REQUEST_STATUS, body.status)) errors.push("request.status måste vara ny eller klar");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: isStr(body.id) && ID.test(body.id) ? body.id : null,
      city: body.city as string, from: body.from as string, to: body.to as string,
      kind: (body.kind as string | undefined) ?? "egna",
      origin: isObj(body.origin) ? body.origin : null,
      note: isStr(body.note) ? body.note : "",
      status: (body.status as "ny" | "klar" | undefined) ?? "ny",
      runId: isStr(body.runId) ? body.runId : null,
      createdAt: isStr(body.createdAt) && !Number.isNaN(Date.parse(body.createdAt)) ? body.createdAt : new Date().toISOString(),
    },
  };
}
