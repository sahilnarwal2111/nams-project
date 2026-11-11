import { prisma } from "../lib/prisma.js";
import { parseDate } from "../lib/dates.js";
import { ADMIN_ONLY_MESSAGE } from "../lib/auth.js";
import { diff, inTransaction, lockAndFind, logActivity, quoted, rupees } from "../lib/activity.js";
import { HttpError, sendHttpError } from "../lib/httpError.js";

// What a viewer may see of a client: only an admin gets the amount due. Staff
// still get the status, so they know whether payment is received or pending.
function forRole(client, role) {
  if (role === "admin") return client;
  const rest = { ...client };
  delete rest.due;
  return rest;
}

const VALID_STATUSES = ["paid", "due-soon", "overdue"];
const TEXT_FIELDS = ["name", "contact", "phone"];
// Next id = highest existing c# number + 1, compared numerically.
async function nextClientId() {
  const rows = await prisma.client.findMany({ select: { id: true } });
  let max = 0;
  for (const { id } of rows) {
    const m = /^c(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `c${max + 1}`;
}

export async function createClient(req, res) {
  const body = req.body ?? {};

  for (const field of TEXT_FIELDS) {
    if (typeof body[field] !== "string" || body[field].trim() === "") {
      return res.status(400).json({ error: `${field} is required` });
    }
  }
  for (const field of ["due", "invoiceDate", "status"]) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return res.status(400).json({ error: `${field} is required` });
    }
  }
  const { name, contact, phone, due, status } = body;

  if (!Number.isInteger(due) || due < 0) {
    return res.status(400).json({ error: "due must be a whole number of rupees, zero or more" });
  }
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  const invoiceDate = parseDate(body.invoiceDate);
  if (!invoiceDate) {
    return res.status(400).json({ error: "invoiceDate must be YYYY-MM-DD or an ISO timestamp" });
  }
  let lastCall = new Date();
  if (body.lastCall !== undefined && body.lastCall !== null) {
    lastCall = parseDate(body.lastCall);
    if (!lastCall) return res.status(400).json({ error: "lastCall must be YYYY-MM-DD or an ISO timestamp" });
  }
  let notes = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") return res.status(400).json({ error: "notes must be a string" });
    notes = body.notes;
  }

  // Retry if a concurrent request grabbed the same id (unique violation).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const id = await nextClientId();
      const client = await inTransaction(async (tx) => {
        const created = await tx.client.create({
          data: { id, name: name.trim(), contact: contact.trim(), phone: phone.trim(), due, invoiceDate, lastCall, status, notes },
        });
        await logActivity(tx, req, {
          action: "client.created",
          entityType: "client",
          entityId: created.id,
          summary: `Added client ${quoted(created.name)} with ${rupees(created.due)} due`,
          changes: diff(null, created),
        });
        return created;
      });
      return res.status(201).json(client);
    } catch (err) {
      if (err.code !== "P2002") throw err;
    }
  }
  throw new Error("Could not allocate a client id");
}

export async function listClients(req, res) {
  const clients = await prisma.client.findMany({ orderBy: { id: "asc" } });
  res.json(clients.map((client) => forRole(client, req.role)));
}

const EDITABLE_FIELDS = ["name", "contact", "phone", "due", "invoiceDate", "lastCall", "status", "notes"];
const CLIENT_FIELD_LABELS = { due: "amount due", invoiceDate: "invoice date", lastCall: "last call" };

// Validates the editable fields present in body, applying the same rules as POST.
// Returns { data } or { error }. `id` and unknown keys are ignored.
function parseClientPatch(body) {
  const data = {};
  for (const field of EDITABLE_FIELDS) {
    const value = body[field];
    if (value === undefined) continue;
    if (TEXT_FIELDS.includes(field)) {
      if (typeof value !== "string" || value.trim() === "") return { error: `${field} is required` };
      data[field] = value.trim();
    } else if (field === "due") {
      if (!Number.isInteger(value) || value < 0) {
        return { error: "due must be a whole number of rupees, zero or more" };
      }
      data.due = value;
    } else if (field === "status") {
      if (!VALID_STATUSES.includes(value)) {
        return { error: `status must be one of: ${VALID_STATUSES.join(", ")}` };
      }
      data.status = value;
    } else if (field === "invoiceDate" || field === "lastCall") {
      const d = parseDate(value);
      if (!d) return { error: `${field} must be YYYY-MM-DD or an ISO timestamp` };
      data[field] = d;
    } else if (field === "notes") {
      if (value !== null && typeof value !== "string") return { error: "notes must be a string" };
      data.notes = value;
    }
  }
  return { data };
}

// With no editable fields in the body, logs a call (lastCall = now); otherwise
// updates only the fields sent and leaves lastCall alone unless it is sent.
export async function updateClient(req, res) {
  const { id } = req.params;
  const { data, error } = parseClientPatch(req.body ?? {});
  if (error) return res.status(400).json({ error });
  // Logging a call is open to all staff; editing the record is not.
  const callOnly = Object.keys(data).length === 0;
  if (callOnly) data.lastCall = new Date();
  else if (req.role !== "admin") return res.status(403).json({ error: ADMIN_ONLY_MESSAGE });

  try {
    const client = await inTransaction(async (tx) => {
      const before = await lockAndFind(tx, "client", id);
      if (!before) throw new HttpError(404, `Client ${id} not found`);
      const updated = await tx.client.update({ where: { id }, data });
      const changes = diff(before, updated);
      if (changes) {
        const fields = Object.keys(changes).map((field) => CLIENT_FIELD_LABELS[field] ?? field);
        await logActivity(tx, req, {
          action: callOnly ? "client.call_logged" : "client.updated",
          entityType: "client",
          entityId: id,
          summary: callOnly
            ? `Logged a reminder call to ${quoted(updated.name)}`
            : `Edited client ${quoted(updated.name)}: changed ${fields.join(", ")}`,
          changes,
        });
      }
      return updated;
    });
    res.json(forRole(client, req.role));
  } catch (err) {
    sendHttpError(res, err);
  }
}

export async function deleteClient(req, res) {
  const { id } = req.params;
  try {
    await inTransaction(async (tx) => {
      const before = await lockAndFind(tx, "client", id);
      if (!before) throw new HttpError(404, `Client ${id} not found`);
      // Deleting a client deletes its payments, so they go into the log too.
      const payments = await tx.payment.findMany({
        where: { clientId: id },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
        select: { id: true, amount: true, receivedAt: true, note: true },
      });
      await tx.client.delete({ where: { id } });
      const changes = diff(before, null);
      if (payments.length > 0) changes.payments = { from: payments, to: null };
      await logActivity(tx, req, {
        action: "client.deleted",
        entityType: "client",
        entityId: id,
        summary:
          `Deleted client ${quoted(before.name)} with ${rupees(before.due)} due` +
          (payments.length > 0 ? ` and ${payments.length} recorded payment${payments.length === 1 ? "" : "s"}` : ""),
        changes,
      });
    });
    res.status(204).end();
  } catch (err) {
    sendHttpError(res, err);
  }
}
