"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { radiusKmForMinutes, slug } from "@family-hub/logic";
import { Prisma } from "@/generated/prisma/client";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_DAYS, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createLimiter } from "@/lib/ratelimit";
import { isValidId, parseCity, parseProfile } from "@/lib/validate";
import { runDirectSearch } from "@/lib/agent/runner";
import { geocode } from "@/lib/geo/forward";
import { runKey } from "@/lib/suggest";

async function requireFamily(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, env.sessionSecret))) redirect("/login");
}

// Fem felaktiga lösenord per IP-adress och kvart. Fly sätter fly-client-ip och skriver över klientens egna rubriker.
const loginLimiter = createLimiter({ max: 5, windowMs: 15 * 60_000 });

export async function login(_prev: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const pw = String(form.get("password") ?? "");
  const h = await headers();
  const ip = h.get("fly-client-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "lokal";
  const gate = loginLimiter.check(ip);
  if (!gate.ok) return { error: `För många försök. Vänta ${Math.ceil(gate.retryAfterSec / 60)} min och försök igen.` };
  if (!(await passwordMatches(pw, env.familyPassword, env.sessionSecret))) { loginLimiter.fail(ip); return { error: "Fel lösenord." }; }
  loginLimiter.reset(ip);
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
    const data = { cityId: runKey(run.cityId, run.place as { name?: string } | null, run.id), itemId: item.id, title: item.title, tags: item.tags ?? [], verdict: input.verdict, stars, runId: run.id, ratedAt: new Date() };
    await prisma.rating.upsert({ where: { key: input.key }, create: { key: input.key, ...data }, update: data });
  }
  revalidatePath("/");
}

/** Hur det gick att hitta adressen på kartan: hittad (med vilken träff), ingen träff, eller karttjänsten svarade inte. */
export type Located = { status: "ok"; label: string } | { status: "none" | "failed" };
export type RequestState = { error?: string; ok?: boolean; direct?: boolean; located?: Located } | null;

/** Sparar en beställning. "Sök nu" startar direktsökningen efter svaret, så sidan inte väntar på den. */
export async function createRequest(_prev: RequestState, form: FormData): Promise<RequestState> {
  await requireFamily();
  const where = String(form.get("where") ?? "stad");
  const city = String(form.get("city") ?? "");
  const kind = String(form.get("kind") ?? "helg");
  const day = String(form.get("day") ?? "");
  const [from = "", to = ""] = kind === "dag" ? [day, day] : String(form.get("period") ?? "").split("|");
  const placeName = String(form.get("placeName") ?? "").trim().slice(0, 120);
  const lat = Number(form.get("lat")), lng = Number(form.get("lng"));
  const hasGps = form.get("lat") !== "" && form.get("lat") !== null && Number.isFinite(lat) && Number.isFinite(lng);
  const minutes = Number(form.get("minutes"));
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const mode = form.get("mode") === "direkt" ? "direkt" : "kö";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return { error: "Välj en period." };
  if (!["helg", "vecka", "manad", "dag"].includes(kind)) return { error: "Okänd period." };
  if (![15, 30, 45, 60, 90].includes(minutes)) return { error: "Välj hur långt ni vill åka." };
  const radiusKm = radiusKmForMinutes(minutes);

  let cityId: string | null = null;
  let place: { name: string; address?: string; lat?: number; lng?: number } | null = null;
  let origin: { name: string; address?: string; lat?: number; lng?: number } | null = null;
  let located: Located | undefined;
  if (where === "gps") {
    if (!hasGps) return { error: "Tryck på Använd där jag är nu först." };
    const address = String(form.get("address") ?? "").trim().slice(0, 120);
    place = { name: placeName || address || "Där vi är", ...(address ? { address } : {}), lat, lng };
    origin = { name: place.name, lat, lng };
  } else if (where === "plats") {
    if (!placeName) return { error: "Skriv en adress eller ort." };
    // Koordinater från servern, så att restid kan räknas direkt och sökningen får en exakt mittpunkt.
    // En tvetydig adress stoppas här, innan något sparas eller en betald sökning startar. Ingen träff eller
    // inget svar från karttjänsten: beställningen går vidare utan koordinater, och sökningen tar reda på platsen.
    const geo = await geocode(placeName);
    if (geo.ambiguous) return { error: `"${placeName}" finns på flera orter. Skriv orten också, t.ex. "${placeName}, Växjö".` };
    const coords = geo.hit ? { lat: geo.hit.lat, lng: geo.hit.lng } : {};
    place = { name: placeName, address: geo.hit?.label || placeName, ...coords };
    origin = { name: placeName, address: geo.hit?.label || placeName, ...coords };
    located = geo.hit ? { status: "ok", label: geo.hit.label || placeName } : { status: geo.failed ? "failed" : "none" };
  } else {
    if (!isValidId(city)) return { error: "Välj stad." };
    cityId = city;
  }

  const req = await db().request.create({
    data: { cityId, place: place ? (place as Prisma.InputJsonValue) : Prisma.DbNull, radiusKm, mode, from, to, kind: kind === "dag" ? "egna" : kind, note, origin: origin ? (origin as Prisma.InputJsonValue) : Prisma.DbNull },
  });
  if (mode === "direkt") after(() => runDirectSearch(req.id));
  revalidatePath("/bestall");
  return { ok: true, direct: mode === "direkt", ...(located ? { located } : {}) };
}

/** Sparar familjens profil från Familj-sidan. Samma kontroll som importen. */
/** Sparar en stad. `id` null skapar en ny stad med id av namnet; annars uppdateras den som finns. */
export async function saveCity(id: string | null, input: unknown): Promise<{ ok: true; id: string } | { ok: false; errors: string[] }> {
  await requireFamily();
  if (id !== null && !isValidId(id)) return { ok: false, errors: ["Ogiltigt stads-id."] };
  const name = typeof input === "object" && input !== null && "name" in input && typeof input.name === "string" ? input.name : "";
  const cityId = id ?? slug(name);
  const parsed = parseCity(cityId, input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const exists = await db().city.findUnique({ where: { id: cityId }, select: { id: true } });
  if (id === null && exists) return { ok: false, errors: [`Det finns redan en stad som heter ${cityId}.`] };
  if (id !== null && !exists) return { ok: false, errors: ["Staden finns inte."] };
  const { name: cleanName, ...rest } = parsed.value;
  const data = rest as Prisma.InputJsonValue;
  await db().city.upsert({ where: { id: cityId }, create: { id: cityId, name: cleanName, data }, update: { name: cleanName, data } });
  revalidatePath("/", "layout");
  return { ok: true, id: cityId };
}

export async function saveProfile(input: unknown): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  await requireFamily();
  const parsed = parseProfile(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const data = parsed.value as Prisma.InputJsonValue;
  await db().profile.upsert({ where: { id: 1 }, create: { id: 1, data }, update: { data } });
  revalidatePath("/", "layout");
  return { ok: true };
}
