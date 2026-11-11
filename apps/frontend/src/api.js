// Fetch helpers and API <-> UI conversions for the Work Board and Payments.
// The API speaks `assigneeId` and ISO timestamps; the UI speaks `assignee` and YYYY-MM-DD
// (calendar dates by UTC day, moments in time by the viewer's local day).
// Convert at this boundary only.
import { activityQuery } from "./activity.js";

// Empty/unset means "no API": callers fall back to mock data.
export const API_URL = (import.meta.env?.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export const hasApi = () => API_URL !== "";

/* ---- pure conversions ------------------------------------------- */

export function taskFromApi(t) {
  const { assigneeId, ...rest } = t;
  const task = { ...rest, assignee: assigneeId };
  // A calendar date with no time: keep its UTC day (see dateFromApi).
  if ("expectedCompletion" in task) task.expectedCompletion = dateFromApi(task.expectedCompletion);
  // A moment in time, shown as the viewer's local day. createdAt stays a full
  // timestamp because it is only used for ordering.
  if ("completedAt" in task) task.completedAt = instantFromApi(task.completedAt);
  return task;
}

const blankToNull = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// The work form's values -> body for POST /api/tasks and PATCH /api/tasks/:id.
// Blank optional fields are sent as null, which clears them.
export function taskToApi(form) {
  return {
    title: (form.title ?? "").trim(),
    client: (form.client ?? "").trim(),
    assigneeId: form.assignee,
    priority: form.priority,
    customerPhone: blankToNull(form.customerPhone),
    district: blankToNull(form.district),
    department: blankToNull(form.department),
    workTypes: Array.isArray(form.workTypes) ? form.workTypes : [],
    details: blankToNull(form.details),
    expectedCompletion: blankToNull(form.expectedCompletion),
  };
}

// The same clean-up for mock mode, where there is no API to do it: the values
// as the UI stores them.
export function taskFromForm(form) {
  const { assigneeId, ...rest } = taskToApi(form);
  return { ...rest, assignee: assigneeId };
}

// Next NK-### id for a task created in mock mode: highest number + 1.
export function nextLocalTaskId(tasks) {
  let max = 0;
  for (const { id } of tasks) {
    const m = /^NK-(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `NK-${String(max + 1).padStart(3, "0")}`;
}

export function tasksFromApi(list) {
  return list.map(taskFromApi);
}

export function employeeFromApi(e) {
  const employee = { id: e.id, name: e.name, role: e.role, initials: e.initials };
  // Only an admin is told whether someone has their own password.
  if (typeof e.hasPassword === "boolean") employee.hasPassword = e.hasPassword;
  return employee;
}

export function employeesFromApi(list) {
  return list.map(employeeFromApi);
}

const SHORT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");

// A Date -> YYYY-MM-DD in the viewer's own time zone. This is the UI's "today".
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// For calendar dates with no time of day (an invoice date). The API stores them
// as midnight UTC, so read the UTC day: the date must not shift with the time zone.
// Already-short dates pass through; unparseable values are returned unchanged.
export function dateFromApi(value) {
  if (typeof value !== "string") return value;
  if (SHORT_DATE.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
}

// For moments in time (when a call was logged): the viewer's local day, so a
// call logged at 02:00 IST counts as today and not as yesterday's UTC date.
export function instantFromApi(value) {
  if (typeof value !== "string") return value;
  if (SHORT_DATE.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : localDay(d);
}

export function clientFromApi(c) {
  return { ...c, invoiceDate: dateFromApi(c.invoiceDate), lastCall: instantFromApi(c.lastCall) };
}

export function clientsFromApi(list) {
  return list.map(clientFromApi);
}

// Whole rupees from a form field: "1,84,000" -> 184000. NaN when it is not a
// whole number of zero or more.
export function parseRupees(value) {
  const text = String(value ?? "").replace(/[,\s₹]/g, "");
  return /^\d+$/.test(text) ? Number(text) : NaN;
}

// Returns a message when the client form cannot be saved, otherwise null.
export function clientFormError(form) {
  if (["name", "contact", "phone"].some((k) => String(form[k] ?? "").trim() === "")) {
    return "Client name, contact person and phone are required.";
  }
  const due = parseRupees(form.due);
  if (Number.isNaN(due)) return "Outstanding amount must be a whole number of rupees, zero or more.";
  if (!form.invoiceDate) return "Invoice date is required.";
  if (due > 0 && form.status === "paid") return "A client with an outstanding amount cannot be marked as paid.";
  return null;
}

// The client form's values -> body for POST /api/clients and PATCH /api/clients/:id.
// A client who owes nothing is always "paid".
export function clientToApi(form) {
  const due = parseRupees(form.due);
  return {
    name: form.name.trim(),
    contact: form.contact.trim(),
    phone: form.phone.trim(),
    due,
    invoiceDate: form.invoiceDate,
    status: due === 0 ? "paid" : form.status,
    notes: blankToNull(form.notes),
  };
}

// Returns a message when a received amount cannot be recorded, otherwise null.
export function paymentError(client, amount) {
  const paid = parseRupees(amount);
  if (Number.isNaN(paid) || paid === 0) return "Enter the amount received as a whole number of rupees.";
  if (paid > client.due) return "The amount received is more than the outstanding amount.";
  return null;
}

// What a received payment changes on the client: the amount comes off the
// dues, and a client who has cleared everything becomes "paid". The server
// applies the same rule; this copy is for mock mode.
export function paymentPatchBody(client, amount) {
  const due = client.due - parseRupees(amount);
  return due === 0 ? { due, status: "paid" } : { due };
}

// Body for POST /api/clients/:id/payments.
export function paymentToApi(amount, note) {
  return { amount: parseRupees(amount), note: blankToNull(note) };
}

// A payment from the API: the moment it was received becomes the viewer's local day.
export function paymentFromApi(p) {
  return { ...p, receivedAt: instantFromApi(p.receivedAt) };
}

// Next c# id for a client created in mock mode: highest number + 1.
export function nextLocalClientId(clients) {
  let max = 0;
  for (const { id } of clients) {
    const m = /^c(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `c${max + 1}`;
}

// Body for PATCH /api/clients/:id when logging a reminder: empty, so the API sets lastCall to now.
export function logCallPatchBody() {
  return {};
}

// Body for PATCH /api/tasks/:id when moving a card.
export function statusPatchBody(status) {
  return { status };
}

// "Today", "1 day ago" or "N days ago" for a YYYY-MM-DD day. Counts calendar
// days, so something from this morning is still "Today" in the afternoon.
export function daysAgo(day, today = localDay()) {
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

/* ---- enquiries from the landing page ------------------------------ */

// Why the enquiry form cannot be sent, or null when it can. Mirrors the API's rules.
export function enquiryError(form) {
  if (!String(form.name ?? "").trim()) return "Please enter your name.";
  if (String(form.name).trim().length > 100) return "Name must be 100 characters or fewer.";
  const phone = String(form.phone ?? "").trim();
  const digits = phone.replace(/\D/g, "").length;
  if (!/^[\d\s()+-]+$/.test(phone) || digits < 7 || digits > 15) return "Please enter a valid phone number.";
  if (String(form.message ?? "").trim().length > 1000) return "Message must be 1000 characters or fewer.";
  return null;
}

// Body for POST /api/enquiries. "website" is the hidden field only scripts fill in.
export function enquiryToApi(form) {
  const body = { name: form.name.trim(), phone: form.phone.trim(), message: (form.message ?? "").trim() || null };
  if (form.website) body.website = form.website;
  return body;
}

// An enquiry from the API: the moment it arrived becomes the viewer's local day.
export function enquiryFromApi(e) {
  return { ...e, createdAt: instantFromApi(e.createdAt) };
}

/* ---- staff sign-in ------------------------------------------------ */

// The token from POST /api/auth/login, kept in this browser until it expires
// or the user signs out. Storage can be missing (tests) or blocked (private mode).
const TOKEN_KEY = "nk.staffToken";
const storage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
let memoryToken = null;

export function getToken() {
  try {
    return storage()?.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function setToken(token) {
  memoryToken = token;
  try {
    if (token === null) storage()?.removeItem(TOKEN_KEY);
    else storage()?.setItem(TOKEN_KEY, token);
  } catch {
    // storage blocked: the token still works until the page is closed
  }
}

// Called when the server stops accepting the token, so the app can show the
// sign-in screen. Returns a function that removes the listener.
const authLostListeners = new Set();
export function onAuthLost(listener) {
  authLostListeners.add(listener);
  return () => authLostListeners.delete(listener);
}

// Authorization header for a request, or nothing when not signed in.
export function authHeaders(token = getToken()) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// What the app should show for the answer from GET /api/auth/session.
// "admin" sees money amounts; "staff" sees only whether payment is received or
// pending. With sign-in switched off the server treats everyone as an admin.
// Anything unexpected counts as staff, the narrower view. The server enforces
// this too: staff are never sent the amounts.
export function sessionRole(session) {
  if (!session.required) return "admin";
  return session.role === "admin" ? "admin" : "staff";
}

// Whether the viewer may edit and move a task: an admin any task, a person
// signed in with their own password only work assigned to them.
export function canEditTask(task, viewer) {
  return Boolean(viewer?.isAdmin || (viewer?.employeeId && task.assignee === viewer.employeeId));
}

// The entry for the shared passwords, named after the ones that exist on the
// server. methods comes from the session; unknown means both.
export function sharedChoiceLabel(methods) {
  const admin = methods?.admin !== false;
  const office = methods?.office !== false;
  if (admin && !office) return "Admin password";
  if (office && !admin) return "Office password";
  return "Admin or office password";
}

// Who to sign in as: "shared" (the admin or office password; the password
// decides which) or an employee id. The shared choice comes first and is the
// default, so the admin can always just type their password. Every person is
// listed as a profile; ready is false until the admin gives them a password.
export function signInChoices(people = [], methods) {
  return [
    { value: "shared", label: sharedChoiceLabel(methods), ready: true },
    ...people.map((p) => {
      const ready = p.hasPassword !== false;
      return { value: p.id, name: p.name, label: ready ? p.name : `${p.name} (no password yet)`, ready };
    }),
  ];
}
export function defaultSignInChoice(people = [], remembered = null) {
  return signInChoices(people).some((c) => c.value === remembered && c.ready) ? remembered : "shared";
}

// How the signed-in viewer is named in the menu.
export function viewerLabel(session) {
  if (session.name) return session.name;
  return session.role === "admin" ? "Admin" : "Office";
}

// Why a personal password cannot be saved, or null. Mirrors the API.
export function personalPasswordError(password) {
  if (password.length < 6) return "Use at least 6 characters.";
  if (password.length > 200) return "Use 200 characters or fewer.";
  return null;
}

// Whether a client still owes money. Staff are not sent the amount, so for
// them the status decides.
export function paymentPending(client) {
  return typeof client.due === "number" ? client.due > 0 : client.status !== "paid";
}

export function sessionState(session) {
  if (!session.required) return "open";
  return session.authenticated ? "signedIn" : "login";
}

/* ---- fetch ------------------------------------------------------- */

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers },
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  // The token expired or the password changed: forget it and ask to sign in again.
  if (res.status === 401 && path !== "/api/auth/login") {
    setToken(null);
    authLostListeners.forEach((listener) => listener());
    throw new Error("Please sign in again.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") detail = body.error;
    } catch {
      // body was not JSON; fall through to the generic message
    }
    throw new Error(detail || `Request failed (${res.status} ${res.statusText || "error"})`);
  }

  return res.status === 204 ? null : res.json();
}

// Public list for the landing page: names, roles and initials only.
export async function fetchTeam() {
  return employeesFromApi(await request("/api/team"));
}

export async function fetchEmployees() {
  return employeesFromApi(await request("/api/employees"));
}

export async function fetchTasks() {
  return tasksFromApi(await request("/api/tasks"));
}

export async function fetchClients() {
  return clientsFromApi(await request("/api/clients"));
}

export async function logClientCall(id) {
  const updated = await request(`/api/clients/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(logCallPatchBody()),
  });
  return clientFromApi(updated);
}

export async function updateTaskStatus(id, status) {
  const updated = await request(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(statusPatchBody(status)),
  });
  return taskFromApi(updated);
}

export async function createTask(form) {
  return taskFromApi(await request("/api/tasks", { method: "POST", body: JSON.stringify(taskToApi(form)) }));
}

export async function updateTask(id, form) {
  return taskFromApi(
    await request(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(taskToApi(form)) })
  );
}

export async function deleteTask(id) {
  await request(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createClient(form) {
  return clientFromApi(await request("/api/clients", { method: "POST", body: JSON.stringify(clientToApi(form)) }));
}

export async function updateClient(id, form) {
  return clientFromApi(
    await request(`/api/clients/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(clientToApi(form)) })
  );
}

// Stores the payment and lowers the dues on the server in one step. Returns
// the updated client and the stored payment.
export async function recordPayment(client, amount, note) {
  const result = await request(`/api/clients/${encodeURIComponent(client.id)}/payments`, {
    method: "POST",
    body: JSON.stringify(paymentToApi(amount, note)),
  });
  return { client: clientFromApi(result.client), payment: paymentFromApi(result.payment) };
}

export async function fetchPayments(clientId) {
  return (await request(`/api/clients/${encodeURIComponent(clientId)}/payments`)).map(paymentFromApi);
}

export async function deleteClient(id) {
  await request(`/api/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchSession() {
  const session = await request("/api/auth/session");
  return {
    state: sessionState(session),
    role: sessionRole(session),
    employeeId: session.employeeId ?? null,
    name: session.name ?? null,
    people: Array.isArray(session.people) ? session.people : [],
    // Which shared passwords exist on the server. An older server does not
    // say, and then both are assumed.
    methods: { admin: session.methods?.admin !== false, office: session.methods?.office !== false },
  };
}

// as is "admin", "office" or an employee id.
export async function login(password, as) {
  const { token } = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ password, as }) });
  setToken(token);
}

export async function setEmployeePassword(id, password) {
  await request(`/api/employees/${encodeURIComponent(id)}/password`, { method: "PUT", body: JSON.stringify({ password }) });
}

export async function clearEmployeePassword(id) {
  await request(`/api/employees/${encodeURIComponent(id)}/password`, { method: "DELETE" });
}

export function logout() {
  setToken(null);
}

export async function sendEnquiry(form) {
  await request("/api/enquiries", { method: "POST", body: JSON.stringify(enquiryToApi(form)) });
}

export async function fetchEnquiries() {
  return (await request("/api/enquiries")).map(enquiryFromApi);
}

export async function updateEnquiryStatus(id, status) {
  return enquiryFromApi(
    await request(`/api/enquiries/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) })
  );
}

export async function deleteEnquiry(id) {
  await request(`/api/enquiries/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// Admin only. One page of the activity log, newest first: { entries, nextBefore }.
// filters is { actor, kind, before }; see activityQuery.
export async function fetchActivity(filters) {
  return request(`/api/activity${activityQuery(filters)}`);
}
