import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerMatches, createSessionToken, passwordMatches, safeEqual, verifySessionToken } from "../src/lib/auth.ts";

const SECRET = "x".repeat(40);

test("sessionstoken gäller tills den går ut och kan inte förfalskas", async () => {
  const now = Date.UTC(2026, 10, 6);
  const token = await createSessionToken(SECRET, now);
  assert.equal(await verifySessionToken(token, SECRET, now + 1000), true);
  assert.equal(await verifySessionToken(token, SECRET, now + 91 * 864e5), false, "expired");
  assert.equal(await verifySessionToken(token, "y".repeat(40), now), false, "other secret");
  const [exp, sig] = token.split(".");
  assert.equal(await verifySessionToken(`${Number(exp) + 1}.${sig}`, SECRET, now), false, "tampered expiry");
  assert.equal(await verifySessionToken(undefined, SECRET, now), false);
  assert.equal(await verifySessionToken(token, "short", now), false, "too short secret never verifies");
});

test("lösenord och bearer-token jämförs exakt", async () => {
  assert.equal(await passwordMatches("hemligt123", "hemligt123", SECRET), true);
  assert.equal(await passwordMatches("hemligt12", "hemligt123", SECRET), false);
  assert.equal(await passwordMatches("", "", SECRET), false, "empty expected password never matches");
  const token = "t".repeat(40);
  assert.equal(bearerMatches(`Bearer ${token}`, token), true);
  assert.equal(bearerMatches(`Bearer ${token}x`, token), false);
  assert.equal(bearerMatches(token, token), false, "needs the Bearer prefix");
  assert.equal(bearerMatches("Bearer abc", "abc"), false, "short tokens are refused");
  assert.equal(safeEqual("abc", "abd"), false);
});
