import { prisma } from "../lib/prisma.js";

const VALID_STATUSES = ["todo", "inprogress", "done"];

export async function listTasks(req, res) {
  const tasks = await prisma.task.findMany({ orderBy: { id: "asc" } });
  res.json(tasks);
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
