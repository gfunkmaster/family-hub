import Link from "next/link";
import { parseDate } from "@family-hub/logic";
import { Nav } from "@/components/Nav";
import { RequestForm } from "@/components/RequestForm";
import { RequestRefresher } from "@/components/RequestRefresher";
import { directSearchConfigured, getBudget } from "@/lib/agent/runner";
import { getCities, getRequests } from "@/lib/data";

export const dynamic = "force-dynamic";

const dayName = (iso: string) => parseDate(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
const STATUS: Record<string, [string, string]> = { ny: ["Väntar", "ghost"], "pågår": ["Söker…", "warn"], klar: ["Klar", "good"], fel: ["Fel", "bad"] };

export default async function Bestall() {
  const [cities, requests, budget] = await Promise.all([getCities(), getRequests(), getBudget()]);
  const busy = requests.some((r) => r.status === "pågår" || (r.status === "ny" && r.mode === "direkt"));
  return (
    <main className="wrap">
      <Nav current="bestall" />
      <RequestRefresher active={busy} />
      <section className="view on" aria-label="Beställ">
        <div className="card">
          <h2>Beställ en sökning</h2>
          <p className="meta">Sök var som helst: där du är, en adress eller ort, eller en sparad stad. Sök nu kör direkt, kön tas av torsdagskörningen.</p>
          <RequestForm cities={cities.map((c) => ({ id: c.id, name: c.name }))} budget={{ configured: directSearchConfigured(), ...budget }} />
        </div>
        <div className="card">
          <h3>Beställningar</h3>
          {requests.length ? requests.map((r) => {
            const origin = r.origin as { name?: string } | null;
            const place = r.place as { name?: string } | null;
            const where = place?.name ?? cities.find((c) => c.id === r.cityId)?.name ?? r.cityId ?? "okänd plats";
            const [text, tone] = STATUS[r.status] ?? [r.status, "ghost"];
            return (
              <div key={r.id} className="cal-day">
                <span>
                  {where} · {dayName(r.from)}{r.to !== r.from ? `–${dayName(r.to)}` : ""}
                  {r.radiusKm ? ` · ${r.radiusKm} km` : ""}
                  {origin?.name && origin.name !== place?.name ? ` · från ${origin.name}` : ""}
                  {r.note ? ` · ${r.note}` : ""}
                  {r.error ? <><br /><small className={r.status === "fel" ? "error" : "meta"}>{r.error}</small></> : null}
                </span>
                {r.status === "klar" && r.runId ? <Link className={`chip ${tone}`} href={`/?run=${encodeURIComponent(r.runId)}`}>{text}</Link> : <span className={`chip ${tone}`}>{text}{r.status === "ny" ? (r.mode === "direkt" ? " (direkt)" : " (kö)") : ""}</span>}
              </div>
            );
          }) : <p className="meta">Inga beställningar.</p>}
        </div>
      </section>
    </main>
  );
}
