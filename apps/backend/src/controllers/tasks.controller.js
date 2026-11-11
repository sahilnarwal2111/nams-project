import { prisma } from "../lib/prisma.js";
import { parseDate } from "../lib/dates.js";
import { diff, inTransaction, lockAndFind, logActivity, quoted } from "../lib/activity.js";
import { HttpError, sendHttpError } from "../lib/httpError.js";

const VALID_STATUSES = ["todo", "inprogress", "done"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const REQUIRED_FIELDS = ["title", "client", "assigneeId", "priority"];

// Optional details from the "new work" form. Work types are plain strings that
// match the frontend's WORK_TYPES ids exactly, like status and priority.
const VALID_WORK_TYPES = ["survey", "x-section", "drawing", "design", "printout"];
const OPTIONAL_TEXT_FIELDS = ["customerPhone", "district", "department", "details"];
const DETAIL_FIELDS = [...OPTIONAL_TEXT_FIELDS, "workTypes", "expectedCompletion"];

// Validates the optional detail fields present in body. Returns { data } or
// { error }. Blank text and null both clear a field.
function parseDetails(body) {
  const data = {};
  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") return { error: `${field} must be a string` };
    data[field] = value === null || value.trim() === "" ? null : value.trim();
  }
  if (body.workTypes !== undefined) {
    const value = body.workTypes;
    if (!Array.isArray(value) || value.some((t) => !VALID_WORK_TYPES.includes(t))) {
      return { error: `workTypes must be a list of: ${VALID_WORK_TYPES.join(", ")}` };
    }
    data.workTypes = VALID_WORK_TYPES.filter((t) => value.includes(t));
  }
  if (body.expectedCompletion !== undefined) {
    const value = body.expectedCompletion;
    if (value === null || value === "") {
      data.expectedCompletion = null;
    } else {
      const d = parseDate(value);
      if (!d) return { error: "expectedCompletion must be YYYY-MM-DD or an ISO timestamp" };
      data.expectedCompletion = d;
    }
  }
  return { data };
}

