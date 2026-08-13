"use client";

import { useEffect, useState } from "react";
import { showToast } from "../Toast";
import { copyToClipboard } from "@/lib/clipboard";
import { isMemoryOfWeekEnabled, MEMORY_OF_WEEK_ENABLED_KEY } from "@/lib/telegram-memory-settings.mjs";
import { SettingsCard, SettingsToggleRow } from "./ui";

const TELEGRAM_BOT = "philsbrain_bot";

const TELEGRAM_COMMANDS: { command: string; result: string; color: string }[] = [
  { command: "URL", result: "→ ◈ Link (auto-tagged)", color: "#5B8DEF" },
  { command: "plain text", result: "→ ◉ Thought", color: "#BB6BD9" },
  { command: "/t <text>", result: "→ ☐ Task", color: "#56CCF2" },
  { command: "/m <text>", result: "→ 💡 Memory", color: "#F2C94C" },
  { command: "forward msg", result: "→ captures content", color: "#6FCF97" },
];

const INGEST_FIELDS: { field: string; required: boolean; note: string }[] = [
  { field: "file", required: true, note: "png · jpeg · gif · webp · avif · bmp · heic · heif (no svg)" },
  { field: "title", required: false, note: "defaults to \"Screenshot yyyy-MM-dd HH:mm\"" },
  { field: "notes", required: false, note: "becomes the card body" },
  { field: "source", required: false, note: "provenance, e.g. screenshot-app/region" },
  { field: "capturedAt", required: false, note: "ISO 8601 — drives the default title" },
  { field: "tags", required: false, note: "comma separated" },
  { field: "category", required: false, note: "auto-created when unknown" },
  { field: "type", required: false, note: "defaults to clip" },
];

/**
 * Telegram bot reference + the digest toggle that used to live inside the ✈
 * help popover, plus the capture-API reference the Windows screenshot app
 * needs. The API secret itself is never rendered — only how to send it.
 */
