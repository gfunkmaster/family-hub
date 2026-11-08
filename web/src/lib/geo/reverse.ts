/**
 * Adress för en position via OpenStreetMaps Nominatim. Anropas bara från servern, med en egen
 * User-Agent (Nominatims krav), och bara när användaren själv har tryckt på "där jag är nu".
 */
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string => (typeof x === "string" ? x.trim() : "");

/** "Storgatan 3, Södermalm, Stockholm". Saknas gata används det närmaste namnet. Inget användbart: null. */
export function formatAddress(json: unknown): string | null {
  if (!isObj(json) || !isObj(json.address)) return null;
  const a = json.address;
  const road = str(a.road) || str(a.pedestrian) || str(a.footway) || str(a.path);
  const street = road ? [road, str(a.house_number)].filter(Boolean).join(" ") : str(a.amenity) || str(a.tourism) || str(a.leisure);
  const area = str(a.suburb) || str(a.neighbourhood) || str(a.city_district);
  const town = str(a.city) || str(a.town) || str(a.village) || str(a.municipality);
  const parts = [street, area && area !== town ? area : "", town].filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 120) : null;
}

export async function reverseGeocode(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const p = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lng), zoom: "18", addressdetails: "1", "accept-language": "sv" });
  const res = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${p}`, {
    headers: { "user-agent": "family-hub/0.4 (privat familjeapp)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Nominatim svarade ${res.status}`);
  return formatAddress(await res.json().catch(() => null));
}
