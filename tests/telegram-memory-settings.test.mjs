import assert from "node:assert/strict";
import test from "node:test";

import {
  isMemoryOfWeekEnabled,
  parseMemoryToggleCommand,
} from "../lib/telegram-memory-settings.mjs";

test("parseMemoryToggleCommand handles explicit Telegram memory on and off commands", () => {
  assert.deepEqual(parseMemoryToggleCommand("/memories_off"), { action: "off" });
  assert.deepEqual(parseMemoryToggleCommand("/memory_off"), { action: "off" });
  assert.deepEqual(parseMemoryToggleCommand("/memories_on"), { action: "on" });
  assert.deepEqual(parseMemoryToggleCommand("/memory_on"), { action: "on" });
});

test("parseMemoryToggleCommand handles status commands and ignores saved-memory commands", () => {
  assert.deepEqual(parseMemoryToggleCommand("/memories"), { action: "status" });
  assert.equal(parseMemoryToggleCommand("/m remember this forever"), null);
  assert.equal(parseMemoryToggleCommand("plain note"), null);
});

test("isMemoryOfWeekEnabled defaults on unless the setting is explicitly false", () => {
  assert.equal(isMemoryOfWeekEnabled(undefined), true);
  assert.equal(isMemoryOfWeekEnabled(true), true);
  assert.equal(isMemoryOfWeekEnabled(false), false);
  assert.equal(isMemoryOfWeekEnabled({ enabled: false }), false);
  assert.equal(isMemoryOfWeekEnabled({ enabled: true }), true);
});
