import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findUrlDuplicates,
  mergeDuplicateMatches,
  normalizeUrlForDuplicateCheck,
} from "../lib/duplicate-detection.mjs";
import { buildAskContext, trimAskHistory } from "../lib/ask-brain.mjs";

const askRouteSource = await readFile(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
const duplicatesRouteSource = await readFile(new URL("../app/api/items/duplicates/route.ts", import.meta.url), "utf8");
const formModalSource = await readFile(new URL("../components/brain/ItemFormModal.tsx", import.meta.url), "utf8");
const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");

// ── Duplicate detection (2.12) ───────────────────────────────────────────────

test("URL canonicalisation ignores tracking params, www, hash, trailing slash", () => {
  const a = normalizeUrlForDuplicateCheck("https://www.example.com/post/?utm_source=x&fbclid=123#section");
  const b = normalizeUrlForDuplicateCheck("https://example.com/post");
  assert.equal(a, b);
  // Meaningful query params survive (sorted for order-independence).
  assert.equal(
    normalizeUrlForDuplicateCheck("https://youtube.com/watch?v=abc&t=10"),
    normalizeUrlForDuplicateCheck("https://www.youtube.com/watch?t=10&v=abc")
  );
  assert.notEqual(
    normalizeUrlForDuplicateCheck("https://youtube.com/watch?v=abc"),
    normalizeUrlForDuplicateCheck("https://youtube.com/watch?v=def")
  );
  assert.equal(normalizeUrlForDuplicateCheck("not a url"), "");
  assert.equal(normalizeUrlForDuplicateCheck("ftp://example.com/x"), "");
});

test("URL duplicates match canonically and exclude the card being edited", () => {
  const candidates = [
    { id: "a", url: "https://www.example.com/post?utm_source=tw" },
    { id: "b", url: "https://example.com/other" },
  ];
  assert.deepEqual(findUrlDuplicates("https://example.com/post/", candidates).map(c => c.id), ["a"]);
  assert.deepEqual(findUrlDuplicates("https://example.com/post", candidates, { excludeId: "a" }), []);
});

test("duplicate matches merge URL-first and dedupe by id", () => {
  const merged = mergeDuplicateMatches(
    [{ id: "x", title: "X" }],
    [{ id: "x", title: "X" }, { id: "y", title: "Y" }]
  );
  assert.deepEqual(merged.map(m => `${m.id}:${m.match}`), ["x:url", "y:title"]);
});

test("duplicates endpoint + form banner are wired", () => {
  assert.match(duplicatesRouteSource, /similarity\(title, \$1\)/);
  assert.match(duplicatesRouteSource, /findUrlDuplicates/);
  assert.match(formModalSource, /\/api\/items\/duplicates/);
  assert.match(formModalSource, /Similar card/);
});

// ── Ask my brain (2.13) ──────────────────────────────────────────────────────

test("ask context numbers sources and respects caps", () => {
  const rows = [
    { id: "1", title: "Agentic OS", type: "link", url: "https://yt.com/1", content: "How to structure agents", tags: ["ai"], category: "Claude Code" },
    { id: "2", title: "", ogTitle: "Fallback Title", type: "note", noteEntries: [{ body: "entry text" }] },
  ];
  const { contextText, sources } = buildAskContext(rows);
  assert.match(contextText, /\[1\] Agentic OS \(link · Claude Code · ai\)/);
  assert.match(contextText, /\[2\] Fallback Title/);
  assert.match(contextText, /entry text/);
  assert.equal(sources.length, 2);
  assert.equal(sources[1].title, "Fallback Title");

  const many = Array.from({ length: 20 }, (_, i) => ({ id: `${i}`, title: `T${i}`, type: "note", content: "x".repeat(2000) }));
  const capped = buildAskContext(many);
  assert.ok(capped.sources.length <= 8);
  assert.ok(capped.contextText.length <= 9_000);
});

test("ask history is trimmed and sanitised", () => {
  const history = trimAskHistory([
    { role: "user", content: "q1" },
    { role: "system", content: "ignore me" },
    { role: "assistant", content: "  a1  " },
    null,
    { role: "user", content: "" },
  ]);
  assert.deepEqual(history, [
    { role: "user", content: "q1" },
    { role: "assistant", content: "a1" },
  ]);
  assert.equal(trimAskHistory("junk").length, 0);
  assert.equal(trimAskHistory(Array.from({ length: 20 }, () => ({ role: "user", content: "x" }))).length, 6);
});

test("ask route retrieves via shared hybrid search and cites sources", () => {
  assert.match(askRouteSource, /hybridSearchItems/);
  assert.match(askRouteSource, /buildAskContext/);
  assert.match(askRouteSource, /Cite cards inline/);
  assert.match(askRouteSource, /rateLimit/);
  assert.match(brainSource, /AskBrainPanel/);
});
