import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceReport, hostOf } from "../src/lib/sourceReport.ts";

const registry = [
  { name: "Skansen", url: "https://www.skansen.se/kalender/" },
  { name: "Junibacken", url: "https://www.junibacken.se/" },
  { name: "Kulturparken", url: "https://www.kulturparkensmaland.se" },
  { name: "Biblioteken", url: "https://biblioteket.stockholm.se/evenemang" },
];
const log = [
  { url: "https://www.skansen.se/kalender/", ok: true },
  { url: "https://www.junibacken.se/", ok: true },
  { url: "https://www.kulturparkensmaland.se/", ok: false, error: "url_not_accessible" },
  { url: "https://skansen.se/en/x", ok: false, error: "timeout" },
];
const items = [
  { sources: [{ url: "https://skansen.se/evenemang/1" }, { url: "https://skansen.se/evenemang/1b" }] },
  { sources: [{ url: "https://www.skansen.se/x" }] },
  { sources: [{ url: "https://example.org/y" }] },
  {},
];

test("domän: www och versaler tas bort, skräp ger tom sträng", () => {
  assert.equal(hostOf("https://WWW.Skansen.se/a"), "skansen.se");
  assert.equal(hostOf("inte en url"), "");
});

test("källrapport: hämtade med förslag, misslyckade, ej försökta och utan förslag", () => {
  const r = buildSourceReport(log, registry, items);
  assert.deepEqual(r.fetched.map((f) => [f.host, f.items]), [["skansen.se", 2], ["junibacken.se", 0]]);
  assert.deepEqual(r.failed.map((f) => [f.host, f.error]), [["kulturparkensmaland.se", "url_not_accessible"]]);
  assert.deepEqual(r.notTried.map((n) => n.name), ["Biblioteken"]);
  assert.deepEqual(r.noItems.map((n) => n.name), ["Junibacken"]);
});

test("källrapport: tom logg ger bara 'ej försökta'", () => {
  const r = buildSourceReport([], registry, []);
  assert.equal(r.fetched.length + r.failed.length + r.noItems.length, 0);
  assert.equal(r.notTried.length, 4);
});
