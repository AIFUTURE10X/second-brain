import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import { checkApiKey } from "@/lib/api-key";
import { normalizeReminderInput } from "@/lib/reminders.mjs";

const VALID_STATUSES = new Set(["pending", "sent", "done"]);

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get("itemId")?.trim();

  const rows = itemId
    ? await db.select().from(reminders).where(eq(reminders.itemId, itemId)).orderBy(asc(reminders.dueAt))
    : await db.select().from(reminders).orderBy(asc(reminders.dueAt));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const input = normalizeReminderInput(await req.json());
    const [row] = await db
      .insert(reminders)
      .values({
        itemId: input.itemId,
        message: input.message,
        dueAt: new Date(input.dueAt),
        status: "pending",
      })
      .returning();

    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Invalid reminder" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: Partial<typeof reminders.$inferInsert> = { updatedAt: new Date() };

  if ("message" in body) updates.message = String(body.message || "").trim();
  if ("dueAt" in body) {
    const dueAt = new Date(body.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      return NextResponse.json({ error: "Valid dueAt is required" }, { status: 400 });
    }
    updates.dueAt = dueAt;
  }
  if ("status" in body) {
    const status = String(body.status || "").trim();
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = status;
    if (status === "pending") updates.sentAt = null;
    if (status === "done" && !("sentAt" in body)) updates.sentAt = null;
  }

  const [row] = await db
    .update(reminders)
    .set(updates)
    .where(eq(reminders.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await db.delete(reminders).where(eq(reminders.id, id));
  return NextResponse.json({ ok: true });
}
