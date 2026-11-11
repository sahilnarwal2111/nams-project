import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KIND_FILTERS, kindLabel, actorFilters, activityQuery, dayOf, dayLabel, timeLabel, groupByDay,
  valueLabel, changeRows, deviceLabel,
} from "../src/activity.js";

const TEAM = [{ id: "e4", name: "Rajesh Kumar" }, { id: "e6", name: "Ankit" }];

test("activityQuery sends only the filters that are set", () => {
  assert.equal(activityQuery(), "");
  assert.equal(activityQuery({ actor: "", kind: "" }), "");
  assert.equal(activityQuery({ actor: "e6" }), "?actor=e6");
  assert.equal(activityQuery({ actor: "office", kind: "task", before: 120 }), "?actor=office&type=task&before=120");
  assert.equal(activityQuery({ kind: "payment", limit: 100 }), "?type=payment&limit=100");
});

test("actorFilters lists everyone, each person, then the shared sign-ins", () => {
  assert.deepEqual(actorFilters(TEAM).map((f) => f.id), ["", "e4", "e6", "admin", "office", "public", "unknown"]);
  assert.equal(actorFilters(TEAM)[2].label, "Ankit");
  assert.equal(actorFilters()[0].label, "Everyone");
});

test("every kind filter the API accepts has a tag for its entries", () => {
  for (const { id } of KIND_FILTERS.slice(1)) assert.notEqual(kindLabel(`${id}.anything`), "Other", id);
  assert.equal(kindLabel("task.moved"), "Work");
  assert.equal(kindLabel("session.sign_in_failed"), "Sign-in");
  assert.equal(kindLabel("mystery.thing"), "Other");
});

test("times are shown in the office's time zone", () => {
  // 20:15 UTC on the 10th is 01:45 on the 11th in India.
  assert.equal(dayOf("2026-11-10T20:15:00.000Z"), "2026-11-11");
  assert.equal(timeLabel("2026-11-10T20:15:00.000Z"), "1:45 am");
  assert.equal(timeLabel("2026-11-11T06:30:00.000Z"), "12:00 pm");
  assert.equal(timeLabel("2026-11-11T18:30:00.000Z"), "12:00 am");
  assert.equal(timeLabel("2026-11-11T12:12:00.000Z"), "5:42 pm");
  assert.equal(dayLabel("2026-11-11"), "11 Nov 2026");
  assert.equal(dayLabel("2026-01-05"), "5 Jan 2026");
});

test("groupByDay keeps newest first and splits at local midnight", () => {
  const entries = [
    { id: 4, at: "2026-11-11T06:00:00.000Z" },
    { id: 3, at: "2026-11-10T19:00:00.000Z" }, // 00:30 on the 11th in India
    { id: 2, at: "2026-11-10T18:00:00.000Z" }, // 23:30 on the 10th
    { id: 1, at: "2026-11-09T06:00:00.000Z" },
  ];
  assert.deepEqual(
    groupByDay(entries).map((g) => [g.day, g.entries.map((e) => e.id)]),
    [["2026-11-11", [4, 3]], ["2026-11-10", [2]], ["2026-11-09", [1]]]
  );
  assert.deepEqual(groupByDay([]), []);
});

test("valueLabel shows logged values the way the rest of the site does", () => {
  assert.equal(valueLabel("title", null), "—");
  assert.equal(valueLabel("workTypes", []), "—");
  assert.equal(valueLabel("due", 125000), "₹1,25,000");
  assert.equal(valueLabel("due", 0), "₹0");
  assert.equal(valueLabel("status", "inprogress"), "In Progress");
  assert.equal(valueLabel("status", "due-soon"), "Due soon");
  assert.equal(valueLabel("status", "contacted"), "Contacted");
  assert.equal(valueLabel("priority", "high"), "High");
  assert.equal(valueLabel("assigneeId", "e6", TEAM), "Ankit");
  assert.equal(valueLabel("assigneeId", "e99", TEAM), "e99");
  assert.equal(valueLabel("workTypes", ["survey", "drawing"]), "survey, drawing");
  // A calendar date is read by its UTC day, a moment by the local clock.
  assert.equal(valueLabel("invoiceDate", "2026-03-05T00:00:00.000Z"), "5 Mar 2026");
  assert.equal(valueLabel("completedAt", "2026-11-10T20:15:00.000Z"), "11 Nov 2026, 1:45 am");
  assert.equal(
    valueLabel("payments", [
      { id: 1, amount: 4000, receivedAt: "2026-11-11T06:00:00.000Z", note: "Cheque" },
      { id: 2, amount: 6000, receivedAt: "2026-11-12T06:00:00.000Z", note: null },
    ]),
    "₹4,000 on 11 Nov 2026 (Cheque); ₹6,000 on 12 Nov 2026"
  );
});

test("changeRows gives a labelled before and after for each changed field, in a steady order", () => {
  const entry = { changes: { district: { from: null, to: "Jind" }, assigneeId: { from: "e6", to: "e4" }, status: { from: "todo", to: "done" }, somethingNew: { from: 1, to: 2 } } };
  assert.deepEqual(changeRows(entry, TEAM), [
    { field: "status", label: "Status", from: "To Do", to: "Completed" },
    { field: "assigneeId", label: "Assigned to", from: "Ankit", to: "Rajesh Kumar" },
    { field: "district", label: "District", from: "—", to: "Jind" },
    { field: "somethingNew", label: "somethingNew", from: "1", to: "2" },
  ]);
  assert.deepEqual(changeRows({ changes: null }), []);
});

test("deviceLabel names the browser and device", () => {
  assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"), "Chrome on Windows");
  assert.equal(deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"), "Chrome on Android");
  assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.equal(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"), "Edge on Mac");
  assert.equal(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0"), "Firefox on Linux");
  assert.equal(deviceLabel("curl/8.7.1"), "curl/8.7.1");
  assert.equal(deviceLabel(null), "Unknown device");
});
