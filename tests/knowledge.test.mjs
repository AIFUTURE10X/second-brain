import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildNextTaskOccurrence, isRecurrence, nextOccurrence, recurrenceLabel } from "../lib/recurrence.mjs";
import { collectWikiLinkTitles, extractWikiLinks } from "../lib/wiki-links.mjs";
import { applyTemplateToForm, buildTemplateFromForm, normalizeCardTemplates } from "../lib/card-templates.mjs";
import { buildSnoozeKeyboard, parseSnoozeCallback, SNOOZE_OPTIONS } from "../lib/reminder-snooze.mjs";
import { normalizeReminderInput } from "../lib/reminders.mjs";

const itemsRouteSource = await readFile(new URL("../app/api/items/route.ts", import.meta.url), "utf8");
const telegramSource = await readFile(new URL("../app/api/telegram/route.ts", import.meta.url), "utf8");
const cronSource = await readFile(new URL("../app/api/cron/reminders/route.ts", import.meta.url), "utf8");

// ── Backlinks / [[wiki]] (2.2) ───────────────────────────────────────────────

test("wiki links parse uniquely and across card fields", () => {
  assert.deepEqual(extractWikiLinks("See [[Agentic OS]] and [[agentic os]] plus [[Vault]]"), ["Agentic OS", "Vault"]);
  assert.deepEqual(extractWikiLinks("no links here [[]]"), []);
  assert.deepEqual(
    collectWikiLinkTitles({
      content: "Links to [[Roadmap]]",
      notes: "and [[Vault]]",
      noteEntries: [{ body: "again [[roadmap]] and [[Telegram Bot]]" }],
    }),
    ["Roadmap", "Vault", "Telegram Bot"]
  );
});

test("items routes sync wiki relations post-response", () => {
  assert.match(itemsRouteSource, /syncWikiRelations/);
  assert.match(telegramSource, /syncWikiRelations/);
});

// ── Recurring tasks (2.11) ───────────────────────────────────────────────────

test("recurrence presets advance dates correctly", () => {
  assert.equal(isRecurrence("weekly"), true);
  assert.equal(isRecurrence("yearly"), false);
  assert.equal(recurrenceLabel("daily"), "↻ daily");
  assert.equal(nextOccurrence("2026-06-10T09:00:00Z", "daily").toISOString(), "2026-06-11T09:00:00.000Z");
  assert.equal(nextOccurrence("2026-06-10T09:00:00Z", "weekly").toISOString(), "2026-06-17T09:00:00.000Z");
  // Monthly clamps: Jan 31 → Feb 28.
  const clamped = nextOccurrence(new Date(2026, 0, 31, 12), "monthly");
  assert.equal(clamped.getMonth(), 1);
  assert.equal(clamped.getDate(), 28);
  assert.equal(nextOccurrence("garbage", "daily"), null);
  assert.equal(nextOccurrence("2026-06-10", "yearly"), null);
});

test("completing a recurring task builds a fresh open occurrence", () => {
  const next = buildNextTaskOccurrence({
    type: "task",
    title: "Water plants",
    recurrence: "weekly",
    tags: ["home"],
    category: "Chores",
    pinned: true,
    checklistItems: [{ id: "1", text: "balcony", completed: true, completedAt: "x" }],
  });
  assert.equal(next.completed, false);
  assert.equal(next.pinned, false);
  assert.equal(next.recurrence, "weekly");
  assert.deepEqual(next.checklistItems, [{ id: "1", text: "balcony", completed: false, completedAt: null }]);
  assert.equal(buildNextTaskOccurrence({ type: "task", recurrence: null }), null);
  assert.equal(buildNextTaskOccurrence({ type: "note", recurrence: "daily" }), null);
});

test("task completion transitions spawn the next occurrence server-side", () => {
  assert.match(itemsRouteSource, /spawnNextTaskOccurrence/);
  assert.match(itemsRouteSource, /row\.completed && !current\.completed/);
  assert.match(telegramSource, /spawnNextTaskOccurrence/);
});

// ── Card templates (2.10) ────────────────────────────────────────────────────

test("templates round-trip from form capture to form prefill", () => {
  const template = buildTemplateFromForm("Weekly review", {
    type: "task",
    tags: "review, weekly",
    category: "Rituals",
    content: "Review the week",
    recurrence: "weekly",
    checklistItems: [{ text: "inbox zero" }, { text: " journal " }, { text: "" }],
  });
  assert.equal(template.name, "Weekly review");
  assert.deepEqual(template.tags, ["review", "weekly"]);
  assert.deepEqual(template.checklist, ["inbox zero", "journal"]);

  let n = 0;
  const form = applyTemplateToForm(
    { type: "note", title: "keep me", tags: "", category: "", content: "", recurrence: "", checklistItems: [] },
    template,
    () => `row-${n++}`
  );
  assert.equal(form.type, "task");
  assert.equal(form.title, "keep me");
  assert.equal(form.tags, "review, weekly");
  assert.equal(form.recurrence, "weekly");
  assert.deepEqual(form.checklistItems.map(r => r.id), ["row-0", "row-1"]);

  assert.equal(buildTemplateFromForm("  ", {}), null);
  assert.deepEqual(normalizeCardTemplates("junk"), []);
  assert.equal(normalizeCardTemplates([{ id: "a", name: " T ", type: "bogus" }])[0].type, "note");
});

// ── Reminder snooze + recurring (2.8) ────────────────────────────────────────

test("snooze keyboard and callback data round-trip", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const keyboard = buildSnoozeKeyboard(id);
  assert.equal(keyboard.inline_keyboard[0].length, SNOOZE_OPTIONS.length);
  const parsed = parseSnoozeCallback(keyboard.inline_keyboard[0][2].callback_data);
  assert.equal(parsed.reminderId, id);
  assert.equal(parsed.ms, 24 * 60 * 60 * 1000);
  assert.equal(parseSnoozeCallback("snooze:not-a-uuid:1h"), null);
  assert.equal(parseSnoozeCallback(`snooze:${id}:2w`), null);
  assert.equal(parseSnoozeCallback("something else"), null);
});

test("reminder input accepts a recurrence preset", () => {
  const input = normalizeReminderInput({ itemId: "i", dueAt: "2026-06-10T09:00:00Z", recurrence: "weekly" });
  assert.equal(input.recurrence, "weekly");
  assert.equal(normalizeReminderInput({ itemId: "i", dueAt: "2026-06-10" }).recurrence, null);
  assert.equal(normalizeReminderInput({ itemId: "i", dueAt: "2026-06-10", recurrence: "yearly" }).recurrence, null);
});

test("cron honours snoozes, attaches snooze buttons, and advances recurring reminders", () => {
  assert.match(cronSource, /snoozedUntil/);
  assert.match(cronSource, /buildSnoozeKeyboard/);
  assert.match(cronSource, /nextOccurrence/);
  assert.match(cronSource, /status: "sent"/);
  assert.match(telegramSource, /handleCallbackQuery/);
  assert.match(telegramSource, /parseSnoozeCallback/);
});
