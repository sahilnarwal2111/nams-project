import { ADMIN_ONLY_MESSAGE } from "./auth.js";
import { HttpError } from "./httpError.js";

// Receivables are kept per ticket. Task.fee is the amount to charge and the
// Payment rows are the money received. The payment status is worked out from
// those two every time, never stored, so it cannot drift from the payments.

// "unset"  no amount to charge has been entered yet
// "unpaid" nothing received
// "part"   some received, some still due
// "paid"   received in full (work with a fee of 0 is not charged, so also paid)
export const PAYMENT_STATUSES = ["unset", "unpaid", "part", "paid"];

export function paymentStatus(fee, received) {
  if (fee === null || fee === undefined) return "unset";
  if (received >= fee) return "paid";
  return received > 0 ? "part" : "unpaid";
}

// Total received per task id, for the given tasks (or all of them).
export async function receivedByTask(db, taskIds) {
  const rows = await db.payment.groupBy({
    by: ["taskId"],
    where: taskIds ? { taskId: { in: taskIds } } : undefined,
    _sum: { amount: true },
  });
  return new Map(rows.map((row) => [row.taskId, row._sum.amount ?? 0]));
}

export async function receivedFor(db, taskId) {
  const { _sum } = await db.payment.aggregate({ where: { taskId }, _sum: { amount: true } });
  return _sum.amount ?? 0;
}

// What a viewer may see of a task. Everyone gets paymentStatus. Only an admin
// gets the amounts: fee and received.
export function taskForRole(task, received, role) {
  const shown = { ...task, paymentStatus: paymentStatus(task.fee, received) };
  if (role === "admin") shown.received = received;
  else delete shown.fee;
  return shown;
}

export const presentTask = async (db, task, role) => taskForRole(task, await receivedFor(db, task.id), role);

export async function presentTasks(db, tasks, role) {
  const received = await receivedByTask(db);
  return tasks.map((task) => taskForRole(task, received.get(task.id) ?? 0, role));
}

// Reads `fee` from a request body: { fee } when it was sent and is valid,
// {} when it was not sent. Throws HttpError otherwise. null clears it.
export function parseFee(body, role) {
  if (body.fee === undefined) return {};
  if (role !== "admin") throw new HttpError(403, ADMIN_ONLY_MESSAGE);
  if (body.fee !== null && (!Number.isInteger(body.fee) || body.fee < 0)) {
    throw new HttpError(400, "fee must be a whole number of rupees, zero or more, or null");
  }
  return { fee: body.fee };
}
