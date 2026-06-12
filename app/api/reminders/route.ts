import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import { checkApiKey } from "@/lib/api-key";
import { normalizeReminderInput } from "@/lib/reminders.mjs";
import { jsonError, parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { reminderUpdateSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId")?.trim();

    const rows = itemId
      ? await db.select().from(reminders).where(eq(reminders.itemId, itemId)).orderBy(asc(reminders.dueAt))
      : await db.select().from(reminders).orderBy(asc(reminders.dueAt));

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

  // normalizeReminderInput throws intentional validation messages → 400.
  let input: ReturnType<typeof normalizeReminderInput>;
  try {
    input = normalizeReminderInput(raw.body);
  } catch (err) {
    return jsonError(400, (err as Error).message || "Invalid reminder");
  }

  try {
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
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(reminderUpdateSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const body = parsed.data;

  const updates: Partial<typeof reminders.$inferInsert> = { updatedAt: new Date() };

  if (body.message !== undefined) updates.message = body.message.trim();
  if (body.dueAt !== undefined) {
    const dueAt = new Date(body.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      return jsonError(400, "Valid dueAt is required");
    }
    updates.dueAt = dueAt;
  }
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "pending") updates.sentAt = null;
    if (body.status === "done" && body.sentAt === undefined) updates.sentAt = null;
  }

  try {
    const [row] = await db
      .update(reminders)
      .set(updates)
      .where(eq(reminders.id, body.id))
      .returning();

    if (!row) return jsonError(404, "Not found");
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return jsonError(400, "Missing id");

  try {
    await db.delete(reminders).where(eq(reminders.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
