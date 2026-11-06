import "server-only";
import type { City, Item, Origin, Profile } from "@family-hub/logic";
import { db } from "@/lib/db";
import type { RunView, StoredRating, Weather } from "@/lib/suggest";

// JSON-kolumnerna valideras när de skrivs (lib/validate.ts) och kan därför läsas som sina typer.

export async function getProfile(): Promise<Profile> {
  const row = await db().profile.findUnique({ where: { id: 1 } });
  return (row?.data as Profile | undefined) ?? { adults: 2, children: [], naps: [], availability: { weekdays: false, weekends: true } };
}

export async function getCities(): Promise<(City & { id: string; name: string })[]> {
  const rows = await db().city.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({ ...(r.data as City), id: r.id, name: r.name }));
}

export async function getLatestRunPerCity(): Promise<RunView[]> {
  const rows = await db().run.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const seen = new Set<string>();
  const out: RunView[] = [];
  for (const r of rows) {
    if (seen.has(r.cityId)) continue;
    seen.add(r.cityId);
    out.push({
      id: r.id, city: r.cityId, from: r.from, to: r.to, kind: r.kind, dates: r.dates,
      summary: r.summary, createdAt: r.createdAt.toISOString(),
      weather: r.weather as unknown as Weather[], items: r.items as unknown as Item[],
      origin: (r.origin as Origin | null) ?? null,
    });
  }
  return out;
}

export async function getRatings(): Promise<StoredRating[]> {
  const rows = await db().rating.findMany();
  return rows.map((r) => ({ key: r.key, city: r.cityId, itemId: r.itemId, title: r.title, tags: r.tags, verdict: r.verdict as StoredRating["verdict"], stars: r.stars }));
}

export async function getRequests() {
  return db().request.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}
