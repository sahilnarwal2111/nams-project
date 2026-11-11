import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTasks, sortTasks, isOverdue, SORT_MODES } from "../src/board.js";

const tasks = [
  { id: "NK-101", title: "Topographic survey, Narwana layout", client: "Jind Infra Developers", priority: "high", status: "done", district: "Jind" },
  { id: "NK-102", title: "Boundary survey, Safidon plot 44", client: "Rohtak Builders", priority: "low", status: "todo", expectedCompletion: "2026-11-20" },
  { id: "NK-110", title: "GIS pipeline upgrade", client: "Internal", priority: "high", status: "inprogress", expectedCompletion: "2026-11-05", department: "PWD B&R" },
  { id: "NK-99", title: "Pond X-section", client: "Village Panchayat", priority: "medium", status: "todo", details: "Bring total station", customerPhone: "+91 90000 11111" },
  { id: "NK-1000", title: "Road design", client: "Haryana PWD", priority: "medium", status: "todo", expectedCompletion: "2026-11-05", createdAt: "2026-11-11T05:00:00.000Z" },
  { id: "NK-1001", title: "Drone survey", client: "MSIL", priority: "high", status: "todo", createdAt: "2026-11-11T06:00:00.000Z" },
];
const ids = (list) => list.map((t) => t.id);

test("filterTasks returns everything for an empty query", () => {
  assert.equal(filterTasks(tasks, ""), tasks);
  assert.equal(filterTasks(tasks, "   "), tasks);
  assert.equal(filterTasks(tasks, undefined), tasks);
});

test("filterTasks matches id, title, client, district, department, phone and details, ignoring case", () => {
  assert.deepEqual(ids(filterTasks(tasks, "nk-110")), ["NK-110"]);
  assert.deepEqual(ids(filterTasks(tasks, "SURVEY")), ["NK-101", "NK-102", "NK-1001"]);
  assert.deepEqual(ids(filterTasks(tasks, "rohtak")), ["NK-102"]);
  assert.deepEqual(ids(filterTasks(tasks, "jind")), ["NK-101"]);
  assert.deepEqual(ids(filterTasks(tasks, "b&r")), ["NK-110"]);
  assert.deepEqual(ids(filterTasks(tasks, "90000")), ["NK-99"]);
  assert.deepEqual(ids(filterTasks(tasks, "total station")), ["NK-99"]);
  assert.deepEqual(filterTasks(tasks, "no such thing"), []);
});

test("filterTasks needs every word, in any order", () => {
  assert.deepEqual(ids(filterTasks(tasks, "survey safidon")), ["NK-102"]);
  assert.deepEqual(ids(filterTasks(tasks, "safidon  survey")), ["NK-102"]);
  assert.deepEqual(filterTasks(tasks, "survey pwd"), []);
});

test("sortTasks by task number is numeric, not alphabetical, and does not mutate", () => {
  const before = ids(tasks);
  assert.deepEqual(ids(sortTasks(tasks, "board")), ["NK-99", "NK-101", "NK-102", "NK-110", "NK-1000", "NK-1001"]);
  assert.deepEqual(ids(sortTasks(tasks, "unknown mode")), ["NK-99", "NK-101", "NK-102", "NK-110", "NK-1000", "NK-1001"]);
  assert.deepEqual(ids(tasks), before);
});

test("sortTasks by due date puts the soonest first and undated work last", () => {
  assert.deepEqual(ids(sortTasks(tasks, "due")), ["NK-110", "NK-1000", "NK-102", "NK-99", "NK-101", "NK-1001"]);
});

test("sortTasks by priority goes high, medium, low", () => {
  assert.deepEqual(ids(sortTasks(tasks, "priority")), ["NK-101", "NK-110", "NK-1001", "NK-99", "NK-1000", "NK-102"]);
});

test("sortTasks newest first uses the creation time, then the task number", () => {
  assert.deepEqual(ids(sortTasks(tasks, "newest")), ["NK-1001", "NK-1000", "NK-110", "NK-102", "NK-101", "NK-99"]);
});

test("every sort mode has a label and keeps all tasks", () => {
  for (const mode of SORT_MODES) {
    assert.ok(mode.label);
    assert.equal(sortTasks(tasks, mode.id).length, tasks.length);
  }
});

test("isOverdue is true only for open work dated before today", () => {
  const today = "2026-11-11";
  assert.equal(isOverdue({ status: "todo", expectedCompletion: "2026-11-10" }, today), true);
  assert.equal(isOverdue({ status: "inprogress", expectedCompletion: "2026-01-01" }, today), true);
  assert.equal(isOverdue({ status: "todo", expectedCompletion: "2026-11-11" }, today), false, "due today is not overdue");
  assert.equal(isOverdue({ status: "todo", expectedCompletion: "2026-11-12" }, today), false);
  assert.equal(isOverdue({ status: "done", expectedCompletion: "2026-01-01" }, today), false);
  assert.equal(isOverdue({ status: "todo", expectedCompletion: null }, today), false);
  assert.equal(isOverdue({ status: "todo" }, today), false);
});
