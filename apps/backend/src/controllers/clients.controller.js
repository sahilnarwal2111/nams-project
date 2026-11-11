import { prisma } from "../lib/prisma.js";

const VALID_STATUSES = ["paid", "due-soon", "overdue"];
const TEXT_FIELDS = ["name", "contact", "phone"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

// Accepts YYYY-MM-DD or a full ISO timestamp; returns a Date or null.
function parseDate(value) {
  if (typeof value !== "string") return null;
  if (DATE_ONLY.test(value)) {
    const d = new Date(`${value}T00:00:00.000Z`);
    // Reject overflow dates such as 2026-02-30.
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
  }
  if (!ISO_TIMESTAMP.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
      const client = await prisma.client.create({
        data: {
          id: await nextClientId(),
          name: name.trim(),
          contact: contact.trim(),
          phone: phone.trim(),
          due,
          invoiceDate,
          lastCall,
          status,
          notes,
        },
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
  res.json(clients);
}

export async function logClientCall(req, res) {
  const { id } = req.params;

  try {
    const client = await prisma.client.update({ where: { id }, data: { lastCall: new Date() } });
    res.json(client);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: `Client ${id} not found` });
    throw err;
  }
}
