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
  return { ...rest, assignee: assigneeId };
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

// Body for PATCH /api/clients/:id when logging a reminder: empty, so the API sets lastCall to now.
export function logCallPatchBody() {
  return {};
}

// Body for PATCH /api/tasks/:id when moving a card.
export function statusPatchBody(status) {
  return { status };
}

/* ---- fetch ------------------------------------------------------- */

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
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
