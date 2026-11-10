"use client";

import { useState, useTransition } from "react";
import { ageMonths, isoDate, type Profile } from "@family-hub/logic";
import { saveProfile } from "@/app/actions";
import { useGeolocation } from "@/components/useGeolocation";

type Child = NonNullable<Profile["children"]>[number];
type Nap = NonNullable<Profile["naps"]>[number];
type Place = NonNullable<Profile["places"]>[number];
type LookupStatus = "loading" | "none" | "ambiguous" | "error";
/** Början på geoNote för koordinater som kom från kartuppslaget. */
const MAP_NOTE = "Karta";

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const tags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
const ageText = (birthdate: string) => {
  const m = ageMonths(birthdate, isoDate(new Date()));
  return m < 0 ? "inte född än" : m < 24 ? `${m} mån` : `${Math.floor(m / 12)} år`;
};

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Dygnet 06–20 som ett band, med sovtiderna markerade. Bara en bild av det som står i fälten. */
function NapBand({ naps }: { naps: Nap[] }) {
  const from = 6 * 60, to = 20 * 60;
  const valid = naps.filter((n) => /^\d{2}:\d{2}$/.test(n.from) && /^\d{2}:\d{2}$/.test(n.to) && toMin(n.to) > toMin(n.from));
  if (!valid.length) return null;
  const pct = (m: number) => `${Math.min(100, Math.max(0, ((m - from) / (to - from)) * 100))}%`;
  return (
    <div className="band" role="img" aria-label={`Sovtider: ${valid.map((n) => `${n.from} till ${n.to}`).join(", ")}`}>
      <div className="track">
        {valid.map((n, i) => <span key={i} className="nap" style={{ left: pct(toMin(n.from)), width: `${((Math.min(to, toMin(n.to)) - Math.max(from, toMin(n.from))) / (to - from)) * 100}%` }} />)}
      </div>
      <div className="hours" aria-hidden="true"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span></div>
    </div>
  );
}

