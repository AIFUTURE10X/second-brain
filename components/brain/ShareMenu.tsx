"use client";

import { useEffect, useRef, useState } from "react";
import { buildCardShareLinks, type ShareableCard } from "@/lib/outbound-share-links";

interface ShareMenuProps {
  item: ShareableCard;
  variant?: "icon" | "button";
}

const menuItemClass = "block rounded-md px-3 py-2 text-[11px] font-mono text-gray-300 transition hover:bg-white/5 hover:text-white";

export function ShareMenu({ item, variant = "icon" }: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const links = buildCardShareLinks(item);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const triggerClass = variant === "button"
    ? "px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
    : "w-8 h-8 sm:w-6 sm:h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-[#6FCF97] hover:bg-[#6FCF9720] active:scale-90 transition flex items-center justify-center text-[11px]";

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onClick={event => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={triggerClass}
        style={variant === "button" ? { border: "1px solid #6FCF9730", background: "#6FCF9710", color: "#6FCF97" } : undefined}
        aria-label="Share card"
        aria-expanded={open}
        title="Share card"
      >
        {variant === "button" ? "Share" : "↗"}
      </button>

      {open && (
        <span
          role="menu"
          aria-label="Share options"
          className="absolute right-0 top-full z-50 mt-1.5 w-36 rounded-lg border border-brand-border bg-[#0D0F12] p-1 shadow-2xl shadow-black/40"
        >
          <a href={links.email} target="_blank" rel="noreferrer" role="menuitem" className={menuItemClass}>Gmail</a>
          <a href={links.whatsapp} target="_blank" rel="noreferrer" role="menuitem" className={menuItemClass}>WhatsApp</a>
          <a href={links.telegram} target="_blank" rel="noreferrer" role="menuitem" className={menuItemClass}>Telegram</a>
        </span>
      )}
    </span>
  );
}
