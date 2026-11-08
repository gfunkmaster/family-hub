import { NextResponse, type NextRequest } from "next/server";
import { reverseGeocode } from "@/lib/geo/reverse";

export const dynamic = "force-dynamic";

// Skyddas av familjens inloggning (proxy.ts). Cache på ~11 m sparar anrop; Nominatim tillåter max 1 anrop/s.
const cache = new Map<string, { at: number; value: string | null }>();
const TTL_MS = 60 * 60_000;
const coord = (v: string | null, max: number): number | null => {
  if (v == null || !/^-?\d{1,3}(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Math.abs(n) <= max ? n : null;
};

/** GET /api/reverse?lat&lng → { address: string | null } */
export async function GET(req: NextRequest) {
  const lat = coord(req.nextUrl.searchParams.get("lat"), 90), lng = coord(req.nextUrl.searchParams.get("lng"), 180);
  if (lat == null || lng == null) return NextResponse.json({ error: "lat och lng måste vara koordinater" }, { status: 400 });
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ address: hit.value });
  try {
    const address = await reverseGeocode(lat, lng);
    if (cache.size > 500) cache.clear();
    cache.set(key, { at: Date.now(), value: address });
    return NextResponse.json({ address });
  } catch {
    return NextResponse.json({ error: "Adressen kunde inte hämtas just nu" }, { status: 502 });
  }
}
