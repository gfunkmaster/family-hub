/**
 * Inloggning för familjen och token för agenten. Ren Web Crypto, så samma kod
 * fungerar i proxy, server actions, route handlers och tester.
 */

const enc = new TextEncoder();
export const SESSION_COOKIE = "fh_session";
export const SESSION_DAYS = 90;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

/** Jämförelse i konstant tid för strängar av samma längd. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token i kakan: `<utgång i ms>.<hmac>`. */
export async function createSessionToken(secret: string, now: number = Date.now()): Promise<string> {
  const exp = now + SESSION_DAYS * 864e5;
  return `${exp}.${await hmac(`session:${exp}`, secret)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now: number = Date.now()): Promise<boolean> {
  if (!token || secret.length < 32) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sig, await hmac(`session:${exp}`, secret));
}

/** Lösenordet jämförs via HMAC så att jämförelsen alltid tar lika lång tid oavsett längd. */
export async function passwordMatches(given: string, expected: string, secret: string): Promise<boolean> {
  if (!expected) return false;
  return safeEqual(await hmac(`pw:${given}`, secret), await hmac(`pw:${expected}`, secret));
}

/** `Authorization: Bearer <token>` för den schemalagda körningen. */
export function bearerMatches(header: string | null, token: string | undefined): boolean {
  if (!header || !token || token.length < 32) return false;
  const m = /^Bearer\s+(.+)$/.exec(header.trim());
  return !!m && safeEqual(m[1] ?? "", token);
}
