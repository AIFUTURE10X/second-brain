// Perfected assets for Phil's AI OS (Library → Asset Library). The 🗂 button on a card
// files it under one or more categories by adding the tag "aios-asset:<key>" for each; the
// AI OS reads GET /api/items?since= with the API key and shelves the card under each.
// The picker toggles categories on and off; "Take it back" removes every asset tag.
// Like the business-idea tag, only a person sets it: every AI tagger drops it.
// Pure module — no next/server or db imports, so node:test loads it directly.
// The AI OS keeps the same list in dashboard/lib/asset-library.mjs; add a category there too.

export const ASSET_TAG_PREFIX = "aios-asset:";

/** key: stored in the tag · color: the tile and the sent chip · hint: one line on the tile. */
export const ASSET_CATEGORIES = [
  { key: "website", emoji: "🌐", label: "Website designs", color: "#5B8DEF", hint: "Landing pages, full sites, layouts" },
  { key: "animation", emoji: "✨", label: "Animations", color: "#E8A838", hint: "Hover effects, scroll scenes, cursors" },
  { key: "3d", emoji: "🧊", label: "3D & interactive", color: "#56CCF2", hint: "Three.js scenes, configurators" },
  { key: "ui", emoji: "🧩", label: "UI components", color: "#6FCF97", hint: "Reusable cards, charts, widgets" },
  { key: "demo", emoji: "🎯", label: "Sales demos", color: "#EB5757", hint: "Working demos to show prospects" },
  { key: "automation", emoji: "⚙️", label: "Automations", color: "#F2994A", hint: "Workflows, bots, scheduled jobs" },
  { key: "skill", emoji: "🧠", label: "Skills", color: "#BB6BD9", hint: "Claude skills, agent instructions" },
  { key: "prompt", emoji: "💬", label: "Prompts & templates", color: "#F2C94C", hint: "Prompts, briefs, doc templates" },
  { key: "playbook", emoji: "📘", label: "Playbooks & offers", color: "#9B8AFB", hint: "Pricing, proposals, outreach, SOPs" },
];

const BY_KEY = new Map(ASSET_CATEGORIES.map(category => [category.key, category]));

export function isAssetCategory(key) {
  return typeof key === "string" && BY_KEY.has(key);
}

export function assetCategory(key) {
  return BY_KEY.get(key) ?? null;
}

export function isAssetTag(tag) {
  return String(tag ?? "").trim().toLowerCase().startsWith(ASSET_TAG_PREFIX);
}

export function withoutAssetTags(tags) {
  return (Array.isArray(tags) ? tags : []).filter(tag => !isAssetTag(tag));
}

/** The card's category keys in picker order, no repeats. Unknown hand-typed keys don't count. */
export function assetCategoriesOf(tags) {
  const keys = new Set();
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!isAssetTag(tag)) continue;
    const key = String(tag).trim().toLowerCase().slice(ASSET_TAG_PREFIX.length);
    if (isAssetCategory(key)) keys.add(key);
  }
  return ASSET_CATEGORIES.map(category => category.key).filter(key => keys.has(key));
}

/** The card's first category key, or null. */
export function assetCategoryOf(tags) {
  return assetCategoriesOf(tags)[0] ?? null;
}

/** A pick → the category keys it means: a key, a list of keys, or null / [] for none. */
export function assetKeys(choice) {
  const list = Array.isArray(choice) ? choice : choice == null ? [] : [choice];
  const keys = new Set(list.filter(isAssetCategory));
  return ASSET_CATEGORIES.map(category => category.key).filter(key => keys.has(key));
}

/** Tags with the card filed under `choice` (a key or keys), or with every asset tag removed. */
export function setAssetTag(tags, choice) {
  return [...withoutAssetTags(tags), ...assetKeys(choice).map(key => `${ASSET_TAG_PREFIX}${key}`)];
}

/** The card page keeps tags as "a, b, c" text. */
export function setAssetTagText(text, choice) {
  const tags = String(text || "").split(",").map(tag => tag.trim()).filter(Boolean);
  return setAssetTag(tags, choice).join(", ");
}

/**
 * SQL for an items.tags value filed under `choice` (a key, keys, or null / [] to clear),
 * worked out from the row's own tags inside the UPDATE, so another tag edit made meanwhile
 * is never overwritten. `column` comes from code; every key is checked against
 * ASSET_CATEGORIES before it is used.
 */
export function assetTagsSql(column, choice) {
  const list = Array.isArray(choice) ? choice : choice == null ? [] : [choice];
  for (const key of list) if (!isAssetCategory(key)) throw new Error(`Unknown asset category: ${key}`);
  const keys = assetKeys(list);
  const others = `coalesce((select jsonb_agg(e.value order by e.idx)`
    + ` from jsonb_array_elements(case when jsonb_typeof(${column}) = 'array' then ${column} else '[]'::jsonb end)`
    + ` with ordinality as e(value, idx)`
    + ` where left(lower(btrim(e.value #>> '{}')), ${ASSET_TAG_PREFIX.length}) <> '${ASSET_TAG_PREFIX}'), '[]'::jsonb)`;
  return keys.length ? `(${others} || '${JSON.stringify(keys.map(key => `${ASSET_TAG_PREFIX}${key}`))}'::jsonb)` : others;
}

/** What the app says after a pick. */
export function assetNotice(choice) {
  const categories = assetKeys(choice).map(assetCategory);
  if (!categories.length) return "Taken back. The AI OS drops it from Asset Library on its next check.";
  const names = categories.map(category => `${category.emoji} ${category.label}`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `Filed in the AI OS under ${list}. It shows on Asset Library within a minute.`;
}
