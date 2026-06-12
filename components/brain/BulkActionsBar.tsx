"use client";

import { useState } from "react";
import type { Category } from "@/lib/brain-model";

interface BulkActionsBarProps {
  count: number;
  categories: Category[];
  archivedView: boolean;
  busy: boolean;
  onAddTag: (tag: string) => void;
  onSetCategory: (name: string) => void;
  onArchive: (archive: boolean) => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}

// Fixed action bar shown while multi-select mode has items selected
// (roadmap 2.5). Tag/category inputs expand inline; the heavy lifting
// (sequential PUT/DELETE loops) stays in Brain.
export function BulkActionsBar(props: BulkActionsBarProps) {
  const { count, categories, archivedView, busy, onAddTag, onSetCategory, onArchive, onDelete, onSelectAll, onClear } = props;
  const [mode, setMode] = useState<null | "tag" | "category">(null);
  const [tagInput, setTagInput] = useState("");

  const actionClass = "px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition disabled:opacity-40";

  const submitTag = () => {
    const tag = tagInput.trim().replace(/^#/, "");
    if (!tag) return;
    onAddTag(tag);
    setTagInput("");
    setMode(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-brand-border bg-[#0D0F12]/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-[#E8A838]">{count} selected</span>
        <button onClick={onSelectAll} disabled={busy} className={`${actionClass} border-brand-border text-gray-400 hover:text-gray-200`}>
          Select all
        </button>

        {mode === "tag" ? (
          <span className="flex items-center gap-1.5">
            <input
              autoFocus
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") submitTag();
                if (e.key === "Escape") setMode(null);
              }}
              placeholder="tag name…"
              className="w-32 rounded-lg border border-brand-border bg-[#13161B] px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
            />
            <button onClick={submitTag} disabled={busy || !tagInput.trim()} className={`${actionClass} border-[#6FCF9760] text-[#6FCF97]`}>Apply</button>
          </span>
        ) : (
          <button onClick={() => setMode("tag")} disabled={busy} className={`${actionClass} border-[#6FCF9740] text-[#6FCF97]`}>
            # Add tag
          </button>
        )}

        {mode === "category" ? (
          <select
            autoFocus
            defaultValue=""
            disabled={busy}
            onChange={e => {
              if (e.target.value) onSetCategory(e.target.value);
              setMode(null);
            }}
            className="rounded-lg border border-brand-border bg-[#13161B] px-2 py-1.5 text-xs text-gray-200 outline-none"
          >
            <option value="" disabled>Pick category…</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
        ) : (
          <button onClick={() => setMode("category")} disabled={busy || categories.length === 0} className={`${actionClass} border-[#56CCF240] text-[#56CCF2]`}>
            ⊞ Set category
          </button>
        )}

        <button onClick={() => onArchive(!archivedView)} disabled={busy} className={`${actionClass} border-[#E8A83840] text-[#E8A838]`}>
          {archivedView ? "↩ Unarchive" : "⊟ Archive"}
        </button>
        <button onClick={onDelete} disabled={busy} className={`${actionClass} border-[#EB575740] text-[#EB5757]`}>
          ✕ Delete
        </button>

        <span className="flex-1" />
        {busy && <span className="font-mono text-[11px] text-gray-500">working…</span>}
        <button onClick={onClear} disabled={busy} className={`${actionClass} border-brand-border text-gray-400 hover:text-gray-200`}>
          Done
        </button>
      </div>
    </div>
  );
}
