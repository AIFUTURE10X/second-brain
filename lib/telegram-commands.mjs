// Telegram /find and /done command parsing + formatting (roadmap 2.7).
// Pure module — the webhook route does the I/O.

export function parseFindCommand(text) {
  const match = String(text || "").match(/^\/(find|search|f)\s+([\s\S]+)/i);
  return match ? match[2].trim() : null;
}

export function parseDoneCommand(text) {
  const match = String(text || "").match(/^\/done\s+([\s\S]+)/i);
  return match ? match[1].trim() : null;
}

export function shortId(id) {
  return String(id || "").slice(0, 8);
}

const TYPE_ICONS = {
  task: "☐",
  memory: "💡",
  link: "◈",
  clip: "✂",
  thought: "◉",
  note: "▤",
};

/** Compact /find reply: top hits with icon, title, link, and short id. */
export function formatFindResults(rows, { baseUrl = "", query = "", limit = 5 } = {}) {
  if (!rows || rows.length === 0) {
    return `No results for "${query}".`;
  }
  const top = rows.slice(0, limit);
  const lines = top.map((row, i) => {
    const icon = TYPE_ICONS[row.type] || "◉";
    const title = (row.title || "Untitled").slice(0, 80);
    const cardLink = baseUrl ? `${baseUrl.replace(/\/$/, "")}/card/${row.id}` : "";
    const extra = [row.url, cardLink].filter(Boolean).join("\n   ");
    return `${i + 1}. ${icon} ${title}${extra ? `\n   ${extra}` : ""}`;
  });
  const more = rows.length > top.length ? `\n…and ${rows.length - top.length} more in the app.` : "";
  return `Results for "${query}":\n\n${lines.join("\n")}${more}`;
}

/**
 * Match a /done argument against open tasks: a hex-ish argument of 6+ chars
 * is treated as an id prefix, anything else as a case-insensitive title
 * substring.
 */
export function matchTaskCandidates(arg, tasks) {
  const needle = String(arg || "").trim().toLowerCase();
  if (!needle) return [];
  const looksLikeId = /^[0-9a-f-]{6,}$/i.test(needle);
  if (looksLikeId) {
    const byId = tasks.filter(t => String(t.id).toLowerCase().startsWith(needle));
    if (byId.length > 0) return byId;
  }
  return tasks.filter(t => String(t.title || "").toLowerCase().includes(needle));
}

/** Reply when /done matches several tasks — lets the user retry by id. */
export function formatDoneAmbiguous(candidates, limit = 5) {
  const lines = candidates.slice(0, limit).map(t => `• ${shortId(t.id)} — ${(t.title || "Untitled").slice(0, 60)}`);
  return `Found ${candidates.length} open tasks. Reply with /done <id>:\n${lines.join("\n")}`;
}
