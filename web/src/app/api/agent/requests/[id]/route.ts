import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badRequest, readJson, rejectUnlessAgent } from "@/lib/agent-api";
import { isValidId, parseRequestPatch } from "@/lib/validate";

/** Markerar en beställning som klar och kopplar den till körningen. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectUnlessAgent(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isValidId(id)) return badRequest(["id har otillåtna tecken"]);
  const parsed = parseRequestPatch(await readJson(req));
  if (!parsed.ok) return badRequest(parsed.errors);
  const prisma = db();
  if (!(await prisma.request.findUnique({ where: { id } }))) return NextResponse.json({ error: "Beställningen finns inte" }, { status: 404 });
  await prisma.request.update({ where: { id }, data: parsed.value });
  return NextResponse.json({ ok: true, id });
}
