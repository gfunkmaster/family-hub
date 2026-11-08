/**
 * Källrapport för en körning: vilka sidor agenten faktiskt hämtade (loggen kommer från Claude API:ets
 * verktygssvar, inte från modellens egen redovisning), vilka som misslyckades, och vilka av stadens
 * registrerade källor som aldrig hämtades eller inte gav några förslag.
 */
export interface FetchLogEntry { url: string; ok: boolean; error?: string }
export interface SourceReport {
  /** Hämtade sidor och hur många förslag som anger en källa på samma domän. */
  fetched: { host: string; url: string; items: number }[];
  failed: { host: string; url: string; error: string }[];
  /** Registrerade källor som aldrig försöktes hämtas. */
  notTried: { name: string; url: string }[];
  /** Registrerade källor som hämtades men inte gav något förslag. */
  noItems: { name: string; url: string }[];
}

export const hostOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};

export function buildSourceReport(
  log: FetchLogEntry[],
  registry: { name: string; url: string }[],
  items: { sources?: { url: string }[] }[],
): SourceReport {
  const itemsPerHost = new Map<string, number>();
  for (const it of items) for (const h of new Set((it.sources ?? []).map((s) => hostOf(s.url)).filter(Boolean))) itemsPerHost.set(h, (itemsPerHost.get(h) ?? 0) + 1);

  const okHosts = new Map<string, string>(), failedHosts = new Map<string, { url: string; error: string }>();
  for (const e of log) {
    const h = hostOf(e.url);
    if (!h) continue;
    if (e.ok) okHosts.set(h, okHosts.get(h) ?? e.url);
    else if (!failedHosts.has(h)) failedHosts.set(h, { url: e.url, error: e.error ?? "okänt fel" });
  }
  // En domän som lyckades minst en gång räknas som hämtad, även om en annan sida där misslyckades.
  const failed = [...failedHosts].filter(([h]) => !okHosts.has(h)).map(([host, f]) => ({ host, ...f }));
  const fetched = [...okHosts].map(([host, url]) => ({ host, url, items: itemsPerHost.get(host) ?? 0 }));

  const tried = new Set([...okHosts.keys(), ...failedHosts.keys()]);
  const notTried = registry.filter((r) => { const h = hostOf(r.url); return h && !tried.has(h); }).map(({ name, url }) => ({ name, url }));
  const noItems = registry.filter((r) => { const h = hostOf(r.url); return h && okHosts.has(h) && !itemsPerHost.get(h); }).map(({ name, url }) => ({ name, url }));
  return { fetched, failed, notTried, noItems };
}
