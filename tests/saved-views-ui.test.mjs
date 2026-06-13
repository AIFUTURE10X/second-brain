import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const filterBarSource = await readFile(new URL("../components/brain/FilterBar.tsx", import.meta.url), "utf8");
const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");

test("Brain renders built-in saved views from the shared helper", () => {
  assert.match(brainSource, /SAVED_VIEWS/);
  assert.match(brainSource, /getSavedViewCounts/);
  assert.match(brainSource, /filtersForSavedView/);
  assert.match(brainSource, /inferSavedViewKey/);
  assert.match(brainSource, /SAVED_VIEWS\.map/);
});

test("Brain tracks Inbox as a real filter state", () => {
  assert.match(brainSource, /const \[inboxOnly, setInboxOnly\] = useState\(false\)/);
  assert.match(brainSource, /\.filter\(i => !inboxOnly \|\| isItemUnreviewed\(i\)\)/);
  assert.match(brainSource, /inboxOnly={inboxOnly}/);
  assert.match(brainSource, /onInboxOnly={setInboxOnly}/);
});

test("ItemCard exposes a reviewed action for unreviewed cards", () => {
  assert.match(itemCardSource, /onMarkReviewed/);
  assert.match(itemCardSource, /item\.reviewedAt === null/);
  assert.match(itemCardSource, />Reviewed<\/button>/);
  assert.match(brainSource, /onMarkReviewed={\(\) => handleMarkReviewed\(item\.id\)}/);
});

test("FilterBar can clear and toggle the Inbox quick filter", () => {
  assert.match(filterBarSource, /inboxOnly: boolean/);
  assert.match(filterBarSource, /onInboxOnly: \(v: boolean\) => void/);
  assert.match(filterBarSource, /Inbox/);
  assert.match(filterBarSource, /onInboxOnly\(false\)/);
});
