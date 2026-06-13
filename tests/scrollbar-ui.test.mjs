import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globalsCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("global visible scrollbars use the dark app theme", () => {
  assert.match(globalsCss, /color-scheme:\s*dark/);
  assert.match(globalsCss, /scrollbar-color:\s*#898989 #0D0F12/);
  assert.match(globalsCss, /\*::-webkit-scrollbar-track/);
  assert.match(globalsCss, /\*::-webkit-scrollbar-thumb/);
  assert.match(globalsCss, /background:\s*#898989/);
  assert.match(globalsCss, /background:\s*#A3A3A3/);
  assert.match(globalsCss, /\*::-webkit-scrollbar-button/);
  assert.match(globalsCss, /\*::-webkit-scrollbar-corner/);
});
