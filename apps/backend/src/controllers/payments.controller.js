import { prisma } from "../lib/prisma.js";
import { parseDate } from "../lib/dates.js";
import { inTransaction, logActivity, quoted, rupees } from "../lib/activity.js";
import { HttpError, sendHttpError } from "../lib/httpError.js";

export async function listPayments(req, res) {
  const { id } = req.params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return res.status(404).json({ error: `Client ${id} not found` });

  const payments = await prisma.payment.findMany({
    where: { clientId: id },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
  });
  res.json(payments);
}

// Records money received: stores the payment and lowers the client's dues in
// one transaction. A client who has cleared everything becomes "paid".
export async function recordPayment(req, res) {
  const { id } = req.params;
  const body = req.body ?? {};
  const { amount } = body;

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "amount must be a whole number of rupees, more than zero" });
  }
  let note = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return res.status(400).json({ error: "note must be a string" });
    note = body.note.trim() === "" ? null : body.note.trim();
  }
  let receivedAt;
  if (body.receivedAt !== undefined && body.receivedAt !== null) {
    receivedAt = parseDate(body.receivedAt);
    if (!receivedAt) return res.status(400).json({ error: "receivedAt must be YYYY-MM-DD or an ISO timestamp" });
  }

  try {
    const result = await inTransaction(async (tx) => {
      // The condition and the decrement are one statement, so two payments
      // arriving together cannot take the balance below zero.
      const { count } = await tx.client.updateMany({
        where: { id, due: { gte: amount } },
        data: { due: { decrement: amount } },
      });
      if (count === 0) {
        const existing = await tx.client.findUnique({ where: { id }, select: { due: true } });
        if (!existing) throw new HttpError(404, `Client ${id} not found`);
        throw new HttpError(400, `amount is more than the outstanding ${existing.due}`);
      }
      let client = await tx.client.findUnique({ where: { id } });
      const statusBefore = client.status;
      if (client.due === 0 && client.status !== "paid") {
        client = await tx.client.update({ where: { id }, data: { status: "paid" } });
      }
      const payment = await tx.payment.create({ data: { clientId: id, amount, note, receivedAt } });
      // Filed under the client, so a client's history includes its payments.
      await logActivity(tx, req, {
        action: "payment.recorded",
        entityType: "client",
        entityId: id,
        summary: `Recorded ${rupees(amount)} received from ${quoted(client.name)}; ${rupees(client.due)} still due`,
        changes: {
          paymentId: { from: null, to: payment.id },
          amount: { from: null, to: amount },
          receivedAt: { from: null, to: payment.receivedAt.toISOString() },
          ...(payment.note ? { note: { from: null, to: payment.note } } : {}),
          due: { from: client.due + amount, to: client.due },
          ...(statusBefore !== client.status ? { status: { from: statusBefore, to: client.status } } : {}),
        },
      });
      return { payment, client };
    });
    res.status(201).json(result);
  } catch (err) {
    sendHttpError(res, err);
  }
}
