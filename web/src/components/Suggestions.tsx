"use client";

import { useMemo, useState, useTransition } from "react";
import { fmtPrecip, hasCoords, parseDate, safeUrl, svNum, TIER_LABEL, type City, type Origin, type Profile, type Tier } from "@family-hub/logic";
import { rate } from "@/app/actions";
import { rankedSuggestions, suggestionsByDay, type Filters, type RunView, type StoredRating, type Suggestion } from "@/lib/suggest";
import { useGeolocation } from "@/components/useGeolocation";

type CityRow = City & { id: string; name: string };

const dayName = (iso: string) => parseDate(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
const kr = (n: number | null) => (n == null ? "?" : `${n.toLocaleString("sv-SE")} kr`);
const MODE: Record<string, string> = { walk: "Gång", transit: "Kollektivt", car: "Bil" };
const levelClass = (l: string) => (l === "säkert" ? "good" : l === "troligt" ? "" : l === "oklart" ? "warn" : "bad");

export function Suggestions({ runs, cities, profile, ratings }: { runs: RunView[]; cities: CityRow[]; profile: Profile; ratings: StoredRating[] }) {
  const [cityId, setCityId] = useState(runs[0]?.city ?? "");
  const [filters, setFilters] = useState<Filters>({ tier: "alla", ageOnly: false });
  const [view, setView] = useState<"dag" | "lista">("dag");
  const [originChoice, setOriginChoice] = useState<string>("auto");
  const geo = useGeolocation();

  const run = runs.find((r) => r.city === cityId) ?? runs[0];
  const city: CityRow = cities.find((c) => c.id === run?.city) ?? { id: run?.city ?? "", name: run?.city ?? "" };
  const places = (profile.places ?? []).filter(hasCoords);

  const origin: Origin | null = useMemo(() => {
    if (originChoice === "gps") return geo.state.status === "ok" ? { name: "här du är nu", lat: geo.state.lat, lng: geo.state.lng } : null;
    if (originChoice === "run") return null;
    const chosen = originChoice === "auto" ? places.find((p) => p.id === city.defaultPlaceId) ?? places.find((p) => p.city === city.id) : places.find((p) => p.id === originChoice);
    return chosen && hasCoords(chosen) ? { name: chosen.name || chosen.address, lat: chosen.lat, lng: chosen.lng } : null;
  }, [originChoice, geo.state, places, city.defaultPlaceId, city.id]);

  if (!run) return <div className="card empty">Inga förslag ännu. Beställ en helg, vecka eller månad under Beställ.</div>;

  const longRun = run.dates.length > 2;
  const mode = longRun ? view : "lista";
  const list = mode === "lista" ? rankedSuggestions(run, profile, city, origin, ratings, filters) : [];
  const days = mode === "dag" ? suggestionsByDay(run, profile, city, origin, ratings, filters) : [];

  return (
    <section className="view on" aria-label="Förslag">
      {runs.length > 1 ? (
        <div className="row">{runs.map((r) => (
          <button key={r.id} className="small" aria-pressed={r.city === run.city} onClick={() => setCityId(r.city)}>{cities.find((c) => c.id === r.city)?.name ?? r.city}</button>
        ))}</div>
      ) : null}

      <div className="card">
        <h2>{city.name} · {longRun ? `${dayName(run.dates[0] ?? run.from)} – ${dayName(run.dates[run.dates.length - 1] ?? run.to)}` : run.dates.map(dayName).join(" – ")}</h2>
        {run.summary ? <p className="note">{run.summary}</p> : null}
        {!longRun && run.weather.length ? (
          <div className="weather">{run.weather.map((w) => (
            <span key={w.date} className="wx">{dayName(w.date)}: {svNum(Number(w.high))}° / {svNum(Number(w.low))}°{fmtPrecip(w, true) ? `, ${fmtPrecip(w, true)}` : ""}</span>
          ))}</div>
        ) : null}
        <p className="meta">Sökt {new Date(run.createdAt).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })} · {run.items.length} förslag</p>
      </div>

      <div className="card">
        <label htmlFor="origin">Restid från
          <select id="origin" value={originChoice} onChange={(e) => { setOriginChoice(e.target.value); if (e.target.value === "gps") geo.request(); }}>
            <option value="auto">Standardplats ({run.origin?.name ?? "från sökningen"})</option>
            <option value="gps">Där jag är nu (GPS)</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name || p.address}</option>)}
            <option value="run">Sökningens egna restider</option>
          </select>
        </label>
        <p className="meta" aria-live="polite">
          {originChoice === "gps" && geo.state.status === "loading" ? "Hämtar din position…" : null}
          {originChoice === "gps" && geo.state.status === "error" ? geo.state.message : null}
          {originChoice === "gps" && geo.state.status === "ok" ? `Restid från din position (±${Math.round(geo.state.accuracy)} m). Uppskattat: fågelvägen × 1,3.` : null}
          {originChoice !== "gps" && origin ? `Restid från ${origin.name}. Uppskattat: fågelvägen × 1,3.` : null}
          {originChoice !== "gps" && !origin ? "Restider som sökningen räknade fram." : null}
        </p>
        {originChoice === "gps" && geo.state.status !== "loading" ? <button className="small" onClick={geo.request}>Uppdatera position</button> : null}
      </div>

      <div className="row">
        <div className="seg" role="group" aria-label="Pris">
          {(["alla", "gratis", "under300", "mer"] as const).map((t) => (
            <button key={t} className="small" aria-pressed={filters.tier === t} onClick={() => setFilters((f) => ({ ...f, tier: t as Tier | "alla" }))}>{t === "alla" ? "Alla" : TIER_LABEL[t]}</button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={filters.ageOnly} onChange={(e) => setFilters((f) => ({ ...f, ageOnly: e.target.checked }))} /> Bara det som passar åldern</label>
      </div>

      {longRun ? (
        <div className="seg" role="group" aria-label="Visa">
          <button className="small" aria-pressed={view === "dag"} onClick={() => setView("dag")}>Dag för dag</button>
          <button className="small" aria-pressed={view === "lista"} onClick={() => setView("lista")}>Alla förslag</button>
        </div>
      ) : null}

      {mode === "dag"
        ? days.map((d) => (
          <div key={d.date} className="card">
            <div className="row between"><h3>{dayName(d.date)}</h3>{d.weather ? <span className="wx">{svNum(Number(d.weather.high))}°{fmtPrecip(d.weather) ? `, ${fmtPrecip(d.weather)}` : ""}</span> : null}</div>
            {d.top.length ? d.top.map((s) => <Card key={s.item.id} s={s} runId={run.id} compact />) : <p className="meta">Inget som passar den här dagen.</p>}
            {d.more ? <p className="meta">{d.more} förslag till under Alla förslag.</p> : null}
          </div>
        ))
        : list.length ? list.map((s) => <Card key={s.item.id} s={s} runId={run.id} />) : <div className="card empty">Inget matchar filtret.</div>}
    </section>
  );
}

function Card({ s, runId, compact = false }: { s: Suggestion; runId: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const { item: it, cost, fit, travel, tier } = s;
  const vote = (verdict: "bra" | "nej" | "besokt") => start(() => rate({ key: s.key, runId, itemId: it.id, verdict }));
  const travelTxt = travel ? `${MODE[travel.mode] ?? ""}${travel.min != null ? `${travel.estimated ? " ca" : ""} ${travel.min} min` : ""}${travel.withinLimit === false ? " (över er gräns)" : ""}` : "Restid okänd";
  const costTxt = cost.total != null ? `Totalt ${kr(cost.total)}` : `Entré ${kr(cost.entry)}${cost.travel != null ? ` + resa ${kr(cost.travel)}` : ""}`;
  const when = (it.dates ?? []).filter((d) => !compact || d.date === s.date).map((d) => `${dayName(d.date)} ${d.from ?? ""}–${d.to ?? ""}`).join(" · ");
  return (
    <article className={`card item ${it.conflict ? "conflict" : it.verified ? "verified" : ""}`}>
      <div className="row between">
        <span className="kind">{it.kind === "event" ? "Evenemang" : "Plats"}{it.indoor ? " · inomhus" : it.indoor === false ? " · utomhus" : ""}</span>
        <span className={`chip ${tier === "gratis" ? "good" : tier === "okänt" ? "ghost" : ""}`}>{TIER_LABEL[tier]}</span>
      </div>
      <h3>{it.title}</h3>
      <p className="meta">{it.venue}{when ? ` · ${when}` : ""}</p>
      <div className="row">
        <span className={`chip ${levelClass(fit.level)}`}>Ålder: {fit.level}</span>
        <span className={`chip ${travel?.withinLimit === false ? "warn" : ""}`}>{travelTxt}</span>
        <span className="chip"><span className="cost">{costTxt}</span></span>
        {it.verified ? <span className="chip good">Verifierad</span> : <span className="chip ghost">Ej verifierad</span>}
      </div>
      {!compact && fit.note ? <p className="note">{fit.note}</p> : null}
      {!compact && it.note ? <p className="note">{it.note}</p> : null}
      {it.conflict ? <p className="flag"><b>Källorna säger olika:</b> {it.conflict}</p> : null}
      {!compact ? (
        <p className="meta">Vagn: {it.practical?.stroller ?? "oklart"} · Skötrum: {it.practical?.changing ?? "oklart"}{cost.unknown.length ? ` · Okänt: ${cost.unknown.join(", ")}` : ""}{travel?.basis ? ` · Restid ${travel.basis}` : ""}</p>
      ) : null}
      {!compact && it.sources?.length ? (
        <p className="sources">{it.sources.map((src) => { const u = safeUrl(src.url); return u ? <a key={u} href={u} target="_blank" rel="noopener noreferrer">{src.title ?? new URL(u).hostname}</a> : null; })}</p>
      ) : null}
      <div className="row">
        <button className="small" disabled={pending} aria-pressed={s.verdict === "bra"} onClick={() => vote("bra")}>Bra förslag</button>
        <button className="small" disabled={pending} aria-pressed={s.verdict === "nej"} onClick={() => vote("nej")}>Inte för oss</button>
        <button className="small" disabled={pending} aria-pressed={s.verdict === "besokt"} onClick={() => vote("besokt")}>Vi var där</button>
      </div>
    </article>
  );
}
