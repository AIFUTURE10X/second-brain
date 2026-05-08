import { NextRequest, NextResponse } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { items, reminders } from "@/db/schema";
import { allowedTelegramIds, sendTelegram, verifyCronAuth } from "@/lib/telegram";
import { formatReminderTelegramMessage } from "@/lib/reminders.mjs";

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const userIds = allowedTelegramIds();
  if (!botToken || userIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Telegram not configured" }, { status: 500 });
  }

  const now = new Date();
  const dueRows = await db
    .select({ reminder: reminders, item: items })
    .from(reminders)
    .innerJoin(items, eq(reminders.itemId, items.id))
    .where(and(eq(reminders.status, "pending"), lte(reminders.dueAt, now)));

  const appUrl = appBaseUrl(req);
  let sent = 0;

  for (const row of dueRows) {
    const text = formatReminderTelegramMessage({
      reminder: {
        ...row.reminder,
        dueAt: row.reminder.dueAt.toISOString(),
      },
      item: row.item,
      appUrl,
      timeZone: process.env.REMINDER_TIME_ZONE || "Asia/Bangkok",
    });

    for (const userId of userIds) {
      await sendTelegram(botToken, userId, text);
      sent += 1;
    }

    await db
      .update(reminders)
      .set({ status: "sent", sentAt: now, updatedAt: now })
      .where(eq(reminders.id, row.reminder.id));
  }

  return NextResponse.json({ ok: true, reminders: dueRows.length, sent });
}

function appBaseUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured;

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return new URL(req.url).origin;
}
