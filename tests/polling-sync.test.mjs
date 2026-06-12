import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeSyncedItems, parseSyncDelta, SYNC_CURSOR_OVERLAP_MS } from "../lib/polling-sync.mjs";

const routeSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");

const item = (id, updatedAt) => ({ id, updatedAt });

// ── mergeSyncedItems ─────────────────────────────────────────────────────────

test("unknown incoming items are prepended", () => {
  const local = [item("a", "2026-01-01T00:00:00Z")];
  const merged = mergeSyncedItems(local, [item("b", "2026-01-02T00:00:00Z")]);
  assert.deepEqual(merged.map(i => i.id), ["b", "a"]);
});

test("known items are replaced only when the incoming copy is strictly newer", () => {
  const local = [item("a", "2026-01-02T00:00:00Z")];
  const newer = { ...item("a", "2026-01-03T00:00:00Z"), title: "newer" };
  assert.equal(mergeSyncedItems(local, [newer])[0].title, "newer");

  // Equal or older — the local copy (e.g. an edit just saved in this tab,
  // or an overlap-window re-delivery) must win.
  const equal = { ...item("a", "2026-01-02T00:00:00Z"), title: "equal" };
  const older = { ...item("a", "2026-01-01T00:00:00Z"), title: "older" };
  assert.equal(mergeSyncedItems(local, [equal]), local);
  assert.equal(mergeSyncedItems(local, [older]), local);
});

test("deleted ids are removed, including from the incoming list", () => {
  const local = [item("a", "2026-01-01T00:00:00Z"), item("b", "2026-01-01T00:00:00Z")];
  const merged = mergeSyncedItems(local, [item("c", "2026-01-02T00:00:00Z")], ["b", "c"]);
  assert.deepEqual(merged.map(i => i.id), ["a"]);
});

test("no-op deltas return the original array identity (skips re-render)", () => {
  const local = [item("a", "2026-01-01T00:00:00Z")];
  assert.equal(mergeSyncedItems(local, [], []), local);
  assert.equal(mergeSyncedItems(local, [], ["unknown-id"]), local);
});

// ── parseSyncDelta ───────────────────────────────────────────────────────────

test("parseSyncDelta normalizes the response and rejects junk", () => {
  assert.deepEqual(parseSyncDelta({ items: [{ id: "a" }], deletedIds: ["b", 7], serverTime: "t" }), {
    items: [{ id: "a" }],
    deletedIds: ["b"],
    serverTime: "t",
  });
  assert.deepEqual(parseSyncDelta({}), { items: [], deletedIds: [], serverTime: "" });
  assert.equal(parseSyncDelta(null), null);
  assert.equal(parseSyncDelta([]), null);
  assert.equal(parseSyncDelta("nope"), null);
});

test("cursor overlap re-delivers racing writes instead of skipping them", () => {
  assert.ok(SYNC_CURSOR_OVERLAP_MS >= 1000);
});

// ── server wiring ────────────────────────────────────────────────────────────

test("items route serves ?since= deltas with tombstones and a server cursor", () => {
  assert.match(routeSource, /searchParams\.get\("since"\)/);
  assert.match(routeSource, /gt\(items\.updatedAt, sinceDate\)/);
  assert.match(routeSource, /gt\(deletedItems\.deletedAt, sinceDate\)/);
  assert.match(routeSource, /deletedIds: tombstones\.map\(t => t\.id\)/);
  assert.match(routeSource, /serverTime/);
});

test("item deletes write a tombstone for pollers", () => {
  assert.match(routeSource, /insert\(deletedItems\)/);
  assert.match(routeSource, /onConflictDoUpdate/);
});

test("schema declares the tombstone table and updated_at index", () => {
  assert.match(schemaSource, /deleted_items/);
  assert.match(schemaSource, /deleted_items_deleted_idx/);
  assert.match(schemaSource, /items_updated_idx/);
});

// ── client wiring ────────────────────────────────────────────────────────────

test("Brain polls for deltas while visible and merges them into state", () => {
  assert.match(brainSource, /SYNC_POLL_INTERVAL_MS/);
  assert.match(brainSource, /\/api\/items\?since=/);
  assert.match(brainSource, /mergeSyncedItems\(prev, delta\.items, delta\.deletedIds\)/);
  assert.match(brainSource, /visibilityState !== "visible"/);
});
