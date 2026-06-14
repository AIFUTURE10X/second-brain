import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
// Card markup moved to ItemCard.tsx in the PLAN.md 1.4 extraction.
const cardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");
const quickCaptureSource = await readFile(new URL("../components/brain/QuickCaptureBar.tsx", import.meta.url), "utf8");

test("compact cards use a denser shell with wide thumbnails", () => {
  assert.match(cardSource, /min-h-\[13rem\]/);
  assert.match(cardSource, /aspect-video/);
  assert.match(cardSource, /object-cover object-center/);
  assert.doesNotMatch(cardSource, /aspect-square/);
  assert.doesNotMatch(cardSource, /min-h-\[17rem\]/);
  assert.doesNotMatch(cardSource, /aspect-\[5\/4\]/);
  assert.doesNotMatch(cardSource, /className="relative block w-full h-20 bg-brand-muted overflow-hidden group"/);
});

test("compact local-file cards expose their saved source link", () => {
  assert.match(cardSource, /item\.url\?\.startsWith\("file:"\) && isCompact/);
  assert.match(cardSource, /formatCardLinkLabel\(item\.url\)/);
});

test("compact grid uses auto-fit fixed-width columns instead of a hard four-column ceiling", () => {
  assert.match(brainSource, /repeat\(auto-fill,minmax\(min\(100%,13rem\),1fr\)\)/);
  assert.match(brainSource, /min-\[1800px\]:grid-cols-\[repeat\(auto-fill,minmax\(min\(100%,11rem\),1fr\)\)\]/);
  assert.doesNotMatch(brainSource, /grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2/);
});

test("list view is the default and uses a responsive compact card grid", () => {
  assert.match(brainSource, /useState<ViewMode>\("list"\)/);
  assert.match(brainSource, /density === "list" \? "grid items-start grid-cols-\[repeat\(auto-fill,minmax\(min\(100%,12rem\),1fr\)\)\] min-\[1500px\]:grid-cols-\[repeat\(auto-fill,minmax\(min\(100%,9rem\),1fr\)\)\] min-\[1800px\]:grid-cols-\[repeat\(auto-fill,minmax\(min\(100%,8\.5rem\),1fr\)\)\] gap-2 min-\[1800px\]:gap-1\.5 px-4 min-\[1800px\]:px-3"/);
  assert.doesNotMatch(brainSource, /mx-auto flex w-full max-w-\[72rem\] flex-col/);
  assert.doesNotMatch(brainSource, /useState<ViewMode>\("comfortable"\)/);
});

test("list cards render as short scan tiles instead of tall mini cards", () => {
  assert.match(cardSource, /const listCardClass = isList \? "h-\[8rem\] min-\[1500px\]:h-\[7\.5rem\] flex flex-col" : "";/);
  assert.match(cardSource, /\$\{listCardClass\}/);
  assert.match(cardSource, /const listPreviewStripClass = "relative block h-9 w-full shrink-0 overflow-hidden bg-brand-muted"/);
  assert.match(cardSource, /const listBodyClass = "flex min-h-0 flex-1 flex-col justify-between px-2 py-1\.5"/);
  assert.match(cardSource, /data-list-card={isList \? "true" : undefined}/);
  assert.match(cardSource, /className="h-full w-full object-cover object-center"/);
  assert.match(cardSource, /slice\(0, 1\)\.map\(\(tag, ti\)/);
  assert.doesNotMatch(cardSource, /isList \? "h-full overflow-hidden px-2 py-1\.5"/);
  assert.doesNotMatch(cardSource, /hasPreview && isList && \(/);
});

test("expanded cards widen across the grid instead of growing as skinny columns", () => {
  assert.match(cardSource, /const expandedCardClass = expanded \? \(hasPreview \?/);
  assert.match(cardSource, /col-span-full lg:grid lg:grid-cols-\[minmax\(17rem,24rem\)_minmax\(0,1fr\)\]/);
  assert.match(cardSource, /const expandedBodyClass = "min-h-0 max-h-\[calc\(100vh-12rem\)\] overflow-y-auto p-4 lg:p-5"/);
  assert.match(cardSource, /const previewClass = expanded/);
});

test("wide desktop density tightens the header, capture bar, and filter controls", () => {
  assert.match(brainSource, /min-\[1800px\]:px-3/);
  assert.match(brainSource, /min-\[1800px\]:pt-2/);
  assert.match(brainSource, /const headerIconButtonClass = "w-11 h-11 sm:w-10 sm:h-10 min-\[1800px\]:h-9 min-\[1800px\]:w-9/);
  assert.match(quickCaptureSource, /min-\[1800px\]:min-h-\[36px\]/);
  assert.match(quickCaptureSource, /min-\[1800px\]:text-xs/);
});

test("grid helper rows span list and compact layouts", () => {
  assert.match(brainSource, /const gridFullSpanClass = density === "list" \|\| density === "compact" \? "col-span-full" : "";/);
  assert.equal(brainSource.includes('${density === "compact" ? "col-span-full" : ""}'), false);
});

// Filter dropdowns moved to FilterBar.tsx in the PLAN.md 1.6 redesign.
const filterBarSource = await readFile(new URL("../components/brain/FilterBar.tsx", import.meta.url), "utf8");

test("category and source filters use dense wrap dropdowns inside the filter bar", () => {
  assert.match(filterBarSource, /placeholder="Search categories…"/);
  assert.match(filterBarSource, /placeholder="Search sources…"/);
  assert.match(filterBarSource, /data-filter-bar/);
  assert.match(filterBarSource, /flex flex-wrap gap-1\.5/);
  assert.doesNotMatch(brainSource, /data-category-menu/);
  assert.doesNotMatch(brainSource, /data-source-menu/);
  assert.doesNotMatch(brainSource, /data-tag-menu/);
  assert.doesNotMatch(brainSource, /grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(brainSource, /grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4/);
});

test("category dropdown chips match saved-view chip sizing", () => {
  assert.match(filterBarSource, /const menuChipClass = "inline-flex h-\[30px\] max-w-\[11rem\] shrink-0 items-center gap-1\.5 overflow-hidden whitespace-nowrap rounded-lg border px-3 text-left font-mono text-xs font-medium leading-none transition-all"/);
  assert.match(filterBarSource, /const childMenuChipClass = menuChipClass\.replace\("max-w-\[11rem\]", "max-w-\[10rem\]"\);/);
  assert.match(filterBarSource, /className=\{menuChipClass\}/);
  assert.match(filterBarSource, /className=\{childMenuChipClass\}/);
  assert.doesNotMatch(filterBarSource, /inline-flex max-w-full flex-col gap-1/);
  assert.doesNotMatch(filterBarSource, /flex max-w-full flex-wrap gap-1\.5 pl-2/);
  assert.doesNotMatch(filterBarSource, /rounded-lg border px-2\.5 py-1\.5 text-left transition/);
  assert.doesNotMatch(filterBarSource, /rounded-lg border px-2\.5 py-1 text-\[10px\]/);
});

test("filter controls shrink on wide desktop screens", () => {
  assert.match(filterBarSource, /min-\[1800px\]:min-h-\[34px\]/);
  assert.match(filterBarSource, /min-\[1800px\]:text-\[11px\]/);
  assert.match(filterBarSource, /min-\[1800px\]:py-1/);
});

test("active filter chips use compact rounded rectangles instead of oversized pills", () => {
  assert.match(brainSource, /rounded-lg text-\[11px\] font-mono transition/);
  assert.doesNotMatch(brainSource, /className="px-2\.5 py-0\.5 rounded-full text-\[11px\] font-mono transition whitespace-nowrap"/);
});
