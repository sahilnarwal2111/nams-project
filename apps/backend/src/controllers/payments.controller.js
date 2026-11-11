import { prisma } from "../lib/prisma.js";
import { parseDate } from "../lib/dates.js";
import { inTransaction, lockAndFind, logActivity, quoted, rupees } from "../lib/activity.js";
import { HttpError, sendHttpError } from "../lib/httpError.js";
import { presentTask, receivedFor } from "../lib/billing.js";

// Payments are recorded against a task (a ticket). All of this is admin only;
// the router sees to that.

const notFound = (id) => new HttpError(404, `Task ${id} not found`);

export async function listPayments(req, res) {
  const { id } = req.params;
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true } });
  if (!task) return res.status(404).json({ error: `Task ${id} not found` });

  const payments = await prisma.payment.findMany({
    where: { taskId: id },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
  });
  res.json(payments);
}

// Records money received for a task. The task is locked while the balance is
// checked, so two payments arriving together cannot add up to more than the
// amount to charge. A part payment leaves the task "part"; the rest "paid".
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
      const task = await lockAndFind(tx, "task", id);
      if (!task) throw notFound(id);
      if (task.fee === null) throw new HttpError(400, `Set the amount to charge for ${id} before recording a payment`);
      const before = await receivedFor(tx, id);
      const due = task.fee - before;
      if (amount > due) throw new HttpError(400, `amount is more than the outstanding ${due}`);

      const payment = await tx.payment.create({ data: { taskId: id, amount, note, receivedAt } });
      const left = due - amount;
      await logActivity(tx, req, {
        action: "payment.recorded",
        entityType: "task",
        entityId: id,
        summary:
          `Recorded ${rupees(amount)} received for ${id} ${quoted(task.title)}; ` +
          (left === 0 ? "now paid in full" : `${rupees(left)} still due`),
        changes: {
          paymentId: { from: null, to: payment.id },
          amount: { from: null, to: amount },
          receivedAt: { from: null, to: payment.receivedAt.toISOString() },
          ...(payment.note ? { note: { from: null, to: payment.note } } : {}),
          received: { from: before, to: before + amount },
        },
      });
      return { payment, task: await presentTask(tx, task, req.role) };
    });
    res.status(201).json(result);
  } catch (err) {
    sendHttpError(res, err);
  }
}

// Takes back a payment recorded by mistake. The payment stays readable in the
// activity log.
export async function removePayment(req, res) {
  const { id, paymentId } = req.params;
  try {
    const result = await inTransaction(async (tx) => {
      const task = await lockAndFind(tx, "task", id);
      if (!task) throw notFound(id);
      const payment = /^\d{1,9}$/.test(paymentId)
        ? await tx.payment.findFirst({ where: { id: Number(paymentId), taskId: id } })
        : null;
      if (!payment) throw new HttpError(404, `Payment ${paymentId} not found on ${id}`);

      const before = await receivedFor(tx, id);
      await tx.payment.delete({ where: { id: payment.id } });
      await logActivity(tx, req, {
        action: "payment.removed",
        entityType: "task",
        entityId: id,
        summary: `Removed the payment of ${rupees(payment.amount)} from ${id} ${quoted(task.title)}; ${rupees(task.fee - before + payment.amount)} now due`,
        changes: {
          paymentId: { from: payment.id, to: null },
          amount: { from: payment.amount, to: null },
          receivedAt: { from: payment.receivedAt.toISOString(), to: null },
          ...(payment.note ? { note: { from: payment.note, to: null } } : {}),
          received: { from: before, to: before - payment.amount },
        },
      });
      return { task: await presentTask(tx, task, req.role) };
    });
    res.json(result);
  } catch (err) {
    sendHttpError(res, err);
  }
}
