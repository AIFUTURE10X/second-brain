import assert from "node:assert/strict";
import test from "node:test";

import {
  duePendingReminders,
  formatReminderTelegramMessage,
  mergeReminderDateTimeParts,
  normalizeReminderInput,
  splitReminderDateTime,
} from "../lib/reminders.mjs";

test("normalizeReminderInput trims message and rejects invalid due dates", () => {
  assert.deepEqual(normalizeReminderInput({
    itemId: " item-1 ",
    message: "  Cancel before renewal  ",
    dueAt: "2026-05-15T09:00:00.000Z",
  }), {
    itemId: "item-1",
    message: "Cancel before renewal",
    dueAt: "2026-05-15T09:00:00.000Z",
    recurrence: null,
  });

  assert.throws(
    () => normalizeReminderInput({ itemId: "item-1", dueAt: "not-a-date" }),
    /Valid dueAt is required/
  );
});

test("duePendingReminders returns only pending reminders due at or before now", () => {
  const now = new Date("2026-05-15T09:00:00.000Z");
  const rows = [
    { id: "due", status: "pending", dueAt: "2026-05-15T08:59:00.000Z" },
    { id: "now", status: "pending", dueAt: "2026-05-15T09:00:00.000Z" },
    { id: "future", status: "pending", dueAt: "2026-05-15T09:01:00.000Z" },
    { id: "sent", status: "sent", dueAt: "2026-05-15T08:00:00.000Z" },
  ];

  assert.deepEqual(duePendingReminders(rows, now).map(r => r.id), ["due", "now"]);
});

test("formatReminderTelegramMessage includes reminder, card title, due time, and card link", () => {
  const text = formatReminderTelegramMessage({
    reminder: {
      message: "Cancel before renewal",
      dueAt: "2026-05-15T09:00:00.000Z",
    },
    item: {
      id: "card-123",
      title: "Netflix subscription",
      url: "",
    },
    appUrl: "https://second-brain.example.com",
  });

  assert.match(text, /Reminder: Cancel before renewal/);
  assert.match(text, /Card: Netflix subscription/);
  assert.match(text, /Due: 2026-05-15 09:00/);
  assert.match(text, /https:\/\/second-brain\.example\.com\/card\/card-123/);
});

test("formatReminderTelegramMessage can display due time in a configured timezone", () => {
  const text = formatReminderTelegramMessage({
    reminder: {
      message: "Review cancellation window",
      dueAt: "2026-05-15T09:00:00.000Z",
    },
    item: {
      id: "card-123",
      title: "Villa booking",
      url: "",
    },
    appUrl: "https://second-brain.example.com",
    timeZone: "Asia/Bangkok",
  });

  assert.match(text, /Due: 2026-05-15 16:00/);
});

test("splitReminderDateTime separates date and time for picker controls", () => {
  assert.deepEqual(splitReminderDateTime("2026-05-15T14:30"), {
    date: "2026-05-15",
    time: "14:30",
  });

  assert.deepEqual(splitReminderDateTime(""), {
    date: "",
    time: "09:00",
  });
});

test("mergeReminderDateTimeParts builds the local datetime value used by reminder saves", () => {
  assert.equal(mergeReminderDateTimeParts("2026-05-15", "14:30"), "2026-05-15T14:30");
  assert.equal(mergeReminderDateTimeParts("2026-05-15", ""), "2026-05-15T09:00");
  assert.equal(mergeReminderDateTimeParts("", "14:30"), "");
});
