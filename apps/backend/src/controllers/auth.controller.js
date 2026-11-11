import {
  authEnabled,
  checkPassword,
  clearFailedLogins,
  issueToken,
  loginBlocked,
  recordFailedLogin,
  tokenFromRequest,
  verifyToken,
} from "../lib/auth.js";

// Tells the frontend whether to show a sign-in screen. Never returns 401.
export function getSession(req, res) {
  const required = authEnabled();
  res.json({ required, authenticated: required && verifyToken(tokenFromRequest(req)) });
}

export function login(req, res) {
  if (!authEnabled()) return res.status(400).json({ error: "Login is not switched on for this server." });

  if (loginBlocked(req.ip)) {
    return res.status(429).json({ error: "Too many wrong attempts. Wait 15 minutes and try again." });
  }
  if (!checkPassword(req.body?.password)) {
    recordFailedLogin(req.ip);
    return res.status(401).json({ error: "Wrong password." });
  }
  clearFailedLogins(req.ip);
  res.json(issueToken());
}
