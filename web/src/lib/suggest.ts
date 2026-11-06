/**
 * Gör om en körning till det som visas på sidan: rangordnade förslag med kostnad,
 * restid och åldersmatchning, räknat från vald utgångspunkt. Ren logik.
 */
import {
  activeDays, ageFitFor, dayEntry, familyCost, ratingKey, scoreItem, tagWeightsFrom, tierFor, travelFor,
  type City, type Item, type Level, type Mode, type Origin, type Profile, type Rating, type Tier,
} from "@family-hub/logic";

export interface Weather { date: string; high?: number | null; low?: number | null; precip?: number | null; precipMm?: number | null }

export interface RunView {
  id: string; city: string; from: string; to: string; kind: string; dates: string[];
  summary: string; createdAt: string; weather: Weather[]; items: Item[];
  origin: Origin | null;
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
