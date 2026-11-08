import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchTrip, isoMinutes, readableName, summarizeTrip, TravelError, walkingBeatsTransit } from "../src/lib/travel/resrobot.ts";

const place = (name: string, time: string) => ({ name, time });
const tripJson = {
  Trip: [{
    duration: "PT24M",
    LegList: { Leg: [
      { type: "WALK", duration: "PT8M", dist: 638, Origin: place("59.3293, 18.0686", "09:51:00"), Destination: place("Kungsträdgården", "09:59:00") },
      { type: "JNY", name: "Länstrafik spårvagn 7", direction: "Waldemarsudde", duration: "PT7M", Origin: place("Kungsträdgården", "09:59:00"), Destination: place("Nordiska museet/Vasa", "10:06:00") },
      { type: "WALK", duration: "PT9M", dist: 732, Origin: place("Nordiska museet/Vasa", "10:06:00"), Destination: place("59.3262, 18.1033", "10:15:00") },
    ] },
  }],
};

test("resrobot: ISO-längd blir minuter", () => {
  assert.equal(isoMinutes("PT24M"), 24);
  assert.equal(isoMinutes("PT1H5M"), 65);
  assert.equal(isoMinutes("PT30S"), 1);
  assert.equal(isoMinutes("24"), null);
  assert.equal(isoMinutes(undefined), null);
});

test("resrobot: resan sammanfattas med ben, byten och gångtid", () => {
  const t = summarizeTrip(tripJson);
  assert.ok(t);
  assert.equal(t.totalMin, 24);
  assert.equal(t.transfers, 0);
  assert.equal(t.walkMin, 17);
  assert.equal(t.departs, "09:51");
  assert.equal(t.arrives, "10:15");
  assert.deepEqual(t.legs.map((l) => [l.kind, l.label]), [["walk", "Gå"], ["transit", "spårvagn 7"], ["walk", "Gå"]]);
});

test("resrobot: svar utan resor eller med skräp ger null", () => {
  assert.equal(summarizeTrip({ Trip: [] }), null);
  assert.equal(summarizeTrip(null), null);
  assert.equal(summarizeTrip({ Trip: [{ LegList: { Leg: [{ nope: 1 }] } }] }), null);
});

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const q = { from: { lat: 59.3, lng: 18 }, to: { lat: 59.4, lng: 18.1 } };

test("resrobot: ingen hållplats i närheten är null, fel nyckel är 503", async () => {
  assert.equal(await fetchTrip(q, "k", reply({ errorCode: "SVC_LOC" })), null);
  await assert.rejects(fetchTrip(q, "k", reply({ errorCode: "API_AUTH" })), (e: unknown) => e instanceof TravelError && e.status === 503);
  await assert.rejects(fetchTrip(q, "k", reply({ errorCode: "X" })), (e: unknown) => e instanceof TravelError && e.status === 502);
});

test("resrobot: koordinater, tid och nyckel skickas i anropet", async () => {
  let url = "";
  const f = (async (u: string) => { url = u; return new Response(JSON.stringify(tripJson)); }) as unknown as typeof fetch;
  const t = await fetchTrip({ ...q, date: "2026-11-14", time: "10:00" }, "NYCKEL", f);
  assert.equal(t?.totalMin, 24);
  const p = new URL(url).searchParams;
  assert.equal(p.get("originCoordLat"), "59.3");
  assert.equal(p.get("destCoordLong"), "18.1");
  assert.equal(p.get("date"), "2026-11-14");
  assert.equal(p.get("accessId"), "NYCKEL");
});

test("gå eller åka: nästan bara gång med en kort åktur slår kollektivt", () => {
  const t = summarizeTrip(tripJson);
  assert.ok(t); // 24 min totalt, 17 min gång, 7 min åktur
  assert.equal(walkingBeatsTransit(t, 22), true);   // rakt dit tar 22 min ≤ 24 + 3
  assert.equal(walkingBeatsTransit(t, 31), false);  // för långt att gå med barn
  const short = summarizeTrip({ Trip: [{ duration: "PT18M", LegList: { Leg: [
    { type: "WALK", duration: "PT8M", dist: 664, Origin: place("A", "08:32:00"), Destination: place("Västra Skogen", "08:40:00") },
    { type: "JNY", name: "tunnelbana 10", duration: "PT1M", Origin: place("Västra Skogen", "08:40:00"), Destination: place("Huvudsta", "08:41:00") },
    { type: "WALK", duration: "PT9M", dist: 734, Origin: place("Huvudsta", "08:41:00"), Destination: place("B", "08:50:00") },
  ] } }] });
  assert.ok(short);
  assert.equal(walkingBeatsTransit(short, 17), true);  // 17 min rakt dit mot 18 min med byte
  assert.equal(walkingBeatsTransit(short, 28), false); // 28 > 18 + 8
});

test("läsbart namn ersätter koordinater", () => {
  assert.equal(readableName("59.343600, 17.989800", "Lekparken"), "Lekparken");
  assert.equal(readableName("Huvudsta T-bana", "Lekparken"), "Huvudsta T-bana");
});
