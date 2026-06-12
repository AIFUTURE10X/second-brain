import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EMBEDDING_DIMENSIONS,
  MAX_EMBEDDING_INPUT_CHARS,
  buildEmbeddingInput,
  embeddingsEnabled,
  generateEmbeddings,
  vectorLiteral,
} from "../lib/embeddings.mjs";
import { mergeHybridResults } from "../lib/hybrid-search.mjs";

const routeSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const dbSetupSource = await readFile(new URL("../scripts/db-setup.sql", import.meta.url), "utf8");

// ── buildEmbeddingInput ──────────────────────────────────────────────────────

test("embedding input covers the same fields as the FTS document", () => {
  const input = buildEmbeddingInput({
    title: "Build Your Agentic OS",
    tags: ["planning", "ai"],
    category: "Claude Code",
    content: "How to structure agent workflows",
    notes: "legacy note blob",
    noteEntries: [{ id: "1", body: "watch the section on memory" }],
    checklistItems: [{ text: "try the planner prompt" }],
    ogTitle: "Build Your Agentic OS Better Than The 99%",
    ogDescription: "Mark Kashef",
    siteName: "YouTube",
    url: "https://youtube.com/watch?v=-WCNwxz3uoM",
  });

  for (const piece of [
    "Build Your Agentic OS",
    "Tags: planning, ai",
    "Category: Claude Code",
    "How to structure agent workflows",
    "legacy note blob",
    "watch the section on memory",
    "try the planner prompt",
    "Mark Kashef",
    "YouTube",
    "https://youtube.com/watch?v=-WCNwxz3uoM",
  ]) {
    assert.ok(input.includes(piece), `missing: ${piece}`);
  }
});

test("embedding input skips an ogTitle identical to the title", () => {
  const input = buildEmbeddingInput({ title: "Same Title", ogTitle: "Same Title" });
  assert.equal(input, "Same Title");
});

test("embedding input is empty for cards with nothing to embed", () => {
  assert.equal(buildEmbeddingInput({}), "");
  assert.equal(buildEmbeddingInput(null), "");
  assert.equal(buildEmbeddingInput({ tags: [], noteEntries: [], title: "  " }), "");
});

test("embedding input is truncated to the model-safe limit", () => {
  const input = buildEmbeddingInput({ content: "x".repeat(MAX_EMBEDDING_INPUT_CHARS * 2) });
  assert.equal(input.length, MAX_EMBEDDING_INPUT_CHARS);
});

// ── vectorLiteral ────────────────────────────────────────────────────────────

test("vectorLiteral renders a pgvector-compatible literal", () => {
  assert.equal(vectorLiteral([1, 2.5, -0.25]), "[1,2.5,-0.25]");
});

// ── generateEmbeddings ───────────────────────────────────────────────────────

test("embeddings are disabled and skipped without OPENAI_API_KEY", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    assert.equal(embeddingsEnabled(), false);
    assert.equal(await generateEmbeddings(["hello"]), null);
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});

test("generateEmbeddings re-aligns vectors by response index", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  const first = Array(EMBEDDING_DIMENSIONS).fill(0.1);
  const second = Array(EMBEDDING_DIMENSIONS).fill(0.2);
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      // Deliberately out of order — the API does not guarantee ordering.
      data: [
        { index: 1, embedding: second },
        { index: 0, embedding: first },
      ],
    }),
  });
  try {
    const vectors = await generateEmbeddings(["a", "b"]);
    assert.deepEqual(vectors, [first, second]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("generateEmbeddings returns null on API failure instead of throwing", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: "rate limited" } }),
  });
  try {
    assert.equal(await generateEmbeddings(["a"]), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

// ── mergeHybridResults (reciprocal rank fusion) ──────────────────────────────

const row = (id, pinned = false) => ({ id, pinned });

test("hybrid merge passes lists through when the other side is empty", () => {
  const fts = [row("a"), row("b")];
  const semantic = [row("c")];
  assert.deepEqual(mergeHybridResults(fts, []), fts);
  assert.deepEqual(mergeHybridResults([], semantic), semantic);
  assert.deepEqual(mergeHybridResults([], []), []);
});

test("items found by both rankers outrank single-list items", () => {
  const merged = mergeHybridResults(
    [row("fts-only"), row("both")],
    [row("both"), row("semantic-only")]
  );
  assert.deepEqual(merged.map(r => r.id), ["both", "fts-only", "semantic-only"]);
});

test("hybrid merge deduplicates by id and keeps the first-seen row object", () => {
  const ftsRow = { id: "x", pinned: false, source: "fts" };
  const merged = mergeHybridResults([ftsRow], [{ id: "x", pinned: false, source: "semantic" }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "fts");
});

test("pinned items sort first regardless of fusion score", () => {
  const merged = mergeHybridResults(
    [row("both"), row("pinned-late", true)],
    [row("both")]
  );
  assert.deepEqual(merged.map(r => r.id), ["pinned-late", "both"]);
});

// ── route + schema wiring ────────────────────────────────────────────────────

test("items search merges semantic ranking and flags it via header", () => {
  assert.match(routeSource, /embedding <=> \$1::vector/);
  assert.match(routeSource, /mergeHybridResults\(ftsRows, semanticRows\)/);
  assert.match(routeSource, /x-search-semantic/);
  // FTS + trigram fallback must survive the hybrid rewrite.
  assert.match(routeSource, /search_tsv @@ query/);
  assert.match(routeSource, /ts_rank_cd\(search_tsv, query\)/);
  assert.match(routeSource, /word_similarity/);
});

test("item writes schedule a post-response embedding update", () => {
  const hooks = routeSource.match(/after\(\(\) => updateItemEmbedding\(/g) || [];
  assert.ok(hooks.length >= 2, "expected embedding hooks on POST and PUT");
});

test("schema declares the pgvector column, HNSW index, and extension setup", () => {
  assert.match(schemaSource, /vector\("embedding", \{ dimensions: 1536 \}\)/);
  assert.match(schemaSource, /using\("hnsw", table\.embedding\.op\("vector_cosine_ops"\)\)/);
  assert.match(dbSetupSource, /CREATE EXTENSION IF NOT EXISTS vector/);
});
