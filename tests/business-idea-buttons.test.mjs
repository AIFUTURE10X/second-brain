import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BUSINESS_IDEA_TAG,
  findIdeaKeyboard,
  hasIdeaTag,
  ideaButton,
  ideaKeyboard,
  ideaToggleNotice,
  parseIdeaCallback,
  setIdeaTag,
  toggleIdeaTagText,
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

const ID = "0b6f3c1e-5a7d-4c2b-9e8f-1a2b3c4d5e6f";
const OTHER = "9f8e7d6c-5b4a-4321-8fed-cba987654321";

test("the 💼 toggle adds or removes the tag and leaves the others alone", () => {
  assert.equal(hasIdeaTag(["ai", "Business-Idea"]), true);
  assert.equal(hasIdeaTag(["business ideas"]), false);
  assert.equal(hasIdeaTag(null), false);
  assert.deepEqual(setIdeaTag(["ai"], true), ["ai", BUSINESS_IDEA_TAG]);
  assert.deepEqual(setIdeaTag(["ai", BUSINESS_IDEA_TAG], false), ["ai"]);
  assert.deepEqual(setIdeaTag(null, true), [BUSINESS_IDEA_TAG]);
  assert.equal(toggleIdeaTagText("ai, startup"), `ai, startup, ${BUSINESS_IDEA_TAG}`);
  assert.equal(toggleIdeaTagText(`ai,  Business-Idea ,startup`), "ai, startup");
  assert.equal(toggleIdeaTagText(""), BUSINESS_IDEA_TAG);
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

test("Telegram: saves and /find carry 💼; a tap is allowlisted, then flips the tag", () => {
  assert.match(telegramSource, /type === "link" \|\| type === "thought" \? ideaKeyboard\(row\.id, hasIdeaTag\(tags\)\)/);
  assert.match(telegramSource, /findIdeaKeyboard\(result\.rows\)/);
  const handler = telegramSource.slice(telegramSource.indexOf("async function handleCallbackQuery"));
  assert.ok(handler.indexOf("allowedIds.includes(senderId)") < handler.indexOf("parseIdeaCallback("), "strangers are refused first");
  assert.match(handler, /set\(\{ tags: setIdeaTag\(card\.tags, idea\.send\), updatedAt: new Date\(\) \}\)/);
  assert.match(handler, /withIdeaButtonState\(callbackQuery\.message\?\.reply_markup, idea\.itemId, idea\.send\)/);
});

test("web: 💼 on every card layout, the card page and the bulk bar", () => {
  assert.equal(itemCardSource.match(/<IdeaToggleButton variant="(row|icon|pill)" sent=\{hasIdeaTag\(item\.tags\)\} onToggle=\{onToggleIdea\} \/>/g)?.length, 3);
  assert.match(brainSource, /onToggleIdea=\{\(\) => toggleCardIdea\(item, \{ setItems, broadcastSync, queueWriteOffline \}\)\}/);
  assert.match(ideaToggleSource, /body: JSON\.stringify\(\{ id: item\.id, tags \}\)/);
  assert.match(ideaToggleSource, /queueWriteOffline\(\{ kind: "update", payload: \{ id: item\.id, tags \} \}\)/);
  assert.match(bulkSource, /onAddTag\(BUSINESS_IDEA_TAG\)/);
  assert.match(cardPageSource, /save\(\{ tags \}\)/);
  // save() now takes overrides, so the Save button must not hand it the click event.
  assert.doesNotMatch(cardPageSource, /onClick=\{save\}/);
});
