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

// Sent has to read at a glance, not as a slightly brighter emoji: the icon sits on a
// purple chip with a ring (inset, so it never spills into a clipped footer row), and the
// pill fills in and says ✓, like the Telegram button.
const SENT_CHIP: CSSProperties = { background: `${PILL_COLOR}38`, boxShadow: `inset 0 0 0 1px ${PILL_COLOR}C0` };
const UNSENT_ICON: CSSProperties = { opacity: 0.45, filter: "grayscale(1)" };

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
    ? sent
      ? { border: `1px solid ${PILL_COLOR}`, background: `${PILL_COLOR}45`, color: "#F5E6FB" }
      : { border: `1px solid ${PILL_COLOR}30`, background: `${PILL_COLOR}10`, color: PILL_COLOR }
    : sent ? SENT_CHIP : UNSENT_ICON;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={className ?? VARIANT_CLASS[variant]}
      style={style}
      title={label}
      aria-label={label}
      aria-pressed={sent}
    >{variant === "pill" ? (sent ? "✓ Sent to AI OS" : "💼 Send to AI OS") : "💼"}</button>
  );
}

/**
 * Grid cards. POST /api/items/idea flips only the tag on the server, so a tag added
 * elsewhere meanwhile survives; the reply's updatedAt is kept so the next edit of this
 * card isn't refused as a conflict. Offline, it queues a PUT like Brain's ★/⚡ flags.
 */
export async function toggleCardIdea(item: Item, deps: {
  setItems: Dispatch<SetStateAction<Item[]>>;
  broadcastSync: (msg: SyncPayload) => void;
  queueWriteOffline: (input: QueuedWriteInput) => Promise<boolean>;
}) {
  if (isOfflineTempId(item.id)) return;
  const send = !hasIdeaTag(item.tags);
  const tags: string[] = setIdeaTag(item.tags, send);
  const applyLocally = (patch: Partial<Item>) => deps.setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
  try {
    const res = await fetch("/api/items/idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, send }),
    });
    if (!res.ok) {
      showToast("Failed to update", "error");
      return;
    }
    const saved = await res.json().catch(() => null) as Item | null;
    if (saved?.id) {
      deps.broadcastSync({ type: "item-updated", item: saved });
      applyLocally({ tags: saved.tags, updatedAt: saved.updatedAt });
    } else {
      applyLocally({ tags });
    }
    showToast(ideaToggleNotice(send), "success");
  } catch {
    if (await deps.queueWriteOffline({ kind: "update", payload: { id: item.id, tags } })) {
      applyLocally({ tags });
      showToast("Offline — change queued for sync", "success");
    } else {
      showToast("Failed to update", "error");
    }
  }
}
