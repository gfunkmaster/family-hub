/**
 * Koordinater för en adress eller ort via OpenStreetMaps Nominatim. Anropas bara från servern, med egen
 * User-Agent (Nominatims krav), och bara när användaren själv beställer en sökning eller trycker på "Slå upp".
 * Sökningen är begränsad till Sverige. Ingen träff ger null: vi gissar inte en position.
 */
import { formatAddress } from "./reverse.ts";

export interface GeoHit { lat: number; lng: number; label: string }
/** `ambiguous`: frågan matchar platser i flera orter och säger inte vilken. Då väljs ingen: vi gissar inte en position. */
export type GeoResult = { hit: GeoHit | null; ambiguous: boolean };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const norm = (t: string) => t.toLowerCase().normalize("NFC");

/** Orten för en träff: tätort eller kommun. */
function townOf(hit: Record<string, unknown>): string {
  const a = isObj(hit.address) ? hit.address : {};
  return str(a.city) || str(a.town) || str(a.village) || str(a.municipality);
}

function toHit(first: Record<string, unknown>): GeoHit | null {
  const lat = Number(first.lat), lng = Number(first.lon);
  if (typeof first.lat !== "string" || typeof first.lon !== "string" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Etiketten ska alltid visa orten, så att man ser vilken träff som valdes.
  const short = formatAddress(first), town = townOf(first);
  const label = short && (!town || norm(short).includes(norm(town))) ? short : str(first.display_name).slice(0, 120) || short || "";
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label };
}

/**
 * Bästa träffen i Nominatims svar. Skräp, tom lista eller koordinater utanför jorden ger ingen träff.
 * Ligger träffarna i flera orter måste frågan själv nämna den första träffens ort ("Storgatan 3, Växjö"),
 * annars är den tvetydig ("Storgatan 3", "Centrum") och ingen träff väljs.
 */
export function parseSearch(json: unknown, query = ""): GeoResult {
  const hits = Array.isArray(json) ? json.filter(isObj) : [];
  const first = hits[0];
  const hit = first ? toHit(first) : null;
  if (!first || !hit) return { hit: null, ambiguous: false };
  const towns = new Set(hits.map(townOf).filter(Boolean).map(norm));
  const town = norm(townOf(first));
  if (towns.size > 1 && !(town && norm(query).includes(town))) return { hit: null, ambiguous: true };
  return { hit, ambiguous: false };
}

export async function forwardGeocode(query: string, fetchImpl: typeof fetch = fetch): Promise<GeoResult> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return { hit: null, ambiguous: false };
  const p = new URLSearchParams({ format: "jsonv2", q, limit: "5", addressdetails: "1", countrycodes: "se", "accept-language": "sv" });
  const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { "user-agent": "family-hub/0.4 (privat familjeapp)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Nominatim svarade ${res.status}`);
  return parseSearch(await res.json().catch(() => null), q);
}

const cache = new Map<string, { at: number; value: GeoResult }>();
const TTL_MS = 24 * 60 * 60_000;

/**
 * Som `forwardGeocode`, med ett dygns cache (Nominatim tillåter högst 1 anrop/s). Kastar aldrig:
 * `failed` skiljer "tjänsten svarade inte" från "ingen träff", så att anroparen kan gå vidare utan koordinater.
 */
export async function geocode(query: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<GeoResult & { failed: boolean }> {
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) return { ...cached.value, failed: false };
  try {
    const value = await forwardGeocode(query, fetchImpl);
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: now, value });
    return { ...value, failed: false };
  } catch {
    return { hit: null, ambiguous: false, failed: true };
  }
}
