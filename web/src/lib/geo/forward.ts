/**
 * Koordinater för en adress eller ort via OpenStreetMaps Nominatim. Anropas bara från servern, med egen
 * User-Agent (Nominatims krav), och bara när användaren själv beställer en sökning eller trycker på "Slå upp".
 * Sökningen är begränsad till Sverige. Ingen träff ger null: vi gissar inte en position.
 */
import { formatAddress } from "./reverse.ts";

export interface GeoHit { lat: number; lng: number; label: string }

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Första träffen i Nominatims svar. Skräp, tom lista eller koordinater utanför jorden ger null. */
export function parseSearch(json: unknown): GeoHit | null {
  const first = Array.isArray(json) ? json[0] : null;
  if (!isObj(first)) return null;
  const lat = Number(first.lat), lng = Number(first.lon);
  if (typeof first.lat !== "string" || typeof first.lon !== "string" || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const label = formatAddress(first) ?? (typeof first.display_name === "string" ? first.display_name.slice(0, 120) : "");
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, label };
}

export async function forwardGeocode(query: string, fetchImpl: typeof fetch = fetch): Promise<GeoHit | null> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return null;
  const p = new URLSearchParams({ format: "jsonv2", q, limit: "1", addressdetails: "1", countrycodes: "se", "accept-language": "sv" });
  const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${p}`, {
    headers: { "user-agent": "family-hub/0.4 (privat familjeapp)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Nominatim svarade ${res.status}`);
  return parseSearch(await res.json().catch(() => null));
}

const cache = new Map<string, { at: number; value: GeoHit | null }>();
const TTL_MS = 24 * 60 * 60_000;

/**
 * Som `forwardGeocode`, med ett dygns cache (Nominatim tillåter högst 1 anrop/s). Kastar aldrig:
 * `failed` skiljer "tjänsten svarade inte" från "ingen träff", så att anroparen kan gå vidare utan koordinater.
 */
export async function geocode(query: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<{ hit: GeoHit | null; failed: boolean }> {
  const key = query.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached && now - cached.at < TTL_MS) return { hit: cached.value, failed: false };
  try {
    const hit = await forwardGeocode(query, fetchImpl);
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: now, value: hit });
    return { hit, failed: false };
  } catch {
    return { hit: null, failed: true };
  }
}
