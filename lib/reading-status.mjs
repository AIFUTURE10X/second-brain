// Read-later status on link cards (roadmap 2.9). Pure module shared by the
// API routes, ItemCard UI, and node:test.

export const READING_STATUSES = ["unread", "reading", "done"];

export function isReadingStatus(value) {
  return READING_STATUSES.includes(value);
}

/** Quick-toggle cycle: unread → reading → done → unread. */
export function nextReadingStatus(current) {
  const index = READING_STATUSES.indexOf(current);
  return READING_STATUSES[(index + 1) % READING_STATUSES.length];
}

export function readingStatusLabel(status) {
  if (status === "unread") return "◌ unread";
  if (status === "reading") return "◐ reading";
  if (status === "done") return "● read";
  return "";
}

export function readingStatusColor(status) {
  if (status === "unread") return "#56CCF2";
  if (status === "reading") return "#F2C94C";
  if (status === "done") return "#6FCF97";
  return "#9aa1ad";
}

/** New link cards start as unread; other types are not tracked. */
export function initialReadingStatus(type) {
  return type === "link" ? "unread" : null;
}

/** "To read" filter: unread or currently reading. */
export function isToRead(item) {
  return item?.readingStatus === "unread" || item?.readingStatus === "reading";
}
