import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");

test("Brain loads and persists custom saved views through settings", () => {
  assert.match(brainSource, /CUSTOM_SAVED_VIEWS_KEY/);
  assert.match(brainSource, /normalizeCustomSavedViews/);
  assert.match(brainSource, /createCustomSavedView/);
  assert.match(brainSource, /fetch\(`\/api\/settings\?key=\$\{CUSTOM_SAVED_VIEWS_KEY\}`\)/);
  assert.match(brainSource, /JSON\.stringify\(\{ key: CUSTOM_SAVED_VIEWS_KEY, value: nextViews \}\)/);
});

test("Brain can apply and delete custom saved views", () => {
  assert.match(brainSource, /applyCustomSavedView/);
  assert.match(brainSource, /deleteCustomSavedView/);
  assert.match(brainSource, /customSavedViews\.map/);
  assert.match(brainSource, /aria-label=\{`Delete custom view \$\{savedView\.label\}`\}/);
});

test("Brain can save the current filter state as a custom view", () => {
  assert.match(brainSource, /currentSavedViewFilters/);
  assert.match(brainSource, /handleSaveCustomView/);
  assert.match(brainSource, /window\.prompt\("Name this view"/);
  assert.match(brainSource, /createCustomSavedView\(label, currentSavedViewFilters/);
});
