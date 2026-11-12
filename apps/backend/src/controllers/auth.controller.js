import { prisma } from "../lib/prisma.js";
import {
  authEnabled,
  clearFailedLogins,
  issuePersonToken,
  issueToken,
  loginBlocked,
  MAX_FAILED_LOGINS,
  passwordMatches,
  recordFailedLogin,
  roleForPassword,
  sharedSignIns,
  viewerFromRequest,
} from "../lib/auth.js";
import { actorForViewer, logActivity } from "../lib/activity.js";

// Tells the frontend whether to show a sign-in screen and what the viewer may
// see. Never returns 401. role is "admin", "staff" or null (not signed in);
// with login switched off everyone is an admin. employeeId and name are set
// for a personal sign-in. For the sign-in screen: people lists every employee
// and whether they have their own password yet, and methods says which shared
// passwords exist on the server. Neither reveals a password.
export async function getSession(req, res) {
  const required = authEnabled();
  const viewer = await viewerFromRequest(req);
  const people = required
    ? (
        await prisma.employee.findMany({
          select: { id: true, name: true, passwordHash: true },
          orderBy: { id: "asc" },
        })
      ).map(({ id, name, passwordHash }) => ({ id, name, hasPassword: passwordHash !== null }))
    : [];
  res.json({
    required,
    authenticated: required && viewer !== null,
    role: viewer?.role ?? null,
    employeeId: viewer?.employeeId ?? null,
    name: viewer?.name ?? null,
    people,
    methods: sharedSignIns(),
  });
}

// { password, as? }. as is an employee id for a personal sign-in. Anything else
// ("shared", "admin", "office" or nothing) means a shared password, and the
// password alone decides between admin and office, so picking the wrong one
// in the list never refuses a right password.
export async function login(req, res) {
  if (!authEnabled()) return res.status(400).json({ error: "Login is not switched on for this server." });

  if (loginBlocked(req.ip)) {
    return res.status(429).json({ error: "Too many wrong attempts. Wait 15 minutes and try again." });
  }
  const { password, as } = req.body ?? {};
  // Sign-ins go into the activity log, right and wrong. A wrong attempt is by
  // nobody we know; the entry says whose sign-in was tried.
  const wrong = async (target, whose) => {
    const lockedNow = recordFailedLogin(req.ip);
    await logActivity(prisma, req, {
      action: "session.sign_in_failed",
      entityType: "session",
      entityId: target,
      summary: `Wrong password for ${whose}` + (lockedNow ? `; attempt ${MAX_FAILED_LOGINS}, so this address is locked out for 15 minutes` : ""),
      actor: actorForViewer(null),
    });
    res.status(401).json({ error: "Wrong password." });
  };
  const signedIn = async (viewer, target) => {
    clearFailedLogins(req.ip);
    const actor = actorForViewer(viewer);
    await logActivity(prisma, req, {
      action: "session.signed_in",
      entityType: "session",
      entityId: target,
      summary: `${actor.actorName} signed in`,
      actor,
    });
  };

  if (as !== undefined && as !== "shared" && as !== "admin" && as !== "office") {
    const employee =
      typeof as === "string" && as.length <= 40
        ? await prisma.employee.findUnique({ where: { id: as }, select: { id: true, name: true, passwordHash: true } })
        : null;
    if (!employee?.passwordHash || !(await passwordMatches(password, employee.passwordHash))) {
      return wrong(employee?.id ?? null, employee ? `${employee.name}'s sign-in` : "a sign-in that does not exist");
    }
    await signedIn({ role: "staff", employeeId: employee.id, name: employee.name }, employee.id);
    return res.json(issuePersonToken(employee));
  }

  const role = roleForPassword(password);
  if (!role) return wrong("shared", "the office or admin sign-in");
  await signedIn({ role, employeeId: null, name: null }, role === "admin" ? "admin" : "office");
  res.json(issueToken(role));
}
