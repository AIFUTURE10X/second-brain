"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ASSET_CATEGORIES, assetCategoriesOf, assetCategory, assetKeys } from "@/lib/aios-asset.mjs";
import { suggestAssetCategories } from "@/lib/aios-asset-suggest.mjs";
import type { Item } from "@/lib/brain-model";

// The 🗂 button beside 💼: files a perfected card (a demo, a design, a skill…) in Phil's
// AI OS Asset Library under one or more categories (lib/aios-asset.mjs). It opens a picker
// of category tiles: tapping a tile or a suggestion toggles it, Save (or a tap outside)
// files the card under every selected category, Escape cancels, "Take it back" removes it.
// The save itself lives in sendCardAsset.ts.

/** The category keys the card is filed under; [] takes it back. */
export type AssetChoice = string[];
/** The card's text, read only to suggest a category when the picker opens. */
export type AssetCard = Partial<Pick<Item, "title" | "content" | "url" | "notes" | "noteEntries" | "tags" | "category" | "ogTitle" | "ogDescription" | "siteName">>;

const VARIANT_CLASS = {
  row: "rounded px-0.5 text-[10px] leading-none hover:bg-white/5",
  icon: "text-[12px] leading-none px-1 py-0.5 rounded hover:bg-white/5 transition",
  pill: "whitespace-nowrap px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95",
} as const;

const PANEL_WIDTH = 344;
const PANEL_HEIGHT = 352; // header + 3 rows of tiles + footer
const SUGGEST_HEIGHT = 62; // the "Suggested for this card" row
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

export function AssetSendButton({ tags, card, onPick, variant, className }: {
  tags: string[] | null | undefined;
  card?: AssetCard;
  onPick: (category: AssetChoice) => void;
  variant: keyof typeof VARIANT_CLASS;
  className?: string;
}) {
  // The button the picker opened from (null: closed). Kept in state, not read from a ref
  // during render, so the picker re-renders when it opens.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const keys: string[] = assetCategoriesOf(tags);
  const current = assetCategory(keys[0] ?? null);
  const more = keys.length > 1 ? ` +${keys.length - 1}` : "";
  const label = current
    ? `Filed in the AI OS under ${keys.map(key => assetCategory(key)!.label).join(", ")}. Tap to change or take it back`
    : "File in the AI OS Asset Library under one or more categories";
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
        // Cards and rows toggle on Enter/Space; keep the keys for this button.
        onKeyDown={e => e.stopPropagation()}
        className={className ?? VARIANT_CLASS[variant]}
        style={style}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
      >{variant === "pill" ? (current ? `✓ ${current.emoji} ${current.label}${more}` : "🗂 File in AI OS") : (current?.emoji ?? "🗂")}</button>
      {anchor ? (
        <AssetPicker
          anchor={anchor}
          currentKeys={keys}
          card={card}
          onClose={() => { anchor.focus({ preventScroll: true }); setAnchor(null); }}
          onPick={picked => { setAnchor(null); onPick(picked); }}
        />
      ) : null}
    </>
  );
}

