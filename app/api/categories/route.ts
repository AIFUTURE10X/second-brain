import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq, asc, inArray, sql } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";
import { jsonError, parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { categoryCreateSchema, categoryReorderSchema, categoryUpdateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const rows = await db
      .select()
      .from(categories)
      .orderBy(asc(categories.position), asc(categories.name));
    return NextResponse.json(rows);
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(categoryCreateSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const body = parsed.data;

  try {
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
  } catch (error) {
    return serverError(error);
  }
}

// PATCH — bulk reorder. Body: { orders: [{id, position}, ...] }
export async function PATCH(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(categoryReorderSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const orders = parsed.data.orders;
  if (orders.length === 0) return NextResponse.json({ ok: true });

  try {
    await Promise.all(
      orders.map((o: { id: string; position: number }) =>
        db.update(categories).set({ position: o.position }).where(eq(categories.id, o.id))
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}

// PUT — edit category (rename, recolor, reparent)
export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(categoryUpdateSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const { id, ...updates } = parsed.data;

  try {
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
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError(400, "Missing id");

  try {
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
  } catch (error) {
    return serverError(error);
  }
}
