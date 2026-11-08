import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAddress, reverseGeocode } from "../src/lib/geo/reverse.ts";

test("adress: gata, område och stad", () => {
  assert.equal(formatAddress({ address: { road: "Storgatan", house_number: "3", suburb: "Södermalm", city: "Stockholm" } }), "Storgatan 3, Södermalm, Stockholm");
  assert.equal(formatAddress({ address: { road: "Storgatan", town: "Ystad" } }), "Storgatan, Ystad");
  assert.equal(formatAddress({ address: { road: "Kungsgatan", suburb: "Umeå", city: "Umeå" } }), "Kungsgatan, Umeå");
});

test("adress: plats utan gata använder närmaste namn, tomt eller skräp ger null", () => {
  assert.equal(formatAddress({ address: { leisure: "Lekplats Tantolunden", city: "Stockholm" } }), "Lekplats Tantolunden, Stockholm");
  assert.equal(formatAddress({ address: {} }), null);
  assert.equal(formatAddress({ error: "Unable to geocode" }), null);
  assert.equal(formatAddress(null), null);
});

test("adress: anropet har egen User-Agent, svenska och koordinaterna", async () => {
  let url = "", ua = "";
  const f = (async (u: string, init: RequestInit) => { url = u; ua = String((init.headers as Record<string, string>)["user-agent"]); return new Response(JSON.stringify({ address: { road: "Storgatan", city: "Ystad" } })); }) as unknown as typeof fetch;
  assert.equal(await reverseGeocode(55.43, 13.82, f), "Storgatan, Ystad");
  const p = new URL(url).searchParams;
  assert.equal(p.get("lat"), "55.43");
  assert.equal(p.get("lon"), "13.82");
  assert.equal(p.get("accept-language"), "sv");
  assert.match(ua, /^family-hub\//);
});

test("adress: fel från tjänsten kastas", async () => {
  await assert.rejects(reverseGeocode(1, 1, (async () => new Response("x", { status: 429 })) as unknown as typeof fetch), /429/);
});
