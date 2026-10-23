import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

import {
  BUSINESS_IDEA_TAG,
  findIdeaKeyboard,
  hasIdeaTag,
  ideaButton,
  ideaTagsSql,
  ideaKeyboard,
  ideaToggleNotice,
  parseIdeaCallback,
  setIdeaTag,
  setIdeaTagText,
  withIdeaButtonState,
} from "../lib/business-idea.mjs";
import { buildSnoozeKeyboard, parseSnoozeCallback } from "../lib/reminder-snooze.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const telegramSource = await read("app/api/telegram/route.ts");
const itemCardSource = await read("components/brain/ItemCard.tsx");
const ideaToggleSource = await read("components/brain/IdeaToggle.tsx");
const brainSource = await read("components/Brain.tsx");
const bulkSource = await read("components/brain/BulkActionsBar.tsx");
const cardPageSource = await read("app/card/[id]/page.tsx");
const storeSource = await read("lib/business-idea-store.ts");
const ideaRouteSource = await read("app/api/items/idea/route.ts");
const tableSource = await read("components/brain/TableView.tsx");
const boardSource = await read("components/brain/BoardView.tsx");

const ID = "0b6f3c1e-5a7d-4c2b-9e8f-1a2b3c4d5e6f";
const OTHER = "9f8e7d6c-5b4a-4321-8fed-cba987654321";

test("the 💼 toggle adds or removes the tag and leaves the others alone", () => {
  assert.equal(hasIdeaTag(["ai", "Business-Idea"]), true);
  assert.equal(hasIdeaTag(["business ideas"]), false);
  assert.equal(hasIdeaTag(null), false);
  assert.deepEqual(setIdeaTag(["ai"], true), ["ai", BUSINESS_IDEA_TAG]);
  assert.deepEqual(setIdeaTag(["ai", BUSINESS_IDEA_TAG], false), ["ai"]);
  assert.deepEqual(setIdeaTag(null, true), [BUSINESS_IDEA_TAG]);
  assert.equal(setIdeaTagText("ai, startup", true), `ai, startup, ${BUSINESS_IDEA_TAG}`);
  assert.equal(setIdeaTagText(`ai,  Business-Idea ,startup`, false), "ai, startup");
  assert.equal(setIdeaTagText("", true), BUSINESS_IDEA_TAG);
  for (const sent of [true, false]) assert.ok(ideaToggleNotice(sent).length <= 200, "fits a callback toast");
});

test("button data round-trips and stays under Telegram's 64-byte cap", () => {
  for (const [sent, n] of [[false], [true], [false, 5], [true, 1]]) {
    const button = ideaButton(ID, sent, n);
    assert.ok(Buffer.byteLength(button.callback_data) <= 64, button.callback_data);
    assert.deepEqual(parseIdeaCallback(button.callback_data), { send: !sent, itemId: ID, n });
  }
  assert.equal(ideaButton(ID, false).text, "💼 Send to AI OS");
  assert.equal(ideaButton(ID, true).text, "✓ Sent to AI OS · Undo");
  assert.equal(ideaButton(ID, false, 3).text, "💼 3");
  assert.deepEqual(ideaKeyboard(ID, false), { inline_keyboard: [[ideaButton(ID, false)]] });
  assert.deepEqual(parseIdeaCallback(`idea:ON:${ID.toUpperCase()}`), { send: true, itemId: ID, n: undefined });
});

test("idea and snooze callbacks never read as each other", () => {
  const snoozeData = buildSnoozeKeyboard(ID).inline_keyboard[0][0].callback_data;
  assert.equal(parseIdeaCallback(snoozeData), null);
  assert.equal(parseSnoozeCallback(ideaButton(ID, false).callback_data), null);
  for (const junk of [undefined, "", "idea:on:not-a-uuid", `idea:maybe:${ID}`, `idea:on:${ID}:0`, `idea:on:${ID}:12`, `xidea:on:${ID}`]) {
    assert.equal(parseIdeaCallback(junk), null, String(junk));
  }
});

