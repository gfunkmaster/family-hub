import { NextResponse, type NextRequest } from "next/server";
import { fetchTrip, TravelError, type TripSummary } from "@/lib/travel/resrobot";

export const dynamic = "force-dynamic";

// Skyddas av familjens inloggning (proxy.ts). Cache i minnet sparar anrop mot kvoten.
const cache = new Map<string, { at: number; value: TripSummary | null }>();
const TTL_MS = 10 * 60_000;

const coord = (v: string | null, max: number): number | null => {
  if (v == null || !/^-?\d{1,3}(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Math.abs(n) <= max ? n : null;
};

/** GET /api/travel?olat&olng&dlat&dlng[&date=YYYY-MM-DD&time=HH:MM] → { trip: TripSummary | null } */
export async function GET(req: NextRequest) {
  const key = process.env.TRAFIKLAB_KEY;
  if (!key) return NextResponse.json({ error: "TRAFIKLAB_KEY saknas" }, { status: 503 });
  const q = req.nextUrl.searchParams;
  const olat = coord(q.get("olat"), 90), olng = coord(q.get("olng"), 180), dlat = coord(q.get("dlat"), 90), dlng = coord(q.get("dlng"), 180);
  if (olat == null || olng == null || dlat == null || dlng == null) return NextResponse.json({ error: "olat, olng, dlat och dlng måste vara koordinater" }, { status: 400 });
  const date = q.get("date") ?? undefined, time = q.get("time") ?? undefined;
  if ((date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) || (time && !/^\d{2}:\d{2}$/.test(time))) return NextResponse.json({ error: "date är YYYY-MM-DD och time HH:MM" }, { status: 400 });

  const ck = [olat, olng, dlat, dlng].map((n) => n.toFixed(4)).join(",") + `|${date ?? ""}|${time ?? ""}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ trip: hit.value });
  try {
    const trip = await fetchTrip({ from: { lat: olat, lng: olng }, to: { lat: dlat, lng: dlng }, ...(date ? { date } : {}), ...(time ? { time } : {}) }, key);
    if (cache.size > 500) cache.clear();
    cache.set(ck, { at: Date.now(), value: trip });
    return NextResponse.json({ trip });
  } catch (e) {
    const status = e instanceof TravelError ? e.status : 502;
    return NextResponse.json({ error: "Resan kunde inte hämtas just nu" }, { status });
  }
}
