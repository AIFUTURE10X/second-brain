import { aiosNotifyGate } from "@/lib/aios-gate";

export async function sendTelegram(
  token: string,
  chatId: number | string,
  text: string,
  options?: { replyMarkup?: unknown; source?: string; display_name?: string; schedule?: string; priority?: "P0" | "P1" | "P2" | "P3" },
) {
  // Scheduled sends declare a source so Phil's AI OS can mute / hold them and keep the
  // delivery ledger; interactive replies (no source) bypass the gate. Fail-open.
  if (options?.source) {
    const gate = await aiosNotifyGate(options.source, text, {
      bot: "My Second Brain", display_name: options.display_name, schedule: options.schedule,
      project: "C:\\Projects\\Second Brain\\second-brain", priority: options.priority ?? "P2",
    });
    if (!gate.allow) return { sent: false, gate };
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
      ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    }),
  });
  return { sent: true };
}

export function allowedTelegramIds(): string[] {
  return (process.env.TELEGRAM_ALLOWED_USER_ID || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function verifyCronAuth(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret → allow (dev)
  return authHeader === `Bearer ${secret}`;
}
