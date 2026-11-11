import crypto from "node:crypto";

// Staff login with one shared password, set as APP_PASSWORD on the server.
// While APP_PASSWORD is unset, login is switched off and the API is open: that
// is the local-development and test default.
//
// A token is "<expiry ms>.<signature>". The signing key is derived from the
// password, so changing APP_PASSWORD signs everyone out. No database table and
// no extra dependency.

export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const authEnabled = () => (process.env.APP_PASSWORD ?? "") !== "";

const digest = (text) => crypto.createHash("sha256").update(text).digest();
const signingKey = () => digest(`nk-consultancy-token-key:${process.env.APP_PASSWORD}`);
const sign = (expires) => crypto.createHmac("sha256", signingKey()).update(String(expires)).digest("base64url");

// Compare in constant time. Hashing first makes both sides the same length.
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(String(a)), digest(String(b)));

export function checkPassword(password) {
  return authEnabled() && typeof password === "string" && safeEqual(password, process.env.APP_PASSWORD);
}

export function issueToken(now = Date.now()) {
  const expires = now + TOKEN_TTL_MS;
  return { token: `${expires}.${sign(expires)}`, expiresAt: new Date(expires).toISOString() };
}

export function verifyToken(token, now = Date.now()) {
  if (!authEnabled() || typeof token !== "string") return false;
  const [expires, signature, ...rest] = token.split(".");
  if (rest.length > 0 || !/^\d+$/.test(expires ?? "") || !signature) return false;
  return safeEqual(signature, sign(expires)) && Number(expires) > now;
}

export function tokenFromRequest(req) {
  const match = /^Bearer (.+)$/.exec(req.get("authorization") ?? "");
  return match ? match[1] : null;
}

// Everything behind this needs a valid token once login is switched on.
export function requireAuth(req, res, next) {
  if (!authEnabled() || verifyToken(tokenFromRequest(req))) return next();
  res.status(401).json({ error: "Please sign in." });
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
