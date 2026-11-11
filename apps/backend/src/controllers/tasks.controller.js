import { prisma } from "../lib/prisma.js";
import { parseDate } from "../lib/dates.js";

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

  // Retry if a concurrent request grabbed the same id (unique violation).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const task = await prisma.task.create({
        data: { id: await nextTaskId(), title: title.trim(), client: client.trim(), status, priority, assigneeId, ...details.data },
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
    await prisma.task.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: `Task ${id} not found` });
    throw err;
  }
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

  if ("priority" in data && !VALID_PRIORITIES.includes(data.priority)) {
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` });
  }
  if ("status" in data && !VALID_STATUSES.includes(data.status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  if ("assigneeId" in data) {
    const employee = await prisma.employee.findUnique({ where: { id: data.assigneeId } });
    if (!employee) return res.status(400).json({ error: `assigneeId ${data.assigneeId} is not an existing employee` });
  }

  try {
    const task = await prisma.task.update({ where: { id }, data });
    res.json(task);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: `Task ${id} not found` });
    throw err;
  }
}
