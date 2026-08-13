"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { showToast } from "../Toast";
import type { Category, Item } from "@/lib/brain-model";
import { CategorySettings } from "./CategorySettings";
import { DataSettings } from "./DataSettings";
import { GeneralSettings } from "./GeneralSettings";
import { IntegrationSettings } from "./IntegrationSettings";
import { TagSettings } from "./TagSettings";
import { TemplateSettings } from "./TemplateSettings";
import { SETTINGS_HEADING_STYLE } from "./ui";
import { SETTINGS_SECTIONS, parseSettingsSection, type SettingsSectionKey } from "./settings-sections";

/** Sections that need the full card list (for counts and tag maths). */
const SECTIONS_NEEDING_ITEMS: SettingsSectionKey[] = ["categories", "tags"];

export function SettingsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = parseSettingsSection(searchParams.get("section"));
  const active = SETTINGS_SECTIONS.find(s => s.key === section) || SETTINGS_SECTIONS[0];

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[] | null>(null);
  const itemsRequested = useRef(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      if (res.ok) setCategories(await res.json());
      else showToast("Failed to load categories", "error");
    } catch {
      showToast("Failed to load categories", "error");
    }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/items", { cache: "no-store" });
      if (res.ok) setItems(await res.json());
      else showToast("Failed to load items", "error");
    } catch {
      showToast("Failed to load items", "error");
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // The card list is only pulled for the sections that actually need it —
  // General/Templates/Integrations/Data never touch it.
  useEffect(() => {
    if (!SECTIONS_NEEDING_ITEMS.includes(section) || itemsRequested.current) return;
    itemsRequested.current = true;
    fetchItems();
  }, [section, fetchItems]);

  const selectSection = (key: SettingsSectionKey) => {
    router.replace(key === "general" ? "/settings" : `/settings?section=${key}`, { scroll: false });
  };

  const panel = (() => {
    switch (section) {
      case "categories":
        return (
          <CategorySettings
            categories={categories}
            setCategories={setCategories}
            items={items}
            onItemsChanged={fetchItems}
          />
        );
      case "tags":
        return <TagSettings items={items} onItemsChanged={fetchItems} />;
      case "templates":
        return <TemplateSettings categories={categories} />;
      case "integrations":
        return <IntegrationSettings />;
      case "data":
        return <DataSettings onDataImported={() => { fetchCategories(); if (itemsRequested.current) fetchItems(); }} />;
      default:
        return <GeneralSettings />;
    }
  })();

  const navButton = (key: SettingsSectionKey, label: string, icon: string, variant: "rail" | "strip") => {
    const isActive = key === section;
    return (
      <button
        key={`${variant}-${key}`}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => selectSection(key)}
        className={
          variant === "rail"
            ? "flex w-full min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-mono font-medium transition hover:border-[#E8A83860]"
            : "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-mono font-medium transition"
        }
        style={{
          borderColor: isActive ? "#E8A83870" : "#343842",
          background: isActive ? "#E8A83818" : "#13161B",
          color: isActive ? "#E8A838" : "#9AA1AD",
        }}
      >
        <span className="text-xs">{icon}</span>
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-brand-dark pb-10 text-gray-200">
      <div
        className="sticky top-0 z-40 border-b border-brand-border px-3 pt-4 pb-3 sm:px-5 min-[1800px]:px-3 min-[1800px]:pt-2"
        style={{ background: "linear-gradient(180deg, #13161B 0%, #0D0F12 100%)" }}
      >
        <div className="mx-auto max-w-5xl min-[1800px]:max-w-6xl">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-border text-sm text-gray-500 transition hover:border-[#E8A83860] hover:text-[#E8A838] active:scale-95 sm:h-10 sm:w-10"
              aria-label="Back to cards"
              title="Back to cards"
            >←</Link>
            <div className="min-w-0">
              <h1
                className="whitespace-nowrap text-lg font-bold sm:text-xl min-[1800px]:text-lg"
                style={{ ...SETTINGS_HEADING_STYLE, color: "#E8A838" }}
              >
                ⚙ Settings
              </h1>
              <p className="mt-0.5 truncate font-mono text-[11px] text-gray-600 min-[1800px]:text-[10px]">{active.blurb}</p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Settings sections"
            className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 md:hidden"
          >
            {SETTINGS_SECTIONS.map(s => navButton(s.key, s.label, s.icon, "strip"))}
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-5xl gap-6 px-3 pt-4 sm:px-5 min-[1800px]:max-w-6xl min-[1800px]:px-3">
        <nav
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="vertical"
          className="hidden w-52 shrink-0 flex-col gap-1.5 md:flex min-[1800px]:w-48"
        >
          {SETTINGS_SECTIONS.map(s => navButton(s.key, s.label, s.icon, "rail"))}
        </nav>

        <main role="tabpanel" aria-label={active.label} className="min-w-0 flex-1">
          {panel}
        </main>
      </div>
    </div>
  );
}
