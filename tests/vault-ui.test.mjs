import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/vault-ui.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-vault-ui-"));
const tempModule = path.join(tempDir, "vault-ui.mjs");
await writeFile(tempModule, transpiled);
const vaultUi = await import(pathToFileURL(tempModule).href);

test("revealVaultEditForm scrolls the edit panel into view and focuses the first field", () => {
  const scrollCalls = [];
  const focusCalls = [];
  const panel = { scrollIntoView: options => scrollCalls.push(options) };
  const firstField = { focus: options => focusCalls.push(options) };

  assert.equal(vaultUi.revealVaultEditForm(panel, firstField), true);
  assert.deepEqual(scrollCalls, [{ behavior: "smooth", block: "start" }]);
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
});

test("revealVaultEditForm reports when there is no target to reveal", () => {
  assert.equal(vaultUi.revealVaultEditForm(null, null), false);
});
