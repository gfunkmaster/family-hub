import { test } from "node:test";
import assert from "node:assert/strict";
import { forwardGeocode, geocode, namesTown, parseSearch } from "../src/lib/geo/forward.ts";

const hit = [{ lat: "56.8790044", lon: "14.8058522", display_name: "Storgatan 3, Växjö, Kronobergs län, Sverige", address: { road: "Storgatan", house_number: "3", city: "Växjö" } }];
const respond = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("geokodning: första träffen blir koordinater och en kort adress", () => {
  assert.deepEqual(parseSearch(hit, "Storgatan 3, Växjö"), { hit: { lat: 56.879004, lng: 14.805852, label: "Storgatan 3, Växjö" }, ambiguous: false });
  assert.equal(parseSearch([{ lat: "55.43", lon: "13.82", display_name: "Ystad, Skåne län, Sverige" }], "Ystad").hit?.label, "Ystad, Skåne län, Sverige");
  const noTownInShort = [{ lat: "57.1", lon: "14.9", display_name: "Storgatan, Lammhult, Växjö kommun, Sverige", address: { road: "Storgatan", suburb: "Lammhult", municipality: "Växjö kommun" } }];
  assert.match(parseSearch(noTownInShort, "Storgatan Lammhult").hit?.label ?? "", /Växjö kommun/, "etiketten visar alltid orten");
});

test("geokodning: ingen träff eller skräp ger null, aldrig en gissad position", () => {
  for (const bad of [[], null, {}, "x", [{ lat: "abc", lon: "1" }], [{ lat: 56.8, lon: 14.8 }], [{ lat: "91", lon: "14" }], [{ lat: "56", lon: "181" }]]) assert.deepEqual(parseSearch(bad, "x"), { hit: null, ambiguous: false }, JSON.stringify(bad));
});

test("geokodning: en adress som finns på flera orter väljs inte, om inte frågan nämner orten", () => {
  const at = (city: string, lat: string) => ({ lat, lon: "14.8", display_name: `Storgatan 3, ${city}, Sverige`, address: { road: "Storgatan", house_number: "3", city } });
  const many = [at("Växjö", "56.88"), at("Umeå", "63.82"), at("Linköping", "58.41")];
  assert.deepEqual(parseSearch(many, "Storgatan 3"), { hit: null, ambiguous: true });
  assert.deepEqual(parseSearch(many, "Centrum"), { hit: null, ambiguous: true });
  assert.equal(parseSearch(many, "storgatan 3, växjö").hit?.lat, 56.88, "orten i frågan avgör");
  assert.deepEqual(parseSearch(many, "Storgatan 3, Umeå"), { hit: null, ambiguous: true }, "första träffen ligger inte i orten som frågan nämner");
  assert.equal(parseSearch([at("Växjö", "56.88"), at("Växjö", "56.89")], "Storgatan 3").hit?.lat, 56.88, "flera träffar i samma ort är inte tvetydigt");
});

