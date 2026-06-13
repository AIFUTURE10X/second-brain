import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadTsModule(relativePath, prefix) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const tempDir = await mkdtemp(path.join(tmpdir(), prefix));
  const tempModule = path.join(tempDir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  await writeFile(tempModule, transpiled);
  return import(pathToFileURL(tempModule).href);
}

const savedViews = await loadTsModule("../lib/saved-views.ts", "second-brain-saved-views-");

const now = Date.parse("2026-06-13T08:00:00.000Z");

const baseItem = {
  id: "base",
  type: "link",
  title: "A useful saved page",
  content: "",
  url: "https://example.com",
  notes: "",
  noteEntries: [],
  checklistItems: [],
  tags: ["reference"],
  category: "Research",
  pinned: false,
  completed: false,
  completedAt: null,
  favourite: false,
  actionRequired: false,
  attachments: [],
  ogTitle: "",
  ogDescription: "",
  ogImage: "",
  siteName: "",
  favicon: "",
  reviewedAt: "2026-06-13T07:00:00.000Z",
  createdAt: "2026-06-13T06:00:00.000Z",
  updatedAt: "2026-06-13T06:00:00.000Z",
};

function item(overrides) {
  return { ...baseItem, ...overrides };
}

test("unreviewed items are only explicit null reviewedAt cards", () => {
  assert.equal(savedViews.isItemUnreviewed(item({ reviewedAt: null })), true);
  assert.equal(savedViews.isItemUnreviewed(item({ reviewedAt: "2026-06-13T07:00:00.000Z" })), false);
  assert.equal(savedViews.isItemUnreviewed(item({ reviewedAt: undefined })), false);
});

test("cleanup review heuristic mirrors missing metadata and stale task rules", () => {
  assert.equal(savedViews.itemNeedsCleanupReview(item({ category: "" }), now), true);
  assert.equal(savedViews.itemNeedsCleanupReview(item({ tags: [] }), now), true);
  assert.equal(savedViews.itemNeedsCleanupReview(item({ title: "Tiny" }), now), true);
  assert.equal(
    savedViews.itemNeedsCleanupReview(
      item({ type: "task", title: "Follow up with supplier", createdAt: "2026-04-01T00:00:00.000Z" }),
      now,
    ),
    true,
  );
  assert.equal(savedViews.itemNeedsCleanupReview(baseItem, now), false);
});

test("saved view counts include inbox, action, favorites, tasks, reminders, and cleanup", () => {
  const items = [
    item({ id: "inbox", reviewedAt: null }),
    item({ id: "action", actionRequired: true }),
    item({ id: "favorite", favourite: true }),
    item({ id: "task", type: "task", title: "Send contract to client" }),
    item({ id: "reminder" }),
    item({ id: "cleanup", category: "", tags: [] }),
  ];
  const reminders = [{ itemId: "reminder", status: "pending" }, { itemId: "task", status: "done" }];

  assert.deepEqual(savedViews.getSavedViewCounts(items, reminders, now), {
    all: 6,
    inbox: 1,
    actions: 1,
    favorites: 1,
    tasks: 1,
    reminders: 1,
    cleanup: 1,
  });
});

test("saved view presets reset detailed filters before applying the selected view", () => {
  assert.deepEqual(savedViews.filtersForSavedView("inbox"), {
    view: "all",
    catFilter: "all",
    sourceFilter: null,
    tagFilter: null,
    withNotesOnly: false,
    favouritesOnly: false,
    actionOnly: false,
    remindersOnly: false,
    inboxOnly: true,
    reviewMode: false,
    search: "",
    sortBy: "newest",
  });

  assert.deepEqual(savedViews.filtersForSavedView("tasks"), {
    ...savedViews.filtersForSavedView("all"),
    view: "task",
  });
});

test("active saved view can be inferred from an exact filter preset", () => {
  assert.equal(savedViews.inferSavedViewKey(savedViews.filtersForSavedView("inbox")), "inbox");
  assert.equal(savedViews.inferSavedViewKey(savedViews.filtersForSavedView("actions")), "actions");
  assert.equal(
    savedViews.inferSavedViewKey({ ...savedViews.filtersForSavedView("inbox"), tagFilter: "domains" }),
    null,
  );
});
