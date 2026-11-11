import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "../controllers/tasks.controller.js";

export const tasksRouter = Router();

// Everyone signed in can see the board, add work and move any card between
// statuses. updateTask limits who may edit the details. Only an admin deletes.
tasksRouter.get("/", listTasks);
tasksRouter.post("/", createTask);
tasksRouter.get("/:id", getTask);
tasksRouter.patch("/:id", updateTask);
tasksRouter.delete("/:id", requireAdmin, deleteTask);
