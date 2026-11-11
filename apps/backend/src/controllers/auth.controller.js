import { prisma } from "../lib/prisma.js";
import {
  authEnabled,
  clearFailedLogins,
  issuePersonToken,
  issueToken,
  loginBlocked,
  passwordMatches,
  recordFailedLogin,
  roleForPassword,
  viewerFromRequest,
} from "../lib/auth.js";

// Tells the frontend whether to show a sign-in screen and what the viewer may
// see. Never returns 401. role is "admin", "staff" or null (not signed in);
// with login switched off everyone is an admin. employeeId and name are set
// for a personal sign-in. people lists who can sign in with their own
// password, for the sign-in screen.
export async function getSession(req, res) {
  const required = authEnabled();
  const viewer = await viewerFromRequest(req);
  const people = required
    ? await prisma.employee.findMany({
        where: { passwordHash: { not: null } },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      })
    : [];
  res.json({
    required,
    authenticated: required && viewer !== null,
    role: viewer?.role ?? null,
    employeeId: viewer?.employeeId ?? null,
    name: viewer?.name ?? null,
    people,
  });
}

// { password, as? }. as is "admin", "office" or an employee id. Without it the
// password is tried as the admin and then the office password.
export async function login(req, res) {
  if (!authEnabled()) return res.status(400).json({ error: "Login is not switched on for this server." });

  if (loginBlocked(req.ip)) {
    return res.status(429).json({ error: "Too many wrong attempts. Wait 15 minutes and try again." });
  }
  const { password, as } = req.body ?? {};
  const wrong = () => {
    recordFailedLogin(req.ip);
    res.status(401).json({ error: "Wrong password." });
  };

  if (as !== undefined && as !== "admin" && as !== "office") {
    const employee =
      typeof as === "string" && as.length <= 40
        ? await prisma.employee.findUnique({ where: { id: as }, select: { id: true, passwordHash: true } })
        : null;
    if (!employee?.passwordHash || !(await passwordMatches(password, employee.passwordHash))) return wrong();
    clearFailedLogins(req.ip);
    return res.json(issuePersonToken(employee));
  }

  const role = roleForPassword(password);
  if (!role || (as === "admin" && role !== "admin") || (as === "office" && role !== "staff")) return wrong();
  clearFailedLogins(req.ip);
  res.json(issueToken(role));
}
