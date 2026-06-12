import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
import { enrichUrl } from "@/lib/enrich";
import { requireAuth } from "@/lib/auth";
import { aiTagAndCategorize } from "@/lib/ai-tagger";
import { appendYouTubeDescriptionLinksToNotes, fetchYouTubeDescriptionLinks, type YouTubeDescriptionLink } from "@/lib/youtube";
import { asc } from "drizzle-orm";

/**
 * POST /api/save?key=API_SECRET
 *
 * Simplified save endpoint for automation (browser extension, Telegram bot,
 * Zapier, iOS Shortcuts, scripts, etc.).
 *
 * Accepts:
 *   { url: "https://..." }                    — auto-enriches, saves as "link"
 *   { url: "https://...", notes: "my note" }  — link with personal annotation
 *   { text: "some thought" }                  — saves as "thought"
 *   { title: "...", content: "..." }          — saves as "note"
 *
 * All fields are optional except at least one of url/text/title/content.
 * Optional: type, tags (string[] or comma-string), category, notes
 *
 * AI auto-tagging: If ANTHROPIC_API_KEY is set and no tags/category provided,
 * Claude suggests tags + category automatically.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = ((body.url as string) || "").trim();
  const text = ((body.text as string) || "").trim();
  const title = ((body.title as string) || "").trim();
  const content = ((body.content as string) || text).trim();
  const notes = ((body.notes as string) || "").trim();
  let category = ((body.category as string) || "").trim();

  if (!url && !title && !content) {
    return NextResponse.json({ error: "Provide at least url, text, title, or content" }, { status: 400 });
  }

  // Parse tags: accept string[] or comma-separated string
  let tags: string[] = [];
  if (Array.isArray(body.tags)) {
    tags = body.tags.map(String).filter(Boolean);
  } else if (typeof body.tags === "string") {
    tags = body.tags.split(",").map(t => t.trim()).filter(Boolean);
  }

  // Auto-detect type
  let type = (body.type as string) || "";
  if (!type) {
    if (url) type = "link";
    else if (!title && content) type = "thought";
    else type = "note";
  }

  // Auto-enrich URL
  let og = { ogTitle: "", ogDescription: "", ogImage: "", siteName: "", favicon: "" };
  let descriptionLinks: YouTubeDescriptionLink[] = [];
  if (url) {
    og = await enrichUrl(url);
    descriptionLinks = await fetchYouTubeDescriptionLinks(url);
  }

  // AI auto-tag + auto-categorize when no tags/category provided
  if (tags.length === 0 && !category && process.env.ANTHROPIC_API_KEY) {
    const existingCats = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name));
    const ai = await aiTagAndCategorize({
      title: title || og.ogTitle,
      content,
      url,
      ogTitle: og.ogTitle,
      ogDescription: og.ogDescription,
      siteName: og.siteName,
      existingCategories: existingCats.map(c => c.name),
    });
    if (ai.tags.length > 0) tags = ai.tags;
    if (ai.category) category = ai.category.trim();
  }

  // Auto-create category if it doesn't exist
  if (category) {
    const existingCats2 = await db.select({ name: categories.name }).from(categories);
    const match = existingCats2.find(c => c.name.toLowerCase() === category.toLowerCase());
    if (match) {
      category = match.name; // preserve existing casing
    } else {
      try {
        await db.insert(categories).values({ name: category });
      } catch {}
    }
  }

  const [row] = await db
    .insert(items)
    .values({
      type,
      title: title || og.ogTitle || "",
      content: type === "thought" ? content : (body.content as string || ""),
      url,
      notes: appendYouTubeDescriptionLinksToNotes(notes, descriptionLinks),
      tags,
      category,
      pinned: false,
      ogTitle: og.ogTitle,
      ogDescription: og.ogDescription,
      ogImage: og.ogImage,
      siteName: og.siteName,
      favicon: og.favicon,
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
