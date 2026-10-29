import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { groupItemsByCategory } from "../lib/category-sections.mjs";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const stripSource = await readFile(new URL("../components/brain/CategoryStrip.tsx", import.meta.url), "utf8");

test("sections follow the settings order, keep list order, and put uncategorized last", () => {
  const sections = groupItemsByCategory([
    { id: "a", category: "Sales" },
    { id: "b", category: "" },
    { id: "c", category: "Recipes" },
    { id: "d", category: "Sales" },
    { id: "e", category: "Unlisted" },
    { id: "f", category: null },
  ], ["Recipes", "Work", "Sales"]);
  assert.deepEqual(sections.map(s => s.key), ["Recipes", "Sales", "Unlisted", ""]);
  assert.deepEqual(sections[1].items.map(i => i.id), ["a", "d"]);
  assert.deepEqual(sections[3].items.map(i => i.id), ["b", "f"]);
});

test("no cards means no sections", () => {
  assert.deepEqual(groupItemsByCategory([], ["Recipes"]), []);
});

test("grid views render category sections unless a date filter turns on the timeline", () => {
  assert.match(brainSource, /timelineGroups \? timelineGroups\.map/);
  assert.match(brainSource, /<CategorySections items=\{visibleItems\} allItems=\{filtered\}/);
});

test("the category strip offers All plus each category and toggles the shared filter", () => {
  assert.match(brainSource, /<CategoryStrip parentCats=\{parentCats\}/);
  assert.match(stripSource, /onCatFilterChange\("all"\)/);
  assert.match(stripSource, /toggleCategoryFilter\(catFilter, chip\.name\)/);
  assert.match(stripSource, /disabled=\{limitReached && !active\}/);
});

test("the strip stays visible while a category filter is on, even if results have no categories", () => {
  assert.match(brainSource, /\(parentCats\.length > 0 \|\| catFilter !== "all"\) && <CategoryStrip/);
  assert.match(stripSource, /selected\.filter\(name => !parentCats\.some\(cat => cat\.name === name\)\)/);
});

test("Clear all in the Filtered row also clears the category filter", () => {
  assert.match(brainSource, /setView\("all"\); setCatFilter\("all"\); setSourceFilter\(null\); setTagFilter\(null\);/);
});
