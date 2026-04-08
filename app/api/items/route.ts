import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

async function getUserId() {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id;
}

// GET all items for user
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(items)
    .where(eq(items.userId, userId))
    .orderBy(desc(items.createdAt));

  return NextResponse.json(rows);
}

// POST create new item
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const [row] = await db
    .insert(items)
    .values({
      userId,
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
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const [row] = await db
    .update(items)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .returning();

  return NextResponse.json(row);
}

// DELETE item
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(items).where(and(eq(items.id, id), eq(items.userId, userId)));
  return NextResponse.json({ ok: true });
}
