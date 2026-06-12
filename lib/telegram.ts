export async function sendTelegram(token: string, chatId: number | string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
  });
}

export function allowedTelegramIds(): string[] {
  return (process.env.TELEGRAM_ALLOWED_USER_ID || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

export function verifyCronAuth(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — set CRON_SECRET (Vercel sends it automatically)
  return authHeader === `Bearer ${secret}`;
}
