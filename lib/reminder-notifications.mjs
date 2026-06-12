// Desktop notifications for due reminders (roadmap 3.2) — pure selection
// logic; the platform calls (web Notification / Tauri plugin) live in
// lib/desktop-notifications.ts.

export const NOTIFIED_STORAGE_KEY = "sb_notified_reminder_ids";
export const NOTIFY_TOGGLE_STORAGE_KEY = "sb_desktop_notifications";

/**
 * Reminders that should pop a notification right now: pending, due, not
 * snoozed into the future, and not already notified on this device. Stale
 * reminders (overdue > 24h, e.g. while notifications were off) are skipped
 * to avoid a thundering backlog on first enable.
 */
export function pickDueReminderNotifications(reminders, notifiedIds, now = new Date()) {
  const cutoff = now.getTime();
  const staleBefore = cutoff - 24 * 60 * 60 * 1000;
  const notified = new Set(notifiedIds || []);
  return (reminders || []).filter(reminder => {
    if (!reminder || reminder.status !== "pending" || !reminder.id) return false;
    if (notified.has(reminder.id)) return false;
    const dueAt = new Date(reminder.dueAt).getTime();
    if (!Number.isFinite(dueAt) || dueAt > cutoff || dueAt < staleBefore) return false;
    if (reminder.snoozedUntil) {
      const snoozedUntil = new Date(reminder.snoozedUntil).getTime();
      if (Number.isFinite(snoozedUntil) && snoozedUntil > cutoff) return false;
    }
    return true;
  });
}

/** Remember notified ids without growing localStorage forever. */
export function appendNotifiedIds(existing, newIds, cap = 200) {
  const merged = [...(existing || []), ...newIds];
  return merged.slice(Math.max(0, merged.length - cap));
}
