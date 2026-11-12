import { prisma } from "../lib/prisma.js";
import { createRateLimit } from "../lib/rateLimit.js";
import { diff, inTransaction, lockAndFind, logActivity, quoted } from "../lib/activity.js";
import { HttpError, sendHttpError } from "../lib/httpError.js";

export const VALID_ENQUIRY_STATUSES = ["new", "contacted", "closed"];
export const MAX_ENQUIRIES_PER_HOUR = 5;
const MAX_NAME = 100;
const MAX_MESSAGE = 1000;

// The form is public, so one address may only send a few enquiries an hour.
export const enquiryLimit = createRateLimit({ max: MAX_ENQUIRIES_PER_HOUR, windowMs: 60 * 60 * 1000 });

const notFound = (res, id) => res.status(404).json({ error: `Enquiry ${id} not found` });

// Enquiry ids are numbers; anything else cannot exist.
function parseId(value) {
  return /^\d{1,9}$/.test(value) ? Number(value) : null;
}

export async function listEnquiries(req, res) {
  res.json(await prisma.enquiry.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
}

// Public: no sign-in needed. Only name, phone and message are taken from the
// visitor; status and createdAt are always set by the server.
export async function createEnquiry(req, res) {
  const body = req.body ?? {};

  // "website" is a hidden field people never see. Only a script fills it in,
  // so answer as if it worked and store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return res.status(201).json({ received: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (name.length > MAX_NAME) return res.status(400).json({ error: `Name must be ${MAX_NAME} characters or fewer.` });

  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const digits = phone.replace(/\D/g, "").length;
  if (!/^[\d\s()+-]+$/.test(phone) || digits < 7 || digits > 15) {
    return res.status(400).json({ error: "Please enter a valid phone number." });
  }

  let message = null;
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== "string") return res.status(400).json({ error: "message must be text." });
    if (body.message.trim().length > MAX_MESSAGE) {
      return res.status(400).json({ error: `Message must be ${MAX_MESSAGE} characters or fewer.` });
    }
    message = body.message.trim() || null;
  }

  // Counted only once the enquiry is valid, so a typo does not use up a turn.
  if (!enquiryLimit.take(req.ip)) {
    return res.status(429).json({ error: "Too many enquiries from this connection. Please call us or try again in an hour." });
  }

  await inTransaction(async (tx) => {
    const enquiry = await tx.enquiry.create({ data: { name, phone, message } });
    await logActivity(tx, req, {
      action: "enquiry.received",
      entityType: "enquiry",
      entityId: enquiry.id,
      summary: `Website enquiry from ${quoted(name)}`,
      changes: diff(null, enquiry),
    });
  });
  // The visitor gets a plain acknowledgement, not the stored record.
  res.status(201).json({ received: true });
}

export async function updateEnquiry(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, req.params.id);

  const { status } = req.body ?? {};
  if (!VALID_ENQUIRY_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_ENQUIRY_STATUSES.join(", ")}` });
  }

  try {
    const enquiry = await inTransaction(async (tx) => {
      const before = await lockAndFind(tx, "enquiry", id);
      if (!before) throw new HttpError(404, `Enquiry ${id} not found`);
      const updated = await tx.enquiry.update({ where: { id }, data: { status } });
      const changes = diff(before, updated);
      if (changes) {
        await logActivity(tx, req, {
          action: "enquiry.status_changed",
          entityType: "enquiry",
          entityId: id,
          summary: `Marked the enquiry from ${quoted(updated.name)} as ${status}`,
          changes,
        });
      }
      return updated;
    });
    res.json(enquiry);
  } catch (err) {
    sendHttpError(res, err);
  }
}

export async function deleteEnquiry(req, res) {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, req.params.id);

  try {
    await inTransaction(async (tx) => {
      const before = await lockAndFind(tx, "enquiry", id);
      if (!before) throw new HttpError(404, `Enquiry ${id} not found`);
      await tx.enquiry.delete({ where: { id } });
      await logActivity(tx, req, {
        action: "enquiry.deleted",
        entityType: "enquiry",
        entityId: id,
        summary: `Deleted the enquiry from ${quoted(before.name)} (${before.phone})`,
        changes: diff(before, null),
      });
    });
    res.status(204).end();
  } catch (err) {
    sendHttpError(res, err);
  }
}
