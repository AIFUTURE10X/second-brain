import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { mergeHybridResults } from "../lib/hybrid-search.mjs";

// Execute the real search orchestration with only database/embedding IO stubbed.
const source = await readFile(new URL("../lib/search-items.ts", import.meta.url), "utf8");
const tokensSource = await readFile(new URL("../lib/item-search.ts", import.meta.url), "utf8");
const executable = ts.transpileModule(
  tokensSource.replace(/^export /gm, "") + "\n" + source
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
).outputText;

function searchWith(queryDatabase) {
  return new Function("sql", "embeddingsEnabled", "mergeHybridResults",
    executable + "\nreturn hybridSearchItems;")(
    { query: queryDatabase }, () => false, mergeHybridResults,
  );
}

test("multiword search with a missing word returns no cards instead of fuzzy suggestions", async () => {
  const queries = [];
  const search = searchWith(async (sql, params) => {
    queries.push(params[0]);
    return sql.includes("word_similarity") ? [{ id: "unrelated", title: "Sales funnel" }] : [];
  });
  const result = await search("sales funnel nonexistentword");
  assert.deepEqual(result.rows, [], "a card missing one of the search words must not appear");
  assert.equal(result.fuzzy, false);
  assert.deepEqual(queries, ["sales & funnel & nonexistentword"]);
});

test("multiword search does not replace completed words with prefix matches", async () => {
  const search = searchWith(async (_sql, params) =>
    params[0].includes(":*") ? [{ id: "market", title: "Market research" }] : []);
  assert.deepEqual((await search("mark research")).rows, []);
});

test("multiword exact results and structured filters are preserved", async () => {
  const search = searchWith(async () => [
    { id: "keep", title: "Sales funnel", category: "Marketing" },
    { id: "hide", title: "Sales funnel", category: "Archived topic" },
  ]);
  assert.deepEqual((await search("sales funnel", {
    filter: row => row.category === "Marketing",
  })).rows.map(row => row.id), ["keep"]);
});

test("single-word partial search still finds a prefix match", async () => {
  const search = searchWith(async (_sql, params) =>
    params[0] === "netw:*" ? [{ id: "network", title: "Network" }] : []);
  assert.deepEqual((await search("netw")).rows.map(row => row.id), ["network"]);
});
