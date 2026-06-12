// IndexedDB-backed offline write queue (roadmap 1.3). Create/update/delete
// requests that fail at the network level are queued here and replayed in
// FIFO order when the device comes back online. Updates flow through the
// existing expectedUpdatedAt optimistic-concurrency machinery — a 409 during
// replay means the card changed on another device and the server version
// wins. Pure decision logic lives in lib/offline-replay.mjs (tested); this
// module is browser-only glue.
import { classifyReplayStatus, coalesceQueuedUpdate } from "@/lib/offline-replay.mjs";

const DB_NAME = "second-brain-offline";
const DB_VERSION = 1;
const STORE = "writes";

export type QueuedWrite =
  | { kind: "create"; payload: Record<string, unknown>; tempId?: string; queuedAt: string }
  | { kind: "update"; payload: { id: string } & Record<string, unknown>; queuedAt: string }
  | { kind: "delete"; id: string; queuedAt: string };

export type QueuedWriteInput =
  | { kind: "create"; payload: Record<string, unknown>; tempId?: string }
  | { kind: "update"; payload: { id: string } & Record<string, unknown> }
  | { kind: "delete"; id: string };

export type ReplaySummary = {
  done: number;
  conflicts: number;
  dropped: number;
  remaining: number;
};

export function isOfflineQueueSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openQueueDb();
  try {
    return await fn(db.transaction(STORE, mode).objectStore(STORE));
  } finally {
    db.close();
  }
}

type Entry = { key: IDBValidKey; write: QueuedWrite };

async function allEntries(): Promise<Entry[]> {
  return withStore("readonly", async (store) => {
    const [keys, values] = await Promise.all([
      requestToPromise(store.getAllKeys()),
      requestToPromise(store.getAll()),
    ]);
    return keys.map((key, i) => ({ key, write: values[i] as QueuedWrite }));
  });
}

export async function pendingWriteCount(): Promise<number> {
  if (!isOfflineQueueSupported()) return 0;
  return withStore("readonly", (store) => requestToPromise(store.count()));
}

/**
 * Queue a write for later replay. Updates for an item that already has a
 * queued update are coalesced (later fields win, original concurrency token
 * kept). Queueing a delete discards now-pointless queued updates for the
 * same item.
 */
export async function enqueueWrite(input: QueuedWriteInput): Promise<void> {
  const write = { ...input, queuedAt: new Date().toISOString() } as QueuedWrite;
  const entries = await allEntries();

  if (write.kind === "update") {
    const existing = entries.find(
      (e) => e.write.kind === "update" && e.write.payload.id === write.payload.id
    );
    if (existing && existing.write.kind === "update") {
      const payload = coalesceQueuedUpdate(existing.write.payload, write.payload) as { id: string } & Record<string, unknown>;
      await withStore("readwrite", (store) =>
        requestToPromise(store.put({ ...existing.write, payload }, existing.key))
      );
      return;
    }
  }

  if (write.kind === "delete") {
    const stale = entries.filter(
      (e) => e.write.kind === "update" && e.write.payload.id === write.id
    );
    if (stale.length > 0) {
      await withStore("readwrite", async (store) => {
        for (const e of stale) await requestToPromise(store.delete(e.key));
      });
    }
  }

  await withStore("readwrite", (store) => requestToPromise(store.add(write)));
}

/** Cancel the queued create behind an optimistic placeholder card. */
export async function removeQueuedCreate(tempId: string): Promise<boolean> {
  const entries = await allEntries();
  const entry = entries.find((e) => e.write.kind === "create" && e.write.tempId === tempId);
  if (!entry) return false;
  await withStore("readwrite", (store) => requestToPromise(store.delete(entry.key)));
  return true;
}

function requestFor(write: QueuedWrite): { input: string; init: RequestInit } {
  if (write.kind === "delete") {
    return { input: `/api/items?id=${encodeURIComponent(write.id)}`, init: { method: "DELETE" } };
  }
  return {
    input: "/api/items",
    init: {
      method: write.kind === "create" ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(write.payload),
    },
  };
}

let replaying = false;

/**
 * Replay queued writes in FIFO order. Stops at the first network failure or
 * transient server error (still offline / server down) and keeps the rest
 * queued. Safe to call repeatedly — concurrent calls are ignored.
 */
export async function replayQueuedWrites(): Promise<ReplaySummary> {
  const summary: ReplaySummary = { done: 0, conflicts: 0, dropped: 0, remaining: 0 };
  if (!isOfflineQueueSupported() || replaying) return summary;
  replaying = true;
  try {
    const entries = await allEntries();
    for (let i = 0; i < entries.length; i++) {
      const { key, write } = entries[i];
      let status: number;
      try {
        const { input, init } = requestFor(write);
        const res = await fetch(input, init);
        status = res.status;
      } catch {
        summary.remaining = entries.length - i;
        return summary;
      }
      const disposition = classifyReplayStatus(status);
      if (disposition === "retry") {
        summary.remaining = entries.length - i;
        return summary;
      }
      await withStore("readwrite", (store) => requestToPromise(store.delete(key)));
      if (disposition === "done") summary.done++;
      else if (disposition === "conflict") summary.conflicts++;
      else summary.dropped++;
    }
    return summary;
  } finally {
    replaying = false;
  }
}
