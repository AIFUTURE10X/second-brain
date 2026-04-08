import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// GET all items
export async function GET() {
  const rows = await db.select().from(items).orderBy(desc(items.createdAt));
  return NextResponse.json(rows);
}

// POST create new item
export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(items)
    .values({
      type: body.type || "note",
      title: body.title || "",
      content: body.content || "",
      url: body.url || "",
      tags: body.tags || [],
      pinned: body.pinned || false,
    })
    .returning();

  return NextResponse.json(row);
}

// PUT update item
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [row] = await db
    .update(items)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning();

  return NextResponse.json(row);
}

// DELETE item
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(items).where(eq(items.id, id));
  return NextResponse.json({ ok: true });
}
