import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/db";
import { items } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { enrichUrl } from "@/lib/enrich";
import { checkApiKey } from "@/lib/api-key";

// GET all items — supports ?q= for full-text search
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const q = new URL(req.url).searchParams.get("q")?.trim();

  if (q) {
    // Full-text search across title, content, notes, og_title, og_description
    // Convert query to tsquery format: "react hooks" → "react & hooks"
    const tsquery = q.split(/\s+/).filter(Boolean).join(" & ");
    const rows = await sql`
      SELECT * FROM items
      WHERE to_tsvector('english',
        coalesce(title,'') || ' ' ||
        coalesce(content,'') || ' ' ||
        coalesce(notes,'') || ' ' ||
        coalesce(og_title,'') || ' ' ||
        coalesce(og_description,'')
      ) @@ to_tsquery('english', ${tsquery + ':*'})
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows);
  }

  const rows = await db.select().from(items).orderBy(desc(items.createdAt));
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

  const [row] = await db
    .insert(items)
    .values({
      type: body.type || "note",
      title: body.title || og.ogTitle || "",
      content: body.content || "",
      url,
      notes: body.notes || "",
      tags: body.tags || [],
      category: body.category || "",
      pinned: body.pinned || false,
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
