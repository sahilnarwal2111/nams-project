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
// The part of a session reply that says who is asking. people and methods are
// covered by their own tests.
const who = async (res) => {
  const { required, authenticated, role, employeeId, name } = await res.json();
  return { required, authenticated, role, employeeId, name };
};


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
  assert.deepEqual(await who(await get("/api/auth/session")), { required: false, authenticated: false, role: "admin", employeeId: null, name: null });
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
    assert.deepEqual(await who(await get("/api/auth/session")), { required: true, authenticated: false, role: null, employeeId: null, name: null });
  });
  assert.equal(await prisma.client.count({ where: { id: "c1" } }), 1, "an unauthenticated delete went through");
});

test("the right password gives a token that opens the API", async () => {
  await withLogin(async () => {
    const res = await signIn(PASSWORD);
    assert.equal(res.status, 200);
    const { token, expiresAt, role } = await res.json();
    assert.equal(role, "staff", "the office password signs in as staff");
    assert.ok(Date.parse(expiresAt) > Date.now() + TOKEN_TTL_MS - 60_000);

    assert.equal((await authed("/api/tasks", token)).status, 200);
    assert.equal((await authed("/api/clients", token)).status, 200);
    assert.deepEqual(await who(await authed("/api/auth/session", token)), { required: true, authenticated: true, role: "staff", employeeId: null, name: null });
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
    const { token } = issueToken("staff");
    const [role, expires, signature] = token.split(".");
    assert.equal(role, "staff");
    const expired = issueToken("staff", Date.now() - TOKEN_TTL_MS - 1000).token;
    const bad = [
      "",
      "garbage",
      `staff.${Number(expires) + 1000}.${signature}`,
      `staff.${expires}.${signature.slice(0, -2)}xx`,
      `staff.${expires}.`,
      `staff.${expires}.${signature}.extra`,
      `${expires}.${signature}`,
      `admin.${expires}.${signature}`,
      `owner.${expires}.${signature}`,
      `__proto__.${expires}.${signature}`,
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

// --- Roles: staff see who has paid, only an admin sees amounts ---

const ADMIN_PASSWORD = "test-admin-password";
const jsonBody = (method, body) => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// Login on with both passwords; hands the test a token for each role.
async function withRoles(fn) {
  await withLogin(async () => {
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    try {
      const staff = await (await signIn(PASSWORD)).json();
      const admin = await (await signIn(ADMIN_PASSWORD)).json();
      await fn({ staff: staff.token, admin: admin.token, staffLogin: staff, adminLogin: admin });
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });
}

test("each password signs in with its own role, and the session reports it", async () => {
  await withRoles(async ({ staff, admin, staffLogin, adminLogin }) => {
    assert.equal(staffLogin.role, "staff");
    assert.equal(adminLogin.role, "admin");
    assert.deepEqual(await who(await authed("/api/auth/session", staff)), { required: true, authenticated: true, role: "staff", employeeId: null, name: null });
    assert.deepEqual(await who(await authed("/api/auth/session", admin)), { required: true, authenticated: true, role: "admin", employeeId: null, name: null });
    assert.deepEqual(await who(await get("/api/auth/session")), { required: true, authenticated: false, role: null, employeeId: null, name: null });
  });
});

test("staff get the client list without amounts; an admin gets them", async () => {
  await withRoles(async ({ staff, admin }) => {
    const forStaff = await (await authed("/api/clients", staff)).json();
    assert.equal(forStaff.length, 6);
    for (const c of forStaff) {
      assert.equal("due" in c, false, `${c.id} must not carry the amount`);
      assert.ok(["paid", "due-soon", "overdue"].includes(c.status));
      assert.ok(c.name && c.phone && c.lastCall);
    }
    const forAdmin = await (await authed("/api/clients", admin)).json();
    assert.equal(forAdmin.find((c) => c.id === "c1").due, 184000);
  });
});

test("staff can log a reminder call and the reply still has no amount", async () => {
  const before = await prisma.client.findUnique({ where: { id: "c2" } });
  try {
    await withRoles(async ({ staff }) => {
      const res = await authed("/api/clients/c2", staff, jsonBody("PATCH", {}));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal("due" in body, false);
      assert.ok(Date.parse(body.lastCall) > before.lastCall.getTime());
    });
  } finally {
    await prisma.client.update({ where: { id: "c2" }, data: { lastCall: before.lastCall } });
  }
});

test("staff cannot add, edit or delete clients, or see or record payments", async () => {
  const before = await prisma.client.findUnique({ where: { id: "c1" } });
  const count = await prisma.client.count();
  const payments = await prisma.payment.count();
  await withRoles(async ({ staff }) => {
    const newClient = { name: "Role Test Client", contact: "A", phone: "1", due: 100, invoiceDate: "2026-11-01", status: "due-soon" };
    const attempts = [
      ["/api/clients", jsonBody("POST", newClient)],
      ["/api/clients/c1", jsonBody("PATCH", { due: 1 })],
      ["/api/clients/c1", jsonBody("PATCH", { status: "paid" })],
      ["/api/clients/c1", jsonBody("PATCH", { notes: "changed" })],
      ["/api/clients/c1", { method: "DELETE" }],
      ["/api/clients/c1/payments", {}],
      ["/api/clients/c1/payments", jsonBody("POST", { amount: 1000 })],
    ];
    for (const [path, options] of attempts) {
      const res = await authed(path, staff, options);
      assert.equal(res.status, 403, `${options.method ?? "GET"} ${path} ${options.body ?? ""}`);
      const text = await res.text();
      assert.match(text, /admin/i);
      assert.doesNotMatch(text, /184000/);
    }
  });
  assert.deepEqual(await prisma.client.findUnique({ where: { id: "c1" } }), before);
  assert.equal(await prisma.client.count(), count);
  assert.equal(await prisma.payment.count(), payments);
});

test("an admin can edit a client and record a payment", async () => {
  const before = await prisma.client.findUnique({ where: { id: "c3" } });
  try {
    await withRoles(async ({ admin }) => {
      const edited = await authed("/api/clients/c3", admin, jsonBody("PATCH", { notes: "admin edit" }));
      assert.equal(edited.status, 200);
      assert.equal((await edited.json()).due, before.due);
      const paid = await authed("/api/clients/c3/payments", admin, jsonBody("POST", { amount: 2000 }));
      assert.equal(paid.status, 201);
      assert.equal((await paid.json()).client.due, before.due - 2000);
      assert.equal((await authed("/api/clients/c3/payments", admin)).status, 200);
    });
  } finally {
    await prisma.payment.deleteMany({ where: { clientId: "c3" } });
    await prisma.client.update({ where: { id: "c3" }, data: { due: before.due, status: before.status, notes: before.notes } });
  }
});

test("staff and admin can both use the Work Board and enquiries", async () => {
  await withRoles(async ({ staff, admin }) => {
    for (const token of [staff, admin]) {
      assert.equal((await authed("/api/tasks", token)).status, 200);
      assert.equal((await authed("/api/employees", token)).status, 200);
      assert.equal((await authed("/api/enquiries", token)).status, 200);
    }
  });
});

test("a token cannot be relabelled as admin, and each role's token dies with its own password", async () => {
  await withRoles(async ({ staff, admin }) => {
    const relabelled = staff.replace(/^staff\./, "admin.");
    assert.equal((await authed("/api/clients", relabelled)).status, 401);

    process.env.ADMIN_PASSWORD = "changed-admin-password";
    assert.equal((await authed("/api/clients", admin)).status, 401, "old admin token");
    assert.equal((await authed("/api/clients", staff)).status, 200, "staff are not signed out");
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

    delete process.env.ADMIN_PASSWORD;
    assert.equal((await authed("/api/clients", admin)).status, 401, "no admin password, no admin");
    assert.equal((await signIn(ADMIN_PASSWORD)).status, 401);
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  });
});

test("with only the office password set, nobody sees amounts", async () => {
  await withLogin(async () => {
    const { token, role } = await (await signIn(PASSWORD)).json();
    assert.equal(role, "staff");
    const list = await (await authed("/api/clients", token)).json();
    assert.equal(list.some((c) => "due" in c), false);
    assert.equal((await authed("/api/clients/c1/payments", token)).status, 403);
  });
});

test("with only the admin password set, login is still required and that password is admin", async () => {
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  clearFailedLogins();
  try {
    assert.equal((await get("/api/clients")).status, 401);
    assert.equal((await signIn(PASSWORD)).status, 401);
    const { token, role } = await (await signIn(ADMIN_PASSWORD)).json();
    assert.equal(role, "admin");
    assert.equal((await (await authed("/api/clients", token)).json())[0].due, 184000);
  } finally {
    delete process.env.ADMIN_PASSWORD;
    clearFailedLogins();
  }
});

// --- Personal sign-in: each person changes only their own work ---

import { MIN_PERSONAL_PASSWORD } from "../src/lib/auth.js";

const ANKIT_PASSWORD = "ankit-own-pass";
const RAJESH_PASSWORD = "rajesh-own-pass";

// Login on with both shared passwords, Ankit (e6) and Rajesh (e4) given their
// own passwords by the admin. Removes the personal passwords afterwards.
async function withPeople(fn) {
  await withRoles(async (tokens) => {
    const put = (id, password) => authed(`/api/employees/${id}/password`, tokens.admin, jsonBody("PUT", { password }));
    try {
      assert.equal((await put("e6", ANKIT_PASSWORD)).status, 204);
      assert.equal((await put("e4", RAJESH_PASSWORD)).status, 204);
      const ankit = await (await post("/api/auth/login", { as: "e6", password: ANKIT_PASSWORD })).json();
      const rajesh = await (await post("/api/auth/login", { as: "e4", password: RAJESH_PASSWORD })).json();
      await fn({ ...tokens, ankit: ankit.token, rajesh: rajesh.token, ankitLogin: ankit });
    } finally {
      await prisma.employee.updateMany({ data: { passwordHash: null } });
    }
  });
}

test("an admin sets a personal password; it is stored hashed and never sent back", async () => {
  await withPeople(async ({ admin, staff, ankitLogin }) => {
    assert.equal(ankitLogin.role, "staff");
    assert.equal(ankitLogin.employeeId, "e6");
    const stored = (await prisma.employee.findUnique({ where: { id: "e6" } })).passwordHash;
    assert.match(stored, /^scrypt\$/);
    assert.ok(!stored.includes(ANKIT_PASSWORD));

    for (const token of [admin, staff]) {
      const text = await (await authed("/api/employees", token)).text();
      assert.ok(!text.includes("passwordHash") && !text.includes("scrypt"), "no hash in the list");
    }
    const forAdmin = await (await authed("/api/employees", admin)).json();
    assert.equal(forAdmin.find((e) => e.id === "e6").hasPassword, true);
    assert.equal(forAdmin.find((e) => e.id === "e1").hasPassword, false);
    const forStaff = await (await authed("/api/employees", staff)).json();
    assert.equal("hasPassword" in forStaff[0], false);
  });
});

test("the session names the person and lists who can sign in", async () => {
  await withPeople(async ({ ankit }) => {
    assert.deepEqual(await who(await authed("/api/auth/session", ankit)), {
      required: true,
      authenticated: true,
      role: "staff",
      employeeId: "e6",
      name: "Ankit",
    });
    const anon = await (await get("/api/auth/session")).json();
    assert.deepEqual(anon.people.map((p) => p.id), ["e1", "e2", "e3", "e4", "e5", "e6", "e7"], "every profile is listed");
    assert.deepEqual(anon.people.filter((p) => p.hasPassword).map((p) => p.id), ["e4", "e6"]);
    assert.deepEqual(anon.people.find((p) => p.id === "e6"), { id: "e6", name: "Ankit", hasPassword: true });
    assert.deepEqual(anon.people.find((p) => p.id === "e1"), { id: "e1", name: "Narender Kumar", hasPassword: false });
    assert.ok(!JSON.stringify(anon).includes("scrypt"));
  });
});

test("personal sign-in refuses a wrong password, someone else's password and people without one", async () => {
  await withPeople(async () => {
    const tries = [
      { as: "e6", password: "wrong" },
      { as: "e6", password: RAJESH_PASSWORD },
      { as: "e6", password: ADMIN_PASSWORD },
      { as: "e1", password: ANKIT_PASSWORD },
      { as: "e999", password: ANKIT_PASSWORD },
      { as: "e6" },
      { as: 6, password: ANKIT_PASSWORD },
    ];
    for (const body of tries) {
      clearFailedLogins();
      const res = await post("/api/auth/login", body);
      assert.equal(res.status, 401, JSON.stringify(body));
      assert.equal((await res.json()).token, undefined);
    }
    clearFailedLogins();
    assert.equal((await post("/api/auth/login", { as: "admin", password: ADMIN_PASSWORD })).status, 200);
    assert.equal((await post("/api/auth/login", { as: "office", password: PASSWORD })).status, 200);
    for (const as of [undefined, "shared", "admin", "office"]) {
      assert.equal((await (await post("/api/auth/login", { as, password: ADMIN_PASSWORD })).json()).role, "admin", String(as));
      assert.equal((await (await post("/api/auth/login", { as, password: PASSWORD })).json()).role, "staff", String(as));
    }
  });
});

test("only an admin can set or remove personal passwords, and short ones are refused", async () => {
  await withPeople(async ({ admin, staff, ankit }) => {
    for (const token of [staff, ankit]) {
      assert.equal((await authed("/api/employees/e1/password", token, jsonBody("PUT", { password: "takeover-123" }))).status, 403);
      assert.equal((await authed("/api/employees/e4/password", token, { method: "DELETE" })).status, 403);
    }
    assert.equal((await prisma.employee.findUnique({ where: { id: "e1" } })).passwordHash, null);
    for (const password of ["x".repeat(MIN_PERSONAL_PASSWORD - 1), "", 123456, null, "x".repeat(201)]) {
      assert.equal((await authed("/api/employees/e1/password", admin, jsonBody("PUT", { password }))).status, 400, String(password));
    }
    assert.equal((await authed("/api/employees/e999/password", admin, jsonBody("PUT", { password: "long-enough" }))).status, 404);
    assert.equal((await authed("/api/employees/e999/password", admin, { method: "DELETE" })).status, 404);
  });
});

test("a person can edit the details of their own work but not anyone else's", async () => {
  const mine = await prisma.task.findUnique({ where: { id: "NK-102" } }); // Ankit's
  const theirs = await prisma.task.findUnique({ where: { id: "NK-105" } }); // Rajesh's
  try {
    await withPeople(async ({ ankit }) => {
      const edit = await authed("/api/tasks/NK-102", ankit, jsonBody("PATCH", { title: "Boundary survey (Ankit edit)", details: "Took GPS" }));
      assert.equal(edit.status, 200);
      assert.equal((await edit.json()).title, "Boundary survey (Ankit edit)");
      assert.equal((await authed("/api/tasks/NK-102", ankit, jsonBody("PATCH", { assigneeId: "e6", priority: "high" }))).status, 200, "keeping themselves is fine");

      for (const body of [{ title: "Not mine" }, { priority: "low" }, { details: "x" }, { status: "done", title: "Sneaked in with a move" }, { workTypes: ["survey"] }]) {
        const res = await authed("/api/tasks/NK-105", ankit, jsonBody("PATCH", body));
        assert.equal(res.status, 403, JSON.stringify(body));
        assert.match((await res.json()).error, /assigned to you/);
      }
      const reassign = await authed("/api/tasks/NK-102", ankit, jsonBody("PATCH", { assigneeId: "e4" }));
      assert.equal(reassign.status, 403);
      assert.match((await reassign.json()).error, /admin/i);
      assert.equal((await authed("/api/tasks/NK-105", ankit, jsonBody("PATCH", { assigneeId: "e6" }))).status, 403, "cannot take someone else's work");
      assert.equal((await authed("/api/tasks/NK-999", ankit, jsonBody("PATCH", { title: "x" }))).status, 404);
    });
    const after = await prisma.task.findUnique({ where: { id: "NK-105" } });
    assert.deepEqual(after, theirs, "someone else's work is untouched");
    assert.equal((await prisma.task.findUnique({ where: { id: "NK-102" } })).assigneeId, "e6");
  } finally {
    const { id, ...data } = mine;
    await prisma.task.update({ where: { id }, data });
  }
});

test("anyone signed in can move any card to any status, and nothing else changes", async () => {
  const before = await prisma.task.findUnique({ where: { id: "NK-105" } }); // Rajesh's, todo
  try {
    await withPeople(async ({ ankit, staff, admin }) => {
      const steps = [[ankit, "inprogress"], [staff, "done"], [ankit, "todo"], [staff, "inprogress"], [admin, "done"]];
      for (const [token, status] of steps) {
        const res = await authed("/api/tasks/NK-105", token, jsonBody("PATCH", { status }));
        assert.equal(res.status, 200, status);
        const body = await res.json();
        assert.equal(body.status, status);
        assert.equal(body.assigneeId, "e4");
        assert.equal(body.title, before.title);
        assert.equal(body.completedAt !== null, status === "done", "completedAt follows the status");
      }
      assert.equal((await authed("/api/tasks/NK-105", staff, jsonBody("PATCH", { status: "archived" }))).status, 400);
      assert.equal((await authed("/api/tasks/NK-999", staff, jsonBody("PATCH", { status: "done" }))).status, 404);
      assert.equal((await patch("/api/tasks/NK-105", { status: "todo" })).status, 401, "still needs a sign-in");
    });
  } finally {
    const { id, ...data } = before;
    await prisma.task.update({ where: { id }, data });
  }
});

test("anyone signed in can add work; only an admin deletes it, and the office sign-in cannot edit details", async () => {
  const before = await prisma.task.count();
  const newWork = { title: "Role test work", client: "Nobody", assigneeId: "e4", priority: "low" };
  const made = [];
  try {
    await withPeople(async ({ ankit, staff, admin }) => {
      for (const token of [ankit, staff, admin]) {
        const created = await authed("/api/tasks", token, jsonBody("POST", newWork));
        assert.equal(created.status, 201);
        const task = await created.json();
        made.push(task.id);
        assert.equal(task.assigneeId, "e4", "work can be added for someone else");
        assert.equal(task.status, "todo");
      }
      assert.equal((await post("/api/tasks", newWork)).status, 401, "adding still needs a sign-in");

      for (const token of [ankit, staff]) {
        assert.equal((await authed(`/api/tasks/${made[0]}`, token, { method: "DELETE" })).status, 403);
      }
      const office = await authed(`/api/tasks/${made[0]}`, staff, jsonBody("PATCH", { title: "Office edit" }));
      assert.equal(office.status, 403);
      assert.match((await office.json()).error, /own name/);
      assert.equal(await prisma.task.count(), before + 3);

      assert.equal((await authed(`/api/tasks/${made[0]}`, admin, jsonBody("PATCH", { assigneeId: "e6", title: "Admin edit" }))).status, 200);
      for (const id of made) assert.equal((await authed(`/api/tasks/${id}`, admin, { method: "DELETE" })).status, 204);
    });
  } finally {
    await prisma.task.deleteMany({ where: { title: { in: ["Role test work", "Admin edit", "Office edit"] } } });
  }
  assert.equal(await prisma.task.count(), before);
});

test("a personal sign-in stops working when the admin changes or removes the password", async () => {
  await withPeople(async ({ admin, ankit, rajesh }) => {
    assert.equal((await authed("/api/tasks", ankit)).status, 200);
    assert.equal((await authed("/api/employees/e6/password", admin, jsonBody("PUT", { password: "a-new-ankit-pass" }))).status, 204);
    assert.equal((await authed("/api/tasks", ankit)).status, 401, "old token after a new password");
    assert.equal((await post("/api/auth/login", { as: "e6", password: "a-new-ankit-pass" })).status, 200);

    assert.equal((await authed("/api/employees/e4/password", admin, { method: "DELETE" })).status, 204);
    assert.equal((await authed("/api/tasks", rajesh)).status, 401, "removed password");
    clearFailedLogins();
    assert.equal((await post("/api/auth/login", { as: "e4", password: RAJESH_PASSWORD })).status, 401);
  });
});

test("personal tokens cannot be forged, relabelled or used after expiry", async () => {
  await withPeople(async ({ ankit }) => {
    const [, , expires, signature] = ankit.split(".");
    const bad = [
      `person.e4.${expires}.${signature}`,
      `person.e6.${Number(expires) + 1000}.${signature}`,
      `person.e6.${expires}.${signature.slice(0, -2)}xx`,
      `person.e6.${expires}`,
      `person.e6.${expires}.${signature}.extra`,
      `admin.${expires}.${signature}`,
      `staff.${expires}.${signature}`,
      `person.e6.1.${signature}`,
    ];
    for (const t of bad) assert.equal((await authed("/api/tasks", t)).status, 401, t);
    assert.equal((await authed("/api/tasks", ankit)).status, 200);
  });
});

test("personal passwords do nothing while sign-in is switched off", async () => {
  assert.equal(process.env.APP_PASSWORD, undefined);
  const res = await post("/api/auth/login", { as: "e6", password: "whatever-123" });
  assert.equal(res.status, 400);
  assert.deepEqual((await (await get("/api/auth/session")).json()).people, []);
});

// --- Public team list for the landing page ---

test("GET /api/team is public and sends only name, role and initials", async () => {
  await withPeople(async () => {
    const res = await get("/api/team");
    assert.equal(res.status, 200);
    const team = await res.json();
    assert.deepEqual(team.map((e) => e.id), ["e1", "e2", "e3", "e4", "e5", "e6", "e7"]);
    for (const e of team) assert.deepEqual(Object.keys(e).sort(), ["id", "initials", "name", "role"]);
    assert.equal(team.find((e) => e.id === "e6").name, "Ankit");
    const text = JSON.stringify(team);
    assert.ok(!text.includes("scrypt") && !text.includes("hasPassword") && !text.includes("tasks"));
  });
});

// Issue #42: after PR #41 the sign-in screen started on "Office", and the
// server refused the admin password unless "Admin" was picked in the list.
test("the admin password signs in as admin whichever shared choice is picked", async () => {
  await withRoles(async () => {
    for (const as of ["office", "shared", "admin", undefined]) {
      clearFailedLogins();
      const res = await post("/api/auth/login", { as, password: ADMIN_PASSWORD });
      assert.equal(res.status, 200, String(as));
      const { token, role } = await res.json();
      assert.equal(role, "admin");
      assert.equal((await (await authed("/api/clients", token)).json())[0].due, 184000, "amounts are visible");
    }
  });
});

test("spaces or a line break around a password in the server settings are ignored", async () => {
  process.env.APP_PASSWORD = `  ${PASSWORD}\n`;
  process.env.ADMIN_PASSWORD = `${ADMIN_PASSWORD} \r\n`;
  clearFailedLogins();
  try {
    assert.equal((await (await post("/api/auth/login", { password: ADMIN_PASSWORD })).json()).role, "admin");
    const { token, role } = await (await post("/api/auth/login", { password: PASSWORD })).json();
    assert.equal(role, "staff");
    assert.equal((await authed("/api/tasks", token)).status, 200);
    assert.equal((await post("/api/auth/login", { password: `${PASSWORD}\n` })).status, 401, "the typed password is still exact");
  } finally {
    delete process.env.APP_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    clearFailedLogins();
  }
});

// --- The session says which sign-ins exist, so the screen can explain itself ---

test("the session reports which shared passwords are set on the server", async () => {
  const methods = async () => (await (await get("/api/auth/session")).json()).methods;
  assert.deepEqual(await methods(), { admin: false, office: false });
  await withLogin(async () => {
    assert.deepEqual(await methods(), { admin: false, office: true }, "only the office password: nobody can be admin");
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    try {
      assert.deepEqual(await methods(), { admin: true, office: true });
      process.env.ADMIN_PASSWORD = "   ";
      assert.deepEqual(await methods(), { admin: false, office: true }, "a blank value does not count");
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  try {
    assert.deepEqual(await methods(), { admin: true, office: false });
  } finally {
    delete process.env.ADMIN_PASSWORD;
  }
});

test("the session lists every profile once sign-in is on, with nobody ready until the admin sets passwords", async () => {
  await withLogin(async () => {
    const { people } = await (await get("/api/auth/session")).json();
    assert.equal(people.length, 7);
    assert.ok(people.every((p) => p.hasPassword === false));
    for (const p of people) assert.deepEqual(Object.keys(p).sort(), ["hasPassword", "id", "name"]);
  });
});

/* ---- activity log ------------------------------------------------------ */

const newestLogId = async () => (await prisma.activityLog.findFirst({ orderBy: { id: "desc" }, select: { id: true } }))?.id ?? 0;
const logSince = (id) => prisma.activityLog.findMany({ where: { id: { gt: id } }, orderBy: { id: "asc" } });
const activityFor = async (token, query) => (await authed(`/api/activity?${query}`, token)).json();
// Numbers are reused after a delete (highest + 1), so a record's history can
// include an earlier record with the same number. These tests look only at
// what was written after `mark`.
const historyOf = async (token, entityType, entityId, mark, extra = "") =>
  (await activityFor(token, `entityType=${entityType}&entityId=${entityId}&limit=200${extra}`)).entries.filter((e) => e.id > mark);
const brief = (entries) => entries.map((e) => `${e.action} by ${e.actorName}`);

test("the activity log records who added, moved, edited, reassigned and deleted work, with before and after", async () => {
  await withPeople(async ({ admin, staff, ankit, rajesh }) => {
    const started = Date.now();
    const mark = await newestLogId();
    const created = await authed("/api/tasks", ankit, jsonBody("POST", { ...validTask, title: "Logged work", assigneeId: "e6", priority: "low" }));
    assert.equal(created.status, 201);
    const { id } = await created.json();
    try {
      assert.equal((await authed(`/api/tasks/${id}`, rajesh, jsonBody("PATCH", { status: "done" }))).status, 200);
      assert.equal((await authed(`/api/tasks/${id}`, staff, jsonBody("PATCH", { status: "inprogress" }))).status, 200);
      assert.equal((await authed(`/api/tasks/${id}`, ankit, jsonBody("PATCH", { priority: "high", district: "Jind" }))).status, 200);
      assert.equal((await authed(`/api/tasks/${id}`, admin, jsonBody("PATCH", { assigneeId: "e4" }))).status, 200);
      assert.equal((await authed(`/api/tasks/${id}`, admin, { method: "DELETE" })).status, 204);

      const entries = await historyOf(admin, "task", id, mark);
      assert.deepEqual(brief(entries), [
        "task.deleted by Admin",
        "task.updated by Admin",
        "task.updated by Ankit",
        "task.moved by Office sign-in",
        "task.moved by Rajesh Kumar",
        "task.created by Ankit",
      ]);
      const [deleted, reassigned, edited, officeMove, move, added] = entries;

      assert.deepEqual([added.actorType, added.actorId], ["person", "e6"]);
      assert.deepEqual([move.actorType, move.actorId], ["person", "e4"]);
      assert.deepEqual([officeMove.actorType, officeMove.actorId], ["office", null]);
      assert.deepEqual([deleted.actorType, deleted.actorId], ["admin", null]);

      assert.equal(added.summary, `Added ${id} “Logged work”, assigned to Ankit`);
      assert.deepEqual(added.changes.title, { from: null, to: "Logged work" });
      assert.deepEqual(added.changes.status, { from: null, to: "todo" });

      assert.equal(move.summary, `Moved ${id} “Logged work” from To Do to Completed`);
      assert.deepEqual(move.changes.status, { from: "todo", to: "done" });
      assert.deepEqual(Object.keys(move.changes).sort(), ["completedAt", "status"]);
      assert.equal(officeMove.summary, `Moved ${id} “Logged work” from Completed to In Progress`);

      assert.equal(edited.summary, `Edited ${id} “Logged work”: changed priority, district`);
      assert.deepEqual(edited.changes, { priority: { from: "low", to: "high" }, district: { from: null, to: "Jind" } });

      assert.equal(reassigned.summary, `Edited ${id} “Logged work”: reassigned from Ankit to Rajesh Kumar`);
      assert.deepEqual(reassigned.changes, { assigneeId: { from: "e6", to: "e4" } });

      // A deleted record can be read back from its last entry.
      assert.equal(deleted.summary, `Deleted ${id} “Logged work”`);
      assert.deepEqual(deleted.changes.title, { from: "Logged work", to: null });
      assert.deepEqual(deleted.changes.assigneeId, { from: "e4", to: null });
      assert.deepEqual(deleted.changes.district, { from: "Jind", to: null });

      for (const entry of entries) {
        assert.ok(entry.ip, "each entry says where it came from");
        const at = new Date(entry.at).getTime();
        assert.ok(at >= started - 2000 && at <= Date.now() + 2000, `time set by the server: ${entry.at}`);
        assert.ok(!("updatedAt" in entry.changes), "bookkeeping fields are not logged");
      }
    } finally {
      await prisma.task.deleteMany({ where: { id } });
    }
  });
});

test("a refused, invalid or unchanged save leaves no entry in the activity log", async () => {
  await withPeople(async ({ admin, staff, rajesh }) => {
    const task = await prisma.task.findUnique({ where: { id: "NK-102" } });
    const mark = await newestLogId();
    // NK-102 is Ankit's: Rajesh and the office sign-in may not edit its details.
    assert.equal((await authed("/api/tasks/NK-102", rajesh, jsonBody("PATCH", { title: "Mine now" }))).status, 403);
    assert.equal((await authed("/api/tasks/NK-102", staff, jsonBody("PATCH", { priority: "high" }))).status, 403);
    assert.equal((await authed("/api/tasks/NK-102", staff, { method: "DELETE" })).status, 403);
    assert.equal((await authed("/api/tasks/NK-102", admin, jsonBody("PATCH", { priority: "urgent" }))).status, 400);
    assert.equal((await authed("/api/tasks/NK-999", admin, jsonBody("PATCH", { status: "done" }))).status, 404);
    assert.equal((await authed("/api/tasks/NK-999", admin, { method: "DELETE" })).status, 404);
    assert.equal((await authed("/api/clients/c1", staff, jsonBody("PATCH", { due: 1 }))).status, 403);
    assert.equal((await authed("/api/clients/c1/payments", admin, jsonBody("POST", { amount: 10 ** 9 }))).status, 400);
    assert.equal((await authed("/api/enquiries/999999", admin, jsonBody("PATCH", { status: "closed" }))).status, 404);
    // Saving the same values again is not a change.
    const same = { status: task.status, priority: task.priority, title: task.title };
    assert.equal((await authed("/api/tasks/NK-102", admin, jsonBody("PATCH", same))).status, 200);
    assert.deepEqual(brief(await logSince(mark)), []);
  });
});

test("a change is not saved if its activity entry cannot be written", async () => {
  const task = await prisma.task.findUnique({ where: { id: "NK-102" } });
  // Make the database refuse this one kind of entry, for this test only.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "test_refuse_moves" CHECK (action <> 'task.moved') NOT VALID`);
  try {
    const res = await patch("/api/tasks/NK-102", { status: task.status === "done" ? "todo" : "done" });
    assert.equal(res.status, 500);
    assert.equal((await prisma.task.findUnique({ where: { id: "NK-102" } })).status, task.status, "the move was rolled back");
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "test_refuse_moves"`);
    await prisma.task.update({ where: { id: "NK-102" }, data: { status: task.status, completedAt: task.completedAt } });
  }
});

test("client records, reminder calls and payments are logged with their amounts", async () => {
  await withRoles(async ({ admin, staff }) => {
    const mark = await newestLogId();
    const created = await authed("/api/clients", admin, jsonBody("POST", validClient));
    assert.equal(created.status, 201);
    const { id } = await created.json();
    try {
      assert.equal((await authed(`/api/clients/${id}`, staff, jsonBody("PATCH", {}))).status, 200);
      assert.equal((await authed(`/api/clients/${id}`, admin, jsonBody("PATCH", { due: 10000, notes: "Revised" }))).status, 200);
      assert.equal((await authed(`/api/clients/${id}/payments`, admin, jsonBody("POST", { amount: 4000, note: "Cheque" }))).status, 201);
      assert.equal((await authed(`/api/clients/${id}/payments`, admin, jsonBody("POST", { amount: 6000 }))).status, 201);
      assert.equal((await authed(`/api/clients/${id}`, admin, { method: "DELETE" })).status, 204);

      const entries = await historyOf(admin, "client", id, mark);
      assert.deepEqual(brief(entries), [
        "client.deleted by Admin",
        "payment.recorded by Admin",
        "payment.recorded by Admin",
        "client.updated by Admin",
        "client.call_logged by Office sign-in",
        "client.created by Admin",
      ]);
      const [deleted, cleared, firstPayment, edited, call, added] = entries;
      assert.equal(added.summary, "Added client “Test Client” with ₹12,000 due");
      assert.deepEqual(added.changes.due, { from: null, to: 12000 });
      assert.equal(call.summary, "Logged a reminder call to “Test Client”");
      assert.deepEqual(Object.keys(call.changes), ["lastCall"]);
      assert.equal(edited.summary, "Edited client “Test Client”: changed amount due, notes");
      assert.deepEqual(edited.changes, { due: { from: 12000, to: 10000 }, notes: { from: null, to: "Revised" } });
      assert.equal(firstPayment.summary, "Recorded ₹4,000 received from “Test Client”; ₹6,000 still due");
      assert.deepEqual(firstPayment.changes.due, { from: 10000, to: 6000 });
      assert.deepEqual(firstPayment.changes.note, { from: null, to: "Cheque" });
      assert.ok(!("status" in firstPayment.changes));
      assert.deepEqual(cleared.changes.due, { from: 6000, to: 0 });
      assert.deepEqual(cleared.changes.status, { from: "due-soon", to: "paid" });
      // Deleting a client deletes its payments; the entry keeps both.
      assert.equal(deleted.summary, "Deleted client “Test Client” with ₹0 due and 2 recorded payments");
      assert.deepEqual(deleted.changes.payments.from.map((p) => [p.amount, p.note]), [[4000, "Cheque"], [6000, null]]);
      assert.deepEqual(deleted.changes.name, { from: "Test Client", to: null });

      assert.deepEqual(brief(await historyOf(admin, "client", id, mark, "&type=payment")), [
        "payment.recorded by Admin",
        "payment.recorded by Admin",
      ]);
    } finally {
      await prisma.client.deleteMany({ where: { id } });
    }
  });
});

test("an enquiry is logged from the website visitor through to its deletion", async () => {
  await cleanEnquiries();
  try {
    const mark = await newestLogId();
    assert.equal((await post("/api/enquiries", { name: ENQ_NAME, phone: "98765 43210", message: "Survey needed" })).status, 201);
    // A script filling the hidden field is answered but stores and logs nothing.
    assert.equal((await post("/api/enquiries", { name: ENQ_NAME, phone: "98765 43210", website: "spam" })).status, 201);
    const [{ id }] = await (await get("/api/enquiries")).json();
    assert.equal((await patch(`/api/enquiries/${id}`, { status: "contacted" })).status, 200);
    assert.equal((await patch(`/api/enquiries/${id}`, { status: "contacted" })).status, 200);
    assert.equal((await del(`/api/enquiries/${id}`)).status, 204);

    const entries = await logSince(mark);
    assert.deepEqual(brief(entries), [
      "enquiry.received by Website visitor",
      "enquiry.status_changed by Sign-in switched off",
      "enquiry.deleted by Sign-in switched off",
    ]);
    const [received, changed, deleted] = entries;
    assert.deepEqual([received.actorType, received.entityId], ["public", String(id)]);
    assert.deepEqual(received.changes.phone, { from: null, to: "98765 43210" });
    assert.equal(changed.actorType, "open");
    assert.deepEqual(changed.changes, { status: { from: "new", to: "contacted" } });
    assert.equal(deleted.summary, `Deleted the enquiry from “${ENQ_NAME}” (98765 43210)`);
    assert.deepEqual(deleted.changes.message, { from: "Survey needed", to: null });
  } finally {
    await cleanEnquiries();
  }
});

test("sign-ins and password changes are logged, right and wrong, and never hold a password", async () => {
  const mark = await newestLogId();
  await withPeople(async ({ admin }) => {
    assert.equal((await post("/api/auth/login", { as: "e6", password: "not-ankits-password" })).status, 401);
    assert.equal((await post("/api/auth/login", { as: "e999", password: "whatever-123" })).status, 401);
    assert.equal((await signIn("not-a-shared-password")).status, 401);
    assert.equal((await authed("/api/employees/e6/password", admin, jsonBody("PUT", { password: "ankit-second-pass" }))).status, 204);
    assert.equal((await authed("/api/employees/e6/password", admin, { method: "DELETE" })).status, 204);
    assert.equal((await authed("/api/employees/e6/password", admin, { method: "DELETE" })).status, 204);
  });
  const entries = await logSince(mark);
  assert.deepEqual(
    entries.map((e) => `${e.actorType}: ${e.summary}`),
    [
      "office: Office sign-in signed in",
      "admin: Admin signed in",
      "admin: Set Ankit's sign-in password",
      "admin: Set Rajesh Kumar's sign-in password",
      "person: Ankit signed in",
      "person: Rajesh Kumar signed in",
      "unknown: Wrong password for Ankit's sign-in",
      "unknown: Wrong password for a sign-in that does not exist",
      "unknown: Wrong password for the office or admin sign-in",
      "admin: Changed Ankit's sign-in password",
      "admin: Removed Ankit's sign-in password",
    ]
  );
  assert.deepEqual(entries.filter((e) => e.action === "session.sign_in_failed").map((e) => e.entityId), ["e6", null, "shared"]);
  const everything = JSON.stringify(entries);
  for (const secret of [PASSWORD, ADMIN_PASSWORD, ANKIT_PASSWORD, RAJESH_PASSWORD, "ankit-second-pass", "not-ankits-password", "scrypt$"]) {
    assert.ok(!everything.includes(secret), `the log must not hold ${secret}`);
  }
});

test("the attempt that locks an address out says so in the log", async () => {
  await withLogin(async () => {
    const mark = await newestLogId();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) assert.equal((await signIn(`wrong-${i}`)).status, 401);
    assert.equal((await signIn("wrong-again")).status, 429);
    const entries = await logSince(mark);
    assert.equal(entries.length, MAX_FAILED_LOGINS, "attempts refused by the lockout are not logged");
    assert.match(entries.at(-1).summary, /attempt 8, so this address is locked out for 15 minutes$/);
    assert.ok(!entries[0].summary.includes("locked out"));
  });
});

test("GET /api/activity is for the admin only", async () => {
  await withPeople(async ({ admin, staff, ankit }) => {
    assert.equal((await get("/api/activity")).status, 401);
    assert.equal((await authed("/api/activity", staff)).status, 403);
    assert.equal((await authed("/api/activity", ankit)).status, 403);
    const res = await authed("/api/activity", admin);
    assert.equal(res.status, 200);
    const { entries } = await res.json();
    assert.ok(entries.length > 0);
    assert.deepEqual(Object.keys(entries[0]).sort(), [
      "action", "actorId", "actorName", "actorType", "at", "changes", "entityId", "entityType", "id", "ip", "summary", "userAgent",
    ]);
  });
});

test("GET /api/activity pages newest first and filters by person and by kind", async () => {
  await withPeople(async ({ admin, ankit }) => {
    const mark = await newestLogId();
    for (const status of ["inprogress", "done", "todo"]) {
      assert.equal((await authed("/api/tasks/NK-102", ankit, jsonBody("PATCH", { status }))).status, 200);
    }
    try {
      const first = await activityFor(admin, "actor=e6&type=task&limit=2");
      assert.deepEqual(first.entries.map((e) => e.changes.status.to), ["todo", "done"]);
      assert.equal(first.nextBefore, first.entries[1].id);
      const second = await activityFor(admin, `actor=e6&type=task&limit=2&before=${first.nextBefore}`);
      assert.equal(second.entries[0].changes.status.to, "inprogress");
      assert.ok(second.entries.every((e) => e.id < first.nextBefore && e.actorId === "e6" && e.action.startsWith("task.")));

      const all = (await activityFor(admin, "limit=200")).entries;
      assert.deepEqual(all.map((e) => e.id), all.map((e) => e.id).sort((a, b) => b - a), "newest first");
      assert.ok((await activityFor(admin, "actor=admin")).entries.every((e) => e.actorType === "admin"));
      assert.ok((await activityFor(admin, "type=session")).entries.every((e) => e.action.startsWith("session.")));
      assert.deepEqual((await activityFor(admin, "actor=e999")).entries, []);
      assert.equal((await activityFor(admin, "limit=5000")).entries.length <= 200, true);

      for (const query of ["limit=0", "limit=abc", "before=x", "type=money", "entityType=task", "entityId=NK-102", "entityType=nope&entityId=1", "actor=e1&actor=e2"]) {
        assert.equal((await authed(`/api/activity?${query}`, admin)).status, 400, query);
      }
    } finally {
      const task = await prisma.task.findUnique({ where: { id: "NK-102" } });
      assert.equal(task.status, "todo");
      assert.ok((await logSince(mark)).length >= 3);
    }
  });
});

test("the activity log cannot be edited or emptied: there is no route, and the database refuses", async () => {
  await post("/api/enquiries", { name: ENQ_NAME, phone: "98765 43210" });
  try {
    const entry = await prisma.activityLog.findFirst({ orderBy: { id: "desc" } });
    for (const [method, path] of [
      ["POST", "/api/activity"],
      ["PATCH", `/api/activity/${entry.id}`],
      ["PUT", `/api/activity/${entry.id}`],
      ["DELETE", `/api/activity/${entry.id}`],
      ["DELETE", "/api/activity"],
    ]) {
      assert.equal((await fetch(base + path, jsonBody(method, { summary: "nothing happened" }))).status, 404, `${method} ${path}`);
    }
    const refused = /append-only/;
    await assert.rejects(prisma.activityLog.update({ where: { id: entry.id }, data: { summary: "nothing happened" } }), refused);
    await assert.rejects(prisma.activityLog.delete({ where: { id: entry.id } }), refused);
    await assert.rejects(prisma.activityLog.deleteMany({}), refused);
    await assert.rejects(prisma.$executeRawUnsafe(`TRUNCATE "ActivityLog"`), refused);
    assert.deepEqual(await prisma.activityLog.findUnique({ where: { id: entry.id } }), entry);
  } finally {
    await cleanEnquiries();
  }
});
