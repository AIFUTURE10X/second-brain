import type { ReactNode } from "react";
import type { Item } from "@/lib/brain-model";

type TaskKanbanColumnKey = "todo" | "in-progress" | "done";

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
  renderCard: (item: Item, index: number) => ReactNode;
}

function taskKanbanColumn(item: Item): TaskKanbanColumnKey {
  if (item.completed || item.workflowStatus === "done") return "done";
  if (item.workflowStatus === "active") return "in-progress";
  return "todo";
}

export function TaskKanbanBoard({ items, renderCard }: TaskKanbanBoardProps) {
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
                columnItems.map(({ item, index }) => renderCard(item, index))
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
