import { prisma } from "../lib/prisma.js";

export async function listEmployees(req, res) {
  const employees = await prisma.employee.findMany({ orderBy: { id: "asc" } });
  res.json(employees);
}
