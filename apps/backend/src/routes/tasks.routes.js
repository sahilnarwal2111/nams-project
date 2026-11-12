import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { createTask, deleteTask, getTask, listTasks, logReminder, updateTask } from "../controllers/tasks.controller.js";
import { listPayments, recordPayment, removePayment } from "../controllers/payments.controller.js";

export const tasksRouter = Router();

// Everyone signed in can see the board, add work and move any card between
// statuses. updateTask limits who may edit the details. Only an admin deletes.
tasksRouter.get("/", listTasks);
tasksRouter.post("/", createTask);
tasksRouter.get("/:id", getTask);
tasksRouter.patch("/:id", updateTask);
tasksRouter.delete("/:id", requireAdmin, deleteTask);

// Receivables, ticket by ticket. Anyone signed in can log a reminder call.
// Anything that shows or changes money needs an admin.
tasksRouter.post("/:id/reminder", logReminder);
tasksRouter.get("/:id/payments", requireAdmin, listPayments);
tasksRouter.post("/:id/payments", requireAdmin, recordPayment);
tasksRouter.delete("/:id/payments/:paymentId", requireAdmin, removePayment);
