"use client";

import { useMemo, useState, useTransition } from "react";
import { readableName, walkingBeatsTransit, type TripSummary } from "@/lib/travel/resrobot";
import { ageMonths, clothingFor, fmtPrecip, haversineKm, hasCoords, parseDate, safeUrl, svNum, TIER_LABEL, type City, type Origin, type Profile, type Tier, type Weather } from "@family-hub/logic";
import { rate } from "@/app/actions";
import Link from "next/link";
import { cityFor, rankedSuggestions, suggestionsByDay, type Filters, type RunView, type StoredRating, type Suggestion } from "@/lib/suggest";
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
  const city: CityRow = run ? cityFor(run, cities) : { id: "", name: "" };
  const places = (profile.places ?? []).filter(hasCoords);

  const origin: Origin | null = useMemo(() => {
    if (originChoice === "gps") return geo.state.status === "ok" ? { name: geo.state.address || "här du är nu", lat: geo.state.lat, lng: geo.state.lng } : null;
    if (originChoice === "run") return null;
    const chosen = originChoice === "auto" ? places.find((p) => p.id === city.defaultPlaceId) ?? places.find((p) => p.city === city.id) : places.find((p) => p.id === originChoice);
    return chosen && hasCoords(chosen) ? { name: chosen.name || chosen.address, lat: chosen.lat, lng: chosen.lng } : null;
  }, [originChoice, geo.state, places, city.defaultPlaceId, city.id]);

  if (!run) return <div className="card empty">Inga förslag ännu. Beställ en helg, vecka eller månad under Beställ.</div>;

  const tripFrom = origin ?? (hasCoords(run.origin) ? { name: run.origin.name ?? "", lat: run.origin.lat, lng: run.origin.lng } : null);
  const longRun = run.dates.length > 2;
  const mode = longRun ? view : "lista";
  const list = mode === "lista" ? rankedSuggestions(run, profile, city, origin, ratings, filters) : [];
  const days = mode === "dag" ? suggestionsByDay(run, profile, city, origin, ratings, filters) : [];

  return (
    <section className="view on" aria-label="Förslag">
      {runs.length > 1 ? (
        <div className="row">{runs.map((r) => (
          <button key={r.id} className="small" aria-pressed={r.city === run.city} onClick={() => setCityId(r.city)}>{r.label}</button>
        ))}</div>
      ) : null}

      <div className="card">
        <h2>{run.label} · {longRun ? `${dayName(run.dates[0] ?? run.from)} – ${dayName(run.dates[run.dates.length - 1] ?? run.to)}` : run.dates.map(dayName).join(" – ")}</h2>
        {run.summary ? <p className="note">{run.summary}</p> : null}
        {!longRun && run.weather.length ? (
          <div className="weather">{run.weather.map((w) => (
            <span key={w.date} className="wx">{dayName(w.date)}: {svNum(Number(w.high))}° / {svNum(Number(w.low))}°{fmtPrecip(w, true) ? `, ${fmtPrecip(w, true)}` : ""}</span>
          ))}</div>
        ) : null}
        {!longRun ? run.weather.map((w) => <Clothes key={w.date} weather={w} profile={profile} date={w.date} withDay />) : null}
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
          {originChoice === "gps" && geo.state.status === "ok" ? `Restid från din position${geo.state.address ? `, ${geo.state.address}` : ""} (±${Math.round(geo.state.accuracy)} m). Uppskattat: fågelvägen × 1,3.` : null}
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
          <div key={d.date} className="card day">
            <div className="row between"><h3>{dayName(d.date)}</h3>{d.weather ? <span className="wx">{svNum(Number(d.weather.high))}°{fmtPrecip(d.weather) ? `, ${fmtPrecip(d.weather)}` : ""}</span> : null}</div>
            <Clothes weather={d.weather} profile={profile} date={d.date} />
            {d.top.length ? d.top.map((s) => <Card key={s.item.id} s={s} runId={run.id} date={d.date} from={tripFrom} compact />) : <p className="meta">Inget som passar den här dagen.</p>}
            {d.more ? <p className="meta">{d.more} förslag till under Alla förslag.</p> : null}
          </div>
        ))
        : list.length ? list.map((s) => <Card key={s.item.id} s={s} runId={run.id} date={s.date} from={tripFrom} />) : <div className="card empty">Inget matchar filtret.</div>}
    </section>
  );
}

