import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { assetTagsSql } from "./aios-asset.mjs";
import { embeddingsEnabled } from "./embeddings.mjs";
import { updateItemEmbedding } from "./embedding-store";

/**
 * The 🗂 pick: file the card under these AI OS asset categories (or take it back, []) in
 * one statement, touching nothing else on the card. The updated_at bump is what the
 * AI OS ?since= pull sees. Null when the card is gone.
 */
export async function setCardAsset(id: string, categories: string[]) {
  const [row] = await db
    .update(items)
    .set({ tags: sql.raw(assetTagsSql(`"tags"`, categories)), updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning();
  // Tags are part of the embedding input (lib/embeddings.mjs).
  if (row && embeddingsEnabled()) after(() => updateItemEmbedding(row.id));
  return row ?? null;
}
