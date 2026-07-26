import { Router } from "express";
import { listEmployees } from "../controllers/employees.controller.js";

export const employeesRouter = Router();

employeesRouter.get("/", listEmployees);
