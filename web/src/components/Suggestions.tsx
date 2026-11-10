"use client";

import { useState, useTransition } from "react";
import { readableName, walkingBeatsTransit, type TripSummary } from "@/lib/travel/resrobot";
import { ageMonths, bookingStatus, clothingFor, fmtPrecip, haversineKm, hasCoords, parseDate, safeUrl, svNum, TIER_LABEL, type City, type Item, type Origin, type Profile, type Tier, type Weather } from "@family-hub/logic";
import { clearSchedule, rate, saveSchedule } from "@/app/actions";
import { buildSourceReport } from "@/lib/sourceReport";
import Link from "next/link";
import { calendarUrl, mapsUrl } from "@/lib/links";
import { cityFor, rankedSuggestions, runIsPast, scheduleFor, scheduleToSaved, suggestionsByDay, withoutPastDays, type Filters, type PeriodRef, type RunView, type SavedDay, type Schedule, type StoredRating, type Suggestion } from "@/lib/suggest";
import { useGeolocation } from "@/components/useGeolocation";

type CityRow = City & { id: string; name: string };

const dayName = (iso: string) => parseDate(iso).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
const dayParts = (iso: string) => {
  const d = parseDate(iso);
  return { day: d.getDate(), weekday: d.toLocaleDateString("sv-SE", { weekday: "long" }), month: d.toLocaleDateString("sv-SE", { month: "short" }).replace(".", "") };
};
const firstSentence = (t: string) => { const m = t.match(/^.{20,140}?[.!?](\s|$)/); return m ? m[0].trim() : t.length > 140 ? `${t.slice(0, 137).trim()}…` : t; };
const kr = (n: number | null) => (n == null ? "?" : `${n.toLocaleString("sv-SE")} kr`);
const MODE: Record<string, string> = { walk: "Gång", transit: "Kollektivt", car: "Bil" };
const levelClass = (l: string) => (l === "säkert" ? "good" : l === "troligt" ? "" : l === "oklart" ? "warn" : "bad");

