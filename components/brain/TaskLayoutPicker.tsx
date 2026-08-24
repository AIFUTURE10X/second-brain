"use client";

export type TaskLayout = "board" | "list";

const TASK_LAYOUT_OPTIONS: Array<{ layout: TaskLayout; label: string; icon: string }> = [
  { layout: "board", label: "Board", icon: "▥" },
  { layout: "list", label: "List", icon: "☰" },
];

interface TaskLayoutPickerProps {
  layout: TaskLayout;
  onLayoutChange: (layout: TaskLayout) => void;
}

export function TaskLayoutPicker({ layout, onLayoutChange }: TaskLayoutPickerProps) {
  return (
    <div
      role="tablist"
      aria-label="Task layout"
      className="grid shrink-0 grid-cols-2 gap-1 rounded-lg border border-brand-border bg-[#0D1016] p-1"
    >
      {TASK_LAYOUT_OPTIONS.map(option => {
        const active = layout === option.layout;
        return (
          <button
            key={option.layout}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onLayoutChange(option.layout)}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[10px] font-mono font-semibold transition"
            style={{
              background: active ? "#56CCF218" : "transparent",
              color: active ? "#56CCF2" : "#6B7280",
            }}
          >
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
