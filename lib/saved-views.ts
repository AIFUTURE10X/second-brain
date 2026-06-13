export type SavedViewKey = "all" | "inbox" | "actions" | "favorites" | "tasks" | "reminders" | "cleanup";

export const CUSTOM_SAVED_VIEWS_KEY = "custom_saved_views";

export interface SavedViewDefinition {
  key: SavedViewKey;
  label: string;
  title: string;
  color: string;
}

export interface SavedViewFilters {
  view: "all" | "note" | "link" | "clip" | "thought" | "task" | "memory";
  catFilter: string;
  sourceFilter: string | null;
  tagFilter: string | null;
  withNotesOnly: boolean;
  favouritesOnly: boolean;
  actionOnly: boolean;
  remindersOnly: boolean;
  inboxOnly: boolean;
  reviewMode: boolean;
  search: string;
  sortBy: "newest" | "oldest";
}

export interface SavedViewCounts {
  all: number;
  inbox: number;
  actions: number;
  favorites: number;
  tasks: number;
  reminders: number;
  cleanup: number;
}

export interface CustomSavedViewDefinition {
  id: string;
  label: string;
  title: string;
  color: string;
  filters: SavedViewFilters;
}

const CUSTOM_VIEW_COLORS = ["#5B8DEF", "#6FCF97", "#F2C94C", "#BB6BD9", "#EB5757", "#56CCF2", "#E8A838"];
const VALID_ITEM_FILTERS = new Set(["all", "note", "link", "clip", "thought", "task", "memory"]);

export const SAVED_VIEWS: SavedViewDefinition[] = [
  { key: "all", label: "All", title: "Show every card", color: "#E8A838" },
  { key: "inbox", label: "Inbox", title: "New captures waiting for review", color: "#5B8DEF" },
  { key: "actions", label: "Action", title: "Cards marked as needing action", color: "#EB5757" },
  { key: "favorites", label: "Favorites", title: "Favourite cards", color: "#F2C94C" },
  { key: "tasks", label: "Tasks", title: "Task cards", color: "#56CCF2" },
  { key: "reminders", label: "Reminders", title: "Cards with pending reminders", color: "#6FCF97" },
  { key: "cleanup", label: "Cleanup", title: "Cards with missing or weak metadata", color: "#BB6BD9" },
];

export function defaultSavedViewFilters(): SavedViewFilters {
  return {
    view: "all",
    catFilter: "all",
    sourceFilter: null,
    tagFilter: null,
    withNotesOnly: false,
    favouritesOnly: false,
    actionOnly: false,
    remindersOnly: false,
    inboxOnly: false,
    reviewMode: false,
    search: "",
    sortBy: "newest",
  };
}

export function filtersForSavedView(key: SavedViewKey): SavedViewFilters {
  const base = defaultSavedViewFilters();
  switch (key) {
    case "inbox":
      return { ...base, inboxOnly: true };
    case "actions":
      return { ...base, actionOnly: true };
    case "favorites":
      return { ...base, favouritesOnly: true };
    case "tasks":
      return { ...base, view: "task" };
    case "reminders":
      return { ...base, remindersOnly: true };
    case "cleanup":
      return { ...base, reviewMode: true };
    case "all":
    default:
      return base;
  }
}

export function normalizeSavedViewFilters(value: unknown): SavedViewFilters {
  const base = defaultSavedViewFilters();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<SavedViewFilters>;
  return {
    view: typeof raw.view === "string" && VALID_ITEM_FILTERS.has(raw.view) ? raw.view as SavedViewFilters["view"] : base.view,
    catFilter: typeof raw.catFilter === "string" ? raw.catFilter : base.catFilter,
    sourceFilter: typeof raw.sourceFilter === "string" ? raw.sourceFilter : null,
    tagFilter: typeof raw.tagFilter === "string" ? raw.tagFilter : null,
    withNotesOnly: raw.withNotesOnly === true,
    favouritesOnly: raw.favouritesOnly === true,
    actionOnly: raw.actionOnly === true,
    remindersOnly: raw.remindersOnly === true,
    inboxOnly: raw.inboxOnly === true,
    reviewMode: raw.reviewMode === true,
    search: typeof raw.search === "string" ? raw.search : base.search,
    sortBy: raw.sortBy === "oldest" ? "oldest" : "newest",
  };
}