export function Suggestions({ runs, allRuns, today, cities, profile, ratings }: { runs: RunView[]; allRuns: PeriodRef[]; today: string; cities: CityRow[]; profile: Profile; ratings: StoredRating[] }) {
  const [cityId, setCityId] = useState(runs[0]?.city ?? "");
  const [filters, setFilters] = useState<Filters>({ tier: "alla", ageOnly: false });
  const [view, setView] = useState<"dag" | "lista" | "schema">("dag");
  const [originChoice, setOriginChoice] = useState<string>("auto");
  const geo = useGeolocation();
  // Osparade ändringar i schemat, per körning.
  const [drafts, setDrafts] = useState<Record<string, SavedDay[]>>({});

  const fullRun = runs.find((r) => r.city === cityId) ?? runs[0];
  // Passerade dagar visas inte. En helt passerad körning visas som den är, med en notis.
  const run = fullRun ? withoutPastDays(fullRun, today) : undefined;
  const past = run ? runIsPast(run, today) : false;
  const siblings = run ? allRuns.filter((r) => r.city === run.city).sort((a, b) => a.from.localeCompare(b.from) || b.createdAt.localeCompare(a.createdAt)) : [];
  const city: CityRow = fullRun ? cityFor(fullRun, cities) : { id: "", name: "" };
  const places = (profile.places ?? []).filter(hasCoords);
  // Standardplatsen är stadens valda plats, annars en sparad plats i staden. Saknas båda används sökningens egna restider.
  const autoPlace = places.find((p) => p.id === city.defaultPlaceId) ?? places.find((p) => p.city === city.id);

  // Billig uträkning, därför ingen memoisering.
  const origin: Origin | null = (() => {
    if (originChoice === "gps") return geo.state.status === "ok" ? { name: geo.state.address || "här du är nu", lat: geo.state.lat, lng: geo.state.lng } : null;
    if (originChoice === "run") return null;
    const chosen = originChoice === "auto" ? autoPlace : places.find((p) => p.id === originChoice);
    return chosen && hasCoords(chosen) ? { name: chosen.name || chosen.address, lat: chosen.lat, lng: chosen.lng } : null;
  })();

  if (!run) return <div className="card empty">Inga förslag ännu. Beställ en helg, vecka eller månad under Beställ.</div>;

  const tripFrom = origin ?? (hasCoords(run.origin) ? { name: run.origin.name ?? "", lat: run.origin.lat, lng: run.origin.lng } : null);
  const longRun = run.dates.length > 2;
  const mode = longRun ? view : "lista";
  const list = mode === "lista" ? rankedSuggestions(run, profile, city, origin, ratings, filters) : [];
  const days = mode === "dag" ? suggestionsByDay(run, profile, city, origin, ratings, filters) : [];
  const draft = drafts[run.id];
  const schedule = mode === "schema" ? scheduleFor(run, profile, city, origin, ratings, 2, draft ?? run.schedule ?? null) : null;
  const setDraft = (days: SavedDay[] | null) => setDrafts((cur) => { const next = { ...cur }; if (days) next[run.id] = days; else delete next[run.id]; return next; });

  return (
    <section className="view on" aria-label="Förslag">
      {runs.length > 1 ? (
        <div className="row">{runs.map((r) => (
          <button key={r.id} className="small" aria-pressed={r.city === run.city} onClick={() => setCityId(r.city)}>{r.label}</button>
        ))}</div>
      ) : null}

      {siblings.length > 1 ? (
        <nav className="row periods" aria-label="Perioder">
          {siblings.map((r) => (
            <Link key={r.id} className="btn small" aria-current={r.id === run.id ? "page" : undefined} href={`/?run=${encodeURIComponent(r.id)}`}>
              {r.from === r.to ? dayName(r.from) : `${dayName(r.from)} – ${dayName(r.to)}`}{runIsPast(r, today) ? " (passerad)" : ""}
            </Link>
          ))}
        </nav>
      ) : null}

      {past ? (
        <div className="card note" role="status">Den här perioden har passerat. <Link href="/bestall">Beställ en ny sökning</Link>{siblings.some((r) => !runIsPast(r, today)) ? " eller välj en annan period ovan" : ""}.</div>
      ) : null}

      <header className="runhead">
        <p className="where">{run.label}</p>
        {longRun ? (
          <h2>{dayName(run.dates[0] ?? run.from)} – {dayName(run.dates[run.dates.length - 1] ?? run.to)}</h2>
        ) : (
          <div className="heads">{run.dates.map((d) => {
            const p = dayParts(d), w = run.weather.find((x) => x.date === d);
            return (
              <div key={d} className="dayhead">
                <span className="num">{p.day}</span>
                <span className="wd">{p.weekday}<br />{p.month}</span>
                {w ? <span className="wx">{svNum(Number(w.high))}° / {svNum(Number(w.low))}°{fmtPrecip(w, true) ? `, ${fmtPrecip(w, true)}` : ""}</span> : null}
              </div>
            );
          })}</div>
        )}
        {!longRun ? run.weather.map((w) => <Clothes key={w.date} weather={w} profile={profile} date={w.date} withDay />) : null}
        <details className="runnote">
          <summary>{run.summary ? firstSentence(run.summary) : "Om sökningen"}</summary>
          {run.summary ? <p className="note">{run.summary}</p> : null}
          <SourceReportView fetched={run.fetched} registry={city.sources ?? []} items={run.items} />
          <p className="meta">Sökt {new Date(run.createdAt).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })}, {run.items.length} förslag</p>
        </details>
      </header>

      <div className="controls">
        <label htmlFor="origin">Restid från
          <select id="origin" value={originChoice === "run" && !autoPlace ? "auto" : originChoice} onChange={(e) => { setOriginChoice(e.target.value); if (e.target.value === "gps") geo.request(); }}>
            <option value="auto">{autoPlace ? `Standardplats (${autoPlace.name || autoPlace.address})` : `Sökningens utgångspunkt${run.origin?.name ? ` (${run.origin.name})` : ""}`}</option>
            <option value="gps">Där jag är nu (GPS)</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name || p.address}</option>)}
            {autoPlace ? <option value="run">Sökningens egna restider</option> : null}
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
          <button className="small" aria-pressed={view === "schema"} onClick={() => setView("schema")}>Schema</button>
        </div>
      ) : null}

      {mode === "schema" && schedule ? <ScheduleView schedule={schedule} runId={run.id} past={past} dirty={!!draft} saved={!!run.schedule} onChange={setDraft} /> : null}

      {mode === "schema" ? null : mode === "dag"
        ? days.map((d) => {
          const p = dayParts(d.date);
          return (
            <section key={d.date} className="day" aria-label={`${p.weekday} ${p.day} ${p.month}`}>
              <div className="dayhead small">
                <span className="num">{p.day}</span>
                <span className="wd">{p.weekday}<br />{p.month}</span>
                {d.weather ? <span className="wx">{svNum(Number(d.weather.high))}°{fmtPrecip(d.weather) ? `, ${fmtPrecip(d.weather)}` : ""}</span> : null}
              </div>
              <Clothes weather={d.weather} profile={profile} date={d.date} />
              {d.top.length ? d.top.map((s, i) => <Card key={s.item.id} s={s} runId={run.id} date={d.date} from={tripFrom} area={run.label} past={past} today={today} compact lead={i === 0} plain={i > 0} />) : <p className="meta">Inget som passar den här dagen.</p>}
              {d.more ? <p className="meta">{d.more} förslag till under Alla förslag.</p> : null}
            </section>
          );
        })
        : list.length ? list.map((s, i) => <Card key={s.item.id} s={s} runId={run.id} date={s.date} from={tripFrom} area={run.label} past={past} today={today} lead={i === 0} plain={i > 0} />) : <div className="card empty">Inget matchar filtret.</div>}
    </section>
  );
}

