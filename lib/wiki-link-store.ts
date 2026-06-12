import { db } from "@/db";
import { items, itemRelations } from "@/db/schema";
import { eq, ne, and, inArray, sql as sqlExpr } from "drizzle-orm";
import { collectWikiLinkTitles } from "@/lib/wiki-links.mjs";
import { canonicalRelationPair } from "@/lib/item-relations.mjs";

/**
 * Backlinks (roadmap 2.2): resolve [[Title]] mentions in a card's text to
 * existing cards by exact (case-insensitive) title and record them in
 * item_relations — the same table the manual related-cards picker uses, so
 * inbound links show up on cards with zero extra UI. Additive only: removing
 * a [[link]] never deletes a relation, since relations can also be created
 * manually. Never throws — runs post-response via next/server `after`.
 */
export async function syncWikiRelations(itemId: string): Promise<void> {
  try {
    const [row] = await db.select().from(items).where(eq(items.id, itemId));
    if (!row) return;
    const titles = collectWikiLinkTitles(row);
    if (titles.length === 0) return;

    const lowered = titles.map(t => t.toLowerCase());
    const targets = await db
      .select({ id: items.id })
      .from(items)
      .where(and(
        ne(items.id, itemId),
        inArray(sqlExpr`lower(${items.title})`, lowered),
      ));
    if (targets.length === 0) return;

    const pairs = targets.map(target => ({
      ...canonicalRelationPair(itemId, target.id),
    }));
    await db.insert(itemRelations).values(pairs).onConflictDoNothing();
  } catch (error) {
    console.error("Wiki-link relation sync failed:", error);
  }
}
