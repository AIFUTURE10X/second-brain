import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
// Search SQL (and its camelCase column aliases) lives in lib/search-items.ts.
const searchLibSource = await readFile(new URL("../lib/search-items.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

test("items schema includes checklist and completion fields", () => {
  assert.match(schemaSource, /checklistItems/);
  assert.match(schemaSource, /completed/);
  assert.match(schemaSource, /completedAt/);
});

test("items route imports task checklist helpers", () => {
  assert.match(routeSource, /task-checklists/);
  assert.match(routeSource, /normalizeChecklistItems/);
  assert.match(routeSource, /deriveTaskCompletion/);
});

test("items route returns and persists checklist fields", () => {
  assert.match(searchLibSource, /checklist_items AS "checklistItems"/);
  assert.match(searchLibSource, /completed_at AS "completedAt"/);
  assert.match(routeSource, /completed:/);
  assert.match(routeSource, /completedAt:/);
});
