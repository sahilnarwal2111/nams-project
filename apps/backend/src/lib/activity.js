import { prisma } from "./prisma.js";
import { authEnabled } from "./auth.js";

// The activity log: who did what, and when. See ActivityLog in schema.prisma.
//
// How to use it in a handler that changes data:
//   const result = await inTransaction(async (tx) => {
//     const before = await lockAndFind(tx, "task", id);
//     const after = await tx.task.update(...);
//     await logActivity(tx, req, { action, entityType, entityId, summary, changes: diff(before, after) });
//     return after;
//   });
// The entry is written by the same transaction as the change, so a change
// cannot be saved without its entry, and a failed change leaves no entry.

// Room for a slow first connection after the database has been asleep.
export const inTransaction = (fn) => prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });

const TABLES = { task: "Task", enquiry: "Enquiry", employee: "Employee" };

// Reads a record and holds it until the transaction ends, so the "before" in
// the log is exactly what the change replaced, even when two people save at
// the same moment. Returns null if there is no such record.
export async function lockAndFind(tx, entityType, id) {
  await tx.$queryRawUnsafe(`SELECT 1 FROM "${TABLES[entityType]}" WHERE id = $1 FOR UPDATE`, id);
  return tx[entityType].findUnique({ where: { id } });
}

/* ---- who ---------------------------------------------------------------- */

export const ACTOR_TYPES = ["person", "admin", "office", "public", "unknown", "open"];

const PUBLIC_ACTOR = { actorType: "public", actorId: null, actorName: "Website visitor" };
const UNKNOWN_ACTOR = { actorType: "unknown", actorId: null, actorName: "Not signed in" };

// The actor for a viewer as returned by viewerFromRequest.
export function actorForViewer(viewer) {
  if (!authEnabled()) return { actorType: "open", actorId: null, actorName: "Sign-in switched off" };
  if (!viewer) return UNKNOWN_ACTOR;
  if (viewer.employeeId) return { actorType: "person", actorId: viewer.employeeId, actorName: viewer.name ?? viewer.employeeId };
  if (viewer.role === "admin") return { actorType: "admin", actorId: null, actorName: "Admin" };
  return { actorType: "office", actorId: null, actorName: "Office sign-in" };
}

// requireAuth leaves the viewer on the request. A request that never went
// through it (the public enquiry form) is a website visitor.
const actorFromRequest = (req) => (req.viewer ? actorForViewer(req.viewer) : PUBLIC_ACTOR);

/* ---- what changed ------------------------------------------------------- */

// Never written to the log: secrets, and bookkeeping that changes on every save.
const SKIPPED_FIELDS = new Set(["passwordHash", "updatedAt"]);

const plain = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));
const isEmpty = (value) => value === null || (Array.isArray(value) && value.length === 0);

// { field: { from, to } } for every field that differs between two records.
// Pass null as `before` for a new record or as `after` for a deleted one.
// Returns null when nothing changed.
export function diff(before, after) {
  const changes = {};
  for (const field of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (SKIPPED_FIELDS.has(field)) continue;
    const from = plain(before?.[field]);
    const to = plain(after?.[field]);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    if (isEmpty(from) && isEmpty(to)) continue;
    changes[field] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

/* ---- writing ------------------------------------------------------------ */

const cut = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// A record's name inside a summary line, in quotes and kept short.
export const quoted = (text) => `“${cut(String(text), 80)}”`;

export const rupees = (amount) => `₹${Number(amount).toLocaleString("en-IN")}`;

// Adds one entry. `db` is the transaction doing the change (or prisma itself
// when there is no change to tie it to, as for a sign-in). `actor` overrides
// who the request says it is, for sign-in attempts.
export function logActivity(db, req, { action, entityType, entityId = null, summary, changes = null, actor }) {
  const userAgent = req.get("user-agent");
  return db.activityLog.create({
    data: {
      ...(actor ?? actorFromRequest(req)),
      action,
      entityType,
      entityId: entityId === null ? null : String(entityId),
      summary: cut(summary, 500),
      changes: changes ?? undefined,
      ip: req.ip ?? null,
      userAgent: userAgent ? cut(userAgent, 300) : null,
    },
  });
}
