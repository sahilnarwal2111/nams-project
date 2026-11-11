import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "../controllers/tasks.controller.js";

export const tasksRouter = Router();

// Everyone signed in can see the board. Only an admin creates or deletes work;
// updateTask lets staff change only the work assigned to them.
tasksRouter.get("/", listTasks);
tasksRouter.post("/", requireAdmin, createTask);
tasksRouter.get("/:id", getTask);
tasksRouter.patch("/:id", updateTask);
tasksRouter.delete("/:id", requireAdmin, deleteTask);
