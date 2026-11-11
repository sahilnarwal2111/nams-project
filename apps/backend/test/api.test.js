// API tests. They run against a real Postgres database (DATABASE_URL) that has
// been migrated and seeded — `npm test` does that before invoking node --test.
// Every test that writes data restores what it changed, so the suite can be
// re-run without re-seeding.
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

const get = (path) => fetch(base + path);
const post = (path, body) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const patch = (path, body) =>
  fetch(base + path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("GET /api/health reports ok", async () => {
  const res = await get("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("GET /api/employees returns the seeded team", async () => {
  const res = await get("/api/employees");
  assert.equal(res.status, 200);
  const employees = await res.json();
  assert.ok(employees.length >= 7, "expected at least the 7 seeded employees");
  assert.ok(employees.some((e) => e.id === "e1"));
  for (const e of employees) {
    assert.ok(e.id && e.name && e.role && e.initials, `incomplete employee ${JSON.stringify(e)}`);
  }
});

test("GET /api/tasks returns tasks with values the UI understands", async () => {
  const res = await get("/api/tasks");
  assert.equal(res.status, 200);
  const tasks = await res.json();
  assert.ok(tasks.length > 0);
  for (const t of tasks) {
    assert.ok(["todo", "inprogress", "done"].includes(t.status), `bad status on ${t.id}: ${t.status}`);
    assert.ok(["low", "medium", "high"].includes(t.priority), `bad priority on ${t.id}: ${t.priority}`);
    assert.ok(t.assigneeId, `task ${t.id} has no assignee`);
  }
});

test("GET /api/tasks/:id returns one task", async () => {
  const res = await get("/api/tasks/NK-102");
  assert.equal(res.status, 200);
  const task = await res.json();
  assert.equal(task.id, "NK-102");
  assert.ok(["todo", "inprogress", "done"].includes(task.status));
  assert.ok(["low", "medium", "high"].includes(task.priority));
  assert.ok(task.assigneeId);
});

test("GET /api/tasks/:id returns 404 for an unknown task", async () => {
  const res = await get("/api/tasks/NK-999");
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /not found/);
});

test("PATCH /api/tasks/:id changes the status", async () => {
  const tasks = await (await get("/api/tasks")).json();
  const original = tasks.find((t) => t.id === "NK-102");
  assert.ok(original, "seed task NK-102 missing");
  const next = original.status === "done" ? "todo" : "done";

  const res = await patch("/api/tasks/NK-102", { status: next });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, next);

  const restored = await patch("/api/tasks/NK-102", { status: original.status });
  assert.equal(restored.status, 200);
});

