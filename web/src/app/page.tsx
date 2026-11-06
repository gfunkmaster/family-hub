import { Nav } from "@/components/Nav";
import { Suggestions } from "@/components/Suggestions";
import { getCities, getLatestRunPerCity, getProfile, getRatings, getRun } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runId } = await searchParams;
  const [latest, cities, profile, ratings, picked] = await Promise.all([getLatestRunPerCity(), getCities(), getProfile(), getRatings(), runId ? getRun(runId) : null]);
  // En vald körning (t.ex. från en klar beställning) visas först, i stället för den senaste för samma plats.
  const runs = picked ? [picked, ...latest.filter((r) => r.city !== picked.city)] : latest;
  return (
    <main className="wrap">
      <Nav current="forslag" />
      <Suggestions runs={runs} cities={cities} profile={profile} ratings={ratings} />
    </main>
  );
}
