import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  addSavedSearch,
  captureFilterState,
  expandFilterState,
  normalizeSavedSearches,
  removeSavedSearch,
} from "../lib/saved-searches.mjs";
import { dateRangeBounds, groupItemsByDay, itemInDateRange, timelineDayKey } from "../lib/date-range.mjs";

const routeSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
// Search SQL (incl. the archived filter fragments) lives in lib/search-items.ts.
const searchLibSource = await readFile(new URL("../lib/search-items.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");

// ── Saved searches (2.1) ─────────────────────────────────────────────────────

test("captured filter state only keeps non-default fields", () => {
  assert.deepEqual(captureFilterState({ search: "", view: "all", sortBy: "newest" }), {});
  assert.deepEqual(
    captureFilterState({ search: "react", view: "link", favouritesOnly: true, sortBy: "newest" }),
    { search: "react", view: "link", favouritesOnly: true }
  );
});

test("expanding a snapshot restores defaults for missing fields", () => {
  const state = expandFilterState({ view: "task" });
  assert.equal(state.view, "task");
  assert.equal(state.catFilter, "all");
  assert.equal(state.archivedOnly, false);
  assert.equal(state.datePreset, "all");
});

test("saved search list survives a junk settings value", () => {
  assert.deepEqual(normalizeSavedSearches("garbage"), []);
  assert.deepEqual(normalizeSavedSearches([{ name: "" }, null, 7]), []);
  const list = normalizeSavedSearches([
    { id: "a", name: " Reading ", state: { view: "link", search: "" } },
  ]);
  assert.deepEqual(list, [{ id: "a", name: "Reading", state: { view: "link" } }]);
});

test("add/remove saved searches round-trips", () => {
  const { list, entry } = addSavedSearch([], "Tasks this week", { view: "task", datePreset: "week" });
  assert.ok(entry);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].state, { view: "task", datePreset: "week" });
  assert.deepEqual(removeSavedSearch(list, entry.id), []);
  assert.equal(addSavedSearch([], "   ", {}).entry, null);
});

// ── Timeline / date views (2.3) ──────────────────────────────────────────────

const NOW = new Date("2026-06-10T15:00:00"); // a Wednesday

test("date presets resolve to the expected local bounds", () => {
  assert.equal(dateRangeBounds({ preset: "all" }, NOW), null);
  const today = dateRangeBounds({ preset: "today" }, NOW);
  assert.equal(new Date(today.fromMs).getHours(), 0);
  const week = dateRangeBounds({ preset: "week" }, NOW);
  assert.equal(new Date(week.fromMs).getDay(), 1); // Monday start
  const month = dateRangeBounds({ preset: "month" }, NOW);
  assert.equal(new Date(month.fromMs).getDate(), 1);
});

test("custom ranges are inclusive and tolerate open ends", () => {
  const range = { preset: "custom", from: "2026-06-01", to: "2026-06-05" };
  assert.equal(itemInDateRange({ createdAt: "2026-06-05T23:30:00" }, range, NOW), true);
  assert.equal(itemInDateRange({ createdAt: "2026-06-06T00:30:00" }, range, NOW), false);
  assert.equal(itemInDateRange({ createdAt: "2020-01-01" }, { preset: "custom", from: "", to: "2026-01-01" }, NOW), true);
  assert.equal(dateRangeBounds({ preset: "custom", from: "", to: "" }, NOW), null);
});

test("timeline groups follow list order keyed by local day", () => {
  const groups = groupItemsByDay([
    { id: "a", createdAt: "2026-06-10T09:00:00" },
    { id: "b", createdAt: "2026-06-10T08:00:00" },
    { id: "c", createdAt: "2026-06-09T22:00:00" },
  ]);
  assert.deepEqual(groups.map(g => g.key), ["2026-06-10", "2026-06-09"]);
  assert.deepEqual(groups[0].items.map(i => i.id), ["a", "b"]);
  assert.equal(timelineDayKey("not a date"), "unknown");
});

// ── Archive (2.4) ────────────────────────────────────────────────────────────

test("schema and API gained the archive column and filters", () => {
  assert.match(schemaSource, /archivedAt: timestamp\("archived_at"/);
  assert.match(routeSource, /searchParams\.get\("archived"\)/);
  assert.match(searchLibSource, /AND archived_at IS NULL/);
  assert.match(searchLibSource, /AND archived_at IS NOT NULL/);
  // Every search path respects the filter; ?since= deltas do not (sync needs
  // to see archive transitions).
  const filtered = searchLibSource.match(/\$\{archivedFilterSql\}/g) || [];
  assert.ok(filtered.length >= 3, "FTS, semantic, and fuzzy paths must all filter archived");
  assert.match(routeSource, /Invalid archivedAt timestamp/);
});

test("Brain hides archived cards from the active grid and can flip views", () => {
  assert.match(brainSource, /archivedOnly \? !!i\.archivedAt : !i\.archivedAt/);
  assert.match(brainSource, /params\.set\("archived", "1"\)/);
  assert.match(brainSource, /handleArchive/);
});

// ── Bulk actions (2.5) ───────────────────────────────────────────────────────

test("Brain wires multi-select bulk tag/category/archive/delete", () => {
  assert.match(brainSource, /BulkActionsBar/);
  assert.match(brainSource, /bulkAddTag/);
  assert.match(brainSource, /bulkSetCategory/);
  assert.match(brainSource, /bulkArchive/);
  assert.match(brainSource, /bulkDelete/);
  assert.match(brainSource, /toggleSelected/);
});