test("/find gets one numbered button per result shown, already-sent cards as ✓", () => {
  const rows = [
    { id: ID, tags: ["ai"] },
    { id: OTHER, tags: [BUSINESS_IDEA_TAG] },
    ...Array.from({ length: 5 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000000${i}`, tags: [] })),
  ];
  const [buttons] = findIdeaKeyboard(rows).inline_keyboard;
  assert.equal(buttons.length, 5, "same limit as formatFindResults");
  assert.deepEqual(buttons.slice(0, 2).map(b => b.text), ["💼 1", "✓ 2 · Undo"]);
  assert.equal(parseIdeaCallback(buttons[1].callback_data).send, false, "tapping ✓ undoes");
  assert.equal(findIdeaKeyboard([]), null);
  assert.equal(findIdeaKeyboard(undefined), null);
});

test("a tap flips only that card's button and keeps its number", () => {
  const keyboard = {
    inline_keyboard: [
      [ideaButton(ID, false, 1), ideaButton(OTHER, false, 2)],
      [{ text: "⏰ 1 hour", callback_data: `snooze:${OTHER}:1h` }],
    ],
  };
  const next = withIdeaButtonState(keyboard, ID, true);
  assert.deepEqual(next.inline_keyboard[0], [ideaButton(ID, true, 1), ideaButton(OTHER, false, 2)]);
  assert.deepEqual(next.inline_keyboard[1], keyboard.inline_keyboard[1]);
  assert.deepEqual(withIdeaButtonState(ideaKeyboard(ID, true), ID, false), ideaKeyboard(ID, false));
  assert.deepEqual(withIdeaButtonState(undefined, ID, true), { inline_keyboard: [] });
});

test("the server flips the tag in one statement, keeping every other tag in order", async () => {
  const pg = await PGlite.create();
  await pg.exec(`CREATE TABLE items (id int PRIMARY KEY, tags jsonb)`);
  const rows = [
    [1, ["ai", "startup"]],
    [2, ["ai", " Business-Idea ", "startup", BUSINESS_IDEA_TAG]],
    [3, null],
    [4, []],
    [5, { not: "an array" }],
  ];
  for (const [id, tags] of rows) await pg.query(`INSERT INTO items VALUES ($1, $2)`, [id, tags === null ? null : JSON.stringify(tags)]);
  const flip = async (id, send) =>
    (await pg.query(`UPDATE items SET tags = ${ideaTagsSql(`"tags"`, send)} WHERE id = $1 RETURNING tags`, [id])).rows[0].tags;

  assert.deepEqual(await flip(1, true), ["ai", "startup", BUSINESS_IDEA_TAG]);
  assert.deepEqual(await flip(1, true), ["ai", "startup", BUSINESS_IDEA_TAG], "sending twice keeps one marker");
  assert.deepEqual(await flip(2, false), ["ai", "startup"], "every spelling of the marker goes");
  assert.deepEqual(await flip(2, true), ["ai", "startup", BUSINESS_IDEA_TAG]);
  assert.deepEqual(await flip(3, true), [BUSINESS_IDEA_TAG]);
  assert.deepEqual(await flip(4, false), []);
  assert.deepEqual(await flip(5, true), [BUSINESS_IDEA_TAG]);
  // A tag added between the client reading the card and the tap still survives.
  await pg.query(`UPDATE items SET tags = tags || '["added-meanwhile"]'::jsonb WHERE id = 1`);
  assert.deepEqual(await flip(1, false), ["ai", "startup", "added-meanwhile"]);
  await pg.close();
});

const has = (source, text, message) => assert.ok(source.includes(text), message ?? `missing: ${text}`);
const count = (source, text) => source.split(text).length - 1;

test("Telegram: saves and /find carry 💼; a tap is allowlisted, then flips only the tag", () => {
  has(telegramSource, `type === "link" || type === "thought" ? ideaKeyboard(row.id, hasIdeaTag(tags))`);
  has(telegramSource, "findIdeaKeyboard(result.rows)");
  const handler = telegramSource.slice(telegramSource.indexOf("async function handleCallbackQuery"));
  assert.ok(handler.indexOf("allowedIds.includes(senderId)") < handler.indexOf("parseIdeaCallback("), "strangers are refused first");
  has(handler, "setCardIdea(idea.itemId, idea.send)");
  has(handler, "withIdeaButtonState(callbackQuery.message?.reply_markup, idea.itemId, idea.send)");
  has(storeSource, "sql.raw(ideaTagsSql(`\"tags\"`, send))");
  has(storeSource, "after(() => updateItemEmbedding(row.id))", "tags feed the embedding");
});

test("web: 💼 on every card layout, table, board, card page and bulk bar; tag-only writes", () => {
  for (const variant of ["row", "icon", "pill"]) {
    has(itemCardSource, `<IdeaToggleButton variant="${variant}" sent={hasIdeaTag(item.tags)} onToggle={onToggleIdea} />`);
  }
  for (const source of [tableSource, boardSource]) has(source, "sent={hasIdeaTag(item.tags)} onToggle={() => onToggleIdea(item)}");
  assert.equal(count(brainSource, "onToggleIdea={toggleIdea}"), 2, "table and board");
  has(brainSource, "onToggleIdea={() => toggleIdea(item)}");
  has(bulkSource, "onAddTag(BUSINESS_IDEA_TAG)");
  // Grid and card page send only { id, send }; the grid keeps the server updatedAt (no false 409).
  has(ideaToggleSource, `fetch("/api/items/idea"`);
  has(ideaToggleSource, "applyLocally({ tags: saved.tags, updatedAt: saved.updatedAt })");
  has(cardPageSource, `fetch("/api/items/idea"`);
  const cardToggle = cardPageSource.slice(cardPageSource.indexOf("const toggleIdea"), cardPageSource.indexOf("const handleSummarize"));
  assert.ok(!cardToggle.includes("save(") && !cardToggle.includes("syncReminder"), "a 💼 tap never re-saves the form or its reminder");
  has(ideaRouteSource, "checkApiKey(req)");
  has(ideaRouteSource, `typeof body?.send !== "boolean"`);
});
