import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";
import { parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { settingsPutSchema } from "@/lib/validation";
import { WORKSPACE_PREFIX } from "@/lib/workspace-model.mjs";

// GET /api/settings           → all settings as { key: value }
// GET /api/settings?key=foo   → just that one
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const key = new URL(req.url).searchParams.get("key");
    const rows = key
      ? await db.select().from(settings).where(eq(settings.key, key))
      : await db.select().from(settings).where(sql`NOT starts_with(${settings.key}, ${WORKSPACE_PREFIX})`);

    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.key] = r.value;
    return NextResponse.json(map);
  } catch (error) {
    return serverError(error);
  }
}

// PUT /api/settings  body: { key: string, value: any }
// Upserts the key with the new value.
export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(settingsPutSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const body = parsed.data;
  if (body.key.startsWith(WORKSPACE_PREFIX)) return NextResponse.json({ error: "Use the versioned workspace API for workspace records." }, { status: 400 });

  try {
    await db
      .insert(settings)
      .values({ key: body.key, value: body.value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: body.value, updatedAt: new Date() },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}

// DELETE /api/settings?key=foo  (or body { keys: [...] })
export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const single = url.searchParams.get("key");
    if (single?.startsWith(WORKSPACE_PREFIX)) return NextResponse.json({ error: "Workspace records are protected from settings deletion." }, { status: 400 });
    if (single) {
      await db.delete(settings).where(eq(settings.key, single));
      return NextResponse.json({ ok: true });
    }
    const body = await req.json().catch(() => ({}));
    if (Array.isArray(body?.keys) && body.keys.length > 0) {
      if (body.keys.some((key: unknown) => String(key).startsWith(WORKSPACE_PREFIX))) return NextResponse.json({ error: "Workspace records are protected from settings deletion." }, { status: 400 });
      await db.delete(settings).where(inArray(settings.key, body.keys.map(String)));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
