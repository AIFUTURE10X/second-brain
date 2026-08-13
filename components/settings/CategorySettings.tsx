"use client";

import { useEffect, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { showToast } from "../Toast";
import { CAT_COLORS, type Category, type Item } from "@/lib/brain-model";
import {
  SETTINGS_GHOST_BUTTON_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_PRIMARY_BUTTON_CLASS,
  SETTINGS_PRIMARY_BUTTON_STYLE,
  SETTINGS_SELECT_CLASS,
  SettingsCard,
  SettingsEmptyNote,
} from "./ui";

const COLLAPSED_CATS_KEY = "sb_collapsed_cats";
const CUSTOM_COLORS_LOCAL_KEY = "sb_custom_cat_colors";
const CUSTOM_COLORS_SETTINGS_KEY = "custom_cat_colors";

// Sort by position (manual order from server) then name as tiebreak.
const sortByPosition = (a: Category, b: Category) =>
  (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name);

interface CategorySettingsProps {
  categories: Category[];
  setCategories: Dispatch<SetStateAction<Category[]>>;
  items: Item[] | null;
  /** Renames and deletes rewrite item.category server-side — refetch after. */
  onItemsChanged: () => void;
}

/**
 * The full Category Manager: create, rename, recolour, re-parent, reorder and
 * delete. Moved here out of the Brain.tsx bottom sheet — same data flow
 * (/api/categories) and the same custom-colour dual write (localStorage cache
 * + the `custom_cat_colors` settings key).
 */
export function CategorySettings({ categories, setCategories, items, onItemsChanged }: CategorySettingsProps) {
  const [newCat, setNewCat] = useState({ name: "", color: CAT_COLORS[0], parentId: "" });
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const [catSort, setCatSort] = useState<"manual" | "asc" | "desc">("manual");
  const [draggingCatId, setDraggingCatId] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [customCatColors, setCustomCatColors] = useState<string[]>([]);
  const customColorsLoaded = useRef(false);

  // Custom category colours — synced to the server via /api/settings, with
  // localStorage acting as an instant cache so the palette renders before the
  // network responds.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(CUSTOM_COLORS_LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCustomCatColors(parsed.filter((c): c is string => typeof c === "string"));
      }
    } catch {}
    fetch(`/api/settings?key=${CUSTOM_COLORS_SETTINGS_KEY}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const remote = data?.[CUSTOM_COLORS_SETTINGS_KEY];
        if (Array.isArray(remote)) {
          setCustomCatColors(remote.filter((c: unknown): c is string => typeof c === "string"));
        }
      })
      .catch(() => {})
      .finally(() => { customColorsLoaded.current = true; });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUSTOM_COLORS_LOCAL_KEY, JSON.stringify(customCatColors));
    // Don't push to the server until the initial load has completed — otherwise
    // we'd overwrite the server's list with whatever the empty state was.
    if (!customColorsLoaded.current) return;
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: CUSTOM_COLORS_SETTINGS_KEY, value: customCatColors }),
    }).catch(() => {});
  }, [customCatColors]);

  // Which parents are collapsed is a per-device preference.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(COLLAPSED_CATS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCollapsedCats(new Set(parsed.filter((c): c is string => typeof c === "string")));
      }
    } catch {}
  }, []);

  const toggleCatCollapsed = (id: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(COLLAPSED_CATS_KEY, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };

  const addCustomCatColor = (hex: string): string => {
    const normalized = hex.toLowerCase();
    if (CAT_COLORS.map(c => c.toLowerCase()).includes(normalized)) return hex;
    setCustomCatColors(prev => (prev.map(c => c.toLowerCase()).includes(normalized) ? prev : [...prev, hex]));
    return hex;
  };

  const removeCustomCatColor = (hex: string) => {
    const normalized = hex.toLowerCase();
    setCustomCatColors(prev => prev.filter(c => c.toLowerCase() !== normalized));
  };

  const handleAddCategory = async () => {
    if (!newCat.name.trim()) return;
    setCatLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCat.name, color: newCat.color, parentId: newCat.parentId || null }),
      });
      if (!res.ok) {
        showToast("Failed to add category", "error");
      } else {
        const created: Category = await res.json();
        setCategories(prev => [...prev, created].sort(sortByPosition));
        setNewCat({ name: "", color: CAT_COLORS[0], parentId: "" });
        showToast("Category created", "success");
      }
    } catch {
      showToast("Failed to add category", "error");
    }
    setCatLoading(false);
  };

  const handleEditCategory = async () => {
    if (!editingCat) return;
    setCatLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCat.id, name: editingCat.name, color: editingCat.color, parentId: editingCat.parentId }),
      });
      if (!res.ok) {
        showToast("Failed to update category", "error");
      } else {
        const updated: Category = await res.json();
        setCategories(prev => prev.map(c => (c.id === updated.id ? updated : c)).sort(sortByPosition));
        setEditingCat(null);
        showToast("Category saved", "success");
        onItemsChanged();
      }
    } catch {
      showToast("Failed to update category", "error");
    }
    setCatLoading(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category? Items in this category will be uncategorized.")) return;
    setCatLoading(true);
    try {
      const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Failed to delete category", "error");
      } else {
        setCategories(prev => prev.filter(c => c.id !== id && c.parentId !== id));
        if (editingCat?.id === id) setEditingCat(null);
        showToast("Category deleted", "success");
        onItemsChanged();
      }
    } catch {
      showToast("Failed to delete category", "error");
    }
    setCatLoading(false);
  };

  // Reorder a category within its parent group via drag-and-drop. Persists.
  const reorderCategory = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const dragged = categories.find(c => c.id === draggedId);
    const target = categories.find(c => c.id === targetId);
    if (!dragged || !target || dragged.parentId !== target.parentId) return;

    const siblings = categories.filter(c => c.parentId === dragged.parentId).sort(sortByPosition);
    const without = siblings.filter(c => c.id !== draggedId);
    const targetIdx = without.findIndex(c => c.id === targetId);
    const reordered = [...without.slice(0, targetIdx), dragged, ...without.slice(targetIdx)];
    const orders = reordered.map((c, i) => ({ id: c.id, position: i }));

    setCategories(prev => prev.map(c => {
      const o = orders.find(x => x.id === c.id);
      return o ? { ...c, position: o.position } : c;
    }));

    try {
      await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
    } catch {
      showToast("Failed to save order", "error");
    }
  };

  const sortFn = catSort === "asc"
    ? (a: Category, b: Category) => a.name.localeCompare(b.name)
    : catSort === "desc"
      ? (a: Category, b: Category) => b.name.localeCompare(a.name)
      : sortByPosition;
  const parents = categories.filter(c => !c.parentId).sort(sortFn);
  const childrenSorted = (pid: string) => categories.filter(c => c.parentId === pid).sort(sortFn);
  const draggable = catSort === "manual";

  const countFor = (cat: Category): number | null => {
    if (!items) return null;
    const names = [cat.name, ...categories.filter(c => c.parentId === cat.id).map(c => c.name)];
    return items.filter(i => names.includes(i.category)).length;
  };

  const rowDragProps = (cat: Category) => (draggable ? {
    draggable: true,
    onDragStart: (e: DragEvent) => { setDraggingCatId(cat.id); e.dataTransfer.effectAllowed = "move"; },
    onDragEnd: () => setDraggingCatId(null),
    onDragOver: (e: DragEvent) => {
      if (!draggingCatId || draggingCatId === cat.id) return;
      const dragged = categories.find(c => c.id === draggingCatId);
      if (dragged?.parentId !== cat.parentId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (draggingCatId) reorderCategory(draggingCatId, cat.id);
      setDraggingCatId(null);
    },
  } : {});

  const colorSwatches = (selected: string, onPick: (hex: string) => void, paletteSize: number) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {[...CAT_COLORS.slice(0, paletteSize), ...customCatColors].map(c => (
        <span key={c} className="relative group">
          <button
            type="button"
            onClick={() => onPick(c)}
            className="block h-5 w-5 rounded-full transition-transform"
            style={{
              background: c,
              border: selected === c ? "2px solid white" : "2px solid transparent",
              transform: selected === c ? "scale(1.15)" : "scale(1)",
            }}
            aria-label={`Use color ${c}`}
          />
          {customCatColors.includes(c) && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeCustomCatColor(c); }}
              className="absolute -right-1 -top-1 hidden h-3 w-3 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-[8px] text-gray-400 group-hover:flex"
              title="Remove this custom color"
              aria-label={`Remove custom color ${c}`}
            >×</button>
          )}
        </span>
      ))}
      <label
        className="relative flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-[9px] text-gray-400"
        style={{ border: "1px dashed #555" }}
        title="Add new color"
      >
        +
        <input
          type="color"
          defaultValue="#888888"
          onChange={e => onPick(addCustomCatColor(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Add custom color"
        />
      </label>
    </div>
  );

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Your categories"
        description={draggable ? "Drag the ⋮⋮ handle to reorder within a level." : "Switch to manual ordering to drag rows."}
        action={
          <div className="flex gap-1 text-[10px] font-mono">
            {(["manual", "asc", "desc"] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setCatSort(mode)}
                className="rounded border px-2 py-1 transition"
                style={{
                  borderColor: catSort === mode ? "#E8A83870" : "#ffffff15",
                  background: catSort === mode ? "#E8A83815" : "transparent",
                  color: catSort === mode ? "#E8A838" : "#888",
                }}
                title={mode === "manual" ? "Drag to reorder" : mode === "asc" ? "Sort A → Z" : "Sort Z → A"}
                aria-pressed={catSort === mode}
              >
                {mode === "manual" ? "↕ Manual" : mode === "asc" ? "A → Z" : "Z → A"}
              </button>
            ))}
          </div>
        }
      >
        {categories.length === 0 && (
          <SettingsEmptyNote>
            No categories yet. Add one below, or just save items — AI will auto-categorize.
          </SettingsEmptyNote>
        )}

        {parents.map(cat => {
          const subs = childrenSorted(cat.id);
          const collapsed = collapsedCats.has(cat.id);
          const count = countFor(cat);
          return (
            <div key={cat.id}>
              <div
                {...rowDragProps(cat)}
                className="flex items-center justify-between border-b border-brand-border py-2 transition-opacity"
                style={{ opacity: draggingCatId === cat.id ? 0.4 : 1 }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {draggable && <span className="cursor-grab select-none text-xs text-gray-700 active:cursor-grabbing" title="Drag to reorder">⋮⋮</span>}
                  {subs.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleCatCollapsed(cat.id)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-gray-500 transition hover:text-gray-200"
                      aria-expanded={!collapsed}
                      aria-label={collapsed ? `Expand ${cat.name}` : `Collapse ${cat.name}`}
                      title={collapsed ? "Show subcategories" : "Hide subcategories"}
                    >{collapsed ? "▸" : "▾"}</button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <div className="h-3 w-3 shrink-0 rounded-full" style={{ background: cat.color }} />
                  <span className="truncate text-sm text-gray-300">{cat.name}</span>
                  {count !== null && <span className="shrink-0 font-mono text-[10px] text-gray-700">{count}</span>}
                  {subs.length > 0 && collapsed && (
                    <span
                      className="ml-1 shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px]"
                      style={{ color: cat.color, background: `${cat.color}15`, border: `1px solid ${cat.color}30` }}
                      title={`${subs.length} subcategor${subs.length === 1 ? "y" : "ies"}`}
                    >+{subs.length}</span>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => setEditingCat({ ...cat })} disabled={catLoading} aria-label={`Edit ${cat.name}`} title={`Edit ${cat.name}`} className="flex h-9 w-9 items-center justify-center font-mono text-[12px] text-gray-600 transition hover:text-blue-400 disabled:opacity-50">✎</button>
                  <button type="button" onClick={() => handleDeleteCategory(cat.id)} disabled={catLoading} aria-label={`Delete ${cat.name}`} title={`Delete ${cat.name}`} className="flex h-9 w-9 items-center justify-center font-mono text-[12px] text-gray-600 transition hover:text-red-400 disabled:opacity-50">✕</button>
                </div>
              </div>

              {!collapsed && subs.map(sub => (
                <div
                  key={sub.id}
                  {...rowDragProps(sub)}
                  className="flex items-center justify-between border-b border-brand-border/50 py-1.5 pl-6 transition-opacity"
                  style={{ opacity: draggingCatId === sub.id ? 0.4 : 1 }}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {draggable && <span className="cursor-grab select-none text-[10px] text-gray-700 active:cursor-grabbing" title="Drag to reorder">⋮⋮</span>}
                    <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: sub.color }} />
                    <span className="truncate text-xs text-gray-400">↳ {sub.name}</span>
                    {items && (
                      <span className="shrink-0 font-mono text-[10px] text-gray-700">
                        {items.filter(i => i.category === sub.name).length}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditingCat({ ...sub })} disabled={catLoading} aria-label={`Edit ${sub.name}`} title={`Edit ${sub.name}`} className="flex h-9 w-9 items-center justify-center font-mono text-[11px] text-gray-600 transition hover:text-blue-400 disabled:opacity-50">✎</button>
                    <button type="button" onClick={() => handleDeleteCategory(sub.id)} disabled={catLoading} aria-label={`Delete ${sub.name}`} title={`Delete ${sub.name}`} className="flex h-9 w-9 items-center justify-center font-mono text-[11px] text-gray-600 transition hover:text-red-400 disabled:opacity-50">✕</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {editingCat && (
          <div className="mt-3 rounded-lg border border-type-link/30 bg-type-link/5 p-3">
            <p className="mb-2 font-mono text-[11px] text-type-link">Editing: {editingCat.name}</p>
            <input
              value={editingCat.name}
              onChange={e => setEditingCat(c => (c ? { ...c, name: e.target.value } : null))}
              className={`${SETTINGS_INPUT_CLASS} mb-2`}
              aria-label="Category name"
            />
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-gray-600">Color:</span>
              {colorSwatches(editingCat.color, hex => setEditingCat(c => (c ? { ...c, color: hex } : null)), 8)}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-gray-600">Parent:</span>
              <select
                value={editingCat.parentId || ""}
                onChange={e => setEditingCat(c => (c ? { ...c, parentId: e.target.value || null } : null))}
                className={SETTINGS_SELECT_CLASS}
                aria-label="Parent category"
              >
                <option value="">None (top-level)</option>
                {categories.filter(c => !c.parentId && c.id !== editingCat.id).sort(sortByPosition).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleEditCategory} disabled={catLoading} className={SETTINGS_PRIMARY_BUTTON_CLASS} style={SETTINGS_PRIMARY_BUTTON_STYLE}>
                {catLoading ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditingCat(null)} className={SETTINGS_GHOST_BUTTON_CLASS}>Cancel</button>
            </div>
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="Add a category" description="Pick a colour, and optionally nest it under an existing category.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newCat.name}
            onChange={e => setNewCat(n => ({ ...n, name: e.target.value }))}
            placeholder="New category name"
            aria-label="New category name"
            className={SETTINGS_INPUT_CLASS}
            onKeyDown={e => e.key === "Enter" && handleAddCategory()}
          />
          <button
            type="button"
            onClick={handleAddCategory}
            disabled={catLoading || !newCat.name.trim()}
            className={`${SETTINGS_PRIMARY_BUTTON_CLASS} shrink-0`}
            style={SETTINGS_PRIMARY_BUTTON_STYLE}
          >{catLoading ? "…" : "Add"}</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {colorSwatches(newCat.color, hex => setNewCat(n => ({ ...n, color: hex })), 6)}
          <select
            value={newCat.parentId}
            onChange={e => setNewCat(n => ({ ...n, parentId: e.target.value }))}
            className={SETTINGS_SELECT_CLASS}
            aria-label="Parent for the new category"
          >
            <option value="">Top-level</option>
            {categories.filter(c => !c.parentId).sort(sortByPosition).map(c => (
              <option key={c.id} value={c.id}>Sub of {c.name}</option>
            ))}
          </select>
        </div>
      </SettingsCard>
    </div>
  );
}