test("PATCH /api/tasks/:id rejects an unknown status", async () => {
  const res = await patch("/api/tasks/NK-102", { status: "blocked" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /status must be one of/);
});

test("PATCH /api/tasks/:id returns 404 for an unknown task", async () => {
  const res = await patch("/api/tasks/NK-999", { status: "done" });
  assert.equal(res.status, 404);
});

test("PATCH /api/tasks/:id edits several fields at once and leaves the rest alone", async () => {
  const original = await (await get("/api/tasks/NK-102")).json();
  const other = original.assigneeId === "e1" ? "e2" : "e1";
  try {
    const res = await patch("/api/tasks/NK-102", {
      title: "  Edited title ",
      client: "Edited client",
      assigneeId: other,
      priority: original.priority === "low" ? "high" : "low",
      id: "NK-999",
      updatedAt: "2000-01-01T00:00:00.000Z",
    });
    assert.equal(res.status, 200);
    const task = await res.json();
    assert.equal(task.id, "NK-102");
    assert.equal(task.title, "Edited title");
    assert.equal(task.client, "Edited client");
    assert.equal(task.assigneeId, other);
    assert.notEqual(task.priority, original.priority);
    assert.equal(task.status, original.status);
    assert.notEqual(new Date(task.updatedAt).getFullYear(), 2000);
  } finally {
    await prisma.task.update({
      where: { id: "NK-102" },
      data: {
        title: original.title,
        client: original.client,
        assigneeId: original.assigneeId,
        priority: original.priority,
        status: original.status,
      },
    });
  }
});

test("PATCH /api/tasks/:id rejects bad bodies without changing the task", async () => {
  const before = await (await get("/api/tasks/NK-102")).json();
  const bad = [
    {},
    { id: "NK-500", updatedAt: "2000-01-01T00:00:00.000Z" },
    { title: "" },
    { title: "   " },
    { client: "" },
    { title: 5 },
    { priority: "urgent" },
    { status: "blocked" },
    { assigneeId: "e999" },
    { assigneeId: "" },
    { title: "Should not stick", priority: "urgent" },
  ];
  for (const body of bad) {
    const res = await patch("/api/tasks/NK-102", body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
    assert.ok((await res.json()).error);
  }
  const after = await (await get("/api/tasks/NK-102")).json();
  assert.deepEqual(after, before);
});

test("PATCH /api/tasks/:id returns 404 for an unknown task with a valid multi-field body", async () => {
  const res = await patch("/api/tasks/NK-999", { title: "x", priority: "low" });
  assert.equal(res.status, 404);
});

const validTask = { title: "Test task", client: "Test client", assigneeId: "e1", priority: "high" };
const taskCount = async () => (await (await get("/api/tasks")).json()).length;

test("POST /api/tasks creates a task with the next NK id and default status", async () => {
  const before = await (await get("/api/tasks")).json();
  const max = Math.max(...before.map((t) => Number(t.id.replace("NK-", ""))));
  let createdId;
  try {
    const res = await post("/api/tasks", validTask);
    assert.equal(res.status, 201);
    const task = await res.json();
    createdId = task.id;
    assert.equal(task.id, `NK-${String(max + 1).padStart(3, "0")}`);
    assert.equal(task.status, "todo");
    assert.equal(task.title, validTask.title);
    assert.equal(task.client, validTask.client);
    assert.equal(task.assigneeId, "e1");
    assert.equal(task.priority, "high");
    assert.equal((await get(`/api/tasks/${task.id}`)).status, 200);
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

test("POST /api/tasks accepts an explicit status", async () => {
  let createdId;
  try {
    const res = await post("/api/tasks", { ...validTask, status: "inprogress" });
    assert.equal(res.status, 201);
    const task = await res.json();
    createdId = task.id;
    assert.equal(task.status, "inprogress");
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

test("POST /api/tasks rejects missing or empty fields", async () => {
  const n = await taskCount();
  for (const field of Object.keys(validTask)) {
    const missing = { ...validTask };
    delete missing[field];
    for (const body of [missing, { ...validTask, [field]: "" }, { ...validTask, [field]: "   " }]) {
      const res = await post("/api/tasks", body);
      assert.equal(res.status, 400, `${field}: ${JSON.stringify(body)}`);
      assert.match((await res.json()).error, new RegExp(field));
    }
  }
  assert.equal(await taskCount(), n, "a rejected request created a task");
});

test("POST /api/tasks rejects bad priority, status and assignee", async () => {
  const n = await taskCount();
  for (const [body, re] of [
    [{ ...validTask, priority: "urgent" }, /priority must be one of/],
    [{ ...validTask, status: "blocked" }, /status must be one of/],
    [{ ...validTask, assigneeId: "e999" }, /assigneeId/],
  ]) {
    const res = await post("/api/tasks", body);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, re);
  }
  assert.equal(await taskCount(), n, "a rejected request created a task");
});

test("DELETE /api/tasks/:id removes a task and returns 204 with no body", async () => {
  let createdId;
  try {
    const created = await (await post("/api/tasks", validTask)).json();
    createdId = created.id;
    const res = await fetch(`${base}/api/tasks/${createdId}`, { method: "DELETE" });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
    assert.equal((await get(`/api/tasks/${createdId}`)).status, 404);
    const list = await (await get("/api/tasks")).json();
    assert.ok(!list.some((t) => t.id === createdId));
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

test("DELETE /api/tasks/:id returns 404 for an unknown task", async () => {
  const n = await taskCount();
  const res = await fetch(`${base}/api/tasks/NK-9999`, { method: "DELETE" });
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /NK-9999/);
  assert.equal(await taskCount(), n);
});

test("GET /api/clients returns receivables with valid statuses", async () => {
  const res = await get("/api/clients");
  assert.equal(res.status, 200);
  const clients = await res.json();
  assert.ok(clients.length >= 6, "expected at least the 6 seeded clients");
  for (const c of clients) {
    assert.ok(["paid", "due-soon", "overdue"].includes(c.status), `bad status on ${c.id}: ${c.status}`);
    assert.equal(typeof c.due, "number");
    assert.ok(!Number.isNaN(Date.parse(c.invoiceDate)), `bad invoiceDate on ${c.id}`);
    assert.ok(!Number.isNaN(Date.parse(c.lastCall)), `bad lastCall on ${c.id}`);
  }
});

test("PATCH /api/clients/:id logs a call by moving lastCall to now", async () => {
  const before = (await (await get("/api/clients")).json()).find((c) => c.id === "c1");
  assert.ok(before, "seed client c1 missing");

  const res = await patch("/api/clients/c1", {});
  assert.equal(res.status, 200);
  const after = await res.json();
  assert.ok(Date.parse(after.lastCall) > Date.parse(before.lastCall), "lastCall did not advance");
  assert.ok(Date.now() - Date.parse(after.lastCall) < 60_000, "lastCall is not close to now");

  await prisma.client.update({ where: { id: "c1" }, data: { lastCall: new Date(before.lastCall) } });
});

test("PATCH /api/clients/:id returns 404 for an unknown client", async () => {
  const res = await patch("/api/clients/c999", {});
  assert.equal(res.status, 404);
});

const validClient = {
  name: "Test Client",
  contact: "Tester",
  phone: "+91 99999 00000",
  due: 12000,
  invoiceDate: "2026-03-05",
  status: "due-soon",
};
const clientCount = () => prisma.client.count();

// POSTs a client and always deletes it afterwards, even if assertions fail.
async function withCreatedClient(body, fn) {
  const res = await post("/api/clients", body);
  const payload = await res.json();
  try {
    await fn(res, payload);
  } finally {
    if (res.status === 201) await prisma.client.deleteMany({ where: { id: payload.id } });
  }
}

test("POST /api/clients creates a client with the next c# id and defaults", async () => {
  const rows = await prisma.client.findMany({ select: { id: true } });
  const max = Math.max(0, ...rows.map((r) => Number(/^c(\d+)$/.exec(r.id)?.[1] ?? 0)));
  const n = await clientCount();
  const t0 = Date.now();

  await withCreatedClient(validClient, async (res, created) => {
    assert.equal(res.status, 201);
    assert.equal(created.id, `c${max + 1}`);
    assert.equal(created.name, "Test Client");
    assert.equal(created.due, 12000);
    assert.equal(created.status, "due-soon");
    assert.equal(created.notes, null);
    assert.equal(created.invoiceDate, "2026-03-05T00:00:00.000Z");
    assert.ok(Date.parse(created.lastCall) >= t0 - 1000 && Date.now() - Date.parse(created.lastCall) < 60_000);
    assert.equal(await clientCount(), n + 1);
  });
  assert.equal(await clientCount(), n);
});

test("POST /api/clients accepts notes, due of 0 and ISO timestamps", async () => {
  const body = { ...validClient, due: 0, notes: "Pay by Friday", invoiceDate: "2026-03-05T10:30:00Z", lastCall: "2026-03-07" };
  await withCreatedClient(body, async (res, created) => {
    assert.equal(res.status, 201);
    assert.equal(created.due, 0);
    assert.equal(created.notes, "Pay by Friday");
    assert.equal(created.invoiceDate, "2026-03-05T10:30:00.000Z");
    assert.equal(created.lastCall, "2026-03-07T00:00:00.000Z");
  });
});

test("POST /api/clients returns 400 for a missing required field", async () => {
  const n = await clientCount();
  for (const field of Object.keys(validClient)) {
    const body = { ...validClient };
    delete body[field];
    await withCreatedClient(body, async (res, payload) => {
      assert.equal(res.status, 400, `missing ${field}`);
      assert.match(payload.error, new RegExp(field));
    });
  }
  assert.equal(await clientCount(), n);
});

test("POST /api/clients returns 400 for invalid values", async () => {
  const n = await clientCount();
  const bad = [
    { status: "late" },
    { due: -1 },
    { due: 10.5 },
    { due: "100" },
    { invoiceDate: "not a date" },
    { invoiceDate: "2026-02-30" },
    { invoiceDate: "05/03/2026" },
    { lastCall: "yesterday" },
    { name: "   " },
    { notes: 5 },
  ];
  for (const override of bad) {
    await withCreatedClient({ ...validClient, ...override }, async (res, payload) => {
      assert.equal(res.status, 400, JSON.stringify(override));
      assert.equal(typeof payload.error, "string");
    });
  }
  assert.equal(await clientCount(), n);
});
