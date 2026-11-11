import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionRole,
  paymentPending,
  daysAgo,
  enquiryError,
  enquiryToApi,
  enquiryFromApi,
  taskFromApi,
  tasksFromApi,
  employeeFromApi,
  employeesFromApi,
  statusPatchBody,
  taskToApi,
  taskFromForm,
  nextLocalTaskId,
  parseRupees,
  clientFormError,
  clientToApi,
  paymentError,
  paymentPatchBody,
  paymentToApi,
  paymentFromApi,
  nextLocalClientId,
  authHeaders,
  sessionState,
  getToken,
  dateFromApi,
  instantFromApi,
  localDay,
  clientFromApi,
  clientsFromApi,
  logCallPatchBody,
} from "../src/api.js";

const apiTask = {
  id: "NK-101",
  title: "Topographic survey",
  client: "Jind Infra",
  assigneeId: "e6",
  status: "done",
  priority: "high",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

test("taskFromApi renames assigneeId to assignee", () => {
  const t = taskFromApi(apiTask);
  assert.equal(t.assignee, "e6");
  assert.equal("assigneeId" in t, false);
  assert.equal(t.id, "NK-101");
  assert.equal(t.status, "done");
  assert.equal(t.priority, "high");
});

test("taskFromApi does not mutate its input", () => {
  const copy = structuredClone(apiTask);
  taskFromApi(apiTask);
  assert.deepEqual(apiTask, copy);
});

test("tasksFromApi converts every task and handles empty lists", () => {
  assert.deepEqual(tasksFromApi([]), []);
  const out = tasksFromApi([apiTask, { ...apiTask, id: "NK-102", assigneeId: "e1" }]);
  assert.deepEqual(out.map((t) => t.assignee), ["e6", "e1"]);
});

test("employeeFromApi keeps only the fields the UI uses", () => {
  const e = employeeFromApi({ id: "e1", name: "Narender Kumar", role: "MD", initials: "NK", createdAt: "x" });
  assert.deepEqual(e, { id: "e1", name: "Narender Kumar", role: "MD", initials: "NK" });
});

test("employeesFromApi maps lists", () => {
  assert.deepEqual(employeesFromApi([]), []);
  assert.equal(employeesFromApi([{ id: "e1", name: "A", role: "R", initials: "A" }]).length, 1);
});

test("statusPatchBody sends only status", () => {
  assert.deepEqual(statusPatchBody("inprogress"), { status: "inprogress" });
});

const apiClient = {
  id: "c1",
  name: "Jind Infra",
  contact: "S",
  phone: "1",
  due: 184000,
  invoiceDate: "2026-05-12T00:00:00.000Z",
  lastCall: "2026-07-18T23:59:59.999Z",
  status: "overdue",
  notes: null,
};

test("dateFromApi converts ISO timestamps to YYYY-MM-DD", () => {
  assert.equal(dateFromApi("2026-05-12T00:00:00.000Z"), "2026-05-12");
  assert.equal(dateFromApi("2026-07-18T23:59:59.999Z"), "2026-07-18");
  assert.equal(dateFromApi("2026-07-18T23:30:00-05:00"), "2026-07-19");
});

test("dateFromApi passes through short dates and unparseable values", () => {
  assert.equal(dateFromApi("2026-05-12"), "2026-05-12");
  assert.equal(dateFromApi("not a date"), "not a date");
  assert.equal(dateFromApi(null), null);
});

test("localDay formats a date in the local time zone", () => {
  assert.equal(localDay(new Date(2026, 0, 5, 0, 0)), "2026-01-05");
  assert.equal(localDay(new Date(2026, 10, 11, 23, 59)), "2026-11-11");
});

// Regression: these tests run with TZ=Asia/Kolkata. 00:30 IST on 11 Nov is still
// 10 Nov in UTC, and the page used the UTC date, so a reminder logged just after
// midnight showed "1 day ago" and was not counted in "Followed Up Today".
test("instantFromApi gives the local day, not the UTC day", () => {
  const justAfterMidnight = new Date(2026, 10, 11, 0, 30);
  assert.equal(justAfterMidnight.toISOString().slice(0, 10), "2026-11-10", "test needs a zone ahead of UTC");
  assert.equal(instantFromApi(justAfterMidnight.toISOString()), "2026-11-11");
  assert.equal(instantFromApi(justAfterMidnight.toISOString()), localDay(justAfterMidnight));
});

test("instantFromApi passes through short dates and unparseable values", () => {
  assert.equal(instantFromApi("2026-05-12"), "2026-05-12");
  assert.equal(instantFromApi("not a date"), "not a date");
  assert.equal(instantFromApi(null), null);
});

test("clientFromApi keeps the invoice date on its UTC day and the last call on its local day", () => {
  const c = clientFromApi(apiClient);
  assert.equal(c.invoiceDate, "2026-05-12");
  assert.equal(c.lastCall, "2026-07-19");
  assert.equal(c.due, 184000);
  assert.equal(c.status, "overdue");
  assert.equal(c.notes, null);
});

test("clientFromApi does not mutate its input", () => {
  const copy = structuredClone(apiClient);
  clientFromApi(apiClient);
  assert.deepEqual(apiClient, copy);
});

test("clientsFromApi maps lists", () => {
  assert.deepEqual(clientsFromApi([]), []);
  const out = clientsFromApi([apiClient, { ...apiClient, id: "c2", lastCall: "2026-08-01T10:00:00.000Z" }]);
  assert.deepEqual(out.map((c) => c.lastCall), ["2026-07-19", "2026-08-01"]);
});

test("logCallPatchBody is empty", () => {
  assert.deepEqual(logCallPatchBody(), {});
});

const workForm = {
  title: "  Pond survey ",
  client: " Village XYZ Panchayat ",
  customerPhone: " +91 98765 43210 ",
  district: "Jind",
  department: "   ",
  workTypes: ["survey", "drawing"],
  details: "",
  expectedCompletion: "2026-12-15",
  priority: "high",
  assignee: "e6",
};

test("taskFromApi keeps the expected completion on its UTC day", () => {
  const t = taskFromApi({ ...apiTask, expectedCompletion: "2026-12-15T00:00:00.000Z", workTypes: ["survey"] });
  assert.equal(t.expectedCompletion, "2026-12-15");
  assert.deepEqual(t.workTypes, ["survey"]);
  assert.equal(taskFromApi({ ...apiTask, expectedCompletion: null }).expectedCompletion, null);
  assert.equal("expectedCompletion" in taskFromApi(apiTask), false);
});

test("taskToApi trims text, renames assignee and sends blanks as null", () => {
  assert.deepEqual(taskToApi(workForm), {
    title: "Pond survey",
    client: "Village XYZ Panchayat",
    assigneeId: "e6",
    priority: "high",
    customerPhone: "+91 98765 43210",
    district: "Jind",
    department: null,
    workTypes: ["survey", "drawing"],
    details: null,
    expectedCompletion: "2026-12-15",
  });
});

test("taskToApi sends an empty date as null and never sends status or id", () => {
  const body = taskToApi({ ...workForm, expectedCompletion: "", status: "done", id: "NK-1" });
  assert.equal(body.expectedCompletion, null);
  assert.equal("status" in body, false);
  assert.equal("id" in body, false);
});

test("taskFromForm gives the UI shape for mock mode", () => {
  const t = taskFromForm(workForm);
  assert.equal(t.assignee, "e6");
  assert.equal("assigneeId" in t, false);
  assert.equal(t.title, "Pond survey");
  assert.equal(t.department, null);
});

test("nextLocalTaskId continues the NK sequence numerically", () => {
  assert.equal(nextLocalTaskId([]), "NK-001");
  assert.equal(nextLocalTaskId([{ id: "NK-101" }, { id: "NK-126" }, { id: "NK-99" }]), "NK-127");
  assert.equal(nextLocalTaskId([{ id: "NK-999" }, { id: "other" }]), "NK-1000");
});

const clientForm = {
  name: " Hisar Developers ",
  contact: " R. Punia ",
  phone: " +91 90000 22222 ",
  due: "1,25,000",
  invoiceDate: "2026-11-01",
  status: "due-soon",
  notes: "  ",
};

test("parseRupees reads whole rupees and rejects everything else", () => {
  assert.equal(parseRupees("1,84,000"), 184000);
  assert.equal(parseRupees(" ₹ 500 "), 500);
  assert.equal(parseRupees("0"), 0);
  assert.equal(parseRupees(96000), 96000);
  for (const bad of ["", "  ", "-5", "10.5", "abc", "1e3", null, undefined]) {
    assert.ok(Number.isNaN(parseRupees(bad)), `expected NaN for ${JSON.stringify(bad)}`);
  }
});

test("clientFormError accepts a valid form and names each problem", () => {
  assert.equal(clientFormError(clientForm), null);
  assert.match(clientFormError({ ...clientForm, name: "  " }), /required/);
  assert.match(clientFormError({ ...clientForm, phone: "" }), /required/);
  assert.match(clientFormError({ ...clientForm, due: "12.5" }), /whole number/);
  assert.match(clientFormError({ ...clientForm, due: "" }), /whole number/);
  assert.match(clientFormError({ ...clientForm, invoiceDate: "" }), /Invoice date/);
  assert.match(clientFormError({ ...clientForm, status: "paid" }), /cannot be marked as paid/);
  assert.equal(clientFormError({ ...clientForm, due: "0", status: "paid" }), null);
});

test("clientToApi trims text, parses the amount and sends blank notes as null", () => {
  assert.deepEqual(clientToApi(clientForm), {
    name: "Hisar Developers",
    contact: "R. Punia",
    phone: "+91 90000 22222",
    due: 125000,
    invoiceDate: "2026-11-01",
    status: "due-soon",
    notes: null,
  });
});

test("clientToApi marks a client who owes nothing as paid and never sends lastCall", () => {
  const body = clientToApi({ ...clientForm, due: "0", status: "overdue", lastCall: "2026-01-01" });
  assert.equal(body.status, "paid");
  assert.equal(body.due, 0);
  assert.equal("lastCall" in body, false);
});

test("paymentError checks the amount against the dues", () => {
  const client = { id: "c1", due: 50000, status: "overdue" };
  assert.equal(paymentError(client, "20,000"), null);
  assert.equal(paymentError(client, "50000"), null);
  assert.match(paymentError(client, "50001"), /more than/);
  assert.match(paymentError(client, "0"), /amount received/);
  assert.match(paymentError(client, ""), /amount received/);
  assert.match(paymentError(client, "-10"), /amount received/);
});

test("paymentPatchBody reduces the dues and marks a cleared account as paid", () => {
  const client = { id: "c1", due: 50000, status: "overdue" };
  assert.deepEqual(paymentPatchBody(client, "20,000"), { due: 30000 });
  assert.deepEqual(paymentPatchBody(client, "50000"), { due: 0, status: "paid" });
});

test("nextLocalClientId continues the c# sequence numerically", () => {
  assert.equal(nextLocalClientId([]), "c1");
  assert.equal(nextLocalClientId([{ id: "c1" }, { id: "c6" }, { id: "c10" }, { id: "x" }]), "c11");
});

test("authHeaders sends a Bearer token only when signed in", () => {
  assert.deepEqual(authHeaders("abc.def"), { Authorization: "Bearer abc.def" });
  assert.deepEqual(authHeaders(null), {});
  assert.equal(getToken(), null, "no token before signing in");
  assert.deepEqual(authHeaders(), {});
});

test("sessionState decides between open, sign-in and signed-in", () => {
  assert.equal(sessionState({ required: false, authenticated: false }), "open");
  assert.equal(sessionState({ required: true, authenticated: false }), "login");
  assert.equal(sessionState({ required: true, authenticated: true }), "signedIn");
});

test("paymentToApi parses the amount and sends a blank note as null", () => {
  assert.deepEqual(paymentToApi("25,000", "  Cheque 4412 "), { amount: 25000, note: "Cheque 4412" });
  assert.deepEqual(paymentToApi("500", "   "), { amount: 500, note: null });
  assert.deepEqual(paymentToApi("500", undefined), { amount: 500, note: null });
});

test("paymentFromApi puts the payment on the viewer's local day", () => {
  const justAfterMidnight = new Date(2026, 10, 11, 0, 30);
  const p = paymentFromApi({ id: 7, clientId: "c1", amount: 5000, note: null, receivedAt: justAfterMidnight.toISOString() });
  assert.equal(p.receivedAt, "2026-11-11");
  assert.equal(p.amount, 5000);
  assert.equal(p.id, 7);
});

test("taskFromApi shows completedAt as a local day and leaves createdAt as a timestamp", () => {
  const justAfterMidnight = new Date(2026, 10, 11, 0, 30).toISOString();
  const t = taskFromApi({ ...apiTask, createdAt: "2026-11-01T04:00:00.000Z", completedAt: justAfterMidnight });
  assert.equal(t.completedAt, "2026-11-11");
  assert.equal(t.createdAt, "2026-11-01T04:00:00.000Z");
  assert.equal(taskFromApi({ ...apiTask, completedAt: null }).completedAt, null);
});

test("enquiryError asks for a name and a plausible phone number", () => {
  const ok = { name: "Ramesh", phone: "+91 98765-43210", message: "" };
  assert.equal(enquiryError(ok), null);
  assert.equal(enquiryError({ ...ok, phone: "(01681) 245678" }), null);
  assert.match(enquiryError({ ...ok, name: "   " }), /name/i);
  assert.match(enquiryError({ ...ok, name: "x".repeat(101) }), /100/);
  for (const phone of ["", "12345", "call me", "98765432109876543210", "98765 4321x"]) {
    assert.match(enquiryError({ ...ok, phone }), /phone/i, phone);
  }
  assert.match(enquiryError({ ...ok, message: "x".repeat(1001) }), /1000/);
  assert.equal(enquiryError({ ...ok, message: "x".repeat(1000) }), null);
});

test("enquiryToApi trims, sends a blank message as null and passes the hidden field only when filled", () => {
  assert.deepEqual(enquiryToApi({ name: " Ramesh ", phone: " 9876543210 ", message: "  " }), { name: "Ramesh", phone: "9876543210", message: null });
  assert.deepEqual(enquiryToApi({ name: "Ramesh", phone: "9876543210", message: " Plot survey ", website: "" }), { name: "Ramesh", phone: "9876543210", message: "Plot survey" });
  assert.equal(enquiryToApi({ name: "Bot", phone: "9876543210", message: "", website: "http://x" }).website, "http://x");
});

test("enquiryFromApi shows the arrival time as the local day", () => {
  const justAfterMidnight = new Date(2026, 10, 11, 0, 30).toISOString();
  const e = enquiryFromApi({ id: 3, name: "Ramesh", phone: "9876543210", message: null, status: "new", createdAt: justAfterMidnight });
  assert.equal(e.createdAt, "2026-11-11");
  assert.equal(e.status, "new");
});

test("daysAgo counts calendar days, whatever the time of day", () => {
  assert.equal(daysAgo("2026-11-11", "2026-11-11"), "Today");
  assert.equal(daysAgo("2026-11-10", "2026-11-11"), "1 day ago");
  assert.equal(daysAgo("2026-11-04", "2026-11-11"), "7 days ago");
  assert.equal(daysAgo("2026-10-31", "2026-11-01"), "1 day ago");
  assert.equal(daysAgo("2026-11-12", "2026-11-11"), "Today", "a future day is not negative");
});

test("daysAgo says Today for today's date late in the evening", (t) => {
  // The old version rounded hours since midnight, so after midday today read as "1 day ago".
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 10, 11, 21, 45) });
  assert.equal(daysAgo("2026-11-11"), "Today");
  assert.equal(daysAgo("2026-11-10"), "1 day ago");
});

