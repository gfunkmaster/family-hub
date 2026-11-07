import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { RequestInput, RunInput } from "@/lib/validate";

const json = (v: unknown) => v as Prisma.InputJsonValue;
const jsonOrNull = (v: unknown) => (v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue));

/** Gör om en validerad körning till databasfält. */
export function runData(v: RunInput) {
  return {
    cityId: v.city, place: jsonOrNull(v.place), from: v.from, to: v.to, kind: v.kind, dates: v.dates,
    origin: jsonOrNull(v.origin), summary: v.summary, createdAt: new Date(v.createdAt),
    weather: json(v.weather), items: json(v.items), food: json(v.food), packed: json(v.packed),
  };
}

export function requestData(v: RequestInput) {
  return {
    cityId: v.city, place: jsonOrNull(v.place), radiusKm: v.radiusKm, mode: v.mode,
    from: v.from, to: v.to, kind: v.kind, origin: jsonOrNull(v.origin), note: v.note,
    status: v.status, runId: v.runId, createdAt: new Date(v.createdAt),
  };
}
