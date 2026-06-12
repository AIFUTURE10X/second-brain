import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/db";
import { items } from "@/db/schema";
import { checkApiKey } from "@/lib/api-key";
import { parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { tagsMergeSchema } from "@/lib/validation";

/**
 * POST /api/tags/merge
 * Body: { from: string[], to: string }
 *
 * Replaces every occurrence of any tag in `from` with `to`, across every item.
 * Case-insensitive matching on tag values. Deduplicates within an item after merge.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(tagsMergeSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const { from, to } = parsed.data;

  try {
    const fromLower = from.map(t => t.toLowerCase());
    const all = await db.select().from(items);
    let affected = 0;

    for (const row of all) {
      const tags = row.tags || [];
      if (tags.length === 0) continue;
      const hasMatch = tags.some(t => fromLower.includes(t.toLowerCase()));
      if (!hasMatch) continue;

      const replaced = tags.map(t => (fromLower.includes(t.toLowerCase()) ? to : t));
      const deduped = Array.from(new Set(replaced));
      await sql`UPDATE items SET tags = ${JSON.stringify(deduped)}::jsonb, updated_at = NOW() WHERE id = ${row.id}`;
      affected += 1;
    }

    return NextResponse.json({ ok: true, affected, from, to });
  } catch (error) {
    return serverError(error);
  }
}