export function normalizeCustomSavedViews(value: unknown): CustomSavedViewDefinition[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const views: CustomSavedViewDefinition[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<CustomSavedViewDefinition>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const color = typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color)
      ? raw.color
      : CUSTOM_VIEW_COLORS[views.length % CUSTOM_VIEW_COLORS.length];
    views.push({
      id,
      label: label.slice(0, 40),
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : `Custom view: ${label.slice(0, 40)}`,
      color,
      filters: normalizeSavedViewFilters(raw.filters),
    });
    if (views.length >= 20) break;
  }
  return views;
}

export function createCustomSavedView(
  label: string,
  filters: SavedViewFilters,
  existing: CustomSavedViewDefinition[],
  idFactory = () => `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
): CustomSavedViewDefinition {
  const trimmed = label.trim().slice(0, 40);
  if (!trimmed) throw new Error("Custom saved view needs a name");
  return {
    id: idFactory(),
    label: trimmed,
    title: `Custom view: ${trimmed}`,
    color: CUSTOM_VIEW_COLORS[existing.length % CUSTOM_VIEW_COLORS.length],
    filters: normalizeSavedViewFilters(filters),
  };
}

export function isItemUnreviewed(item: { reviewedAt?: string | null }): boolean {
  return item.reviewedAt === null;
}

export function itemNeedsCleanupReview(
  item: { category?: string | null; tags?: unknown[] | null; title?: string | null; type?: string | null; createdAt?: string | null },
  now = Date.now(),
): boolean {
  const noCategory = !item.category?.trim();
  const noTags = (item.tags?.length ?? 0) === 0;
  const shortTitle = (item.title?.trim().length ?? 0) < 10;
  const createdAt = item.createdAt ? new Date(item.createdAt).getTime() : now;
  const staleTask = item.type === "task" && now - createdAt > 30 * 86400000;
  return noCategory || noTags || shortTitle || staleTask;
}

export function getSavedViewCounts(
  items: Array<{
    id: string;
    type?: string | null;
    reviewedAt?: string | null;
    actionRequired?: boolean | null;
    favourite?: boolean | null;
    category?: string | null;
    tags?: unknown[] | null;
    title?: string | null;
    createdAt?: string | null;
  }>,
  reminders: Array<{ itemId: string; status?: string | null }>,
  now = Date.now(),
): SavedViewCounts {
  const pendingReminderItemIds = new Set(reminders.filter(r => r.status === "pending").map(r => r.itemId));
  return {
    all: items.length,
    inbox: items.filter(isItemUnreviewed).length,
    actions: items.filter(i => !!i.actionRequired).length,
    favorites: items.filter(i => !!i.favourite).length,
    tasks: items.filter(i => i.type === "task").length,
    reminders: items.filter(i => pendingReminderItemIds.has(i.id)).length,
    cleanup: items.filter(i => itemNeedsCleanupReview(i, now)).length,
  };
}

export function inferSavedViewKey(filters: SavedViewFilters): SavedViewKey | null {
  for (const view of SAVED_VIEWS) {
    const preset = filtersForSavedView(view.key);
    if (savedViewFiltersEqual(filters, preset)) return view.key;
  }
  return null;
}

export function savedViewFiltersEqual(a: SavedViewFilters, b: SavedViewFilters): boolean {
  return a.view === b.view
    && a.catFilter === b.catFilter
    && a.sourceFilter === b.sourceFilter
    && a.tagFilter === b.tagFilter
    && a.withNotesOnly === b.withNotesOnly
    && a.favouritesOnly === b.favouritesOnly
    && a.actionOnly === b.actionOnly
    && a.remindersOnly === b.remindersOnly
    && a.inboxOnly === b.inboxOnly
    && a.reviewMode === b.reviewMode
    && a.search === b.search
    && a.sortBy === b.sortBy;
}
