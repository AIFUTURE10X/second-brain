import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "sb-url-title-"));
  const tempModule = path.join(tempDir, "module.mjs");
  await writeFile(tempModule, source.replace(/: string/g, ""));
  return import(pathToFileURL(tempModule).href);
}

const urlTitle = await importTsModule("../lib/url-title.ts");
const itemsRouteSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const saveRouteSource = await readFile(new URL("../app/api/save/route.ts", import.meta.url), "utf8");

test("fallbackTitleFromUrl uses the hostname when page metadata is missing", () => {
  assert.equal(urlTitle.fallbackTitleFromUrl("https://www.namecheap.com/"), "namecheap.com");
  assert.equal(urlTitle.fallbackTitleFromUrl("https://chatgpt.com/g/g-abc123/settings"), "Settings - chatgpt.com");
});

test("fallbackTitleFromUrl ignores invalid or unsupported URLs", () => {
  assert.equal(urlTitle.fallbackTitleFromUrl("not a url"), "");
  assert.equal(urlTitle.fallbackTitleFromUrl("mailto:test@example.com"), "");
});

test("item and automation save endpoints use URL fallback titles", () => {
  assert.match(itemsRouteSource, /import \{ fallbackTitleFromUrl \} from "@\/lib\/url-title"/);
  assert.match(itemsRouteSource, /const fallbackTitle = fallbackTitleFromUrl\(url\);/);
  assert.match(itemsRouteSource, /body\.title \|\| og\.ogTitle \|\| fallbackTitle \|\| ""/);
  assert.match(saveRouteSource, /import \{ fallbackTitleFromUrl \} from "@\/lib\/url-title"/);
  assert.match(saveRouteSource, /const fallbackTitle = fallbackTitleFromUrl\(url\);/);
  assert.match(saveRouteSource, /title \|\| og\.ogTitle \|\| fallbackTitle \|\| ""/);
});
