// Offline write queue (roadmap 1.3) — pure decision logic, shared by the
// IndexedDB glue in lib/offline-queue.ts, Brain.tsx, and node:test. The
// service worker stays read-only; queueing happens in the app itself.

export const OFFLINE_TEMP_ID_PREFIX = "offline-";

/** Ids of optimistic placeholder cards that only exist in the local queue. */
export function isOfflineTempId(id) {
  return typeof id === "string" && id.startsWith(OFFLINE_TEMP_ID_PREFIX);
}

export function newOfflineTempId() {
  return `${OFFLINE_TEMP_ID_PREFIX}${crypto.randomUUID()}`;
}

/**
 * Decide what to do with a queued write after replaying it against the API:
 * - "done":     accepted — remove from the queue
 * - "conflict": optimistic-concurrency 409 — the card changed on another
 *               device while this one was offline; server version wins,
 *               remove from the queue and tell the user
 * - "drop":     permanently rejected (validation error, item gone) — remove,
 *               retrying would fail forever
 * - "retry":    transient (timeout/5xx/429) — keep queued, stop replaying
 */
export function classifyReplayStatus(status) {
  if (status >= 200 && status < 300) return "done";
  if (status === 409) return "conflict";
  if (status === 429 || status >= 500) return "retry";
  if (status >= 400) return "drop";
  return "retry";
}

/**
 * Coalesce a new queued update into an existing one for the same item.
 * Later fields win, but the original expectedUpdatedAt is kept: both edits
 * were based on the same last-synced server row, so the earlier token is the
 * true optimistic-concurrency base. Without coalescing, the second replayed
 * PUT would always 409 against the first one's write.
 */
export function coalesceQueuedUpdate(existingPayload, incomingPayload) {
  return {
    ...existingPayload,
    ...incomingPayload,
    ...(existingPayload.expectedUpdatedAt !== undefined
      ? { expectedUpdatedAt: existingPayload.expectedUpdatedAt }
      : {}),
  };
}

/** Apply a queued update payload to a local item for optimistic display. */
export function applyOfflineUpdate(item, payload) {
  const next = { ...item };
  for (const [key, value] of Object.entries(payload)) {
    if (key === "id" || key === "expectedUpdatedAt") continue;
    next[key] = value;
  }
  return next;
}

/**
 * Build an optimistic placeholder card for a queued create so it shows up in
 * the grid immediately. Replaced by the real row on the post-replay refetch;
 * placeholders are memory-only (a reload while offline loses the preview,
 * not the queued write).
 */
export function buildOfflineTempItem(payload, nowIso = new Date().toISOString()) {
  return {
    id: newOfflineTempId(),
    type: typeof payload.type === "string" ? payload.type : "note",
    title: typeof payload.title === "string" ? payload.title : "",
    content: typeof payload.content === "string" ? payload.content : "",
    url: typeof payload.url === "string" ? payload.url : "",
    notes: typeof payload.notes === "string" ? payload.notes : "",
    noteEntries: Array.isArray(payload.noteEntries) ? payload.noteEntries : [],
    checklistItems: Array.isArray(payload.checklistItems) ? payload.checklistItems : [],
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    category: typeof payload.category === "string" ? payload.category : "",
    pinned: Boolean(payload.pinned),
    completed: false,
    completedAt: null,
    favourite: Boolean(payload.favourite),
    actionRequired: Boolean(payload.actionRequired),
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    ogTitle: "",
    ogDescription: "",
    ogImage: "",
    siteName: "",
    favicon: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
