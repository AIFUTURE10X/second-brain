// Reminder snooze via Telegram inline buttons (roadmap 2.8). Pure module —
// the webhook and cron do the I/O.

export const SNOOZE_OPTIONS = [
  { key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { key: "3h", label: "3 hours", ms: 3 * 60 * 60 * 1000 },
  { key: "1d", label: "Tomorrow", ms: 24 * 60 * 60 * 1000 },
];

/** Telegram inline keyboard attached to reminder messages. */
export function buildSnoozeKeyboard(reminderId) {
  return {
    inline_keyboard: [
      SNOOZE_OPTIONS.map(opt => ({
        text: `⏰ ${opt.label}`,
        callback_data: `snooze:${reminderId}:${opt.key}`,
      })),
    ],
  };
}

/** Parse a snooze callback; null for anything else. */
export function parseSnoozeCallback(data) {
  const match = String(data || "").match(/^snooze:([0-9a-f-]{36}):(\w+)$/i);
  if (!match) return null;
  const option = SNOOZE_OPTIONS.find(opt => opt.key === match[2]);
  if (!option) return null;
  return { reminderId: match[1], ms: option.ms, label: option.label };
}
