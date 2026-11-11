import { Router } from "express";
import { getTask, listTasks, updateTaskStatus } from "../controllers/tasks.controller.js";

export const tasksRouter = Router();

tasksRouter.get("/", listTasks);
tasksRouter.get("/:id", getTask);
tasksRouter.patch("/:id", updateTaskStatus);
