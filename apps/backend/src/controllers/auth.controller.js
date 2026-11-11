import {
  authEnabled,
  clearFailedLogins,
  issueToken,
  loginBlocked,
  recordFailedLogin,
  roleForPassword,
  roleFromRequest,
} from "../lib/auth.js";

// Tells the frontend whether to show a sign-in screen and what the viewer may
// see. Never returns 401. role is "admin", "staff" or null (not signed in);
// with login switched off everyone is an admin.
export function getSession(req, res) {
  const required = authEnabled();
  const role = roleFromRequest(req);
  res.json({ required, authenticated: required && role !== null, role });
}

export function login(req, res) {
  if (!authEnabled()) return res.status(400).json({ error: "Login is not switched on for this server." });

  if (loginBlocked(req.ip)) {
    return res.status(429).json({ error: "Too many wrong attempts. Wait 15 minutes and try again." });
  }
  const role = roleForPassword(req.body?.password);
  if (!role) {
    recordFailedLogin(req.ip);
    return res.status(401).json({ error: "Wrong password." });
  }
  clearFailedLogins(req.ip);
  res.json(issueToken(role));
}
