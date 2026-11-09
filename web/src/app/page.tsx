import { Nav } from "@/components/Nav";
import { Suggestions } from "@/components/Suggestions";
import { getCities, getProfile, getRatings, getRecentRuns, getRun } from "@/lib/data";
import { pickRunPerPlace, stockholmToday } from "@/lib/suggest";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runId } = await searchParams;
  const [recent, cities, profile, ratings] = await Promise.all([getRecentRuns(), getCities(), getProfile(), getRatings()]);
  const today = stockholmToday(new Date());
  const picked = runId ? recent.find((r) => r.id === runId) ?? (await getRun(runId)) : null;
  const chosen = pickRunPerPlace(recent, today);
  // En vald körning (från växlaren eller en klar beställning) visas först, i stället för den som väljs för samma plats.
  const runs = picked ? [picked, ...chosen.filter((r) => r.city !== picked.city)] : chosen;
  // Växlaren behöver bara perioderna. En äldre vald körning (utanför de 50 senaste) tas med så att den syns i raden.
  const periods = [...recent, ...(picked && !recent.some((r) => r.id === picked.id) ? [picked] : [])].map(({ id, city, from, to, createdAt }) => ({ id, city, from, to, createdAt }));
  return (
    <main className="wrap">
      <Nav current="forslag" />
      <Suggestions key={runs[0]?.id ?? "tom"} runs={runs} allRuns={periods} today={today} cities={cities} profile={profile} ratings={ratings} />
    </main>
  );
}
