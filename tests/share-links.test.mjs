import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/outbound-share-links.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-share-links-"));
const tempModule = path.join(tempDir, "share-links.mjs");
await writeFile(tempModule, transpiled);
const shareLinks = await import(pathToFileURL(tempModule).href);

const item = {
  title: "Buy a domain name - Namecheap",
  ogTitle: "Namecheap",
  content: "Register cheap domain names from $0.99",
  url: "https://www.namecheap.com/",
  category: "Businesses",
  tags: ["domain registration", "web hosting"],
};

test("buildCardShareText includes title, excerpt, source url, category, and tags", () => {
  const text = shareLinks.buildCardShareText(item);
  assert.match(text, /Buy a domain name - Namecheap/);
  assert.match(text, /Register cheap domain names from \$0\.99/);
  assert.match(text, /https:\/\/www\.namecheap\.com\//);
  assert.match(text, /Category: Businesses/);
  assert.match(text, /Tags: domain registration, web hosting/);
});

test("buildCardShareLinks creates Gmail, WhatsApp, and Telegram targets", () => {
  const links = shareLinks.buildCardShareLinks(item);
  assert.match(links.email, /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&su=Buy%20a%20domain/);
  assert.match(links.email, /&body=/);
  assert.match(links.whatsapp, /^https:\/\/wa\.me\/\?text=/);
  assert.match(links.telegram, /^https:\/\/t\.me\/share\/url\?url=https%3A%2F%2Fwww\.namecheap\.com%2F&text=/);
});
