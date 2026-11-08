/**
 * Gör om en körning till det som visas på sidan: rangordnade förslag med kostnad,
 * restid och åldersmatchning, räknat från vald utgångspunkt. Ren logik.
 */
import {
  activeDays, schedulePeriod, slug, ageMonths, autoPlan, nearestFood, packedFor, ageFitFor, dayEntry, familyCost, ratingKey, scoreItem, tagWeightsFrom, tierFor, travelFor,
  type Block, type City, type FoodSpot, type Item, type Level, type Mode, type Origin, type PackedFood, type Profile, type Rating, type Tier,
} from "@family-hub/logic";

export interface Weather { date: string; high?: number | null; low?: number | null; precip?: number | null; precipMm?: number | null }

export interface PlaceView { name: string; address?: string; lat?: number; lng?: number; radiusKm?: number }

export interface RunView {
  id: string;
  /** Nyckel för stad eller plats: stadens id, eller "plats-<namn>" för en sökning runt en plats. */
  city: string;
  cityId: string | null;
  label: string;
  place: PlaceView | null;
  from: string; to: string; kind: string; dates: string[];
  summary: string; createdAt: string; weather: Weather[]; items: Item[];
  food: FoodSpot[]; packed: PackedFood[];
  /** Sidor som direktsökningen hämtade. Tom för körningar utan logg (torsdagskörningen). */
  fetched: { url: string; ok: boolean; error?: string }[];
  origin: Origin | null;
}

/** Stadens inställningar, eller rimliga standardvärden för en sökning runt en plats. */
export function cityFor<T extends City & { id: string; name: string }>(run: Pick<RunView, "city" | "cityId" | "label" | "place">, cities: T[]): City & { id: string; name: string } {
  const c = run.cityId ? cities.find((x) => x.id === run.cityId) : undefined;
  if (c) return c;
  const minutes = run.place?.radiusKm ? Math.round((run.place.radiusKm * 1.3 / 35) * 60) : 45;
  return { id: run.city, name: run.label, transport: { car: true, transit: true }, maxTravelMin: Math.max(15, minutes), carCostPerKm: null };
}

export interface StoredRating extends Rating { key: string; itemId: string; title: string; city: string }

export interface Suggestion {
  item: Item;
  date: string;
  key: string;
  tier: Tier;
  fit: { level: Level; note: string };
  travel: { mode: Mode; min: number | null; estimated: boolean; basis: string | null; withinLimit: boolean | null } | null;
  cost: { entry: number | null; travel: number | null; total: number | null; unknown: string[] };
  score: number;
  verdict: Rating["verdict"] | null;
}

export interface Filters { tier: Tier | "alla"; ageOnly: boolean }

export function suggestionFor(item: Item, date: string, run: RunView, profile: Profile, city: City, origin: Origin | null, ratings: Record<string, StoredRating>, tagWeights: Record<string, number>): Suggestion {
  const key = ratingKey(run.city, item);
  const cost = familyCost(item, profile, city, date, origin);
  const tf = travelFor(item, city, origin);
  return {
    item, date, key,
    tier: tierFor(cost.entry),
    fit: ageFitFor(item, profile.children, date),
    travel: tf ? { mode: tf.mode, min: tf.min, estimated: tf.estimated, basis: tf.basis, withinLimit: tf.withinLimit } : null,
    cost: { entry: cost.entry, travel: cost.travel, total: cost.total, unknown: cost.unknown },
    score: scoreItem(item, { profile, city, cityId: run.city, date, ratings, tagWeights, origin }),
    verdict: ratings[key]?.verdict ?? null,
  };
}

function passes(s: Suggestion, f: Filters): boolean {
  if (f.tier !== "alla" && s.tier !== f.tier) return false;
  if (f.ageOnly && s.fit.level !== "säkert" && s.fit.level !== "troligt") return false;
  return true;
}

/** Alla förslag i körningen, bästa först, utvärderade på första datumet de finns i perioden. */
export function rankedSuggestions(run: RunView, profile: Profile, city: City, origin: Origin | null, ratingList: StoredRating[], f: Filters): Suggestion[] {
  const ratings = Object.fromEntries(ratingList.map((r) => [r.key, r]));
  const tw = tagWeightsFrom(ratingList);
  return run.items
    .map((it) => suggestionFor(it, (it.dates ?? []).find((d) => run.dates.includes(d.date))?.date ?? run.from, run, profile, city, origin, ratings, tw))
    .filter((s) => passes(s, f))
    .sort((a, b) => b.score - a.score);
}

