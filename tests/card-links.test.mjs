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

const cardLinks = await loadTsModule("../lib/card-links.ts", "second-brain-card-links-");

test("extractCardLinks returns unique urls from the card url, content, notes, and note entries", () => {
  const links = cardLinks.extractCardLinks({
    url: "https://billing.example.com/manage",
    content: "Primary docs https://docs.example.com/start and mirror https://docs.example.com/start",
    notes: "Support portal: https://support.example.com.",
    noteEntries: [
      { body: "Alt link https://alt.example.com/path?x=1" },
      { body: "Support portal again https://support.example.com" },
    ],
  });

  assert.deepEqual(links, [
    "https://billing.example.com/manage",
    "https://docs.example.com/start",
    "https://support.example.com",
    "https://alt.example.com/path?x=1",
  ]);
});

test("extractCardLinks ignores empty fields and preserves first-seen order", () => {
  const links = cardLinks.extractCardLinks({
    url: "",
    content: "",
    notes: "Two links https://first.example.com then https://second.example.com",
    noteEntries: [],
  });

  assert.deepEqual(links, [
    "https://first.example.com",
    "https://second.example.com",
  ]);
});
