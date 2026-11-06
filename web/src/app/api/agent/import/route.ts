import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { badRequest, readJson, rejectUnlessAgent } from "@/lib/agent-api";
import { runData, requestData } from "@/lib/persist";
import { isValidId, parseCity, parseProfile, parseRating, parseRequest, parseRun } from "@/lib/validate";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Engångsflytt från artifactens databas: { profile, cities: {id: City}, runs: {id: Run}, requests: [..], ratings: [..] }.
 * Allt valideras först; skrivs bara om allt är giltigt, i en transaktion.
 */
export async function POST(req: Request) {
  const denied = rejectUnlessAgent(req);
  if (denied) return denied;
  const body = await readJson(req);
  if (!isObj(body)) return badRequest(["Kroppen är inget objekt"]);
  const errors: string[] = [];
  const profile = body.profile === undefined ? null : parseProfile(body.profile);
  if (profile && !profile.ok) errors.push(...profile.errors);
  const cities = isObj(body.cities) ? Object.entries(body.cities).map(([id, c]) => ({ id, r: parseCity(id, c) })) : [];
  cities.forEach((c) => { if (!c.r.ok) errors.push(...c.r.errors); });
  const runs = isObj(body.runs) ? Object.entries(body.runs).map(([id, r]) => ({ id, r: parseRun(r) })) : [];
  runs.forEach((x) => { if (!isValidId(x.id)) errors.push(`runs.${x.id}: otillåtet id`); if (!x.r.ok) errors.push(...x.r.errors.map((e) => `runs.${x.id}: ${e}`)); });
  const requests = Array.isArray(body.requests) ? body.requests.map(parseRequest) : [];
  requests.forEach((x) => { if (!x.ok) errors.push(...x.errors); });
  const ratings = Array.isArray(body.ratings) ? body.ratings.map(parseRating) : [];
  ratings.forEach((x) => { if (!x.ok) errors.push(...x.errors); });
  const existing = await db().city.findMany({ select: { id: true } });
  const cityIds = new Set([...cities.map((c) => c.id), ...existing.map((c) => c.id)]);
  runs.forEach((x) => { if (x.r.ok && x.r.value.city && !cityIds.has(x.r.value.city)) errors.push(`runs.${x.id}: staden ${x.r.value.city} finns inte`); });
  requests.forEach((x, i) => { if (x.ok && x.value.city && !cityIds.has(x.value.city)) errors.push(`requests[${i}]: staden ${x.value.city} finns inte`); });
  if (errors.length) return badRequest(errors);

  await db().$transaction(async (tx) => {
    if (profile?.ok) await tx.profile.upsert({ where: { id: 1 }, create: { id: 1, data: profile.value as Prisma.InputJsonValue }, update: { data: profile.value as Prisma.InputJsonValue } });
    for (const c of cities) if (c.r.ok) {
      const { name, ...rest } = c.r.value;
      await tx.city.upsert({ where: { id: c.id }, create: { id: c.id, name, data: rest as Prisma.InputJsonValue }, update: { name, data: rest as Prisma.InputJsonValue } });
    }
    for (const x of runs) if (x.r.ok) {
      const data = runData(x.r.value);
      await tx.run.upsert({ where: { id: x.id }, create: { id: x.id, ...data }, update: data });
    }
    for (const x of requests) if (x.ok) {
      const id = x.value.id;
      const data = requestData(x.value);
      if (id) await tx.request.upsert({ where: { id }, create: { id, ...data }, update: data });
      else await tx.request.create({ data });
    }
    for (const x of ratings) if (x.ok) {
      const { key, city, ratedAt, ...rest } = x.value;
      const data = { ...rest, cityId: city, ratedAt: new Date(ratedAt) };
      await tx.rating.upsert({ where: { key }, create: { key, ...data }, update: data });
    }
  });
  return NextResponse.json({ ok: true, cities: cities.length, runs: runs.length, requests: requests.length, ratings: ratings.length, profile: !!profile });
}
