"use client";

import type { ChecklistItem } from "@/lib/task-checklists";

interface TaskChecklistEditorProps {
  items: ChecklistItem[];
  onAdd: () => void;
  onToggle: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}

export default function TaskChecklistEditor({
  items,
  onAdd,
  onToggle,
  onTextChange,
  onRemove,
}: TaskChecklistEditorProps) {
  const completedCount = items.filter((item) => item.completed).length;

  return (
    <div className="mb-4 rounded-lg border border-brand-border bg-brand-muted/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-[11px] font-mono text-gray-400 tracking-wide">
          Checklist
        </label>
        {items.length > 0 && (
          <span className="text-[10px] font-mono text-gray-600">
            {completedCount}/{items.length} complete
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] font-mono text-gray-600 mb-2">
          Add checkbox lines for the steps or documents inside this task.
        </p>
      ) : (
        <div className="flex flex-col gap-2 mb-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-brand-border bg-[#101318] px-3 py-2"
            >
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => onToggle(item.id)}
                aria-label={`Toggle ${item.text || "checklist item"}`}
                className="h-4 w-4 rounded border-brand-border bg-transparent accent-[#56CCF2]"
              />
              <input
                type="text"
                value={item.text}
                onChange={(event) => onTextChange(item.id, event.target.value)}
                placeholder="Checklist item"
                aria-label="Checklist item text"
                className={`flex-1 bg-transparent text-sm outline-none placeholder:text-gray-500 ${
                  item.completed ? "text-gray-500 line-through" : "text-gray-200"
                }`}
              />
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label="Delete checklist item"
                title="Delete checklist item"
                className="text-[11px] font-mono text-gray-500 hover:text-red-400 transition px-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className="text-[11px] font-mono text-gray-500 hover:text-gray-300 transition"
      >
        + Add checklist item
      </button>
    </div>
  );
}
