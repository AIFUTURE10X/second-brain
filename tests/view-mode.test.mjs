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

test("nextViewMode cycles comfortable to list to compact", () => {
  assert.equal(viewMode.nextViewMode("comfortable"), "list");
  assert.equal(viewMode.nextViewMode("list"), "compact");
  assert.equal(viewMode.nextViewMode("compact"), "comfortable");
});

test("parseViewMode accepts saved list view and rejects unknown values", () => {
  assert.equal(viewMode.parseViewMode("list"), "list");
  assert.equal(viewMode.parseViewMode("comfortable"), "comfortable");
  assert.equal(viewMode.parseViewMode("compact"), "compact");
  assert.equal(viewMode.parseViewMode("table"), null);
  assert.equal(viewMode.parseViewMode(null), null);
});
