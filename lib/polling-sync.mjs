// Polling sync (roadmap 1.2). Pure helpers shared by Brain.tsx and tests —
// the /api/items?since= endpoint returns { items, deletedIds, serverTime }
// and these functions merge that delta into the client's local item list.

/** Default interval between delta polls while the tab is visible. */
export const SYNC_POLL_INTERVAL_MS = 45_000;

/**
 * Overlap subtracted from the server-time cursor so writes that race a poll
 * (or small app-server/DB clock skew — updated_at comes from both) are
 * re-delivered on the next poll instead of being skipped. Merging is
 * idempotent, so re-delivery is harmless.
 */
export const SYNC_CURSOR_OVERLAP_MS = 5_000;

function timeOf(value) {
  const ms = new Date(value ?? 0).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Merge a sync delta into the local item list:
 * - rows in deletedIds are removed
 * - unknown incoming items are prepended
 * - known items are replaced only when the incoming copy is strictly newer,
 *   so an edit just saved in this tab never gets clobbered by a stale poll
 * Returns the original array (same identity) when nothing changed, so React
 * state setters can skip the re-render.
 */
export function mergeSyncedItems(localItems, incomingItems = [], deletedIds = []) {
  const deleted = new Set(deletedIds);
  let changed = false;

  const merged = [];
  for (const item of localItems) {
    if (deleted.has(item.id)) {
      changed = true;
      continue;
    }
    merged.push(item);
  }

  const byId = new Map(merged.map((item, index) => [item.id, index]));
  for (const incoming of incomingItems) {
    if (!incoming || deleted.has(incoming.id)) continue;
    const index = byId.get(incoming.id);
    if (index === undefined) {
      merged.unshift(incoming);
      byId.clear();
      merged.forEach((item, i) => byId.set(item.id, i));
      changed = true;
    } else if (timeOf(incoming.updatedAt) > timeOf(merged[index].updatedAt)) {
      merged[index] = incoming;
      changed = true;
    }
  }

  return changed ? merged : localItems;
}

/** Validate the ?since= delta response shape; null when unusable. */
export function parseSyncDelta(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds.filter(id => typeof id === "string") : [],
    serverTime: typeof data.serverTime === "string" ? data.serverTime : "",
  };
}
