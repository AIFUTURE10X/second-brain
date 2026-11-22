import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { items, categories, type Attachment } from "@/db/schema";
import { ITEM_PUBLIC_COLUMNS } from "@/db/item-columns";
import { enrichUrl } from "@/lib/enrich";
import { checkApiKey } from "@/lib/api-key";
import { embeddingsEnabled } from "@/lib/embeddings.mjs";
import { updateItemEmbedding } from "@/lib/embedding-store";
import { initialReadingStatus } from "@/lib/reading-status.mjs";
import { syncWikiRelations } from "@/lib/wiki-link-store";
import { aiTagAndCategorize } from "@/lib/ai-tagger";
import { appendYouTubeDescriptionLinksToNotes, fetchYouTubeDescriptionLinks, type YouTubeDescriptionLink } from "@/lib/youtube";
import { asc, eq, sql as sqlExpr } from "drizzle-orm";
import { findUrlDuplicates } from "@/lib/duplicate-detection.mjs";
import { parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { saveSchema } from "@/lib/validation";
import { fallbackTitleFromUrl } from "@/lib/url-title";
import { isIdeaTag, withIdeaTag, withoutIdeaTag } from "@/lib/business-idea.mjs";

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
 *   { url, attachments: [{ url, name, contentType, size }] }
 *                                             — files already uploaded via
 *                                               /api/upload (extension PDF capture)
 *
 * All fields are optional except at least one of url/text/title/content/attachments.
 * Optional: type, tags (string[] or comma-string), category, notes
 *   tags: ["business-idea"] sends the card to the AI OS Business Ideas lane
 *
 * AI auto-tagging: If ANTHROPIC_API_KEY is set and no tags/category provided,
 * Claude suggests tags + category automatically.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(saveSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const body = parsed.data as Record<string, unknown>;

  try {
  const url = ((body.url as string) || "").trim();
  const text = ((body.text as string) || "").trim();

  // Annotate mode (roadmap 3.1): highlighted text from the extension lands
  // as a note entry on the existing card for that URL instead of a new card.
  // Falls through to a normal create when no card matches.
  if (body.annotate === true && url && text) {
    const annotated = await annotateExistingCard(url, text);
    if (annotated) {
      after(() => {
        if (embeddingsEnabled()) updateItemEmbedding(annotated.id);
      });
      after(() => syncWikiRelations(annotated.id));
      return NextResponse.json({ annotated: true, id: annotated.id, title: annotated.title });
    }
  }
  const title = ((body.title as string) || "").trim();
  const content = ((body.content as string) || text).trim();
  const notes = ((body.notes as string) || "").trim();
  const attachments = (body.attachments as Attachment[] | undefined) ?? [];
  let category = ((body.category as string) || "").trim();

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

  const fallbackTitle = fallbackTitleFromUrl(url);
  // A saved file's own name beats a title guessed from its URL path.
  const initialTitle = title || attachments[0]?.name || fallbackTitle || "";

  // Normalize the business-idea tag synchronously so it is stored lowercase
  // whatever was sent (the AI OS finds cards with an exact ?tag= match).
  const sendsIdea = tags.some(isIdeaTag);
  if (sendsIdea) tags = withIdeaTag(tags);

  // Auto-create category if explicitly supplied and not yet present.
  if (category) {
    const existingCats = await db.select({ name: categories.name }).from(categories);
    const match = existingCats.find(c => c.name.toLowerCase() === category.toLowerCase());
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
      title: initialTitle,
      content: type === "thought" ? content : (body.content as string || ""),
      url,
      notes,
      tags,
      category,
      attachments,
      pinned: false,
      readingStatus: initialReadingStatus(type),
      reviewedAt: null,
      workflowStatus: "inbox",
      ogTitle: "",
      ogDescription: "",
      ogImage: "",
      siteName: "",
      favicon: "",
    })
    .returning(ITEM_PUBLIC_COLUMNS);

  // Run slow network work (URL OG enrichment, YouTube description links,
  // Claude auto-tagging, OpenAI embeddings, wiki links) post-response so
  // extension/shortcut/automation saves return immediately.
  const needsAiTag = Boolean(withoutIdeaTag(tags).length === 0 && !category && process.env.ANTHROPIC_API_KEY);
  after(async () => {
    try {
      let og = { ogTitle: "", ogDescription: "", ogImage: "", siteName: "", favicon: "" };
      let descriptionLinks: YouTubeDescriptionLink[] = [];
      if (url) {
        [og, descriptionLinks] = await Promise.all([
          enrichUrl(url),
          fetchYouTubeDescriptionLinks(url),
        ]);
      }
      const resolvedTitle = title || og.ogTitle || attachments[0]?.name || fallbackTitle || "";

      let nextTags = tags;
      let nextCategory = category;
      if (needsAiTag) {
        const existingCats = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name));
        const ai = await aiTagAndCategorize({
          title: resolvedTitle,
          content,
          url,
          ogTitle: og.ogTitle,
          ogDescription: og.ogDescription,
          siteName: og.siteName,
          existingCategories: existingCats.map(c => c.name),
        });
        if (ai.tags.length > 0) nextTags = sendsIdea ? withIdeaTag(ai.tags) : ai.tags;
        if (ai.category) {
          nextCategory = ai.category.trim();
          const match = existingCats.find(c => c.name.toLowerCase() === nextCategory.toLowerCase());
          if (match) {
            nextCategory = match.name;
          } else {
            try {
              await db.insert(categories).values({ name: nextCategory });
            } catch {}
          }
        }
      }

      const patch: Partial<typeof items.$inferInsert> = {};
      if (!title && og.ogTitle && resolvedTitle !== initialTitle) patch.title = resolvedTitle;
      if (og.ogTitle || og.ogDescription || og.ogImage || og.siteName || og.favicon) {
        patch.ogTitle = og.ogTitle;
        patch.ogDescription = og.ogDescription;
        patch.ogImage = og.ogImage;
        patch.siteName = og.siteName;
        patch.favicon = og.favicon;
      }
      if (descriptionLinks.length > 0) {
        patch.notes = appendYouTubeDescriptionLinksToNotes(notes, descriptionLinks);
      }
      if (nextTags !== tags) patch.tags = nextTags;
      if (nextCategory && nextCategory !== category) patch.category = nextCategory;

      if (Object.keys(patch).length > 0) {
        await db.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, row.id));
      }
    } catch (error) {
      console.error("Post-save enrichment failed:", error);
    }

    await Promise.all([
      embeddingsEnabled() ? updateItemEmbedding(row.id) : Promise.resolve(),
      syncWikiRelations(row.id),
    ]);
  });

  return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// Find the card matching this URL (canonicalised — tracking params, www.,
// hashes ignored) and append the highlight as a note entry.
async function annotateExistingCard(url: string, text: string): Promise<{ id: string; title: string | null } | null> {
  const candidates = await db
    .select({ id: items.id, title: items.title, url: items.url, noteEntries: items.noteEntries })
    .from(items)
    .where(sqlExpr`${items.url} <> ''`);
  const matches = findUrlDuplicates(url, candidates.filter(c => c.url)) as typeof candidates;
  const target = matches[0];
  if (!target) return null;

  const now = new Date().toISOString();
  const noteEntries = [
    ...(target.noteEntries || []),
    { id: crypto.randomUUID(), body: text, createdAt: now, updatedAt: now },
  ];
  const [row] = await db
    .update(items)
    .set({ noteEntries, updatedAt: new Date() })
    .where(eq(items.id, target.id))
    .returning({ id: items.id, title: items.title });
  return row ?? null;
}
