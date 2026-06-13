import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");
const shareMenuSource = await readFile(new URL("../components/brain/ShareMenu.tsx", import.meta.url), "utf8");

test("ItemCard exposes a share menu in quick actions and expanded actions", () => {
  assert.match(itemCardSource, /import \{ ShareMenu \} from "\.\/ShareMenu"/);
  assert.match(itemCardSource, /<ShareMenu item={item} variant="icon"/);
  assert.match(itemCardSource, /<ShareMenu item={item} variant="button"/);
});

test("ShareMenu offers Gmail, WhatsApp, and Telegram actions", () => {
  assert.match(shareMenuSource, /buildCardShareLinks/);
  assert.match(shareMenuSource, /aria-label="Share card"/);
  assert.match(shareMenuSource, /role="menu"/);
  assert.match(shareMenuSource, />Gmail</);
  assert.doesNotMatch(shareMenuSource, />Email</);
  assert.match(shareMenuSource, />WhatsApp</);
  assert.match(shareMenuSource, />Telegram</);
});
