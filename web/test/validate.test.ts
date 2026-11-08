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

test("körning runt en plats med mat och matlådor", () => {
  const place = { name: "Hagaparken", lat: 59.36, lng: 18.038, radiusKm: 10 };
  const food = [{ id: "cafe", title: "Café", lat: 59.359, lng: 18.04, near: ["of-huvudsta"], highChair: "ja", sources: [{ url: "https://example.se/cafe" }] }];
  const packed = [{ id: "pure", title: "Rotfruktspuré", fromMonths: 6, ingredients: ["Morot"], steps: ["Koka"], sources: [{ url: "https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/barn-och-ungdomar/spadbarn" }] }];
  const ok = parseRun({ ...run, city: undefined, place, food, packed });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  if (ok.ok) { assert.equal(ok.value.city, null); assert.equal(ok.value.food.length, 1); assert.equal(ok.value.packed.length, 1); }

  const noWhere = parseRun({ ...run, city: undefined });
  assert.equal(noWhere.ok, false, "needs a city or a place");
  const badNear = parseRun({ ...run, food: [{ ...food[0], near: ["finns-inte"] }] });
  assert.equal(badNear.ok, false, "food must point at items in the run");
  const noSource = parseRun({ ...run, food: [{ ...food[0], sources: [] }] });
  assert.equal(noSource.ok, false, "food needs a source");
  const notLivsmedelsverket = parseRun({ ...run, packed: [{ ...packed[0], sources: [{ url: "https://example.se/recept" }] }] });
  assert.equal(notLivsmedelsverket.ok, false);
  if (!notLivsmedelsverket.ok) assert.match(notLivsmedelsverket.errors.join("\n"), /livsmedelsverket\.se/);
  assert.equal(parseRun({ ...run, packed: [{ ...packed[0], sources: [{ url: "https://livsmedelsverket.se.example.com/x" }] }] }).ok, false, "look-alike domain is refused");
});

test("beställning runt en plats", () => {
  const r = parseRequest({ place: { name: "Här", lat: 59.35, lng: 18 }, radiusKm: 13, mode: "direkt", from: "2026-11-09", to: "2026-11-09", kind: "egna" });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (r.ok) { assert.equal(r.value.city, null); assert.equal(r.value.mode, "direkt"); assert.equal(r.value.radiusKm, 13); }
  assert.equal(parseRequestPatch({ status: "pågår" }).ok, true);
  assert.equal(parseRequestPatch({ status: "fel" }).ok, true);
});

test("profil från Familj-sidan: rensas och kontrolleras", () => {
  const r = parseProfile({
    adults: 2, budgetMax: 400, extra: "tas bort",
    children: [{ id: "c1", name: " Lavica ", birthdate: "2026-02-01", approx: true }],
    naps: [{ from: "13:00", to: "14:30" }, { from: "09:30", to: "10:30" }],
    interests: ["Natur", "natur", " lek "], avoid: [],
    places: [{ id: "hem", name: "Hemma", address: "Armégatan 11, Solna", city: "stockholm", lat: 59.36, lng: 18.0 }, { id: "vx", address: "Växjö" }],
    availability: { weekdays: true }, leaveUntil: "", autoRun: "vecka", homeCity: "stockholm",
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal("extra" in r.value, false);
  assert.equal(r.value.children?.[0]?.name, "Lavica");
  assert.deepEqual(r.value.naps?.map((n) => n.from), ["09:30", "13:00"]);
  assert.deepEqual(r.value.interests, ["natur", "lek"]);
  assert.deepEqual(r.value.availability, { weekdays: true, weekends: true });
  assert.equal(r.value.leaveUntil, null);
  assert.equal(r.value.places?.[1]?.lat, undefined);
});

test("profil: fel som Familj-sidan kan skicka avvisas", () => {
  const bad = (p: object) => { const r = parseProfile(p); return r.ok ? [] : r.errors; };
  assert.match(bad({ adults: 0 }).join(), /adults/);
  assert.match(bad({ budgetMax: -5 }).join(), /budgetMax/);
  assert.match(bad({ naps: [{ from: "14:00", to: "13:00" }] }).join(), /efter from/);
  assert.match(bad({ naps: [{ from: "25:00", to: "26:00" }] }).join(), /HH:MM/);
  assert.match(bad({ places: [{ id: "a", name: "A", lat: 59 }] }).join(), /både lat och lng/);
  assert.match(bad({ places: [{ id: "a", name: "A", lat: 99, lng: 18 }] }).join(), /giltiga koordinater/);
  assert.match(bad({ places: [{ id: "a" }] }).join(), /namn eller en adress/);
  assert.match(bad({ places: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }).join(), /dubbla id/);
  assert.match(bad({ autoRun: "dag" }).join(), /autoRun/);
});
