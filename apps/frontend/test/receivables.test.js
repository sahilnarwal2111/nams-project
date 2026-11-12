import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_STATUSES, PAYMENT_LABELS, paymentStatusOf, balanceOf, isPending, RECEIVABLE_FILTERS,
  filterReceivables, receivableCounts, receivableTotals, sortReceivables, parseFee, paymentError,
  withStatus, applyPayment, removeLocalPayment, formatRupeesTyped, caretAfterFormat,
} from "../src/receivables.js";

const t = (id, fee, received = 0) => withStatus({ id, fee, received });
const TASKS = [t("NK-101", 40000, 40000), t("NK-102", 18000, 8000), t("NK-103", 60000), t("NK-104", null), t("NK-110", 0)];

test("the payment status is worked out from the amount and what was received", () => {
  assert.equal(paymentStatusOf(null, 0), "unset");
  assert.equal(paymentStatusOf(undefined), "unset");
  assert.equal(paymentStatusOf(40000, 0), "unpaid");
  assert.equal(paymentStatusOf(40000, 1), "part");
  assert.equal(paymentStatusOf(40000, 39999), "part");
  assert.equal(paymentStatusOf(40000, 40000), "paid");
  assert.equal(paymentStatusOf(0, 0), "paid", "work that is not charged counts as paid");
  for (const status of PAYMENT_STATUSES) assert.ok(PAYMENT_LABELS[status], status);
});

test("balanceOf is what is still owed, and nothing until an amount is set", () => {
  assert.deepEqual(TASKS.map(balanceOf), [0, 10000, 60000, 0, 0]);
  assert.equal(balanceOf({ fee: 5000 }), 5000, "staff-shaped tasks have no received");
});

test("filters: pending is everything not settled, the rest go by status", () => {
  const ids = (filter) => filterReceivables(TASKS, filter).map((x) => x.id);
  assert.deepEqual(ids("all"), ["NK-101", "NK-102", "NK-103", "NK-104", "NK-110"]);
  assert.deepEqual(ids("pending"), ["NK-102", "NK-103", "NK-104"]);
  assert.deepEqual(ids("part"), ["NK-102"]);
  assert.deepEqual(ids("unpaid"), ["NK-103"]);
  assert.deepEqual(ids("unset"), ["NK-104"]);
  assert.deepEqual(ids("paid"), ["NK-101", "NK-110"]);
  assert.equal(isPending(TASKS[3]), true);
  const counts = receivableCounts(TASKS);
  for (const { id } of RECEIVABLE_FILTERS) assert.equal(counts[id], ids(id).length, id);
});

test("totals add up what is owed and what was received", () => {
  assert.deepEqual(receivableTotals(TASKS), { outstanding: 70000, received: 48000 });
  assert.deepEqual(receivableTotals([]), { outstanding: 0, received: 0 });
});

test("sortReceivables puts the newest ticket first, by number, without changing the list", () => {
  const list = [{ id: "NK-99" }, { id: "NK-1000" }, { id: "NK-101" }];
  assert.deepEqual(sortReceivables(list).map((x) => x.id), ["NK-1000", "NK-101", "NK-99"]);
  assert.equal(list[0].id, "NK-99");
});

test("parseFee: blank means not decided, and the amount cannot go below what was received", () => {
  assert.deepEqual(parseFee(""), { fee: null });
  assert.deepEqual(parseFee("   "), { fee: null });
  assert.deepEqual(parseFee("0"), { fee: 0 });
  assert.deepEqual(parseFee("₹ 1,84,000"), { fee: 184000 });
  assert.deepEqual(parseFee(40000, 40000), { fee: 40000 });
  assert.match(parseFee("abc").error, /whole number/);
  assert.match(parseFee("12.5").error, /whole number/);
  assert.match(parseFee("-5").error, /whole number/);
  assert.match(parseFee("", 500).error, /cannot be left blank/);
  assert.match(parseFee("7,999", 8000).error, /less than the ₹8,000 already received/);
});

