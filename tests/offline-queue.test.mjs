import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  OFFLINE_TEMP_ID_PREFIX,
  applyOfflineUpdate,
  buildOfflineTempItem,
  classifyReplayStatus,
  coalesceQueuedUpdate,
  isOfflineTempId,
  newOfflineTempId,
} from "../lib/offline-replay.mjs";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const queueSource = await readFile(new URL("../lib/offline-queue.ts", import.meta.url), "utf8");
const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

// ── classifyReplayStatus ─────────────────────────────────────────────────────

test("replay keeps transient failures queued and drops permanent ones", () => {
  assert.equal(classifyReplayStatus(200), "done");
  assert.equal(classifyReplayStatus(201), "done");
  assert.equal(classifyReplayStatus(409), "conflict");
  assert.equal(classifyReplayStatus(400), "drop");
  assert.equal(classifyReplayStatus(404), "drop");
  assert.equal(classifyReplayStatus(429), "retry");
  assert.equal(classifyReplayStatus(500), "retry");
  assert.equal(classifyReplayStatus(503), "retry");
});

// ── coalesceQueuedUpdate ─────────────────────────────────────────────────────

test("coalesced updates keep the original concurrency token, later fields win", () => {
  const first = { id: "a", title: "v1", expectedUpdatedAt: "2026-01-01T00:00:00Z" };
  const second = { id: "a", title: "v2", content: "body", expectedUpdatedAt: "2026-01-01T00:00:00Z" };
  assert.deepEqual(coalesceQueuedUpdate(first, second), {
    id: "a",
    title: "v2",
    content: "body",
    expectedUpdatedAt: "2026-01-01T00:00:00Z",
  });
});

test("coalescing preserves last-write-wins when the first update had no token", () => {
  const merged = coalesceQueuedUpdate({ id: "a", pinned: true }, { id: "a", title: "t" });
  assert.equal(merged.expectedUpdatedAt, undefined);
  assert.equal(merged.pinned, true);
  assert.equal(merged.title, "t");
});

// ── optimistic local state helpers ───────────────────────────────────────────

test("applyOfflineUpdate merges fields but never id or the concurrency token", () => {
  const item = { id: "real-id", title: "old", updatedAt: "2026-01-01T00:00:00Z" };
  const next = applyOfflineUpdate(item, { id: "real-id", title: "new", expectedUpdatedAt: "x" });
  assert.equal(next.id, "real-id");
  assert.equal(next.title, "new");
  assert.equal(next.expectedUpdatedAt, undefined);
  assert.equal(next.updatedAt, "2026-01-01T00:00:00Z");
});

test("offline temp items are flagged by id prefix and carry safe defaults", () => {
  const temp = buildOfflineTempItem({ type: "task", title: "buy milk", tags: ["errands"] });
  assert.ok(isOfflineTempId(temp.id));
  assert.ok(temp.id.startsWith(OFFLINE_TEMP_ID_PREFIX));
  assert.equal(temp.type, "task");
  assert.equal(temp.title, "buy milk");
  assert.deepEqual(temp.tags, ["errands"]);
  assert.deepEqual(temp.attachments, []);
  assert.equal(temp.completed, false);
  assert.notEqual(newOfflineTempId(), newOfflineTempId());
  assert.equal(isOfflineTempId("4f5e6d7c-real-uuid"), false);
});

// ── queue glue wiring ────────────────────────────────────────────────────────

test("queue replays FIFO and stops on transient failure", () => {
  assert.match(queueSource, /autoIncrement: true/);
  assert.match(queueSource, /if \(disposition === "retry"\)/);
  assert.match(queueSource, /summary\.remaining = entries\.length - i/);
  // Updates coalesce; deletes discard stale updates for the same item.
  assert.match(queueSource, /coalesceQueuedUpdate/);
  assert.match(queueSource, /write\.kind === "delete"/);
});

test("Brain queues failed writes and replays on reconnect", () => {
  assert.match(brainSource, /addEventListener\("online", onOnline\)/);
  assert.match(brainSource, /replayQueuedWrites/);
  assert.match(brainSource, /queueWriteOffline\(\{ kind: "create"/);
  assert.match(brainSource, /queueWriteOffline\(\{ kind: "update"/);
  assert.match(brainSource, /queueWriteOffline\(\{ kind: "delete", id \}\)/);
  assert.match(brainSource, /removeQueuedCreate/);
});

test("service worker stays read-only (no write caching or queueing)", () => {
  assert.match(swSource, /if \(req\.method !== "GET"\) return;/);
  assert.doesNotMatch(swSource, /indexedDB/i);
});
