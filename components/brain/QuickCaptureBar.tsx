"use client";

import { useState } from "react";
import { VoiceButton } from "../VoiceButton";

interface QuickCaptureBarProps {
  saving: boolean;
  // Returns true when the capture was saved (clears the input).
  onCapture: (text: string) => Promise<boolean>;
}

// Persistent capture input mirroring the Telegram bot grammar:
// paste a URL → link, plain text → thought, "/t text" → task, "/m text" → memory.
export function QuickCaptureBar({ saving, onCapture }: QuickCaptureBarProps) {
  const [text, setText] = useState("");

  const submit = async () => {
    const value = text.trim();
    if (!value || saving) return;
    const ok = await onCapture(value);
    if (ok) setText("");
  };

  return (
    <div className="mb-2 flex gap-2">
      <div className="relative flex-1">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="Capture: paste a link, jot a thought, /t task, /m memory…"
          aria-label="Quick capture"
          className="w-full py-2.5 pl-9 pr-3 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500 focus:border-[#E8A83860]"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "#E8A838" }}>＋</span>
      </div>
      <VoiceButton
        onTranscript={t => setText(prev => (prev ? prev + " " : "") + t)}
        disabled={saving}
      />
      <button
        onClick={submit}
        disabled={!text.trim() || saving}
        className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 active:scale-95 transition"
        style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)" }}
        aria-label="Save capture"
      >{saving ? "…" : "Save"}</button>
    </div>
  );
}
