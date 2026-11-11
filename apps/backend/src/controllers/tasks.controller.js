import { prisma } from "../lib/prisma.js";

const VALID_STATUSES = ["todo", "inprogress", "done"];
const VALID_PRIORITIES = ["low", "medium", "high"];
const REQUIRED_FIELDS = ["title", "client", "assigneeId", "priority"];

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
  const employee = await prisma.employee.findUnique({ where: { id: assigneeId } });
  if (!employee) return res.status(400).json({ error: `assigneeId ${assigneeId} is not an existing employee` });

  // Retry if a concurrent request grabbed the same id (unique violation).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const task = await prisma.task.create({
        data: { id: await nextTaskId(), title: title.trim(), client: client.trim(), status, priority, assigneeId },
      });
      return res.status(201).json(task);
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate a task id");
}

export async function updateTaskStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  try {
    const task = await prisma.task.update({ where: { id }, data: { status } });
    res.json(task);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: `Task ${id} not found` });
    throw err;
  }
}
