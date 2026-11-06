import { Nav } from "@/components/Nav";
import { Suggestions } from "@/components/Suggestions";
import { getCities, getLatestRunPerCity, getProfile, getRatings } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [runs, cities, profile, ratings] = await Promise.all([getLatestRunPerCity(), getCities(), getProfile(), getRatings()]);
  return (
    <main className="wrap">
      <Nav current="forslag" />
      <Suggestions runs={runs} cities={cities} profile={profile} ratings={ratings} />
    </main>
  );
}