export function IntegrationSettings() {
  const [memoryOfWeekEnabled, setMemoryOfWeekEnabled] = useState(true);
  const [memoryOfWeekSaving, setMemoryOfWeekSaving] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setBaseUrl(window.location.origin);
    fetch(`/api/settings?key=${MEMORY_OF_WEEK_ENABLED_KEY}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setMemoryOfWeekEnabled(isMemoryOfWeekEnabled(data?.[MEMORY_OF_WEEK_ENABLED_KEY])))
      .catch(() => {});
  }, []);

  const updateMemoryOfWeekEnabled = async (enabled: boolean) => {
    const previous = memoryOfWeekEnabled;
    setMemoryOfWeekEnabled(enabled);
    setMemoryOfWeekSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: MEMORY_OF_WEEK_ENABLED_KEY, value: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save setting");
      showToast(enabled ? "Memory of the week is on" : "Memory of the week is off", "success");
    } catch {
      setMemoryOfWeekEnabled(previous);
      showToast("Failed to update memory setting", "error");
    } finally {
      setMemoryOfWeekSaving(false);
    }
  };

  const copy = async (value: string, label: string) => {
    const ok = await copyToClipboard(value);
    showToast(ok ? `${label} copied` : "Copy failed", ok ? "success" : "error");
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Telegram"
        description="Send anything to the bot and it lands in your inbox."
        action={
          <a
            href={`https://t.me/${TELEGRAM_BOT}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center font-mono text-[11px] text-[#5B8DEF] transition hover:underline"
          >@{TELEGRAM_BOT} ↗</a>
        }
      >
        <div className="space-y-2 font-mono text-[11px]">
          {TELEGRAM_COMMANDS.map(row => (
            <div key={row.command} className="flex items-baseline gap-2">
              <span className="w-24 shrink-0" style={{ color: row.color }}>{row.command}</span>
              <span className="text-gray-400">{row.result}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-brand-border pt-3 font-mono text-[10px] text-gray-600">
          Long-press any message in any chat, tap Forward, pick the bot.
        </p>
        <div className="mt-3 border-t border-brand-border pt-3">
          <SettingsToggleRow
            label="Memory of the week"
            description={memoryOfWeekEnabled ? "Telegram reminder is on" : "Telegram reminder is off"}
            checked={memoryOfWeekEnabled}
            disabled={memoryOfWeekSaving}
            onChange={updateMemoryOfWeekEnabled}
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Screenshot app / API"
        description="How native clients push captures and cards into this brain."
      >
        <div className="space-y-3">
          <div>
            <p className="font-mono text-[11px] text-gray-500">Base URL</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-brand-border bg-brand-muted px-2.5 py-1.5 font-mono text-[11px] text-gray-300">
                {baseUrl || "…"}
              </code>
              <button
                type="button"
                onClick={() => copy(baseUrl, "Base URL")}
                className="min-h-[44px] font-mono text-[11px] text-gray-500 transition hover:text-[#E8A838]"
                disabled={!baseUrl}
              >Copy</button>
            </div>
          </div>

          <div className="rounded-lg border border-brand-border bg-brand-muted/30 p-3">
            <p className="font-mono text-[11px] text-gray-300">Authentication</p>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-gray-500">
              Send your API secret in the <code className="text-[#E8A838]">x-api-key</code> request header.
              <span className="text-gray-600"> /api/ingest accepts the header only — never a <code>?key=</code> query
              parameter, which would leak the secret into server logs.</span> The secret lives in the
              <code className="text-gray-400"> API_SECRET</code> environment variable and is deliberately not shown here.
            </p>
          </div>

          <div>
            <p className="font-mono text-[11px] text-gray-300">
              POST <code className="text-[#6FCF97]">/api/ingest</code>
              <span className="text-gray-600"> — multipart/form-data, image capture → card with the image attached</span>
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="border-b border-brand-border pb-1 pr-3 font-normal">field</th>
                    <th className="border-b border-brand-border pb-1 pr-3 font-normal">required</th>
                    <th className="border-b border-brand-border pb-1 font-normal">notes</th>
                  </tr>
                </thead>
                <tbody>
                  {INGEST_FIELDS.map(row => (
                    <tr key={row.field}>
                      <td className="border-b border-brand-border/50 py-1 pr-3 text-gray-300">{row.field}</td>
                      <td className="border-b border-brand-border/50 py-1 pr-3" style={{ color: row.required ? "#E8A838" : "#5B616D" }}>
                        {row.required ? "yes" : "no"}
                      </td>
                      <td className="border-b border-brand-border/50 py-1 text-gray-500">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 font-mono text-[10px] text-gray-600">
              Returns 201 with the new card id. Keep uploads under ~4 MB — the serverless request body cap.
            </p>
          </div>

          <div>
            <p className="font-mono text-[11px] text-gray-300">
              POST <code className="text-[#5B8DEF]">/api/save</code>
              <span className="text-gray-600"> — JSON, text/link capture for scripts and automations</span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-gray-500">
              Body accepts <code className="text-gray-400">url</code>, <code className="text-gray-400">text</code>,{" "}
              <code className="text-gray-400">title</code>, <code className="text-gray-400">content</code>,{" "}
              <code className="text-gray-400">notes</code>, <code className="text-gray-400">tags</code>,{" "}
              <code className="text-gray-400">category</code>, <code className="text-gray-400">type</code>.
              Links are enriched and auto-tagged.
            </p>
          </div>

          <button
            type="button"
            onClick={() => copy(
              `curl -X POST "${baseUrl}/api/ingest" -H "x-api-key: $API_SECRET" -F "file=@shot.png" -F "tags=screenshot" -F "source=screenshot-app/region"`,
              "Example request",
            )}
            className="min-h-[44px] font-mono text-[11px] text-gray-500 transition hover:text-[#E8A838]"
            disabled={!baseUrl}
          >Copy example request →</button>
        </div>
      </SettingsCard>
    </div>
  );
}
