import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadTsModule(relativePath, prefix) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const tempDir = await mkdtemp(path.join(tmpdir(), prefix));
  const tempModule = path.join(tempDir, path.basename(relativePath).replace(/\.ts$/, ".mjs"));
  await writeFile(tempModule, transpiled);
  return import(pathToFileURL(tempModule).href);
}

const savedViews = await loadTsModule("../lib/saved-views.ts", "second-brain-custom-saved-views-");

test("custom saved views have a stable settings key", () => {
  assert.equal(savedViews.CUSTOM_SAVED_VIEWS_KEY, "custom_saved_views");
});

test("custom saved views normalize persisted settings safely", () => {
  const views = savedViews.normalizeCustomSavedViews([
    {
      id: "saved-1",
      label: "Domains",
      color: "#5B8DEF",
      filters: {
        ...savedViews.filtersForSavedView("all"),
        search: "domain",
        catFilter: "Business",
        tagFilter: "domain registration",
      },
    },
    { id: "", label: "", filters: {} },
    null,
  ]);

  assert.deepEqual(views, [
    {
      id: "saved-1",
      label: "Domains",
      title: "Custom view: Domains",
      color: "#5B8DEF",
      filters: {
        ...savedViews.filtersForSavedView("all"),
        search: "domain",
        catFilter: "Business",
        tagFilter: "domain registration",
      },
    },
  ]);
});

test("custom saved view drafts trim labels, assign a color, and preserve filters", () => {
  const filters = {
    ...savedViews.filtersForSavedView("all"),
    search: "namecheap",
    inboxOnly: true,
  };
  const draft = savedViews.createCustomSavedView("  Namecheap follow-up  ", filters, [], () => "view-1");

  assert.deepEqual(draft, {
    id: "view-1",
    label: "Namecheap follow-up",
    title: "Custom view: Namecheap follow-up",
    color: "#5B8DEF",
    filters,
  });
});
