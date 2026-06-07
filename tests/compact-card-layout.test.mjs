import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");

test("compact cards use a square shell with cover-cropped header images", () => {
  assert.match(brainSource, /aspect-square/);
  assert.match(brainSource, /aspect-\[5\/4\]/);
  assert.match(brainSource, /object-cover object-center/);
  assert.doesNotMatch(brainSource, /className="relative block w-full h-20 bg-brand-muted overflow-hidden group"/);
});

test("compact grid uses auto-fit fixed-width columns instead of a hard four-column ceiling", () => {
  assert.match(brainSource, /repeat\(auto-fit,minmax\(min\(100%,17rem\),17rem\)\)/);
  assert.doesNotMatch(brainSource, /grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2/);
});

test("category and source filters use dense wrap dropdowns instead of wide cards", () => {
  assert.match(brainSource, /const \[catMenuOpen, setCatMenuOpen\] = useState\(false\)/);
  assert.match(brainSource, /const \[sourceMenuOpen, setSourceMenuOpen\] = useState\(false\)/);
  assert.match(brainSource, /placeholder="Search categories…"/);
  assert.match(brainSource, /placeholder="Search sources…"/);
  assert.match(brainSource, /data-category-menu/);
  assert.match(brainSource, /data-source-menu/);
  assert.match(brainSource, /inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1\.5 text-left transition/);
  assert.match(brainSource, /className="flex flex-wrap gap-1\.5"/);
  assert.doesNotMatch(brainSource, /inline-flex max-w-full flex-col gap-1\.5 rounded-2xl border border-brand-border bg/);
  assert.doesNotMatch(brainSource, /Category filters — hierarchical[\s\S]*overflow-x-auto scroll-fade/);
  assert.doesNotMatch(brainSource, /grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(brainSource, /grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4/);
});
