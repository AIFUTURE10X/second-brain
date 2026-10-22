// Business ideas for Phil's AI OS (Mission Control → Tasks → Business Ideas).
// A card carrying BUSINESS_IDEA_TAG is picked up by the AI OS within 5 minutes: it reads
// GET /api/items?since= with the API key, fetches the video transcript or page, and breaks
// it into scored business ideas there. Only a person sets the tag ("/idea" in Telegram or
// quick capture, the extension's "as business idea" menu, or editing a card's tags):
// every AI tagger drops it, so a model can never send a card on its own.
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
