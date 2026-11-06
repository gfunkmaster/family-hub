import "server-only";
import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/auth";
import { env } from "@/lib/env";

/** Returnerar ett 401-svar om anropet inte har agentens token, annars null. */
export function rejectUnlessAgent(req: Request): NextResponse | null {
  if (bearerMatches(req.headers.get("authorization"), env.agentToken)) return null;
  return NextResponse.json({ error: "Saknar eller fel Bearer-token" }, { status: 401 });
}

export function badRequest(errors: string[]): NextResponse {
  return NextResponse.json({ error: "Ogiltig data", errors }, { status: 400 });
}

export async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return undefined; }
}
