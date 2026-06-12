"use client";

import { useEffect, useRef, useState } from "react";
import { TYPES, type ItemType } from "@/lib/brain-model";

type AskSource = { id: string; title: string; url: string; type: string };
type AskMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; sources: AskSource[] };

interface AskBrainPanelProps {
  onClose: () => void;
  onOpenCard: (id: string) => void;
}

// "Ask my brain" chat (roadmap 2.13): RAG over the card corpus via /api/ask,
// with the source cards cited under each answer.
export function AskBrainPanel({ onClose, onOpenCard }: AskBrainPanelProps) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, asking]);

  const ask = async () => {
    const question = input.trim();
    if (!question || asking) return;
    setInput("");
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setAsking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.answer) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data?.error || "Something went wrong — try again.",
          sources: [],
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.answer,
          sources: Array.isArray(data.sources) ? data.sources : [],
        }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Network error — try again.", sources: [] }]);
    } finally {
      setAsking(false);
      inputRef.current?.focus();
    }
  };

  const sourceIcon = (type: string) => TYPES[type as ItemType]?.icon || "◉";

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl sm:rounded-2xl border border-brand-border bg-[#0D0F12] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-brand-border px-4 py-3">
          <h2 className="font-bold text-[#E8A838]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            ✦ Ask my brain
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full text-gray-500 hover:text-gray-200 transition"
            aria-label="Close"
          >×</button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-gray-500 font-mono">
              Ask anything about what you&rsquo;ve saved — answers cite the source cards.
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {["What did I save about AI agents?", "Summarize my notes on productivity", "Which tasks mention the vault?"].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="rounded-full border border-brand-border px-3 py-1 text-[11px] text-gray-400 hover:text-[#E8A838] hover:border-[#E8A83860] transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[#E8A83820] border border-[#E8A83840] text-gray-100"
                    : "bg-brand-muted border border-brand-border text-gray-200"
                }`}
              >
                {msg.content}
                {msg.role === "assistant" && msg.sources.length > 0 && (
                  <div className="mt-2.5 border-t border-brand-border pt-2">
                    <p className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-gray-500">Sources</p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.sources.map((source, n) => (
                        <button
                          key={source.id}
                          onClick={() => onOpenCard(source.id)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-border bg-[#13161B] px-2.5 py-1 text-[11px] font-mono text-gray-300 hover:text-[#E8A838] hover:border-[#E8A83860] transition"
                          title={source.title}
                        >
                          <span className="opacity-60">[{n + 1}]</span>
                          <span>{sourceIcon(source.type)}</span>
                          <span className="max-w-[180px] truncate">{source.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {asking && (
            <div className="flex justify-start">
              <div className="rounded-xl border border-brand-border bg-brand-muted px-3.5 py-2.5 text-sm text-gray-400 font-mono">
                <span className="inline-block h-3 w-3 rounded-full border border-gray-500 border-t-transparent align-middle mr-2" style={{ animation: "spin 0.6s linear infinite" }} />
                thinking…
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-brand-border p-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
              placeholder="Ask your second brain…"
              aria-label="Question"
              className="min-h-[44px] flex-1 rounded-lg border border-brand-border bg-brand-muted px-3 text-sm text-gray-200 outline-none placeholder:text-gray-500 focus:border-gray-500"
              disabled={asking}
            />
            <button
              onClick={ask}
              disabled={asking || !input.trim()}
              className="rounded-lg px-4 text-sm font-medium text-[#13161B] disabled:opacity-50 active:scale-95 transition"
              style={{ background: "linear-gradient(135deg, #F2C94C, #F2994A)" }}
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
