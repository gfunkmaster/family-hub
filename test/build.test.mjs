import { test } from "node:test";
import assert from "node:assert/strict";
import { build, buildLogic } from "../scripts/build.mjs";

test("bygget blir en enda sida utan platshållare och med giltigt skript", () => {
  const html = build();
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.doesNotMatch(html, /\/\*@@[A-Z]+@@\*\//);
  const script = html.split("<script>")[1].split("</script>")[0];
  assert.doesNotMatch(script, /^\s*export\s/m, "no module syntax left in the classic script");
  assert.doesNotMatch(script, /^\s*(interface|type)\s+\w+/m, "no TypeScript left");
  new Function(script); // throws on syntax errors
});

test("logiken går att köra efter att typerna strippats", () => {
  const js = buildLogic("export function add(a: number, b: number): number { return a + b; }\nexport const ONE: number = 1;");
  const fn = new Function(js + "\nreturn add(ONE, 2);");
  assert.equal(fn(), 3);
});
