import { parseDate } from "@family-hub/logic";
import { Nav } from "@/components/Nav";
import { RequestForm } from "@/components/RequestForm";
import { getCities, getRequests } from "@/lib/data";

export const dynamic = "force-dynamic";

const dayName = (iso: string) => parseDate(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });

export default async function Bestall() {
  const [cities, requests] = await Promise.all([getCities(), getRequests()]);
  return (
    <main className="wrap">
      <Nav current="bestall" />
      <section className="view on" aria-label="Beställ">
        <div className="card">
          <h2>Beställ en sökning</h2>
          <p className="meta">Den schemalagda körningen tar väntande beställningar varje torsdag kl 18.48, söker, kollar mot arrangörernas sidor och lägger in förslagen här.</p>
          {cities.length ? <RequestForm cities={cities.map((c) => ({ id: c.id, name: c.name }))} /> : <p className="meta">Inga städer ännu. De läggs in vid importen från appen.</p>}
        </div>
        <div className="card">
          <h3>Beställningar</h3>
          {requests.length ? requests.map((r) => {
            const origin = r.origin as { name?: string } | null;
            return (
              <div key={r.id} className="cal-day">
                <span>{cities.find((c) => c.id === r.cityId)?.name ?? r.cityId} · {dayName(r.from)}–{dayName(r.to)}{origin?.name ? ` · från ${origin.name}` : ""}{r.note ? ` · ${r.note}` : ""}</span>
                <span className={`chip ${r.status === "klar" ? "good" : "ghost"}`}>{r.status === "klar" ? "Klar" : "Väntar"}</span>
              </div>
            );
          }) : <p className="meta">Inga beställningar.</p>}
        </div>
      </section>
    </main>
  );
}
