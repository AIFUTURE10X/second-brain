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
  return TASK_KANBAN_COLUMNS.has(column) && !isTaskDone(item) && taskKanbanColumn(item) !== column;
}

export function taskDisplayTitle(item) {
  const savedTitle = typeof item?.title === "string" ? item.title.trim() : "";
  const content = typeof item?.content === "string" ? item.content.trim() : "";
  return savedTitle || content || "Untitled task";
}

export function wouldReopenDoneTask(current, transition) {
  if (!isTaskDone(current)) return false;

  if (transition.workflowStatus !== undefined && transition.workflowStatus !== "done") {
    return true;
  }

  return current.completed === true && transition.completionChanged && transition.nextCompleted !== true;
}
