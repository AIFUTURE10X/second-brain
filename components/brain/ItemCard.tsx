"use client";

import type { Dispatch, SetStateAction } from "react";
import { LinkifiedText } from "../LinkifiedText";
import { extractCardLinks, formatCardLinkLabel } from "@/lib/card-links";
import { TAG_COLORS, TYPES, type Item, type RelatedItemSummary, type Reminder } from "@/lib/brain-model";
import { checklistProgress, fileIcon, formatReminderDue, formatSize, timeAgo } from "@/lib/brain-format";
import { readingStatusColor, readingStatusLabel } from "@/lib/reading-status.mjs";
import type { ViewMode } from "@/lib/view-mode";

interface ItemCardProps {
  item: Item;
  idx: number;
  expanded: boolean;
  density: ViewMode;
  isSummarizing: boolean;
  isDragTarget: boolean;
  relatedItems: RelatedItemSummary[];
  reminder: Reminder | null;
  failedPreviewUrls: Set<string>;
  getCatColor: (name: string) => string;
  onToggleExpanded: () => void;
  setDragTargetId: Dispatch<SetStateAction<string | null>>;
  onAttachFiles: (files: FileList) => void;
  onEdit: () => void;
  onArchive: () => void;
  onCycleReadingStatus: () => void;
  onPopOut: () => void;
  onDelete: () => void;
  onPreviewImageFailed: (src?: string) => void;
  onToggleChecklistRow: (rowId: string) => void;
  onOpenCard: (id: string) => void;
  onToggleFlag: (flag: "favourite" | "actionRequired") => void;
  onPin: () => void;
  onSummarize: () => void;
}

