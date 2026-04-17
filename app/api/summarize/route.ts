import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";
import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/summarize
 * Body: { id: "item-uuid" }
 *
 * Summarizes the item's content/URL using Claude and saves it to the notes field.
 * For URLs, fetches the page content first. For YouTube, attempts transcript via oEmbed.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed } = rateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Fetch the item
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // Build context for summarization
  let pageContent = "";

  if (item.url) {
    // Block private/internal URLs
    const { isPrivateUrl } = await import("@/lib/enrich");
    if (isPrivateUrl(item.url)) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(item.url, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          Accept: "text/html",
        },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (res.ok) {
        const html = await res.text();
        // Strip HTML tags, keep text content (rough extraction)
        pageContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 8000);
      }
    } catch {}
  }

  const context = [
    item.title && `Title: ${item.title}`,
    item.ogTitle && item.ogTitle !== item.title && `Page title: ${item.ogTitle}`,
    item.ogDescription && `Description: ${item.ogDescription}`,
    item.content && `User content: ${item.content}`,
    item.url && `URL: ${item.url}`,
    item.siteName && `Site: ${item.siteName}`,
    pageContent && `Page text:\n${pageContent}`,
  ].filter(Boolean).join("\n\n");

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Summarize the following in 3-5 concise bullet points. Focus on key insights and takeaways. If it's a YouTube video or article, capture the main points.

${context}

Reply with ONLY the bullet-point summary, no introduction or conclusion.`,
      }],
    });

    const summary = msg.content[0].type === "text" ? msg.content[0].text : "";

    // Append summary to existing notes
    const existingNotes = item.notes?.trim() || "";
    const newNotes = existingNotes
      ? `${existingNotes}\n\n--- AI Summary ---\n${summary}`
      : `--- AI Summary ---\n${summary}`;

    const [updated] = await db
      .update(items)
      .set({ notes: newNotes, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: "AI summarization failed" }, { status: 500 });
  }
}
