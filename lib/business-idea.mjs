// Business ideas for Phil's AI OS (Mission Control → Tasks → Business Ideas).
// A card carrying BUSINESS_IDEA_TAG is picked up by the AI OS within a few minutes: it reads
// GET /api/items?since= with the API key, fetches the video transcript or page, and breaks
// it into scored business ideas there. Only a person sets the tag ("/idea" in Telegram or
// quick capture, the 💼 button under a Telegram save or /find result, the 💼 toggle on a
// card, the extension's "as business idea" menu, or editing a card's tags): every AI
// tagger drops it, so a model can never send a card on its own.
// Pure module — no next/server or db imports, so node:test loads it directly.

export const BUSINESS_IDEA_TAG = "business-idea";

/** "/idea <link or idea> [why]" (or "/bi …") → the rest; "" for a bare command; null otherwise. */
export function parseIdeaCommand(text) {
  const match = String(text || "").match(/^\/(idea|bi)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  return match ? (match[2] || "").trim() : null;
}

export function isIdeaTag(tag) {
  return String(tag ?? "").trim().toLowerCase() === BUSINESS_IDEA_TAG;
}

export function withoutIdeaTag(tags) {
  return (Array.isArray(tags) ? tags : []).filter(tag => !isIdeaTag(tag));
}

export function withIdeaTag(tags) {
  return [...withoutIdeaTag(tags), BUSINESS_IDEA_TAG];
}

export function hasIdeaTag(tags) {
  return Array.isArray(tags) && tags.some(isIdeaTag);
}

/** Tags with the marker added (send) or removed (undo). */
export function setIdeaTag(tags, send) {
  return send ? withIdeaTag(tags) : withoutIdeaTag(tags);
}

/** The card page keeps tags as "a, b, c" text. */
export function setIdeaTagText(text, send) {
  const tags = String(text || "").split(",").map(tag => tag.trim()).filter(Boolean);
  return setIdeaTag(tags, send).join(", ");
}

/**
 * SQL for an items.tags value with the marker added (send) or removed, worked out from
 * the row's own tags inside the UPDATE, so an edit to the other tags made meanwhile is
 * never overwritten. `column` comes from code, never from input.
 */
export function ideaTagsSql(column, send) {
  const others = `coalesce((select jsonb_agg(e.value order by e.idx)`
    + ` from jsonb_array_elements(case when jsonb_typeof(${column}) = 'array' then ${column} else '[]'::jsonb end)`
    + ` with ordinality as e(value, idx)`
    + ` where lower(btrim(e.value #>> '{}')) <> '${BUSINESS_IDEA_TAG}'), '[]'::jsonb)`;
  return send ? `(${others} || '["${BUSINESS_IDEA_TAG}"]'::jsonb)` : others;
}

/** What a 💼 tap says back, in the app and in Telegram (a callback toast holds 200 chars). */
export function ideaToggleNotice(sent) {
  return sent
    ? "💼 Sent to the AI OS. It analyses the card within a few minutes (Tasks → Business Ideas)."
    : "Not sent. If the AI OS already picked it up, archive it on Business Ideas.";
}

// Telegram 💼 buttons. callback_data (64-byte cap) is "idea:on|off:<card uuid>", plus
// ":<n>" for a numbered /find result; the tap handler only flips that card's tag.
const IDEA_CALLBACK = /^idea:(on|off):([0-9a-f-]{36})(?::([1-9]))?$/i;

export function ideaButton(itemId, sent, n) {
  const text = n
    ? (sent ? `✓ ${n} · Undo` : `💼 ${n}`)
    : (sent ? "✓ Sent to AI OS · Undo" : "💼 Send to AI OS");
  return { text, callback_data: `idea:${sent ? "off" : "on"}:${itemId}${n ? `:${n}` : ""}` };
}

/** The button under a "Saved to Brain!" reply. */
export function ideaKeyboard(itemId, sent) {
  return { inline_keyboard: [[ideaButton(itemId, sent)]] };
}

/** One numbered button per /find result shown (same order and limit as formatFindResults). */
export function findIdeaKeyboard(rows, limit = 5) {
  const top = (Array.isArray(rows) ? rows : []).slice(0, limit).filter(row => row?.id);
  if (top.length === 0) return null;
  return { inline_keyboard: [top.map((row, i) => ideaButton(row.id, hasIdeaTag(row.tags), i + 1))] };
}

/** "idea:on:<id>[:n]" → { send, itemId, n }; null for anything else. */
export function parseIdeaCallback(data) {
  const match = String(data || "").match(IDEA_CALLBACK);
  if (!match) return null;
  return { send: match[1].toLowerCase() === "on", itemId: match[2].toLowerCase(), n: match[3] ? Number(match[3]) : undefined };
}

/** The tapped message's keyboard with that card's button showing its new state. */
export function withIdeaButtonState(keyboard, itemId, sent) {
  const rows = Array.isArray(keyboard?.inline_keyboard) ? keyboard.inline_keyboard : [];
  return {
    inline_keyboard: rows.map(row => row.map(button => {
      const parsed = parseIdeaCallback(button?.callback_data);
      return parsed && parsed.itemId === String(itemId).toLowerCase() ? ideaButton(parsed.itemId, sent, parsed.n) : button;
    })),
  };
}

/**
 * A URL typed inside a sentence keeps its trailing punctuation when matched
 * ("…/article, could I sell this?"). Drop sentence punctuation and a closing
 * bracket that has no opening partner in the URL; "/wiki/Foo_(bar)" survives.
 */
export function trimUrlPunctuation(url) {
  let out = String(url || "");
  for (;;) {
    const next = out.replace(/[.,;:!?'"]+$/, "");
    const last = next.slice(-1);
    const unbalanced = (last === ")" && (next.match(/\(/g) || []).length < (next.match(/\)/g) || []).length)
      || (last === "]" && (next.match(/\[/g) || []).length < (next.match(/]/g) || []).length);
    const trimmed = unbalanced ? next.slice(0, -1) : next;
    if (trimmed === out) return out;
    out = trimmed;
  }
}

/** The quick-capture bar's "/idea …": a link (words become notes) or a written idea. */
export function ideaCapturePayload(rest) {
  const text = String(rest || "").trim();
  const url = trimUrlPunctuation(text.match(/https?:\/\/[^\s]+/)?.[0] || "");
  const words = text.replace(/https?:\/\/[^\s]+/g, " ").replace(/\s+/g, " ").trim();
  if (url) return { type: "link", url, notes: words, tags: [BUSINESS_IDEA_TAG] };
  return { type: "thought", title: words.slice(0, 100), content: words, tags: [BUSINESS_IDEA_TAG] };
}
