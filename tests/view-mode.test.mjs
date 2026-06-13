import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/view-mode.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-view-mode-"));
const tempModule = path.join(tempDir, "view-mode.mjs");
await writeFile(tempModule, transpiled);
const viewMode = await import(pathToFileURL(tempModule).href);

test("nextViewMode cycles list, compact, table, and board", () => {
  assert.equal(viewMode.nextViewMode("list"), "compact");
  assert.equal(viewMode.nextViewMode("compact"), "table");
  assert.equal(viewMode.nextViewMode("table"), "board");
  assert.equal(viewMode.nextViewMode("board"), "list");
});

test("parseViewMode accepts active modes and migrates away from removed comfortable view", () => {
  assert.equal(viewMode.parseViewMode("list"), "list");
  assert.equal(viewMode.parseViewMode("comfortable"), null);
  assert.equal(viewMode.parseViewMode("compact"), "compact");
  assert.equal(viewMode.parseViewMode("table"), "table");
  assert.equal(viewMode.parseViewMode("board"), "board");
  assert.equal(viewMode.parseViewMode(null), null);
});
