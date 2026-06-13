import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const brainSource = await readFile(new URL("../components/Brain.tsx", import.meta.url), "utf8");
const pickerSource = await readFile(new URL("../components/brain/ViewModePicker.tsx", import.meta.url), "utf8");

test("Brain uses a direct view picker instead of cycling through modes", () => {
  assert.match(brainSource, /import \{ ViewModePicker \} from "\.\/brain\/ViewModePicker"/);
  assert.match(brainSource, /<ViewModePicker\s+density={density}\s+onDensityChange={setDensity}/);
  assert.doesNotMatch(brainSource, /onClick=\{\(\) => setDensity\(nextViewMode\)\}/);
});

test("Brain places the view chips in the header actions next to Telegram", () => {
  const telegramIndex = brainSource.indexOf("<TelegramHelpMenu");
  const viewChipsIndex = brainSource.indexOf("<ViewModePicker");
  const quickCaptureIndex = brainSource.indexOf("<QuickCaptureBar");

  assert.ok(telegramIndex > -1, "Telegram menu should render in the header");
  assert.ok(viewChipsIndex > telegramIndex, "view chips should render after the Telegram menu");
  assert.ok(viewChipsIndex < quickCaptureIndex, "view chips should stay in the header above quick capture");
});

test("ViewModePicker exposes all view modes as compact chips", () => {
  assert.match(pickerSource, /VIEW_MODE_OPTIONS/);
  assert.match(pickerSource, /data-view-mode-chips/);
  assert.match(pickerSource, /role="tablist"/);
  assert.match(pickerSource, /grid grid-cols-4 gap-1\.5/);
  assert.match(pickerSource, /onDensityChange\(option\.mode\)/);
  assert.doesNotMatch(pickerSource, /role="menu"/);
  assert.doesNotMatch(pickerSource, /useState/);
});
