import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");

test("expanded cards render a dedicated Links block", () => {
  assert.match(brainSource, /text-\[10px\] text-gray-600 font-mono mb-1\.5">Links</);
  assert.match(brainSource, /extractCardLinks\(item\)/);
});
