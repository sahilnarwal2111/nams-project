// Fetch helpers and API <-> UI conversions for the Work Board.
// The API speaks `assigneeId`; the UI speaks `assignee`. Convert at this boundary only.

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

export async function updateTaskStatus(id, status) {
  const updated = await request(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(statusPatchBody(status)),
  });
  return taskFromApi(updated);
}
