"use client";

import { useEffect, useState, type RefObject } from "react";
import { TYPES, type Category, type ItemType } from "@/lib/brain-model";

type OpenMenu = null | "type" | "category" | "tags" | "more";

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searching?: boolean;
  view: "all" | ItemType;
  onViewChange: (view: "all" | ItemType) => void;
  counts: Record<string, number>;
  catFilter: string;
  onCatFilterChange: (name: string) => void;
  parentCats: Category[];
  getChildren: (parentId: string) => Category[];
  getCatNamesUnderParent: (name: string) => string[];
  usedCatNames: Set<string>;
  itemCount: number;
  sourceCounts: { key: string; label: string; count: number }[];
  sourceFilter: string | null;
  onSourceFilterChange: (key: string | null) => void;
  tagsByCount: string[];
  tagCounts: Map<string, number>;
  tagFilter: string | null;
  onTagFilterChange: (tag: string | null) => void;
  tagColor: (tag: string) => string;
  duplicateGroupCount: number;
  onOpenTagManager: () => void;
  sortBy: "newest" | "oldest";
  onSortByChange: (sort: "newest" | "oldest") => void;
  withNotesOnly: boolean;
  onWithNotesOnly: (v: boolean) => void;
  withNotesCount: number;
  favouritesOnly: boolean;
  onFavouritesOnly: (v: boolean) => void;
  favouriteCount: number;
  actionOnly: boolean;
  onActionOnly: (v: boolean) => void;
  actionCount: number;
  remindersOnly: boolean;
  onRemindersOnly: (v: boolean) => void;
  reminderCount: number;
  readLaterOnly: boolean;
  onReadLaterOnly: (v: boolean) => void;
  readLaterCount: number;
  reviewMode: boolean;
  onReviewMode: (v: boolean) => void;
  reviewCount: number;
  archivedOnly: boolean;
  onArchivedOnly: (v: boolean) => void;
  datePreset: "all" | "today" | "week" | "month" | "custom";
  onDatePreset: (preset: "all" | "today" | "week" | "month" | "custom") => void;
  dateFrom: string;
  onDateFrom: (v: string) => void;
  dateTo: string;
  onDateTo: (v: string) => void;
  selectMode: boolean;
  onSelectMode: (v: boolean) => void;
}

const panelClass = "absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-brand-border bg-[#0D0F12] p-3 shadow-2xl";
const menuSearchClass = "mb-2 w-full rounded-lg border border-brand-border bg-[#13161B] px-3 py-2 text-sm text-gray-200 outline-none focus:border-gray-500";

