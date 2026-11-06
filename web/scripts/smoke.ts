/**
 * Röktest mot en körande server: hälsa, inloggningsskydd och agentens API från import till klar beställning.
 * Kör: BASE_URL=http://localhost:3000 AGENT_TOKEN=... node scripts/smoke.ts
 */
import assert from "node:assert/strict";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const token = process.env.AGENT_TOKEN ?? "";
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const get = (path: string, headers: Record<string, string> = {}) => fetch(base + path, { headers, redirect: "manual" });
const send = (method: string, path: string, body: unknown, headers: Record<string, string> = auth) => fetch(base + path, { method, headers, body: JSON.stringify(body) });

const run = {
  city: "stockholm", from: "2026-11-09", to: "2026-11-15", kind: "vecka",
  dates: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"],
  origin: { name: "Hemma", lat: 59.3503, lng: 17.9965 }, summary: "Röktest", createdAt: "2026-11-06T14:05:42Z",
  weather: [{ date: "2026-11-12", high: 5, low: 2, precipMm: 3.3 }],
  items: [{ id: "of-huvudsta", title: "Öppna förskolan", kind: "place", lat: 59.3436, lng: 17.9898, dates: [{ date: "2026-11-09", from: "08:30", to: "11:30" }], prices: { adult: 0, child: 0 }, ageFit: { level: "säkert", minMonths: 0 }, tags: ["lek"], verified: true, sources: [{ title: "Kyrkan", url: "https://www.svenskakyrkan.se/solna" }] }],
};

async function main() {
  assert.equal((await get("/api/health")).status, 200, "health");
  const home = await get("/");
  assert.ok([307, 308].includes(home.status) && home.headers.get("location")?.includes("/login"), "pages need login");
  assert.equal((await get("/login")).status, 200, "login page");
  assert.equal((await send("POST", "/api/agent/import", {}, { "content-type": "application/json" })).status, 401, "agent API needs token");
  const bad = await send("PUT", "/api/agent/runs/stockholm-2026-11-09", { ...run, kind: "år" });
  assert.equal(bad.status, 400, "invalid run is refused");

  const imp = await send("POST", "/api/agent/import", {
    profile: { adults: 2, children: [{ id: "c1", name: "Barn", birthdate: "2026-01-27" }], availability: { weekdays: true, weekends: false } },
    cities: { stockholm: { name: "Stockholm", transport: { car: true, transit: true }, maxTravelMin: 45 } },
    runs: { "stockholm-2026-11-09": run },
    requests: [{ id: "req1", city: "stockholm", from: "2026-11-21", to: "2026-11-22", kind: "helg", status: "ny" }],
    ratings: [{ key: "stockholm--of-huvudsta", city: "stockholm", itemId: "of-huvudsta", title: "Öppna förskolan", verdict: "bra", tags: ["lek"] }],
  });
  assert.equal(imp.status, 200, `import: ${await imp.clone().text()}`);

  const state = await (await get("/api/agent/state", auth)).json() as { profile: unknown; requests: { id: string }[]; ratings: unknown[]; runs: { id: string }[] };
  assert.ok(state.profile, "profile stored");
  assert.deepEqual(state.requests.map((r) => r.id), ["req1"]);
  assert.equal(state.ratings.length, 1);
  assert.equal(state.runs[0]?.id, "stockholm-2026-11-09");

  assert.equal((await send("PUT", "/api/agent/runs/stockholm-2026-11-21", { ...run, from: "2026-11-21", to: "2026-11-22", kind: "helg", dates: ["2026-11-21", "2026-11-22"] })).status, 200, "write run");
  assert.equal((await send("PATCH", "/api/agent/requests/req1", { status: "klar", runId: "stockholm-2026-11-21" })).status, 200, "close request");
  const after = await (await get("/api/agent/state", auth)).json() as { requests: unknown[] };
  assert.equal(after.requests.length, 0, "no pending requests left");
  console.log("Röktest OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
