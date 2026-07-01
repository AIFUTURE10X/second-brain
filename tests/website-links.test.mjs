import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

// card-links.ts has no external deps → load from the OS tmpdir.
async function loadTmpModule(relativePath, prefix) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const file = path.join(dir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  await writeFile(file, transpile(source));
  return import(pathToFileURL(file).href);
}

const { ensureWebsiteLinkUrl } = await loadTmpModule("../lib/card-links.ts", "second-brain-website-links-");

// validation.ts imports "zod" → transpile into the repo so the bare import resolves.
const here = path.dirname(fileURLToPath(import.meta.url));
const validationSrc = await readFile(path.join(here, "..", "lib", "validation.ts"), "utf8");
const validationDir = path.join(here, ".tmp");
await mkdir(validationDir, { recursive: true });
const validationModule = path.join(validationDir, `website-links-validation-${process.pid}.mjs`);
await writeFile(validationModule, transpile(validationSrc));
const v = await import(pathToFileURL(validationModule).href);

after(async () => {
  await rm(validationModule, { force: true });
});

test("ensureWebsiteLinkUrl defaults a bare host to https://", () => {
  assert.equal(ensureWebsiteLinkUrl("example.com"), "https://example.com");
  assert.equal(ensureWebsiteLinkUrl("example.com/path?q=1"), "https://example.com/path?q=1");
  assert.equal(ensureWebsiteLinkUrl("localhost:3000"), "https://localhost:3000");
});

test("ensureWebsiteLinkUrl leaves scheme-qualified urls untouched", () => {
  assert.equal(ensureWebsiteLinkUrl("http://example.com"), "http://example.com");
  assert.equal(ensureWebsiteLinkUrl("https://example.com"), "https://example.com");
  assert.equal(ensureWebsiteLinkUrl("file:///C:/docs/page.html"), "file:///C:/docs/page.html");
  assert.equal(ensureWebsiteLinkUrl("mailto:me@example.com"), "mailto:me@example.com");
});

test("ensureWebsiteLinkUrl trims and returns empty for blank input", () => {
  assert.equal(ensureWebsiteLinkUrl("  "), "");
  assert.equal(ensureWebsiteLinkUrl("  example.com  "), "https://example.com");
});

test("itemCreateSchema accepts a websiteLinks array", () => {
  const parsed = v.itemCreateSchema.safeParse({
    type: "note",
    title: "Card with links",
    websiteLinks: [
      { url: "https://example.com", label: "Homepage" },
      { url: "https://docs.example.com", label: "" },
    ],
  });
  assert.equal(parsed.success, true);
});

test("itemUpdateSchema rejects malformed websiteLinks entries", () => {
  assert.equal(
    v.itemUpdateSchema.safeParse({ id: "x", websiteLinks: [{ label: "no url" }] }).success,
    false,
  );
  assert.equal(
    v.itemUpdateSchema.safeParse({ id: "x", websiteLinks: [{ url: "https://ok.example", label: "ok" }] }).success,
    true,
  );
});
