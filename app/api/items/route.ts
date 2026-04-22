import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/db";
import { items, categories } from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { enrichUrl } from "@/lib/enrich";
import { checkApiKey } from "@/lib/api-key";
import { aiTagAndCategorize } from "@/lib/ai-tagger";

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
    // Full-text search across title, content, notes, og_title, og_description.
    // Sanitize special PostgreSQL tsquery characters to prevent injection.
    const sanitized = q.replace(/[!|&():*<>'\\]/g, " ").trim();
    if (!sanitized) return NextResponse.json([]);
    // OR each term with prefix matching so "claude code" finds cards
    // containing "claude" OR anything starting with "code" — handy while
    // typing. Each term gets :* (prefix), joined with | (OR).
    const terms = sanitized.split(/\s+/).filter(Boolean);
    const tsquery = terms.map(t => `${t}:*`).join(" | ");
    // ts_rank_cd ranks matches so cards hitting more of the terms float up.
    // Alias snake_case columns to camelCase so search results match the
    // Drizzle-select shape the frontend expects.
    const rows = await sql`
      SELECT
        id, type, title, content, url, notes, tags, category, pinned, attachments,
        favicon,
        og_title AS "ogTitle",
        og_description AS "ogDescription",
        og_image AS "ogImage",
        site_name AS "siteName",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM items, to_tsquery('english', ${tsquery}) AS query
      WHERE to_tsvector('english',
        coalesce(title,'') || ' ' ||
        coalesce(content,'') || ' ' ||
        coalesce(notes,'') || ' ' ||
        coalesce(og_title,'') || ' ' ||
        coalesce(og_description,'')
      ) @@ query
      ORDER BY pinned DESC,
               ts_rank_cd(to_tsvector('english',
                 coalesce(title,'') || ' ' ||
                 coalesce(content,'') || ' ' ||
                 coalesce(notes,'') || ' ' ||
                 coalesce(og_title,'') || ' ' ||
                 coalesce(og_description,'')
               ), query) DESC,
               created_at DESC
    `;
    return NextResponse.json(rows);
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
  if (url && !body.ogTitle) {
    og = await enrichUrl(url);
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

  const [row] = await db
    .insert(items)
    .values({
      type: body.type || "note",
      title: body.title || og.ogTitle || "",
      content: body.content || "",
      url,
      notes: body.notes || "",
      tags: itemTags,
      category: itemCategory,
      pinned: body.pinned || false,
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

  if (updates.url && !updates.ogTitle) {
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

  const [row] = await db
    .update(items)
    .set({ ...updates, updatedAt: new Date() })
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
