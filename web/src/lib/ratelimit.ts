/**
 * Enkel försöksgräns i minnet (en maskin). Räknar misslyckade försök per nyckel, till exempel IP-adress,
 * inom ett tidsfönster. Startas maskinen om nollställs räknaren, vilket är acceptabelt för en familjeapp.
 */
export interface Limiter {
  /** Är nyckeln spärrad just nu? `retryAfterSec` är tiden tills den släpps. */
  check(key: string): { ok: boolean; retryAfterSec: number };
  /** Registrera ett misslyckat försök. */
  fail(key: string): void;
  /** Nollställ efter lyckat försök. */
  reset(key: string): void;
}

export function createLimiter(opts: { max: number; windowMs: number; now?: () => number; maxKeys?: number }): Limiter {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 1000;
  const hits = new Map<string, number[]>();
  const recent = (key: string): number[] => {
    const t = now();
    const list = (hits.get(key) ?? []).filter((x) => t - x < opts.windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };
  return {
    check(key) {
      const list = recent(key);
      if (list.length < opts.max) return { ok: true, retryAfterSec: 0 };
      const first = list[0] ?? now();
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((first + opts.windowMs - now()) / 1000)) };
    },
    fail(key) {
      if (hits.size >= maxKeys && !hits.has(key)) hits.clear(); // skydd mot att minnet växer
      hits.set(key, [...recent(key), now()]);
    },
    reset(key) { hits.delete(key); },
  };
}
