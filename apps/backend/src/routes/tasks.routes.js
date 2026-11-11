import { Router } from "express";
import { createTask, deleteTask, getTask, listTasks, updateTask } from "../controllers/tasks.controller.js";

export const tasksRouter = Router();

tasksRouter.get("/", listTasks);
tasksRouter.post("/", createTask);
tasksRouter.get("/:id", getTask);
tasksRouter.patch("/:id", updateTask);
tasksRouter.delete("/:id", deleteTask);