// Next id = highest existing NK-### number + 1. Compared numerically so ids
// past NK-999 still sort correctly.
async function nextTaskId() {
  const rows = await prisma.task.findMany({ select: { id: true } });
  let max = 0;
  for (const { id } of rows) {
    const m = /^NK-(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `NK-${String(max + 1).padStart(3, "0")}`;
}

export async function listTasks(req, res) {
  const tasks = await prisma.task.findMany({ orderBy: { id: "asc" } });
  res.json(tasks);
}

export async function getTask(req, res) {
  const { id } = req.params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return res.status(404).json({ error: `Task ${id} not found` });
  res.json(task);
}

export async function createTask(req, res) {
  const body = req.body ?? {};

  for (const field of REQUIRED_FIELDS) {
    const value = body[field];
    if (typeof value !== "string" || value.trim() === "") {
      return res.status(400).json({ error: `${field} is required` });
    }
  }
  const { title, client, assigneeId, priority } = body;
  const status = body.status ?? "todo";

  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  const details = parseDetails(body);
  if (details.error) return res.status(400).json({ error: details.error });

  const employee = await prisma.employee.findUnique({ where: { id: assigneeId } });
  if (!employee) return res.status(400).json({ error: `assigneeId ${assigneeId} is not an existing employee` });

  const now = new Date();
  const stamps = { createdAt: now, completedAt: status === "done" ? now : null };

  // Retry if a concurrent request grabbed the same id (unique violation).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const id = await nextTaskId();
      const task = await inTransaction(async (tx) => {
        const created = await tx.task.create({
          data: { id, title: title.trim(), client: client.trim(), status, priority, assigneeId, ...details.data, ...stamps },
        });
        await logActivity(tx, req, {
          action: "task.created",
          entityType: "task",
          entityId: created.id,
          summary: `Added ${created.id} ${quoted(created.title)}, assigned to ${employee.name}`,
          changes: diff(null, created),
        });
        return created;
      });
      return res.status(201).json(task);
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate a task id");
}

export async function deleteTask(req, res) {
  const { id } = req.params;
  try {
    await inTransaction(async (tx) => {
      const before = await lockAndFind(tx, "task", id);
      if (!before) throw new HttpError(404, `Task ${id} not found`);
      await tx.task.delete({ where: { id } });
      // The whole record goes into the log, so deleted work can still be read.
      await logActivity(tx, req, {
        action: "task.deleted",
        entityType: "task",
        entityId: id,
        summary: `Deleted ${id} ${quoted(before.title)}`,
        changes: diff(before, null),
      });
    });
    res.status(204).end();
  } catch (err) {
    sendHttpError(res, err);
  }
}

const STATUS_LABELS = { todo: "To Do", inprogress: "In Progress", done: "Completed" };
const FIELD_LABELS = {
  title: "work",
  client: "customer",
  priority: "priority",
  customerPhone: "phone",
  district: "district",
  department: "department",
  workTypes: "work types",
  details: "details",
  expectedCompletion: "expected completion",
};

// The log line for an edit: what moved, who it went to, which fields changed.
async function describeTaskChange(tx, task, changes) {
  const parts = [];
  if (changes.status) {
    parts.push(`moved from ${STATUS_LABELS[changes.status.from]} to ${STATUS_LABELS[changes.status.to]}`);
  }
  if (changes.assigneeId) {
    const people = await tx.employee.findMany({
      where: { id: { in: [changes.assigneeId.from, changes.assigneeId.to] } },
      select: { id: true, name: true },
    });
    const name = (id) => people.find((p) => p.id === id)?.name ?? id;
    parts.push(`reassigned from ${name(changes.assigneeId.from)} to ${name(changes.assigneeId.to)}`);
  }
  const fields = Object.keys(changes).filter((field) => field in FIELD_LABELS);
  if (fields.length > 0) parts.push(`changed ${fields.map((field) => FIELD_LABELS[field]).join(", ")}`);

  const name = `${task.id} ${quoted(task.title)}`;
  if (parts.length === 1 && changes.status) return `Moved ${name} from ${STATUS_LABELS[changes.status.from]} to ${STATUS_LABELS[changes.status.to]}`;
  return `Edited ${name}: ${parts.join("; ")}`;
}

const EDITABLE_FIELDS = ["title", "client", "assigneeId", "priority", "status"];

// PATCH: only the fields sent are changed. `id`, `updatedAt` and any other
// unknown keys are ignored.
export async function updateTask(req, res) {
  const { id } = req.params;
  const body = req.body ?? {};

  const data = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.hasOwn(body, field)) data[field] = body[field];
  }
  const details = parseDetails(body);
  if (details.error) return res.status(400).json({ error: details.error });
  Object.assign(data, details.data);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({
      error: `body must include at least one of: ${[...EDITABLE_FIELDS, ...DETAIL_FIELDS].join(", ")}`,
    });
  }

  for (const field of ["title", "client", "assigneeId"]) {
    if (!(field in data)) continue;
    if (typeof data[field] !== "string" || data[field].trim() === "") {
      return res.status(400).json({ error: `${field} must be a non-empty string` });
    }
  }
  if ("title" in data) data.title = data.title.trim();
  if ("client" in data) data.client = data.client.trim();

  // Anyone signed in may move any card: a change of status and nothing else.
  // Editing the details is for the admin and for the person the work is
  // assigned to, who may not hand it to someone else.
  const onlyMoving = Object.keys(data).every((field) => field === "status");
  const notFound = () => new HttpError(404, `Task ${id} not found`);

  try {
    const task = await inTransaction(async (tx) => {
      const before = await lockAndFind(tx, "task", id);

      if (req.role !== "admin" && !onlyMoving) {
        if (!req.employeeId) throw new HttpError(403, "Sign in with your own name to edit the details of your work.");
        if (!before) throw notFound();
        if (before.assigneeId !== req.employeeId) {
          throw new HttpError(403, "You can only edit the details of work assigned to you.");
        }
        if ("assigneeId" in data && data.assigneeId !== req.employeeId) {
          throw new HttpError(403, "Only an admin can reassign work.");
        }
      }

      if ("priority" in data && !VALID_PRIORITIES.includes(data.priority)) {
        throw new HttpError(400, `priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
      }
      if ("status" in data && !VALID_STATUSES.includes(data.status)) {
        throw new HttpError(400, `status must be one of: ${VALID_STATUSES.join(", ")}`);
      }
      if ("assigneeId" in data) {
        const employee = await tx.employee.findUnique({ where: { id: data.assigneeId } });
        if (!employee) throw new HttpError(400, `assigneeId ${data.assigneeId} is not an existing employee`);
      }
      if (!before) throw notFound();

      // completedAt follows the status: stamped when a task first reaches
      // "done", kept while it stays there, cleared when it is moved back.
      if ("status" in data) {
        if (data.status !== "done") data.completedAt = null;
        else if (before.status !== "done") data.completedAt = new Date();
      }

      const updated = await tx.task.update({ where: { id }, data });
      // Saving without changing anything is not activity.
      const changes = diff(before, updated);
      if (changes) {
        await logActivity(tx, req, {
          action: Object.keys(changes).every((field) => field === "status" || field === "completedAt") ? "task.moved" : "task.updated",
          entityType: "task",
          entityId: id,
          summary: await describeTaskChange(tx, updated, changes),
          changes,
        });
      }
      return updated;
    });
    res.json(task);
  } catch (err) {
    sendHttpError(res, err);
  }
}