test("geokodning: anropet söker i Sverige, på svenska, med egen User-Agent", async () => {
  let url = "", ua = "";
  const f = (async (u: string, init: RequestInit) => { url = u; ua = String((init.headers as Record<string, string>)["user-agent"]); return new Response(JSON.stringify(hit)); }) as unknown as typeof fetch;
  assert.equal((await forwardGeocode("  Storgatan 3, Växjö ", f)).hit?.lat, 56.879004);
  const p = new URL(url).searchParams;
  assert.equal(new URL(url).pathname, "/search");
  assert.deepEqual([p.get("q"), p.get("countrycodes"), p.get("limit"), p.get("accept-language")], ["Storgatan 3, Växjö", "se", "5", "sv"]);
  assert.match(ua, /^family-hub\//);
  assert.deepEqual(await forwardGeocode("x", f), { hit: null, ambiguous: false }, "för kort fråga anropar inte tjänsten");
  await assert.rejects(forwardGeocode("Ystad", respond("x", 429)), /429/);
});

test("geokodning: cache, och fel från tjänsten ger failed utan att kasta eller cachas", async () => {
  let calls = 0;
  const counting = (async () => { calls++; return new Response(JSON.stringify(hit)); }) as unknown as typeof fetch;
  assert.equal((await geocode("Cachegatan 1", counting, 1000)).hit?.lng, 14.805852);
  assert.equal((await geocode("  cachegatan 1 ", counting, 2000)).hit?.lng, 14.805852);
  assert.equal(calls, 1, "samma fråga inom ett dygn anropar inte igen");
  await geocode("Cachegatan 1", counting, 1000 + 25 * 60 * 60_000);
  assert.equal(calls, 2, "efter ett dygn hämtas den igen");
  assert.deepEqual(await geocode("Felgatan 1", respond("x", 503)), { hit: null, ambiguous: false, failed: true });
  assert.deepEqual(await geocode("Felgatan 1", respond([])), { hit: null, ambiguous: false, failed: false }, "felet cachades inte");
});

test("geokodning: orten måste stå som ett eget ord i frågan, inte inuti ett gatunamn", () => {
  const at = (road: string, city: string, lat: string) => ({ lat, lon: "13.2", display_name: `${road}, ${city}, Sverige`, address: { road, city } });
  assert.deepEqual(parseSearch([at("Lundavägen", "Lund", "55.70"), at("Lundavägen", "Malmö", "55.60"), at("Lundavägen", "Eslöv", "55.84")], "Lundavägen 5"), { hit: null, ambiguous: true });
  assert.deepEqual(parseSearch([at("Fredsgatan", "Ed", "58.91"), at("Fredsgatan", "Umeå", "63.82")], "Fredsgatan 5"), { hit: null, ambiguous: true });
  assert.equal(parseSearch([at("Lundavägen", "Lund", "55.70"), at("Lundavägen", "Malmö", "55.60")], "Lundavägen 5, Lund").hit?.lat, 55.7);
  assert.equal(namesTown("Storgatan 3 Upplands Väsby", "Upplands Väsby"), true, "ort i flera ord");
  assert.equal(namesTown("Väsbygatan 3", "Upplands Väsby"), false);
  assert.equal(namesTown("storgatan 3,växjö", "Växjö"), true);
  assert.equal(namesTown("Storgatan 3", ""), false);
  const kommun = (name: string, q: string) => parseSearch([{ lat: "57.7", lon: "12.9", display_name: `Storgatan, ${name}`, address: { road: "Storgatan", municipality: name } }, { lat: "63.8", lon: "20.2", display_name: "Storgatan, Umeå", address: { road: "Storgatan", city: "Umeå" } }], q);
  assert.equal(kommun("Borås kommun", "Storgatan, Borås").hit?.lat, 57.7, "Borås behåller sitt s");
  assert.equal(kommun("Ystads kommun", "Storgatan, Ystad").hit?.lat, 57.7, "genitiv-s i kommunnamnet");
  assert.equal(kommun("Borås kommun", "Storgatan").ambiguous, true);
});

test("geokodning: kommun räknas som ort utan ordet kommun, och en träff utan ort gör frågan tvetydig", () => {
  const kommun = [{ lat: "57.1", lon: "14.9", display_name: "Storgatan, Lammhult, Växjö kommun, Sverige", address: { road: "Storgatan", municipality: "Växjö kommun" } }, { lat: "63.8", lon: "20.2", display_name: "Storgatan, Umeå", address: { road: "Storgatan", city: "Umeå" } }];
  assert.equal(parseSearch(kommun, "Storgatan, Växjö").hit?.lat, 57.1, "frågan nämner Växjö, träffen ligger i Växjö kommun");
  const noTown = [{ lat: "56.9", lon: "14.8", display_name: "Stationen, Växjö", address: { road: "Stationen", city: "Växjö" } }, { lat: "60.1", lon: "15.0", display_name: "Stationen", address: { road: "Stationen" } }];
  assert.deepEqual(parseSearch(noTown, "Stationen"), { hit: null, ambiguous: true });
});
