const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

// Accepts YYYY-MM-DD or a full ISO timestamp; returns a Date or null.
// A date with no time is stored as midnight UTC.
export function parseDate(value) {
  if (typeof value !== "string") return null;
  if (DATE_ONLY.test(value)) {
    const d = new Date(`${value}T00:00:00.000Z`);
    // Reject overflow dates such as 2026-02-30.
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
  }
  if (!ISO_TIMESTAMP.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
