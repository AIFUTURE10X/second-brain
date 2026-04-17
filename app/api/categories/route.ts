import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq, asc, isNull } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const rows = await db.select().from(categories).orderBy(asc(categories.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const [row] = await db
    .insert(categories)
    .values({
      name: body.name.trim(),
      color: body.color || "#E8A838",
      parentId: body.parentId || null,
    })
    .returning();

  return NextResponse.json(row);
}

// PUT — edit category (rename, recolor, reparent)
export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // If renaming, also update all items that reference the old name
  if (updates.name) {
    const [old] = await db.select().from(categories).where(eq(categories.id, id));
    if (old && old.name !== updates.name.trim()) {
      const { items: itemsTable } = await import("@/db/schema");
      await db.update(itemsTable)
        .set({ category: updates.name.trim() })
        .where(eq(itemsTable.category, old.name));
    }
  }

  const [row] = await db
    .update(categories)
    .set({
      ...(updates.name && { name: updates.name.trim() }),
      ...(updates.color && { color: updates.color }),
      ...(updates.parentId !== undefined && { parentId: updates.parentId || null }),
    })
    .where(eq(categories.id, id))
    .returning();

  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Also delete child categories
  const children = await db.select().from(categories).where(eq(categories.parentId, id));
  for (const child of children) {
    await db.delete(categories).where(eq(categories.id, child.id));
  }

  await db.delete(categories).where(eq(categories.id, id));
  return NextResponse.json({ ok: true });
}
