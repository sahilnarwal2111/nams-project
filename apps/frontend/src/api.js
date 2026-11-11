// Fetch helpers and API <-> UI conversions for the Work Board and Payments.
// The API speaks `assigneeId` and ISO timestamps; the UI speaks `assignee` and YYYY-MM-DD
// (calendar dates by UTC day, moments in time by the viewer's local day).
// Convert at this boundary only.

// Empty/unset means "no API": callers fall back to mock data.
export const API_URL = (import.meta.env?.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export const hasApi = () => API_URL !== "";

/* ---- pure conversions ------------------------------------------- */

export function taskFromApi(t) {
  const { assigneeId, ...rest } = t;
  const task = { ...rest, assignee: assigneeId };
  // A calendar date with no time: keep its UTC day (see dateFromApi).
  if ("expectedCompletion" in task) task.expectedCompletion = dateFromApi(task.expectedCompletion);
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
  return { id: e.id, name: e.name, role: e.role, initials: e.initials };
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

// Body for PATCH /api/clients/:id when a payment is received: the amount comes
// off the dues, and a client who has cleared everything becomes "paid".
export function paymentPatchBody(client, amount) {
  const due = client.due - parseRupees(amount);
  return due === 0 ? { due, status: "paid" } : { due };
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

export async function recordPayment(client, amount) {
  return clientFromApi(
    await request(`/api/clients/${encodeURIComponent(client.id)}`, {
      method: "PATCH",
      body: JSON.stringify(paymentPatchBody(client, amount)),
    })
  );
}

export async function deleteClient(id) {
  await request(`/api/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchSession() {
  return sessionState(await request("/api/auth/session"));
}

export async function login(password) {
  const { token } = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
  setToken(token);
}

export function logout() {
  setToken(null);
}
