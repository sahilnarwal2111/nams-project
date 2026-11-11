import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskFromApi,
  tasksFromApi,
  employeeFromApi,
  employeesFromApi,
  statusPatchBody,
  dateFromApi,
  clientFromApi,
  clientsFromApi,
  logCallPatchBody,
} from "../src/api.js";

const apiTask = {
  id: "NK-101",
  title: "Topographic survey",
  client: "Jind Infra",
  assigneeId: "e6",
  status: "done",
  priority: "high",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

test("taskFromApi renames assigneeId to assignee", () => {
  const t = taskFromApi(apiTask);
  assert.equal(t.assignee, "e6");
  assert.equal("assigneeId" in t, false);
  assert.equal(t.id, "NK-101");
  assert.equal(t.status, "done");
  assert.equal(t.priority, "high");
});

test("taskFromApi does not mutate its input", () => {
  const copy = structuredClone(apiTask);
  taskFromApi(apiTask);
  assert.deepEqual(apiTask, copy);
});

test("tasksFromApi converts every task and handles empty lists", () => {
  assert.deepEqual(tasksFromApi([]), []);
  const out = tasksFromApi([apiTask, { ...apiTask, id: "NK-102", assigneeId: "e1" }]);
  assert.deepEqual(out.map((t) => t.assignee), ["e6", "e1"]);
});

test("employeeFromApi keeps only the fields the UI uses", () => {
  const e = employeeFromApi({ id: "e1", name: "Narender Kumar", role: "MD", initials: "NK", createdAt: "x" });
  assert.deepEqual(e, { id: "e1", name: "Narender Kumar", role: "MD", initials: "NK" });
});

test("employeesFromApi maps lists", () => {
  assert.deepEqual(employeesFromApi([]), []);
  assert.equal(employeesFromApi([{ id: "e1", name: "A", role: "R", initials: "A" }]).length, 1);
});

test("statusPatchBody sends only status", () => {
  assert.deepEqual(statusPatchBody("inprogress"), { status: "inprogress" });
});

const apiClient = {
  id: "c1",
  name: "Jind Infra",
  contact: "S",
  phone: "1",
  due: 184000,
  invoiceDate: "2026-05-12T00:00:00.000Z",
  lastCall: "2026-07-18T23:59:59.999Z",
  status: "overdue",
  notes: null,
};

test("dateFromApi converts ISO timestamps to YYYY-MM-DD", () => {
  assert.equal(dateFromApi("2026-05-12T00:00:00.000Z"), "2026-05-12");
  assert.equal(dateFromApi("2026-07-18T23:59:59.999Z"), "2026-07-18");
  assert.equal(dateFromApi("2026-07-18T23:30:00-05:00"), "2026-07-19");
});

test("dateFromApi passes through short dates and unparseable values", () => {
  assert.equal(dateFromApi("2026-05-12"), "2026-05-12");
  assert.equal(dateFromApi("not a date"), "not a date");
  assert.equal(dateFromApi(null), null);
});

test("clientFromApi converts both dates and keeps other fields", () => {
  const c = clientFromApi(apiClient);
  assert.equal(c.invoiceDate, "2026-05-12");
  assert.equal(c.lastCall, "2026-07-18");
  assert.equal(c.due, 184000);
  assert.equal(c.status, "overdue");
  assert.equal(c.notes, null);
});

test("clientFromApi does not mutate its input", () => {
  const copy = structuredClone(apiClient);
  clientFromApi(apiClient);
  assert.deepEqual(apiClient, copy);
});

test("clientsFromApi maps lists", () => {
  assert.deepEqual(clientsFromApi([]), []);
  const out = clientsFromApi([apiClient, { ...apiClient, id: "c2", lastCall: "2026-08-01T10:00:00.000Z" }]);
  assert.deepEqual(out.map((c) => c.lastCall), ["2026-07-18", "2026-08-01"]);
});

test("logCallPatchBody is empty", () => {
  assert.deepEqual(logCallPatchBody(), {});
});
