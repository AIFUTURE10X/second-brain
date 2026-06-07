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
