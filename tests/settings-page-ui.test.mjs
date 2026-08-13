import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");

const pageSource = await read("app/settings/page.tsx");
const shellSource = await read("components/settings/SettingsShell.tsx");
const sectionsSource = await read("components/settings/settings-sections.ts");
const brainSource = await read("components/Brain.tsx");
const categorySource = await read("components/settings/CategorySettings.tsx");
const tagSource = await read("components/settings/TagSettings.tsx");
const templateSource = await read("components/settings/TemplateSettings.tsx");
const integrationSource = await read("components/settings/IntegrationSettings.tsx");
const dataSource = await read("components/settings/DataSettings.tsx");
const generalSource = await read("components/settings/GeneralSettings.tsx");

test("/settings renders the shell on demand, with an error boundary and toasts", () => {
  assert.match(pageSource, /export const dynamic = "force-dynamic"/);
  assert.match(pageSource, /<SettingsShell \/>/);
  assert.match(pageSource, /<ErrorBoundary>/);
  assert.match(pageSource, /<ToastContainer \/>/);
  assert.match(shellSource, /"use client"/);
});

test("all six sections are registered and deep-linkable", () => {
  for (const key of ["general", "categories", "tags", "templates", "integrations", "data"]) {
    assert.ok(sectionsSource.includes(`key: "${key}"`), `missing section ${key}`);
  }
  assert.match(sectionsSource, /DEFAULT_SETTINGS_SECTION: SettingsSectionKey = "general"/);
  assert.match(shellSource, /searchParams\.get\("section"\)/);
  assert.match(shellSource, /router\.replace\(/);
});

test("the shell keeps the tablist pattern and a back link, both viewports", () => {
  assert.match(shellSource, /role="tablist"/);
  assert.match(shellSource, /role="tab"/);
  assert.match(shellSource, /aria-selected=\{isActive\}/);
  assert.match(shellSource, /min-h-\[44px\]/);
  assert.match(shellSource, /md:hidden/);           // mobile tab strip
  assert.match(shellSource, /hidden w-52 shrink-0 flex-col gap-1\.5 md:flex/); // desktop rail
  assert.match(shellSource, /href="\/"/);
});

test("the managers moved out of Brain and into the settings sections", () => {
  // Brain no longer owns the category / tag sheets or the export button.
  assert.doesNotMatch(brainSource, /showCatManager|showTagManager|handleExport|toggleDesktopNotify/);
  assert.doesNotMatch(brainSource, /Category Manager Modal|Tag Manager Modal/);
  assert.match(brainSource, /href="\/settings"/);
  assert.match(brainSource, /router\.push\("\/settings\?section=tags"\)/);

  // …and the sections own them now.
  assert.match(categorySource, /\/api\/categories/);
  assert.match(categorySource, /sb_custom_cat_colors/);
  assert.match(categorySource, /key: CUSTOM_COLORS_SETTINGS_KEY/);
  assert.match(tagSource, /\/api\/tags\/merge/);
  assert.match(dataSource, /\/api\/export\?format=/);
  assert.match(dataSource, /\/api\/import/);
});

test("templates section reads and writes the card_templates settings key", () => {
  assert.match(templateSource, /CARD_TEMPLATES_SETTINGS_KEY/);
  assert.match(templateSource, /normalizeCardTemplates/);
  assert.match(templateSource, /MAX_CARD_TEMPLATES/);
  for (const field of ["name", "type", "tags", "category", "content", "checklist", "recurrence"]) {
    assert.ok(templateSource.includes(`${field}:`), `template draft is missing ${field}`);
  }
});

test("integrations documents the capture API without leaking the secret", () => {
  assert.match(integrationSource, /MEMORY_OF_WEEK_ENABLED_KEY/);
  assert.match(integrationSource, /\/api\/ingest/);
  assert.match(integrationSource, /\/api\/save/);
  assert.match(integrationSource, /x-api-key/);
  assert.doesNotMatch(integrationSource, /process\.env\.API_SECRET/);
});

test("general section owns the notification and density preferences", () => {
  assert.match(generalSource, /NOTIFY_TOGGLE_STORAGE_KEY/);
  assert.match(generalSource, /ensureNotificationPermission/);
  assert.match(generalSource, /sb_density/);
  assert.match(generalSource, /<ViewModePicker/);
});
