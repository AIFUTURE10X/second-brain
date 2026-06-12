import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/db";
import { items } from "@/db/schema";
import { and, ne, sql as sqlExpr } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";
import { serverError } from "@/lib/api-errors";
import { findUrlDuplicates, mergeDuplicateMatches } from "@/lib/duplicate-detection.mjs";

const TITLE_SIMILARITY_THRESHOLD = 0.55;

/**
 * GET /api/items/duplicates?url=…&title=…&excludeId=…  (roadmap 2.12)
 *
 * Returns cards that look like duplicates of what's being typed into the
 * form: exact URL matches (after canonicalisation — tracking params, www.,
 * trailing slashes, and hashes ignored) first, then pg_trgm title
 * similarity. Response: { duplicates: [{ id, title, url, type, match }] }.
 */
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url")?.trim() || "";
    const title = searchParams.get("title")?.trim() || "";
    const excludeId = searchParams.get("excludeId")?.trim() || null;
    if (!url && !title) return NextResponse.json({ duplicates: [] });

    let urlMatches: Record<string, unknown>[] = [];
    if (url) {
      // Canonicalisation happens in JS, so compare against all link URLs —
      // id/title/url only, fine at personal scale.
      const hasUrl = sqlExpr`${items.url} <> ''`;
      const candidates = await db
        .select({ id: items.id, title: items.title, url: items.url, type: items.type })
        .from(items)
        .where(excludeId ? and(hasUrl, ne(items.id, excludeId)) : hasUrl);
      urlMatches = findUrlDuplicates(url, candidates.filter(c => c.url), { excludeId });
    }

    let titleMatches: Record<string, unknown>[] = [];
    if (title.length >= 4) {
      try {
        titleMatches = await sql.query(
          `SELECT id, title, url, type, similarity(title, $1) AS sim
           FROM items
           WHERE title <> ''
             AND similarity(title, $1) > $2
             ${excludeId ? "AND id <> $3" : ""}
           ORDER BY sim DESC
           LIMIT 3`,
          excludeId ? [title, TITLE_SIMILARITY_THRESHOLD, excludeId] : [title, TITLE_SIMILARITY_THRESHOLD]
        );
      } catch (error) {
        // pg_trgm not installed yet — URL matching still works.
        console.error("Title similarity check failed:", error);
      }
    }

    return NextResponse.json({ duplicates: mergeDuplicateMatches(urlMatches, titleMatches) });
  } catch (error) {
    return serverError(error);
  }
}
