import type { Item } from "@/lib/brain-model";
import { isTaskDone, taskDisplayTitle, taskKanbanColumn } from "@/lib/task-workflow.mjs";
import type { TaskLayout } from "./TaskLayoutPicker";

export type TaskKanbanColumnKey = "todo" | "in-progress" | "done";

const TASK_KANBAN_COLUMNS: Array<{
  key: TaskKanbanColumnKey;
  label: string;
  color: string;
}> = [
  { key: "todo", label: "Todo", color: "#9CA3AF" },
  { key: "in-progress", label: "In Progress", color: "#F2C94C" },
  { key: "done", label: "Done", color: "#56CCF2" },
];

interface TaskKanbanBoardProps {
  items: Item[];
  layout: TaskLayout;
  movingTaskId: string | null;
  onOpenTask: (item: Item) => void;
  onMoveTask: (item: Item, column: TaskKanbanColumnKey) => void;
}

export function TaskKanbanBoard({ items, layout, movingTaskId, onOpenTask, onMoveTask }: TaskKanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3" aria-label="Task Kanban board">
      {TASK_KANBAN_COLUMNS.map(column => {
        const columnItems = items.filter(item => taskKanbanColumn(item) === column.key);

        return (
          <section
            key={column.key}
            data-task-kanban-column={column.key}
            className="min-w-0 rounded-xl border border-brand-border bg-[#0D1016] p-2"
            aria-label={`${column.label} tasks`}
          >
            <div className="mb-2 flex items-center justify-between rounded-lg border border-brand-border bg-brand-muted/80 px-3 py-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: column.color }}>
                {column.label}
              </h2>
              <span className="rounded-full border border-brand-border px-2 py-0.5 text-[10px] font-mono text-gray-500">
                {columnItems.length}
              </span>
            </div>

            <div className={layout === "list" ? "grid min-h-28 grid-cols-[repeat(auto-fill,8rem)] items-start gap-1.5" : "min-h-28"}>
              {columnItems.length > 0 ? (
                columnItems.map(item => {
                  const currentColumn = taskKanbanColumn(item) as TaskKanbanColumnKey;
                  const taskDone = isTaskDone(item);
                  const checklistItems = item.checklistItems || [];
                  const completedChecklistItems = checklistItems.filter(checklistItem => checklistItem.completed).length;
                  const taskTitle = taskDisplayTitle(item);

                  return (
                    <article
                      key={item.id}
                      className={layout === "list" ? "flex h-32 w-32 flex-col overflow-hidden rounded-lg border border-brand-border/80 bg-brand-card" : "flex h-[9rem] flex-col overflow-hidden rounded-lg border border-brand-border/80 bg-brand-card"}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenTask(item)}
                        className={`min-h-0 flex-1 overflow-hidden text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#56CCF280] ${layout === "list" ? "px-2.5 py-2" : "px-3 py-3"}`}
                        aria-label={`Open ${taskTitle}`}
                        title="Open task details"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[12px]"
                            style={{
                              borderColor: taskDone ? "#56CCF260" : "#56CCF230",
                              color: taskDone ? "#56CCF2" : "#9CA3AF",
                              background: taskDone ? "#56CCF215" : "#56CCF208",
                            }}
                            aria-hidden="true"
                          >
                            {taskDone ? "✓" : "□"}
                          </span>
                          <div className="min-w-0">
                            <h3
                              className={layout === "list" ? "line-clamp-3 text-[11px] font-semibold leading-tight text-gray-100" : "line-clamp-2 text-base font-semibold leading-snug text-gray-100"}
                              style={layout === "list"
                                ? {
                                    fontFamily: "'Space Grotesk', sans-serif",
                                    display: "-webkit-box",
                                    WebkitBoxOrient: "vertical",
                                    WebkitLineClamp: 3,
                                    maxHeight: "2.475rem",
                                    overflow: "hidden",
                                  }
                                : {
                                    fontFamily: "'Space Grotesk', sans-serif",
                                    display: "-webkit-box",
                                    WebkitBoxOrient: "vertical",
                                    WebkitLineClamp: 2,
                                    maxHeight: "2.75rem",
                                    overflow: "hidden",
                                  }}
                            >
                              {taskTitle}
                            </h3>
                          </div>
                        </div>

                        {layout === "board" && (
                        <div className="mt-3 flex min-h-5 flex-wrap items-center gap-1.5 text-[9px] font-mono text-gray-600">
                          {item.category && (
                            <span className="rounded border border-brand-border px-1.5 py-0.5 text-gray-500">
                              {item.category}
                            </span>
                          )}
                          {(item.tags || []).slice(0, 2).map(tag => (
                            <span key={tag}>#{tag}</span>
                          ))}
                          {checklistItems.length > 0 && (
                            <span className="ml-auto shrink-0">
                              {completedChecklistItems}/{checklistItems.length} steps
                            </span>
                          )}
                        </div>
                        )}
                      </button>

                      <div className="mt-auto grid shrink-0 grid-cols-3 border-t border-brand-border bg-[#0D1016] p-1">
                        {TASK_KANBAN_COLUMNS.map(option => {
                          const active = option.key === currentColumn;
                          const disabled = movingTaskId === item.id || active;

                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => onMoveTask(item, option.key)}
                              disabled={disabled}
                              aria-current={active ? "step" : undefined}
                              aria-label={`Move ${taskTitle} to ${option.label}`}
                              title={`Move to ${option.label}`}
                              className={`${layout === "list" ? "min-h-7 text-[8px] tracking-normal" : "min-h-8 text-[9px] tracking-[0.06em]"} rounded px-1 font-semibold uppercase transition ${active ? "bg-white/[0.06]" : "text-gray-600 hover:bg-white/[0.04] hover:text-gray-300"} disabled:cursor-default`}
                              style={active ? { color: option.color } : undefined}
                            >
                              {layout === "list" && option.key === "in-progress" ? "Doing" : option.label}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className={`${layout === "list" ? "col-span-full" : ""} flex min-h-24 items-center justify-center rounded-lg border border-dashed border-brand-border px-3 text-center text-[11px] font-mono text-gray-600`}>
                  No tasks
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
