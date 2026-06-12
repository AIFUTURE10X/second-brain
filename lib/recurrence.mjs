// Recurrence presets shared by recurring tasks (roadmap 2.11) and recurring
// reminders (roadmap 2.8). Pure module for node:test.

export const RECURRENCES = ["daily", "weekly", "monthly"];

export function isRecurrence(value) {
  return RECURRENCES.includes(value);
}

export function recurrenceLabel(value) {
  return isRecurrence(value) ? `↻ ${value}` : "";
}

/**
 * Next occurrence strictly after `from`. Monthly clamps to the last day of
 * shorter months (Jan 31 → Feb 28) via the Date rollover guard.
 */
export function nextOccurrence(from, recurrence) {
  const base = new Date(from);
  if (Number.isNaN(base.getTime()) || !isRecurrence(recurrence)) return null;
  const next = new Date(base);
  if (recurrence === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (recurrence === "weekly") {
    next.setDate(next.getDate() + 7);
  } else {
    const targetDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(targetDay, daysInMonth));
  }
  return next;
}

/**
 * Build the next open occurrence of a completed recurring task. Checklist
 * rows reset; pin/flags deliberately do not carry over.
 */
export function buildNextTaskOccurrence(task) {
  if (task?.type !== "task" || !isRecurrence(task.recurrence)) return null;
  const checklistItems = Array.isArray(task.checklistItems)
    ? task.checklistItems.map(row => ({ ...row, completed: false, completedAt: null }))
    : [];
  return {
    type: "task",
    title: task.title || "",
    content: task.content || "",
    url: task.url || "",
    notes: task.notes || "",
    tags: Array.isArray(task.tags) ? task.tags : [],
    category: task.category || "",
    recurrence: task.recurrence,
    checklistItems,
    completed: false,
    completedAt: null,
    pinned: false,
  };
}
