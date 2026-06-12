// Vault entry → card linking (roadmap 3.4). Pure parser shared by Vault.tsx
// and node:test.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accepts a raw card id or any URL containing /card/<id> (the app's card
 * page, including pop-out links). Returns the card id or "" when the input
 * doesn't reference a card.
 */
export function parseLinkedCardId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (UUID_RE.test(raw)) return raw.toLowerCase();
  const match = raw.match(/\/card\/([0-9a-f-]{36})/i);
  return match && UUID_RE.test(match[1]) ? match[1].toLowerCase() : "";
}
