import crypto from "node:crypto";

// Sign-in with two shared passwords, set on the server:
//   APP_PASSWORD    the office password. Signs in as "staff": everything except
//                   money amounts.
//   ADMIN_PASSWORD  signs in as "admin": amounts, payments and client records.
// While both are unset, login is switched off and the API is open with admin
// rights: that is the local-development and test default.
//
// A token is "<role>.<expiry ms>.<signature>". The signing key is derived from
// that role's password, so changing a password signs that role out. No database
// table and no extra dependency.

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PASSWORD_ENV = { staff: "APP_PASSWORD", admin: "ADMIN_PASSWORD" };
const passwordFor = (role) => process.env[PASSWORD_ENV[role]] ?? "";

export const authEnabled = () => passwordFor("staff") !== "" || passwordFor("admin") !== "";

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
  if (typeof token !== "string") return null;
  const [role, expires, signature, ...rest] = token.split(".");
  if (rest.length > 0 || !Object.hasOwn(PASSWORD_ENV, role) || !/^\d+$/.test(expires ?? "") || !signature) return null;
  if (passwordFor(role) === "") return null;
  return safeEqual(signature, sign(role, expires)) && Number(expires) > now ? role : null;
}

export function tokenFromRequest(req) {
  const match = /^Bearer (.+)$/.exec(req.get("authorization") ?? "");
  return match ? match[1] : null;
}

// "admin" or "staff" for this request, or null when sign-in is needed. With
// login switched off everyone is an admin.
export const roleFromRequest = (req) => (authEnabled() ? verifyToken(tokenFromRequest(req)) : "admin");

// Everything behind this needs a valid token once login is switched on.
// Sets req.role for the handlers.
export function requireAuth(req, res, next) {
  req.role = roleFromRequest(req);
  if (req.role) return next();
  res.status(401).json({ error: "Please sign in." });
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
}

export const clearFailedLogins = (ip) => (ip === undefined ? failures.clear() : failures.delete(ip));
