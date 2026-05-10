import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const routeSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");

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

const itemSearch = await loadTsModule("../lib/item-search.ts", "second-brain-item-search-");
const cardSearch = await loadTsModule("../lib/card-search.ts", "second-brain-card-search-");

test("item search indexes URL and source metadata for YouTube channel owner lookup", () => {
  assert.match(routeSource, /coalesce\(url,\s*''\)/);
  assert.match(routeSource, /coalesce\(site_name,\s*''\)/);
});

test("server search requires all search terms and avoids broad mark prefix matches", () => {
  assert.equal(itemSearch.buildItemSearchTsQuery("mark kashef"), "mark & kashef:*");
  assert.equal(itemSearch.buildItemSearchTsQuery("mark"), "mark");
  assert.equal(itemSearch.buildItemSearchTsQuery("market"), "market:*");
});

test("related-card search matches YouTube owner metadata without matching market", () => {
  const ownerCard = {
    title: "Build Your Agentic OS Better Than The 99%",
    content: "",
    notes: "",
    url: "https://youtube.com/watch?v=-WCNwxz3uoM",
    category: "Claude Code",
    tags: ["planning"],
    ogTitle: "Build Your Agentic OS Better Than The 99%",
    ogDescription: "Mark Kashef",
    siteName: "YouTube",
    noteEntries: [],
  };

  const marketCard = {
    title: "The AI Apps That Will Dominate in 2026",
    content: "",
    notes: "",
    url: "https://youtube.com/watch?v=example",
    category: "AI Technology",
    tags: ["market trends"],
    ogTitle: "The AI Apps That Will Dominate in 2026",
    ogDescription: "Rob Shocks",
    siteName: "YouTube",
    noteEntries: [],
  };

  assert.equal(cardSearch.itemMatchesCardSearch(ownerCard, "Mark"), true);
  assert.equal(cardSearch.itemMatchesCardSearch(ownerCard, "mark kashef"), true);
  assert.equal(cardSearch.itemMatchesCardSearch(marketCard, "Mark"), false);
});
