import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const boardSource = await readFile(new URL("../components/brain/BoardView.tsx", import.meta.url), "utf8").catch(() => "");

test("Brain renders a dedicated board view mode", () => {
  assert.match(brainSource, /import \{ BoardView \} from "\.\/brain\/BoardView"/);
  assert.match(brainSource, /density === "board"/);
  assert.match(brainSource, /<BoardView/);
  assert.match(brainSource, /items={visibleItems}/);
  assert.match(brainSource, /categoryNames={categories\.map\(cat => cat\.name\)}/);
  assert.match(brainSource, /selectedIds={selectedIds}/);
});

test("BoardView groups cards into category columns", () => {
  assert.match(boardSource, /interface BoardViewProps/);
  assert.match(boardSource, /categoryNames: string\[\]/);
  assert.match(boardSource, /const groupedItems = columnNames\.map/);
  assert.match(boardSource, /Uncategorized/);
  assert.match(boardSource, /onToggleSelected\(item\.id\)/);
  assert.match(boardSource, /onOpenCard\(item\.id\)/);
  assert.match(boardSource, /onToggleFlag\(item\.id, "actionRequired"\)/);
});

test("BoardView wraps category columns instead of requiring bottom horizontal scroll", () => {
  assert.match(boardSource, /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,16rem\),1fr\)\)\]/);
  assert.match(boardSource, /items-start/);
  assert.match(boardSource, /max-h-\[calc\(100vh-17rem\)\]/);
  assert.match(boardSource, /overflow-y-auto/);
  assert.doesNotMatch(boardSource, /overflow-x-auto/);
  assert.doesNotMatch(boardSource, /flex min-h-\[24rem\] gap-3/);
  assert.doesNotMatch(boardSource, /w-\[18rem\] shrink-0/);
});
