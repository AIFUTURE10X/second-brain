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

const relationGraph = await loadTsModule("../lib/relation-graph.ts", "second-brain-relation-graph-");

test("relation counts are indexed for both sides of each relation", () => {
  const counts = relationGraph.getRelationCountsByItemId([
    { itemAId: "a", itemBId: "b" },
    { itemAId: "a", itemBId: "c" },
    { itemAId: "d", itemBId: "a" },
    { itemAId: "c", itemBId: "c" },
  ]);

  assert.equal(counts.get("a"), 3);
  assert.equal(counts.get("b"), 1);
  assert.equal(counts.get("c"), 1);
  assert.equal(counts.get("d"), 1);
});
