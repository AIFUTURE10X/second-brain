import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildEmbeddingInput, embeddingsEnabled, generateEmbedding } from "@/lib/embeddings.mjs";

/**
 * Recompute and persist the embedding for one item. Never throws — semantic
 * search is best-effort and a failed embedding must not break a save.
 * Reads the row fresh so callers can run this post-response (next/server
 * `after`) without holding stale data. updated_at is deliberately left
 * untouched: the optimistic-concurrency token the client just received must
 * stay valid, and embeddings are not client-visible state.
 */
export async function updateItemEmbedding(itemId: string): Promise<void> {
  if (!embeddingsEnabled()) return;
  try {
    const [row] = await db.select().from(items).where(eq(items.id, itemId));
    if (!row) return;
    const input = buildEmbeddingInput(row);
    if (!input) return;
    const embedding = await generateEmbedding(input);
    if (!embedding) return;
    await db.update(items).set({ embedding }).where(eq(items.id, itemId));
  } catch (error) {
    // Column/extension not migrated yet, or transient DB error — skip quietly.
    console.error("Embedding update failed:", error);
  }
}

/** True when an update changed any field that feeds the embedding input. */
export function embeddingInputChanged(before: unknown, after: unknown): boolean {
  return buildEmbeddingInput(before) !== buildEmbeddingInput(after);
}
