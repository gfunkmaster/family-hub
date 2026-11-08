import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../src/lib/ratelimit.ts";

test("försöksgräns: spärrar efter max misslyckade försök och släpper när fönstret gått", () => {
  let t = 0;
  const l = createLimiter({ max: 3, windowMs: 60_000, now: () => t });
  for (let i = 0; i < 3; i++) { assert.equal(l.check("1.2.3.4").ok, true); l.fail("1.2.3.4"); t += 1000; }
  const blocked = l.check("1.2.3.4");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfterSec, 57); // första försöket vid 0, släpps vid 60 000, nu 3 000
  assert.equal(l.check("9.9.9.9").ok, true, "andra adresser påverkas inte");
  t = 60_001;
  assert.equal(l.check("1.2.3.4").ok, true);
});

test("försöksgräns: lyckat försök nollställer, och minnet är begränsat", () => {
  const l = createLimiter({ max: 2, windowMs: 1000, now: () => 0, maxKeys: 3 });
  l.fail("a"); l.fail("a");
  assert.equal(l.check("a").ok, false);
  l.reset("a");
  assert.equal(l.check("a").ok, true);
  l.fail("b"); l.fail("c"); l.fail("d"); l.fail("e"); // fjärde nyckeln rensar listan i stället för att växa
  assert.equal(l.check("b").ok, true);
});
