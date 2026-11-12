"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { showToast } from "../Toast";
import { ASSET_CATEGORIES, assetCategory, assetCategoryOf, assetNotice, setAssetTag } from "@/lib/aios-asset.mjs";
import { isOfflineTempId } from "@/lib/offline-replay.mjs";
import type { Item } from "@/lib/brain-model";
import type { SyncPayload } from "@/lib/sync";
import type { QueuedWriteInput } from "@/lib/offline-queue";

// The 🗂 button beside 💼: files a perfected card (a demo, a design, a skill…) in Phil's
// AI OS Asset Library under one category (lib/aios-asset.mjs). It opens a picker of
// category tiles; picking another moves the card, "Take it back" removes it.

/** A category key, or null to take the card back. */
export type AssetChoice = string | null;

const VARIANT_CLASS = {
  row: "rounded px-0.5 text-[10px] leading-none hover:bg-white/5",
  icon: "text-[12px] leading-none px-1 py-0.5 rounded hover:bg-white/5 transition",
  pill: "whitespace-nowrap px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95",
} as const;

const PANEL_WIDTH = 344;
const PANEL_HEIGHT = 340; // header + 3 rows of tiles + footer
const NEUTRAL = "#8B93A7";

type Place = { top: number; left: number; sheet: boolean; up: boolean };

function placeNear(anchor: HTMLElement, panelHeight = PANEL_HEIGHT): Place {
  if (window.innerWidth < 640) return { top: 0, left: 0, sheet: true, up: false };
  const r = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(12, r.left + r.width / 2 - PANEL_WIDTH / 2), window.innerWidth - PANEL_WIDTH - 12);
  const up = r.bottom + 8 + panelHeight > window.innerHeight - 12 && r.top - 8 - panelHeight > 12;
  // A window shorter than the panel: pin it inside the viewport (it scrolls, see maxHeight).
  const top = up ? r.top - 8 - panelHeight : Math.max(12, Math.min(r.bottom + 8, window.innerHeight - 12 - panelHeight));
  return { top, left, sheet: false, up };
}

export function AssetSendButton({ tags, onPick, variant, className }: {
  tags: string[] | null | undefined;
  onPick: (category: AssetChoice) => void;
  variant: keyof typeof VARIANT_CLASS;
  className?: string;
}) {
  // The button the picker opened from (null: closed). Kept in state, not read from a ref
  // during render, so the picker re-renders when it opens.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = assetCategory(assetCategoryOf(tags));
  const label = current
    ? `Filed in the AI OS under ${current.label}. Tap to move or take it back`
    : "File in the AI OS Asset Library under a category";
  const style: CSSProperties = variant === "pill"
    ? current
      ? { border: `1px solid ${current.color}`, background: `${current.color}38`, color: "#F4F6FA" }
      : { border: `1px solid ${NEUTRAL}35`, background: `${NEUTRAL}10`, color: "#AEB5C4" }
    : current
      ? { background: `${current.color}38`, boxShadow: `inset 0 0 0 1px ${current.color}C0` }
      : { opacity: 0.45, filter: "grayscale(1)" };
  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); const el = e.currentTarget; setAnchor(a => a ? null : el); }}
        className={className ?? VARIANT_CLASS[variant]}
        style={style}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
      >{variant === "pill" ? (current ? `✓ ${current.emoji} ${current.label}` : "🗂 File in AI OS") : (current?.emoji ?? "🗂")}</button>
      {anchor ? (
        <AssetPicker
          anchor={anchor}
          currentKey={current?.key ?? null}
          onClose={() => { anchor.focus(); setAnchor(null); }}
          onPick={key => { setAnchor(null); onPick(key); }}
        />
      ) : null}
    </>
  );
}

