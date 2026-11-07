import Link from "next/link";
import { Nav } from "@/components/Nav";
import { DayPlanView } from "@/components/DayPlanView";
import { getCities, getProfile, getRun } from "@/lib/data";
import { isValidId } from "@/lib/validate";

export const dynamic = "force-dynamic";

export default async function Plan({ searchParams }: { searchParams: Promise<{ run?: string; date?: string; item?: string | string[] }> }) {
  const q = await searchParams;
  const runId = q.run && isValidId(q.run) ? q.run : null;
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : null;
  const items = (Array.isArray(q.item) ? q.item : q.item ? [q.item] : []).filter(isValidId).slice(0, 4);
  const [run, cities, profile] = await Promise.all([runId ? getRun(runId) : null, getCities(), getProfile()]);
  return (
    <main className="wrap">
      <Nav current="plan" />
      {run && date && items.length
        ? <DayPlanView run={run} cities={cities} profile={profile} date={date} itemIds={items} />
        : <div className="card empty">Välj ett förslag och tryck på Planera dagen. <Link href="/">Till förslagen</Link></div>}
    </main>
  );
}
