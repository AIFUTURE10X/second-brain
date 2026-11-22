import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const itemColumnsSource = await read("db/item-columns.ts");
const itemsRouteSource = await read("app/api/items/route.ts");
const saveRouteSource = await read("app/api/save/route.ts");
const sharePageSource = await read("app/share/page.tsx");
const brainSource = await read("components/Brain.tsx");

test("ITEM_PUBLIC_COLUMNS excludes heavy internal embedding and searchTsv columns", () => {
  assert.doesNotMatch(itemColumnsSource, /\bembedding\s*:/);
  assert.doesNotMatch(itemColumnsSource, /\bsearchTsv\s*:/);
  assert.match(itemColumnsSource, /\btitle\s*:\s*items\.title/);
  assert.match(itemColumnsSource, /\bupdatedAt\s*:\s*items\.updatedAt/);
});

test("items and save routes project ITEM_PUBLIC_COLUMNS instead of SELECT *", () => {
  assert.match(itemsRouteSource, /select\(ITEM_PUBLIC_COLUMNS\)/);
  assert.match(itemsRouteSource, /returning\(ITEM_PUBLIC_COLUMNS\)/);
  assert.doesNotMatch(itemsRouteSource, /db\.select\(\)\.from\(items\)/);
  assert.match(saveRouteSource, /returning\(ITEM_PUBLIC_COLUMNS\)/);
});

test("POST /api/items and POST /api/save run URL enrichment and AI tagging post-response via after()", () => {
  for (const [name, source] of [["items", itemsRouteSource], ["save", saveRouteSource]]) {
    const insertIdx = source.indexOf(".insert(items)");
    const afterIdx = source.indexOf("after(async () =>");
    const enrichIdx = source.indexOf("enrichUrl(");
    const aiTagIdx = source.indexOf("aiTagAndCategorize(");

    assert.ok(insertIdx !== -1, `${name}: expected insert(items)`);
    assert.ok(afterIdx > insertIdx, `${name}: expected after() after insert(items)`);
    assert.ok(enrichIdx > afterIdx, `${name}: enrichUrl should run inside after(), not block POST`);
    assert.ok(aiTagIdx > afterIdx, `${name}: aiTagAndCategorize should run inside after(), not block POST`);
    assert.match(source, /Promise\.all\(\[\s*(?:!body\.ogTitle \? )?enrichUrl\(url\)/, `${name}: enrichUrl and fetchYouTubeDescriptionLinks should run in parallel`);
  }
});

test("share target prefetches home, uploads files in parallel, and stashes the saved item", () => {
  assert.match(sharePageSource, /router\.prefetch\("\/"\)/);
  assert.match(sharePageSource, /Promise\.all\(/);
  assert.match(sharePageSource, /stashJustSavedItem/);
});

test("Brain consolidates settings fetch, hydrates from local cache, and throttles visibility sync", () => {
  assert.match(brainSource, /fetch\("\/api\/settings"\)/);
  assert.doesNotMatch(brainSource, /fetch\(`\/api\/settings\?key=/);
  assert.match(brainSource, /readCachedItems\(\)/);
  assert.match(brainSource, /consumeJustSavedItem\(\)/);
  assert.match(brainSource, /lastVisibleSyncRef/);
});
