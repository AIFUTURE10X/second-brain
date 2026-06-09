import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../lib/linkify.ts", import.meta.url);
const source = (await readFile(sourcePath, "utf8")).replace('from "./card-links"', 'from "./card-links.mjs"');
const cardLinksSource = await readFile(new URL("../lib/card-links.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const transpiledCardLinks = ts.transpileModule(cardLinksSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-linkify-"));
const tempModule = path.join(tempDir, "linkify.mjs");
const tempCardLinksModule = path.join(tempDir, "card-links.mjs");
await writeFile(tempCardLinksModule, transpiledCardLinks);
await writeFile(tempModule, transpiled);
const linkify = await import(pathToFileURL(tempModule).href);

test("linkifyText turns pasted note URLs into link segments", () => {
  assert.deepEqual(
    linkify.linkifyText("URL: https://accounts.hetzner.com Client number: K051"),
    [
      { type: "text", text: "URL: " },
      { type: "link", text: "accounts.hetzner.com", href: "https://accounts.hetzner.com" },
      { type: "text", text: " Client number: K051" },
    ],
  );
});

test("linkifyText leaves trailing punctuation outside the link", () => {
  assert.deepEqual(
    linkify.linkifyText("Cloud URL: https://console.hetzner.com."),
    [
      { type: "text", text: "Cloud URL: " },
      { type: "link", text: "console.hetzner.com", href: "https://console.hetzner.com" },
      { type: "text", text: "." },
    ],
  );
});

test("linkifyText unwraps redirect links and uses a short label", () => {
  assert.deepEqual(
    linkify.linkifyText("Official app: https://www.youtube.com/redirect?event=video_description&q=https%3A%2F%2Fapp.example.com%2Fdownload&redir_token=abc"),
    [
      { type: "text", text: "Official app: " },
      { type: "link", text: "app.example.com/download", href: "https://app.example.com/download" },
    ],
  );
});
