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

const drafts = await loadTsModule("../lib/item-draft-autosave.ts", "second-brain-item-draft-autosave-");

test("draftStorageKey scopes drafts by new-vs-edit context", () => {
  assert.equal(drafts.draftStorageKey(null), "sb_main_form_draft:new");
  assert.equal(drafts.draftStorageKey("abc123"), "sb_main_form_draft:edit:abc123");
});

test("serialize and parse round-trip a draft payload", () => {
  const raw = drafts.serializeDraftPayload({
    editingId: "item-1",
    form: {
      type: "task",
      title: "Immigration documents",
      checklistItems: [{ id: "a", text: "Rental agreement", completed: false, completedAt: null }],
    },
  });

  const parsed = drafts.parseDraftPayload(raw);
  assert.equal(parsed?.editingId, "item-1");
  assert.equal(parsed?.form.title, "Immigration documents");
  assert.deepEqual(parsed?.form.checklistItems, [
    { id: "a", text: "Rental agreement", completed: false, completedAt: null },
  ]);
  assert.match(parsed?.savedAt || "", /^\d{4}-\d{2}-\d{2}T/);
});

test("parseDraftPayload returns null for invalid data", () => {
  assert.equal(drafts.parseDraftPayload("not-json"), null);
  assert.equal(drafts.parseDraftPayload(JSON.stringify({ nope: true })), null);
  assert.equal(drafts.parseDraftPayload(JSON.stringify({ editingId: 7, form: {} })), null);
});
