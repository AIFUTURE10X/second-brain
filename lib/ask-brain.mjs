// "Ask my brain" RAG helpers (roadmap 2.13). Pure module — retrieval and the
// OpenAI call live in app/api/ask/route.ts.

export const ASK_MAX_SOURCES = 8;
export const ASK_MAX_CONTEXT_CHARS = 9_000;
const PER_SOURCE_CHARS = 900;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Turn retrieved cards into a numbered context block + the source list the
 * client renders as citations. Cards are truncated per-source and the whole
 * context is capped so the prompt stays small.
 */
export function buildAskContext(rows, { maxSources = ASK_MAX_SOURCES, maxChars = ASK_MAX_CONTEXT_CHARS } = {}) {
  const sources = [];
  const blocks = [];
  let used = 0;

  for (const row of rows || []) {
    if (sources.length >= maxSources) break;
    const title = clean(row.title) || clean(row.ogTitle) || "Untitled";
    const body = [
      clean(row.content),
      clean(row.notes),
      ...(Array.isArray(row.noteEntries) ? row.noteEntries.map(entry => clean(entry?.body)) : []),
      clean(row.ogDescription),
    ].filter(Boolean).join(" ").slice(0, PER_SOURCE_CHARS);

    const n = sources.length + 1;
    const meta = [row.type, clean(row.category), (Array.isArray(row.tags) ? row.tags : []).join(", ")]
      .filter(Boolean).join(" · ");
    const block = `[${n}] ${title}${meta ? ` (${meta})` : ""}${clean(row.url) ? `\nURL: ${clean(row.url)}` : ""}${body ? `\n${body}` : ""}`;
    if (used + block.length > maxChars) break;

    used += block.length;
    blocks.push(block);
    sources.push({
      id: row.id,
      title,
      url: clean(row.url),
      type: row.type || "note",
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
