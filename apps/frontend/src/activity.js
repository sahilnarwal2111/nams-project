// The activity log page's rules, kept pure so they can be tested: which
// filters exist, how the query is built, and how an entry's values are shown.
// No imports from api.js, so api.js can use activityQuery.

/* ---- filters and query -------------------------------------------------- */

// `id` is the API's `type`: the first part of an action ("task.moved").
export const KIND_FILTERS = [
  { id: "", label: "Everything" },
  { id: "task", label: "Work" },
  { id: "client", label: "Clients" },
  { id: "payment", label: "Payments" },
  { id: "enquiry", label: "Enquiries" },
  { id: "employee", label: "Passwords" },
  { id: "session", label: "Sign-ins" },
];

const KIND_LABELS = { task: "Work", client: "Client", payment: "Payment", enquiry: "Enquiry", employee: "Password", session: "Sign-in" };

// The short tag on an entry: "Work" for "task.moved".
export const kindLabel = (action) => KIND_LABELS[String(action).split(".")[0]] ?? "Other";

// Who to filter by: everyone, each person by name, then the shared sign-ins.
export function actorFilters(employees = []) {
  return [
    { id: "", label: "Everyone" },
    ...employees.map((e) => ({ id: e.id, label: e.name })),
    { id: "admin", label: "Admin sign-in" },
    { id: "office", label: "Office sign-in" },
    { id: "public", label: "Website visitors" },
    { id: "unknown", label: "Failed sign-ins" },
  ];
}

// "?actor=e6&type=task&before=120", leaving out whatever is not set.
export function activityQuery({ actor = "", kind = "", before = null, limit = null } = {}) {
  const params = new URLSearchParams();
  if (actor) params.set("actor", actor);
  if (kind) params.set("type", kind);
  if (before !== null) params.set("before", String(before));
  if (limit !== null) params.set("limit", String(limit));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/* ---- dates -------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n) => String(n).padStart(2, "0");

// The viewer's local day for a moment in time, as YYYY-MM-DD.
export function dayOf(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// "11 Nov 2026" for a YYYY-MM-DD day.
export function dayLabel(day) {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// "5:42 pm", in the viewer's time zone.
export function timeLabel(iso) {
  const d = new Date(iso);
  const hours = d.getHours();
  return `${hours % 12 === 0 ? 12 : hours % 12}:${two(d.getMinutes())} ${hours < 12 ? "am" : "pm"}`;
}

// Entries are newest first; this keeps that order and splits it by local day.
export function groupByDay(entries) {
  const groups = [];
  for (const entry of entries) {
    const day = dayOf(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return groups;
}

/* ---- what changed ------------------------------------------------------- */

const FIELD_LABELS = {
  id: "Number",
  title: "Work",
  client: "Customer",
  status: "Status",
  priority: "Priority",
  assigneeId: "Assigned to",
  customerPhone: "Customer phone",
  district: "District",
  department: "Department",
  workTypes: "Work types",
  details: "Details",
  expectedCompletion: "Expected completion",
  createdAt: "Created",
  completedAt: "Completed",
  name: "Name",
  contact: "Contact person",
  phone: "Phone",
  due: "Amount due",
  invoiceDate: "Invoice date",
  lastCall: "Last reminder call",
  notes: "Notes",
  paymentId: "Payment number",
  amount: "Amount received",
  receivedAt: "Received on",
  note: "Note",
  payments: "Recorded payments",
  message: "Message",
};
const FIELD_ORDER = Object.keys(FIELD_LABELS);

const VALUE_LABELS = {
  status: {
    todo: "To Do", inprogress: "In Progress", done: "Completed",
    paid: "Paid", "due-soon": "Due soon", overdue: "Overdue",
    new: "New", contacted: "Contacted", closed: "Closed",
  },
  priority: { low: "Low", medium: "Medium", high: "High" },
};

const MONEY_FIELDS = new Set(["due", "amount"]);
// A calendar date with no time, stored as midnight UTC and read by its UTC day.
const DAY_FIELDS = new Set(["invoiceDate", "expectedCompletion"]);
// A moment in time, shown in the viewer's time zone.
const INSTANT_FIELDS = new Set(["createdAt", "completedAt", "lastCall", "receivedAt"]);

export const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const NOTHING = "—";

// One logged value as text. employees gives names for assignee ids.
export function valueLabel(field, value, employees = []) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return NOTHING;
  if (MONEY_FIELDS.has(field)) return rupees(value);
  if (DAY_FIELDS.has(field)) return dayLabel(String(value).slice(0, 10));
  if (INSTANT_FIELDS.has(field)) return `${dayLabel(dayOf(value))}, ${timeLabel(value)}`;
  if (field === "assigneeId") return employees.find((e) => e.id === value)?.name ?? String(value);
  if (field === "payments" && Array.isArray(value)) {
    return value.map((p) => `${rupees(p.amount)} on ${dayLabel(dayOf(p.receivedAt))}${p.note ? ` (${p.note})` : ""}`).join("; ");
  }
  if (VALUE_LABELS[field]?.[value]) return VALUE_LABELS[field][value];
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// The rows of an entry's before-and-after table, in a steady order.
export function changeRows(entry, employees = []) {
  const changes = entry.changes ?? {};
  const rank = (field) => (FIELD_ORDER.includes(field) ? FIELD_ORDER.indexOf(field) : FIELD_ORDER.length);
  return Object.keys(changes)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field] ?? field,
      from: valueLabel(field, changes[field]?.from, employees),
      to: valueLabel(field, changes[field]?.to, employees),
    }));
}

/* ---- where from --------------------------------------------------------- */

// "Chrome on Android" from a browser's user-agent text.
export function deviceLabel(userAgent) {
  if (!userAgent) return "Unknown device";
  const ua = String(userAgent);
  const browser =
    /Edg(e|A|iOS)?\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /SamsungBrowser\//.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const system =
    /Android/.test(ua) ? "Android"
    : /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? (ua.length > 40 ? `${ua.slice(0, 39)}…` : ua);
}
