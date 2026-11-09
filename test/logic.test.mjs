import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../packages/logic/src/index.ts";

const profile = { adults: 2, budgetMax: 400, children: [{ name: "D", birthdate: "2026-02-01" }], naps: [{ from: "09:30", to: "10:30" }, { from: "13:00", to: "14:30" }] };
const vaxjo = { transport: { car: true, transit: true }, maxTravelMin: 40, carCostPerKm: 2.5, transitTicket: { adult: 40 } };
const huseby = { id: "huseby", title: "Huseby", prices: { adult: 120, childFreeUnder: 12 },
  dates: [{ date: "2026-11-07", from: "10:00", to: "20:00", adult: 120 }, { date: "2026-11-08", from: "10:00", to: "18:00", adult: 80 }],
  travel: { car: { km: 22, min: 25 }, transit: { min: 35, note: "Buss 123" } }, ageFit: { level: "troligt", minMonths: 0 } };
const lek = { id: "leo", title: "Leo", prices: { adult: 0, child: null }, travel: { car: { km: 3, min: 7 } }, ageFit: { level: "oklart", minMonths: 12 } };

test("ålder i månader och livsfas", () => {
  // Age
  assert.equal(L.ageMonths("2026-02-01", "2026-11-07"), 9);
  assert.equal(L.ageMonths("2026-02-10", "2026-11-07"), 8);
  assert.equal(L.stageFor(9), "Krypålder");
  assert.equal(L.stageFor(30), "2 år");
});

test("entrékostnad och resekostnad för hela familjen", () => {
  // Huseby: Saturday 120/adult, Sunday 80 via per-date override; children <12 free; car 22 km
  assert.equal(L.entryCost(huseby, profile, "2026-11-07").total, 240);
  assert.equal(L.entryCost(huseby, profile, "2026-11-08").total, 160);
  assert.equal(L.travelCost(huseby, profile, vaxjo, "car", "2026-11-07").total, 110); // 22*2*2.5
  const fc = L.familyCost(huseby, profile, vaxjo, "2026-11-07");
  assert.equal(fc.mode, "car");
  assert.equal(fc.total, 350);
  assert.equal(L.tierFor(fc.entry), "under300");
});

test("okända priser gissas aldrig", () => {
  // Unknown prices stay unknown, never guessed
  const le = L.entryCost(lek, profile, "2026-11-07");
  assert.equal(le.total, null);
  assert.deepEqual(le.unknown, ["barnpris"]);
  assert.equal(L.tierFor(le.total), "okänt");
});

test("åldersmatchning är konservativ", () => {
  // Age fit: 9-month-old below minMonths 12 => passar ej
  assert.equal(L.ageFitFor(lek, profile.children, "2026-11-07").level, "passar ej");
  assert.equal(L.ageFitFor(huseby, profile.children, "2026-11-07").level, "troligt");
});

test("val av färdsätt", () => {
  // Transport not available in city => that mode is not chosen
  const noCar = { ...vaxjo, transport: { car: false, transit: true } };
  assert.equal(L.travelFor(huseby, noCar).mode, "transit");
  // Short walk wins
  const museum = { travel: { walk: { min: 5 }, car: { km: 1, min: 3 } } };
  assert.equal(L.travelFor(museum, vaxjo).mode, "walk");
});

test("betyg påverkar rangordningen", () => {
  // Ratings shift score
  const ctx = { profile, city: vaxjo, cityId: "vaxjo", date: "2026-11-07", ratings: {} };
  const base = L.scoreItem(huseby, ctx);
  const disliked = L.scoreItem(huseby, { ...ctx, ratings: { [L.ratingKey("vaxjo", huseby)]: { verdict: "nej" } } });
  assert.ok(disliked < base);
  assert.ok(L.scoreItem(lek, ctx) < base, "unsuitable age ranks below");
  // Tag weights
  const w = L.tagWeightsFrom([{ verdict: "bra", tags: ["natur"] }, { verdict: "nej", tags: ["trängsel"] }]);
  assert.equal(w.natur, 1); assert.equal(w["trängsel"], -1);
});

