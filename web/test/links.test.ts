import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarUrl, isClockTime, mapsUrl } from "../src/lib/links.ts";

test("kartlänk: koordinater går före adress", () => {
  assert.equal(mapsUrl({ lat: 59.3245, lng: 18.0912, venue: "Djurgårdsbrunnsvägen 24" }), "https://www.google.com/maps/search/?api=1&query=59.3245,18.0912");
});

test("kartlänk: utan koordinater söks plats och område, utan något blir det ingen länk", () => {
  const u = new URL(mapsUrl({ venue: "Kulturhuset, Sergels torg" }, "Stockholm") ?? "");
  assert.equal(u.searchParams.get("query"), "Kulturhuset, Sergels torg, Stockholm");
  assert.equal(new URL(mapsUrl({ venue: "Huseby Bruk, Grimslöv (22 km söder om Växjö)" }, "Växjö") ?? "").searchParams.get("query"), "Huseby Bruk, Grimslöv, Växjö");
  assert.equal(mapsUrl({}), null);
  assert.equal(mapsUrl({ lat: Number.NaN, lng: 18 }), null);
});

test("kalender: tider i svensk tid, aldrig omräknade till UTC", () => {
  const u = new URL(calendarUrl({ title: "Babyrytmik", date: "2026-11-13", start: "10:15", end: "11:45", location: "Gustaf Vasa kyrka", details: "Ta med filt" }) ?? "");
  assert.equal(u.hostname, "calendar.google.com");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("text"), "Babyrytmik");
  assert.equal(u.searchParams.get("dates"), "20261113T101500/20261113T114500");
  assert.equal(u.searchParams.get("ctz"), "Europe/Stockholm");
  assert.equal(u.searchParams.get("location"), "Gustaf Vasa kyrka");
  assert.equal(u.searchParams.get("details"), "Ta med filt");
});

test("kalender: utan starttid blir det heldag till nästa dag, även över månadsskifte", () => {
  const u = new URL(calendarUrl({ title: "Hagaparken", date: "2026-11-30" }) ?? "");
  assert.equal(u.searchParams.get("dates"), "20261130/20261201");
  assert.equal(u.searchParams.get("location"), null);
});

test("kalender: saknat eller felaktigt slut ger längd eller två timmar, högst till midnatt", () => {
  const dates = (e: Parameters<typeof calendarUrl>[0]) => new URL(calendarUrl(e) ?? "").searchParams.get("dates");
  assert.equal(dates({ title: "x", date: "2026-11-14", start: "10:00", durationMin: 45 }), "20261114T100000/20261114T104500");
  assert.equal(dates({ title: "x", date: "2026-11-14", start: "10:00", end: "09:00" }), "20261114T100000/20261114T120000");
  assert.equal(dates({ title: "x", date: "2026-11-14", start: "23:00" }), "20261114T230000/20261114T235900");
  assert.equal(dates({ title: "x", date: "2026-11-14", start: "9:30", end: "10:15" }), "20261114T093000/20261114T101500", "one-digit hours are valid stored data");
  assert.equal(dates({ title: "x", date: "2026-11-14", start: "24:00" }), "20261114/20261115");
  assert.equal(dates({ title: "x", date: "2026-11-14", start: "fel" }), "20261114/20261115");
  assert.equal(calendarUrl({ title: "x", date: "14 nov" }), null);
});

test("klockslag: 9:30 och 09:30 godtas, 24:00 och tomt inte", () => {
  assert.equal(isClockTime("9:30"), true);
  assert.equal(isClockTime("09:30"), true);
  assert.equal(isClockTime("24:00"), false);
  assert.equal(isClockTime("25:99"), false);
  assert.equal(isClockTime(undefined), false);
});
