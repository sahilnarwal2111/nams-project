import { Router } from "express";
import { listTasks, updateTaskStatus } from "../controllers/tasks.controller.js";

export const tasksRouter = Router();

tasksRouter.get("/", listTasks);
tasksRouter.patch("/:id", updateTaskStatus);
