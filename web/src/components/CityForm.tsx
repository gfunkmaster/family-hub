"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { City } from "@family-hub/logic";
import { saveCity } from "@/app/actions";

type CityRow = City & { id: string; name: string };
type Source = NonNullable<City["sources"]>[number];
type PlaceOpt = { id: string; name: string; city: string | null };

const numText = (v: number | null | undefined) => (v == null ? "" : String(v));
const toNum = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function CityForm({ cities, places }: { cities: CityRow[]; places: PlaceOpt[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(cities[0]?.id ?? "ny");
  return (
    <section className="view on sheet" aria-label="Städer">
      <div className="block">
        <h2>Städer</h2>
        <div className="seg" role="group" aria-label="Välj stad">
          {cities.map((c) => <button key={c.id} type="button" className="small" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>{c.name}</button>)}
          <button type="button" className="small" aria-pressed={selected === "ny"} onClick={() => setSelected("ny")}>Ny stad</button>
        </div>
        <p className="meta">Restidsgräns, biljettpriser och källor styr rangordningen och vad direktsökningen får som startlista.</p>
      </div>
      <CityEditor
        key={selected}
        city={cities.find((c) => c.id === selected) ?? null}
        places={places}
        onSaved={(id) => { setSelected(id); router.refresh(); }}
      />
    </section>
  );
}

function CityEditor({ city, places, onSaved }: { city: CityRow | null; places: PlaceOpt[]; onSaved: (id: string) => void }) {
  const [name, setName] = useState(city?.name ?? "");
  const [origin, setOrigin] = useState(city?.origin ?? "");
  const [defaultPlaceId, setDefaultPlaceId] = useState(city?.defaultPlaceId ?? "");
  const [car, setCar] = useState(city?.transport?.car !== false);
  const [transit, setTransit] = useState(city?.transport?.transit !== false);
  const [maxTravel, setMaxTravel] = useState(numText(city?.maxTravelMin));
  const [carCost, setCarCost] = useState(numText(city?.carCostPerKm));
  const [adult, setAdult] = useState(numText(city?.transitTicket?.adult));
  const [child, setChild] = useState(numText(city?.transitTicket?.child));
  const [ticketNote, setTicketNote] = useState(city?.transitTicket?.note ?? "");
  const [childFree, setChildFree] = useState(numText(city?.childFreeTransitUnder));
  const [sources, setSources] = useState<Source[]>(city?.sources ?? []);
  const [result, setResult] = useState<{ ok: true } | { ok: false; errors: string[] } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); setResult(null); };
  const updateSource = (i: number, patch: Partial<Source>) => touch(setSources)(sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const cityPlaces = places.filter((p) => !city || p.city === city.id || p.city === null);

  const save = () => start(async () => {
    const problems: string[] = [];
    if (!name.trim()) problems.push("Staden behöver ett namn.");
    sources.forEach((src, i) => { if (!src.name.trim() || !/^https?:\/\/\S+$/i.test(src.url.trim())) problems.push(`Källa ${i + 1} behöver både ett namn och en adress som börjar med https://. Fyll i den eller ta bort raden.`); });
    [["Längsta restid", maxTravel], ["Bilkostnad", carCost], ["Biljett vuxen", adult], ["Biljett barn", child], ["Gratis under", childFree]].forEach(([label, v]) => { if (v && Number.isNaN(toNum(v ?? ""))) problems.push(`${label} måste vara ett tal.`); });
    if (problems.length) { setResult({ ok: false, errors: problems }); return; }
    const res = await saveCity(city?.id ?? null, {
      name, origin, defaultPlaceId: defaultPlaceId || null, transport: { car, transit },
      maxTravelMin: toNum(maxTravel), carCostPerKm: toNum(carCost),
      transitTicket: { adult: toNum(adult), child: toNum(child), note: ticketNote },
      childFreeTransitUnder: toNum(childFree), sources,
    });
    if (res.ok) { setResult({ ok: true }); setDirty(false); onSaved(res.id); } else setResult(res);
  });

  return (
    <>
      <div className="block">
        <h2>{city ? city.name : "Ny stad"}</h2>
        <label>Namn<input value={name} maxLength={60} onChange={(e) => touch(setName)(e.target.value)} /></label>
        <label>Utgångspunkt (text, när ingen plats är vald)<input value={origin} maxLength={120} placeholder="Stockholm centrum (T-Centralen)" onChange={(e) => touch(setOrigin)(e.target.value)} /></label>
        {city ? (
          <label>Standardplats för restid
            <select value={defaultPlaceId} onChange={(e) => touch(setDefaultPlaceId)(e.target.value)}>
              <option value="">Ingen, använd utgångspunkten</option>
              {cityPlaces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : <p className="meta">Spara staden först. Därefter kan du välja en standardplats bland dina sparade platser.</p>}
      </div>

      <div className="block">
        <h2>Resor</h2>
        <label className="check"><input type="checkbox" checked={car} onChange={(e) => touch(setCar)(e.target.checked)} /> Vi åker bil här</label>
        <label className="check"><input type="checkbox" checked={transit} onChange={(e) => touch(setTransit)(e.target.checked)} /> Vi åker kollektivt här</label>
        <div className="grid2">
          <label>Längsta restid (minuter)<input inputMode="numeric" value={maxTravel} placeholder="ingen gräns" onChange={(e) => touch(setMaxTravel)(e.target.value)} /></label>
          <label>Bilkostnad (kr per km)<input inputMode="decimal" value={carCost} placeholder="okänt" onChange={(e) => touch(setCarCost)(e.target.value)} /></label>
        </div>
        <div className="grid2">
          <label>Enkelbiljett vuxen (kr)<input inputMode="decimal" value={adult} placeholder="okänt" onChange={(e) => touch(setAdult)(e.target.value)} /></label>
          <label>Enkelbiljett barn (kr)<input inputMode="decimal" value={child} placeholder="okänt" onChange={(e) => touch(setChild)(e.target.value)} /></label>
          <label>Barn reser gratis under (år)<input inputMode="numeric" value={childFree} placeholder="okänt" onChange={(e) => touch(setChildFree)(e.target.value)} /></label>
        </div>
        <label>Anmärkning om biljetter<input value={ticketNote} maxLength={200} onChange={(e) => touch(setTicketNote)(e.target.value)} /></label>
        <p className="meta">Lämna tomt när du inte vet. Okända priser visas som okända, aldrig som noll.</p>
      </div>

      <div className="block">
        <h2>Källor</h2>
        <p className="meta">Sidor som direktsökningen och torsdagskörningen börjar med. Direktsökningen letar dessutom själv efter lokala källor runt platsen.</p>
        {sources.map((src, i) => (
          <div key={i} className="srow">
            <label>Namn<input value={src.name} maxLength={80} onChange={(e) => updateSource(i, { name: e.target.value })} /></label>
            <label>Adress<input type="url" value={src.url} placeholder="https://" onChange={(e) => updateSource(i, { url: e.target.value })} /></label>
            <label>Typ (valfri)<input value={src.kind ?? ""} maxLength={30} placeholder="bibliotek, evenemang" onChange={(e) => updateSource(i, { kind: e.target.value })} /></label>
            <div className="row"><button type="button" className="small" onClick={() => touch(setSources)(sources.filter((_, j) => j !== i))}>Ta bort</button></div>
          </div>
        ))}
        <div className="row"><button type="button" className="small" onClick={() => touch(setSources)([...sources, { name: "", url: "" }])}>Lägg till källa</button></div>
      </div>

      <div className="savebar">
        <div className="row">
          <button type="button" className="primary" disabled={pending || !dirty} onClick={save}>{pending ? "Sparar…" : city ? "Spara" : "Skapa stad"}</button>
          {result?.ok ? <span className="chip good" role="status">Sparat</span> : null}
          {dirty && !pending ? <span className="meta">Ändringar som inte är sparade</span> : null}
        </div>
        {result && !result.ok ? <ul className="error" role="alert">{result.errors.map((e) => <li key={e}>{e.replace(/^cities\.[^.]+\./, "")}</li>)}</ul> : null}
      </div>
    </>
  );
}
