import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegram, allowedTelegramIds, verifyCronAuth } from "@/lib/telegram";
import { isMemoryOfWeekEnabled, MEMORY_OF_WEEK_ENABLED_KEY } from "@/lib/telegram-memory-settings.mjs";

/**
 * GET /api/cron/memory-of-week
 *
 * Vercel Cron target — runs Sunday 02:00 UTC (09:00 Thailand UTC+7).
 * Picks a random type=memory item and sends it via Telegram to all allowed users.
 * Configure in vercel.json under the `crons` array.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const userIds = allowedTelegramIds();
  if (!botToken || userIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Telegram not configured" }, { status: 500 });
  }

  const settingRows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, MEMORY_OF_WEEK_ENABLED_KEY))
    .limit(1);
  if (!isMemoryOfWeekEnabled(settingRows[0]?.value)) {
    return NextResponse.json({ ok: true, sent: 0, reason: "memories disabled" });
  }

  const memories = await db.select().from(items).where(eq(items.type, "memory"));
  if (memories.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no memories" });
  }

  const memory = memories[Math.floor(Math.random() * memories.length)];
  const text = `💡 Memory of the week\n\n${memory.title || "Untitled"}${memory.content ? `\n\n${memory.content}` : ""}`;

  for (const userId of userIds) {
    await sendTelegram(botToken, userId, text);
  }

  return NextResponse.json({ ok: true, sent: userIds.length, memoryId: memory.id, pool: memories.length });
}
