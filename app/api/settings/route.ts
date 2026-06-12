import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

// GET /api/settings           → all settings as { key: value }
// GET /api/settings?key=foo   → just that one
export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const key = new URL(req.url).searchParams.get("key");
  const rows = key
    ? await db.select().from(settings).where(eq(settings.key, key))
    : await db.select().from(settings);

  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  return NextResponse.json(map);
}

// PUT /api/settings  body: { key: string, value: any }
// Upserts the key with the new value.
export async function PUT(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const body = await req.json();
  if (!body?.key || typeof body.key !== "string") {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  if (body.value === undefined) {
    return NextResponse.json({ error: "Missing value" }, { status: 400 });
  }

  await db
    .insert(settings)
    .values({ key: body.key, value: body.value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: body.value, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
}

// DELETE /api/settings?key=foo  (or body { keys: [...] })
export async function DELETE(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const single = url.searchParams.get("key");
  if (single) {
    await db.delete(settings).where(eq(settings.key, single));
    return NextResponse.json({ ok: true });
  }
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body?.keys) && body.keys.length > 0) {
    await db.delete(settings).where(inArray(settings.key, body.keys));
  }
  return NextResponse.json({ ok: true });
}
