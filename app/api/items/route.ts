import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/db";
import { items, categories } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { enrichUrl } from "@/lib/enrich";
import { checkApiKey } from "@/lib/api-key";
import { aiTagAndCategorize } from "@/lib/ai-tagger";
import { shouldEnrichUrlOnUpdate } from "@/lib/item-updates.mjs";
import { buildItemSearchTsQuery } from "@/lib/item-search";
import { deriveTaskCompletion, normalizeChecklistItems } from "@/lib/task-checklists";
import { appendYouTubeDescriptionLinksToNotes, fetchYouTubeDescriptionLinks, type YouTubeDescriptionLink } from "@/lib/youtube";

function prepareTaskFields(
  type: unknown,
  incomingChecklistItems: unknown,
  fallbackChecklistItems: unknown,
  fallbackCompleted: unknown,
  fallbackCompletedAt: unknown,
) {
  if (type !== "task") {
    return {
      checklistItems: [],
      completed: false,
      completedAt: null,
    };
  }

  const checklistItems = normalizeChecklistItems(
    incomingChecklistItems === undefined ? fallbackChecklistItems : incomingChecklistItems
  );
  const derived = deriveTaskCompletion(
    checklistItems,
    fallbackCompleted === true,
    fallbackCompletedAt instanceof Date
      ? fallbackCompletedAt.toISOString()
      : typeof fallbackCompletedAt === "string"
        ? fallbackCompletedAt
        : null,
  );
  return {
    checklistItems,
    completed: derived.completed,
    completedAt: derived.completedAt ? new Date(derived.completedAt) : null,
  };
}

// GET all items — supports ?q= for full-text search
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const q = url.searchParams.get("q")?.trim();

  if (id) {
    const [row] = await db.select().from(items).where(eq(items.id, id));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  }

  if (q) {
    // Full-text search against the weighted, GIN-indexed search_tsv column
    // (see db/schema.ts — covers title, tags, category, body, note entries,
    // checklist rows, and link metadata).
    const tsquery = buildItemSearchTsQuery(q);
    if (!tsquery) return NextResponse.json([]);
    // Alias snake_case columns to camelCase so search results match the
    // Drizzle-select shape the frontend expects.
    const rows = await sql`
      SELECT
        id, type, title, content, url, notes, tags, category, pinned, attachments,
        favourite,
        completed,
        action_required AS "actionRequired",
        checklist_items AS "checklistItems",
        note_entries AS "noteEntries",
        favicon,
        og_title AS "ogTitle",
        og_description AS "ogDescription",
        og_image AS "ogImage",
        site_name AS "siteName",
        completed_at AS "completedAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM items, to_tsquery('english', ${tsquery}) AS query
      WHERE search_tsv @@ query
      ORDER BY pinned DESC,
               ts_rank_cd(search_tsv, query) DESC,
               created_at DESC
    `;
    if (rows.length > 0) return NextResponse.json(rows);
    // Zero exact hits — trigram fallback over titles so typos still surface
    // cards ("recat" finds "react"). Flagged via header rather than a body
    // shape change so existing clients that expect a bare array keep working.
    try {
      const fuzzy = await sql`
        SELECT
          id, type, title, content, url, notes, tags, category, pinned, attachments,
          favourite,
          completed,
          action_required AS "actionRequired",
          checklist_items AS "checklistItems",
          note_entries AS "noteEntries",
          favicon,
          og_title AS "ogTitle",
          og_description AS "ogDescription",
          og_image AS "ogImage",
          site_name AS "siteName",
          completed_at AS "completedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM items
        WHERE word_similarity(${q}, title) > 0.3
        ORDER BY pinned DESC,
                 word_similarity(${q}, title) DESC,
                 created_at DESC
        LIMIT 25
      `;
      return NextResponse.json(fuzzy, { headers: { "x-search-fuzzy": "1" } });
    } catch (error) {
      // pg_trgm not installed yet (scripts/db-setup.sql) — degrade to no results.
      console.error("Fuzzy search fallback failed:", error);
      return NextResponse.json([]);
    }
  }

  const rows = await db.select().from(items).orderBy(desc(items.pinned), desc(items.createdAt));
  return NextResponse.json(rows);
}

