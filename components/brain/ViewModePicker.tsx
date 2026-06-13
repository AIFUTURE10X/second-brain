"use client";

import { viewModeIcon, viewModeLabel } from "@/lib/brain-format";
import type { ViewMode } from "@/lib/view-mode";

const VIEW_MODE_OPTIONS: { mode: ViewMode; description: string }[] = [
  { mode: "list", description: "Compact card grid" },
  { mode: "compact", description: "Image-first cards" },
  { mode: "table", description: "Database rows" },
  { mode: "board", description: "Category columns" },
];

interface ViewModePickerProps {
  density: ViewMode;
  onDensityChange: (mode: ViewMode) => void;
}

export function ViewModePicker({ density, onDensityChange }: ViewModePickerProps) {
  return (
    <div
      data-view-mode-chips
      role="tablist"
      aria-label="View type"
      className="grid grid-cols-4 gap-1.5 min-[1800px]:gap-1 sm:flex sm:flex-wrap"
    >
      {VIEW_MODE_OPTIONS.map(option => {
        const active = density === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onDensityChange(option.mode)}
            className="inline-flex min-h-[36px] min-[1800px]:min-h-[32px] items-center justify-center gap-1.5 min-[1800px]:gap-1 rounded-lg border px-2.5 min-[1800px]:px-2 py-1.5 min-[1800px]:py-1 text-[11px] min-[1800px]:text-[10px] font-mono font-medium transition hover:border-[#E8A83860]"
            style={{
              borderColor: active ? "#E8A83870" : "#343842",
              background: active ? "#E8A83818" : "#13161B",
              color: active ? "#E8A838" : "#9AA1AD",
            }}
            title={option.description}
          >
            <span className="text-xs">{viewModeIcon(option.mode)}</span>
            <span className="truncate">{viewModeLabel(option.mode)}</span>
          </button>
        );
      })}
    </div>
  );
}
