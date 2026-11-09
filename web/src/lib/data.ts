import "server-only";
import { type City, type FoodSpot, type Item, type Origin, type PackedFood, type Profile } from "@family-hub/logic";
import { db } from "@/lib/db";
import { reapStaleRequests } from "@/lib/agent/runner";
import { runKey, type PlaceView, type RunView, type StoredRating, type Weather } from "@/lib/suggest";
import type { Run } from "@/generated/prisma/client";

// JSON-kolumnerna valideras när de skrivs (lib/validate.ts) och kan därför läsas som sina typer.

export async function getProfile(): Promise<Profile> {
  const row = await db().profile.findUnique({ where: { id: 1 } });
  return (row?.data as Profile | undefined) ?? { adults: 2, children: [], naps: [], availability: { weekdays: false, weekends: true } };
}

export async function getCities(): Promise<(City & { id: string; name: string })[]> {
  const rows = await db().city.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({ ...(r.data as City), id: r.id, name: r.name }));
}

function toRunView(r: Run, cityNames: Map<string, string>): RunView {
  const place = (r.place as PlaceView | null) ?? null;
  const key = runKey(r.cityId, place, r.id);
  return {
    id: r.id, city: key, cityId: r.cityId, label: (r.cityId ? cityNames.get(r.cityId) : undefined) ?? place?.name ?? key, place,
    from: r.from, to: r.to, kind: r.kind, dates: r.dates,
    summary: r.summary, createdAt: r.createdAt.toISOString(),
    weather: r.weather as unknown as Weather[], items: r.items as unknown as Item[],
    food: (r.food as unknown as FoodSpot[] | null) ?? [], packed: (r.packed as unknown as PackedFood[] | null) ?? [],
    fetched: (r.fetched as unknown as RunView["fetched"] | null) ?? [],
    origin: (r.origin as Origin | null) ?? null,
  };
}

async function cityNames(): Promise<Map<string, string>> {
  return new Map((await db().city.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
}

/** De senaste körningarna, nyast först. Vilken som visas per plats avgörs av `pickRunPerPlace`. */
export async function getRecentRuns(): Promise<RunView[]> {
  const [rows, names] = await Promise.all([db().run.findMany({ orderBy: { createdAt: "desc" }, take: 50 }), cityNames()]);
  return rows.map((r) => toRunView(r, names));
}

export async function getRun(id: string): Promise<RunView | null> {
  const [r, names] = await Promise.all([db().run.findUnique({ where: { id } }), cityNames()]);
  return r ? toRunView(r, names) : null;
}

export async function getRatings(): Promise<StoredRating[]> {
  const rows = await db().rating.findMany();
  return rows.map((r) => ({ key: r.key, city: r.cityId, itemId: r.itemId, title: r.title, tags: r.tags, verdict: r.verdict as StoredRating["verdict"], stars: r.stars }));
}

export async function getRequests() {
  await reapStaleRequests();
  return db().request.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}
