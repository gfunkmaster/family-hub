import { Nav } from "@/components/Nav";
import { FamilyForm } from "@/components/FamilyForm";
import { getCities, getProfile } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Familj() {
  const [profile, cities] = await Promise.all([getProfile(), getCities()]);
  return (
    <main className="wrap">
      <Nav current="familj" />
      <FamilyForm profile={profile} cities={cities.map((c) => ({ id: c.id, name: c.name }))} />
    </main>
  );
}
