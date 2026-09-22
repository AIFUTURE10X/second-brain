"use client";

import { getItemSummary } from "@/lib/item-summary";
import type { Item } from "@/lib/brain-model";
import { LinkifiedText } from "../LinkifiedText";

type SummaryItem = Pick<Item, "noteEntries" | "notes" | "content" | "url" | "siteName" | "ogDescription">;

export function CardSummary({ item, expanded = false, small = false, busy = false, onSummarize }: {
  item: SummaryItem;
  expanded?: boolean;
  small?: boolean;
  busy?: boolean;
  onSummarize?: () => void;
}) {
  const summary = getItemSummary(item);
  const isYouTube = item.siteName === "YouTube" || /(?:youtube\.com|youtu\.be)\//i.test(item.url);
  const description = item.content || (!isYouTube ? item.ogDescription : "");
  if (!summary && !description && !/^https?:\/\//i.test(item.url)) return null;
  return (
    <section aria-label="Card summary" onKeyDown={event => event.stopPropagation()} className={`mt-2 min-w-0 ${small ? "text-[11px]" : "text-xs"}`}>
      <p className="mb-1 text-[10px] font-mono text-gray-500">{summary ? "At a glance" : "Saved description"}</p>
      {expanded && !summary && description ? (
        <LinkifiedText text={description} className="whitespace-pre-wrap break-words leading-relaxed text-gray-300" />
      ) : summary || description ? (
        <p className={`break-words leading-relaxed text-gray-300 ${expanded ? "" : "line-clamp-3"}`} title={summary?.shortSummary || description}>
          {summary?.shortSummary || description}
        </p>
      ) : <p className="text-gray-500">No summary yet.</p>}
      {expanded && summary?.detailedSummary && (
        <div className="mt-3 rounded-lg border border-brand-border bg-brand-muted/40 p-3">
          <p className="mb-2 text-[11px] font-mono text-[#56CCF2]">Detailed summary</p>
          <LinkifiedText text={summary.detailedSummary} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-300" />
        </div>
      )}
      {onSummarize && (!summary || expanded) && (
        <button type="button" disabled={busy} onClick={event => { event.stopPropagation(); onSummarize(); }}
          className="mt-1.5 text-[11px] text-[#56CCF2] hover:underline disabled:opacity-50">
          {busy ? "Summarizing…" : summary ? "Regenerate summary" : "Generate summary"}
        </button>
      )}
    </section>
  );
}
