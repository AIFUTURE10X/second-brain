import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { items, type NoteEntry } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";
import { embeddingsEnabled } from "@/lib/embeddings.mjs";
import { updateItemEmbedding } from "@/lib/embedding-store";
import { isPrivateUrl } from "@/lib/enrich";
import { rateLimit } from "@/lib/rate-limit";
import { extractYouTubeId, fetchYouTubeTranscript } from "@/lib/youtube";

const AI_SUMMARY_HEADER = "--- AI Summary ---";
const DEFAULT_OPENAI_SUMMARY_MODEL = "gpt-5.4-mini";

export const maxDuration = 60;

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

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

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

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
      const transcript = await fetchYouTubeTranscript(item.url);
      transcriptText = transcript?.text || "";
    } else {
      pageContent = await fetchPageText(item.url);
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
    item.title && `Title: ${item.title}`,
    item.ogTitle && item.ogTitle !== item.title && `Page title: ${item.ogTitle}`,
    item.ogDescription && `Description: ${item.ogDescription}`,
    item.content && `User content:\n${item.content}`,
    legacyNotes && `User notes:\n${legacyNotes}`,
    userNoteText && `User note entries:\n${userNoteText}`,
    item.url && `URL: ${item.url}`,
    item.siteName && `Site: ${item.siteName}`,
    transcriptText && `YouTube transcript:\n${transcriptText.slice(0, 20_000)}`,
    pageContent && `Page text:\n${pageContent}`,
  ].filter(Boolean).join("\n\n");

  if (context.replace(/\s+/g, " ").trim().length < 80) {
    return NextResponse.json({ error: "Not enough content to summarize" }, { status: 422 });
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
      .where(eq(items.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // The AI summary note entry feeds the embedding input — re-embed so
    // semantic search picks up the summarized content.
    if (embeddingsEnabled()) after(() => updateItemEmbedding(updated.id));

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI summarization failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchPageText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) return "";
    const html = await res.text();
    return stripHtmlToText(html, 8_000);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtmlToText(html: string, limit: number): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function isAiSummary(body: string | null | undefined): boolean {
  return (body || "").trim().startsWith(AI_SUMMARY_HEADER);
}

function stripLegacyAiSummary(notes: string): string {
  const index = notes.indexOf(AI_SUMMARY_HEADER);
  return (index === -1 ? notes : notes.slice(0, index)).trim();
}

function upsertAiSummaryEntry(entries: NoteEntry[], summary: string): NoteEntry[] {
  const now = new Date().toISOString();
  const body = `${AI_SUMMARY_HEADER}\n${summary.trim()}`;
  const existing = entries.find((entry) => isAiSummary(entry.body));

  if (existing) {
    return entries.map((entry) => isAiSummary(entry.body)
      ? { ...entry, body, updatedAt: now }
      : entry);
  }

  return [
    ...entries,
    {
      id: crypto.randomUUID(),
      body,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function summarizeWithOpenAI(context: string, apiKey: string): Promise<string> {
  const model = process.env.OPENAI_SUMMARY_MODEL || DEFAULT_OPENAI_SUMMARY_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "Create concise, accurate summaries for a personal second brain. Use only the provided source material. Reply with only 3-5 bullet points; no introduction or conclusion.",
      input: `Summarize the following saved card. If it includes a YouTube transcript, summarize the actual transcript content. If the transcript is unavailable and only metadata is present, summarize only the available metadata without pretending to know the video.\n\n${context}`,
      max_output_tokens: 600,
    }),
  });

  const data = await response.json().catch(() => ({})) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(sanitiseOpenAIError(data.error?.message || "OpenAI summarization failed"));
  }

  const text = extractOpenAIText(data).trim();
  if (!text) throw new Error("OpenAI returned an empty summary");

  return text;
}

function sanitiseOpenAIError(message: string): string {
  if (/incorrect api key|invalid api key|invalid_api_key/i.test(message)) {
    return "OpenAI API key is invalid. Update OPENAI_API_KEY and try again.";
  }

  return message;
}

function extractOpenAIText(data: OpenAIResponse): string {
  if (typeof data.output_text === "string") return data.output_text;

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}
