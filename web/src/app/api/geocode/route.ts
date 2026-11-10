import { NextResponse, type NextRequest } from "next/server";
import { geocode } from "@/lib/geo/forward";

export const dynamic = "force-dynamic";

/** GET /api/geocode?q=adress → { hit: {lat, lng, label} | null }. Skyddas av familjens inloggning (proxy.ts). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 120) return NextResponse.json({ error: "q måste vara 2–120 tecken" }, { status: 400 });
  const { hit, failed } = await geocode(q);
  if (failed) return NextResponse.json({ error: "Adressen kunde inte slås upp just nu" }, { status: 502 });
  return NextResponse.json({ hit });
}