const MAX_PER_DAY = 4;

/** Kalenderutkast för ett förslag en viss dag. Ett evenemang får sina tider, en plats blir en heldagshändelse med öppettiderna. */
function itemCalendarUrl(it: Item, date: string): string | null {
  const entry = it.dates?.find((d) => d.date === date);
  return calendarUrl({
    title: it.title, date,
    ...(it.kind === "event" && entry?.from ? { start: entry.from, end: entry.to, durationMin: it.durationMin } : {}),
    location: it.venue,
    details: [entry?.from && it.kind !== "event" ? `Öppet ${entry.from}–${entry.to ?? ""}` : null, it.note, it.sources?.[0]?.url].filter(Boolean).join("\n"),
  });
}

function ScheduleView({ schedule, runId, past, dirty, saved, onChange }: { schedule: Schedule; runId: string; past: boolean; dirty: boolean; saved: boolean; onChange: (days: SavedDay[] | null) => void }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  if (!schedule.freeDays) {
    return <div className="card empty">Inga lediga dagar i perioden. Är du föräldraledig? Slå på vardagar under <Link href="/familj">Familj</Link>.</div>;
  }
  const rest = schedule.days.filter((d) => !d.chosen.length).length;
  // En ändring fryser hela schemat som det visas, så att de andra dagarna inte räknas om under en.
  const edit = (date: string, ids: string[]) => { setErrors([]); onChange(scheduleToSaved(schedule).map((d) => (d.date === date ? { date, itemIds: ids } : d))); };
  const save = () => start(async () => {
    try {
      const res = await saveSchedule(runId, scheduleToSaved(schedule));
      if (res.ok) { setErrors([]); onChange(null); } else setErrors(res.errors);
    } catch { setErrors(["Schemat kunde inte sparas just nu. Försök igen."]); }
  });
  const reset = () => start(async () => {
    try { await clearSchedule(runId); setErrors([]); onChange(null); } catch { setErrors(["Schemat kunde inte tas bort just nu. Försök igen."]); }
  });
  const droppedTotal = schedule.days.reduce((n, d) => n + d.dropped, 0);
  return (
    <section className="schedule" aria-label="Schema">
      <p className="meta">
        {saved || dirty
          ? `Ert eget schema${dirty ? ", med ändringar som inte är sparade" : ""}.`
          : `En huvudaktivitet per ledig dag (${schedule.freeDays} dagar), samma sak aldrig två dagar i rad eller med bara en dag emellan. När regn väntas väljs utomhus bara om inget annat passar.`}
        {" "}Kostnad ca {kr(schedule.total)}{schedule.unknownCost ? " plus okända priser" : ""}{rest ? `, ${rest} vilodag${rest > 1 ? "ar" : ""}` : ""}.
      </p>
      {schedule.weeks.length > 1 || schedule.weeks.some((w) => w.budget != null) ? (
        <ul className="meta weeks">{schedule.weeks.map((w) => (
          <li key={w.from}>v. {w.week}: {kr(w.total)}{w.budget != null ? ` av ${kr(w.budget)}${w.total > w.budget ? " (över veckobudgeten)" : ""}` : ""}{w.unknownCost ? ", plus okända priser" : ""}</li>
        ))}</ul>
      ) : null}
      {droppedTotal ? <p className="flag" role="status"><b>Sökningen har ändrats sedan ni sparade.</b> {droppedTotal} av era val finns inte längre kvar och visas inte. Välj nya och spara, eller ta bort schemat för att se förslaget igen.</p> : null}
      {past ? null : (
        <div className="row">
          <button className={dirty || !saved ? "primary small" : "small"} disabled={pending || (saved && !dirty)} onClick={save}>{pending ? "Sparar…" : saved && !dirty ? "Schemat är sparat" : "Spara schemat"}</button>
          {dirty ? <button className="small" disabled={pending} onClick={() => { setErrors([]); onChange(null); }}>Ångra ändringar</button> : null}
          {saved && !dirty ? <button className="small" disabled={pending} onClick={reset}>Ta bort mitt schema och visa förslaget igen</button> : null}
          {errors.length ? <span className="error" role="alert">{errors.join(" ")}</span> : null}
        </div>
      )}
      {schedule.days.map((d) => {
        const p = dayParts(d.date), ids = d.chosen.map((c) => c.item.id);
        const full = ids.length >= MAX_PER_DAY;
        return (
          <div key={d.date} className="sday">
            <div className="dayhead small">
              <span className="num">{p.day}</span>
              <span className="wd">{p.weekday}<br />{p.month}</span>
              {d.weather ? <span className="wx">{svNum(Number(d.weather.high))}°{fmtPrecip(d.weather) ? `, ${fmtPrecip(d.weather)}` : ""}</span> : null}
            </div>
            <div className="spick">
              {d.chosen.map((c) => {
                const it = c.item, time = it.dates?.find((x) => x.date === d.date)?.from;
                const cal = past ? null : itemCalendarUrl(it, d.date);
                return (
                  <div key={it.id} className="schosen">
                    <h3>{it.title}</h3>
                    <p className="meta">{[time, it.venue, c.travel?.min != null ? `${MODE[c.travel.mode] ?? ""}${c.travel.estimated ? " ca" : ""} ${c.travel.min} min` : null, c.cost.total != null ? kr(c.cost.total) : "pris okänt"].filter(Boolean).join(", ")}</p>
                    {past ? null : (
                      <div className="row">
                        <button className="small" disabled={pending} onClick={() => edit(d.date, ids.filter((x) => x !== it.id))} aria-label={`Ta bort ${it.title} från ${p.weekday}`}>Ta bort</button>
                        {cal ? <a className="btn small" href={cal} target="_blank" rel="noopener noreferrer">Lägg i kalendern</a> : null}
                      </div>
                    )}
                  </div>
                );
              })}
              {!d.chosen.length ? <p className="meta">{d.overBudget ? "Veckobudgeten är slut: inget av dagens förslag ryms. En vilodag, eller höj budgeten under Familj." : d.dropped ? "Det ni valde finns inte längre i sökningen." : d.own ? "Vilodag." : "Inget förslag den här dagen. En vilodag."}</p> : null}
              {d.why.length ? <p className="meta">{d.why.join(". ")}.</p> : null}
              {!past && d.options.length ? (
                <div className="row" role="group" aria-label={`Lägg till på ${p.weekday}`}>
                  <span className="meta">{d.chosen.length ? "Lägg till:" : "Välj:"}</span>
                  {d.options.slice(0, 4).map((o) => (
                    <button key={o.item.id} className="small" disabled={pending || full} onClick={() => edit(d.date, [...ids, o.item.id])}>{o.item.title}</button>
                  ))}
                  {full ? <span className="meta">Högst {MAX_PER_DAY} per dag.</span> : null}
                </div>
              ) : null}
              {!past && ids.length ? <div className="row"><Link className="btn small" href={`/plan?run=${encodeURIComponent(runId)}&date=${d.date}&${ids.map((id) => `item=${encodeURIComponent(id)}`).join("&")}`}>Planera dagen{ids.length > 1 ? ` (${ids.length} aktiviteter)` : ""}</Link></div> : null}
            </div>
          </div>
        );
      })}
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

const FETCH_ERROR: Record<string, string> = { url_not_accessible: "nekade eller gick inte att nå", unavailable: "otillgänglig", timeout: "tog för lång tid", too_many_requests: "för många anrop", url_not_allowed: "ej tillåten", max_uses_exceeded: "hämtningsgränsen var nådd" };

function SourceReportView({ fetched, registry, items }: { fetched: { url: string; ok: boolean; error?: string }[]; registry: { name: string; url: string }[]; items: Item[] }) {
  if (!fetched.length) return null; // körningar utan logg (torsdagskörningen) har ingen rapport
  const r = buildSourceReport(fetched, registry, items);
  return (
    <details className="sourcereport">
      <summary>Källor: {r.fetched.length} hämtade, {r.failed.length} misslyckades{r.notTried.length ? `, ${r.notTried.length} i registret försöktes inte` : ""}</summary>
      <p className="meta">Loggen kommer från sökningens verktygssvar, inte från modellens egen redovisning.</p>
      {r.fetched.length ? <><h4>Hämtade</h4><ul>{r.fetched.map((f) => <li key={f.host}>{f.host}: {f.items ? `${f.items} förslag` : "inga förslag"}</li>)}</ul></> : null}
      {r.failed.length ? <><h4>Misslyckades</h4><ul>{r.failed.map((f) => <li key={f.host}>{f.host}: {FETCH_ERROR[f.error] ?? f.error}</li>)}</ul></> : null}
      {r.notTried.length ? <><h4>Finns i registret men hämtades inte</h4><ul>{r.notTried.map((n) => <li key={n.url}>{n.name}</li>)}</ul></> : null}
      {r.noItems.length ? <p className="meta">Hämtades men gav inga förslag: {r.noItems.map((n) => n.name).join(", ")}.</p> : null}
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

function Card({ s, runId, date, from, area, today, past = false, compact = false, lead = false, plain = false }: { s: Suggestion; runId: string; date: string; from: Origin | null; area?: string; today: string; past?: boolean; compact?: boolean; lead?: boolean; plain?: boolean }) {
  const [pending, start] = useTransition();
  const { item: it, cost, fit, travel, tier } = s;
  const vote = (verdict: "bra" | "nej" | "besokt") => start(() => rate({ key: s.key, runId, itemId: it.id, verdict }));
  const travelTxt = travel ? `${MODE[travel.mode] ?? ""}${travel.min != null ? `${travel.estimated ? " ca" : ""} ${travel.min} min` : ""}${travel.withinLimit === false ? " (över er gräns)" : ""}` : "Restid okänd";
  const costTxt = cost.total != null ? `Totalt ${kr(cost.total)}` : `Entré ${kr(cost.entry)}${cost.travel != null ? ` + resa ${kr(cost.travel)}` : ""}`;
  const map = mapsUrl(it, area);
  const cal = past ? null : itemCalendarUrl(it, date);
  const booking = past ? null : bookingStatus(it, today);
  const opensTxt = booking?.opensDate ? `${dayName(booking.opensDate)}${booking.opensTime ? ` kl. ${booking.opensTime}` : ""}` : "";
  // Påminnelse i kalendern den dag bokningen öppnar.
  const bookCal = booking?.opensLater && booking.opensDate ? calendarUrl({
    title: `Boka: ${it.title}`, date: booking.opensDate,
    ...(booking.opensTime ? { start: booking.opensTime, durationMin: 15 } : {}),
    details: [`Bokningen öppnar för ${it.title} (${dayName(date)}).`, booking.url].filter(Boolean).join("\n"),
  }) : null;
  const when = (it.dates ?? []).filter((d) => !compact || d.date === s.date).map((d) => `${dayName(d.date)} ${d.from ?? ""}–${d.to ?? ""}`).join(" · ");
  return (
    <article className={`card item ${it.conflict ? "conflict" : it.verified ? "verified" : ""}${lead ? " lead" : ""}${plain ? " plain" : ""}`}>
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
        {booking?.state === "krävs" ? <span className="chip warn">Förbokning krävs</span> : null}
        {booking?.state === "ej" ? <span className="chip good">Drop-in</span> : null}
      </div>
      {booking && booking.state !== "ej" ? (
        <p className="note booking">
          <b>{booking.opensLater ? `Bokningen öppnar ${opensTxt}.` : booking.state === "krävs" ? "Boka i förväg." : "Förbokning kan krävas."}</b>
          {booking.opensLater && booking.state === "kanske" ? " Oklart om bokning krävs." : ""}
          {booking.opened ? ` Bokningen öppnade ${opensTxt}.` : ""}
          {booking.note ? ` ${booking.note}` : ""}
          {booking.url ? <> <a href={booking.url} target="_blank" rel="noopener noreferrer">Till bokningen</a></> : null}
          {bookCal ? <> · <a href={bookCal} target="_blank" rel="noopener noreferrer">Påminn mig i kalendern</a></> : null}
        </p>
      ) : null}
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
        {past ? null : <Link className="btn small" href={`/plan?run=${encodeURIComponent(runId)}&date=${date}&item=${encodeURIComponent(it.id)}`}>Planera dagen</Link>}
      </div>
      {map || cal ? (
        <div className="row">
          {map ? <a className="btn small" href={map} target="_blank" rel="noopener noreferrer">Öppna i Kartor</a> : null}
          {cal ? <a className="btn small" href={cal} target="_blank" rel="noopener noreferrer">Lägg i kalendern</a> : null}
        </div>
      ) : null}
      </div>
    </article>
  );
}
