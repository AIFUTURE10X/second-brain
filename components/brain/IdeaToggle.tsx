"use client";

import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { showToast } from "../Toast";
import { hasIdeaTag, ideaToggleNotice, setIdeaTag } from "@/lib/business-idea.mjs";
import { isOfflineTempId } from "@/lib/offline-replay.mjs";
import type { Item } from "@/lib/brain-model";
import type { SyncPayload } from "@/lib/sync";
import type { QueuedWriteInput } from "@/lib/offline-queue";

// The 💼 toggle: one tap sends a card to Phil's AI OS (Business Ideas) by adding
// the business-idea tag, a second tap takes it back (lib/business-idea.mjs).

const PILL_COLOR = "#BB6BD9";

const VARIANT_CLASS = {
  row: "rounded px-0.5 text-[10px] leading-none hover:bg-white/5",
  icon: "text-[12px] leading-none px-1 py-0.5 rounded hover:bg-white/5 transition",
  pill: "px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95",
} as const;

export function IdeaToggleButton({ sent, onToggle, variant, className }: {
  sent: boolean;
  onToggle: () => void;
  variant: keyof typeof VARIANT_CLASS;
  className?: string;
}) {
  const label = sent ? "Sent to the AI OS as a business idea. Tap to undo" : "Send to the AI OS as a business idea";
  const style: CSSProperties = variant === "pill"
    ? { border: `1px solid ${PILL_COLOR}${sent ? "90" : "30"}`, background: `${PILL_COLOR}${sent ? "25" : "10"}`, color: PILL_COLOR }
    : { opacity: sent ? 1 : 0.45, filter: sent ? undefined : "grayscale(1)" };
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={className ?? VARIANT_CLASS[variant]}
      style={style}
      title={label}
      aria-label={label}
      aria-pressed={sent}
    >{variant === "pill" ? (sent ? "💼 Sent to AI OS" : "💼 Send to AI OS") : "💼"}</button>
  );
}

/** Grid cards: same save path as Brain's ★/⚡ flags (PUT, cross-tab sync, offline queue). */
export async function toggleCardIdea(item: Item, deps: {
  setItems: Dispatch<SetStateAction<Item[]>>;
  broadcastSync: (msg: SyncPayload) => void;
  queueWriteOffline: (input: QueuedWriteInput) => Promise<boolean>;
}) {
  if (isOfflineTempId(item.id)) return;
  const send = !hasIdeaTag(item.tags);
  const tags: string[] = setIdeaTag(item.tags, send);
  const applyLocally = () => deps.setItems(prev => prev.map(i => i.id === item.id ? { ...i, tags } : i));
  try {
    const res = await fetch("/api/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, tags }),
    });
    if (!res.ok) {
      showToast("Failed to update", "error");
      return;
    }
    try {
      const saved = await res.clone().json();
      if (saved && saved.id) deps.broadcastSync({ type: "item-updated", item: saved });
    } catch {}
    applyLocally();
    showToast(ideaToggleNotice(send), "success");
  } catch {
    if (await deps.queueWriteOffline({ kind: "update", payload: { id: item.id, tags } })) {
      applyLocally();
      showToast("Offline — change queued for sync", "success");
    } else {
      showToast("Failed to update", "error");
    }
  }
}
