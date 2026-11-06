"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { packingList, parseDate, type City, type Origin, type Profile } from "@family-hub/logic";
import { cityFor, dayPlanFor, type RunView } from "@/lib/suggest";
import { useGeolocation } from "@/components/useGeolocation";

type CityRow = City & { id: string; name: string };
const YN: Record<string, string> = { ja: "ja", nej: "nej", oklart: "oklart" };
const yn = (label: string, v?: string) => (v ? <span className={`chip ${v === "ja" ? "good" : v === "nej" ? "bad" : "ghost"}`}>{label}: {YN[v] ?? "oklart"}</span> : <span className="chip ghost">{label}: oklart</span>);
const safeHref = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined);

export function DayPlanView({ run, cities, profile, date, itemIds }: { run: RunView; cities: CityRow[]; profile: Profile; date: string; itemIds: string[] }) {
  const geo = useGeolocation();
  const [useGps, setUseGps] = useState(false);
  const [mealChoice, setMealChoice] = useState<Record<number, "ta-med" | "kop">>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const city = cityFor(run, cities);
  const origin: Origin | null = useGps && geo.state.status === "ok" ? { name: "här du är nu", lat: geo.state.lat, lng: geo.state.lng } : run.origin;
  const plan = useMemo(() => dayPlanFor(run, profile, city, origin, date, itemIds), [run, profile, city, origin, date, itemIds]);
  const chosenPacked = run.packed.filter((p) => picked[p.id]);
  const list = packingList(chosenPacked);

  return (
    <section className="view on" aria-label="Dagsplan">
      <div className="card">
        <h2>{parseDate(date).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })} · {run.label}</h2>
        <p className="meta">Restid från {origin?.name ?? "körningens utgångspunkt"}. Restider är uppskattade om inget annat står.</p>
        <div className="row">
          <button type="button" className="small" onClick={() => { setUseGps(true); geo.request(); }} disabled={geo.state.status === "loading"}>
            {geo.state.status === "loading" ? "Hämtar position…" : useGps && geo.state.status === "ok" ? "Uppdatera position" : "Räkna från där jag är nu"}
          </button>
          {useGps ? <button type="button" className="small" onClick={() => setUseGps(false)}>Använd körningens utgångspunkt</button> : null}
          {geo.state.status === "error" ? <span className="error">{geo.state.message}</span> : null}
        </div>
        {plan.missing.length ? <p className="error">Några förslag finns inte längre i körningen.</p> : null}
      </div>

      <div className="card">
        {plan.blocks.map((b, i) => (
          <div key={i} className={`cal-day block-${b.kind}`}>
            <span><strong>{b.time}–{b.endTime}</strong> {b.title}{b.note ? <><br /><small className="meta">{b.note}</small></> : null}</span>
            {b.meal ? (
              <div style={{ width: "100%" }}>
                <div className="row" role="radiogroup" aria-label="Mat">
                  <button type="button" className="small" aria-pressed={(mealChoice[i] ?? "ta-med") === "ta-med"} onClick={() => setMealChoice({ ...mealChoice, [i]: "ta-med" })}>Ta med hemifrån</button>
                  <button type="button" className="small" aria-pressed={mealChoice[i] === "kop"} onClick={() => setMealChoice({ ...mealChoice, [i]: "kop" })}>Köpa på plats</button>
                </div>
                {(mealChoice[i] ?? "ta-med") === "ta-med" ? (
                  b.meal.packed.length ? b.meal.packed.map((p) => (
                    <div key={p.id} className="meal">
                      <label><input type="checkbox" checked={!!picked[p.id]} onChange={(e) => setPicked({ ...picked, [p.id]: e.target.checked })} /> {p.title}</label>
                      <small className="meta"> från {p.fromMonths} mån{p.keeps ? ` · ${p.keeps}` : ""}</small>
                      <details>
                      <summary>Recept</summary>
                      <p className="meta">Ingredienser: {p.ingredients.join(", ")}</p>
                      <ol>{p.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
                      {p.note ? <p className="meta">{p.note}</p> : null}
                      </details>
                      <p className="meta">Källa: {p.sources.map((s, j) => { const h = safeHref(s.url); return h ? <a key={j} href={h} target="_blank" rel="noopener noreferrer">{s.title || new URL(h).hostname}</a> : null; })}</p>
                    </div>
                  )) : <p className="meta">Inga matlådor för barnets ålder i den här sökningen.{plan.youngestMonths != null ? ` Yngsta barnet är ${plan.youngestMonths} månader.` : ""}</p>
                ) : (
                  b.meal.near.length ? b.meal.near.map((f) => (
                    <div key={f.id} className="meal">
                      <strong>{f.title}</strong>{f.venue ? ` · ${f.venue}` : ""}{f.distanceKm != null ? ` · ${f.distanceKm} km från ${b.meal?.nearTitle ?? "aktiviteten"}` : ""}
                      <div className="row">{yn("Barnstol", f.highChair)}{yn("Micro", f.microwave)}{yn("Skötrum", f.changing)}</div>
                      <p className="meta">{f.priceNote || "Pris okänt"}{f.hoursNote ? ` · ${f.hoursNote}` : ""}{f.note ? ` · ${f.note}` : ""}</p>
                      <p className="meta">{(f.sources ?? []).map((s, j) => { const h = safeHref(s.url); return h ? <a key={j} href={h} target="_blank" rel="noopener noreferrer">{s.title || new URL(h).hostname}</a> : null; })}</p>
                    </div>
                  )) : <p className="meta">Sökningen hittade inga matställen nära {b.meal.nearTitle ?? "aktiviteten"}.</p>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {list.length ? (
        <div className="card">
          <h3>Packlista</h3>
          <ul>{list.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      ) : null}
      <p><Link href="/">Tillbaka till förslagen</Link></p>
    </section>
  );
}
