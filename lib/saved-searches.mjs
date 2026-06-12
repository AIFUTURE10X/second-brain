// Saved searches (roadmap 2.1) — named snapshots of the FilterBar state,
// stored in the synced settings table under one JSON key. Pure module so
// node:test can load it directly; persistence goes through /api/settings.

export const SAVED_SEARCHES_SETTINGS_KEY = "saved_searches";
export const MAX_SAVED_SEARCHES = 30;

const FILTER_DEFAULTS = {
  search: "",
  view: "all",
  catFilter: "all",
  tagFilter: null,
  sourceFilter: null,
  withNotesOnly: false,
  favouritesOnly: false,
  actionOnly: false,
  remindersOnly: false,
  readLaterOnly: false,
  reviewMode: false,
  archivedOnly: false,
  sortBy: "newest",
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
};

/**
 * Snapshot the current filter state, keeping only fields that differ from
 * the defaults so saved entries stay small and forward-compatible.
 */
export function captureFilterState(state) {
  const captured = {};
  for (const [key, fallback] of Object.entries(FILTER_DEFAULTS)) {
    const value = state?.[key];
    if (value === undefined || value === null || value === fallback) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    captured[key] = value;
  }
  return captured;
}

/** Re-hydrate a captured snapshot with defaults for every missing field. */
export function expandFilterState(captured) {
  const state = { ...FILTER_DEFAULTS };
  if (captured && typeof captured === "object" && !Array.isArray(captured)) {
    for (const key of Object.keys(FILTER_DEFAULTS)) {
      if (captured[key] !== undefined) state[key] = captured[key];
    }
  }
  return state;
}

export function isFilterStateEmpty(captured) {
  return Object.keys(captureFilterState(expandFilterState(captured))).length === 0;
}

/** Validate the settings JSON; tolerates junk from older clients. */
export function normalizeSavedSearches(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(entry =>
      entry && typeof entry === "object" && !Array.isArray(entry) &&
      typeof entry.id === "string" && entry.id.length > 0 &&
      typeof entry.name === "string" && entry.name.trim().length > 0
    )
    .slice(0, MAX_SAVED_SEARCHES)
    .map(entry => ({
      id: entry.id,
      name: entry.name.trim(),
      state: captureFilterState(expandFilterState(entry.state)),
    }));
}

export function addSavedSearch(existing, name, state) {
  const entry = {
    id: crypto.randomUUID(),
    name: String(name || "").trim(),
    state: captureFilterState(state),
  };
  if (!entry.name) return { list: existing, entry: null };
  return { list: [...existing, entry].slice(0, MAX_SAVED_SEARCHES), entry };
}

export function removeSavedSearch(existing, id) {
  return existing.filter(entry => entry.id !== id);
}
