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

const taskChecklists = await loadTsModule("../lib/task-checklists.ts", "second-brain-task-checklists-");

test("deriveTaskCompletion keeps tasks open when they have no checklist rows", () => {
  assert.deepEqual(
    taskChecklists.deriveTaskCompletion([], false, null),
    { completed: false, completedAt: null }
  );
});

test("deriveTaskCompletion marks the parent task complete when every checklist row is checked", () => {
  const result = taskChecklists.deriveTaskCompletion([
    { id: "a", text: "eggs", completed: true, completedAt: "2026-06-07T09:00:00.000Z" },
    { id: "b", text: "milk", completed: true, completedAt: "2026-06-07T09:05:00.000Z" },
  ], false, null);

  assert.equal(result.completed, true);
  assert.match(result.completedAt || "", /^\d{4}-\d{2}-\d{2}T/);
});

test("deriveTaskCompletion reopens the parent task when any checklist row is unchecked", () => {
  assert.deepEqual(
    taskChecklists.deriveTaskCompletion([
      { id: "a", text: "eggs", completed: true, completedAt: "2026-06-07T09:00:00.000Z" },
      { id: "b", text: "milk", completed: false, completedAt: null },
    ], true, "2026-06-07T09:10:00.000Z"),
    { completed: false, completedAt: null }
  );
});

test("normalizeChecklistItems trims text and preserves stable ids", () => {
  const rows = taskChecklists.normalizeChecklistItems([
    { id: "keep-me", text: "  bread  ", completed: true, completedAt: "2026-06-07T09:00:00.000Z" },
    { text: "   " },
    { text: "rent agreement", completed: false },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "keep-me");
  assert.equal(rows[0].text, "bread");
  assert.equal(rows[1].text, "rent agreement");
  assert.equal(typeof rows[1].id, "string");
});
