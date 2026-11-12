import { prisma } from "../lib/prisma.js";
import { hashPassword, MIN_PERSONAL_PASSWORD } from "../lib/auth.js";
import { inTransaction, lockAndFind, logActivity } from "../lib/activity.js";
import { HttpError, sendHttpError } from "../lib/httpError.js";

// Changes a person's stored password hash and logs that it happened. The log
// says who and when, never the password or its hash. Returns nothing.
async function changePassword(req, passwordHash) {
  const { id } = req.params;
  await inTransaction(async (tx) => {
    const before = await lockAndFind(tx, "employee", id);
    if (!before) throw new HttpError(404, `Employee ${id} not found`);
    await tx.employee.update({ where: { id }, data: { passwordHash } });
    const had = before.passwordHash !== null;
    if (passwordHash === null && !had) return;
    await logActivity(tx, req, {
      action: passwordHash === null ? "employee.password_removed" : "employee.password_set",
      entityType: "employee",
      entityId: id,
      summary:
        passwordHash === null
          ? `Removed ${before.name}'s sign-in password`
          : `${had ? "Changed" : "Set"} ${before.name}'s sign-in password`,
    });
  });
}

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
  try {
    await changePassword(req, await hashPassword(password));
    res.status(204).end();
  } catch (err) {
    sendHttpError(res, err);
  }
}

// Admin only. Removes a person's own password, which signs them out.
export async function clearEmployeePassword(req, res) {
  try {
    await changePassword(req, null);
    res.status(204).end();
  } catch (err) {
    sendHttpError(res, err);
  }
}
