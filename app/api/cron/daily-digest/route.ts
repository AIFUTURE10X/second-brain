import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendTelegram, allowedTelegramIds, verifyCronAuth } from "@/lib/telegram";

/**
 * GET /api/cron/daily-digest
 *
 * Vercel Cron target — runs daily at 00:00 UTC (07:00 Thailand UTC+7).
 * Sends open task count, yesterday's capture count, week total via Telegram.
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

  const openTasks = await db.select().from(items).where(eq(items.type, "task"));
  const openTaskCount = openTasks.length;
  const oldestTask = openTasks
    .map(t => new Date(t.createdAt).getTime())
    .sort((a, b) => a - b)[0];
  const oldestDays = oldestTask ? Math.floor((Date.now() - oldestTask) / 86400000) : 0;

  const [{ count: yesterdayCount }] = await sql`
    SELECT COUNT(*)::int AS count FROM items
    WHERE created_at >= (NOW() - INTERVAL '1 day')::date
      AND created_at <  NOW()::date
  ` as { count: number }[];

  const [{ count: weekCount }] = await sql`
    SELECT COUNT(*)::int AS count FROM items
    WHERE created_at >= NOW() - INTERVAL '7 days'
  ` as { count: number }[];

  const lines = [
    "◆ Daily digest",
    "",
    `☐ Open tasks: ${openTaskCount}${oldestDays > 7 ? ` (oldest ${oldestDays}d)` : ""}`,
    `↓ Yesterday captured: ${yesterdayCount}`,
    `Σ This week: ${weekCount}`,
  ];

  const text = lines.join("\n");

  for (const userId of userIds) {
    await sendTelegram(botToken, userId, text, {
      source: "second-brain:daily-digest", display_name: "Second Brain daily digest", schedule: "daily 07:00 Asia/Bangkok",
    });
  }

  return NextResponse.json({ ok: true, sent: userIds.length, openTasks: openTaskCount, yesterday: yesterdayCount, week: weekCount });
}
