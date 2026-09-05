import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { captureFilterState, expandFilterState } from "../lib/saved-searches.mjs";

const source = await readFile(new URL("../lib/saved-views.ts", import.meta.url), "utf8");
const dir = await mkdtemp(path.join(tmpdir(), "brain-category-filters-"));
const modulePath = path.join(dir, "saved-views.mjs");
await writeFile(modulePath, ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText);
const filters = await import(pathToFileURL(modulePath).href);

test("saved views retain up to four categories rather than reverting to all", () => {
  const selected = ["Sales", "Ads", "Marketing & Growth", "Video Ads"];
  assert.deepEqual(filters.normalizeSavedViewFilters({ catFilter: selected }).catFilter, selected);
});

test("category selection toggles one through four, rejects a fifth, and clears", () => {
  let selection = "all";
  for (const name of ["Sales", "Ads", "Marketing & Growth", "Video Ads"])
    selection = filters.toggleCategoryFilter(selection, name);
  assert.deepEqual(selection, ["Sales", "Ads", "Marketing & Growth", "Video Ads"]);
  assert.deepEqual(filters.toggleCategoryFilter(selection, "Design"), selection);
  for (const name of ["Sales", "Ads", "Marketing & Growth", "Video Ads"])
    selection = filters.toggleCategoryFilter(selection, name);
  assert.equal(selection, "all");
});

test("categories match any selection, include a parent's children, and never duplicate cards", () => {
  const expand = name => name === "Work & Business" ? [name, "Sales", "Ads"] : [name];
  const cards = ["Sales", "Ads", "Video Ads", "Codex", "", "Marketing & Growth"];
  const match = (category, selected) => filters.matchesCategoryFilter(category, selected, expand);
  assert.deepEqual(cards.filter(c => match(c, ["Sales", "Video Ads"])), ["Sales", "Video Ads"]);
  assert.deepEqual(cards.filter(c => match(c, ["Work & Business", "Sales"])), ["Sales", "Ads"]);
  assert.deepEqual(cards.filter(c => match(c, "all")), cards);
});

test("legacy saved views work and category arrays are sanitized without splitting literal commas", () => {
  assert.equal(filters.normalizeCategoryFilter("Marketing & Growth, Sales Ads"), "Marketing & Growth, Sales Ads");
  assert.equal(filters.normalizeCategoryFilter("Sales"), "Sales");
  assert.equal(filters.normalizeCategoryFilter([]), "all");
  assert.deepEqual(filters.normalizeCategoryFilter([null, " Sales ", "Sales", "", "all", "Ads"]), ["Sales", "Ads"]);
  assert.deepEqual(filters.normalizeCategoryFilter(["a", "b", "c", "d", "e"]), ["a", "b", "c", "d"]);
});

test("saved searches and custom views round-trip a combination and compare without order sensitivity", () => {
  const selected = ["Sales", "Ads"];
  const snapshot = captureFilterState({ catFilter: selected, search: "funnel", view: "link" });
  assert.deepEqual(expandFilterState(JSON.parse(JSON.stringify(snapshot))).catFilter, selected);
  const base = filters.defaultSavedViewFilters();
  const view = filters.createCustomSavedView("Commercial", { ...base, catFilter: selected }, [], () => "test");
  const restored = filters.normalizeCustomSavedViews(JSON.parse(JSON.stringify([view])))[0];
  assert.deepEqual(restored.filters.catFilter, selected);
  assert.ok(filters.savedViewFiltersEqual(restored.filters, { ...base, catFilter: ["Ads", "Sales"] }));
  assert.equal(filters.inferSavedViewKey(restored.filters), null);
});
