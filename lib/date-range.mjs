// Timeline / date-range filtering (roadmap 2.3). Pure helpers shared by
// Brain.tsx, the FilterBar UI, and node:test.

export const DATE_PRESETS = ["all", "today", "week", "month", "custom"];

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolve a date filter to inclusive [from, to] millisecond bounds, or null
 * when the filter is inactive. "week" starts Monday; "custom" reads the
 * yyyy-mm-dd from/to inputs (either side may be open-ended).
 */
export function dateRangeBounds({ preset = "all", from = "", to = "" } = {}, now = new Date()) {
  if (preset === "today") {
    return { fromMs: startOfDay(now).getTime(), toMs: now.getTime() };
  }
  if (preset === "week") {
    const start = startOfDay(now);
    const day = start.getDay(); // 0 = Sunday
    start.setDate(start.getDate() - ((day + 6) % 7));
    return { fromMs: start.getTime(), toMs: now.getTime() };
  }
  if (preset === "month") {
    const start = startOfDay(now);
    start.setDate(1);
    return { fromMs: start.getTime(), toMs: now.getTime() };
  }
  if (preset === "custom") {
    const fromDate = from ? startOfDay(new Date(`${from}T00:00:00`)) : null;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : null;
    const fromMs = fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.getTime() : -Infinity;
    const toMs = toDate && !Number.isNaN(toDate.getTime()) ? toDate.getTime() : Infinity;
    if (fromMs === -Infinity && toMs === Infinity) return null;
    return { fromMs, toMs };
  }
  return null;
}

/** True when the item's createdAt falls inside the active range. */
export function itemInDateRange(item, range, now = new Date()) {
  const bounds = dateRangeBounds(range, now);
  if (!bounds) return true;
  const created = new Date(item?.createdAt ?? 0).getTime();
  if (Number.isNaN(created)) return false;
  return created >= bounds.fromMs && created <= bounds.toMs;
}

/** Day key (yyyy-mm-dd, local time) used to group the timeline list. */
export function timelineDayKey(createdAt) {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "unknown";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Group an already-filtered, already-sorted item list into day buckets for
 * the timeline view. Pinned cards sort first app-wide, which would scatter
 * the grouping — so groups follow the list order but are keyed by day.
 */
export function groupItemsByDay(items) {
  const groups = [];
  let current = null;
  for (const item of items) {
    const key = timelineDayKey(item.createdAt);
    if (!current || current.key !== key) {
      current = { key, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}
