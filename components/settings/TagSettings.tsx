"use client";

import { useState } from "react";
import { showToast } from "../Toast";
import { TAG_COLORS, type Item } from "@/lib/brain-model";
import {
  SETTINGS_GHOST_BUTTON_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_PRIMARY_BUTTON_CLASS,
  SETTINGS_PRIMARY_BUTTON_STYLE,
  SettingsCard,
  SettingsEmptyNote,
} from "./ui";

interface TagSettingsProps {
  items: Item[] | null;
  /** A merge rewrites tags on the server — refetch the cards afterwards. */
  onItemsChanged: () => void;
}

/**
 * Tag cleanup: merge case/punctuation variants (#ai / #AI / #a.i.) into one
 * tag, or rename any single tag everywhere. Both go through /api/tags/merge.
 * Moved here out of the Brain.tsx bottom sheet.
 */
export function TagSettings({ items, onItemsChanged }: TagSettingsProps) {
  const [mergingTag, setMergingTag] = useState<{ from: string[]; to: string } | null>(null);
  const [tagMergeLoading, setTagMergeLoading] = useState(false);

  const rows = items || [];
  const tagCounts = new Map<string, number>();
  for (const item of rows) {
    for (const tag of item.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const allTags = Array.from(tagCounts.keys()).sort((a, b) => a.localeCompare(b));
  const tagColor = (tag: string) => TAG_COLORS[allTags.indexOf(tag) % TAG_COLORS.length] || TAG_COLORS[0];

  // Group tags by normalized form — catches #ai/#AI/#a.i. etc. Only groups
  // with 2+ variants are worth showing.
  const duplicateGroups = (() => {
    const groups = new Map<string, string[]>();
    for (const tag of allTags) {
      const normalized = tag.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normalized) continue;
      const list = groups.get(normalized) || [];
      list.push(tag);
      groups.set(normalized, list);
    }
    return Array.from(groups.values())
      .filter(v => v.length > 1)
      .sort((a, b) => (tagCounts.get(b[0]) ?? 0) - (tagCounts.get(a[0]) ?? 0));
  })();

  const tagsByCount = [...allTags].sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0));

  const mergeTags = async (from: string[], to: string) => {
    setTagMergeLoading(true);
    try {
      const res = await fetch("/api/tags/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) {
        showToast("Merge failed", "error");
        return;
      }
      const data = await res.json();
      showToast(`Merged into #${to} (${data.affected} items)`, "success");
      setMergingTag(null);
      onItemsChanged();
    } catch {
      showToast("Merge failed", "error");
    }
    setTagMergeLoading(false);
  };

  const mergeEditor = (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="font-mono text-[11px] text-gray-500" htmlFor="tag-merge-target">Merge all into:</label>
      <input
        id="tag-merge-target"
        value={mergingTag?.to ?? ""}
        onChange={e => setMergingTag(m => (m ? { ...m, to: e.target.value } : null))}
        className={`${SETTINGS_INPUT_CLASS} sm:max-w-xs`}
      />
      <button
        type="button"
        onClick={() => mergingTag && mergeTags(mergingTag.from, mergingTag.to.trim())}
        disabled={tagMergeLoading || !mergingTag?.to.trim()}
        className={SETTINGS_PRIMARY_BUTTON_CLASS}
        style={SETTINGS_PRIMARY_BUTTON_STYLE}
      >{tagMergeLoading ? "…" : "Merge"}</button>
      <button type="button" onClick={() => setMergingTag(null)} className={SETTINGS_GHOST_BUTTON_CLASS}>Cancel</button>
    </div>
  );

  if (!items) {
    return (
      <SettingsCard title="Tag cleanup" description="Loading your cards…">
        <SettingsEmptyNote>Counting tags…</SettingsEmptyNote>
      </SettingsCard>
    );
  }

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Tag cleanup"
        description={
          duplicateGroups.length === 0
            ? "Tags differing only by case or punctuation (#ai / #AI / #a.i.) appear here."
            : `${duplicateGroups.length} group${duplicateGroups.length > 1 ? "s" : ""} with case/punctuation variants.`
        }
      >
        {duplicateGroups.length === 0 && <SettingsEmptyNote>No duplicate groups detected.</SettingsEmptyNote>}
        {duplicateGroups.map((group, gi) => {
          const sorted = [...group].sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0));
          const suggestedTo = sorted[0];
          const isActive = !!mergingTag && group.every(t => mergingTag.from.includes(t) || mergingTag.to === t);
          return (
            <div key={gi} className="mb-3 rounded-lg border border-brand-border bg-brand-muted/30 p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {sorted.map(tag => {
                  const color = tagColor(tag);
                  return (
                    <span
                      key={tag}
                      className="rounded-full px-2 py-0.5 font-mono text-[11px]"
                      style={{ border: `1px solid ${color}30`, background: `${color}10`, color }}
                    >
                      #{tag} <span className="opacity-60">{tagCounts.get(tag) ?? 0}</span>
                    </span>
                  );
                })}
              </div>
              {isActive ? mergeEditor : (
                <button
                  type="button"
                  onClick={() => setMergingTag({ from: group, to: suggestedTo })}
                  className="min-h-[44px] font-mono text-[11px] text-[#5B8DEF] transition hover:text-[#E8A838]"
                >→ Merge variants</button>
              )}
            </div>
          );
        })}
      </SettingsCard>

      <SettingsCard
        title="All tags"
        description={`${allTags.length} tag${allTags.length === 1 ? "" : "s"} across ${rows.length} card${rows.length === 1 ? "" : "s"} — rename one to retag every card that uses it.`}
      >
        {allTags.length === 0 && <SettingsEmptyNote>No tags yet.</SettingsEmptyNote>}
        <div className="flex flex-wrap gap-1.5">
          {tagsByCount.map(tag => {
            const color = tagColor(tag);
            const isActive = !!mergingTag && mergingTag.from.length === 1 && mergingTag.from[0] === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setMergingTag(isActive ? null : { from: [tag], to: tag })}
                className="rounded-full px-2.5 py-1 font-mono text-[11px] transition hover:brightness-125"
                style={{
                  border: `1px solid ${color}${isActive ? "80" : "30"}`,
                  background: `${color}${isActive ? "22" : "10"}`,
                  color,
                }}
                title={`Rename #${tag} everywhere`}
                aria-pressed={isActive}
              >
                #{tag} <span className="opacity-60">{tagCounts.get(tag) ?? 0}</span>
              </button>
            );
          })}
        </div>
        {mergingTag && mergingTag.from.length === 1 && (
          <div className="mt-3 rounded-lg border border-brand-border bg-brand-muted/30 p-3">
            <p className="font-mono text-[11px] text-gray-500">Renaming #{mergingTag.from[0]}</p>
            {mergeEditor}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
