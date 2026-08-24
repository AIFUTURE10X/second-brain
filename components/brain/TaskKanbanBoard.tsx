import type { ReactNode } from "react";
import type { Item } from "@/lib/brain-model";

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
  movingTaskId: string | null;
  renderCard: (item: Item, index: number) => ReactNode;
  onMoveTask: (item: Item, column: TaskKanbanColumnKey) => void;
}

function taskKanbanColumn(item: Item): TaskKanbanColumnKey {
  if (item.completed || item.workflowStatus === "done") return "done";
  if (item.workflowStatus === "active") return "in-progress";
  return "todo";
}

export function TaskKanbanBoard({ items, movingTaskId, renderCard, onMoveTask }: TaskKanbanBoardProps) {
  const indexedItems = items.map((item, index) => ({ item, index }));

  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3" aria-label="Task Kanban board">
      {TASK_KANBAN_COLUMNS.map(column => {
        const columnItems = indexedItems.filter(({ item }) => taskKanbanColumn(item) === column.key);

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

            <div className="min-h-28">
              {columnItems.length > 0 ? (
                columnItems.map(({ item, index }) => (
                  <div key={item.id} className="mb-2.5 rounded-xl border border-brand-border/70 bg-brand-muted/30 p-1.5 pb-2">
                    {renderCard(item, index)}
                    <label className="flex items-center justify-between gap-2 px-1 text-[10px] font-mono text-gray-500">
                      <span>Status</span>
                      <select
                        value={taskKanbanColumn(item)}
                        onChange={event => onMoveTask(item, event.target.value as TaskKanbanColumnKey)}
                        disabled={movingTaskId === item.id || item.completed}
                        aria-label={`Move ${item.title || "task"} to`}
                        title={item.completed ? "Uncheck a checklist item to reopen this task" : `Move to ${column.label}`}
                        className="min-h-8 rounded-md border border-brand-border bg-[#0D0F12] px-2 text-[10px] text-gray-300 outline-none transition focus:border-[#56CCF280] disabled:opacity-50"
                      >
                        {TASK_KANBAN_COLUMNS.map(option => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))
              ) : (
                <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-brand-border px-3 text-center text-[11px] font-mono text-gray-600">
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
