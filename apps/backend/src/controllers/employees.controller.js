import { prisma } from "../lib/prisma.js";
import { hashPassword, MIN_PERSONAL_PASSWORD } from "../lib/auth.js";

// The password hash never leaves the server; an admin sees whether one is set.
function forRole({ passwordHash, ...employee }, role) {
  return role === "admin" ? { ...employee, hasPassword: passwordHash !== null } : employee;
}

export async function listEmployees(req, res) {
  const employees = await prisma.employee.findMany({ orderBy: { id: "asc" } });
  res.json(employees.map((e) => forRole(e, req.role)));
}

// Admin only. Sets or replaces a person's own password; their old sign-in stops working.
export async function setEmployeePassword(req, res) {
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < MIN_PERSONAL_PASSWORD || password.length > 200) {
    return res.status(400).json({ error: `Password must be ${MIN_PERSONAL_PASSWORD} to 200 characters.` });
  }
  const passwordHash = await hashPassword(password);
  try {
    await prisma.employee.update({ where: { id: req.params.id }, data: { passwordHash } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: `Employee ${req.params.id} not found` });
    throw err;
  }
}

// Admin only. Removes a person's own password, which signs them out.
export async function clearEmployeePassword(req, res) {
  try {
    await prisma.employee.update({ where: { id: req.params.id }, data: { passwordHash: null } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: `Employee ${req.params.id} not found` });
    throw err;
  }
}
