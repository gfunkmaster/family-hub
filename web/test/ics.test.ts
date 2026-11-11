import { test } from "node:test";
import assert from "node:assert/strict";
import type { Item } from "@family-hub/logic";
import { hasIcsEvents, icsEscape, icsFold, scheduleIcs } from "../src/lib/ics.ts";

const now = new Date("2026-11-11T08:30:00Z");
const opts = { runId: "run1", now };
const event: Item = { id: "e1", title: "Babyrytmik", kind: "event", venue: "Gustaf Vasa kyrka", dates: [{ date: "2026-11-13", from: "10:15", to: "11:45" }] };
const place: Item = { id: "p1", title: "Hagaparken", kind: "place" };
const unfold = (s: string) => s.replace(/\r\n /g, "");
const lines = (s: string) => s.split("\r\n");

test("ics: timad händelse i svensk tid med TZID", () => {
  const ics = scheduleIcs([{ date: "2026-11-13", chosen: [{ item: event }] }], opts) ?? "";
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.includes("TZID:Europe/Stockholm"));
  assert.ok(ics.includes("DTSTART;TZID=Europe/Stockholm:20261113T101500"));
  assert.ok(ics.includes("DTEND;TZID=Europe/Stockholm:20261113T114500"));
  assert.ok(ics.includes("DTSTAMP:20261111T083000Z"));
  assert.ok(ics.includes("SUMMARY:Babyrytmik"));
  assert.ok(ics.includes("LOCATION:Gustaf Vasa kyrka"));
  assert.ok(ics.trimEnd().endsWith("END:VCALENDAR"));
});

test("ics: heldagshändelse slutar nästa dag, även över månadsskifte", () => {
  const ics = scheduleIcs([{ date: "2026-11-30", chosen: [{ item: place }] }], opts) ?? "";
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261130"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20261201"));
  assert.ok(!ics.includes("LOCATION:"));
});

test("ics: escapar backslash, komma, semikolon och radbrytning", () => {
  assert.equal(icsEscape("a\\b, c; d\ne\r\nf"), "a\\\\b\\, c\\; d\\ne\\nf");
  const item: Item = { id: "x", title: "Lek, fika; mer\\", note: "rad ett\nrad två" };
  const ics = unfold(scheduleIcs([{ date: "2026-11-14", chosen: [{ item }] }], opts) ?? "");
  assert.ok(ics.includes("SUMMARY:Lek\\, fika\\; mer\\\\\r\n"));
  assert.ok(ics.includes("DESCRIPTION:rad ett\\nrad två\r\n"));
});

test("ics: rader viks vid 75 oktetter utan att dela tecken, och går att veckla ut", () => {
  const long = "Åäö påsk ".repeat(40).trim();
  const folded = icsFold(`SUMMARY:${long}`);
  assert.ok(folded.length > 1);
  for (const l of folded) assert.ok(new TextEncoder().encode(l).length <= 75, l);
  assert.equal(folded.join("\r\n").replace(/\r\n /g, ""), `SUMMARY:${long}`);
  const emoji = icsFold("X:" + "😀".repeat(50));
  for (const l of emoji) assert.ok(new TextEncoder().encode(l).length <= 75);
  assert.equal(emoji.join("").replaceAll(" ", ""), "X:" + "😀".repeat(50));
  const ics = scheduleIcs([{ date: "2026-11-14", chosen: [{ item: { id: "l", title: long } }] }], opts) ?? "";
  for (const l of lines(ics)) assert.ok(new TextEncoder().encode(l).length <= 75);
  assert.ok(unfold(ics).includes(`SUMMARY:${long}\r\n`));
});

test("ics: vilodag ger ingen händelse", () => {
  const ics = scheduleIcs([{ date: "2026-11-13", chosen: [{ item: event }] }, { date: "2026-11-14", chosen: [] }], opts) ?? "";
  assert.equal(ics.split("BEGIN:VEVENT").length - 1, 1);
  assert.ok(!ics.includes("20261114"));
});

test("ics: tomt schema ger null", () => {
  assert.equal(scheduleIcs([], opts), null);
  assert.equal(scheduleIcs([{ date: "2026-11-14", chosen: [] }], opts), null);
  assert.equal(scheduleIcs([{ date: "fel", chosen: [{ item: place }] }], opts), null);
  assert.equal(hasIcsEvents([{ date: "2026-11-14", chosen: [] }]), false);
  assert.equal(hasIcsEvents([{ date: "2026-11-14", chosen: [{ item: place }] }]), true);
});

test("ics: CRLF överallt och unika UID", () => {
  const ics = scheduleIcs([
    { date: "2026-11-13", chosen: [{ item: event }, { item: place }] },
    { date: "2026-11-14", chosen: [{ item: place }] },
  ], opts) ?? "";
  assert.ok(!/(^|[^\r])\n/.test(ics));
  assert.ok(ics.endsWith("\r\n"));
  const uids = lines(ics).filter((l) => l.startsWith("UID:"));
  assert.equal(uids.length, 3);
  assert.equal(new Set(uids).size, 3);
  assert.ok(uids.includes("UID:run1-2026-11-13-e1@family-hub"));
});