// POST create new item
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  const url = body.url?.trim() || "";

  // Auto-enrich if URL is provided and no og data was passed
  let og = { ogTitle: "", ogDescription: "", ogImage: "", siteName: "", favicon: "" };
  let descriptionLinks: YouTubeDescriptionLink[] = [];
  if (url) {
    if (!body.ogTitle) {
      og = await enrichUrl(url);
    }
    descriptionLinks = await fetchYouTubeDescriptionLinks(url);
  }

  let itemTags: string[] = body.tags || [];
  let itemCategory: string = body.category || "";

  // AI auto-tag + auto-categorize when no tags/category provided
  if (itemTags.length === 0 && !itemCategory && process.env.ANTHROPIC_API_KEY) {
    const existingCats = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name));
    const ai = await aiTagAndCategorize({
      title: body.title || og.ogTitle || "",
      content: body.content || "",
      url,
      ogTitle: og.ogTitle,
      ogDescription: og.ogDescription,
      siteName: og.siteName,
      existingCategories: existingCats.map(c => c.name),
    });
    if (ai.tags.length > 0) itemTags = ai.tags;
    if (ai.category) {
      itemCategory = ai.category.trim();
    }
  }

  // Auto-create category if it doesn't exist (from AI or user input)
  if (itemCategory) {
    itemCategory = itemCategory.trim();
    const existingCats2 = await db.select({ name: categories.name }).from(categories);
    const match = existingCats2.find(c => c.name.toLowerCase() === itemCategory.toLowerCase());
    if (match) {
      itemCategory = match.name; // preserve existing casing
    } else {
      try {
        await db.insert(categories).values({ name: itemCategory });
      } catch {}
    }
  }

  const taskFields = prepareTaskFields(
    body.type || "note",
    body.checklistItems,
    [],
    body.completed,
    body.completedAt,
  );

  const [row] = await db
    .insert(items)
    .values({
      type: body.type || "note",
      title: body.title || og.ogTitle || "",
      content: body.content || "",
      url,
      notes: appendYouTubeDescriptionLinksToNotes(body.notes || "", descriptionLinks),
      tags: itemTags,
      category: itemCategory,
      pinned: body.pinned || false,
      checklistItems: taskFields.checklistItems,
      completed: taskFields.completed,
      completedAt: taskFields.completedAt,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      ogTitle: body.ogTitle || og.ogTitle || "",
      ogDescription: body.ogDescription || og.ogDescription || "",
      ogImage: body.ogImage || og.ogImage || "",
      siteName: body.siteName || og.siteName || "",
      favicon: body.favicon || og.favicon || "",
    })
    .returning();

  return NextResponse.json(row);
}

// PUT update item
export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [current] = await db.select().from(items).where(eq(items.id, id));
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const nextType = updates.type || current.type;

  if (shouldEnrichUrlOnUpdate({ currentUrl: current.url, nextUrl: updates.url, nextOgTitle: updates.ogTitle })) {
    const og = await enrichUrl(updates.url);
    updates.ogTitle = og.ogTitle;
    updates.ogDescription = og.ogDescription;
    updates.ogImage = og.ogImage;
    updates.siteName = og.siteName;
    updates.favicon = og.favicon;
  }

  // Auto-create category if it doesn't exist
  if (updates.category) {
    updates.category = updates.category.trim();
    const existingCats = await db.select({ name: categories.name }).from(categories);
    const match = existingCats.find(c => c.name.toLowerCase() === updates.category.toLowerCase());
    if (match) {
      updates.category = match.name; // preserve existing casing
    } else {
      try {
        await db.insert(categories).values({ name: updates.category });
      } catch {}
    }
  }

  const taskFields = prepareTaskFields(
    nextType,
    updates.checklistItems,
    current.checklistItems,
    current.completed,
    current.completedAt,
  );

  const [row] = await db
    .update(items)
    .set({
      ...updates,
      checklistItems: taskFields.checklistItems,
      completed: taskFields.completed,
      completedAt: taskFields.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(items.id, id))
    .returning();

  return NextResponse.json(row);
}

// DELETE item
export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(items).where(eq(items.id, id));
  return NextResponse.json({ ok: true });
}
