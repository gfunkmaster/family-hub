import { Nav } from "@/components/Nav";
import { CityForm } from "@/components/CityForm";
import { getCities, getProfile } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Stader() {
  const [cities, profile] = await Promise.all([getCities(), getProfile()]);
  return (
    <main className="wrap">
      <Nav current="stader" />
      <CityForm cities={cities} places={(profile.places ?? []).map((p) => ({ id: p.id, name: p.name || p.address || p.id, city: p.city ?? null }))} />
    </main>
  );
}
