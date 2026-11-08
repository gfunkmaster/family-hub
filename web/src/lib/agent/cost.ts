/** Kostnad i USD för en direktsökning, från API:ets egen förbrukningsrapport. */
import type { LlmUsage } from "./types.ts";

/** USD per miljon tokens enligt Claudes prislista (platform.claude.com/docs/en/about-claude/pricing, 2026-11-06). */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 },
};
/** Webbsökning: $10 per 1 000 sökningar. Webbhämtning kostar bara tokens. */
export const WEB_SEARCH_USD = 0.01;

export function costUsd(usage: LlmUsage, model: string): number | null {
  // API:et kan svara med ett daterat id (claude-sonnet-5-5-2026…), så prefix räcker.
  const p = PRICES[model] ?? Object.entries(PRICES).find(([k]) => model.startsWith(k))?.[1];
  if (!p) return null;
  const tokens = (usage.inputTokens * p.input + usage.outputTokens * p.output + usage.cacheReadTokens * p.cacheRead + usage.cacheWriteTokens * p.cacheWrite) / 1e6;
  return Math.round((tokens + usage.webSearches * WEB_SEARCH_USD) * 10000) / 10000;
}

export interface BudgetState { budgetUsd: number; spentUsd: number; reservedUsd: number; maxRunUsd: number; allowed: boolean; leftUsd: number }

/**
 * En sökning får starta bara om även ett dyrt utfall ryms inom månadens tak. Pågående sökningar har ännu inte
 * skrivit sin kostnad, så var och en reserverar `maxRunUsd` (`inFlight`) tills den är klar.
 */
export function budgetState(spentUsd: number, budgetUsd: number, maxRunUsd: number, inFlight = 0): BudgetState {
  const reservedUsd = Math.max(0, inFlight) * maxRunUsd;
  const left = Math.max(0, budgetUsd - spentUsd - reservedUsd);
  return { budgetUsd, spentUsd, reservedUsd, maxRunUsd, allowed: budgetUsd > 0 && spentUsd + reservedUsd + maxRunUsd <= budgetUsd, leftUsd: Math.round(left * 100) / 100 };
}

/** Första dagen i månaden kl 00:00 svensk tid, uttryckt i UTC. */
export function monthStartStockholm(now: Date): Date {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value), m = Number(parts.find((p) => p.type === "month")?.value);
  const guess = new Date(Date.UTC(y, m - 1, 1, 0, 0));
  const offsetMin = (new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Stockholm" })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime()) / 60000;
  return new Date(guess.getTime() - offsetMin * 60000);
}
