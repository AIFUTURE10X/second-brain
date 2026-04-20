import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq, asc, inArray, sql } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const rows = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const parentId = body.parentId || null;
  const [{ maxPos }] = await db
    .select({ maxPos: sql<number>`COALESCE(MAX(${categories.position}), -1)` })
    .from(categories)
    .where(parentId ? eq(categories.parentId, parentId) : sql`${categories.parentId} IS NULL`);

  const [row] = await db
    .insert(categories)
    .values({
      name: body.name.trim(),
      color: body.color || "#E8A838",
      parentId,
      position: (maxPos ?? -1) + 1,
    })
    .returning();

  return NextResponse.json(row);
}

// PATCH — bulk reorder. Body: { orders: [{id, position}, ...] }
export async function PATCH(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  const orders = Array.isArray(body?.orders) ? body.orders : [];
  if (orders.length === 0) return NextResponse.json({ ok: true });

  await Promise.all(
    orders.map((o: { id: string; position: number }) =>
      db.update(categories).set({ position: o.position }).where(eq(categories.id, o.id))
    )
  );

  return NextResponse.json({ ok: true });
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

  // Fetch the target category and its children to collect all names
  const [target] = await db.select().from(categories).where(eq(categories.id, id));
  if (!target) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const children = await db.select().from(categories).where(eq(categories.parentId, id));
  const allNames = [target.name, ...children.map(c => c.name)];

  // Batch delete children + target
  if (children.length > 0) {
    await db.delete(categories).where(eq(categories.parentId, id));
  }
  await db.delete(categories).where(eq(categories.id, id));

  // Clear category on orphaned items
  const { items: itemsTable } = await import("@/db/schema");
  await db.update(itemsTable).set({ category: "" }).where(inArray(itemsTable.category, allNames));

  return NextResponse.json({ ok: true });
}
