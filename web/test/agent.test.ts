import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnthropicProvider, AnthropicError } from "../src/lib/agent/anthropic.ts";
import { budgetState, costUsd, monthStartStockholm } from "../src/lib/agent/cost.ts";
import { buildResearchPrompt, extractJson } from "../src/lib/agent/prompt.ts";

const input = { system: "s", prompt: "p", maxSearches: 5, maxFetches: 3, location: { country: "SE", timezone: "Europe/Stockholm" } };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("anthropic: fortsätter efter pause_turn, summerar förbrukning och skickar verktygen", async () => {
  const calls: { messages: { role: string }[]; tools: { type: string; max_uses: number }[] }[] = [];
  const answers = [
    { stop_reason: "pause_turn", model: "claude-sonnet-5-5", content: [{ type: "server_tool_use", id: "x" }], usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 2 } } },
    { stop_reason: "end_turn", model: "claude-sonnet-5-5", content: [{ type: "text", text: "Klart " }, { type: "text", text: "```json\n{}\n```" }], usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 30, server_tool_use: { web_search_requests: 1, web_fetch_requests: 2 } } },
  ];
  const fetchImpl = (async (_url: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return reply(answers[calls.length - 1]); }) as unknown as typeof fetch;
  const r = await createAnthropicProvider({ apiKey: "k", model: "claude-sonnet-5-5", fetchImpl }).research(input);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1]?.messages.map((m) => m.role), ["user", "assistant"]);
  assert.deepEqual(calls[0]?.tools.map((t) => [t.type, t.max_uses]), [["web_search_20250305", 5], ["web_fetch_20250910", 3]]);
  assert.equal(r.text, "Klart ```json\n{}\n```");
  assert.deepEqual(r.usage, { inputTokens: 300, outputTokens: 60, cacheReadTokens: 30, cacheWriteTokens: 0, webSearches: 3, webFetches: 2 });
});

test("anthropic: fel från API:et blir AnthropicError med status", async () => {
  const fetchImpl = (async () => reply({ error: { message: "invalid x-api-key" } }, 401)) as unknown as typeof fetch;
  await assert.rejects(createAnthropicProvider({ apiKey: "k", model: "m", fetchImpl }).research(input), (e: unknown) => e instanceof AnthropicError && e.status === 401 && /invalid x-api-key/.test(e.message));
});

test("anthropic: slutar efter för många pauser", async () => {
  const fetchImpl = (async () => reply({ stop_reason: "pause_turn", model: "m", content: [] })) as unknown as typeof fetch;
  await assert.rejects(createAnthropicProvider({ apiKey: "k", model: "m", fetchImpl, maxContinuations: 2 }).research(input), /pausades fler än 2/);
});

test("kostnad: tokens och sökningar, daterat modell-id, okänd modell", () => {
  const u = { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 10, webFetches: 4 };
  assert.equal(costUsd(u, "claude-sonnet-5-5"), 2 + 1 + 0.1);
  assert.equal(costUsd(u, "claude-sonnet-5-5-20261001"), 3.1);
  assert.equal(costUsd(u, "deepseek-chat"), null);
});

test("budget: tillåter bara om även en dyr körning ryms", () => {
  assert.equal(budgetState(8.5, 10, 1).allowed, true);
  assert.equal(budgetState(9.2, 10, 1).allowed, false);
  assert.equal(budgetState(0, 0, 1).allowed, false);
  assert.equal(budgetState(9.2, 10, 1).leftUsd, 0.8);
});

test("månadsstart i svensk tid", () => {
  assert.equal(monthStartStockholm(new Date("2026-11-06T12:00:00Z")).toISOString(), "2026-10-31T23:00:00.000Z");
  assert.equal(monthStartStockholm(new Date("2026-07-15T12:00:00Z")).toISOString(), "2026-06-30T22:00:00.000Z");
  assert.equal(monthStartStockholm(new Date("2026-10-31T23:30:00Z")).toISOString(), "2026-10-31T23:00:00.000Z");
});

test("extractJson: sista json-blocket, annars klamrar, annars fel", () => {
  assert.deepEqual(extractJson("utkast ```json\n{\"a\":1}\n``` slutligt ```json\n{\"a\":2}\n```"), { a: 2 });
  assert.deepEqual(extractJson("Här: {\"b\": [1]} klart"), { b: [1] });
  assert.throws(() => extractJson("inget här"), /inget JSON/);
  assert.throws(() => extractJson("```json\n{fel}\n```"), /ogiltig JSON/);
});

test("prompten: plats, radie, barnens ålder, betyg och mat", () => {
  const { system, prompt } = buildResearchPrompt({
    profile: { adults: 2, children: [{ name: "Ella", birthdate: "2026-01-27" }], budgetMax: 400 },
    request: { from: "2026-11-14", to: "2026-11-14", kind: "egna", note: "inomhus", cityName: null, place: { name: "Ystad", lat: 55.4295, lng: 13.82 }, radiusKm: 21 },
    city: null, liked: ["Blubb"], disliked: ["Lekland"], recentlyVisited: [], today: "2026-11-06",
  });
  assert.match(system, /livsmedelsverket/i);
  assert.match(prompt, /den 2026-11-14/);
  assert.match(prompt, /Runt "Ystad", koordinater 55\.42950, 13\.82000, inom ca 21 km/);
  assert.match(prompt, /Ella: 9 månader/);
  assert.match(prompt, /gillat: Blubb/);
  assert.match(prompt, /Ta inte med: Lekland/);
  assert.match(prompt, /"packed"/);
  assert.doesNotMatch(prompt, /\n\n\n/);
});
