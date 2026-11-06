import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, readJson, rejectUnlessAgent } from "@/lib/agent-api";
import { isValidId, parseRun } from "@/lib/validate";
import { runData } from "@/lib/persist";

/** Skriver en körning (hela dokumentet ersätts). Staden måste finnas. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectUnlessAgent(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isValidId(id)) return badRequest(["id har otillåtna tecken"]);
  const parsed = parseRun(await readJson(req));
  if (!parsed.ok) return badRequest(parsed.errors);
  const v = parsed.value;
  const prisma = db();
  if (v.city && !(await prisma.city.findUnique({ where: { id: v.city } }))) return badRequest([`Staden ${v.city} finns inte`]);
  const data = runData(v);
  await prisma.run.upsert({ where: { id }, create: { id, ...data }, update: data });
  return NextResponse.json({ ok: true, id, items: v.items.length });
}
