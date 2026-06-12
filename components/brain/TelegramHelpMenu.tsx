"use client";

import { useEffect, useState } from "react";

interface TelegramHelpMenuProps {
  memoryOfWeekEnabled: boolean;
  memoryOfWeekSaving: boolean;
  onToggleMemoryOfWeek: (enabled: boolean) => void;
}

export function TelegramHelpMenu({ memoryOfWeekEnabled, memoryOfWeekSaving, onToggleMemoryOfWeek }: TelegramHelpMenuProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  // Close help popover when clicking outside
  useEffect(() => {
    if (!helpOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-help-menu]")) setHelpOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [helpOpen]);

  return (
    <div className="relative" data-help-menu>
      <button
        onClick={() => setHelpOpen(v => !v)}
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
        aria-label="Show Telegram bot commands"
        aria-expanded={helpOpen}
        title="Telegram commands"
      >✈</button>
      {helpOpen && (
        <div
          data-help-menu
          className="fixed left-4 right-4 top-[68px] z-50 rounded-xl border border-brand-border bg-[#0D0F12] p-4 shadow-2xl text-left sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px]"
        >
          <div className="text-xs font-mono text-gray-400 mb-2 flex items-center justify-between">
            <span>Telegram: <a href="https://t.me/philsbrain_bot" target="_blank" rel="noreferrer" className="text-[#5B8DEF] hover:underline">@philsbrain_bot</a></span>
            <button
              onClick={() => setHelpOpen(false)}
              className="text-gray-600 hover:text-gray-300 text-xs"
              aria-label="Close help"
            >×</button>
          </div>
          <div className="space-y-2 text-[11px] font-mono">
            <div className="flex items-baseline gap-2">
              <span className="text-[#5B8DEF] shrink-0 w-24">URL</span>
              <span className="text-gray-400">→ ◈ Link (auto-tagged)</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[#BB6BD9] shrink-0 w-24">plain text</span>
              <span className="text-gray-400">→ ◉ Thought</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[#56CCF2] shrink-0 w-24">/t &lt;text&gt;</span>
              <span className="text-gray-400">→ ☐ Task</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[#F2C94C] shrink-0 w-24">/m &lt;text&gt;</span>
              <span className="text-gray-400">→ 💡 Memory</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[#6FCF97] shrink-0 w-24">forward msg</span>
              <span className="text-gray-400">→ captures content</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 font-mono mt-3 pt-3 border-t border-brand-border">
            Long-press any message in any chat, tap Forward, pick the bot.
          </p>
          <div className="mt-3 pt-3 border-t border-brand-border">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-gray-300">Memory of the week</p>
                <p className="text-[10px] font-mono text-gray-600">
                  {memoryOfWeekEnabled ? "Telegram reminder is on" : "Telegram reminder is off"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={memoryOfWeekEnabled}
                aria-label={memoryOfWeekEnabled ? "Turn off Memory of the week" : "Turn on Memory of the week"}
                disabled={memoryOfWeekSaving}
                onClick={() => onToggleMemoryOfWeek(!memoryOfWeekEnabled)}
                className="relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-60"
                style={{
                  borderColor: memoryOfWeekEnabled ? "#F2C94C80" : "#333842",
                  background: memoryOfWeekEnabled ? "#F2C94C28" : "#181B21",
                }}
              >
                <span
                  className="absolute top-1 h-5 w-5 rounded-full transition-all"
                  style={{
                    left: memoryOfWeekEnabled ? "22px" : "4px",
                    background: memoryOfWeekEnabled ? "#F2C94C" : "#5B616D",
                    boxShadow: memoryOfWeekEnabled ? "0 0 12px rgba(242, 201, 76, 0.35)" : "none",
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