/** Förslag per ledig dag, högst `perDay` per dag. Utan lediga dagar visas hela perioden. */
export function suggestionsByDay(run: RunView, profile: Profile, city: City, origin: Origin | null, ratingList: StoredRating[], f: Filters, perDay = 3) {
  const ratings = Object.fromEntries(ratingList.map((r) => [r.key, r]));
  const tw = tagWeightsFrom(ratingList);
  const free = activeDays(run.dates, profile);
  const days = free.length ? free : run.dates;
  return days.map((date) => {
    const all = run.items.filter((it) => dayEntry(it, date)).map((it) => suggestionFor(it, date, run, profile, city, origin, ratings, tw)).filter((s) => passes(s, f)).sort((a, b) => b.score - a.score);
    return { date, weather: run.weather.find((w) => w.date === date) ?? null, top: all.slice(0, perDay), more: Math.max(0, all.length - perDay) };
  });
}

export interface ScheduleDay { date: string; weather: Weather | null; pick: Suggestion | null; alts: Suggestion[] }
export interface Schedule { days: ScheduleDay[]; freeDays: number; total: number; unknownCost: boolean }

/**
 * Schema för en vecka eller månad: en huvudaktivitet per ledig dag, aldrig samma förslag två dagar i rad
 * eller med bara en dag emellan (`gap`), och inget som inte passar åldern. Dagar utan förslag är vilodagar.
 */
export function scheduleFor(run: RunView, profile: Profile, city: City, origin: Origin | null, ratingList: StoredRating[], gap = 2): Schedule {
  const ratings = Object.fromEntries(ratingList.map((r) => [r.key, r]));
  const tw = tagWeightsFrom(ratingList);
  const cache = new Map<string, Suggestion>();
  const sug = (it: Item, date: string) => {
    const k = `${it.id}|${date}`;
    let v = cache.get(k);
    if (!v) { v = suggestionFor(it, date, run, profile, city, origin, ratings, tw); cache.set(k, v); }
    return v;
  };
  const free = activeDays(run.dates, profile);
  const plan = schedulePeriod(run.items, free, (it, d) => sug(it, d).score, { gap });
  const days = plan.map((x) => ({ date: x.date, weather: run.weather.find((w) => w.date === x.date) ?? null, pick: x.pick ? sug(x.pick, x.date) : null, alts: x.alts.map((a) => sug(a, x.date)) }));
  const picks = days.flatMap((d) => (d.pick ? [d.pick] : []));
  return { days, freeDays: free.length, total: picks.reduce((n, p) => n + (p.cost.total ?? 0), 0), unknownCost: picks.some((p) => p.cost.total == null) };
}

/** Nyckeln som förslag och betyg grupperas på: staden, eller platsen för en sökning var som helst. */
export function runKey(cityId: string | null, place: { name?: string } | null, id: string): string {
  return cityId ?? `plats-${slug(place?.name ?? id)}`;
}

export interface MealOptions { near: (FoodSpot & { distanceKm: number | null })[]; nearTitle: string | null; packed: PackedFood[] }
export interface DayPlan { date: string; blocks: (Block & { meal?: MealOptions })[]; items: Item[]; missing: string[]; youngestMonths: number | null }

/**
 * Dagsplan för valda förslag: restid från utgångspunkten, sovtider och måltider.
 * Varje måltid får två val: matlådor som passar det yngsta barnet, och matställen närmast aktiviteten runt måltiden.
 */
export function dayPlanFor(run: RunView, profile: Profile, city: City, origin: Origin | null, date: string, itemIds: string[]): DayPlan {
  const chosen = itemIds.map((id) => run.items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  const missing = itemIds.filter((id) => !chosen.some((i) => i.id === id));
  const items = chosen.filter((i) => dayEntry(i, date) || !(i.dates ?? []).length);
  const withTravel = items.map((i) => { const t = travelFor(i, city, origin); return { ...i, _travelMin: t?.min ?? undefined, _travelNote: t ? `${t.mode === "car" ? "bil" : t.mode === "transit" ? "kollektivt" : "promenad"}${t.estimated ? ", uppskattat" : ""}` : undefined }; });
  const ages = (profile.children ?? []).map((c) => ageMonths(c.birthdate, date));
  const youngest = ages.length ? Math.min(...ages) : null;
  const packed = youngest == null ? run.packed : packedFor(run.packed, youngest);
  const blocks = autoPlan(withTravel, profile, date).map((b, idx, all) => {
    if (b.kind !== "mat" && !/lunch|mat|middag/i.test(b.title)) return b;
    // Aktiviteten närmast måltiden: den före, annars den efter.
    const before = [...all.slice(0, idx)].reverse().find((x) => x.itemId);
    const after = all.slice(idx + 1).find((x) => x.itemId);
    const anchor = items.find((i) => i.id === (before ?? after)?.itemId) ?? items[0];
    const near = anchor ? nearestFood(run.food, anchor) : [];
    return { ...b, meal: { near, nearTitle: anchor?.title ?? null, packed } };
  });
  return { date, blocks, items, missing, youngestMonths: youngest };
}
