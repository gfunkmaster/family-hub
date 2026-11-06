"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_DAYS, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isValidId } from "@/lib/validate";

async function requireFamily(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, env.sessionSecret))) redirect("/login");
}

export async function login(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const pw = String(form.get("password") ?? "");
  if (!(await passwordMatches(pw, env.familyPassword, env.sessionSecret))) return { error: "Fel lösenord." };
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(env.sessionSecret), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

const VERDICTS = ["bra", "nej", "besokt"] as const;
type Verdict = (typeof VERDICTS)[number];

/** Sätter eller tar bort ett betyg. Samma betyg igen tar bort det (utom "besokt"). */
export async function rate(input: { key: string; runId: string; itemId: string; verdict: Verdict; stars?: number | null }): Promise<void> {
  await requireFamily();
  if (!isValidId(input.key) || !isValidId(input.runId) || !VERDICTS.includes(input.verdict)) throw new Error("Ogiltigt betyg");
  const prisma = db();
  const run = await prisma.run.findUnique({ where: { id: input.runId } });
  const item = (run?.items as { id: string; title: string; tags?: string[] }[] | undefined)?.find((i) => i.id === input.itemId);
  if (!run || !item) throw new Error("Förslaget finns inte");
  const prev = await prisma.rating.findUnique({ where: { key: input.key } });
  if (prev && prev.verdict === input.verdict && input.verdict !== "besokt" && input.stars === undefined) {
    await prisma.rating.delete({ where: { key: input.key } });
  } else {
    const stars = input.verdict === "besokt" ? (input.stars ?? prev?.stars ?? null) : null;
    const data = { cityId: run.cityId, itemId: item.id, title: item.title, tags: item.tags ?? [], verdict: input.verdict, stars, runId: run.id, ratedAt: new Date() };
    await prisma.rating.upsert({ where: { key: input.key }, create: { key: input.key, ...data }, update: data });
  }
  revalidatePath("/");
}

export async function createRequest(_prev: { error?: string; ok?: boolean } | null, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  await requireFamily();
  const city = String(form.get("city") ?? "");
  const [from = "", to = ""] = String(form.get("period") ?? "").split("|");
  const kind = String(form.get("kind") ?? "egna");
  const address = String(form.get("address") ?? "").trim();
  const lat = Number(form.get("lat")), lng = Number(form.get("lng"));
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  if (!isValidId(city) || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return { error: "Välj stad och period." };
  if (!["helg", "vecka", "manad", "egna"].includes(kind)) return { error: "Okänd period." };
  const origin = Number.isFinite(lat) && Number.isFinite(lng) && form.get("lat")
    ? { name: address || "Här nu", address, lat, lng }
    : address ? { name: address, address } : null;
  await db().request.create({ data: { cityId: city, from, to, kind, note, origin: origin ?? Prisma.DbNull } });
  revalidatePath("/bestall");
  return { ok: true };
}
