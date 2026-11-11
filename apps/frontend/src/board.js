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

// Open work whose expected completion date is before today. Due today is not
// overdue, and finished work never is. Dates are YYYY-MM-DD strings.
export function isOverdue(task, today) {
  return task.status !== "done" && Boolean(task.expectedCompletion) && task.expectedCompletion < today;
}