function Clothes({ weather, profile, date, withDay = false }: { weather: Weather | null | undefined; profile: Profile; date: string; withDay?: boolean }) {
  const months = (profile.children ?? []).map((c) => ageMonths(c.birthdate, date));
  const tips = clothingFor(weather, months.length ? Math.min(...months) : null);
  if (!tips) return null;
  return (
    <details className="clothes">
      <summary>{withDay ? `${dayName(date)}: ` : "Kläder: "}{tips.headline}</summary>
      <ul>{tips.items.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="meta">Tumregler efter prognosen. Titta på barnet, inte bara på termometern.</p>
    </details>
  );
}

function TransitTrip({ from, item, date }: { from: Origin; item: { title?: string; venue?: string; lat?: number; lng?: number; dates?: { date: string; from?: string }[] }; date: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" } | { status: "ok"; trip: TripSummary | null } | { status: "error" }>({ status: "idle" });
  const { lat, lng } = item;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const time = item.dates?.find((d) => d.date === date)?.from;
  const load = async () => {
    setState({ status: "loading" });
    const q = new URLSearchParams({ olat: String(from.lat), olng: String(from.lng), dlat: String(lat), dlng: String(lng), date, ...(time && /^\d{2}:\d{2}$/.test(time) ? { time } : {}) });
    try {
      const res = await fetch(`/api/travel?${q}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { trip: TripSummary | null };
      setState({ status: "ok", trip: body.trip });
    } catch { setState({ status: "error" }); }
  };
  return (
    <div className="trip">
      {state.status === "idle" ? <button className="small" onClick={load}>Visa kollektivresa</button> : null}
      {state.status === "loading" ? <p className="meta">Hämtar resan…</p> : null}
      {state.status === "error" ? <p className="meta">Resan kunde inte hämtas just nu. <button className="small" onClick={load}>Försök igen</button></p> : null}
      {state.status === "ok" && !state.trip ? <p className="meta">Ingen kollektivresa hittades för den tiden (eller ingen hållplats nära).</p> : null}
      {state.status === "ok" && state.trip ? (() => {
        const trip = state.trip;
        const destName = item.venue || item.title || "målet";
        const directKm = haversineKm(from, { lat, lng }) * 1.3;
        const directWalkMin = Math.max(1, Math.round((directKm / 4.5) * 60));
        const walkBetter = walkingBeatsTransit(trip, directWalkMin);
        return (
          <>
            {walkBetter ? (
              <p className="note"><b>Gå hela vägen:</b> ca {directWalkMin} min ({svNum(Math.round(directKm * 10) / 10)} km). Kollektivt tar {trip.totalMin} min och sparar ingenting, så ta promenaden.</p>
            ) : (
              <p className="meta"><b>{trip.departs}–{trip.arrives}</b> · {trip.totalMin} min · {trip.transfers} byten · {trip.walkMin} min gång · från {from.name || "vald plats"} (ResRobot)</p>
            )}
            <details open={!walkBetter}>
              <summary className="meta">{walkBetter ? "Visa ändå kollektivresan" : "Resväg"}</summary>
              <ol className="legs">{trip.legs.map((l, i) => (
                <li key={i}>{l.kind === "walk" ? `Gå ${l.min} min${l.meters ? ` (${l.meters} m)` : ""} till ${readableName(l.to, destName)}` : `${l.label}${l.direction ? ` mot ${l.direction}` : ""} från ${l.from} ${l.departs} till ${l.to} ${l.arrives}`}</li>
              ))}</ol>
              {!walkBetter ? <p className="meta">Tillgänglighet för barnvagn ingår inte i ResRobots data.</p> : null}
            </details>
          </>
        );
      })() : null}
    </div>
  );
}

function Card({ s, runId, date, from, compact = false }: { s: Suggestion; runId: string; date: string; from: Origin | null; compact?: boolean }) {
  const [pending, start] = useTransition();
  const { item: it, cost, fit, travel, tier } = s;
  const vote = (verdict: "bra" | "nej" | "besokt") => start(() => rate({ key: s.key, runId, itemId: it.id, verdict }));
  const travelTxt = travel ? `${MODE[travel.mode] ?? ""}${travel.min != null ? `${travel.estimated ? " ca" : ""} ${travel.min} min` : ""}${travel.withinLimit === false ? " (över er gräns)" : ""}` : "Restid okänd";
  const costTxt = cost.total != null ? `Totalt ${kr(cost.total)}` : `Entré ${kr(cost.entry)}${cost.travel != null ? ` + resa ${kr(cost.travel)}` : ""}`;
  const when = (it.dates ?? []).filter((d) => !compact || d.date === s.date).map((d) => `${dayName(d.date)} ${d.from ?? ""}–${d.to ?? ""}`).join(" · ");
  return (
    <article className={`card item ${it.conflict ? "conflict" : it.verified ? "verified" : ""}`}>
      <div className={`depart ${travel?.withinLimit === false ? "over" : ""}`} role="group" aria-label={`Restid: ${travelTxt}`}>
        <span className="mins">{travel?.min ?? "?"}</span>
        <span className="unit">min</span>
        <span className="how">{travel ? `${MODE[travel.mode] ?? ""}${travel.estimated && travel.min != null ? ", ca" : ""}` : "Okänd"}</span>
        {travel?.withinLimit === false ? <span className="how">över er gräns</span> : null}
      </div>
      <div className="body">
      <div className="row between">
        <span className="kind">{it.kind === "event" ? "Evenemang" : "Plats"}{it.indoor ? " · inomhus" : it.indoor === false ? " · utomhus" : ""}</span>
        <span className={`chip ${tier === "gratis" ? "good" : tier === "okänt" ? "ghost" : ""}`}>{TIER_LABEL[tier]}</span>
      </div>
      <h3>{it.title}</h3>
      <p className="meta">{it.venue}{when ? ` · ${when}` : ""}</p>
      <div className="row">
        <span className={`chip ${levelClass(fit.level)}`}>Ålder: {fit.level}</span>
        <span className="chip"><span className="cost">{costTxt}</span></span>
        {it.verified ? <span className="chip good">Verifierad</span> : <span className="chip ghost">Ej verifierad</span>}
      </div>
      {!compact && fit.note ? <p className="note">{fit.note}</p> : null}
      {!compact && it.note ? <p className="note">{it.note}</p> : null}
      {from ? <TransitTrip from={from} item={it} date={date} /> : null}
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
        <Link className="btn small" href={`/plan?run=${encodeURIComponent(runId)}&date=${date}&item=${encodeURIComponent(it.id)}`}>Planera dagen</Link>
      </div>
      </div>
    </article>
  );
}
