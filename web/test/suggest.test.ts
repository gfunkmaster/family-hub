import { test } from "node:test";
import assert from "node:assert/strict";
import { dayPlanFor, mergeSavedDays, rankedSuggestions, runKey, scheduleFor, scheduleToSaved, suggestionsByDay, type RunView } from "../src/lib/suggest.ts";

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

test("rätt körning per plats: idag, annars närmast kommande, annars senast passerade", async () => {
  const { pickRun, pickRunPerPlace } = await import("../src/lib/suggest.ts");
  const r = (id: string, city: string, from: string, to: string, createdAt: string) => ({ id, city, from, to, createdAt });
  const thisWeek = r("sthlm-v46", "stockholm", "2026-11-09", "2026-11-15", "2026-11-06T10:00:00Z");
  const later = r("sthlm-21", "stockholm", "2026-11-21", "2026-11-22", "2026-11-08T10:00:00Z");
  const old = r("sthlm-v44", "stockholm", "2026-10-26", "2026-11-01", "2026-10-20T10:00:00Z");
  const vaxjo = r("vaxjo-07", "vaxjo", "2026-11-07", "2026-11-08", "2026-11-05T10:00:00Z");
  assert.equal(pickRun([later, thisWeek, old], "2026-11-09")?.id, "sthlm-v46", "the run covering today wins over a newer one");
  assert.equal(pickRun([later, old], "2026-11-09")?.id, "sthlm-21", "otherwise the next upcoming");
  assert.equal(pickRun([old, vaxjo], "2026-11-09")?.id, "vaxjo-07", "otherwise the most recently ended");
  const redo = r("sthlm-v46b", "stockholm", "2026-11-09", "2026-11-15", "2026-11-07T10:00:00Z");
  assert.equal(pickRun([thisWeek, redo], "2026-11-10")?.id, "sthlm-v46b", "a tie goes to the newest search");
  assert.equal(pickRun([], "2026-11-09"), null);
  assert.deepEqual(pickRunPerPlace([later, vaxjo, thisWeek], "2026-11-09").map((x) => x.id), ["sthlm-v46", "vaxjo-07"]);
});

