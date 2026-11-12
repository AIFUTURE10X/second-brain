import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import {
  ASSET_CATEGORIES,
  ASSET_TAG_PREFIX,
  assetCategoryOf,
  assetNotice,
  assetTagsSql,
  isAssetCategory,
  setAssetTag,
  setAssetTagText,
  withoutAssetTags,
} from "../lib/aios-asset.mjs";
import { BUSINESS_IDEA_TAG } from "../lib/business-idea.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const has = (source, text, message) => assert.ok(source.includes(text), message ?? `missing: ${text}`);

test("nine categories with unique keys, a colour and a short hint each", () => {
  assert.equal(ASSET_CATEGORIES.length, 9, "the picker is a 3×3 grid");
  assert.equal(new Set(ASSET_CATEGORIES.map(c => c.key)).size, ASSET_CATEGORIES.length);
  for (const c of ASSET_CATEGORIES) {
    assert.match(c.key, /^[a-z0-9]+$/, "keys are tag-safe and SQL-literal-safe");
    assert.match(c.color, /^#[0-9A-F]{6}$/i);
    assert.ok(c.label && c.emoji && c.hint.length <= 40, c.key);
  }
  for (const key of ["website", "animation", "automation", "skill"]) assert.ok(isAssetCategory(key), key);
  assert.equal(isAssetCategory("nope"), false);
  assert.equal(isAssetCategory(undefined), false);
});

test("one category per card: filing again moves it, null takes it back, other tags stay", () => {
  assert.deepEqual(setAssetTag(["ai"], "skill"), ["ai", "aios-asset:skill"]);
  assert.deepEqual(setAssetTag(["ai", "aios-asset:skill", BUSINESS_IDEA_TAG], "website"), ["ai", BUSINESS_IDEA_TAG, "aios-asset:website"]);
  assert.deepEqual(setAssetTag(["ai", " AIOS-Asset:Skill "], null), ["ai"]);
  assert.deepEqual(setAssetTag(null, "demo"), ["aios-asset:demo"]);
  assert.deepEqual(setAssetTag(["ai"], "bogus"), ["ai"], "an unknown key files nothing");
  assert.equal(setAssetTagText("ai, startup", "3d"), "ai, startup, aios-asset:3d");
  assert.equal(setAssetTagText("ai, aios-asset:3d", null), "ai");
  assert.equal(assetCategoryOf(["x", "AIOS-ASSET:Animation"]), "animation");
  assert.equal(assetCategoryOf(["aios-asset:unknown"]), null);
  assert.equal(assetCategoryOf(undefined), null);
  assert.deepEqual(withoutAssetTags(["aios-asset:skill", "keep"]), ["keep"]);
  assert.match(assetNotice("skill"), /Skills/);
  assert.match(assetNotice(null), /Taken back/);
});

test("the server swaps the asset tag in one statement, keeping every other tag in order", async () => {
  assert.throws(() => assetTagsSql(`"tags"`, "x'; drop table items; --"), /Unknown asset category/);
  const pg = await PGlite.create();
  await pg.exec(`CREATE TABLE items (id int PRIMARY KEY, tags jsonb)`);
  const rows = [
    [1, ["ai", "startup"]],
    [2, ["ai", " AIOS-Asset:Skill ", "startup", "aios-asset:demo"]],
    [3, null],
    [4, { not: "an array" }],
  ];
  for (const [id, tags] of rows) await pg.query(`INSERT INTO items VALUES ($1, $2)`, [id, tags === null ? null : JSON.stringify(tags)]);
  const file = async (id, key) =>
    (await pg.query(`UPDATE items SET tags = ${assetTagsSql(`"tags"`, key)} WHERE id = $1 RETURNING tags`, [id])).rows[0].tags;

  assert.deepEqual(await file(1, "website"), ["ai", "startup", "aios-asset:website"]);
  assert.deepEqual(await file(1, "skill"), ["ai", "startup", "aios-asset:skill"], "moving keeps one marker");
  assert.deepEqual(await file(2, null), ["ai", "startup"], "every spelling goes");
  assert.deepEqual(await file(3, "demo"), ["aios-asset:demo"]);
  assert.deepEqual(await file(4, "ui"), ["aios-asset:ui"]);
  await pg.query(`UPDATE items SET tags = tags || '["added-meanwhile"]'::jsonb WHERE id = 1`);
  assert.deepEqual(await file(1, null), ["ai", "startup", "added-meanwhile"]);
  await pg.close();
});

test("only a person files an asset: both AI tag paths drop the tag", async () => {
  const ingest = await read("lib/ingest.ts");
  assert.match(ingest, new RegExp(`AI_RESERVED_TAG_PREFIX = "${ASSET_TAG_PREFIX}"`));
  has(ingest, "!tag.startsWith(AI_RESERVED_TAG_PREFIX)");
  has(await read("lib/ai-tagger.ts"), "withoutAssetTags(withoutIdeaTag(parsed.tags.map(String)))");
});

test("web: 🗂 sits beside 💼 on every card layout, the table, board and card page", async () => {
  const card = await read("components/brain/ItemCard.tsx");
  for (const variant of ["row", "icon", "pill"]) has(card, `<AssetSendButton variant="${variant}" tags={item.tags} onPick={onToggleIdea} />`);
  for (const path of ["components/brain/TableView.tsx", "components/brain/BoardView.tsx"]) {
    has(await read(path), "onPick={asset => onToggleIdea(item, asset)}");
  }
  const brain = await read("components/Brain.tsx");
  has(brain, "asset === undefined ? toggleCardIdea(item,");
  has(brain, "sendCardAsset(item, asset,");
  const page = await read("app/card/[id]/page.tsx");
  has(page, `fetch("/api/items/asset"`);
  has(page, "onPick={pickAsset}");
  const button = await read("components/brain/AssetSendButton.tsx");
  has(button, `fetch("/api/items/asset"`);
  has(button, "applyLocally({ tags: saved.tags, updatedAt: saved.updatedAt })");
  has(button, "createPortal(", "the picker escapes clipped card footers");
  const route = await read("app/api/items/asset/route.ts");
  has(route, "checkApiKey(req)");
  has(route, "!isAssetCategory(category)");
  has(await read("lib/aios-asset-store.ts"), "sql.raw(assetTagsSql(`\"tags\"`, category))");
});
