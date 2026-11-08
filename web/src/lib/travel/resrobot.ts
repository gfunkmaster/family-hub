/**
 * Verklig kollektivresa via Trafiklab ResRobot Reseplanerare v2.1 (hela Sverige, inklusive SL).
 * Anropas bara från servern; nyckeln (TRAFIKLAB_KEY) lämnar aldrig sidan.
 * Ren parsning är separat från anropet så att den kan testas utan nätverk.
 */
export interface TripLeg { kind: "walk" | "transit"; label: string; from: string; to: string; min: number; departs?: string; arrives?: string; meters?: number; direction?: string }
export interface TripSummary { departs: string; arrives: string; totalMin: number; transfers: number; walkMin: number; legs: TripLeg[] }
export interface TripQuery { from: { lat: number; lng: number }; to: { lat: number; lng: number }; date?: string; time?: string }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x : "");
const hhmm = (t: unknown): string => str(t).slice(0, 5);

/** "PT1H5M" → 65. Okänt format → null. */
export function isoMinutes(d: unknown): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(str(d));
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + Math.round(Number(m[3] ?? 0) / 60);
}

/** Gör om ResRobots svar till den första resan, eller null om svaret saknar resor. */
export function summarizeTrip(json: unknown): TripSummary | null {
  if (!isObj(json) || !Array.isArray(json.Trip)) return null;
  const trip = json.Trip[0];
  if (!isObj(trip) || !isObj(trip.LegList) || !Array.isArray(trip.LegList.Leg)) return null;
  const legs: TripLeg[] = [];
  for (const l of trip.LegList.Leg) {
    if (!isObj(l) || !isObj(l.Origin) || !isObj(l.Destination)) continue;
    const min = isoMinutes(l.duration);
    if (min == null) continue;
    const walk = l.type === "WALK" || l.type === "TRSF";
    const label = walk ? "Gå" : str(l.name).replace(/^Länstrafik\s+/i, "") || "Kollektivt";
    legs.push({
      kind: walk ? "walk" : "transit", label, min,
      from: str(l.Origin.name), to: str(l.Destination.name),
      departs: hhmm(l.Origin.time), arrives: hhmm(l.Destination.time),
      ...(typeof l.dist === "number" ? { meters: l.dist } : {}),
      ...(!walk && str(l.direction) ? { direction: str(l.direction) } : {}),
    });
  }
  const first = legs[0], last = legs[legs.length - 1];
  if (!first || !last) return null;
  const total = isoMinutes(trip.duration) ?? legs.reduce((a, l) => a + l.min, 0);
  const rides = legs.filter((l) => l.kind === "transit").length;
  return {
    departs: first.departs ?? "", arrives: last.arrives ?? "", totalMin: total,
    transfers: Math.max(0, rides - 1), walkMin: legs.filter((l) => l.kind === "walk").reduce((a, l) => a + l.min, 0), legs,
  };
}

/**
 * Är det klokare att gå hela vägen? Ja när gångtiden rakt dit är högst 3 min längre än resan,
 * eller när resan nästan bara är gång med en kort åktur (högst 3 min), och sträckan är gångbar med barn (högst 30 min).
 */
export function walkingBeatsTransit(trip: TripSummary, directWalkMin: number): boolean {
  if (directWalkMin > 30) return false;
  const ride = trip.legs.filter((l) => l.kind === "transit").reduce((a, l) => a + l.min, 0);
  const mostlyWalking = trip.totalMin > 0 && trip.walkMin / trip.totalMin >= 0.8 && ride <= 3;
  return directWalkMin <= trip.totalMin + 3 || (mostlyWalking && directWalkMin <= trip.totalMin + 8);
}

/** En koordinat som visningsnamn ("59.343600, 17.989800") ersätts av ett läsbart namn. */
export function readableName(name: string, fallback: string): string {
  return /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(name.trim()) ? fallback : name;
}

export class TravelError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function fetchTrip(q: TripQuery, accessId: string, fetchImpl: typeof fetch = fetch): Promise<TripSummary | null> {
  const p = new URLSearchParams({
    originCoordLat: String(q.from.lat), originCoordLong: String(q.from.lng),
    destCoordLat: String(q.to.lat), destCoordLong: String(q.to.lng),
    format: "json", numF: "1", accessId,
  });
  if (q.date) p.set("date", q.date);
  if (q.time) p.set("time", q.time);
  const res = await fetchImpl(`https://api.resrobot.se/v2.1/trip?${p}`, { signal: AbortSignal.timeout(10_000) });
  const body: unknown = await res.json().catch(() => null);
  if (isObj(body) && typeof body.errorCode === "string") {
    // Ingen hållplats nära adressen eller ingen resa den tiden är ett svar, inte ett fel.
    if (["SVC_LOC", "SVC_NO_RESULT", "SVC_DATATIME_PERIOD", "SVC_LOC_EQUAL", "SVC_LOC_FAR"].includes(body.errorCode)) return null;
    throw new TravelError(`ResRobot: ${body.errorCode}`, body.errorCode === "API_AUTH" || body.errorCode === "API_QUOTA" ? 503 : 502);
  }
  if (!res.ok) throw new TravelError(`ResRobot svarade ${res.status}`, 502);
  return summarizeTrip(body);
}
