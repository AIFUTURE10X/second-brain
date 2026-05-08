export function normalizeReminderInput(input) {
  const itemId = String(input?.itemId || "").trim();
  const message = String(input?.message || "").trim();
  const dueAtValue = input?.dueAt;
  const dueAtDate = dueAtValue ? new Date(dueAtValue) : null;

  if (!itemId) {
    throw new Error("itemId is required");
  }
  if (!dueAtDate || Number.isNaN(dueAtDate.getTime())) {
    throw new Error("Valid dueAt is required");
  }

  return {
    itemId,
    message,
    dueAt: dueAtDate.toISOString(),
  };
}

export function duePendingReminders(reminders, now = new Date()) {
  const cutoff = now.getTime();
  return reminders.filter(reminder => {
    if (reminder?.status !== "pending") return false;
    const dueAt = new Date(reminder.dueAt).getTime();
    return Number.isFinite(dueAt) && dueAt <= cutoff;
  });
}

export function formatReminderTelegramMessage({ reminder, item, appUrl, timeZone }) {
  const title = reminder?.message?.trim() || "Look at this card";
  const cardTitle = item?.title?.trim() || item?.ogTitle?.trim() || item?.url?.trim() || "Untitled card";
  const dueAt = formatDateTime(reminder?.dueAt, timeZone);
  const baseUrl = String(appUrl || "").replace(/\/+$/, "");
  const cardUrl = baseUrl && item?.id ? `${baseUrl}/card/${item.id}` : "";

  return [
    `Reminder: ${title}`,
    "",
    `Card: ${cardTitle}`,
    dueAt ? `Due: ${dueAt}` : "",
    cardUrl ? `Open: ${cardUrl}` : "",
  ].filter(Boolean).join("\n");
}

export function splitReminderDateTime(value) {
  const raw = String(value || "");
  const [date = "", time = ""] = raw.split("T");
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
    time: /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "09:00",
  };
}

export function mergeReminderDateTimeParts(date, time) {
  const cleanDate = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return "";
  const cleanTime = String(time || "").trim();
  const normalizedTime = /^\d{2}:\d{2}$/.test(cleanTime) ? cleanTime : "09:00";
  return `${cleanDate}T${normalizedTime}`;
}

function formatDateTime(value, timeZone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (timeZone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const part = (type) => parts.find(p => p.type === type)?.value || "";
    return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
  }
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-") + " " + [
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
  ].join(":");
}
