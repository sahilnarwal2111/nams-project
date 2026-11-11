import { test } from "node:test";
import assert from "node:assert/strict";
import {
  taskFromApi,
  tasksFromApi,
  employeeFromApi,
  employeesFromApi,
  statusPatchBody,
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
