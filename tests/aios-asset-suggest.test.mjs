import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ASSET_CATEGORIES } from "../lib/aios-asset.mjs";
import { scoreAssetCategories, suggestAssetCategories } from "../lib/aios-asset-suggest.mjs";

test("suggests the obvious category from the title", () => {
  assert.deepEqual(suggestAssetCategories({ title: "GSAP ScrollTrigger hover effects" }), ["animation"]);
  assert.deepEqual(suggestAssetCategories({ title: "Build a Claude Code skill for SEO audits" }), ["skill"]);
  assert.deepEqual(suggestAssetCategories({ title: "Three.js product configurator" }), ["3d"]);
  assert.deepEqual(suggestAssetCategories({ title: "How I price my agency retainer" }), ["playbook"]);
});

test("offers a close second, never more than two", () => {
  const picks = suggestAssetCategories({ title: "Landing page with parallax scroll animation" });
  assert.deepEqual(picks, ["animation", "website"]);
  const busy = { title: "demo prompt skill automation website animation 3d component pricing" };
  assert.equal(suggestAssetCategories(busy).length, 2);
  assert.equal(suggestAssetCategories(busy, 1).length, 1);
});

test("suggests nothing when nothing points anywhere", () => {
  assert.deepEqual(suggestAssetCategories({ title: "Grocery list", content: "milk, eggs" }), []);
  assert.deepEqual(suggestAssetCategories({}), []);
  assert.deepEqual(suggestAssetCategories(null), []);
});

test("whole words only, and the card's own asset tag doesn't count", () => {
  // "uix" and "transitional" must not match "ux" and "transition".
  assert.deepEqual(suggestAssetCategories({ title: "uix transitional housing" }), []);
  assert.equal(scoreAssetCategories({ tags: ["aios-asset:demo"] }).demo, 0);
  assert.ok(scoreAssetCategories({ tags: ["n8n"] }).automation > 0);
});

test("the title outweighs a long body", () => {
  const card = { title: "Telegram bot that files receipts", content: "prompt ".repeat(2) };
  assert.equal(suggestAssetCategories(card)[0], "automation");
});

test("every scored key is a real category", () => {
  const keys = new Set(ASSET_CATEGORIES.map(category => category.key));
  for (const key of Object.keys(scoreAssetCategories({ title: "x" }))) assert.ok(keys.has(key), key);
});

test("the picker shows the suggestions and every card button passes the card", async () => {
  const picker = await readFile(new URL("../components/brain/AssetSendButton.tsx", import.meta.url), "utf8");
  assert.ok(picker.includes("suggestAssetCategories(card)"));
  assert.ok(picker.includes("Suggested for this card"));
  for (const file of ["components/brain/ItemCard.tsx", "components/brain/TableView.tsx", "components/brain/BoardView.tsx", "app/card/[id]/page.tsx"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const buttons = source.match(/<AssetSendButton[\s\S]*?\/>/g) ?? [];
    assert.ok(buttons.length > 0, file);
    for (const button of buttons) assert.ok(button.includes("card={"), `${file}: ${button}`);
  }
});

test("a second category named in the title is offered even when the first scores much higher", () => {
  assert.deepEqual(suggestAssetCategories({ title: "Landing page with GSAP parallax scroll animation" }), ["animation", "website"]);
  // Named only in the body, a weak second stays off.
  assert.deepEqual(suggestAssetCategories({ title: "GSAP parallax scroll animation", content: "on a landing page" }), ["animation"]);
});

test("saved note entries count, and an indented 🗂 tag does not", () => {
  assert.deepEqual(suggestAssetCategories({ title: "New idea", noteEntries: [{ body: "Build a Telegram bot" }] }), ["automation"]);
  assert.deepEqual(suggestAssetCategories({ title: "Grocery list", tags: [" AIOS-Asset:Skill "] }), []);
});

test("three weak body hits never pass as a title-named second", () => {
  const card = { title: "GSAP parallax scroll animation animated", content: "prompt template brief" };
  assert.deepEqual(suggestAssetCategories(card), ["animation"]);
});
