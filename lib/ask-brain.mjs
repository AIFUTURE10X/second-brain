// "Ask my brain" RAG helpers (roadmap 2.13). Pure module — retrieval and the
// OpenAI call live in app/api/ask/route.ts.

import { selectPassages, safeSourceUrl } from './knowledge-passages.mjs';

export const ASK_MAX_SOURCES = 8;
export const ASK_MAX_CONTEXT_CHARS = 9_000;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Turn retrieved cards into a numbered context block + the source list the
 * client renders as citations. Cards are truncated per-source and the whole
 * context is capped so the prompt stays small.
 */
export function buildAskContext(rows, { maxSources = ASK_MAX_SOURCES, maxChars = ASK_MAX_CONTEXT_CHARS, question = '' } = {}) {
  const sources = [];
  const blocks = [];
  let used = 0;

  for (const row of rows || []) {
    if (sources.length >= maxSources) break;
    const title = clean(row.title) || clean(row.ogTitle) || "Untitled";
    const passages = selectPassages(row, question, Math.min(2200, Math.floor(maxChars / Math.min(rows.length, maxSources)) - 250));
    const body = passages.map(p => `${p.label}: ${p.text}`).join('\n');

    const n = sources.length + 1;
    const meta = [row.type, clean(row.category), (Array.isArray(row.tags) ? row.tags : []).join(", ")]
      .filter(Boolean).join(" · ");
    const block = `[${n}] ${title}${meta ? ` (${meta})` : ""}${clean(row.url) ? `\nURL: ${clean(row.url)}` : ""}${body ? `\n${body}` : ""}`;
    const separator = blocks.length ? 2 : 0;
    if (used + block.length + separator > maxChars) continue;

    used += block.length + separator;
    blocks.push(block);
    sources.push({
      id: row.id,
      title,
      url: safeSourceUrl(row.url),
      type: row.type || "note",
      passages,
    });
  }

  return { contextText: blocks.join("\n\n"), sources };
}

/** Keep only the last few exchanges so the prompt doesn't grow unbounded. */
export function trimAskHistory(history, maxMessages = 6) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(msg =>
      msg && typeof msg === "object" &&
      (msg.role === "user" || msg.role === "assistant") &&
      typeof msg.content === "string" && msg.content.trim().length > 0
    )
    .slice(-maxMessages)
    .map(msg => ({ role: msg.role, content: msg.content.trim().slice(0, 2_000) }));
}
