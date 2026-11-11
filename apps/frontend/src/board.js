// Pure helpers for the Work Board: searching, sorting and spotting overdue work.
// Kept out of App.jsx so they can be tested with node:test.

const SEARCH_FIELDS = ["id", "title", "client", "district", "department", "customerPhone", "details"];

// Tasks whose text contains every word of the query, in any order and any case.
export function filterTasks(tasks, query) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return tasks;
  return tasks.filter((task) => {
    const text = SEARCH_FIELDS.map((f) => task[f] ?? "").join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

const idNumber = (id) => Number(/(\d+)$/.exec(id ?? "")?.[1] ?? 0);
const byId = (a, b) => idNumber(a.id) - idNumber(b.id);
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

export const SORT_MODES = [
  { id: "board", label: "Task number" },
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "newest", label: "Newest first" },
];

// A sorted copy. Ties, and tasks missing the sorted value, fall back to the
// task number so the order is stable.
export function sortTasks(tasks, mode) {
  const sorted = [...tasks];
  if (mode === "due") {
    // Soonest first; work with no date goes last.
    sorted.sort((a, b) => {
      if (!a.expectedCompletion !== !b.expectedCompletion) return a.expectedCompletion ? -1 : 1;
      return (a.expectedCompletion ?? "").localeCompare(b.expectedCompletion ?? "") || byId(a, b);
    });
  } else if (mode === "priority") {
    sorted.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) || byId(a, b));
  } else if (mode === "newest") {
    // By creation time where known; older tasks have none, so the task number decides.
    sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || byId(b, a));
  } else {
    sorted.sort(byId);
  }
  return sorted;
}

// YYYY-MM-DD for the day n days before a YYYY-MM-DD day.
export function daysBefore(day, n) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

// Finished work stays on the board for a week: today and the six days before.
// Older work, and work finished before completion dates were recorded, is
// only in the completed list.
export const RECENT_DAYS = 7;
export function isRecentlyCompleted(task, today) {
  return task.status === "done" && Boolean(task.completedAt) && task.completedAt > daysBefore(today, RECENT_DAYS);
}

// What the board shows: all open work plus recently finished work.
export function boardTasks(tasks, today) {
  return tasks.filter((task) => task.status !== "done" || isRecentlyCompleted(task, today));
}

// Every finished task, newest first. Work with no recorded date goes last.
export function completedTasks(tasks) {
  return tasks
    .filter((task) => task.status === "done")
    .sort((a, b) => {
      if (!a.completedAt !== !b.completedAt) return a.completedAt ? -1 : 1;
      return (b.completedAt ?? "").localeCompare(a.completedAt ?? "") || byId(b, a);
    });
}

// The completed list in month groups, in order: [{ key, tasks }]. key is
// "YYYY-MM", or null for work with no recorded date.
export function completedByMonth(tasks) {
  const groups = [];
  for (const task of completedTasks(tasks)) {
    const key = task.completedAt ? task.completedAt.slice(0, 7) : null;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.tasks.push(task);
    else groups.push({ key, tasks: [task] });
  }
  return groups;
}

// How much work each person has: { [employeeId]: { open, done } }.
export function workCounts(tasks) {
  const counts = {};
  for (const task of tasks) {
    if (!task.assignee) continue;
    const entry = (counts[task.assignee] ??= { open: 0, done: 0 });
    if (task.status === "done") entry.done += 1;
    else entry.open += 1;
  }
  return counts;
}

// Open work whose expected completion date is before today. Due today is not
// overdue, and finished work never is. Dates are YYYY-MM-DD strings.
export function isOverdue(task, today) {
  return task.status !== "done" && Boolean(task.expectedCompletion) && task.expectedCompletion < today;
}