export function ItemCard({
  item,
  idx,
  expanded,
  density,
  isSummarizing,
  isDragTarget,
  relatedItems,
  reminder,
  failedPreviewUrls,
  getCatColor,
  onToggleExpanded,
  setDragTargetId,
  onAttachFiles,
  onEdit,
  onArchive,
  onCycleReadingStatus,
  onPopOut,
  onDelete,
  onPreviewImageFailed,
  onToggleChecklistRow,
  onOpenCard,
  onToggleFlag,
  onPin,
  onSummarize,
}: ItemCardProps) {
  const t = TYPES[item.type] || TYPES.note;
  const itemIcon = item.type === "task" && item.completed ? "☑" : t.icon;
  const checklistItems = item.checklistItems || [];
  const checklist = expanded ? checklistItems : checklistItems.slice(0, 3);
  const taskProgress = checklistProgress(checklistItems);
  const hasChecklist = item.type === "task" && checklistItems.length > 0;
  const firstImageAttachment = (item.attachments || []).find(a => a.contentType?.startsWith("image/") && !failedPreviewUrls.has(a.url));
  const hasOgPreview = !!(item.ogImage && !failedPreviewUrls.has(item.ogImage) && (item.type === "link" || item.type === "clip"));
  const hasAttachmentPreview = !hasOgPreview && !!firstImageAttachment;
  const hasPreview = hasOgPreview || hasAttachmentPreview;
  const previewImageSrc = hasOgPreview ? item.ogImage : firstImageAttachment?.url;
  const previewLinkUrl = hasOgPreview ? item.url : firstImageAttachment?.url;
  const displayedAttachments = hasAttachmentPreview
    ? (item.attachments || []).filter(a => a.url !== firstImageAttachment?.url)
    : (item.attachments || []);
  const isYouTube = item.siteName === "YouTube";
  const isCompact = density === "compact" && !expanded;
  const isList = density === "list" && !expanded;
  const compactCardClass = isCompact ? "aspect-square flex flex-col" : "";
  const compactPreviewClass = "relative block w-full aspect-[5/4] bg-brand-muted overflow-hidden group shrink-0";
  const compactBodyClass = isCompact ? "flex flex-1 flex-col justify-between min-h-0 px-3 py-2.5" : isList ? "px-3 py-2.5" : "p-4";
  const compactTitleClass = isCompact ? "text-[13px] line-clamp-2" : isList ? "text-[13px]" : "text-sm";
  const cardLinks = extractCardLinks(item);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleExpanded}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpanded(); } }}
      onDragEnter={e => {
        const types = Array.from(e.dataTransfer?.types || []);
        if (!types.some(t => t === "Files" || t === "application/x-moz-file")) return;
        setDragTargetId(item.id);
      }}
      onDragOver={e => {
        const types = Array.from(e.dataTransfer?.types || []);
        if (!types.some(t => t === "Files" || t === "application/x-moz-file")) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={e => {
        const related = e.relatedTarget as Node | null;
        if (related && e.currentTarget.contains(related)) return;
        setDragTargetId(prev => prev === item.id ? null : prev);
      }}
      onDrop={e => {
        if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        setDragTargetId(null);
        onAttachFiles(e.dataTransfer.files);
      }}
      className={`bg-brand-card ${isList ? "rounded-lg" : "rounded-xl"} ${compactCardClass} ${density === "compact" ? "" : density === "list" ? "" : "mb-2.5"} cursor-pointer transition-all overflow-hidden relative group`}
      style={{
        border: `1px solid ${isDragTarget ? "#E8A838" : item.pinned ? "#E8A83850" : item.type === "task" && item.completed ? "#56CCF240" : "#1E2128"}`,
        background: isDragTarget ? "#E8A83820" : item.pinned ? "#E8A83808" : item.type === "task" && item.completed ? "#56CCF208" : undefined,
        animation: `fadeSlide 0.3s ease ${idx * 0.03}s both`,
        boxShadow: isDragTarget ? "0 0 0 2px #E8A83840" : undefined,
        opacity: item.type === "task" && item.completed ? 0.88 : 1,
      }}
    >
      {/* Quick action overlay (edit + delete) — both density modes */}
      <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className="w-8 h-8 sm:w-6 sm:h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-[#E8A838] hover:bg-[#E8A83820] active:scale-90 transition flex items-center justify-center text-[11px]"
          aria-label="Edit item"
          title="Edit"
        >✎</button>
        <button
          onClick={e => { e.stopPropagation(); onPopOut(); }}
          className="w-8 h-8 sm:w-6 sm:h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-[#5B8DEF] hover:bg-[#5B8DEF20] active:scale-90 transition flex items-center justify-center text-[11px]"
          aria-label="Pop out in new window"
          title="Pop out"
        >⇱</button>
        <button
          onClick={e => { e.stopPropagation(); onArchive(); }}
          className="w-8 h-8 sm:w-6 sm:h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-[#E8A838] hover:bg-[#E8A83820] active:scale-90 transition flex items-center justify-center text-[11px]"
          aria-label={item.archivedAt ? "Unarchive item" : "Archive item"}
          title={item.archivedAt ? "Unarchive" : "Archive"}
        >{item.archivedAt ? "↩" : "⊟"}</button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="w-8 h-8 sm:w-6 sm:h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-red-400 hover:bg-red-500/20 active:scale-90 transition flex items-center justify-center text-sm"
          aria-label="Delete item"
          title="Delete"
        >×</button>
      </div>

      {/* Compact-mode top thumbnail (shorter than comfortable banner) */}
      {hasPreview && isCompact && (
        <a
          href={previewLinkUrl}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className={compactPreviewClass}
          title={isYouTube ? "Open on YouTube" : hasOgPreview ? "Open link" : "Open image"}
        >
          <img
            src={previewImageSrc}
            alt=""
            loading="lazy"
            onError={() => onPreviewImageFailed(previewImageSrc)}
            className="w-full h-full object-cover object-center"
          />
          {isYouTube && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                <span className="text-white text-xs ml-0.5">▶</span>
              </div>
            </div>
          )}
        </a>
      )}

      {/* Thumbnail preview for links */}
      {hasPreview && !isCompact && !isList && (
        <a
          href={previewLinkUrl}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="relative block w-full h-32 sm:h-40 bg-brand-muted overflow-hidden group"
          title={isYouTube ? "Open on YouTube" : hasOgPreview ? "Open link" : "Open image"}
        >
          <img
            src={previewImageSrc}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => onPreviewImageFailed(previewImageSrc)}
          />
          {isYouTube && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                <span className="text-white text-lg ml-0.5">▶</span>
              </div>
            </div>
          )}
          {hasOgPreview && item.siteName && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 rounded-md px-2 py-1 max-w-[calc(100%-1rem)]">
              {item.favicon && <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0" loading="lazy" />}
              <span className="text-[10px] text-gray-300 font-mono shrink-0">{item.siteName}</span>
              {isYouTube && item.ogDescription && (
                <span className="text-[10px] text-gray-400 font-mono truncate" title={item.ogDescription}>
                  · {item.ogDescription}
                </span>
              )}
            </div>
          )}
        </a>
      )}

      <div className={compactBodyClass}>
        <div className={`flex ${isCompact ? "gap-2" : isList ? "gap-2.5 items-center" : "gap-3"}`}>
          {hasPreview && isList && (
            <a
              href={previewLinkUrl}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="relative w-12 h-12 rounded-md bg-brand-muted overflow-hidden shrink-0 border border-brand-border"
              title={isYouTube ? "Open on YouTube" : hasOgPreview ? "Open link" : "Open image"}
            >
              <img
                src={previewImageSrc}
                alt=""
                loading="lazy"
                onError={() => onPreviewImageFailed(previewImageSrc)}
                className="w-full h-full object-cover"
              />
              {isYouTube && (
                <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] bg-black/20">▶</span>
              )}
            </a>
          )}
          {!hasPreview && (
            <div
              className={`${isCompact ? "w-6 h-6 text-xs" : isList ? "w-8 h-8 text-sm" : "w-8 h-8 text-base"} rounded-lg flex items-center justify-center shrink-0`}
              style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}
            >{itemIcon}</div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {item.pinned && <span className="text-[10px]" title="Pinned">📌</span>}
              {item.favourite && <span className="text-[10px]" style={{ color: "#F2C94C" }} title="Favourite">★</span>}
              {item.actionRequired && <span className="text-[10px]" style={{ color: "#EB5757" }} title="Needs action">⚡</span>}
              {reminder && <span className="text-[10px]" style={{ color: "#56CCF2" }} title={`Reminder: ${formatReminderDue(reminder.dueAt)}`}>⏰</span>}
              {hasPreview && !isCompact && !isList && (
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0"
                  style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}
                >{itemIcon}</div>
              )}
              <p className={`${compactTitleClass} font-semibold text-gray-100 ${expanded ? "" : isCompact ? "" : "truncate"} ${item.type === "task" && item.completed ? "line-through text-gray-400" : ""}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {item.title || item.ogTitle || "Untitled"}
              </p>
              {hasChecklist && (
                <span className="text-[10px] font-mono text-gray-500">
                  {taskProgress.completed}/{taskProgress.total}
                </span>
              )}
            </div>

            {/* YouTube channel/author name */}
            {isYouTube && item.ogDescription && (
              <p className="text-[11px] mt-0.5 truncate flex items-center gap-1" style={{ color: "#EB5757" }}>
                <span className="text-[9px]" aria-hidden>▶</span>
                <span className="truncate">{item.ogDescription}</span>
              </p>
            )}

            {/* OG description for links (when no user content) — skip for YouTube since
                ogDescription holds the channel name shown above */}
            {item.ogDescription && !item.content && !isCompact && !isYouTube && (
              <p className={`text-xs text-gray-500 mt-1 ${isList ? "line-clamp-1" : "line-clamp-2"}`}>{item.ogDescription}</p>
            )}

            {item.url && !isCompact && !expanded && (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                onClick={e => e.stopPropagation()}
                className={`${isList ? "text-[10px] mt-0.5" : "text-[11px] mt-1"} text-type-link font-mono block truncate hover:underline`}
              >↗ {item.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}</a>
            )}

            {item.content && !isCompact && (
              <LinkifiedText
                text={item.content}
                className={`${isList ? "text-[11px] mt-0.5 line-clamp-1" : "text-xs mt-1.5"} text-gray-500 leading-relaxed ${expanded ? "whitespace-pre-wrap" : isList ? "line-clamp-1" : "line-clamp-2"}`}
              />
            )}

            {expanded && cardLinks.length > 0 && !isCompact && !isList && (
              <div className="mt-2.5 pt-2.5 border-t border-brand-border">
                <p className="text-[10px] text-gray-600 font-mono mb-1.5">Links</p>
                <div className="flex flex-col gap-1.5">
                  {cardLinks.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-muted/50 px-2.5 py-2 text-left hover:border-[#5B8DEF60] hover:text-white transition"
                      title={link}
                    >
                      <span className="text-type-link shrink-0">↗</span>
                      <span className="text-[11px] text-gray-300 truncate">{formatCardLinkLabel(link)}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Notes section (separate from content) — entries first, legacy fallback */}
            {!isCompact && !isList && (() => {
              const entries = (item.noteEntries || []).filter(e => e.body?.trim().length > 0);
              if (entries.length > 0) {
                const visible = expanded ? entries : entries.slice(0, 2);
                return (
                  <div className="mt-2 pl-2.5 border-l-2 flex flex-col gap-1" style={{ borderColor: t.color + "40" }}>
                    {visible.map(e => (
                      <LinkifiedText
                        key={e.id}
                        text={e.body}
                        className={`text-[11px] text-gray-400 italic leading-relaxed ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}
                      />
                    ))}
                    {!expanded && entries.length > 2 && (
                      <span className="text-[10px] font-mono text-gray-600">+{entries.length - 2} more entries</span>
                    )}
                  </div>
                );
              }
              if (item.notes) {
                return (
                  <div className={`mt-2 pl-2.5 border-l-2 ${expanded ? "" : "line-clamp-2"}`} style={{ borderColor: t.color + "40" }}>
                    <LinkifiedText text={item.notes} className="text-[11px] text-gray-400 italic leading-relaxed" />
                  </div>
                );
              }
              return null;
            })()}

            {hasChecklist && !isCompact && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                {checklist.map(row => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onToggleChecklistRow(row.id);
                    }}
                    className="flex items-center gap-2 min-h-[44px] sm:min-h-0 rounded-lg border border-brand-border bg-brand-muted/50 px-2.5 py-2 text-left hover:border-[#56CCF260] transition"
                    aria-label={`${row.completed ? "Uncheck" : "Check"} ${row.text}`}
                    title={row.completed ? "Mark incomplete" : "Mark complete"}
                  >
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px]"
                      style={{
                        borderColor: row.completed ? "#56CCF2" : "#3A3D44",
                        color: row.completed ? "#56CCF2" : "#666",
                        background: row.completed ? "#56CCF220" : "transparent",
                      }}
                    >
                      {row.completed ? "✓" : ""}
                    </span>
                    <span className={`text-sm ${row.completed ? "text-gray-500 line-through" : "text-gray-200"}`}>
                      {row.text}
                    </span>
                  </button>
                ))}
                {!expanded && checklistItems.length > checklist.length && (
                  <span className="text-[10px] font-mono text-gray-600">
                    +{checklistItems.length - checklist.length} more checklist items
                  </span>
                )}
              </div>
            )}

            {expanded && relatedItems.length > 0 && !isCompact && !isList && (
              <div className="mt-2.5 pt-2.5 border-t border-brand-border">
                <p className="text-[10px] text-gray-600 font-mono mb-1.5">Related</p>
                <div className="flex flex-wrap gap-1.5">
                  {relatedItems.map(related => {
                    const relatedType = TYPES[related.type] || TYPES.note;
                    return (
                      <div
                        key={related.id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-brand-muted border border-brand-border max-w-full"
                      >
                        {related.url ? (
                          <a
                            href={related.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 min-w-0 text-left hover:text-white transition"
                            title="Open source URL"
                          >
                            <span className="text-[10px] shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                            <span className="text-[11px] text-gray-300 truncate max-w-[180px]">
                              {related.title || related.ogTitle || related.url || "Untitled"}
                            </span>
                            <span className="text-[10px] text-type-link shrink-0">↗</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onOpenCard(related.id); }}
                            className="flex items-center gap-1.5 min-w-0 text-left hover:text-white transition"
                            title="Open related card"
                          >
                            <span className="text-[10px] shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                            <span className="text-[11px] text-gray-300 truncate max-w-[180px]">
                              {related.title || related.ogTitle || "Untitled"}
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={`flex items-center gap-2 ${isCompact ? "mt-1" : "mt-2"} flex-wrap`}>
              {item.category && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: getCatColor(item.category) + "15", color: getCatColor(item.category), border: `1px solid ${getCatColor(item.category)}30` }}
                >{item.category}</span>
              )}
              {reminder && (
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: "#56CCF215", color: "#56CCF2", border: "1px solid #56CCF230" }}
                  title={reminder.message || "Reminder"}
                >⏰ {formatReminderDue(reminder.dueAt)}</span>
              )}
              {(item.tags || []).slice(0, isCompact ? 3 : undefined).map((tag, ti) => (
                <span key={ti} className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ color: TAG_COLORS[ti % TAG_COLORS.length], background: TAG_COLORS[ti % TAG_COLORS.length] + "10" }}>#{tag}</span>
              ))}
              {isCompact && (item.tags || []).length > 3 && (
                <span className="text-[10px] text-gray-600 font-mono">+{(item.tags || []).length - 3}</span>
              )}
              {isCompact && displayedAttachments.length > 0 && (
                <span className="text-[10px] text-gray-500 font-mono" title={`${displayedAttachments.length} attachment${displayedAttachments.length > 1 ? "s" : ""}`}>📎 {displayedAttachments.length}</span>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                <button
                  onClick={e => { e.stopPropagation(); onToggleFlag("favourite"); }}
                  className="text-[12px] leading-none px-1 py-0.5 rounded hover:bg-white/5 transition"
                  style={{ color: item.favourite ? "#F2C94C" : "#3a3d44", opacity: item.favourite ? 1 : 0.7 }}
                  title={item.favourite ? "Unfavourite" : "Mark as favourite"}
                  aria-label={item.favourite ? "Unfavourite" : "Mark as favourite"}
                >{item.favourite ? "★" : "☆"}</button>
                <button
                  onClick={e => { e.stopPropagation(); onToggleFlag("actionRequired"); }}
                  className="text-[12px] leading-none px-1 py-0.5 rounded hover:bg-white/5 transition"
                  style={{ color: item.actionRequired ? "#EB5757" : "#3a3d44", opacity: item.actionRequired ? 1 : 0.7 }}
                  title={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                  aria-label={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                >⚡</button>
                <span className="text-[10px] text-gray-700 font-mono ml-1">{timeAgo(item.createdAt)}</span>
              </div>
            </div>

            {/* Attachments */}
            {displayedAttachments.length > 0 && !isCompact && !isList && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {displayedAttachments.map(att => (
                  <a
                    key={att.url}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono bg-brand-muted border border-brand-border text-gray-300 hover:border-gray-600 hover:text-white transition"
                    title={`${att.name} · ${formatSize(att.size)}`}
                  >
                    <span>{fileIcon(att.contentType, att.name)}</span>
                    <span className="max-w-[160px] truncate">{att.name}</span>
                    <span className="text-gray-600 text-[9px]">{formatSize(att.size)}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Action buttons — hidden in compact view unless expanded */}
            {!isCompact && !isList && (
            <div className="flex flex-wrap gap-2 mt-3 pt-2.5 border-t border-brand-border">
              <button
                onClick={e => { e.stopPropagation(); onPin(); }}
                className="px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                style={{ border: "1px solid #E8A83830", background: "#E8A83810", color: "#E8A838" }}
              >{item.pinned ? "Unpin" : "Pin"}</button>
              <button
                onClick={e => { e.stopPropagation(); onToggleFlag("favourite"); }}
                className="px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                style={{
                  border: item.favourite ? "1px solid #F2C94C90" : "1px solid #F2C94C30",
                  background: item.favourite ? "#F2C94C25" : "#F2C94C10",
                  color: "#F2C94C",
                }}
                title={item.favourite ? "Remove from favourites" : "Mark as favourite"}
              >{item.favourite ? "★ Favourite" : "☆ Favourite"}</button>
              <button
                onClick={e => { e.stopPropagation(); onToggleFlag("actionRequired"); }}
                className="px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                style={{
                  border: item.actionRequired ? "1px solid #EB575790" : "1px solid #EB575730",
                  background: item.actionRequired ? "#EB575725" : "#EB575710",
                  color: "#EB5757",
                }}
                title={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
              >{item.actionRequired ? "⚡ Action needed" : "⚡ Flag action"}</button>
              {item.type === "link" && (
                <button
                  onClick={e => { e.stopPropagation(); onCycleReadingStatus(); }}
                  className="px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                  style={{
                    border: `1px solid ${readingStatusColor(item.readingStatus)}40`,
                    background: `${readingStatusColor(item.readingStatus)}10`,
                    color: readingStatusColor(item.readingStatus),
                  }}
                  title="Read-later status — click to cycle unread → reading → read"
                >{readingStatusLabel(item.readingStatus) || "◌ track reading"}</button>
              )}
              <button
                onClick={e => { e.stopPropagation(); onEdit(); }}
                className="px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                style={{ border: "1px solid #5B8DEF30", background: "#5B8DEF10", color: "#5B8DEF" }}
              >Edit</button>
              <button
                disabled={isSummarizing}
                onClick={e => { e.stopPropagation(); onSummarize(); }}
                className="px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95 disabled:opacity-50 flex items-center gap-1"
                style={{ border: "1px solid #56CCF230", background: "#56CCF210", color: "#56CCF2" }}
              >
                {isSummarizing && <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full" style={{ animation: "spin 0.6s linear infinite" }} />}
                {isSummarizing ? "Summarizing" : "Summarize"}
              </button>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
