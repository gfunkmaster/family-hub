import "server-only";
import { datesBetween, slug, type City, type Profile } from "@family-hub/logic";
import { db } from "@/lib/db";
import { runData } from "@/lib/persist";
import { parseRun, type PlaceInput } from "@/lib/validate";
import { createAnthropicProvider, AnthropicError } from "./anthropic.ts";
import { budgetState, costUsd, monthStartStockholm, type BudgetState } from "./cost.ts";
import { buildResearchPrompt, extractJson } from "./prompt.ts";
import type { LlmProvider, LlmUsage } from "./types.ts";

const MODEL = () => process.env.AGENT_MODEL ?? "claude-sonnet-5-5";
const hasCoords = (o: unknown): o is { lat: number; lng: number } =>
  typeof o === "object" && o !== null && typeof (o as { lat?: unknown }).lat === "number" && typeof (o as { lng?: unknown }).lng === "number";
const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };

export function providerFromEnv(): LlmProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? createAnthropicProvider({ apiKey: key, model: MODEL() }) : null;
}

export function directSearchConfigured(): boolean { return !!process.env.ANTHROPIC_API_KEY; }

export async function getBudget(now = new Date()): Promise<BudgetState> {
  const agg = await db().agentUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte: monthStartStockholm(now) } } });
  return budgetState(agg._sum.costUsd ?? 0, num(process.env.AGENT_MONTHLY_BUDGET_USD, 10), num(process.env.AGENT_MAX_RUN_USD, 1));
}

async function recordUsage(requestId: string, usage: LlmUsage, model: string): Promise<void> {
  // Okänd modell: räkna med det dyraste kända priset hellre än noll, så att taket håller.
  const cost = costUsd(usage, model) ?? costUsd(usage, "claude-opus-5-5") ?? 0;
  await db().agentUsage.create({ data: { requestId, model, ...usage, costUsd: cost } });
}

/**
 * Kör en direktsökning för en beställning: kontrollerar budgeten, låter agenten söka,
 * validerar svaret och sparar körningen. Fel sparas på beställningen så att sidan kan visa dem.
 */
export async function runDirectSearch(requestId: string, provider: LlmProvider | null = providerFromEnv()): Promise<void> {
  const prisma = db();
  const req = await prisma.request.findUnique({ where: { id: requestId }, include: { city: true } });
  if (!req || req.status !== "ny" || req.mode !== "direkt") return;
  const fail = (error: string, status = "fel") => prisma.request.update({ where: { id: requestId }, data: { status, error } });

  if (!provider) {
    await prisma.request.update({ where: { id: requestId }, data: { mode: "kö", error: "ANTHROPIC_API_KEY saknas, så sidan kan inte söka själv. Beställningen tas av torsdagskörningen." } });
    return;
  }
  const budget = await getBudget();
  if (!budget.allowed) {
    await prisma.request.update({ where: { id: requestId }, data: { mode: "kö", error: `Månadens budget är nådd (${budget.spentUsd.toFixed(2)} av ${budget.budgetUsd} USD). Beställningen tas av torsdagskörningen istället.` } });
    return;
  }
  await prisma.request.update({ where: { id: requestId }, data: { status: "pågår", error: null } });

  const [profileRow, ratings, recent] = await Promise.all([
    prisma.profile.findUnique({ where: { id: 1 } }),
    prisma.rating.findMany(),
    prisma.rating.findMany({ where: { verdict: "besokt", ratedAt: { gte: new Date(Date.now() - 56 * 864e5) } } }),
  ]);
  const profile = (profileRow?.data as Profile | undefined) ?? { adults: 2, children: [] };
  const city = req.city ? ({ ...(req.city.data as City), name: req.city.name }) : null;
  const place = (req.place as PlaceInput | null) ?? null;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
  const { system, prompt } = buildResearchPrompt({
    profile, city, today,
    request: { from: req.from, to: req.to, kind: req.kind, note: req.note, cityName: req.city?.name ?? null, place, radiusKm: req.radiusKm },
    liked: ratings.filter((r) => r.verdict === "bra" || (r.verdict === "besokt" && (r.stars ?? 0) >= 4)).map((r) => r.title),
    disliked: ratings.filter((r) => r.verdict === "nej").map((r) => r.title),
    recentlyVisited: recent.map((r) => r.title),
  });

  let result;
  try {
    result = await provider.research({ system, prompt, maxSearches: 15, maxFetches: 12, location: { country: "SE", timezone: "Europe/Stockholm", ...(req.city?.name ? { city: req.city.name } : {}) } });
  } catch (e) {
    if (e instanceof AnthropicError) await recordUsage(requestId, e.usage, provider.model);
    await fail(e instanceof Error ? e.message : "Sökningen misslyckades");
    return;
  }
  await recordUsage(requestId, result.usage, result.model);

  let raw: unknown;
  try { raw = extractJson(result.text); } catch (e) { await fail(e instanceof Error ? e.message : "Kunde inte läsa svaret"); return; }
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const answeredPlace = typeof obj.place === "object" && obj.place !== null ? (obj.place as Partial<PlaceInput>) : null;
  // Perioden, staden och platsen kommer från beställningen, inte från modellen.
  // En ort utan koordinater (skriven för hand) får modellens koordinater, så att restider går att räkna.
  const coords = place?.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng }
    : typeof answeredPlace?.lat === "number" && typeof answeredPlace.lng === "number" ? { lat: answeredPlace.lat, lng: answeredPlace.lng } : {};
  const runPlace = place ? { ...place, ...coords, ...(req.radiusKm ? { radiusKm: req.radiusKm } : {}) } : null;
  const dates = datesBetween(req.from, req.to);
  const parsed = parseRun({
    ...obj, city: req.cityId ?? undefined, place: runPlace, from: req.from, to: req.to, kind: req.kind, dates,
    origin: hasCoords(req.origin) ? req.origin : (runPlace?.lat != null && runPlace.lng != null ? { name: runPlace.name, lat: runPlace.lat, lng: runPlace.lng } : null),
    createdAt: new Date().toISOString(),
  });
  if (!parsed.ok) { await fail(`Svaret klarade inte kontrollen: ${parsed.errors.slice(0, 3).join("; ")}${parsed.errors.length > 3 ? ` (+${parsed.errors.length - 3} till)` : ""}`); return; }

  const runId = `${slug(req.city?.id ?? runPlace?.name ?? "plats")}-${req.from}-${requestId.slice(-6)}`;
  const data = runData(parsed.value);
  await prisma.run.upsert({ where: { id: runId }, create: { id: runId, ...data }, update: data });
  await prisma.request.update({ where: { id: requestId }, data: { status: "klar", runId, error: null } });
}
