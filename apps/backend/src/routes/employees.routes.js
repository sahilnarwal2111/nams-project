import { Router } from "express";
import { requireAdmin } from "../lib/auth.js";
import { clearEmployeePassword, listEmployees, setEmployeePassword } from "../controllers/employees.controller.js";

export const employeesRouter = Router();

employeesRouter.get("/", listEmployees);
employeesRouter.put("/:id/password", requireAdmin, setEmployeePassword);
employeesRouter.delete("/:id/password", requireAdmin, clearEmployeePassword);
