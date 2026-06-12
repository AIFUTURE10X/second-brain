// Semantic-search embeddings (roadmap 1.1). Pure helpers plus the OpenAI
// call — no app imports, so node:test and scripts/backfill-embeddings.mjs can
// load this file directly. DB reads/writes live in lib/embedding-store.ts.

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// text-embedding-3-small caps each input at 8191 tokens. English averages
// ~4 chars/token but URLs and code skew closer to ~2.5, so 16k chars keeps a
// comfortable safety margin.
export const MAX_EMBEDDING_INPUT_CHARS = 16_000;

// Cosine distance (1 - similarity) above which a semantic hit is treated as
// noise and dropped. 0.75 keeps loosely related cards but cuts random ones.
export const SEMANTIC_DISTANCE_CUTOFF = 0.75;
export const SEMANTIC_SEARCH_LIMIT = 40;

export function embeddingsEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Flatten a card into the text that gets embedded. Mirrors the FTS document
 * in db/schema.ts (title, tags, category, body, note entries, checklist rows,
 * link/OG metadata) so both rankers see the same content. Returns "" when the
 * card has nothing meaningful to embed.
 */
export function buildEmbeddingInput(item) {
  if (!item || typeof item !== "object") return "";
  const title = clean(item.title);
  const category = clean(item.category);
  const ogTitle = clean(item.ogTitle);
  const tags = Array.isArray(item.tags)
    ? item.tags.map(clean).filter(Boolean).join(", ")
    : "";
  const noteEntries = Array.isArray(item.noteEntries)
    ? item.noteEntries.map(entry => clean(entry?.body)).filter(Boolean).join("\n")
    : "";
  const checklist = Array.isArray(item.checklistItems)
    ? item.checklistItems.map(row => clean(row?.text)).filter(Boolean).join("\n")
    : "";

  const parts = [
    title,
    tags && `Tags: ${tags}`,
    category && `Category: ${category}`,
    clean(item.content),
    clean(item.notes),
    noteEntries,
    checklist,
    ogTitle !== title ? ogTitle : "",
    clean(item.ogDescription),
    clean(item.siteName),
    clean(item.url),
  ].filter(Boolean);

  return parts.join("\n").slice(0, MAX_EMBEDDING_INPUT_CHARS);
}

/** Format a vector as a pgvector literal: "[0.1,0.2,...]". */
export function vectorLiteral(vector) {
  return `[${vector.join(",")}]`;
}

/**
 * Embed one or more texts with OpenAI. Returns vectors aligned with the
 * inputs, or null on any failure — callers treat null as "skip semantic
 * work"; a save or search must never fail because of embeddings.
 */
export async function generateEmbeddings(texts, { timeoutMs = 15_000 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !Array.isArray(texts) || texts.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("OpenAI embeddings failed:", data?.error?.message || `HTTP ${res.status}`);
      return null;
    }
    // Re-align by index — the API does not guarantee response order.
    const byIndex = new Map(
      (Array.isArray(data?.data) ? data.data : []).map(entry => [entry?.index, entry?.embedding])
    );
    const vectors = texts.map((_, i) => byIndex.get(i));
    const valid = vectors.every(v => Array.isArray(v) && v.length === EMBEDDING_DIMENSIONS);
    return valid ? vectors : null;
  } catch (error) {
    console.error("OpenAI embeddings failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Embed a single text. Returns the vector or null on failure. */
export async function generateEmbedding(text, options = {}) {
  const vectors = await generateEmbeddings([text], options);
  return vectors ? vectors[0] : null;
}