test("paymentError allows anything from one rupee up to the balance", () => {
  const task = t("NK-102", 18000, 8000);
  assert.equal(paymentError(task, "10000"), null);
  assert.equal(paymentError(task, "1"), null);
  assert.equal(paymentError(task, "10,000"), null);
  assert.match(paymentError(task, "10001"), /more than the balance/);
  assert.match(paymentError(task, "0"), /whole number/);
  assert.match(paymentError(task, ""), /whole number/);
  assert.match(paymentError(task, "five"), /whole number/);
  assert.match(paymentError(t("NK-104", null), "100"), /more than the balance/);
});

test("mock mode: a part payment, the rest, and taking one back keep the status in step", () => {
  let task = t("NK-103", 60000);
  task = applyPayment(task, { id: 1, amount: 20000 });
  assert.deepEqual([task.received, task.paymentStatus, balanceOf(task)], [20000, "part", 40000]);
  task = applyPayment(task, { id: 2, amount: 40000 });
  assert.deepEqual([task.received, task.paymentStatus, task.payments.map((p) => p.id)], [60000, "paid", [2, 1]]);
  task = removeLocalPayment(task, 1);
  assert.deepEqual([task.received, task.paymentStatus, task.payments.map((p) => p.id)], [40000, "part", [2]]);
  assert.equal(removeLocalPayment(task, 99), task, "an unknown payment changes nothing");
  task = removeLocalPayment(task, 2);
  assert.deepEqual([task.received, task.paymentStatus], [0, "unpaid"]);
});

test("amounts are shown with commas the Indian way as they are typed", () => {
  assert.equal(formatRupeesTyped(""), "");
  assert.equal(formatRupeesTyped("5"), "5");
  assert.equal(formatRupeesTyped("999"), "999");
  assert.equal(formatRupeesTyped("1000"), "1,000");
  assert.equal(formatRupeesTyped("50000"), "50,000");
  assert.equal(formatRupeesTyped("125000"), "1,25,000");
  assert.equal(formatRupeesTyped("1,25,0000"), "12,50,000", "retyped with the old commas still in place");
  assert.equal(formatRupeesTyped("10000000"), "1,00,00,000");
  assert.equal(formatRupeesTyped("1234567890"), "1,23,45,67,890");
  assert.equal(formatRupeesTyped("0"), "0", "0 means not charged");
  assert.equal(formatRupeesTyped("007"), "7");
  assert.equal(formatRupeesTyped("₹ 12a3.4"), "1,234", "only digits are kept");
  assert.equal(formatRupeesTyped("abc"), "");
  assert.equal(formatRupeesTyped(40000), "40,000");
  // What the field shows is what the checks read back.
  assert.deepEqual(parseFee(formatRupeesTyped("12500000")), { fee: 12500000 });
  assert.equal(paymentError({ fee: 200000, received: 0 }, formatRupeesTyped("150000")), null);
});

test("the cursor stays behind the digit just typed", () => {
  // "1,000" with 5 typed at the end
  assert.equal(caretAfterFormat("1,0005", 6, "10,005"), 6);
  // "50,000" with 1 typed at the very start: "150,000" -> "1,50,000"
  assert.equal(caretAfterFormat("150,000", 1, "1,50,000"), 1);
  // "1,50,000" with 9 typed after the 5: "1,590,000" -> "15,90,000", cursor after the 9
  assert.equal(caretAfterFormat("1,590,000", 4, "15,90,000"), 4);
  // deleting the first digit of "1,25,000" leaves ",25,000" -> "25,000", cursor at the start
  assert.equal(caretAfterFormat(",25,000", 0, "25,000"), 0);
  // a letter typed in the middle is dropped and the cursor does not move past digits
  assert.equal(caretAfterFormat("12x,500", 3, "12,500"), 2);
  assert.equal(caretAfterFormat("", 0, ""), 0);
});
