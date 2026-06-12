import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { checkApiKey } from "@/lib/api-key";
import { serverError } from "@/lib/api-errors";
import {
  buildEmbeddingInput,
  embeddingsEnabled,
  generateEmbeddings,
  vectorLiteral,
} from "@/lib/embeddings.mjs";

export const maxDuration = 60;

const BATCH_SIZE = 25;
// Stay safely inside the function's time budget; the response reports how
// many cards remain so the caller just hits the endpoint again.
const TIME_BUDGET_MS = 40_000;

// Embed cards saved before semantic search existed (roadmap 1.1) without
// needing a local DATABASE_URL — the serverless twin of
// scripts/backfill-embeddings.mjs. Idempotent: only rows with a NULL
// embedding are touched. Call repeatedly until { remaining: 0 }.
async function runBackfill(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  if (!embeddingsEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const started = Date.now();
    let embedded = 0;
    let skipped = 0;

    while (Date.now() - started < TIME_BUDGET_MS) {
      const rows = await sql`
        SELECT id, title, content, url, notes, tags, category,
               note_entries AS "noteEntries",
               checklist_items AS "checklistItems",
               og_title AS "ogTitle",
               og_description AS "ogDescription",
               site_name AS "siteName"
        FROM items
        WHERE embedding IS NULL
        ORDER BY created_at
        LIMIT ${BATCH_SIZE}
        OFFSET ${skipped}
      `;
      if (rows.length === 0) break;

      const embeddable = rows
        .map(row => ({ row, input: buildEmbeddingInput(row) }))
        .filter(entry => entry.input);
      // Rows with nothing to embed stay NULL — skip past them via OFFSET so
      // the loop can't spin on them forever.
      skipped += rows.length - embeddable.length;

      if (embeddable.length > 0) {
        const vectors = await generateEmbeddings(embeddable.map(entry => entry.input));
        if (!vectors) {
          return NextResponse.json({ error: "OpenAI embedding request failed — try again" }, { status: 502 });
        }
        for (let i = 0; i < embeddable.length; i++) {
          await sql.query(
            "UPDATE items SET embedding = $1::vector WHERE id = $2",
            [vectorLiteral(vectors[i]), embeddable[i].row.id]
          );
        }
        embedded += embeddable.length;
      }
    }

    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM items WHERE embedding IS NULL
    ` as unknown as [{ count: number }];

    return NextResponse.json({
      ok: true,
      embedded,
      remaining: Math.max(0, count - skipped),
      note: count - skipped > 0 ? "Call this endpoint again to continue." : "All cards embedded.",
    });
  } catch (error) {
    console.error("Embedding backfill failed:", error);
    return serverError(error);
  }
}

// GET supported so it can be run by opening the URL in a browser.
export async function GET(req: NextRequest) {
  return runBackfill(req);
}

export async function POST(req: NextRequest) {
  return runBackfill(req);
}
