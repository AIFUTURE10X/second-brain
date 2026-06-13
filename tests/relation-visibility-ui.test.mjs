import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const itemCardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");
const tableSource = await readFile(new URL("../components/brain/TableView.tsx", import.meta.url), "utf8");
const boardSource = await readFile(new URL("../components/brain/BoardView.tsx", import.meta.url), "utf8");

test("Brain computes relation counts once and passes them to browsing surfaces", () => {
  assert.match(brainSource, /getRelationCountsByItemId/);
  assert.match(brainSource, /const relationCountsByItemId = getRelationCountsByItemId\(relations\)/);
  assert.match(brainSource, /relationCounts=\{relationCountsByItemId\}/);
  assert.match(brainSource, /relationCount=\{relationCountsByItemId\.get\(item\.id\) \|\| 0\}/);
});

test("card, table, and board views expose relation counts", () => {
  assert.match(itemCardSource, /relationCount: number/);
  assert.match(itemCardSource, /relationCount > 0/);
  assert.match(itemCardSource, /Related/);
  assert.match(tableSource, /relationCounts: Map<string, number>/);
  assert.match(tableSource, /relationCounts\.get\(item\.id\) \|\| 0/);
  assert.match(boardSource, /relationCounts: Map<string, number>/);
  assert.match(boardSource, /relationCounts\.get\(item\.id\) \|\| 0/);
});
