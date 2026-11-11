import { prisma } from "../lib/prisma.js";
import { ACTOR_TYPES } from "../lib/activity.js";

// The first part of an action: "task" in "task.moved".
export const ACTIVITY_TYPES = ["task", "client", "payment", "enquiry", "employee", "session"];
const ENTITY_TYPES = ["task", "client", "enquiry", "employee", "session"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const bad = (res, error) => res.status(400).json({ error });

// Admin only: the entries hold amounts. Newest first, a page at a time.
// Query, all optional:
//   limit       1 to 200, default 50
//   before      an entry id; returns entries older than it (use nextBefore)
//   actor       an employee id, or one of person|admin|office|public|unknown|open
//   type        task|client|payment|enquiry|employee|session
//   entityType + entityId   everything done to one record, e.g. task + NK-104
// There is deliberately no way to change or remove an entry.
export async function listActivity(req, res) {
  const query = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value !== "string") return bad(res, `${key} must be given once`);
    if (value !== "") query[key] = value;
  }

  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    if (!/^\d{1,4}$/.test(query.limit) || Number(query.limit) < 1) return bad(res, `limit must be a number from 1 to ${MAX_LIMIT}`);
    limit = Math.min(Number(query.limit), MAX_LIMIT);
  }

  const where = {};
  if (query.before !== undefined) {
    if (!/^\d{1,9}$/.test(query.before)) return bad(res, "before must be an entry id");
    where.id = { lt: Number(query.before) };
  }
  if (query.actor !== undefined) {
    if (query.actor.length > 40) return bad(res, "actor must be an employee id or a kind of sign-in");
    if (ACTOR_TYPES.includes(query.actor)) where.actorType = query.actor;
    else where.actorId = query.actor;
  }
  if (query.type !== undefined) {
    if (!ACTIVITY_TYPES.includes(query.type)) return bad(res, `type must be one of: ${ACTIVITY_TYPES.join(", ")}`);
    where.action = { startsWith: `${query.type}.` };
  }
  if (query.entityType !== undefined || query.entityId !== undefined) {
    if (!ENTITY_TYPES.includes(query.entityType) || query.entityId === undefined || query.entityId.length > 40) {
      return bad(res, `entityType (one of: ${ENTITY_TYPES.join(", ")}) and entityId go together`);
    }
    where.entityType = query.entityType;
    where.entityId = query.entityId;
  }

  // One extra row says whether there is an older page.
  const rows = await prisma.activityLog.findMany({ where, orderBy: { id: "desc" }, take: limit + 1 });
  const entries = rows.slice(0, limit);
  res.json({ entries, nextBefore: rows.length > limit ? entries[entries.length - 1].id : null });
}
