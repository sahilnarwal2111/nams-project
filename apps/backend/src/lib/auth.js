import crypto from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./prisma.js";

// Sign-in with two shared passwords, set on the server, plus personal ones:
//   APP_PASSWORD    the office password. Signs in as "staff": everything except
//                   money amounts.
//   ADMIN_PASSWORD  signs in as "admin": amounts, payments and client records.
//   personal        each employee's own password, set by an admin and stored
//                   hashed on Employee. Signs in as "staff" who is also known
//                   by name, so they can change their own tasks.
// Personal passwords only work while sign-in is switched on.
// While both are unset, login is switched off and the API is open with admin
// rights: that is the local-development and test default.
//
// A token is "<role>.<expiry ms>.<signature>". The signing key is derived from
// that role's password, so changing a password signs that role out. No database
// table and no extra dependency. A personal token is
// "person.<employee id>.<expiry ms>.<signature>", signed with a key derived
// from that person's stored hash, so a new password signs them out.

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PASSWORD_ENV = { staff: "APP_PASSWORD", admin: "ADMIN_PASSWORD" };
// Trimmed, so a space or line break pasted into the Render dashboard does not
// lock everyone out.
const passwordFor = (role) => (process.env[PASSWORD_ENV[role]] ?? "").trim();

export const authEnabled = () => passwordFor("staff") !== "" || passwordFor("admin") !== "";

// Which shared passwords exist on the server. The sign-in screen uses this to
// say so plainly when no admin password has been set, instead of answering
// "Wrong password" to every attempt.
export const sharedSignIns = () => ({ admin: passwordFor("admin") !== "", office: passwordFor("staff") !== "" });

const digest = (text) => crypto.createHash("sha256").update(text).digest();
const signingKey = (role) => digest(`nk-consultancy-token-key:${role}:${passwordFor(role)}`);
const sign = (role, expires) =>
  crypto.createHmac("sha256", signingKey(role)).update(`${role}.${expires}`).digest("base64url");

// Compare in constant time. Hashing first makes both sides the same length.
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(String(a)), digest(String(b)));

// The role a password signs in as, or null. Admin is checked first, so if both
// passwords are the same everyone is an admin.
export function roleForPassword(password) {
  if (typeof password !== "string") return null;
  for (const role of ["admin", "staff"]) {
    if (passwordFor(role) !== "" && safeEqual(password, passwordFor(role))) return role;
  }
  return null;
}

export function issueToken(role, now = Date.now()) {
  const expires = now + TOKEN_TTL_MS;
  return { token: `${role}.${expires}.${sign(role, expires)}`, expiresAt: new Date(expires).toISOString(), role };
}

// The role a token was issued for, or null if it is forged, expired or for a
// role whose password has since been removed or changed.
export function verifyToken(token, now = Date.now()) {
  if (typeof token !== "string" || token.startsWith("person.")) return null;
  const [role, expires, signature, ...rest] = token.split(".");
  if (rest.length > 0 || !Object.hasOwn(PASSWORD_ENV, role) || !/^\d+$/.test(expires ?? "") || !signature) return null;
  if (passwordFor(role) === "") return null;
  return safeEqual(signature, sign(role, expires)) && Number(expires) > now ? role : null;
}

export function tokenFromRequest(req) {
  const match = /^Bearer (.+)$/.exec(req.get("authorization") ?? "");
  return match ? match[1] : null;
}

/* ---- personal passwords ---------------------------------------------- */

const scrypt = promisify(crypto.scrypt);
export const MIN_PERSONAL_PASSWORD = 6;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function passwordMatches(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const personKey = (id, stored) => digest(`nk-consultancy-person-key:${id}:${stored}`);
const signPerson = (id, stored, expires) =>
  crypto.createHmac("sha256", personKey(id, stored)).update(`person.${id}.${expires}`).digest("base64url");

export function issuePersonToken(employee, now = Date.now()) {
  const expires = now + TOKEN_TTL_MS;
  return {
    token: `person.${employee.id}.${expires}.${signPerson(employee.id, employee.passwordHash, expires)}`,
    expiresAt: new Date(expires).toISOString(),
    role: "staff",
    employeeId: employee.id,
  };
}

// The employee a personal token belongs to, or null.
async function verifyPersonToken(token, now) {
  const [kind, id, expires, signature, ...rest] = token.split(".");
  if (kind !== "person" || rest.length > 0 || !/^[\w-]{1,40}$/.test(id ?? "") || !/^\d+$/.test(expires ?? "") || !signature) {
    return null;
  }
  if (Number(expires) <= now) return null;
  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true, name: true, passwordHash: true } });
  if (!employee?.passwordHash) return null;
  return safeEqual(signature, signPerson(id, employee.passwordHash, expires)) ? employee : null;
}

/* ---- who is asking ----------------------------------------------------- */

// { role, employeeId, name } for this request, or null when sign-in is
// needed. role is "admin" or "staff"; employeeId is set only for a personal
// sign-in. With login switched off everyone is an admin.
export async function viewerFromRequest(req, now = Date.now()) {
  if (!authEnabled()) return { role: "admin", employeeId: null, name: null };
  const token = tokenFromRequest(req);
  if (typeof token !== "string") return null;
  if (token.startsWith("person.")) {
    const employee = await verifyPersonToken(token, now);
    return employee ? { role: "staff", employeeId: employee.id, name: employee.name } : null;
  }
  const role = verifyToken(token, now);
  return role ? { role, employeeId: null, name: null } : null;
}

// Everything behind this needs a valid token once login is switched on.
// Sets req.role ("admin" or "staff") and req.employeeId (a personal sign-in,
// else null) for the handlers.
export async function requireAuth(req, res, next) {
  const viewer = await viewerFromRequest(req);
  if (!viewer) return res.status(401).json({ error: "Please sign in." });
  req.role = viewer.role;
  req.employeeId = viewer.employeeId;
  // The whole viewer, name included, for the activity log.
  req.viewer = viewer;
  next();
}

export const ADMIN_ONLY_MESSAGE = "Only an admin can do this.";

// For routes that show or change money. Use after requireAuth.
export function requireAdmin(req, res, next) {
  if (req.role === "admin") return next();
  res.status(403).json({ error: ADMIN_ONLY_MESSAGE });
}

// Slows down password guessing: a few wrong attempts per address, then a wait.
// Held in memory, which is enough for one small server.
export const MAX_FAILED_LOGINS = 8;
export const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map();

export function loginBlocked(ip, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_LOGINS;
}

export function recordFailedLogin(ip, now = Date.now()) {
  const entry = failures.get(ip);
  if (!entry || entry.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + LOCKOUT_MS });
  else entry.count += 1;
  // Whether this attempt was the one that locked the address out.
  return failures.get(ip).count === MAX_FAILED_LOGINS;
}

export const clearFailedLogins = (ip) => (ip === undefined ? failures.clear() : failures.delete(ip));
