import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cardSource = await readFile(new URL("../components/brain/ItemCard.tsx", import.meta.url), "utf8");

test("expanded cards render a dedicated Links block", () => {
  assert.match(cardSource, /text-\[10px\] text-gray-600 font-mono mb-1\.5">Links</);
  assert.match(cardSource, /extractCardLinks\(item\)/);
});
