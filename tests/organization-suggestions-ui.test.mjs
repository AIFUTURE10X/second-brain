import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");

test("Brain fetches AI organization suggestions and asks before applying them", () => {
  assert.match(brainSource, /const \[organizing, setOrganizing\] = useState<string \| null>\(null\)/);
  assert.match(brainSource, /const handleSuggestOrganization = async \(item: Item\)/);
  assert.match(brainSource, /fetch\("\/api\/items\/suggest-organization"/);
  assert.match(brainSource, /body: JSON\.stringify\(\{ id: item\.id \}\)/);
  assert.match(brainSource, /window\.confirm\(`Apply AI suggestions/);
  assert.match(brainSource, /JSON\.stringify\(\{ id: item\.id, tags: nextTags, category: nextCategory \}\)/);
});

test("ItemCard exposes a suggestion action while expanded", () => {
  assert.match(itemCardSource, /isOrganizing: boolean/);
  assert.match(itemCardSource, /onSuggestOrganization: \(\) => void/);
  assert.match(itemCardSource, /Suggest tags/);
  assert.match(brainSource, /isOrganizing=\{organizing === item\.id\}/);
  assert.match(brainSource, /onSuggestOrganization=\{\(\) => handleSuggestOrganization\(item\)\}/);
});