export function FamilyForm({ profile, cities }: { profile: Profile; cities: { id: string; name: string }[] }) {
  const [adults, setAdults] = useState(String(profile.adults ?? 2));
  const [budget, setBudget] = useState(profile.budgetMax == null ? "" : String(profile.budgetMax));
  const [children, setChildren] = useState<Child[]>(profile.children ?? []);
  const [naps, setNaps] = useState<Nap[]>(profile.naps ?? []);
  const [places, setPlaces] = useState<Place[]>(profile.places ?? []);
  const [interests, setInterests] = useState((profile.interests ?? []).join(", "));
  const [avoid, setAvoid] = useState((profile.avoid ?? []).join(", "));
  const [stroller, setStroller] = useState(profile.needs?.stroller ?? false);
  const [changing, setChanging] = useState(profile.needs?.changing ?? false);
  const [weekdays, setWeekdays] = useState(profile.availability?.weekdays ?? false);
  const [weekends, setWeekends] = useState(profile.availability?.weekends !== false);
  const [leaveUntil, setLeaveUntil] = useState(profile.leaveUntil ?? "");
  const [homeCity, setHomeCity] = useState(profile.homeCity ?? cities[0]?.id ?? "");
  const [autoRun, setAutoRun] = useState<NonNullable<Profile["autoRun"]>>(profile.autoRun ?? "helg");
  const [result, setResult] = useState<{ ok: true } | { ok: false; errors: string[] } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const geo = useGeolocation();
  const [lookup, setLookup] = useState<Record<string, LookupStatus>>({});

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); setResult(null); };
  const updateChild = (i: number, c: Partial<Child>) => touch(setChildren)(children.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const updateNap = (i: number, n: Partial<Nap>) => touch(setNaps)(naps.map((x, j) => (j === i ? { ...x, ...n } : x)));
  const updatePlace = (i: number, p: Partial<Place>) => touch(setPlaces)(places.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const saveHere = async () => {
    const s = await geo.request();
    if (s.status !== "ok") return;
    touch(setPlaces)([...places, { id: newId("plats"), name: "Här", lat: Math.round(s.lat * 1e6) / 1e6, lng: Math.round(s.lng * 1e6) / 1e6, geoNote: `GPS ±${Math.round(s.accuracy)} m`, ...(homeCity ? { city: homeCity } : {}) }]);
  };

  // Slår upp adressens koordinater på servern (OpenStreetMap). Platsen pekas ut med id, eftersom listan kan ha ändrats
  // under tiden, och svaret används bara om adressen fortfarande är den som slogs upp.
  const setLookupFor = (id: string, status: LookupStatus | null) => setLookup((cur) => { const next = { ...cur }; if (status) next[id] = status; else delete next[id]; return next; });
  const lookUp = async (id: string, address: string) => {
    setLookupFor(id, "loading");
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error();
      const { hit, ambiguous } = (await res.json()) as { hit: { lat: number; lng: number; label: string } | null; ambiguous: boolean };
      if (!hit) { setLookupFor(id, ambiguous ? "ambiguous" : "none"); return; }
      setPlaces((cur) => cur.map((x) => (x.id === id && (x.address ?? "") === address ? { ...x, lat: hit.lat, lng: hit.lng, geoNote: `${MAP_NOTE}${hit.label ? `: ${hit.label}` : ""}`.slice(0, 120) } : x)));
      setDirty(true); setResult(null); setLookupFor(id, null);
    } catch { setLookupFor(id, "error"); }
  };
  // Ändras adressen gäller inte längre koordinater som kom från kartuppslaget. En GPS-position behålls: där är adressen bara en etikett.
  const changeAddress = (i: number, address: string) => {
    const p = places[i];
    if (!p) return;
    setLookupFor(p.id, null);
    const fromMap = p.geoNote?.startsWith(MAP_NOTE);
    touch(setPlaces)(places.map((x, j) => (j !== i ? x : fromMap ? { id: x.id, ...(x.name ? { name: x.name } : {}), ...(x.city ? { city: x.city } : {}), address } : { ...x, address })));
  };

  const save = () => start(async () => {
    const res = await saveProfile({
      adults: Number(adults), budgetMax: budget.trim() === "" ? null : Number(budget),
      children, naps, places, interests: tags(interests), avoid: tags(avoid),
      needs: { stroller, changing }, availability: { weekdays, weekends },
      leaveUntil: leaveUntil || null, homeCity: homeCity || undefined, autoRun,
    });
    setResult(res);
    if (res.ok) setDirty(false);
  });

  return (
    <section className="view on sheet" aria-label="Familj">
      <div className="block">
        <h2>Barn</h2>
        {children.map((c, i) => (
          <div key={c.id ?? i} className="grid2">
            <label>Namn<input value={c.name ?? ""} maxLength={40} onChange={(e) => updateChild(i, { name: e.target.value })} /></label>
            <label>Född<input type="date" value={c.birthdate} onChange={(e) => updateChild(i, { birthdate: e.target.value, approx: false })} /></label>
            <div className="row">
              <span className="age">{c.birthdate ? ageText(c.birthdate) : "datum saknas"}</span>
              {c.approx ? <span className="chip warn">ungefärligt datum</span> : null}
              <button type="button" className="small" onClick={() => touch(setChildren)(children.filter((_, j) => j !== i))}>Ta bort</button>
            </div>
          </div>
        ))}
        <div className="row"><button type="button" className="small" onClick={() => touch(setChildren)([...children, { id: newId("barn"), birthdate: isoDate(new Date()) }])}>Lägg till barn</button></div>
        <p className="meta">Åldern räknas fram för varje dag, så förslagen följer med när barnet växer.</p>
      </div>

      <div className="block">
        <h2>Sovtider</h2>
        <NapBand naps={naps} />
        {naps.map((n, i) => (
          <div key={i} className="row">
            <label>Från<input type="time" value={n.from} onChange={(e) => updateNap(i, { from: e.target.value })} /></label>
            <label>Till<input type="time" value={n.to} onChange={(e) => updateNap(i, { to: e.target.value })} /></label>
            <button type="button" className="small" onClick={() => touch(setNaps)(naps.filter((_, j) => j !== i))}>Ta bort</button>
          </div>
        ))}
        <div className="row"><button type="button" className="small" onClick={() => touch(setNaps)([...naps, { from: "13:00", to: "14:30" }])}>Lägg till sovtid</button></div>
      </div>

      <div className="block">
        <h2>Lediga dagar</h2>
        <label className="check"><input type="checkbox" checked={weekends} onChange={(e) => touch(setWeekends)(e.target.checked)} /> Helger</label>
        <label className="check"><input type="checkbox" checked={weekdays} onChange={(e) => touch(setWeekdays)(e.target.checked)} /> Vardagar (föräldraledig)</label>
        {weekdays ? <><label>Ledig till och med<input type="date" value={leaveUntil} onChange={(e) => touch(setLeaveUntil)(e.target.value)} /></label>{!leaveUntil ? <p className="meta">Utan slutdatum planeras alla vardagar framåt som lediga.</p> : null}</> : null}
        <label>Torsdagskörningen tar fram, när inget är beställt
          <select value={autoRun} onChange={(e) => touch(setAutoRun)(e.target.value as typeof autoRun)}>
            <option value="helg">Kommande helg</option>
            <option value="vecka">Nästa vecka, mån–sön</option>
            <option value="ingen">Ingenting</option>
          </select>
        </label>
      </div>

      <div className="block">
        <h2>Budget och behov</h2>
        <div className="grid2">
          <label>Vuxna<input type="number" min={1} max={6} value={adults} onChange={(e) => touch(setAdults)(e.target.value)} /></label>
          <label>Max per dag, hela familjen (kr)<input type="number" min={0} step={50} value={budget} placeholder="ingen gräns" onChange={(e) => touch(setBudget)(e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={stroller} onChange={(e) => touch(setStroller)(e.target.checked)} /> Vi har barnvagn med oss</label>
        <label className="check"><input type="checkbox" checked={changing} onChange={(e) => touch(setChanging)(e.target.checked)} /> Vi behöver skötrum</label>
        <label>Mer av (kommaseparerat)<input value={interests} placeholder="natur, lek, musik" onChange={(e) => touch(setInterests)(e.target.value)} /></label>
        <label>Undvik (kommaseparerat)<input value={avoid} placeholder="trängsel, högt ljud" onChange={(e) => touch(setAvoid)(e.target.value)} /></label>
      </div>

      <div className="block">
        <h2>Platser</h2>
        <p className="meta">Restid räknas från platsen du väljer under Förslag. En plats utan koordinater kan inte användas för restid: skriv adressen och tryck på Slå upp adressen.</p>
        {cities.length ? (
          <label>Hemstad<select value={homeCity} onChange={(e) => touch(setHomeCity)(e.target.value)}>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        ) : null}
        {places.map((p, i) => (
          <div key={p.id} className="grid2">
            <label>Namn<input value={p.name ?? ""} maxLength={60} onChange={(e) => updatePlace(i, { name: e.target.value })} /></label>
            <label>Adress<input value={p.address ?? ""} maxLength={120} onChange={(e) => changeAddress(i, e.target.value)} /></label>
            {cities.length ? (
              <label>Stad<select value={p.city ?? ""} onChange={(e) => updatePlace(i, { city: e.target.value || undefined })}>
                <option value="">Ingen</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            ) : null}
            <div className="row">
              {p.lat != null && p.lng != null ? <span className="chip good">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}{p.geoNote ? ` · ${p.geoNote}` : ""}</span> : <span className="chip warn">Koordinater saknas</span>}
              {p.address && p.address.trim().length >= 2 ? (
                <button type="button" className="small" disabled={lookup[p.id] === "loading"} onClick={() => { void lookUp(p.id, p.address ?? ""); }}>
                  {lookup[p.id] === "loading" ? "Slår upp…" : p.lat != null ? "Slå upp adressen igen" : "Slå upp adressen"}
                </button>
              ) : null}
              <button type="button" className="small" onClick={() => touch(setPlaces)(places.filter((_, j) => j !== i))}>Ta bort</button>
              {lookup[p.id] === "ambiguous" ? <span className="error" role="status">Adressen finns på flera orter. Skriv orten också, t.ex. Storgatan 3, Växjö.</span> : null}
              {lookup[p.id] === "none" ? <span className="error" role="status">Adressen hittades inte. Prova med ort, t.ex. Storgatan 3, Växjö.</span> : null}
              {lookup[p.id] === "error" ? <span className="error" role="status">Adressen kunde inte slås upp just nu.</span> : null}
            </div>
          </div>
        ))}
        <div className="row"><button type="button" className="small" onClick={() => touch(setChildren)([...children, { id: newId("barn"), birthdate: isoDate(new Date()) }])}>Lägg till barn</button></div>
        <p className="meta">Åldern räknas fram för varje dag, så förslagen följer med när barnet växer.</p>
      </div>

      <div className="block">
        <h2>Sovtider</h2>
        <NapBand naps={naps} />
        {naps.map((n, i) => (
          <div key={i} className="row">
            <label>Från<input type="time" value={n.from} onChange={(e) => updateNap(i, { from: e.target.value })} /></label>
            <label>Till<input type="time" value={n.to} onChange={(e) => updateNap(i, { to: e.target.value })} /></label>
            <button type="button" className="small" onClick={() => touch(setNaps)(naps.filter((_, j) => j !== i))}>Ta bort</button>
          </div>
        ))}
        <div className="row"><button type="button" className="small" onClick={() => touch(setNaps)([...naps, { from: "13:00", to: "14:30" }])}>Lägg till sovtid</button></div>
      </div>

      <div className="block">
        <h2>Lediga dagar</h2>
        <label className="check"><input type="checkbox" checked={weekends} onChange={(e) => touch(setWeekends)(e.target.checked)} /> Helger</label>
        <label className="check"><input type="checkbox" checked={weekdays} onChange={(e) => touch(setWeekdays)(e.target.checked)} /> Vardagar (föräldraledig)</label>
        {weekdays ? <><label>Ledig till och med<input type="date" value={leaveUntil} onChange={(e) => touch(setLeaveUntil)(e.target.value)} /></label>{!leaveUntil ? <p className="meta">Utan slutdatum planeras alla vardagar framåt som lediga.</p> : null}</> : null}
        <label>Torsdagskörningen tar fram, när inget är beställt
          <select value={autoRun} onChange={(e) => touch(setAutoRun)(e.target.value as typeof autoRun)}>
            <option value="helg">Kommande helg</option>
            <option value="vecka">Nästa vecka, mån–sön</option>
            <option value="ingen">Ingenting</option>
          </select>
        </label>
      </div>

      <div className="block">
        <h2>Budget och behov</h2>
        <div className="grid2">
          <label>Vuxna<input type="number" min={1} max={6} value={adults} onChange={(e) => touch(setAdults)(e.target.value)} /></label>
          <label>Max per dag, hela familjen (kr)<input type="number" min={0} step={50} value={budget} placeholder="ingen gräns" onChange={(e) => touch(setBudget)(e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={stroller} onChange={(e) => touch(setStroller)(e.target.checked)} /> Vi har barnvagn med oss</label>
        <label className="check"><input type="checkbox" checked={changing} onChange={(e) => touch(setChanging)(e.target.checked)} /> Vi behöver skötrum</label>
        <label>Mer av (kommaseparerat)<input value={interests} placeholder="natur, lek, musik" onChange={(e) => touch(setInterests)(e.target.value)} /></label>
        <label>Undvik (kommaseparerat)<input value={avoid} placeholder="trängsel, högt ljud" onChange={(e) => touch(setAvoid)(e.target.value)} /></label>
      </div>

      <div className="block">
        <h2>Platser</h2>
        <p className="meta">Restid räknas från platsen du väljer under Förslag. En plats utan koordinater kan inte användas för restid: skriv adressen och tryck på Slå upp adressen.</p>
        {cities.length ? (
          <label>Hemstad<select value={homeCity} onChange={(e) => touch(setHomeCity)(e.target.value)}>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        ) : null}
        {places.map((p, i) => (
          <div key={p.id} className="grid2">
            <label>Namn<input value={p.name ?? ""} maxLength={60} onChange={(e) => updatePlace(i, { name: e.target.value })} /></label>
            <label>Adress<input value={p.address ?? ""} maxLength={120} onChange={(e) => changeAddress(i, e.target.value)} /></label>
            {cities.length ? (
              <label>Stad<select value={p.city ?? ""} onChange={(e) => updatePlace(i, { city: e.target.value || undefined })}>
                <option value="">Ingen</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            ) : null}
            <div className="row">
              {p.lat != null && p.lng != null ? <span className="chip good">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}{p.geoNote ? ` · ${p.geoNote}` : ""}</span> : <span className="chip warn">Koordinater saknas</span>}
              {p.address && p.address.trim().length >= 2 ? (
                <button type="button" className="small" disabled={lookup?.id === p.id && lookup.status === "loading"} onClick={() => { void lookUp(p.id, p.address ?? ""); }}>
                  {lookup?.id === p.id && lookup.status === "loading" ? "Slår upp…" : p.lat != null ? "Slå upp adressen igen" : "Slå upp adressen"}
                </button>
              ) : null}
              <button type="button" className="small" onClick={() => touch(setPlaces)(places.filter((_, j) => j !== i))}>Ta bort</button>
              {lookup?.id === p.id && lookup.status === "none" ? <span className="error" role="status">Adressen hittades inte. Prova med ort, t.ex. Storgatan 3, Växjö.</span> : null}
              {lookup?.id === p.id && lookup.status === "error" ? <span className="error" role="status">Adressen kunde inte slås upp just nu.</span> : null}
            </div>
          </div>
        ))}
        <div className="row">
          <button type="button" className="small" disabled={geo.state.status === "loading"} onClick={() => { void saveHere(); }}>
            {geo.state.status === "loading" ? "Hämtar position…" : "Spara där jag är nu"}
          </button>
          <button type="button" className="small" onClick={() => touch(setPlaces)([...places, { id: newId("plats"), name: "", ...(homeCity ? { city: homeCity } : {}) }])}>Lägg till adress</button>
          {geo.state.status === "error" ? <span className="error">{geo.state.message}</span> : null}
        </div>
      </div>

      <div className="savebar">
        <div className="row">
          <button type="button" className="primary" disabled={pending || !dirty} onClick={save}>{pending ? "Sparar…" : "Spara"}</button>
          {result?.ok ? <span className="chip good" role="status">Sparat</span> : null}
          {dirty && !pending ? <span className="meta">Ändringar som inte är sparade</span> : null}
        </div>
        {result && !result.ok ? <ul className="error" role="alert">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
      </div>
    </section>
  );
}
