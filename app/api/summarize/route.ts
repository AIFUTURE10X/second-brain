import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { items, itemTranscripts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";
import { embeddingsEnabled } from "@/lib/embeddings.mjs";
import { updateItemEmbedding } from "@/lib/embedding-store";
import { isPrivateUrl } from "@/lib/enrich";
import { rateLimit } from "@/lib/rate-limit";
import { extractYouTubeId, fetchYouTubeTranscript } from "@/lib/youtube";
import { isAiSummaryEntry as isAiSummary, stripLegacyAiSummary, upsertAiSummaryEntry } from "@/lib/item-summary";
import { summarizeWithOpenAI } from "@/lib/summary-provider";
import { fetchSummaryPageText, sourceExcerpt } from "@/lib/summary-source";

// Transcript fallback and summary generation each have their own timeout.
export const maxDuration = 120;

/**
 * POST /api/summarize
 * Body: { id: "item-uuid" }
 *
 * Summarizes the item's content/URL using OpenAI and saves it as a note entry.
 * YouTube cards use captions/transcripts first, then fall back to card text.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = rateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const isYouTube = !!item.url && !!extractYouTubeId(item.url);
  let transcriptText = "";
  let pageContent = "";

  if (item.url) {
    if (isPrivateUrl(item.url)) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
    }

    if (isYouTube) {
      const [stored] = await db.select().from(itemTranscripts).where(eq(itemTranscripts.itemId, id));
      transcriptText = stored?.text?.trim() || "";
      if (!transcriptText) {
        const transcript = await fetchYouTubeTranscript(item.url);
        transcriptText = transcript?.text || "";
      }
    } else {
      pageContent = await fetchSummaryPageText(item.url);
    }
  }

  if (isYouTube && !transcriptText && !item.content?.trim()) {
    return NextResponse.json({
      error: "No transcript was available for this YouTube clip. Add transcript text to the card content, then summarize again.",
    }, { status: 422 });
  }

  const legacyNotes = stripLegacyAiSummary(item.notes || "");
  const userNoteText = (item.noteEntries || [])
    .filter((entry) => !isAiSummary(entry.body))
    .map((entry) => entry.body)
    .filter(Boolean)
    .join("\n\n");

  const context = [
    `Source kind: ${isYouTube ? "YouTube video" : item.url ? "Website or article" : "Saved note"}`,
    `Available evidence: ${transcriptText ? "Video transcript" : pageContent ? "Fetched page text" : "Saved text and metadata only; original source unavailable"}`,
    item.title && `Title: ${item.title}`,
    item.ogTitle && item.ogTitle !== item.title && `Page title: ${item.ogTitle}`,
    item.ogDescription && `${isYouTube ? "Channel/author" : "Description"}: ${item.ogDescription}`,
    item.content && `User content:\n${sourceExcerpt(item.content, 30_000)}`,
    legacyNotes && `User notes:\n${sourceExcerpt(legacyNotes, 10_000)}`,
    userNoteText && `User note entries:\n${sourceExcerpt(userNoteText, 10_000)}`,
    item.url && `URL: ${item.url}`,
    item.siteName && `Site: ${item.siteName}`,
    transcriptText && `YouTube transcript:\n${sourceExcerpt(transcriptText, 80_000)}`,
    pageContent && `Page text:\n${pageContent}`,
  ].filter(Boolean).join("\n\n");

  const evidence = [transcriptText, pageContent, item.content, legacyNotes, userNoteText, !isYouTube && item.ogDescription].filter(Boolean).join(" ");
  if (evidence.replace(/\s+/g, " ").trim().length < 80) {
    return NextResponse.json({ error: "Not enough source content to summarize. Add a description or transcript and try again." }, { status: 422 });
  }

  try {
    const summary = await summarizeWithOpenAI(context, apiKey);
    const noteEntries = upsertAiSummaryEntry(item.noteEntries || [], summary);

    const [updated] = await db
      .update(items)
      .set({
        notes: legacyNotes,
        noteEntries,
        updatedAt: new Date(),
      })
      .where(and(eq(items.id, id), sql`date_trunc('milliseconds', ${items.updatedAt}) = ${item.updatedAt.toISOString()}::timestamp`))
      .returning();

    if (!updated) return NextResponse.json({ error: "This card changed while summarizing. Please try again." }, { status: 409 });

    // The AI summary note entry feeds the embedding input — re-embed so
    // semantic search picks up the summarized content.
    if (embeddingsEnabled()) after(() => updateItemEmbedding(updated.id));

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI summarization failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
