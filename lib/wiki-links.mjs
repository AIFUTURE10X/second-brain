// [[wiki link]] parsing for backlinks (roadmap 2.2). Pure module — the
// relation writes live in lib/wiki-link-store.ts.

const WIKI_LINK_RE = /\[\[([^\[\]\n]{1,200})\]\]/g;

/** Unique, trimmed [[...]] targets in a block of text (order preserved). */
export function extractWikiLinks(text) {
  const titles = [];
  const seen = new Set();
  for (const match of String(text || "").matchAll(WIKI_LINK_RE)) {
    const title = match[1].trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

/** All wiki-link targets across a card's text fields. */
export function collectWikiLinkTitles(item) {
  const sources = [
    item?.content,
    item?.notes,
    ...(Array.isArray(item?.noteEntries) ? item.noteEntries.map(entry => entry?.body) : []),
  ];
  const titles = [];
  const seen = new Set();
  for (const source of sources) {
    for (const title of extractWikiLinks(source)) {
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
    }
  }
  return titles;
}
