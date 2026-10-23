import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { ideaTagsSql } from "./business-idea.mjs";
import { embeddingsEnabled } from "./embeddings.mjs";
import { updateItemEmbedding } from "./embedding-store";

/**
 * The 💼 tap (Telegram button, card toggle, card page): add or remove the business-idea
 * tag in one statement and touch nothing else on the card. The updated_at bump is what
 * the AI OS ?since= pull sees. Null when the card is gone.
 */
export async function setCardIdea(id: string, send: boolean) {
  const [row] = await db
    .update(items)
    .set({ tags: sql.raw(ideaTagsSql(`"tags"`, send)), updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning();
  // Tags are part of the embedding input (lib/embeddings.mjs).
  if (row && embeddingsEnabled()) after(() => updateItemEmbedding(row.id));
  return row ?? null;
}
