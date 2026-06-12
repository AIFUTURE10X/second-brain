import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { items, categories, settings } from "@/db/schema";
import { enrichUrl } from "@/lib/enrich";
import { aiTagAndCategorize } from "@/lib/ai-tagger";
import { embeddingsEnabled } from "@/lib/embeddings.mjs";
import { updateItemEmbedding } from "@/lib/embedding-store";
import { sendTelegram, allowedTelegramIds } from "@/lib/telegram";
import {
  isMemoryOfWeekEnabled,
  MEMORY_OF_WEEK_ENABLED_KEY,
  parseMemoryToggleCommand,
} from "@/lib/telegram-memory-settings.mjs";
import { asc, and, eq, isNull } from "drizzle-orm";
import { hybridSearchItems } from "@/lib/search-items";
import { initialReadingStatus } from "@/lib/reading-status.mjs";
import {
  formatDoneAmbiguous,
  formatFindResults,
  matchTaskCandidates,
  parseDoneCommand,
  parseFindCommand,
} from "@/lib/telegram-commands.mjs";
import { normalizeChecklistItems } from "@/lib/task-checklists";
import { syncWikiRelations } from "@/lib/wiki-link-store";
import { spawnNextTaskOccurrence } from "@/lib/recurring-tasks";
import { parseSnoozeCallback } from "@/lib/reminder-snooze.mjs";
import { reminders } from "@/db/schema";

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

  // Inline-button callbacks (reminder snooze, roadmap 2.8).
  if (update.callback_query) {
    return handleCallbackQuery(botToken, update.callback_query);
  }

  const message = update.message || update.channel_post;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  const rawText = message.text || message.caption || "";
  const memoryToggleCommand = parseMemoryToggleCommand(rawText);

  // Detect slash prefixes:
  //   /t or /task <text>     → task
  //   /m, /r, /remember <text> → memory
  const taskMatch = rawText.match(/^\/(task|t)\s+([\s\S]+)/i);
  const memoryMatch = rawText.match(/^\/(remember|memory|mem|m|r)\s+([\s\S]+)/i);
  const isTaskCommand = !!taskMatch;
  const isMemoryCommand = !isTaskCommand && !!memoryMatch;
  const text = isTaskCommand
    ? taskMatch![2].trim()
    : isMemoryCommand
      ? memoryMatch![2].trim()
      : rawText;

  // Lock the bot to a single user ID (allowlist) — prevents strangers who find the bot
  // username from spamming the owner's Brain. Accepts a single ID or a comma-separated list.
  const allowedIds = allowedTelegramIds();
  const senderId = message.from?.id?.toString();
  if (allowedIds.length > 0 && (!senderId || !allowedIds.includes(senderId))) {
    await sendTelegram(botToken, chatId, "This bot is private.");
    return NextResponse.json({ ok: true });
  }

  if (memoryToggleCommand) {
    const statusText = await handleMemoryToggleCommand(memoryToggleCommand.action);
    await sendTelegram(botToken, chatId, statusText);
    return NextResponse.json({ ok: true });
  }

  // /find <query> — same hybrid search (FTS + semantic + fuzzy) as the app.
  const findQuery = parseFindCommand(rawText);
  if (findQuery) {
    try {
      const result = await hybridSearchItems(findQuery);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      await sendTelegram(botToken, chatId, formatFindResults(result.rows, { baseUrl, query: findQuery }));
    } catch {
      await sendTelegram(botToken, chatId, "✗ Search failed. Try again.");
    }
    return NextResponse.json({ ok: true });
  }

  // /done <id or title> — mark an open task complete.
  const doneArg = parseDoneCommand(rawText);
  if (doneArg) {
    try {
      const openTasks = await db
        .select()
        .from(items)
        .where(and(eq(items.type, "task"), eq(items.completed, false), isNull(items.archivedAt)));
      const candidates = matchTaskCandidates(doneArg, openTasks);
      if (candidates.length === 0) {
        await sendTelegram(botToken, chatId, `No open task matches "${doneArg}".`);
      } else if (candidates.length > 1) {
        await sendTelegram(botToken, chatId, formatDoneAmbiguous(candidates));
      } else {
        const task = candidates[0] as typeof openTasks[number];
        const now = new Date();
        // Completing a checklist task means completing every row — the app
        // derives task completion from its checklist.
        const checklistItems = normalizeChecklistItems(task.checklistItems).map(row => ({
          ...row,
          completed: true,
          completedAt: row.completedAt || now.toISOString(),
        }));
        await db
          .update(items)
          .set({ completed: true, completedAt: now, checklistItems, updatedAt: now })
          .where(eq(items.id, task.id));
        // Completing a recurring task spawns its next occurrence (2.11).
        await spawnNextTaskOccurrence(task);
        const recurringNote = task.recurrence ? `\n↻ Recurs ${task.recurrence} — next occurrence created.` : "";
        await sendTelegram(botToken, chatId, `☑ Done: ${task.title || "Untitled"}${recurringNote}`);
      }
    } catch {
      await sendTelegram(botToken, chatId, "✗ Couldn't update the task. Try again.");
    }
    return NextResponse.json({ ok: true });
  }

  // Extract URLs from the message
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const url = urlMatch?.[0] || "";
  const remainingText = text.replace(/https?:\/\/[^\s]+/g, "").trim();

  if (!url && !remainingText) {
    await sendTelegram(
      botToken,
      chatId,
      "Send me:\n• a URL → saved as a Link\n• plain text → saved as a Thought\n• '/t buy milk' → saved as a Task\n• '/m wifi password is abc123' → saved as a Memory\n• '/find <query>' → search your Brain\n• '/done <task title or id>' → complete a task"
    );
    return NextResponse.json({ ok: true });
  }

  try {
    // Auto-enrich URL
    let og = { ogTitle: "", ogDescription: "", ogImage: "", siteName: "", favicon: "" };
    if (url) {
      og = await enrichUrl(url);
    }

    // Determine type + content
    const type = isTaskCommand
      ? "task"
      : isMemoryCommand
        ? "memory"
        : url ? "link" : "thought";
    const title = isTaskCommand || isMemoryCommand
      ? text.slice(0, 200)
      : og.ogTitle || remainingText.slice(0, 100) || "";
    const content = isTaskCommand || isMemoryCommand ? "" : url ? remainingText : text;
    const notes = !isTaskCommand && !isMemoryCommand && url && remainingText ? remainingText : "";

    // AI auto-tag if available — skip for lightweight types (tasks + memories)
    let tags: string[] = [];
    let category = "";
    if (!isTaskCommand && !isMemoryCommand && process.env.ANTHROPIC_API_KEY) {
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
        readingStatus: initialReadingStatus(type),
        ogTitle: og.ogTitle,
        ogDescription: og.ogDescription,
        ogImage: og.ogImage,
        siteName: og.siteName,
        favicon: og.favicon,
      })
      .returning();

    // Embed post-response so captures never block on (or fail because of) OpenAI.
    if (embeddingsEnabled()) after(() => updateItemEmbedding(row.id));
    // Resolve [[wiki links]] into item_relations (roadmap 2.2).
    after(() => syncWikiRelations(row.id));

    // Reply with confirmation
    const emoji = type === "task" ? "☐" : type === "memory" ? "💡" : type === "link" ? "◈" : "◉";
    const label = type === "task" ? "Task added!" : type === "memory" ? "Memory saved!" : "Saved to Brain!";
    const tagStr = tags.length > 0 ? `\nTags: ${tags.map(t => `#${t}`).join(" ")}` : "";
    const catStr = category ? `\nCategory: ${category}` : "";
    await sendTelegram(botToken, chatId, `${emoji} ${label}\n\n${row.title || "Untitled"}${tagStr}${catStr}`);

    return NextResponse.json({ ok: true });
  } catch (e) {
    await sendTelegram(botToken, chatId, "✗ Failed to save. Try again.");
    return NextResponse.json({ ok: true });
  }
}