function AssetPicker({ anchor, currentKeys, card, onClose, onPick }: {
  anchor: HTMLElement;
  currentKeys: string[];
  card?: AssetCard;
  onClose: () => void;
  onPick: (key: AssetChoice) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Worked out once, when it opens: one or two likely categories from the card's own text.
  const [suggested] = useState<string[]>(() => (card ? suggestAssetCategories(card) : []));
  // Placed once, when it opens; scrolling or resizing closes it instead of chasing the card.
  const [place] = useState<Place>(() => placeNear(anchor, PANEL_HEIGHT + (suggested.length ? SUGGEST_HEIGHT : 0)));
  // The selection being edited; nothing is filed until Save (or a tap outside the picker).
  const [picked, setPicked] = useState<string[]>(currentKeys);
  const changed = picked.join(",") !== currentKeys.join(",");
  const toggle = (key: string) => setPicked(prev => assetKeys(prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  const allSuggested = suggested.length > 1 && suggested.every(key => picked.includes(key));
  // Read by the window listeners, which are bound once.
  const commitRef = useRef(() => {});
  useEffect(() => { commitRef.current = () => (changed ? onPick(picked) : onClose()); }, [changed, picked, onPick, onClose]);

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLButtonElement>("[data-current='true']")
      ?? panelRef.current?.querySelector<HTMLButtonElement>("[data-suggested], [data-tile]");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab") { // keep focus in the picker (the phone sheet covers the page)
        const all = [...(panelRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const at = all.indexOf(document.activeElement as HTMLButtonElement);
        if (all.length && (at < 0 || (e.shiftKey ? at === 0 : at === all.length - 1))) {
          e.preventDefault();
          all[e.shiftKey ? all.length - 1 : 0].focus();
        }
        return;
      }
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
      if (!panelRef.current?.contains(target) && !anchor.contains(target)) commitRef.current();
    };
    // Scrolling the page or resizing closes it; scrolling inside the panel (short screens) doesn't.
    const onMove = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", onKey, true); // capture: the portal root stops bubbling
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
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
    // A portal still bubbles React events to the card: stop clicks and keys here, or a pick
    // would also expand the card (and Enter on a tile would be swallowed by its key handler).
    <div className="fixed inset-0 z-[90]" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
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
          <span className="text-[10px] font-mono text-gray-500">Asset Library · pick one or more</span>
        </div>
        {suggested.length ? (
          <div className="mb-2.5">
            <div className="mb-1 flex items-center justify-between px-0.5 text-[9px] font-mono uppercase tracking-[0.14em] text-gray-500">
              <span>✦ Suggested for this card</span>
              {suggested.length > 1 && !allSuggested ? (
                <button type="button" onClick={() => setPicked(prev => assetKeys([...prev, ...suggested]))} className="rounded px-1 normal-case tracking-normal text-[#F4F6FA] hover:bg-white/5">
                  Pick both
                </button>
              ) : null}
            </div>
            <div className="flex gap-1.5">
              {suggested.map(key => {
                const category = assetCategory(key)!;
                const on = picked.includes(key);
                return (
                  <button key={key} type="button" data-suggested onClick={() => toggle(key)} title={category.hint} aria-pressed={on}
                    className="asset-suggest flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium outline-none hover:brightness-125"
                    style={{ "--tile": category.color, borderColor: on ? category.color : `${category.color}50`, background: `linear-gradient(135deg, ${category.color}${on ? "48" : "22"}, ${category.color}10)`, color: "#F4F6FA" } as CSSProperties}>
                    <span className="text-[15px] leading-none">{category.emoji}</span>
                    <span className="truncate">{category.label}</span>
                    <span className="ml-auto text-[10px]" style={{ color: category.color }}>{on ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-1.5">
          {ASSET_CATEGORIES.map((category, i) => {
            const on = picked.includes(category.key);
            const tip = suggested.includes(category.key);
            return (
              <button
                key={category.key}
                type="button"
                data-tile
                data-current={on ? "true" : undefined}
                onClick={() => toggle(category.key)}
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
                {on ? <span className="absolute right-1.5 top-1.5 rounded-full px-1 text-[9px] font-bold" style={{ background: category.color, color: "#0D0F12" }}>✓</span>
                  : tip ? <span className="absolute right-1.5 top-1.5 text-[10px] leading-none" style={{ color: category.color }} title="Suggested for this card">✦</span> : null}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5 text-[10px] font-mono text-gray-500">
          {currentKeys.length ? (
            <button type="button" onClick={() => onPick([])} className="rounded px-1.5 py-0.5 text-[#EB5757] transition hover:bg-[#EB575715]">
              Take it back
            </button>
          ) : <span>{picked.length ? `${picked.length} selected` : "Tap one or more"}</span>}
          <button type="button" data-save disabled={!changed} onClick={() => (changed ? onPick(picked) : onClose())}
            className="rounded-md border border-[#F0A63C80] bg-[#F0A63C26] px-2.5 py-1 text-[11px] font-medium text-[#F4F6FA] transition hover:brightness-125 disabled:opacity-35">
            {picked.length || !currentKeys.length ? "Save" : "Save · take back"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