function AssetPicker({ anchor, currentKey, onClose, onPick }: {
  anchor: HTMLElement;
  currentKey: string | null;
  onClose: () => void;
  onPick: (key: AssetChoice) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Placed once, when it opens; scrolling or resizing closes it instead of chasing the card.
  const [place] = useState<Place>(() => placeNear(anchor));

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLButtonElement>("[data-current='true'], [data-tile]");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      const tiles = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-tile]") ?? [])];
      const at = tiles.indexOf(document.activeElement as HTMLButtonElement);
      if (at < 0) return;
      e.preventDefault();
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key] ?? 0;
      tiles[(at + step + tiles.length) % tiles.length]?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    // Scrolling the page or resizing closes it; scrolling inside the panel (short screens) doesn't.
    const onMove = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [anchor, onClose]);

  const sheet = place.sheet;
  const panelStyle: CSSProperties = sheet
    ? { left: 0, right: 0, bottom: 0, maxHeight: "calc(100dvh - 12px)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }
    : { top: place.top, left: place.left, width: PANEL_WIDTH, maxHeight: "calc(100dvh - 24px)", transformOrigin: place.up ? "bottom center" : "top center" };

  return createPortal(
    <div className="fixed inset-0 z-[90]" onClick={e => e.stopPropagation()}>
      {sheet ? <div className="asset-scrim absolute inset-0 bg-black/55" onClick={onClose} /> : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="File in the AI OS Asset Library"
        className={`asset-panel absolute overflow-y-auto overscroll-contain border border-brand-border bg-[#13161Bf2] p-3 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl ${sheet ? "rounded-t-2xl" : "rounded-xl"}`}
        style={panelStyle}
      >
        <div className="mb-2.5 flex items-baseline justify-between gap-2 px-0.5">
          <span className="font-['Space_Grotesk'] text-[13px] font-bold tracking-wide text-[#F4F6FA]">File in AI OS</span>
          <span className="text-[10px] font-mono text-gray-500">Asset Library · pick one</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ASSET_CATEGORIES.map((category, i) => {
            const on = category.key === currentKey;
            return (
              <button
                key={category.key}
                type="button"
                data-tile
                data-current={on ? "true" : undefined}
                onClick={() => onPick(category.key)}
                className="asset-tile group relative flex min-h-[78px] flex-col items-start justify-start overflow-hidden rounded-lg border p-2 text-left outline-none"
                style={{
                  "--tile": category.color,
                  animationDelay: `${40 + i * 28}ms`,
                  borderColor: on ? category.color : `${category.color}26`,
                  background: on ? `${category.color}2E` : `${category.color}0D`,
                } as CSSProperties}
                title={category.hint}
                aria-pressed={on}
              >
                <span className="asset-glow pointer-events-none absolute inset-0" />
                <span className="asset-emoji relative text-[18px] leading-none">{category.emoji}</span>
                <span className="relative mt-2 text-[11px] font-medium leading-tight" style={{ color: on ? "#F4F6FA" : category.color }}>
                  {category.label}
                </span>
                <span className="relative mt-0.5 line-clamp-2 text-[9px] leading-snug text-gray-500 group-hover:text-gray-400">{category.hint}</span>
                {on ? <span className="absolute right-1.5 top-1.5 rounded-full px-1 text-[9px] font-bold" style={{ background: category.color, color: "#0D0F12" }}>✓</span> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5 text-[10px] font-mono text-gray-500">
          <span>{currentKey ? "Pick another to move it" : "Shows in the AI OS within a minute"}</span>
          {currentKey ? (
            <button type="button" onClick={() => onPick(null)} className="rounded px-1.5 py-0.5 text-[#EB5757] transition hover:bg-[#EB575715]">
              Take it back
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Grid cards. POST /api/items/asset changes only the asset tag on the server, so a tag
 * added elsewhere meanwhile survives; the reply's updatedAt is kept so the next edit of
 * this card isn't refused as a conflict. Offline, it queues a PUT like the 💼 toggle.
 */
export async function sendCardAsset(item: Item, category: AssetChoice, deps: {
  setItems: Dispatch<SetStateAction<Item[]>>;
  broadcastSync: (msg: SyncPayload) => void;
  queueWriteOffline: (input: QueuedWriteInput) => Promise<boolean>;
}) {
  if (isOfflineTempId(item.id)) return;
  const tags: string[] = setAssetTag(item.tags, category);
  const applyLocally = (patch: Partial<Item>) => deps.setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
  try {
    const res = await fetch("/api/items/asset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, category }),
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
    showToast(assetNotice(category), "success");
  } catch {
    if (await deps.queueWriteOffline({ kind: "update", payload: { id: item.id, tags } })) {
      applyLocally({ tags });
      showToast("Offline — change queued for sync", "success");
    } else {
      showToast("Failed to update", "error");
    }
  }
}
