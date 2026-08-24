const TASK_KANBAN_COLUMNS = new Set(["todo", "in-progress", "done"]);

export function isTaskDone(item) {
  return item?.type === "task" && (item.completed === true || item.workflowStatus === "done");
}

export function taskKanbanColumn(item) {
  if (isTaskDone(item)) return "done";
  if (item?.workflowStatus === "active") return "in-progress";
  return "todo";
}

export function canMoveTask(item, column) {
  return TASK_KANBAN_COLUMNS.has(column) && taskKanbanColumn(item) !== column;
}

export function taskMoveUpdates(item, column) {
  if (!canMoveTask(item, column)) return null;

  const workflowStatus = column === "todo" ? "inbox" : column === "in-progress" ? "active" : "done";
  if (column !== "done" && isTaskDone(item)) {
    return { workflowStatus, completed: false, completedAt: null };
  }

  return { workflowStatus };
}

export function taskDisplayTitle(item) {
  const savedTitle = typeof item?.title === "string" ? item.title.trim() : "";
  const content = typeof item?.content === "string" ? item.content.trim() : "";
  return savedTitle || content || "Untitled task";
}