test("sessionRole is admin only when the server says so or sign-in is off", () => {
  assert.equal(sessionRole({ required: false, authenticated: false, role: "admin" }), "admin");
  assert.equal(sessionRole({ required: false, authenticated: false }), "admin");
  assert.equal(sessionRole({ required: true, authenticated: true, role: "admin" }), "admin");
  assert.equal(sessionRole({ required: true, authenticated: true, role: "staff" }), "staff");
  assert.equal(sessionRole({ required: true, authenticated: true }), "staff", "an older server with no role");
  assert.equal(sessionRole({ required: true, authenticated: true, role: "owner" }), "staff");
  assert.equal(sessionRole({ required: true, authenticated: false, role: null }), "staff");
});

test("paymentPending uses the amount when known and the status when it is hidden", () => {
  assert.equal(paymentPending({ due: 5000, status: "overdue" }), true);
  assert.equal(paymentPending({ due: 0, status: "paid" }), false);
  assert.equal(paymentPending({ due: 0, status: "overdue" }), false, "the amount wins for an admin");
  assert.equal(paymentPending({ status: "overdue" }), true);
  assert.equal(paymentPending({ status: "due-soon" }), true);
  assert.equal(paymentPending({ status: "paid" }), false);
});

test("clientFromApi keeps a client without an amount as it is", () => {
  const c = clientFromApi({ id: "c1", name: "A", status: "overdue", invoiceDate: "2026-05-12T00:00:00.000Z", lastCall: "2026-07-18T10:00:00.000Z" });
  assert.equal("due" in c, false);
  assert.equal(c.invoiceDate, "2026-05-12");
});
