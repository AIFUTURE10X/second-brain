/**
 * Split an already-filtered, already-sorted card list into category sections
 * for the grid views. Cards keep their list order inside each section.
 * Sections follow `order` (parents then their children, by position), then
 * any category the settings list doesn't know about (first seen first), and
 * uncategorized cards (key "") always come last.
 */
export function groupItemsByCategory(items, order = []) {
  const buckets = new Map();
  for (const item of items) {
    const key = item.category?.trim() || "";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const keys = [...new Set([...order, ...buckets.keys()])].filter(key => key && buckets.has(key));
  if (buckets.has("")) keys.push("");
  return keys.map(key => ({ key, items: buckets.get(key) }));
}
