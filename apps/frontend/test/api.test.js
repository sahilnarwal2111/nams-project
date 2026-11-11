import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskFromApi,
  tasksFromApi,
  employeeFromApi,
  employeesFromApi,
  statusPatchBody,
  taskToApi,
  taskFromForm,
  nextLocalTaskId,
  dateFromApi,
  instantFromApi,
  localDay,
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

test("localDay formats a date in the local time zone", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 0, 0)), "2026-01-05");
  assert.equal(localDay(new Date(2026, 10, 11, 23, 59)), "2026-11-11");
});

// Regression: these tests run with TZ=Asia/Kolkata. 00:30 IST on 11 Nov is still
// 10 Nov in UTC, and the page used the UTC date, so a reminder logged just after
// midnight showed "1 day ago" and was not counted in "Followed Up Today".
test("instantFromApi gives the local day, not the UTC day", () => {
  const justAfterMidnight = new Date(2026, 10, 11, 0, 30);
  assert.equal(justAfterMidnight.toISOString().slice(0, 10), "2026-11-10", "test needs a zone ahead of UTC");
  assert.equal(instantFromApi(justAfterMidnight.toISOString()), "2026-11-11");
  assert.equal(instantFromApi(justAfterMidnight.toISOString()), localDay(justAfterMidnight));
});

test("instantFromApi passes through short dates and unparseable values", () => {
  assert.equal(instantFromApi("2026-05-12"), "2026-05-12");
  assert.equal(instantFromApi("not a date"), "not a date");
  assert.equal(instantFromApi(null), null);
});

test("clientFromApi keeps the invoice date on its UTC day and the last call on its local day", () => {
  const c = clientFromApi(apiClient);
  assert.equal(c.invoiceDate, "2026-05-12");
  assert.equal(c.lastCall, "2026-07-19");
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
  assert.deepEqual(out.map((c) => c.lastCall), ["2026-07-19", "2026-08-01"]);
});

test("logCallPatchBody is empty", () => {
  assert.deepEqual(logCallPatchBody(), {});
});

const workForm = {
  title: "  Pond survey ",
  client: " Village XYZ Panchayat ",
  customerPhone: " +91 98765 43210 ",
  district: "Jind",
  department: "   ",
  workTypes: ["survey", "drawing"],
  details: "",
  expectedCompletion: "2026-12-15",
  priority: "high",
  assignee: "e6",
};

test("taskFromApi keeps the expected completion on its UTC day", () => {
  const t = taskFromApi({ ...apiTask, expectedCompletion: "2026-12-15T00:00:00.000Z", workTypes: ["survey"] });
  assert.equal(t.expectedCompletion, "2026-12-15");
  assert.deepEqual(t.workTypes, ["survey"]);
  assert.equal(taskFromApi({ ...apiTask, expectedCompletion: null }).expectedCompletion, null);
  assert.equal("expectedCompletion" in taskFromApi(apiTask), false);
});

test("taskToApi trims text, renames assignee and sends blanks as null", () => {
  assert.deepEqual(taskToApi(workForm), {
    title: "Pond survey",
    client: "Village XYZ Panchayat",
    assigneeId: "e6",
    priority: "high",
    customerPhone: "+91 98765 43210",
    district: "Jind",
    department: null,
    workTypes: ["survey", "drawing"],
    details: null,
    expectedCompletion: "2026-12-15",
  });
});

test("taskToApi sends an empty date as null and never sends status or id", () => {
  const body = taskToApi({ ...workForm, expectedCompletion: "", status: "done", id: "NK-1" });
  assert.equal(body.expectedCompletion, null);
  assert.equal("status" in body, false);
  assert.equal("id" in body, false);
});

test("taskFromForm gives the UI shape for mock mode", () => {
  const t = taskFromForm(workForm);
  assert.equal(t.assignee, "e6");
  assert.equal("assigneeId" in t, false);
  assert.equal(t.title, "Pond survey");
  assert.equal(t.department, null);
});

test("nextLocalTaskId continues the NK sequence numerically", () => {
  assert.equal(nextLocalTaskId([]), "NK-001");
  assert.equal(nextLocalTaskId([{ id: "NK-101" }, { id: "NK-126" }, { id: "NK-99" }]), "NK-127");
  assert.equal(nextLocalTaskId([{ id: "NK-999" }, { id: "other" }]), "NK-1000");
});
