import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");
const bulkBarSource = await readFile(new URL("../components/brain/BulkTriageBar.tsx", import.meta.url), "utf8").catch(() => "");

test("Brain tracks selected cards and renders the bulk triage bar", () => {
  assert.match(brainSource, /import \{ BulkTriageBar \} from "\.\/brain\/BulkTriageBar"/);
  assert.match(brainSource, /const \[selectedIds, setSelectedIds\] = useState<Set<string>>\(new Set\(\)\)/);
  assert.match(brainSource, /const selectedItems = items\.filter\(item => selectedIds\.has\(item\.id\)\)/);
  assert.match(brainSource, /<BulkTriageBar/);
  assert.match(brainSource, /selectedCount={selectedItems\.length}/);
});

test("Brain bulk actions update selected cards through the item API", () => {
  assert.match(brainSource, /const updateSelectedItems = async \(/);
  assert.match(brainSource, /Promise\.allSettled\(ids\.map\(async id =>/);
  assert.match(brainSource, /fetch\("\/api\/items"/);
  assert.match(brainSource, /body: JSON\.stringify\(\{ id, \.\.\.payloadForId\(id\) \}\)/);
  assert.match(brainSource, /broadcastSync\(\{ type: "item-updated", item \}\)/);
});

test("Brain can bulk-assign category and append tags", () => {
  assert.match(brainSource, /const \[bulkCategory, setBulkCategory\] = useState\(""\)/);
  assert.match(brainSource, /const \[bulkTags, setBulkTags\] = useState\(""\)/);
  assert.match(brainSource, /const parseBulkTags = \(value: string\) => value\.split\(","\)\.map\(tag => tag\.trim\(\)\)\.filter\(Boolean\)/);
  assert.match(brainSource, /onCategoryChange={setBulkCategory}/);
  assert.match(brainSource, /onApplyCategory={handleBulkApplyCategory}/);
  assert.match(brainSource, /onTagDraftChange={setBulkTags}/);
  assert.match(brainSource, /onApplyTags={handleBulkApplyTags}/);
  assert.match(brainSource, /tags: Array\.from\(new Set\(\[\.\.\.\(current\?\.tags \|\| \[\]\), \.\.\.tags\]\)\)/);
});

test("ItemCard has a selection control that does not open the card", () => {
  assert.match(itemCardSource, /selected: boolean/);
  assert.match(itemCardSource, /onToggleSelected: \(\) => void/);
  assert.match(itemCardSource, /e\.stopPropagation\(\); onToggleSelected\(\);/);
  assert.match(itemCardSource, /aria-label={selected \? "Deselect card" : "Select card"}/);
  assert.match(itemCardSource, /aria-pressed={selected}/);
});

test("BulkTriageBar exposes reviewed, favorite, action, and clear commands", () => {
  assert.match(bulkBarSource, /interface BulkTriageBarProps/);
  assert.match(bulkBarSource, /if \(selectedCount === 0\) return null/);
  assert.match(bulkBarSource, /onMarkReviewed/);
  assert.match(bulkBarSource, /onToggleFavourite/);
  assert.match(bulkBarSource, /onToggleActionRequired/);
  assert.match(bulkBarSource, /onClear/);
});

test("BulkTriageBar exposes category and tag controls", () => {
  assert.match(bulkBarSource, /categoryOptions: string\[\]/);
  assert.match(bulkBarSource, /selectedCategory: string/);
  assert.match(bulkBarSource, /onCategoryChange: \(value: string\) => void/);
  assert.match(bulkBarSource, /tagDraft: string/);
  assert.match(bulkBarSource, /onTagDraftChange: \(value: string\) => void/);
  assert.match(bulkBarSource, /grid-cols-2 sm:grid-cols-3 lg:grid-cols-6/);
  assert.match(bulkBarSource, /grid-cols-3/);
  assert.doesNotMatch(bulkBarSource, /<select/);
  assert.match(bulkBarSource, /placeholder="Add tags"/);
});
