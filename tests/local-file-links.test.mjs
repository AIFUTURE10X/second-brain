import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const source = await readFile(new URL("../lib/local-file-links.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const tempDir = await mkdtemp(path.join(tmpdir(), "second-brain-local-file-links-"));
const tempModule = path.join(tempDir, "local-file-links.mjs");
await writeFile(tempModule, transpiled);
const localFileLinks = await import(pathToFileURL(tempModule).href);

test("localFileViewerHref routes file URLs through the app viewer", () => {
  const fileUrl = "file:///C:/Projects/Second%20Brain/docs/second-brain-feature-guide.html";

  assert.equal(
    localFileLinks.localFileViewerHref(fileUrl),
    `/api/local-file?url=${encodeURIComponent(fileUrl)}`,
  );
  assert.equal(localFileLinks.localFileViewerHref("https://example.com"), "https://example.com");
});

test("localFilePathFromUrl decodes Windows file URLs", () => {
  assert.equal(
    localFileLinks.localFilePathFromUrl("file:///C:/Projects/Second%20Brain/docs/guide.html"),
    "C:/Projects/Second Brain/docs/guide.html",
  );
  assert.equal(localFileLinks.localFilePathFromUrl("https://example.com"), null);
});

test("isPathInsideRoot rejects sibling paths", () => {
  assert.equal(localFileLinks.isPathInsideRoot("C:/Projects/Second Brain/docs/guide.html", "C:/Projects/Second Brain"), true);
  assert.equal(localFileLinks.isPathInsideRoot("C:/Projects/Second Brain Secrets/secret.html", "C:/Projects/Second Brain"), false);
});

test("localFileContentType covers html, markdown, text, and fallback files", () => {
  assert.equal(localFileLinks.localFileContentType("guide.html"), "text/html; charset=utf-8");
  assert.equal(localFileLinks.localFileContentType("guide.md"), "text/markdown; charset=utf-8");
  assert.equal(localFileLinks.localFileContentType("guide.txt"), "text/plain; charset=utf-8");
  assert.equal(localFileLinks.localFileContentType("archive.bin"), "application/octet-stream");
});
