import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
import { enrichUrl } from "@/lib/enrich";
import { aiTagAndCategorize } from "@/lib/ai-tagger";
import { asc } from "drizzle-orm";

/**
 * POST /api/telegram
 *
 * Telegram Bot webhook. Receives messages and saves them to Second Brain.
 *
 * Setup:
 * 1. Create a bot via @BotFather on Telegram
 * 2. Set TELEGRAM_BOT_TOKEN env var in Vercel
 * 3. Register webhook:
 *    curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://second-brain-bice-two.vercel.app/api/telegram"
 *
 * Usage: send or forward any message/link to your bot → saved to Brain.
 */
export async function POST(req: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" });
  }

  // Verify webhook signature if secret is configured
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const token = req.headers.get("x-telegram-bot-api-secret-token");
    if (token !== webhookSecret) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  const update = await req.json();
  const message = update.message || update.channel_post;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const rawText = message.text || message.caption || "";

  // Detect task prefix: "/t " or "/task " → save as task instead of thought/link
  const taskMatch = rawText.match(/^\/(task|t)\s+([\s\S]+)/i);
  const isTaskCommand = !!taskMatch;
  const text = isTaskCommand ? taskMatch![2].trim() : rawText;

  // Lock the bot to a single user ID (allowlist) — prevents strangers who find the bot
  // username from spamming the owner's Brain. Accepts a single ID or a comma-separated list.
  const allowedIds = (process.env.TELEGRAM_ALLOWED_USER_ID || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const senderId = message.from?.id?.toString();
  if (allowedIds.length > 0 && (!senderId || !allowedIds.includes(senderId))) {
    await sendTelegram(botToken, chatId, "This bot is private.");
    return NextResponse.json({ ok: true });
  }

  // Extract URLs from the message
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const url = urlMatch?.[0] || "";
  const remainingText = text.replace(/https?:\/\/[^\s]+/g, "").trim();

  if (!url && !remainingText) {
    await sendTelegram(botToken, chatId, "Send me a URL, text to save as a thought, or '/t buy milk' to add a task.");
    return NextResponse.json({ ok: true });
  }

  try {
    // Auto-enrich URL
    let og = { ogTitle: "", ogDescription: "", ogImage: "", siteName: "", favicon: "" };
    if (url) {
      og = await enrichUrl(url);
    }

    // Determine type + content
    const type = isTaskCommand ? "task" : url ? "link" : "thought";
    const title = isTaskCommand
      ? text.slice(0, 200)
      : og.ogTitle || remainingText.slice(0, 100) || "";
    const content = isTaskCommand ? "" : url ? remainingText : text;
    const notes = !isTaskCommand && url && remainingText ? remainingText : "";

    // AI auto-tag if available — skip for tasks (they're lightweight)
    let tags: string[] = [];
    let category = "";
    if (!isTaskCommand && process.env.ANTHROPIC_API_KEY) {
      const existingCats = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name));
      const ai = await aiTagAndCategorize({
        title,
        content,
        url,
        ogTitle: og.ogTitle,
        ogDescription: og.ogDescription,
        siteName: og.siteName,
        existingCategories: existingCats.map(c => c.name),
      });
      tags = ai.tags;
      if (ai.category) category = ai.category.trim();
    }

    // Auto-create category if it doesn't exist
    if (category) {
      const existingCats2 = await db.select({ name: categories.name }).from(categories);
      const match = existingCats2.find(c => c.name.toLowerCase() === category.toLowerCase());
      if (match) {
        category = match.name;
      } else {
        try {
          await db.insert(categories).values({ name: category });
        } catch {}
      }
    }

    // Save to DB
    const [row] = await db
      .insert(items)
      .values({
        type,
        title,
        content: type === "thought" ? content : "",
        url,
        notes,
        tags,
        category,
        pinned: false,
        ogTitle: og.ogTitle,
        ogDescription: og.ogDescription,
        ogImage: og.ogImage,
        siteName: og.siteName,
        favicon: og.favicon,
      })
      .returning();

    // Reply with confirmation
    const emoji = type === "task" ? "☐" : type === "link" ? "◈" : "◉";
    const label = type === "task" ? "Task added!" : "Saved to Brain!";
    const tagStr = tags.length > 0 ? `\nTags: ${tags.map(t => `#${t}`).join(" ")}` : "";
    const catStr = category ? `\nCategory: ${category}` : "";
    await sendTelegram(botToken, chatId, `${emoji} ${label}\n\n${row.title || "Untitled"}${tagStr}${catStr}`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    await sendTelegram(botToken, chatId, "✗ Failed to save. Try again.");
    return NextResponse.json({ ok: true });
  }
}

async function sendTelegram(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