test("passerade dagar tas bort, men en helt passerad körning lämnas orörd", async () => {
  const { withoutPastDays, runIsPast } = await import("../src/lib/suggest.ts");
  const wed = withoutPastDays({ ...run, weather: weekdays.map((date) => ({ date, high: 5 })), items: [...run.items, { id: "park", title: "Park" }] }, "2026-11-11");
  assert.deepEqual(wed.dates, ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  assert.deepEqual(wed.weather.map((w) => w.date), ["2026-11-11", "2026-11-12", "2026-11-13"]);
  assert.deepEqual(wed.items.find((i) => i.id === "near")?.dates?.map((d) => d.date), ["2026-11-11", "2026-11-12", "2026-11-13"]);
  assert.ok(wed.items.some((i) => i.id === "park"), "items without dates stay");
  const sat = withoutPastDays(run, "2026-11-14");
  assert.ok(!sat.items.some((i) => i.id === "near"), "items whose every date has passed are dropped");
  const list = rankedSuggestions(wed, profile, city, null, [], { tier: "alla", ageOnly: false });
  assert.ok(list.every((s) => s.date >= "2026-11-11"), "the list view never links to a past day");
  const stray = rankedSuggestions({ ...run, items: [...run.items, { id: "next-month", title: "Julmarknad", dates: [{ date: "2026-12-05", from: "10:00" }] }] }, profile, city, null, [], { tier: "alla", ageOnly: false });
  assert.ok(!stray.some((s) => s.item.id === "next-month"), "an event outside the period is not offered for a day it isn't on");
  assert.equal(withoutPastDays(run, "2026-11-20"), run);
  assert.equal(runIsPast(run, "2026-11-20"), true);
  assert.equal(runIsPast(run, "2026-11-15"), false);
});

test("dagens datum räknas i svensk tid", async () => {
  const { stockholmToday } = await import("../src/lib/suggest.ts");
  assert.equal(stockholmToday(new Date("2026-11-09T23:30:00Z")), "2026-11-10", "00:30 in Stockholm is already the next day");
  assert.equal(stockholmToday(new Date("2026-06-30T21:59:00Z")), "2026-06-30", "summer time, 23:59 in Stockholm");
});

test("schema: veckosummor mot veckobudget, och regn väljer inomhus", () => {
  const sch = scheduleFor(run, profile, city, null, []);
  assert.deepEqual(sch.weeks.map((w) => [w.from, w.week, w.budget]), [["2026-11-09", 46, null]]);
  assert.equal(sch.weeks[0]?.total, sch.total);
  // Blubb kostar 300 kr entré plus resa. Med 100 kr i veckan ryms bara den fria öppna förskolan (med mellandagar).
  const tight = scheduleFor(run, { ...profile, weekBudget: 100 }, city, null, []);
  assert.ok(tight.days.every((d) => d.pick?.item.id !== "far"), "Blubb ryms inte i veckobudgeten");
  assert.ok(tight.days.some((d) => d.overBudget), "en dag där det enda kvarvarande förslaget är för dyrt markeras");
  assert.equal(tight.weeks[0]?.budget, 100);
  assert.ok((tight.weeks[0]?.total ?? 0) <= 100);
  const indoor: RunView = { ...run, weather: [{ date: "2026-11-10", high: 4, low: 1, precipMm: 6 }], items: run.items.map((i) => (i.id === "far" ? { ...i, indoor: true } : i.id === "near" ? { ...i, indoor: false } : i)) };
  const tue = scheduleFor(indoor, profile, city, null, [], 0).days.find((d) => d.date === "2026-11-10");
  assert.equal(tue?.pick?.item.id, "far");
  assert.deepEqual(tue?.why, ["Inomhus: regn väntas"]);
});

test("dagsplan: resan mellan aktiviteterna räknas från den förra, och hem från den sista", () => {
  const p = dayPlanFor(run, { ...profile, naps: [] }, city, { name: "Hemma", lat: 59.3503, lng: 17.9965 }, "2026-11-10", ["near", "far"]);
  const trips = p.blocks.filter((b) => b.kind === "resa");
  assert.deepEqual(trips.map((t) => t.title), ["Resa", "Resa", "Resa tillbaka"]);
  assert.match(trips[1]?.note ?? "", /från Öppna förskolan, uppskattat$/);
  const noCoords: RunView = { ...run, items: run.items.map((i) => (i.id === "far" ? { ...i, lat: undefined, lng: undefined } : i)) };
  const q = dayPlanFor(noCoords, { ...profile, naps: [] }, city, null, "2026-11-10", ["near", "far"]);
  assert.doesNotMatch(q.blocks.filter((b) => b.kind === "resa")[1]?.note ?? "", /från Öppna förskolan/, "utan koordinater gäller sökningens restid hemifrån");
});

test("eget schema: familjens val gäller för sina dagar, resten är automatiskt, och summan följer det som visas", () => {
  const auto = scheduleFor(run, profile, city, null, []);
  assert.ok(auto.days.every((d) => !d.own && d.chosen.length === (d.pick ? 1 : 0)), "utan eget schema är det valda det automatiska");
  assert.deepEqual(scheduleToSaved(auto).map((d) => d.itemIds), auto.days.map((d) => (d.pick ? [d.pick.item.id] : [])));
  const own = [{ date: "2026-11-10", itemIds: ["near", "far"] }, { date: "2026-11-11", itemIds: [] }, { date: "2026-11-12", itemIds: ["far", "borta"] }, { date: "2026-11-09", itemIds: ["far"] }];
  const sch = scheduleFor(run, profile, city, null, [], 2, own);
  const day = (date: string) => sch.days.find((d) => d.date === date);
  assert.deepEqual(day("2026-11-10")?.chosen.map((c) => c.item.id), ["near", "far"], "två förslag samma dag");
  assert.deepEqual(day("2026-11-11")?.chosen, [], "en vald vilodag förblir tom");
  assert.equal(day("2026-11-11")?.own, true);
  assert.deepEqual(day("2026-11-12")?.chosen.map((c) => c.item.id), ["far"], "ett förslag som inte längre finns i körningen faller bort");
  assert.deepEqual(day("2026-11-09")?.chosen, [], "Blubb är stängt på måndagen och visas inte där");
  assert.equal(day("2026-11-13")?.own, false, "en dag utanför det egna schemat är automatisk");
  assert.deepEqual(day("2026-11-13")?.chosen.map((c) => c.item.id), day("2026-11-13")?.pick ? [day("2026-11-13")?.pick?.item.id] : []);
  assert.ok(!day("2026-11-10")?.options.some((o) => ["near", "far"].includes(o.item.id)), "valda förslag erbjuds inte igen");
  assert.ok(!day("2026-11-11")?.options.some((o) => o.item.id === "big-kids"), "det som inte passar åldern erbjuds inte");
  const sum = sch.days.flatMap((d) => d.chosen).reduce((n, c) => n + (c.cost.total ?? 0), 0);
  assert.equal(sch.total, sum);
  assert.equal(sch.weeks[0]?.total, sum);
  const round = scheduleFor(run, profile, city, null, [], 2, scheduleToSaved(sch));
  assert.deepEqual(scheduleToSaved(round), scheduleToSaved(sch), "det som sparas ger samma schema tillbaka");
});

test("eget schema: val som försvunnit ur körningen räknas, och passerade sparade dagar behålls vid ny sparning", () => {
  const sch = scheduleFor(run, profile, city, null, [], 2, [{ date: "2026-11-12", itemIds: ["far", "borta"] }, { date: "2026-11-13", itemIds: ["borta"] }, { date: "2026-11-11", itemIds: [] }]);
  const day = (date: string) => sch.days.find((d) => d.date === date);
  assert.equal(day("2026-11-12")?.dropped, 1);
  assert.equal(day("2026-11-13")?.dropped, 1, "en dag som blev tom för att valet försvann är inte en vald vilodag");
  assert.deepEqual(day("2026-11-13")?.chosen, []);
  assert.equal(day("2026-11-11")?.dropped, 0, "en vald vilodag har inget som försvunnit");
  assert.equal(day("2026-11-10")?.dropped, 0);
  const stored = [{ date: "2026-11-09", itemIds: ["near"] }, { date: "2026-11-10", itemIds: ["far"] }, { date: "2026-11-12", itemIds: ["far"] }];
  const incoming = [{ date: "2026-11-12", itemIds: [] }, { date: "2026-11-11", itemIds: ["near"] }];
  assert.deepEqual(mergeSavedDays(stored, incoming, "2026-11-11"), [{ date: "2026-11-09", itemIds: ["near"] }, { date: "2026-11-10", itemIds: ["far"] }, { date: "2026-11-11", itemIds: ["near"] }, { date: "2026-11-12", itemIds: [] }], "passerade dagar behålls, dagens och kommande ersätts");
  assert.deepEqual(mergeSavedDays(stored, [{ date: "2026-11-13", itemIds: [] }], "2026-11-11").map((d) => d.date), ["2026-11-09", "2026-11-10", "2026-11-13"], "en kommande dag som inte skickas med tas bort");
  assert.deepEqual(mergeSavedDays(null, incoming, "2026-11-11").map((d) => d.date), ["2026-11-11", "2026-11-12"]);
});
