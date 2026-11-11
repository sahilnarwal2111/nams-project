import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const teamRouter = Router();

// Public: the team section of the landing page. Only what is shown there.
teamRouter.get("/", async (req, res) => {
  res.json(await prisma.employee.findMany({ select: { id: true, name: true, role: true, initials: true }, orderBy: { id: "asc" } }));
});
