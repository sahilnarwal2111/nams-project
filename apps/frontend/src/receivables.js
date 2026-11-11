// Receivables are kept per ticket: each task has an amount to charge (fee) and
// the money received against it. These are the page's rules, kept pure so they
// can be tested. The payment status is always worked out, never typed in, so
// the Work Board and Receivables cannot disagree.

// Ids match the API's paymentStatus values exactly.
export const PAYMENT_STATUSES = ["unset", "unpaid", "part", "paid"];
export const PAYMENT_LABELS = { unset: "Amount not set", unpaid: "Not paid", part: "Part paid", paid: "Paid" };

// The server's rule, repeated for mock mode. fee 0 is work that is not
// charged, which counts as paid.
export function paymentStatusOf(fee, received = 0) {
  if (fee === null || fee === undefined) return "unset";
  if (received >= fee) return "paid";
  return received > 0 ? "part" : "unpaid";
}

// What is still owed on a ticket. Nothing until an amount has been set.
export function balanceOf(task) {
  if (task.fee === null || task.fee === undefined) return 0;
  return Math.max(0, task.fee - (task.received ?? 0));
}

// Anything that is not settled, including tickets still waiting for an amount.
export const isPending = (task) => task.paymentStatus !== "paid";

export const RECEIVABLE_FILTERS = [
  { id: "pending", label: "Pending" },
  { id: "unpaid", label: "Not paid" },
  { id: "part", label: "Part paid" },
  { id: "unset", label: "Amount not set" },
  { id: "paid", label: "Paid" },
  { id: "all", label: "All" },
];

export function filterReceivables(tasks, filter) {
  if (filter === "all") return tasks;
  if (filter === "pending") return tasks.filter(isPending);
  return tasks.filter((t) => t.paymentStatus === filter);
}

// How many tickets each filter would show.
export function receivableCounts(tasks) {
  const counts = { all: tasks.length, pending: 0, unset: 0, unpaid: 0, part: 0, paid: 0 };
  for (const task of tasks) {
    counts[task.paymentStatus] += 1;
    if (isPending(task)) counts.pending += 1;
  }
  return counts;
}

// Totals for the admin's tiles. Tickets without an amount add nothing.
export function receivableTotals(tasks) {
  let outstanding = 0;
  let received = 0;
  for (const task of tasks) {
    outstanding += balanceOf(task);
    received += task.received ?? 0;
  }
  return { outstanding, received };
}

// Newest ticket first, by NK number.
const number = (id) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);
export const sortReceivables = (tasks) => [...tasks].sort((a, b) => number(b.id) - number(a.id));

const digits = (value) => String(value ?? "").replace(/[,\s₹]/g, "");

/* ---- typing an amount: commas the Indian way (1,25,000; 1,00,00,000) ----- */

// What an amount field shows for what was typed: digits only, grouped in
// thousands, lakhs and crores. Anything that is not a digit is dropped.
export function formatRupeesTyped(text) {
  const typed = String(text ?? "").replace(/\D/g, "").slice(0, 12);
  if (typed === "") return "";
  return Number(typed).toLocaleString("en-IN");
}

// Where the cursor belongs after formatting: behind the same number of digits
// as before, so typing in the middle of an amount does not jump to the end.
export function caretAfterFormat(raw, caret, formatted) {
  const before = raw.slice(0, caret).replace(/\D/g, "").replace(/^0+(?=\d)/, "").length;
  if (before === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen === before) return i + 1;
  }
  return formatted.length;
}

// The amount-to-charge field: blank means "not decided yet" (null).
// Returns { fee } or { error }. received is what has already been recorded.
export function parseFee(value, received = 0) {
  const text = digits(value);
  if (text === "") {
    return received > 0 ? { error: "Payments are recorded on this ticket, so the amount cannot be left blank." } : { fee: null };
  }
  if (!/^\d+$/.test(text)) return { error: "Enter the amount as a whole number of rupees, or leave it blank." };
  const fee = Number(text);
  if (fee < received) return { error: `The amount cannot be less than the ₹${received.toLocaleString("en-IN")} already received.` };
  return { fee };
}

// Returns a message when a received amount cannot be recorded, otherwise null.
export function paymentError(task, amount) {
  const text = digits(amount);
  const paid = /^\d+$/.test(text) ? Number(text) : NaN;
  if (Number.isNaN(paid) || paid === 0) return "Enter the amount received as a whole number of rupees.";
  if (paid > balanceOf(task)) return "The amount received is more than the balance due.";
  return null;
}

/* ---- mock mode: the same changes the server makes ------------------------ */

// A task with its payment status brought up to date from fee and received.
export const withStatus = (task) => ({ ...task, paymentStatus: paymentStatusOf(task.fee, task.received ?? 0) });

export function applyPayment(task, payment) {
  const payments = [payment, ...(task.payments ?? [])];
  return withStatus({ ...task, payments, received: (task.received ?? 0) + payment.amount });
}

export function removeLocalPayment(task, paymentId) {
  const gone = (task.payments ?? []).find((p) => p.id === paymentId);
  if (!gone) return task;
  return withStatus({ ...task, payments: task.payments.filter((p) => p.id !== paymentId), received: (task.received ?? 0) - gone.amount });
}
