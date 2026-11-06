"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isoDate, isoWeek, parseDate, periodOptions } from "@family-hub/logic";
import { createRequest } from "@/app/actions";
import { useGeolocation } from "@/components/useGeolocation";

const KINDS = [["dag", "En dag"], ["helg", "Helg"], ["vecka", "Vecka"], ["manad", "Månad"]] as const;
const WHERE = [["gps", "Där jag är nu"], ["plats", "Adress eller ort"], ["stad", "Sparad stad"]] as const;
const MINUTES = [15, 30, 45, 60, 90] as const;
const dayName = (iso: string) => parseDate(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });

export interface BudgetView { configured: boolean; allowed: boolean; spentUsd: number; budgetUsd: number }

export function RequestForm({ cities, budget }: { cities: { id: string; name: string }[]; budget: BudgetView }) {
  const [state, action, pending] = useActionState(createRequest, null);
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("helg");
  const [where, setWhere] = useState<(typeof WHERE)[number][0]>(cities.length ? "stad" : "gps");
  const geo = useGeolocation();
  const periods = useMemo(() => periodOptions(new Date(), kind), [kind]);
  const today = isoDate(new Date());
  useEffect(() => { if (state?.ok) router.refresh(); }, [state, router]);
  const label = (p: { from: string; to: string }) =>
    kind === "vecka" ? `v. ${isoWeek(p.from)}: ${dayName(p.from)} – ${dayName(p.to)}`
      : kind === "manad" ? parseDate(p.to).toLocaleDateString("sv-SE", { month: "long", year: "numeric" })
        : `${dayName(p.from)} – ${dayName(p.to)}`;
  const canDirect = budget.configured && budget.allowed;

  return (
    <form action={action} className="grid2">
      <fieldset style={{ gridColumn: "1/-1" }} className="row">
        <legend>Var</legend>
        {WHERE.filter(([v]) => v !== "stad" || cities.length).map(([v, l]) => (
          <label key={v} className="chip-radio"><input type="radio" name="where" value={v} checked={where === v} onChange={() => setWhere(v)} /> {l}</label>
        ))}
      </fieldset>
      {where === "stad" ? (
        <label htmlFor="city" style={{ gridColumn: "1/-1" }}>Stad
          <select id="city" name="city">{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
      ) : null}
      {where === "plats" ? (
        <label htmlFor="placeName" style={{ gridColumn: "1/-1" }}>Adress eller ort
          <input id="placeName" name="placeName" required maxLength={120} placeholder="t.ex. Ystad, eller Storgatan 3, Umeå" />
        </label>
      ) : null}
      {where === "gps" ? (
        <div className="row" style={{ gridColumn: "1/-1" }}>
          <button type="button" className="small" onClick={geo.request} disabled={geo.state.status === "loading"}>
            {geo.state.status === "ok" ? `Position hämtad (±${Math.round(geo.state.accuracy)} m), uppdatera` : geo.state.status === "loading" ? "Hämtar position…" : "Använd där jag är nu"}
          </button>
          <input name="placeName" aria-label="Namn på platsen (valfritt)" maxLength={120} placeholder="Namn, t.ex. stugan (valfritt)" />
          {geo.state.status === "error" ? <span className="error">{geo.state.message}</span> : null}
        </div>
      ) : null}
      <input type="hidden" name="lat" value={where === "gps" && geo.state.status === "ok" ? geo.state.lat : ""} />
      <input type="hidden" name="lng" value={where === "gps" && geo.state.status === "ok" ? geo.state.lng : ""} />
      <label htmlFor="minutes">Hur långt vi åker
        <select id="minutes" name="minutes" defaultValue={45}>{MINUTES.map((m) => <option key={m} value={m}>högst {m} min</option>)}</select>
      </label>
      <label htmlFor="kind">Period
        <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {kind === "dag" ? (
        <label htmlFor="day" style={{ gridColumn: "1/-1" }}>Dag
          <input id="day" name="day" type="date" min={today} defaultValue={today} required />
        </label>
      ) : (
        <label htmlFor="period" style={{ gridColumn: "1/-1" }}>När
          <select id="period" name="period">{periods.map((p) => <option key={p.from} value={`${p.from}|${p.to}`}>{label(p)}</option>)}</select>
        </label>
      )}
      <label htmlFor="note" style={{ gridColumn: "1/-1" }}>Önskemål (valfritt)
        <input id="note" name="note" maxLength={500} placeholder="t.ex. inomhus, mormor följer med" />
      </label>
      <div className="row" style={{ gridColumn: "1/-1" }}>
        <button className="primary" type="submit" name="mode" value="direkt" disabled={pending || !canDirect}>{pending ? "Sparar…" : "Sök nu"}</button>
        <button type="submit" name="mode" value="kö" disabled={pending}>Lägg i kön</button>
        {state?.error ? <span className="error" role="alert">{state.error}</span> : null}
        {state?.ok ? <span className="chip good" role="status">{state.direct ? "Sökningen har startat" : "Beställningen ligger i kön"}</span> : null}
      </div>
      <p className="meta" style={{ gridColumn: "1/-1" }}>
        {!budget.configured ? "Sök nu kräver en API-nyckel (ANTHROPIC_API_KEY). Kön tas av torsdagskörningen kl 18.48."
          : `Sök nu tar några minuter. Den här månaden: ${budget.spentUsd.toFixed(2)} av ${budget.budgetUsd} USD.${budget.allowed ? "" : " Budgeten är nådd, använd kön."}`}
      </p>
    </form>
  );
}