// Single-row filter bar: search / type / category / tags / more / sort.
// Secondary toggles (with-notes, favourites, action, reminders, review) and
// the source filter live in the "More" popover. Filter state stays in Brain.
export function FilterBar(props: FilterBarProps) {
  const {
    search, onSearchChange, searchInputRef, searching,
    view, onViewChange, counts,
    catFilter, onCatFilterChange, parentCats, getChildren, getCatNamesUnderParent, usedCatNames, itemCount,
    sourceCounts, sourceFilter, onSourceFilterChange,
    tagsByCount, tagCounts, tagFilter, onTagFilterChange, tagColor, duplicateGroupCount, onOpenTagManager,
    sortBy, onSortByChange,
    withNotesOnly, onWithNotesOnly, withNotesCount,
    favouritesOnly, onFavouritesOnly, favouriteCount,
    actionOnly, onActionOnly, actionCount,
    remindersOnly, onRemindersOnly, reminderCount,
    readLaterOnly, onReadLaterOnly, readLaterCount,
    reviewMode, onReviewMode, reviewCount,
    archivedOnly, onArchivedOnly,
    datePreset, onDatePreset, dateFrom, onDateFrom, dateTo, onDateTo,
    selectMode, onSelectMode,
  } = props;

  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [catMenuSearch, setCatMenuSearch] = useState("");
  const [sourceMenuSearch, setSourceMenuSearch] = useState("");
  const [tagMenuSearch, setTagMenuSearch] = useState("");

  const closeMenus = () => {
    setOpenMenu(null);
    setCatMenuSearch("");
    setSourceMenuSearch("");
    setTagMenuSearch("");
  };
  const toggleMenu = (menu: Exclude<OpenMenu, null>) =>
    setOpenMenu(prev => (prev === menu ? null : menu));

  // Close any open popover on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-filter-bar]")) closeMenus();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenus();
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  const categoryMenuQuery = catMenuSearch.trim().toLowerCase();
  const categoryMenuGroups = parentCats
    .map(parent => {
      const children = getChildren(parent.id).filter(sub => usedCatNames.has(sub.name));
      return { parent, children };
    })
    .filter(({ parent, children }) => {
      if (!categoryMenuQuery) return true;
      return parent.name.toLowerCase().includes(categoryMenuQuery)
        || children.some(child => child.name.toLowerCase().includes(categoryMenuQuery));
    });

  const menuTags = tagMenuSearch.trim()
    ? tagsByCount.filter(t => t.toLowerCase().includes(tagMenuSearch.toLowerCase()))
    : tagsByCount;

  const sourceMenuQuery = sourceMenuSearch.trim().toLowerCase();
  const sourceMenuItems = sourceMenuQuery
    ? sourceCounts.filter(src => src.label.toLowerCase().includes(sourceMenuQuery) || src.key.toLowerCase().includes(sourceMenuQuery))
    : sourceCounts;

  const dateActive = datePreset !== "all";
  const secondaryActive = [withNotesOnly, favouritesOnly, actionOnly, remindersOnly, readLaterOnly, reviewMode, archivedOnly, dateActive, sourceFilter !== null].filter(Boolean).length;
  const activeCount = [
    view !== "all",
    catFilter !== "all",
    sourceFilter !== null,
    tagFilter !== null,
    withNotesOnly,
    favouritesOnly,
    actionOnly,
    remindersOnly,
    readLaterOnly,
    reviewMode,
    archivedOnly,
    dateActive,
    search.trim().length > 0,
  ].filter(Boolean).length;

  const clearAll = () => {
    onViewChange("all");
    onCatFilterChange("all");
    onSourceFilterChange(null);
    onTagFilterChange(null);
    onWithNotesOnly(false);
    onFavouritesOnly(false);
    onActionOnly(false);
    onRemindersOnly(false);
    onReadLaterOnly(false);
    onReviewMode(false);
    onArchivedOnly(false);
    onDatePreset("all");
    onDateFrom("");
    onDateTo("");
    onSearchChange("");
    closeMenus();
  };

  const viewColor = view === "all" ? "#E8A838" : TYPES[view].color;
  const triggerClass = "px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 flex items-center gap-1.5";

  const togglePill = (
    active: boolean,
    onToggle: (v: boolean) => void,
    color: string,
    label: string,
    count: number,
    title: string,
  ) => (
    <button
      onClick={() => onToggle(!active)}
      className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0"
      style={{
        border: active ? `1px solid ${color}90` : `1px solid ${color}30`,
        background: active ? `${color}25` : "transparent",
        color: active ? color : `${color}90`,
      }}
      title={title}
    >
      {label} <span className="opacity-50 text-[10px]">{count}</span>
    </button>
  );

  return (
    <div className="relative pb-2" data-filter-bar>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {/* Search */}
        <div className="relative min-w-[180px] flex-1">
          <input
            ref={searchInputRef}
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search… (Ctrl+K)"
            aria-label="Search items"
            className="w-full py-2 min-h-[44px] sm:min-h-0 pl-8 pr-3 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500"
          />
          {searching ? (
            <span
              className="absolute left-2.5 top-1/2 -translate-y-1/2 inline-block w-3.5 h-3.5 border border-gray-500 border-t-transparent rounded-full"
              style={{ animation: "spin 0.6s linear infinite" }}
              aria-label="Searching"
            />
          ) : (
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600 text-sm">⌕</span>
          )}
        </div>

        {/* Type */}
        <button
          onClick={() => toggleMenu("type")}
          className={triggerClass}
          style={{
            border: `1px solid ${viewColor}${view !== "all" ? "70" : "30"}`,
            background: view !== "all" ? `${viewColor}18` : "transparent",
            color: view !== "all" ? viewColor : `${viewColor}A0`,
          }}
          aria-expanded={openMenu === "type"}
        >
          {view === "all" ? "◇ All" : `${TYPES[view].icon} ${TYPES[view].label}`}
          <span className="opacity-60 text-[10px]">{counts[view]}</span>
          <span className="text-[10px]">{openMenu === "type" ? "▴" : "▾"}</span>
        </button>

        {/* Category */}
        {parentCats.length > 0 && (
          <button
            onClick={() => toggleMenu("category")}
            className={triggerClass}
            style={{
              border: `1px solid ${catFilter !== "all" ? "#E8A83870" : "#333842"}`,
              background: catFilter !== "all" ? "#E8A83815" : "transparent",
              color: catFilter !== "all" ? "#E8A838" : "#9aa1ad",
            }}
            aria-expanded={openMenu === "category"}
          >
            <span className="max-w-[140px] truncate">⊞ {catFilter === "all" ? "Categories" : catFilter}</span>
            <span className="text-[10px]">{openMenu === "category" ? "▴" : "▾"}</span>
          </button>
        )}

        {/* Tags */}
        {tagsByCount.length > 0 && (
          <button
            onClick={() => toggleMenu("tags")}
            className={triggerClass}
            style={{
              border: `1px solid ${tagFilter ? `${tagColor(tagFilter)}70` : "#333842"}`,
              background: tagFilter ? `${tagColor(tagFilter)}15` : "transparent",
              color: tagFilter ? tagColor(tagFilter) : "#9aa1ad",
            }}
            aria-expanded={openMenu === "tags"}
          >
            <span className="max-w-[140px] truncate"># {tagFilter || "Tags"}</span>
            <span className="text-[10px]">{openMenu === "tags" ? "▴" : "▾"}</span>
          </button>
        )}

        {/* More filters */}
        <button
          onClick={() => toggleMenu("more")}
          className={triggerClass}
          style={{
            border: `1px solid ${secondaryActive > 0 ? "#E8A83870" : "#333842"}`,
            background: secondaryActive > 0 ? "#E8A83815" : "transparent",
            color: secondaryActive > 0 ? "#E8A838" : "#9aa1ad",
          }}
          aria-expanded={openMenu === "more"}
        >
          ⚙ More
          {secondaryActive > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[10px] font-bold text-[#13161B]"
              style={{ background: "#E8A838" }}
            >{secondaryActive}</span>
          )}
          <span className="text-[10px]">{openMenu === "more" ? "▴" : "▾"}</span>
        </button>

        {/* Sort */}
        <button
          onClick={() => onSortByChange(sortBy === "newest" ? "oldest" : "newest")}
          className={`${triggerClass} border border-brand-border text-gray-500 hover:text-gray-300`}
          title="Toggle sort order"
        >
          ↕ {sortBy === "newest" ? "Newest" : "Oldest"}
        </button>

        {/* Clear all */}
        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className={`${triggerClass}`}
            style={{ border: "1px solid #ffffff35", background: "#ffffff10", color: "#ddd" }}
            title="Clear all active filters and search"
          >
            × Clear <span className="opacity-60 text-[10px]">{activeCount}</span>
          </button>
        )}
      </div>

      {openMenu === "type" && (
        <div className={panelClass}>
          <div className="flex flex-wrap gap-1.5">
            {[{ key: "all" as const, label: "All", icon: "◇", color: "#E8A838" }, ...Object.entries(TYPES).map(([k, v]) => ({ key: k as "all" | ItemType, label: v.label, icon: v.icon, color: v.color }))].map(tab => {
              const active = view === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    onViewChange(tab.key);
                    if (tab.key === "all") onCatFilterChange("all");
                    closeMenus();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 flex items-center gap-1.5"
                  style={{
                    border: `1px solid ${tab.color}${active ? "70" : "25"}`,
                    background: active ? `${tab.color}18` : "transparent",
                    color: active ? tab.color : `${tab.color}A0`,
                  }}
                >
                  <span>{tab.icon} {tab.label}</span>
                  <span className="opacity-60 text-[10px]">{counts[tab.key]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {openMenu === "category" && (
        <div className={panelClass}>
          <input
            type="text"
            autoFocus
            value={catMenuSearch}
            onChange={e => setCatMenuSearch(e.target.value)}
            placeholder="Search categories…"
            className={menuSearchClass}
          />
          <div className="max-h-72 overflow-y-auto no-scrollbar">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onCatFilterChange("all");
                  onViewChange("all");
                  closeMenus();
                }}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left transition"
                style={{
                  borderColor: catFilter === "all" ? "#E8A83860" : "#343842",
                  background: catFilter === "all" ? "#E8A83815" : "#13161B",
                  color: catFilter === "all" ? "#E8A838" : "#ddd",
                }}
              >
                <span className="font-mono text-[11px] whitespace-nowrap">All categories</span>
                <span className="text-[10px] opacity-60">{itemCount}</span>
              </button>

              {categoryMenuGroups.length === 0 ? (
                <div className="w-full p-4 text-center text-xs text-gray-500">No categories match &ldquo;{catMenuSearch}&rdquo;</div>
              ) : (
                categoryMenuGroups.map(({ parent, children }) => {
                  const parentActive = catFilter === parent.name;
                  const parentCount = getCatNamesUnderParent(parent.name).filter(name => usedCatNames.has(name)).length;

                  if (children.length === 0) {
                    return (
                      <button
                        key={parent.id}
                        type="button"
                        onClick={() => {
                          onCatFilterChange(parentActive ? "all" : parent.name);
                          closeMenus();
                        }}
                        className="inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left transition"
                        style={{
                          borderColor: `${parent.color}${parentActive ? "70" : "35"}`,
                          background: parentActive ? `${parent.color}20` : `${parent.color}10`,
                          color: parent.color,
                        }}
                      >
                        <span className="truncate font-mono text-[11px]">{parent.name}</span>
                        <span className="shrink-0 text-[10px] opacity-60">{parentCount}</span>
                      </button>
                    );
                  }

                  return (
                    <div key={parent.id} className="inline-flex max-w-full flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onCatFilterChange(parentActive ? "all" : parent.name);
                          closeMenus();
                        }}
                        className="inline-flex max-w-full items-center gap-2 self-start rounded-full border px-3 py-1.5 text-left transition"
                        style={{
                          borderColor: `${parent.color}${parentActive ? "70" : "35"}`,
                          background: parentActive ? `${parent.color}20` : `${parent.color}10`,
                          color: parent.color,
                        }}
                      >
                        <span className="truncate font-mono text-[11px]">{parent.name}</span>
                        <span className="shrink-0 text-[10px] opacity-60">{parentCount}</span>
                      </button>
                      <div className="flex max-w-full flex-wrap gap-1.5 pl-2">
                        {children.map(child => {
                          const childActive = catFilter === child.name;
                          return (
                            <button
                              key={child.id}
                              type="button"
                              onClick={() => {
                                onCatFilterChange(child.name);
                                closeMenus();
                              }}
                              className="rounded-full border px-2.5 py-1 text-[10px] font-mono transition"
                              style={{
                                borderColor: childActive ? `${child.color}60` : `${child.color}25`,
                                background: childActive ? `${child.color}15` : "transparent",
                                color: childActive ? child.color : "#7b8190",
                              }}
                            >
                              {child.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {openMenu === "tags" && (
        <div className={panelClass}>
          <input
            type="text"
            autoFocus
            value={tagMenuSearch}
            onChange={e => setTagMenuSearch(e.target.value)}
            placeholder="Search tags…"
            className={menuSearchClass}
          />
          <div className="max-h-64 overflow-y-auto no-scrollbar">
            {menuTags.length === 0 ? (
              <div className="text-gray-500 text-xs p-4 text-center">No tags match &ldquo;{tagMenuSearch}&rdquo;</div>
            ) : (
              <div className="flex gap-1.5 flex-wrap">
                {menuTags.map(tag => {
                  const color = tagColor(tag);
                  const active = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        onTagFilterChange(active ? null : tag);
                        closeMenus();
                      }}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap"
                      style={{
                        border: `1px solid ${color}30`,
                        background: active ? `${color}20` : "transparent",
                        color,
                      }}
                    >
                      #{tag} <span className="opacity-50">{tagCounts.get(tag) ?? 0}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-brand-border flex items-center justify-between">
            <span className="text-[10px] text-gray-600 font-mono">
              {duplicateGroupCount > 0
                ? `${duplicateGroupCount} duplicate group${duplicateGroupCount > 1 ? "s" : ""} found`
                : "No duplicates"}
            </span>
            <button
              onClick={() => { closeMenus(); onOpenTagManager(); }}
              className="text-[11px] font-mono text-gray-400 hover:text-[#E8A838] transition"
            >
              Manage tags →
            </button>
          </div>
        </div>
      )}

      {openMenu === "more" && (
        <div className={panelClass}>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 mb-2">Quick filters</p>
          <div className="flex flex-wrap gap-1.5">
            {withNotesCount > 0 && togglePill(withNotesOnly, onWithNotesOnly, "#6FCF97", "✎ With notes", withNotesCount, "Show only items with notes attached")}
            {favouriteCount > 0 && togglePill(favouritesOnly, onFavouritesOnly, "#F2C94C", "★ Favourites", favouriteCount, "Show only favourites")}
            {actionCount > 0 && togglePill(actionOnly, onActionOnly, "#EB5757", "⚡ Needs action", actionCount, "Show only items needing action")}
            {reminderCount > 0 && togglePill(remindersOnly, onRemindersOnly, "#56CCF2", "⏰ Reminders", reminderCount, "Show cards with pending reminders")}
            {readLaterCount > 0 && togglePill(readLaterOnly, onReadLaterOnly, "#9B51E0", "◐ To read", readLaterCount, "Show unread and in-progress link cards")}
            {reviewCount > 0 && togglePill(reviewMode, onReviewMode, "#EB5757", "⚑ Review", reviewCount, "Items needing attention: no category, no tags, short title, or stale tasks")}
            <button
              onClick={() => onArchivedOnly(!archivedOnly)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0"
              style={{
                border: archivedOnly ? "1px solid #9aa1ad90" : "1px solid #9aa1ad30",
                background: archivedOnly ? "#9aa1ad25" : "transparent",
                color: archivedOnly ? "#cfd4dc" : "#9aa1ad90",
              }}
              title="Show archived cards instead of the active grid"
            >
              ⊟ Archived
            </button>
            <button
              onClick={() => { onSelectMode(!selectMode); closeMenus(); }}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0"
              style={{
                border: selectMode ? "1px solid #E8A83890" : "1px solid #E8A83830",
                background: selectMode ? "#E8A83825" : "transparent",
                color: selectMode ? "#E8A838" : "#E8A83890",
              }}
              title="Multi-select cards for bulk tag/category/archive/delete"
            >
              ☑ Select
            </button>
          </div>

          <div className="mt-3 pt-3 border-t border-brand-border">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 mb-2">Created</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {([
                { key: "all", label: "Any time" },
                { key: "today", label: "Today" },
                { key: "week", label: "This week" },
                { key: "month", label: "This month" },
                { key: "custom", label: "Custom" },
              ] as const).map(opt => {
                const active = datePreset === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => onDatePreset(opt.key)}
                    className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0"
                    style={{
                      border: active ? "1px solid #56CCF290" : "1px solid #56CCF230",
                      background: active ? "#56CCF225" : "transparent",
                      color: active ? "#56CCF2" : "#56CCF290",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {datePreset === "custom" && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono text-gray-400">
                <label className="flex items-center gap-1.5">
                  from
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => onDateFrom(e.target.value)}
                    className="rounded-lg border border-brand-border bg-[#13161B] px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  to
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => onDateTo(e.target.value)}
                    className="rounded-lg border border-brand-border bg-[#13161B] px-2 py-1 text-xs text-gray-200 outline-none focus:border-gray-500"
                  />
                </label>
              </div>
            )}
          </div>

          {sourceCounts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-brand-border">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 mb-2">Sources</p>
              <input
                type="text"
                value={sourceMenuSearch}
                onChange={e => setSourceMenuSearch(e.target.value)}
                placeholder="Search sources…"
                className={menuSearchClass}
              />
              <div className="max-h-48 overflow-y-auto no-scrollbar">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSourceFilterChange(null)}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-left transition"
                    style={{
                      borderColor: sourceFilter === null ? "#E8A83860" : "#343842",
                      background: sourceFilter === null ? "#E8A83815" : "#13161B",
                      color: sourceFilter === null ? "#E8A838" : "#ddd",
                    }}
                  >
                    <span className="font-mono text-[11px] whitespace-nowrap">All sources</span>
                    <span className="text-[10px] opacity-60">{sourceCounts.reduce((sum, src) => sum + src.count, 0)}</span>
                  </button>
                  {sourceMenuItems.length === 0 ? (
                    <div className="w-full p-4 text-center text-xs text-gray-500">No sources match &ldquo;{sourceMenuSearch}&rdquo;</div>
                  ) : (
                    sourceMenuItems.map(src => {
                      const active = sourceFilter === src.key;
                      return (
                        <button
                          key={src.key}
                          type="button"
                          onClick={() => onSourceFilterChange(active ? null : src.key)}
                          className="inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-left transition"
                          style={{
                            border: `1px solid ${active ? "#E8A83870" : "#44444460"}`,
                            background: active ? "#E8A83820" : "#13161B",
                            color: active ? "#E8A838" : "#aaa",
                          }}
                        >
                          <span className="truncate text-[11px] font-mono">{src.label}</span>
                          <span className="shrink-0 text-[10px] opacity-50">{src.count}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-brand-border flex justify-end">
            <button
              onClick={clearAll}
              disabled={activeCount === 0}
              className="text-[11px] font-mono text-gray-400 hover:text-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              × Clear all filters {activeCount > 0 && <span className="opacity-60">({activeCount})</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
