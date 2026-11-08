import { test } from "node:test";
import assert from "node:assert/strict";
import { dayPlanFor, rankedSuggestions, runKey, scheduleFor, suggestionsByDay, type RunView } from "../src/lib/suggest.ts";

const profile = { adults: 2, children: [{ birthdate: "2026-01-27" }], availability: { weekdays: true, weekends: false } };
const city = { id: "stockholm", name: "Stockholm", transport: { car: true, transit: true }, maxTravelMin: 45, carCostPerKm: 2.5, transitTicket: { adult: 43 }, childFreeTransitUnder: 12 };
const weekdays = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];
const run: RunView = {
  id: "stockholm-2026-11-09", city: "stockholm", cityId: "stockholm", label: "Stockholm", place: null, food: [], packed: [], fetched: [], from: "2026-11-09", to: "2026-11-15", kind: "vecka",
  dates: [...weekdays, "2026-11-14", "2026-11-15"], summary: "", createdAt: "2026-11-06T14:05:42Z", weather: [], origin: null,
  items: [
    { id: "near", title: "Öppna förskolan", lat: 59.3436, lng: 17.9898, dates: weekdays.map((date) => ({ date, from: "08:30", to: "11:30" })), prices: { adult: 0, child: 0 }, ageFit: { level: "säkert", minMonths: 0 }, travel: { car: { km: 1.5, min: 5 } }, tags: ["lek"] },
    { id: "far", title: "Blubb", lat: 59.3328, lng: 18.118, dates: weekdays.slice(1).map((date) => ({ date, from: "10:00", to: "17:00" })), prices: { adult: 150, child: 0, childFreeUnder: 19 }, ageFit: { level: "säkert", minMonths: 0 }, travel: { car: { km: 9, min: 18 } }, tags: ["museum"] },
    { id: "big-kids", title: "Lekland", lat: 59.3, lng: 18.0, dates: weekdays.map((date) => ({ date, from: "09:00", to: "19:00" })), prices: { adult: 0, child: null }, ageFit: { level: "oklart", minMonths: 12 }, travel: { car: { km: 3, min: 8 } } },
  ],
};

test("GPS-position räknar om restid och kostnad", () => {
  const home = { name: "här", lat: 59.3503, lng: 17.9965 };
  const withHome = rankedSuggestions(run, profile, city, home, [], { tier: "alla", ageOnly: false });
  const near = withHome.find((s) => s.item.id === "near");
  assert.equal(near?.travel?.mode, "walk");
  assert.equal(near?.travel?.estimated, true);
  const fromRun = rankedSuggestions(run, profile, city, null, [], { tier: "alla", ageOnly: false }).find((s) => s.item.id === "near");
  assert.equal(fromRun?.travel?.mode, "car", "without origin the run's own travel is used");
});

test("filter och betyg", () => {
  const ageOnly = rankedSuggestions(run, profile, city, null, [], { tier: "alla", ageOnly: true });
  assert.ok(!ageOnly.some((s) => s.item.id === "big-kids"), "too young for the indoor playground");
  const free = rankedSuggestions(run, profile, city, null, [], { tier: "gratis", ageOnly: false });
  assert.deepEqual(free.map((s) => s.item.id).sort(), ["near"], "unknown child price is not free");
  const disliked = rankedSuggestions(run, profile, city, null, [{ key: "stockholm--near", city: "stockholm", itemId: "near", title: "x", verdict: "nej", tags: ["lek"] }], { tier: "alla", ageOnly: false });
  assert.equal(disliked.find((s) => s.item.id === "near")?.verdict, "nej");
  assert.notEqual(disliked[0]?.item.id, "near", "a disliked suggestion drops");
});

test("dag för dag visar bara lediga dagar", () => {
  const days = suggestionsByDay(run, profile, city, null, [], { tier: "alla", ageOnly: false });
  assert.deepEqual(days.map((d) => d.date), weekdays, "weekends are not free in this profile");
  assert.equal(days[0]?.top.some((s) => s.item.id === "far"), false, "Blubb is closed on Monday");
});

test("plats utan sparad stad får rimliga standardvärden", async () => {
  const { cityFor } = await import("../src/lib/suggest.ts");
  const c = cityFor({ city: "plats-hagaparken", cityId: null, label: "Hagaparken", place: { name: "Hagaparken", radiusKm: 13 } }, [city]);
  assert.equal(c.name, "Hagaparken");
  assert.equal(c.carCostPerKm, null, "unknown car cost stays unknown");
  assert.equal(c.maxTravelMin, 29);
  assert.equal(cityFor({ city: "stockholm", cityId: "stockholm", label: "Stockholm", place: null }, [city]), city);
});

test("dagsplan: måltiden får matlådor för yngsta barnet och matställen nära aktiviteten", () => {
  const src = { url: "https://www.livsmedelsverket.se/x" };
  const r: RunView = {
    ...run,
    food: [
      { id: "kafe-nara", title: "Kafé Nära", lat: 59.3437, lng: 17.99, highChair: "ja", sources: [src] },
      { id: "kafe-langt", title: "Kafé Långt", lat: 59.40, lng: 18.2, sources: [src] },
    ],
    packed: [
      { id: "gröt", title: "Gröt", fromMonths: 6, ingredients: ["havregryn", "vatten"], steps: ["koka"], sources: [src] },
      { id: "macka", title: "Macka", fromMonths: 12, ingredients: ["bröd"], steps: ["bred"], sources: [src] },
    ],
  };
  const p = dayPlanFor(r, { ...profile, naps: [] }, city, null, "2026-11-10", ["near", "far", "saknas"]);
  assert.deepEqual(p.missing, ["saknas"]);
  assert.equal(p.youngestMonths, 9);
  const meal = p.blocks.find((b) => b.meal)?.meal;
  assert.ok(meal, "en måltid i planen");
  assert.deepEqual(meal.packed.map((x) => x.id), ["gröt"]);
  assert.equal(meal.near[0]?.id, "kafe-nara");
});

test("runKey: stad, annars plats", () => {
  assert.equal(runKey("vaxjo", null, "x"), "vaxjo");
  assert.equal(runKey(null, { name: "Ystad C" }, "x"), "plats-ystad-c");
});

test("schema: en aktivitet per ledig dag, ingen upprepning inom två dagar och inget för stora barn", () => {
  const sch = scheduleFor(run, profile, city, null, []);
  assert.deepEqual(sch.days.map((d) => d.date), weekdays, "bara lediga dagar");
  assert.equal(sch.freeDays, 5);
  const ids = sch.days.map((d) => d.pick?.item.id ?? null);
  assert.ok(!ids.includes("big-kids"), "Lekland passar inte åldern");
  ids.forEach((id, i) => { if (id) assert.ok(![ids[i + 1], ids[i + 2]].includes(id), `${id} upprepas för tätt`); });
  assert.equal(sch.days[0]?.pick?.item.id, "near", "Blubb är stängt på måndagen");
  const noFree = scheduleFor(run, { ...profile, availability: { weekdays: false, weekends: false } }, city, null, []);
  assert.equal(noFree.freeDays, 0);
  assert.deepEqual(noFree.days, []);
});

test("schema: kostnaden summeras och okända priser markeras", () => {
  const sch = scheduleFor(run, profile, city, null, []);
  const known = sch.days.flatMap((d) => (d.pick?.cost.total != null ? [d.pick.cost.total] : []));
  assert.equal(sch.total, known.reduce((a, b) => a + b, 0));
  assert.equal(sch.unknownCost, sch.days.some((d) => d.pick && d.pick.cost.total == null));
});
