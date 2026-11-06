"use client";

import { useActionState, useMemo, useState } from "react";
import { isoWeek, parseDate, periodOptions } from "@family-hub/logic";
import { createRequest } from "@/app/actions";
import { useGeolocation } from "@/components/useGeolocation";

const KINDS = [["helg", "Helg"], ["vecka", "Vecka"], ["manad", "Månad"]] as const;
const dayName = (iso: string) => parseDate(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });

export function RequestForm({ cities }: { cities: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createRequest, null);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("helg");
  const geo = useGeolocation();
  const periods = useMemo(() => periodOptions(new Date(), kind), [kind]);
  const label = (p: { from: string; to: string }) =>
    kind === "vecka" ? `v. ${isoWeek(p.from)}: ${dayName(p.from)} – ${dayName(p.to)}`
      : kind === "manad" ? parseDate(p.to).toLocaleDateString("sv-SE", { month: "long", year: "numeric" })
        : `${dayName(p.from)} – ${dayName(p.to)}`;

  return (
    <form action={action} className="grid2">
      <label htmlFor="city">Stad
        <select id="city" name="city">{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </label>
      <label htmlFor="kind">Period
        <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label htmlFor="period" style={{ gridColumn: "1/-1" }}>När
        <select id="period" name="period">{periods.map((p) => <option key={p.from} value={`${p.from}|${p.to}`}>{label(p)}</option>)}</select>
      </label>
      <label htmlFor="address" style={{ gridColumn: "1/-1" }}>Vi utgår från (adress, valfritt)
        <input id="address" name="address" placeholder="Lämna tomt för stadens standardplats" />
      </label>
      <input type="hidden" name="lat" value={geo.state.status === "ok" ? geo.state.lat : ""} />
      <input type="hidden" name="lng" value={geo.state.status === "ok" ? geo.state.lng : ""} />
      <div className="row" style={{ gridColumn: "1/-1" }}>
        <button type="button" className="small" onClick={geo.request} disabled={geo.state.status === "loading"}>
          {geo.state.status === "ok" ? "Position sparad, uppdatera" : geo.state.status === "loading" ? "Hämtar position…" : "Använd där jag är nu"}
        </button>
        {geo.state.status === "error" ? <span className="error">{geo.state.message}</span> : null}
      </div>
      <label htmlFor="note" style={{ gridColumn: "1/-1" }}>Önskemål (valfritt)
        <input id="note" name="note" maxLength={500} placeholder="t.ex. inomhus, mormor följer med" />
      </label>
      <div className="row" style={{ gridColumn: "1/-1" }}>
        <button className="primary" type="submit" disabled={pending}>{pending ? "Sparar…" : "Beställ"}</button>
        {state?.error ? <span className="error" role="alert">{state.error}</span> : null}
        {state?.ok ? <span className="chip good" role="status">Beställningen är sparad</span> : null}
      </div>
    </form>
  );
}