test("dagsplanen respekterar sovtider och öppettider", () => {
  // Day plan respects naps: nothing overlaps a nap block
  const items = [
    { ...huseby, title: "Huseby", durationMin: 120, _travelMin: 25 },
    { id: "m", title: "Museum", dates: [{ date: "2026-11-07", from: "11:00", to: "16:00" }], durationMin: 60, _travelMin: 5 }
  ];
  const plan = L.autoPlan(items, profile, "2026-11-07");
  const naps = plan.filter(b => b.kind === "vila");
  const acts = plan.filter(b => b.kind === "aktivitet");
  assert.equal(acts.length, 2, JSON.stringify(plan));
  for (const a of acts) for (const n of naps) {
    const as = L.toMin(a.time), ae = L.toMin(a.endTime), ns = L.toMin(n.time), ne = L.toMin(n.endTime);
    assert.ok(ae <= ns || as >= ne, `activity ${a.title} ${a.time}-${a.endTime} overlaps nap ${n.time}-${n.endTime}`);
  }
  for (const a of acts) {
    const d = items.find(i => i.title === a.title).dates.find(x => x.date === "2026-11-07");
    assert.ok(L.toMin(a.time) >= L.toMin(d.from) && L.toMin(a.endTime) <= L.toMin(d.to), "within opening hours");
  }
  assert.ok(plan.some(b => b.kind === "mat" || /lunch/i.test(b.title)), "lunch included");
  // Naps keep their full length
  for (const n of naps) assert.ok(profile.naps.some(p => p.from === n.time && p.to === n.endTime), `nap shortened: ${n.time}-${n.endTime}`);
  // Chronological
  for (let i = 1; i < plan.length; i++) assert.ok(L.toMin(plan[i].time) >= L.toMin(plan[i - 1].time));
});

test("schemaläggningshjälpare", () => {
  // Scheduling helpers
  const run = L.nextThursdayRun(new Date(2026, 10, 6, 12, 0)); // Fri 6 Nov
  assert.equal(run.getDay(), 4); assert.equal(run.getDate(), 12); assert.equal(run.getHours(), 18);
  assert.deepEqual(L.upcomingWeekends(new Date(2026, 10, 6), 2), [["2026-11-07", "2026-11-08"], ["2026-11-14", "2026-11-15"]]);
  assert.deepEqual(L.upcomingWeekends(new Date(2026, 10, 8), 1), [["2026-11-07", "2026-11-08"]]); // on Sunday keep current weekend
});

test("koordinater klistrade från kartappar", () => {
  // Coordinates parsing (Google Maps copy format and Swedish decimal comma)
  assert.deepEqual(L.parseCoords("56.8777, 14.8091"), { lat: 56.8777, lng: 14.8091 });
  assert.deepEqual(L.parseCoords("56,8777 14,8091"), { lat: 56.8777, lng: 14.8091 });
  assert.deepEqual(L.parseCoords("56.8777,14.8091"), { lat: 56.8777, lng: 14.8091 });
  assert.equal(L.parseCoords("Storgatan 1"), null);
  assert.equal(L.parseCoords("123, 14"), null);
});

test("restid räknas från vald plats", () => {
  // Distance: Växjö station -> Huseby Bruk is ~16 km straight line
  const station = { lat: 56.8777, lng: 14.8091 }, husebyPt = { lat: 56.778672, lng: 14.584738 };
  const km = L.haversineKm(station, husebyPt);
  assert.ok(km > 15 && km < 18, "haversine " + km);
  // Estimates from a chosen origin override the run's centre-based values
  const home = { name: "Hemma", lat: 56.8600, lng: 14.8300 };
  const husebyWithPos = { ...huseby, lat: husebyPt.lat, lng: husebyPt.lng };
  const est = L.estimateTravel(home, husebyWithPos);
  assert.ok(!est.walk, "no walking 20+ km");
  assert.ok(est.car.km > 20 && est.car.km < 26, "road km " + est.car.km);
  assert.ok(est.car.min > 20 && est.car.min < 40, "car min " + est.car.min);
  const tfHome = L.travelFor(husebyWithPos, vaxjo, home);
  assert.equal(tfHome.estimated, true);
  assert.equal(tfHome.basis, "från Hemma");
  assert.equal(tfHome.mode, "car");
  const fcHome = L.familyCost(husebyWithPos, profile, vaxjo, "2026-11-07", home);
  assert.equal(fcHome.travel, Math.round(est.car.km * 2 * 2.5));
  // Close places become walks
  const nearby = { lat: 56.8610, lng: 14.8310 };
  assert.equal(L.travelFor(nearby, vaxjo, home).mode, "walk");
  // Without item position, fall back to the run's own travel values
  const tfNoPos = L.travelFor(huseby, vaxjo, home);
  assert.equal(tfNoPos.estimated, false);
  assert.equal(tfNoPos.min, 25);
});

