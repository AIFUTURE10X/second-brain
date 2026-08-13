"use client";

import type { ReactNode } from "react";

// Shared visual vocabulary for the settings sections. Matches the rest of the
// app: #0D0F12 page, #13161B cards, #1E2128 borders, amber accent, Space
// Grotesk headings via inline style (existing convention), no UI libraries.

export const SETTINGS_INPUT_CLASS =
  "w-full min-h-[44px] rounded-lg border border-brand-border bg-brand-muted px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-600 focus:border-[#E8A83860]";

export const SETTINGS_SELECT_CLASS =
  "min-h-[44px] rounded-lg border border-brand-border bg-brand-muted px-2.5 py-2 text-xs font-mono text-gray-300 outline-none transition focus:border-[#E8A83860]";

export const SETTINGS_PRIMARY_BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-mono font-medium text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

export const SETTINGS_PRIMARY_BUTTON_STYLE = { background: "linear-gradient(135deg, #F2C94C, #E8A838)" };

export const SETTINGS_GHOST_BUTTON_CLASS =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-brand-border px-4 py-2 text-[12px] font-mono text-gray-400 transition hover:border-gray-600 hover:text-gray-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

export const SETTINGS_HEADING_STYLE = { fontFamily: "'Space Grotesk', sans-serif" };

export function SettingsCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-brand-border bg-brand-card p-4 min-[1800px]:p-3.5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm min-[1800px]:text-[13px] font-semibold text-gray-200" style={SETTINGS_HEADING_STYLE}>
            {title}
          </h3>
          {description && <p className="mt-0.5 text-[11px] font-mono text-gray-600">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SettingsToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12px] font-mono text-gray-300">{label}</p>
        <p className="text-[11px] font-mono text-gray-600">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={checked ? `Turn off ${label}` : `Turn on ${label}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-60"
        style={{
          borderColor: checked ? "#F2C94C80" : "#333842",
          background: checked ? "#F2C94C28" : "#181B21",
        }}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full transition-all"
          style={{
            left: checked ? "22px" : "4px",
            background: checked ? "#F2C94C" : "#5B616D",
            boxShadow: checked ? "0 0 12px rgba(242, 201, 76, 0.35)" : "none",
          }}
        />
      </button>
    </div>
  );
}

export function SettingsEmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-mono text-gray-600">{children}</p>;
}

/** Suspense fallback for the settings shell (it reads ?section= on the client). */
export function SettingsLoading() {
  return (
    <div className="min-h-screen bg-brand-dark px-4 py-6">
      <div className="mx-auto max-w-5xl animate-pulse space-y-3">
        <div className="h-6 w-40 rounded bg-brand-card" />
        <div className="h-24 rounded-xl border border-brand-border bg-brand-card" />
        <div className="h-24 rounded-xl border border-brand-border bg-brand-card" />
      </div>
    </div>
  );
}
