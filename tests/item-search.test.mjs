import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const routeSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");

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

test("item search runs against the indexed search_tsv column with rank ordering", () => {
  assert.match(routeSource, /search_tsv @@ query/);
  assert.match(routeSource, /ts_rank_cd\(search_tsv, query\)/);
  assert.match(routeSource, /word_similarity/);
});

test("search document covers URL, source metadata, and note entries", () => {
  assert.match(schemaSource, /coalesce\(url, ''\)/);
  assert.match(schemaSource, /coalesce\(site_name, ''\)/);
  assert.match(schemaSource, /coalesce\(note_entries::text, ''\)/);
});

test("server search requires all terms and prefix-matches every term", () => {
  assert.equal(itemSearch.buildItemSearchTsQuery("mark kashef"), "mark:* & kashef:*");
  assert.equal(itemSearch.buildItemSearchTsQuery("mark"), "mark:*");
  assert.equal(itemSearch.buildItemSearchTsQuery("market"), "market:*");
});

test("related-card search prefix-matches uniformly across metadata", () => {
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
  // Prefix matching is uniform since the PLAN.md 1.2 search overhaul:
  // "mark" intentionally also matches "market trends" — server-side
  // ts_rank_cd ordering is responsible for relevance now.
  assert.equal(cardSearch.itemMatchesCardSearch(marketCard, "Mark"), true);
});

test("card search matches checklist row text inside a task card", () => {
  const groceryTask = {
    title: "Grocery trip",
    content: "",
    notes: "",
    url: "",
    category: "Errands",
    tags: ["shopping"],
    ogTitle: "",
    ogDescription: "",
    siteName: "",
    noteEntries: [],
    checklistItems: [
      { text: "eggs" },
      { text: "milk" },
      { text: "bread" },
    ],
  };

  assert.equal(cardSearch.itemMatchesCardSearch(groceryTask, "milk"), true);
  assert.equal(cardSearch.itemMatchesCardSearch(groceryTask, "bread"), true);
  assert.equal(cardSearch.itemMatchesCardSearch(groceryTask, "butter"), false);
});
