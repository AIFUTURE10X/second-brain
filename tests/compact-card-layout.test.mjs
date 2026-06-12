import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
// Card markup moved to ItemCard.tsx in the PLAN.md 1.4 extraction.
const cardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");

test("compact cards use a square shell with cover-cropped header images", () => {
  assert.match(cardSource, /aspect-square/);
  assert.match(cardSource, /aspect-\[5\/4\]/);
  assert.match(cardSource, /object-cover object-center/);
  assert.doesNotMatch(cardSource, /className="relative block w-full h-20 bg-brand-muted overflow-hidden group"/);
});

test("compact grid uses auto-fit fixed-width columns instead of a hard four-column ceiling", () => {
  assert.match(brainSource, /repeat\(auto-fit,minmax\(min\(100%,17rem\),17rem\)\)/);
  assert.doesNotMatch(brainSource, /grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2/);
});

// Filter dropdowns moved to FilterBar.tsx in the PLAN.md 1.6 redesign.
const filterBarSource = await readFile(new URL("../components/brain/FilterBar.tsx", import.meta.url), "utf8");

test("category and source filters use dense wrap dropdowns inside the filter bar", () => {
  assert.match(filterBarSource, /placeholder="Search categories…"/);
  assert.match(filterBarSource, /placeholder="Search sources…"/);
  assert.match(filterBarSource, /data-filter-bar/);
  assert.match(filterBarSource, /inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1\.5 text-left transition/);
  assert.match(filterBarSource, /flex flex-wrap gap-1\.5/);
  assert.doesNotMatch(brainSource, /data-category-menu/);
  assert.doesNotMatch(brainSource, /data-source-menu/);
  assert.doesNotMatch(brainSource, /data-tag-menu/);
  assert.doesNotMatch(brainSource, /grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(brainSource, /grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4/);
});