test("perioder, lediga dagar och schema", () => {
  // Periods
  assert.deepEqual(L.datesBetween("2026-11-28", "2026-12-02"), ["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  const fri = new Date(2026, 10, 6, 12);
  const weeks = L.periodOptions(fri, "vecka");
  assert.deepEqual(weeks[0], { from: "2026-11-06", to: "2026-11-08" }); // rest of this week
  assert.deepEqual(weeks[1], { from: "2026-11-09", to: "2026-11-15" }); // Mon-Sun
  assert.equal(L.isoWeek("2026-11-09"), 46);
  const months = L.periodOptions(fri, "manad");
  assert.deepEqual(months[0], { from: "2026-11-06", to: "2026-11-30" });
  assert.deepEqual(months[1], { from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(months[2], { from: "2027-01-01", to: "2027-01-31" }); // year rollover
  // Availability: weekends only by default; parental leave adds weekdays until leaveUntil
  const wk = L.datesBetween("2026-11-09", "2026-11-15");
  assert.deepEqual(L.activeDays(wk, { availability: { weekdays: false, weekends: true } }), ["2026-11-14", "2026-11-15"]);
  assert.equal(L.activeDays(wk, { availability: { weekdays: true, weekends: true } }).length, 7);
  assert.deepEqual(L.activeDays(wk, { availability: { weekdays: true, weekends: false }, leaveUntil: "2026-11-11" }), ["2026-11-09", "2026-11-10", "2026-11-11"]);
  // Schedule: one per day, best first, no repeat within 2 days, unsuitable never picked
  const mk = (id, days, score) => ({ id, title: id, _s: score, dates: days.map(d => ({ date: d, from: "10:00", to: "12:00" })) });
  const babysang = mk("babysang", ["2026-11-10", "2026-11-17"], 5);
  const park = mk("park", wk, 2);
  const museum2 = mk("museum", wk, 3);
  const bad = mk("lekland", wk, -6);
  const sched = L.schedulePeriod([babysang, park, museum2, bad], wk, (it) => it._s, { gap: 2 });
  assert.equal(sched.length, 7);
  assert.equal(sched.find(x => x.date === "2026-11-10").pick.id, "babysang");
  assert.ok(sched.every(x => !x.pick || x.pick.id !== "lekland"));
  const ids = sched.map(x => x.pick && x.pick.id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j <= i + 2 && j < ids.length; j++) assert.notEqual(ids[i], ids[j], `repeat ${ids[i]} on ${i},${j}`);
});

test("bara http(s)-länkar släpps igenom", () => {
  // URL safety
  assert.equal(L.safeUrl("javascript:alert(1)"), null);
  assert.equal(L.safeUrl("https://husebybruk.se"), "https://husebybruk.se/");
});

test("nederbörd visas med rätt enhet", () => {
  assert.equal(L.fmtPrecip({ date: "2026-11-12", precip: 10 }), "10 %");
  assert.equal(L.fmtPrecip({ date: "2026-11-12", precip: 10 }, true), "10 % risk för nederbörd");
  assert.equal(L.fmtPrecip({ date: "2026-11-12", precipMm: 3.3 }), "3,3 mm");
  assert.equal(L.fmtPrecip({ date: "2026-11-12", precipMm: 0, precip: 40 }), "0 mm", "mm wins when both are given");
  assert.equal(L.fmtPrecip({ date: "2026-11-15", precip: null }), "");
  assert.equal(L.svNum(-0.3), "-0,3");
});

test("mat nära aktiviteten och matlådor efter ålder", () => {
  const blubb = { id: "blubb", lat: 59.3328, lng: 18.118 };
  const food = [
    { id: "far", title: "Långt bort", lat: 59.40, lng: 18.0 },
    { id: "cafe", title: "Café vid museet", lat: 59.3330, lng: 18.1175, near: ["blubb"], highChair: "ja", microwave: "ja" },
    { id: "nopos", title: "Saknar position", near: ["blubb"] },
    { id: "other", title: "Utan koppling eller position" },
  ];
  const near = L.nearestFood(food, blubb, 3);
  assert.deepEqual(near.map((f) => f.id), ["cafe", "far", "nopos"]);
  assert.equal(near[0].distanceKm, 0);
  assert.equal(near[2].distanceKm, null);
  const packed = [
    { id: "puré", title: "Rotfruktspuré", fromMonths: 6, toMonths: 12, ingredients: ["Morot", "Potatis"], steps: ["Koka"], sources: [{ url: "https://www.livsmedelsverket.se/" }] },
    { id: "pasta", title: "Pastasallad", fromMonths: 12, ingredients: ["Pasta", "morot"], steps: ["Koka"], sources: [{ url: "https://www.livsmedelsverket.se/" }] },
  ];
  assert.deepEqual(L.packedFor(packed, 9).map((p) => p.id), ["puré"]);
  assert.deepEqual(L.packedFor(packed, 14).map((p) => p.id), ["pasta"]);
  assert.deepEqual(L.packingList(packed), ["Morot", "Potatis", "Pasta"]);
  assert.equal(L.radiusKmForMinutes(30), 13);
});

test("dagsplanen får lunch även när en aktivitet täcker lunchtiden", () => {
  const items = [{ id: "a", title: "Lång utflykt", dates: [{ date: "2026-11-10", from: "10:30", to: "16:00" }], durationMin: 150 }];
  const plan = L.autoPlan(items, { naps: [] }, "2026-11-10");
  const lunch = plan.find(b => b.kind === "mat");
  assert.ok(lunch, JSON.stringify(plan));
  assert.equal(lunch.time, "13:00");
  for (const b of plan) if (b !== lunch && b.kind !== "info") assert.ok(L.toMin(lunch.time) >= L.toMin(b.endTime) || L.toMin(lunch.endTime) <= L.toMin(b.time), "lunch overlaps " + b.title);
});

test("kläder efter väder: temperaturtrappa, regn, lager och bebis", () => {
  assert.equal(L.clothingFor(null, 9), null);
  assert.equal(L.clothingFor({ date: "2026-11-09" }, 9), null); // ingen temperatur: vi gissar inte
  assert.match(L.clothingFor({ date: "d", high: 25, low: 15 }).headline, /Varmt/);
  assert.match(L.clothingFor({ date: "d", high: 17, low: 12 }).headline, /Milt/);
  assert.match(L.clothingFor({ date: "d", high: 10, low: 6 }).headline, /Svalt/);
  assert.match(L.clothingFor({ date: "d", high: 5, low: 2 }).headline, /Kallt/);
  assert.match(L.clothingFor({ date: "d", high: -3, low: -9 }).headline, /Mycket kallt/);
  const rain = L.clothingFor({ date: "d", high: 5, low: 2, precip: 70 }).items.join(" ");
  assert.match(rain, /regnjacka/i);
  assert.doesNotMatch(L.clothingFor({ date: "d", high: 5, low: 2, precip: 10 }).items.join(" "), /regn/i);
  assert.match(L.clothingFor({ date: "d", high: 5, low: 2, precip: 35 }).items.join(" "), /skurar/);
  assert.match(L.clothingFor({ date: "d", high: 5, low: 2, precipMm: 2 }).items.join(" "), /regnjacka/i);
  assert.match(L.clothingFor({ date: "d", high: 15, low: 5 }).items.join(" "), /lager som går att ta av/);
  assert.match(L.clothingFor({ date: "d", high: 5, low: 2 }, 9).items.join(" "), /Bebis i vagn/);
  assert.doesNotMatch(L.clothingFor({ date: "d", high: 5, low: 2 }, 30).items.join(" "), /Bebis/);
  assert.match(L.clothingFor({ date: "d", high: 5 }).headline, /Kallt/); // bara högsta känd
});

test("dagsplanen: ett evenemang med fast tid flyttas inte för en tupplur", () => {
  const prof = { naps: [{ from: "09:30", to: "10:30" }, { from: "13:00", to: "14:30" }] };
  const baby = { id: "bk", title: "Babykyrka", kind: "event", dates: [{ date: "2026-11-13", from: "10:15", to: "11:45" }], _travelMin: 12 };
  const plan = L.autoPlan([baby], prof, "2026-11-13");
  const act = plan.find((b) => b.kind === "aktivitet");
  assert.equal(act.time, "10:15", JSON.stringify(plan));
  assert.equal(act.endTime, "11:45", "not shortened");
  const nap = plan.find((b) => b.kind === "vila");
  assert.deepEqual([nap.time, nap.endTime], ["09:30", "10:03"], "nap ends at departure");
  assert.match(nap.note, /sova vidare i vagnen/);
  const trip = plan.find((b) => b.kind === "resa");
  assert.deepEqual([trip.time, trip.endTime], ["10:03", "10:15"]);

  // A nap that falls inside the event does not cut it short
  const mid = { ...baby, dates: [{ date: "2026-11-13", from: "12:00", to: "14:00" }], _travelMin: 0 };
  const p2 = L.autoPlan([mid], { naps: [{ from: "13:00", to: "14:00" }] }, "2026-11-13");
  const a2 = p2.find((b) => b.kind === "aktivitet");
  assert.deepEqual([a2.time, a2.endTime], ["12:00", "13:30"], JSON.stringify(p2));
  assert.match(a2.note, /Tupplur under evenemanget/);
  const rest = p2.find((b) => b.kind === "vila");
  assert.deepEqual([rest.time, rest.endTime], ["13:30", "14:00"], "the part of the nap after the event is kept");

  // A place (not an event) keeps the old behaviour: full nap first
  const place = { ...baby, kind: "place" };
  const p3 = L.autoPlan([place], prof, "2026-11-13");
  assert.equal(p3.find((b) => b.kind === "vila").endTime, "10:30");
});

test("dagsplanen: fasta evenemang, tupplurar och lunch krockar aldrig", () => {
  const ev = (id, from, to, extra = {}) => ({ id, title: id, kind: "event", dates: [{ date: "2026-11-13", from, to }], ...extra });
  const check = (plan, label) => {
    for (const b of plan) assert.ok(L.toMin(b.endTime) >= L.toMin(b.time), `${label}: block ends before it starts ${JSON.stringify(b)}`);
    const real = plan.filter((b) => b.kind !== "info" && b.time !== b.endTime);
    for (let i = 1; i < real.length; i++) assert.ok(L.toMin(real[i].time) >= L.toMin(real[i - 1].endTime), `${label}: overlap ${JSON.stringify(real[i - 1])} / ${JSON.stringify(real[i])}`);
  };
  const at = (plan, id) => { const b = plan.find((x) => x.itemId === id); return b && [b.time, b.endTime]; };

  // Two naps inside a long event, then a later event: no block going backwards, no lunch inside the event
  const p1 = L.autoPlan([ev("Long", "10:00", "15:00", { durationMin: 300 }), ev("Late", "16:00", "17:00", { durationMin: 60 })], { naps: [{ from: "11:00", to: "11:30" }, { from: "13:00", to: "14:00" }] }, "2026-11-13");
  check(p1, "two naps"); assert.deepEqual(at(p1, "Long"), ["10:00", "15:00"]); assert.deepEqual(at(p1, "Late"), ["16:00", "17:00"]);

  // Lunch does not push a fixed event; it comes after instead
  const p2 = L.autoPlan([ev("Evt", "12:00", "13:00", { durationMin: 60, _travelMin: 10 })], { naps: [{ from: "11:00", to: "12:30" }] }, "2026-11-13");
  check(p2, "lunch"); assert.deepEqual(at(p2, "Evt"), ["12:00", "13:00"]);
  assert.ok(L.toMin(p2.find((b) => /lunch/i.test(b.title)).time) >= L.toMin("13:00"), JSON.stringify(p2));

  // Two fixed events with a nap between them
  const p3 = L.autoPlan([ev("A", "10:00", "11:00", { durationMin: 60 }), ev("B", "12:00", "13:00", { durationMin: 60, _travelMin: 30 })], { naps: [{ from: "11:00", to: "12:00" }] }, "2026-11-13");
  check(p3, "two events"); assert.deepEqual(at(p3, "A"), ["10:00", "11:00"]); assert.deepEqual(at(p3, "B"), ["12:00", "13:00"]);

  // "Tupplur + lunch" does not swallow a fixed event
  const place = { id: "P", title: "P", kind: "place", dates: [{ date: "2026-11-13", from: "09:00", to: "11:40" }], durationMin: 160 };
  const p4 = L.autoPlan([place, ev("E", "12:00", "13:00", { durationMin: 60 })], { naps: [{ from: "12:10", to: "13:00" }] }, "2026-11-13");
  check(p4, "nap+lunch"); assert.deepEqual(at(p4, "E"), ["12:00", "13:00"]);
});
