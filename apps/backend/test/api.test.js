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

const workDetails = {
  customerPhone: " +91 98765 43210 ",
  district: "Jind",
  department: "PWD B&R",
  workTypes: ["drawing", "survey"],
  details: "Site visit on Monday",
  expectedCompletion: "2026-12-15",
};

test("POST /api/tasks stores the optional work details", async () => {
  let createdId;
  try {
    const res = await post("/api/tasks", { ...validTask, ...workDetails });
    assert.equal(res.status, 201);
    const task = await res.json();
    createdId = task.id;
    assert.equal(task.customerPhone, "+91 98765 43210");
    assert.equal(task.district, "Jind");
    assert.equal(task.department, "PWD B&R");
    assert.deepEqual(task.workTypes, ["survey", "drawing"], "work types come back in a fixed order");
    assert.equal(task.details, "Site visit on Monday");
    assert.equal(task.expectedCompletion, "2026-12-15T00:00:00.000Z");
    assert.deepEqual(await (await get(`/api/tasks/${task.id}`)).json(), task);
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

test("POST /api/tasks leaves the work details empty when they are not sent", async () => {
  let createdId;
  try {
    const task = await (await post("/api/tasks", { ...validTask, district: "  ", details: null })).json();
    createdId = task.id;
    assert.equal(task.customerPhone, null);
    assert.equal(task.district, null);
    assert.equal(task.department, null);
    assert.deepEqual(task.workTypes, []);
    assert.equal(task.details, null);
    assert.equal(task.expectedCompletion, null);
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

const badDetails = [
  { customerPhone: 9876543210 },
  { district: 5 },
  { department: ["PWD"] },
  { details: {} },
  { workTypes: "survey" },
  { workTypes: ["survey", "painting"] },
  { expectedCompletion: "15/12/2026" },
  { expectedCompletion: "2026-02-30" },
  { expectedCompletion: 20261215 },
];

test("POST /api/tasks rejects invalid work details", async () => {
  const n = await taskCount();
  for (const bad of badDetails) {
    const res = await post("/api/tasks", { ...validTask, ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.match((await res.json()).error, new RegExp(Object.keys(bad)[0]));
  }
  assert.equal(await taskCount(), n, "a rejected request created a task");
});

test("PATCH /api/tasks/:id edits and clears the work details", async () => {
  let createdId;
  try {
    const created = await (await post("/api/tasks", { ...validTask, ...workDetails })).json();
    createdId = created.id;

    const res = await patch(`/api/tasks/${created.id}`, {
      district: "Kaithal",
      workTypes: ["printout"],
      expectedCompletion: null,
      details: "",
    });
    assert.equal(res.status, 200);
    const task = await res.json();
    assert.equal(task.district, "Kaithal");
    assert.deepEqual(task.workTypes, ["printout"]);
    assert.equal(task.expectedCompletion, null);
    assert.equal(task.details, null);
    assert.equal(task.customerPhone, "+91 98765 43210", "fields not sent are left alone");
    assert.equal(task.department, "PWD B&R");
    assert.equal(task.title, validTask.title);
    assert.equal(task.status, "todo");
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

test("PATCH /api/tasks/:id rejects invalid work details without changing the task", async () => {
  const before = await (await get("/api/tasks/NK-102")).json();
  for (const bad of badDetails) {
    const res = await patch("/api/tasks/NK-102", { title: "Should not stick", ...bad });
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(await (await get("/api/tasks/NK-102")).json(), before);
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

// Runs fn against seed client c1 and always restores its original row.
async function withRestoredC1(fn) {
  const original = await prisma.client.findUnique({ where: { id: "c1" } });
  assert.ok(original, "seed client c1 missing");
  try {
    await fn(original);
  } finally {
    const { id, ...rest } = original;
    await prisma.client.update({ where: { id }, data: rest });
  }
}

test("PATCH /api/clients/:id edits only the fields sent and leaves lastCall alone", async () => {
  await withRestoredC1(async (original) => {
    const res = await patch("/api/clients/c1", {
      name: "  Renamed  ",
      due: 0,
      status: "paid",
      notes: "edited",
      invoiceDate: "2026-01-02",
      id: "c999",
    });
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.id, "c1");
    assert.equal(c.name, "Renamed");
    assert.equal(c.due, 0);
    assert.equal(c.status, "paid");
    assert.equal(c.notes, "edited");
    assert.equal(c.invoiceDate, "2026-01-02T00:00:00.000Z");
    assert.equal(c.contact, original.contact);
    assert.equal(c.phone, original.phone);
    assert.equal(c.lastCall, original.lastCall.toISOString());
  });
});

test("PATCH /api/clients/:id sets lastCall and clears notes when sent", async () => {
  await withRestoredC1(async () => {
    const res = await patch("/api/clients/c1", { lastCall: "2026-02-03T04:05:00Z", notes: null });
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.equal(c.lastCall, "2026-02-03T04:05:00.000Z");
    assert.equal(c.notes, null);
  });
});

test("PATCH /api/clients/:id rejects invalid fields with 400 and changes nothing", async () => {
  await withRestoredC1(async (original) => {
    const bad = [
      { name: "  " },
      { contact: 5 },
      { phone: "" },
      { due: -1 },
      { due: 1.5 },
      { due: "100" },
      { status: "late" },
      { invoiceDate: "2026-02-30" },
      { invoiceDate: "nope" },
      { lastCall: "nope" },
      { lastCall: null },
      { notes: 7 },
      { name: "Fine", due: -1 },
    ];
    for (const body of bad) {
      const res = await patch("/api/clients/c1", body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(typeof (await res.json()).error, "string");
    }
    assert.deepEqual(await prisma.client.findUnique({ where: { id: "c1" } }), original);
  });
});

test("PATCH /api/clients/:id with no body logs a call", async () => {
  await withRestoredC1(async (original) => {
    const res = await fetch(base + "/api/clients/c1", { method: "PATCH" });
    assert.equal(res.status, 200);
    const c = await res.json();
    assert.ok(Date.parse(c.lastCall) > original.lastCall.getTime());
    assert.equal(c.name, original.name);
  });
});

test("PATCH /api/clients/:id returns 404 for an unknown client even with fields", async () => {
  const res = await patch("/api/clients/c999", { name: "X" });
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

test("DELETE /api/clients/:id removes a client and returns 204 with no body", async () => {
  await withCreatedClient(validClient, async (_res, created) => {
    const res = await fetch(`${base}/api/clients/${created.id}`, { method: "DELETE" });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), "");
    const list = await (await get("/api/clients")).json();
    assert.ok(!list.some((c) => c.id === created.id));
  });
});

test("DELETE /api/clients/:id returns 404 for an unknown client", async () => {
  const n = await clientCount();
  const res = await fetch(`${base}/api/clients/c9999`, { method: "DELETE" });
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /c9999/);
  assert.equal(await clientCount(), n);
});

/* ---- task timestamps --------------------------------------------- */

test("a new task records when it was created and is not completed", async () => {
  let createdId;
  try {
    const t0 = Date.now();
    const task = await (await post("/api/tasks", validTask)).json();
    createdId = task.id;
    assert.ok(Date.parse(task.createdAt) >= t0 - 1000 && Date.parse(task.createdAt) <= Date.now() + 1000);
    assert.equal(task.completedAt, null);
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

test("completedAt is stamped on reaching done, kept while done, and cleared when moved back", async () => {
  let createdId;
  try {
    const task = await (await post("/api/tasks", validTask)).json();
    createdId = task.id;
    const move = async (body) => (await patch(`/api/tasks/${task.id}`, body)).json();

    assert.equal((await move({ status: "inprogress" })).completedAt, null);

    const t0 = Date.now();
    const done = await move({ status: "done" });
    assert.ok(Date.parse(done.completedAt) >= t0 - 1000);
    assert.equal(done.createdAt, task.createdAt, "createdAt never changes");

    const edited = await move({ title: "Edited while done" });
    assert.equal(edited.completedAt, done.completedAt, "an unrelated edit keeps the completion time");
    const again = await move({ status: "done" });
    assert.equal(again.completedAt, done.completedAt, "saving done again keeps the first completion time");

    assert.equal((await move({ status: "todo" })).completedAt, null);
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

test("a task created as done is completed at creation, and clients cannot set the timestamps", async () => {
  let createdId;
  try {
    const res = await post("/api/tasks", { ...validTask, status: "done", createdAt: "2001-01-01", completedAt: "2001-01-02" });
    const task = await res.json();
    createdId = task.id;
    assert.equal(task.completedAt, task.createdAt);
    assert.notEqual(new Date(task.createdAt).getFullYear(), 2001);

    const patched = await (await patch(`/api/tasks/${task.id}`, { title: "x", createdAt: "2001-01-01", completedAt: null })).json();
    assert.equal(patched.createdAt, task.createdAt);
    assert.equal(patched.completedAt, task.completedAt);
  } finally {
    if (createdId) await prisma.task.deleteMany({ where: { id: createdId } });
  }
});

/* ---- payments ---------------------------------------------------- */

const pay = (id, body) => post(`/api/clients/${id}/payments`, body);
const paymentsOf = async (id) => (await get(`/api/clients/${id}/payments`)).json();

test("POST /api/clients/:id/payments records a part payment and lowers the dues", async () => {
  await withCreatedClient({ ...validClient, due: 12000, status: "overdue" }, async (_res, created) => {
    const t0 = Date.now();
    const res = await pay(created.id, { amount: 5000, note: "  Cheque 4412 " });
    assert.equal(res.status, 201);
    const { payment, client } = await res.json();
    assert.equal(payment.clientId, created.id);
    assert.equal(payment.amount, 5000);
    assert.equal(payment.note, "Cheque 4412");
    assert.ok(Date.parse(payment.receivedAt) >= t0 - 1000);
    assert.equal(client.due, 7000);
    assert.equal(client.status, "overdue", "a part payment does not change the status");

    const stored = (await (await get("/api/clients")).json()).find((c) => c.id === created.id);
    assert.equal(stored.due, 7000);
    assert.deepEqual(await paymentsOf(created.id), [payment]);
  });
});

test("POST /api/clients/:id/payments marks the client paid when the dues are cleared", async () => {
  await withCreatedClient({ ...validClient, due: 12000, status: "overdue" }, async (_res, created) => {
    await pay(created.id, { amount: 2000, receivedAt: "2026-10-01" });
    const res = await pay(created.id, { amount: 10000 });
    assert.equal(res.status, 201);
    const { client } = await res.json();
    assert.equal(client.due, 0);
    assert.equal(client.status, "paid");

    const list = await paymentsOf(created.id);
    assert.deepEqual(list.map((p) => p.amount), [10000, 2000], "newest first");
    assert.equal(list[1].receivedAt, "2026-10-01T00:00:00.000Z");
    assert.equal(list[1].note, null);
    assert.equal(list.reduce((sum, p) => sum + p.amount, 0), 12000);
  });
});

test("POST /api/clients/:id/payments rejects bad amounts and overpayment without changing anything", async () => {
  await withCreatedClient({ ...validClient, due: 12000 }, async (_res, created) => {
    for (const body of [
      { amount: 0 },
      { amount: -100 },
      { amount: 10.5 },
      { amount: "5000" },
      {},
      { amount: 12001 },
      { amount: 100, note: 5 },
      { amount: 100, receivedAt: "yesterday" },
    ]) {
      const res = await pay(created.id, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(typeof (await res.json()).error, "string");
    }
    assert.match((await (await pay(created.id, { amount: 12001 })).json()).error, /more than the outstanding 12000/);
    const stored = (await (await get("/api/clients")).json()).find((c) => c.id === created.id);
    assert.equal(stored.due, 12000);
    assert.deepEqual(await paymentsOf(created.id), []);
  });
});

test("two payments arriving together cannot take the dues below zero", async () => {
  await withCreatedClient({ ...validClient, due: 10000 }, async (_res, created) => {
    const results = await Promise.all([pay(created.id, { amount: 7000 }), pay(created.id, { amount: 7000 })]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
    const stored = (await (await get("/api/clients")).json()).find((c) => c.id === created.id);
    assert.equal(stored.due, 3000);
    assert.equal((await paymentsOf(created.id)).length, 1);
  });
});

test("payments endpoints return 404 for an unknown client", async () => {
  assert.equal((await get("/api/clients/c9999/payments")).status, 404);
  const res = await pay("c9999", { amount: 100 });
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /c9999/);
});

test("deleting a client removes its payments", async () => {
  const before = await prisma.payment.count();
  let id;
  await withCreatedClient({ ...validClient, due: 500 }, async (_res, created) => {
    id = created.id;
    await pay(id, { amount: 200 });
    assert.equal(await prisma.payment.count({ where: { clientId: id } }), 1);
    assert.equal((await fetch(`${base}/api/clients/${id}`, { method: "DELETE" })).status, 204);
    assert.equal(await prisma.payment.count({ where: { clientId: id } }), 0);
  });
  assert.equal(await prisma.payment.count(), before);
});

/* ---- staff login ------------------------------------------------- */

import { clearFailedLogins, issueToken, MAX_FAILED_LOGINS, TOKEN_TTL_MS } from "../src/lib/auth.js";

const PASSWORD = "test-office-password";
const authed = (path, token, options = {}) =>
  fetch(base + path, { ...options, headers: { ...options.headers, authorization: `Bearer ${token}` } });
const signIn = async (password) => post("/api/auth/login", { password });

// Switches login on for one test and always switches it back off, because the
// rest of this file expects an open API.
async function withLogin(fn) {
  process.env.APP_PASSWORD = PASSWORD;
  clearFailedLogins();
  try {
    await fn();
  } finally {
    delete process.env.APP_PASSWORD;
    clearFailedLogins();
  }
}

test("with no APP_PASSWORD the API is open and the session says login is not required", async () => {
  assert.equal(process.env.APP_PASSWORD, undefined);
  assert.deepEqual(await (await get("/api/auth/session")).json(), { required: false, authenticated: false });
  assert.equal((await get("/api/tasks")).status, 200);
  assert.equal((await signIn("anything")).status, 400);
});

test("with APP_PASSWORD set, data endpoints need a token but health and session do not", async () => {
  await withLogin(async () => {
    for (const path of ["/api/tasks", "/api/tasks/NK-101", "/api/clients", "/api/employees"]) {
      const res = await get(path);
      assert.equal(res.status, 401, path);
      assert.equal(typeof (await res.json()).error, "string");
    }
    assert.equal((await post("/api/tasks", validTask)).status, 401);
    assert.equal((await patch("/api/tasks/NK-102", { status: "done" })).status, 401);
    assert.equal((await fetch(`${base}/api/clients/c1`, { method: "DELETE" })).status, 401);
    assert.equal((await get("/api/clients/c1/payments")).status, 401);
    assert.equal((await post("/api/clients/c1/payments", { amount: 1 })).status, 401);
    assert.equal((await get("/api/health")).status, 200);
    assert.deepEqual(await (await get("/api/auth/session")).json(), { required: true, authenticated: false });
  });
  assert.equal(await prisma.client.count({ where: { id: "c1" } }), 1, "an unauthenticated delete went through");
});

test("the right password gives a token that opens the API", async () => {
  await withLogin(async () => {
    const res = await signIn(PASSWORD);
    assert.equal(res.status, 200);
    const { token, expiresAt } = await res.json();
    assert.ok(Date.parse(expiresAt) > Date.now() + TOKEN_TTL_MS - 60_000);

    assert.equal((await authed("/api/tasks", token)).status, 200);
    assert.equal((await authed("/api/clients", token)).status, 200);
    assert.deepEqual(await (await authed("/api/auth/session", token)).json(), { required: true, authenticated: true });
  });
});

test("a wrong or missing password is refused", async () => {
  await withLogin(async () => {
    for (const password of ["wrong", "", PASSWORD + " ", PASSWORD.toUpperCase(), undefined, 12345, null]) {
      const res = await signIn(password);
      assert.equal(res.status, 401, JSON.stringify(password));
      assert.equal((await res.json()).token, undefined);
    }
  });
});

test("forged, altered and expired tokens are refused", async () => {
  await withLogin(async () => {
    const { token } = issueToken();
    const [expires, signature] = token.split(".");
    const expired = issueToken(Date.now() - TOKEN_TTL_MS - 1000).token;
    const bad = [
      "",
      "garbage",
      `${Number(expires) + 1000}.${signature}`,
      `${expires}.${signature.slice(0, -2)}xx`,
      `${expires}.`,
      `${expires}.${signature}.extra`,
      expired,
    ];
    for (const t of bad) {
      assert.equal((await authed("/api/tasks", t)).status, 401, t);
    }
    assert.equal((await authed("/api/tasks", token)).status, 200);
    assert.equal((await fetch(`${base}/api/tasks`, { headers: { authorization: token } })).status, 401, "needs the Bearer prefix");
  });
});

test("a token stops working when the password changes", async () => {
  await withLogin(async () => {
    const { token } = await (await signIn(PASSWORD)).json();
    process.env.APP_PASSWORD = "a-new-password";
    assert.equal((await authed("/api/tasks", token)).status, 401);
    process.env.APP_PASSWORD = PASSWORD;
    assert.equal((await authed("/api/tasks", token)).status, 200);
  });
});

test("repeated wrong passwords are locked out, even with the right one afterwards", async () => {
  await withLogin(async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      assert.equal((await signIn("wrong")).status, 401);
    }
    const blocked = await signIn(PASSWORD);
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /Too many/);

    clearFailedLogins();
    assert.equal((await signIn(PASSWORD)).status, 200);
  });
});

// --- Enquiries from the public landing page ---

import { enquiryLimit, MAX_ENQUIRIES_PER_HOUR } from "../src/controllers/enquiries.controller.js";

const del = (path) => fetch(base + path, { method: "DELETE" });
const ENQ_NAME = "Test Enquirer (api.test)";
// Removes what these tests stored and resets the hourly limit between tests.
async function cleanEnquiries() {
  await prisma.enquiry.deleteMany({ where: { name: { startsWith: "Test Enquirer" } } });
  enquiryLimit.reset();
}

test("POST /api/enquiries stores a trimmed enquiry as new and acknowledges without echoing it", async () => {
  await cleanEnquiries();
  try {
    const before = Date.now();
    const res = await post("/api/enquiries", {
      name: `  ${ENQ_NAME}  `,
      phone: " +91 98765-43210 ",
      message: "  Need a plot survey in Safidon  ",
      status: "closed",
      id: 999999,
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { received: true });

    const rows = await prisma.enquiry.findMany({ where: { name: ENQ_NAME } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phone, "+91 98765-43210");
    assert.equal(rows[0].message, "Need a plot survey in Safidon");
    assert.equal(rows[0].status, "new", "the visitor cannot choose the status");
    assert.notEqual(rows[0].id, 999999);
    assert.ok(rows[0].createdAt.getTime() >= before - 5000, "the visitor cannot choose the date");
  } finally {
    await cleanEnquiries();
  }
});

test("POST /api/enquiries accepts a missing or blank message", async () => {
  await cleanEnquiries();
  try {
    assert.equal((await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210" })).status, 201);
    assert.equal((await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210", message: "   " })).status, 201);
    const rows = await prisma.enquiry.findMany({ where: { name: ENQ_NAME } });
    assert.deepEqual(rows.map((r) => r.message), [null, null]);
  } finally {
    await cleanEnquiries();
  }
});

test("POST /api/enquiries rejects bad input with 400 and stores nothing", async () => {
  await cleanEnquiries();
  const count = await prisma.enquiry.count();
  const bad = [
    {},
    { phone: "9876543210" },
    { name: "   ", phone: "9876543210" },
    { name: 42, phone: "9876543210" },
    { name: "Test Enquirer " + "x".repeat(100), phone: "9876543210" },
    { name: ENQ_NAME },
    { name: ENQ_NAME, phone: "12345" },
    { name: ENQ_NAME, phone: "call me maybe" },
    { name: ENQ_NAME, phone: "98765432109876543210" },
    { name: ENQ_NAME, phone: 9876543210 },
    { name: ENQ_NAME, phone: "9876543210", message: 7 },
    { name: ENQ_NAME, phone: "9876543210", message: "x".repeat(1001) },
  ];
  for (const body of bad) {
    const res = await post("/api/enquiries", body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.equal(typeof (await res.json()).error, "string");
  }
  assert.equal(await prisma.enquiry.count(), count);
  // Invalid attempts do not use up the hourly allowance.
  try {
    assert.equal((await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210" })).status, 201);
  } finally {
    await cleanEnquiries();
  }
});

test("POST /api/enquiries quietly drops a submission that fills the hidden field", async () => {
  await cleanEnquiries();
  const res = await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210", website: "http://spam.example" });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { received: true });
  assert.equal(await prisma.enquiry.count({ where: { name: ENQ_NAME } }), 0);
});

test("POST /api/enquiries allows a few per hour from one address, then answers 429", async () => {
  await cleanEnquiries();
  try {
    for (let i = 0; i < MAX_ENQUIRIES_PER_HOUR; i += 1) {
      assert.equal((await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210" })).status, 201);
    }
    const res = await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210" });
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /try again/i);
    assert.equal(await prisma.enquiry.count({ where: { name: ENQ_NAME } }), MAX_ENQUIRIES_PER_HOUR);
  } finally {
    await cleanEnquiries();
  }
});

test("GET, PATCH and DELETE /api/enquiries manage an enquiry", async () => {
  await cleanEnquiries();
  try {
    await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210", message: "first" });
    await post("/api/enquiries", { name: `${ENQ_NAME} 2`, phone: "9876500000" });

    const list = await (await get("/api/enquiries")).json();
    const mine = list.filter((e) => e.name.startsWith("Test Enquirer"));
    assert.deepEqual(mine.map((e) => e.name), [`${ENQ_NAME} 2`, ENQ_NAME], "newest first");
    assert.deepEqual(Object.keys(mine[1]).sort(), ["createdAt", "id", "message", "name", "phone", "status"]);
    const { id } = mine[1];

    const updated = await patch(`/api/enquiries/${id}`, { status: "contacted", name: "ignored" });
    assert.equal(updated.status, 200);
    const body = await updated.json();
    assert.equal(body.status, "contacted");
    assert.equal(body.name, ENQ_NAME, "only the status can change");

    for (const bad of [{}, { status: "done" }, { status: null }, { status: "New" }]) {
      assert.equal((await patch(`/api/enquiries/${id}`, bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal((await prisma.enquiry.findUnique({ where: { id } })).status, "contacted");

    assert.equal((await del(`/api/enquiries/${id}`)).status, 204);
    assert.equal(await prisma.enquiry.findUnique({ where: { id } }), null);
    assert.equal((await del(`/api/enquiries/${id}`)).status, 404);
    assert.equal((await patch(`/api/enquiries/${id}`, { status: "closed" })).status, 404);
    for (const odd of ["abc", "1e3", "-1", "99999999999999999999"]) {
      assert.equal((await patch(`/api/enquiries/${odd}`, { status: "closed" })).status, 404, odd);
      assert.equal((await del(`/api/enquiries/${odd}`)).status, 404, odd);
    }
  } finally {
    await cleanEnquiries();
  }
});

test("with login on, anyone can send an enquiry but only staff can read or change them", async () => {
  await cleanEnquiries();
  try {
    await withLogin(async () => {
      assert.equal((await post("/api/enquiries", { name: ENQ_NAME, phone: "9876543210" })).status, 201);
      const { id } = await prisma.enquiry.findFirst({ where: { name: ENQ_NAME } });

      assert.equal((await get("/api/enquiries")).status, 401);
      assert.equal((await patch(`/api/enquiries/${id}`, { status: "closed" })).status, 401);
      assert.equal((await del(`/api/enquiries/${id}`)).status, 401);
      assert.equal((await prisma.enquiry.findUnique({ where: { id } })).status, "new");

      const { token } = await (await signIn(PASSWORD)).json();
      const list = await authed("/api/enquiries", token);
      assert.equal(list.status, 200);
      assert.ok((await list.json()).some((e) => e.id === id));
      const closed = await authed(`/api/enquiries/${id}`, token, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      assert.equal(closed.status, 200);
      assert.equal((await authed(`/api/enquiries/${id}`, token, { method: "DELETE" })).status, 204);
    });
  } finally {
    await cleanEnquiries();
  }
});
