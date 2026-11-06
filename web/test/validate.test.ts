import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidId, parseCity, parseProfile, parseRating, parseRequest, parseRequestPatch, parseRun } from "../src/lib/validate.ts";

const item = {
  id: "of-huvudsta", title: "Öppna förskolan", kind: "place", lat: 59.34, lng: 17.99,
  dates: [{ date: "2026-11-09", from: "08:30", to: "11:30" }],
  prices: { adult: 0, child: 0, childFreeUnder: null },
  ageFit: { level: "säkert", minMonths: 0, maxMonths: 71 },
  practical: { stroller: "oklart", changing: "ja" },
  sources: [{ title: "Svenska kyrkan", url: "https://www.svenskakyrkan.se/solna" }],
  tags: ["lek"], verified: true,
};
const run = { city: "stockholm", from: "2026-11-09", to: "2026-11-15", kind: "vecka", dates: ["2026-11-09", "2026-11-10"], origin: { name: "Hemma", lat: 59.35, lng: 18 }, summary: "", weather: [{ date: "2026-11-09", high: 5, low: 1, precipMm: 0 }], items: [item] };

test("en giltig körning går igenom", () => {
  const r = parseRun(run);
  assert.equal(r.ok, true, JSON.stringify(r));
  if (r.ok) { assert.equal(r.value.items.length, 1); assert.ok(r.value.createdAt); }
});

test("en körning med fel avvisas med begripliga fel", () => {
  const bad = { ...run, kind: "år", items: [{ ...item, lat: 120, dates: [{ date: "9 nov" }], sources: [{ url: "javascript:alert(1)" }], ageFit: { level: "kanske" } }, { ...item }] };
  const r = parseRun(bad);
  assert.equal(r.ok, false);
  if (!r.ok) {
    const all = r.errors.join("\n");
    for (const part of ["kind", "lat utanför", "dates[0].date", "sources[0].url", "ageFit.level", "dubbla id"]) assert.match(all, new RegExp(part.replace(/[[\]().]/g, "\\$&")), `missing error about ${part}`);
  }
  assert.equal(parseRun({ ...run, to: "2026-11-01" }).ok, false, "to before from");
  assert.equal(parseRun("nej").ok, false);
});

test("beställningar, betyg, profil och städer", () => {
  assert.deepEqual(parseRequestPatch({ status: "klar", runId: "stockholm-2026-11-09" }), { ok: true, value: { status: "klar", runId: "stockholm-2026-11-09" } });
  assert.equal(parseRequestPatch({ status: "kanske" }).ok, false);
  const req = parseRequest({ city: "stockholm", from: "2026-11-21", to: "2026-11-22" });
  assert.equal(req.ok && req.value.kind, "egna", "missing kind defaults to egna");
  assert.equal(parseRating({ key: "stockholm--x", city: "stockholm", itemId: "x", title: "X", verdict: "besokt", stars: 6 }).ok, false);
  assert.equal(parseProfile({ children: [{ birthdate: "2026-01-27" }], naps: [{ from: "09:30", to: "10:30" }] }).ok, true);
  assert.equal(parseProfile({ children: [{ birthdate: "januari" }] }).ok, false);
  assert.equal(parseCity("vaxjo", { name: "Växjö", sources: [{ name: "Kyrkan", url: "https://www.svenskakyrkan.se/vaxjo" }] }).ok, true);
  assert.equal(parseCity("vaxjo", { name: "Växjö", sources: [{ name: "x", url: "ftp://x" }] }).ok, false);
  assert.equal(isValidId("stockholm-2026-11-09"), true);
  assert.equal(isValidId("../etc"), false);
});