// Reminder snooze buttons (roadmap 2.8): callback_data "snooze:<id>:<1h|3h|1d>".
// Sets the reminder back to pending with snoozed_until = now + duration; the
// cron re-fires it once the snooze passes.
async function handleCallbackQuery(
  botToken: string,
  callbackQuery: {
    id: string;
    data?: string;
    from?: { id?: number };
    message?: { chat?: { id?: number } };
  },
) {
  const answer = (text: string) =>
    fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQuery.id, text }),
    }).catch(() => {});

  const allowedIds = allowedTelegramIds();
  const senderId = callbackQuery.from?.id?.toString();
  if (allowedIds.length > 0 && (!senderId || !allowedIds.includes(senderId))) {
    await answer("This bot is private.");
    return NextResponse.json({ ok: true });
  }

  const snooze = parseSnoozeCallback(callbackQuery.data);
  if (!snooze) {
    await answer("Unknown action.");
    return NextResponse.json({ ok: true });
  }

  try {
    const snoozedUntil = new Date(Date.now() + snooze.ms);
    const [row] = await db
      .update(reminders)
      .set({ status: "pending", snoozedUntil, sentAt: null, updatedAt: new Date() })
      .where(eq(reminders.id, snooze.reminderId))
      .returning();
    await answer(row ? `Snoozed — ${snooze.label}.` : "Reminder not found.");
    const chatId = callbackQuery.message?.chat?.id;
    if (row && chatId) {
      await sendTelegram(botToken, chatId, `⏰ Snoozed "${row.message || "reminder"}" — ${snooze.label}.`);
    }
  } catch {
    await answer("Snooze failed. Try again.");
  }
  return NextResponse.json({ ok: true });
}

async function handleMemoryToggleCommand(action: string): Promise<string> {
  if (action === "on" || action === "off") {
    const enabled = action === "on";
    await db
      .insert(settings)
      .values({ key: MEMORY_OF_WEEK_ENABLED_KEY, value: enabled })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: enabled, updatedAt: new Date() },
      });

    return enabled
      ? "Memories are on. I will send Memory of the week in Telegram."
      : "Memories are off. I will stop sending Memory of the week in Telegram.";
  }

  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, MEMORY_OF_WEEK_ENABLED_KEY))
    .limit(1);
  const enabled = isMemoryOfWeekEnabled(rows[0]?.value);
  return enabled
    ? "Memories are on. Use /memories_off to turn them off."
    : "Memories are off. Use /memories_on to turn them on.";
}
