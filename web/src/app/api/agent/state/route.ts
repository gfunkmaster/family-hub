import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rejectUnlessAgent } from "@/lib/agent-api";

export const dynamic = "force-dynamic";

/** Allt den schemalagda körningen behöver läsa: profil, städer, väntande beställningar, betyg och tidigare körningar. */
export async function GET(req: Request) {
  const denied = rejectUnlessAgent(req);
  if (denied) return denied;
  const prisma = db();
  const [profile, cities, requests, ratings, runs] = await Promise.all([
    prisma.profile.findUnique({ where: { id: 1 } }),
    prisma.city.findMany(),
    // Direktsökningar sköts av sidan själv; körningen tar bara kön.
    prisma.request.findMany({ where: { status: "ny", mode: "kö" }, orderBy: { createdAt: "asc" } }),
    prisma.rating.findMany(),
    prisma.run.findMany({ orderBy: { createdAt: "desc" }, take: 20, select: { id: true, cityId: true, from: true, to: true, kind: true, createdAt: true, items: true } }),
  ]);
  return NextResponse.json({
    profile: profile?.data ?? null,
    cities: cities.map((c) => ({ id: c.id, name: c.name, ...(c.data as object) })),
    requests,
    ratings,
    runs: runs.map((r) => ({ ...r, items: (r.items as { id?: string; title?: string }[]).map((i) => ({ id: i.id, title: i.title })) })),
  });
}
