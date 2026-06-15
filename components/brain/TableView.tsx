import { TAG_COLORS, TYPES, WORKFLOW_STATUS_META, type Item } from "@/lib/brain-model";
import { sourceFromUrl, timeAgo } from "@/lib/brain-format";
import { localFileViewerHref } from "@/lib/local-file-links";
import { showToast } from "../Toast";
import { copyToClipboard } from "@/lib/clipboard";
import { openLocalPathInDesktop } from "@/lib/desktop";

interface TableViewProps {
  items: Item[];
  selectedIds: Set<string>;
  relationCounts: Map<string, number>;
  getCatColor: (name: string) => string;
  onToggleSelected: (id: string) => void;
  onOpenCard: (id: string) => void;
  onToggleFlag: (id: string, flag: "favourite" | "actionRequired") => void;
  onMarkReviewed: (id: string) => void;
}

export function TableView({
  items,
  selectedIds,
  relationCounts,
  getCatColor,
  onToggleSelected,
  onOpenCard,
  onToggleFlag,
  onMarkReviewed,
}: TableViewProps) {
  const headCellClass = "sticky top-0 z-10 border-b border-r border-brand-border bg-[#0F1218]/95 px-2.5 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500";
  const cellClass = "border-b border-r border-brand-border/50 px-2.5 py-1.5 align-middle";

  return (
    <div className="max-h-[calc(100vh-15.5rem)] overflow-auto rounded-lg border border-brand-border bg-brand-card shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <table className="w-full min-w-[74rem] table-fixed border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <th scope="col" className={`${headCellClass} w-9`}> </th>
            <th scope="col" className={`${headCellClass} w-[24rem]`}>Title</th>
            <th scope="col" className={`${headCellClass} w-24`}>Type</th>
            <th scope="col" className={`${headCellClass} w-36`}>Category</th>
            <th scope="col" className={`${headCellClass} w-[20rem]`}>Tags</th>
            <th scope="col" className={`${headCellClass} w-44`}>Status</th>
            <th scope="col" className={`${headCellClass} w-24`}>Links</th>
            <th scope="col" className={`${headCellClass} w-36`}>Source</th>
            <th scope="col" className={`${headCellClass} w-24`}>Saved</th>
            <th scope="col" className={`${headCellClass} w-24 border-r-0 text-right`}>Updated</th>
          </tr>
        </thead>
        <tbody className="text-[11px]">
          {items.map(item => {
            const type = TYPES[item.type] || TYPES.note;
            const selected = selectedIds.has(item.id);
            const source = sourceFromUrl(item.url);
            const isFolder = item.type === "folder";
            const sourceLabel = isFolder ? "Local folder" : item.url.startsWith("file:") ? "Local file" : source?.label || "Manual";
            const visibleTags = (item.tags || []).slice(0, 3);
            const hiddenTagCount = Math.max(0, (item.tags || []).length - 3);
            const isUnreviewed = item.reviewedAt === null;
            const workflowStatus = WORKFLOW_STATUS_META[item.workflowStatus || "active"];
            const relationCount = relationCounts.get(item.id) || 0;
            return (
              <tr
                key={item.id}
                onClick={() => onOpenCard(item.id)}
                className={`h-[3.25rem] cursor-pointer transition odd:bg-white/[0.012] hover:bg-white/[0.04] ${selected ? "bg-[#5B8DEF12]" : ""}`}
              >
                <td className={`${cellClass} text-center`}>
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); onToggleSelected(item.id); }}
                    className={`mx-auto flex h-4 w-4 items-center justify-center rounded-md border text-[10px] transition ${selected ? "border-[#5B8DEF] bg-[#5B8DEF30] text-[#9BBEFF]" : "border-[#5B8DEF50] text-transparent hover:border-[#5B8DEF]"}`}
                    aria-pressed={selected}
                    aria-label={selected ? "Deselect card" : "Select card"}
                    title={selected ? "Deselect" : "Select"}
                  >
                    {selected ? "✓" : ""}
                  </button>
                </td>
                <td className={cellClass}>
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-4 text-gray-100" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {item.title || item.ogTitle || "Untitled"}
                    </div>
                    {item.content && <div className="mt-0.5 truncate font-mono text-[10px] leading-4 text-gray-600">{item.content}</div>}
                  </div>
                </td>
                <td className={cellClass}>
                  <span
                    className="inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none"
                    style={{ color: type.color, background: `${type.color}14`, border: `1px solid ${type.color}30` }}
                  >
                    <span>{type.icon}</span>
                    <span className="truncate">{type.label}</span>
                  </span>
                </td>
                <td className={cellClass}>
                  {item.category ? (
                    <span
                      className="inline-block max-w-full truncate rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none"
                      style={{ color: getCatColor(item.category), background: `${getCatColor(item.category)}15`, border: `1px solid ${getCatColor(item.category)}30` }}
                    >
                      {item.category}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-gray-700">None</span>
                  )}
                </td>
                <td className={cellClass}>
                  <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
                    {visibleTags.map((tag, index) => (
                      <span
                        key={tag}
                        className="max-w-[6.5rem] shrink-0 truncate rounded-md px-1.5 py-0.5 font-mono text-[10px] leading-none"
                        style={{ color: TAG_COLORS[index % TAG_COLORS.length], background: `${TAG_COLORS[index % TAG_COLORS.length]}12` }}
                      >
                        #{tag}
                      </span>
                    ))}
                    {hiddenTagCount > 0 && (
                      <span className="shrink-0 rounded-md border border-brand-border bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] leading-none text-gray-500">
                        +{(item.tags || []).length - 3}
                      </span>
                    )}
                    {(item.tags || []).length === 0 && <span className="font-mono text-[10px] text-gray-700">No tags</span>}
                  </div>
                </td>
                <td className={cellClass}>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none"
                      style={{ borderColor: `${workflowStatus.color}30`, color: workflowStatus.color, background: `${workflowStatus.color}12` }}
                    >
                      {workflowStatus.label}
                    </span>
                    {isUnreviewed && (
                      <button
                        type="button"
                        onClick={event => { event.stopPropagation(); onMarkReviewed(item.id); }}
                        className="rounded-md border border-[#5B8DEF40] bg-[#5B8DEF12] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#5B8DEF]"
                        title="Mark reviewed"
                      >
                        Inbox
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={event => { event.stopPropagation(); onToggleFlag(item.id, "favourite"); }}
                      className="rounded px-1 py-0.5 text-[12px] leading-none transition hover:bg-white/5"
                      style={{ color: item.favourite ? "#F2C94C" : "#3A3D44" }}
                      aria-label={item.favourite ? "Unfavourite" : "Mark as favourite"}
                      title={item.favourite ? "Unfavourite" : "Mark as favourite"}
                    >
                      {item.favourite ? "★" : "☆"}
                    </button>
                    <button
                      type="button"
                      onClick={event => { event.stopPropagation(); onToggleFlag(item.id, "actionRequired"); }}
                      className="rounded px-1 py-0.5 text-[12px] leading-none transition hover:bg-white/5"
                      style={{ color: item.actionRequired ? "#EB5757" : "#3A3D44" }}
                      aria-label={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                      title={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                    >
                      ⚡
                    </button>
                  </div>
                </td>
                <td className={cellClass}>
                  {relationCount > 0 ? (
                    <button
                      type="button"
                      onClick={event => { event.stopPropagation(); onOpenCard(item.id); }}
                      className="rounded-md border border-[#6FCF9730] bg-[#6FCF9712] px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#6FCF97] transition hover:border-[#6FCF9780]"
                      title="Open related links"
                    >
                      {relationCount} linked
                    </button>
                  ) : (
                    <span className="font-mono text-[10px] text-gray-700">0</span>
                  )}
                </td>
                <td className={cellClass}>
                  {item.url ? (
                    isFolder ? (
                      <button
                        type="button"
                        onClick={async event => {
                          event.stopPropagation();
                          const path = item.url.trim();
                          if (await openLocalPathInDesktop(path)) {
                            showToast("Opening folder…", "success");
                            return;
                          }
                          const ok = await copyToClipboard(path);
                          showToast(ok ? "Path copied — paste into File Explorer" : "Couldn't copy path", ok ? "success" : "error");
                        }}
                        className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#F2994A] transition hover:bg-[#F2994A12]"
                        title={`Open folder (or copy path): ${item.url}`}
                      >
                        <span className="truncate">{sourceLabel}</span>
                        <span className="text-gray-600">⧉</span>
                      </button>
                    ) : (
                      <a
                        href={localFileViewerHref(item.url)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={event => { event.stopPropagation(); }}
                        className="inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] leading-none text-[#8FB3FF] transition hover:bg-[#5B8DEF12] hover:text-[#B8CCFF]"
                        title={item.url}
                      >
                        <span className="truncate">{sourceLabel}</span>
                        <span className="text-gray-600">↗</span>
                      </a>
                    )
                  ) : (
                    <span className="font-mono text-[10px] text-gray-700">Manual</span>
                  )}
                </td>
                <td className={`${cellClass} font-mono text-[10px] text-gray-600`}>
                  {timeAgo(item.createdAt)}
                </td>
                <td className={`${cellClass} border-r-0 text-right font-mono text-[10px] text-gray-700`}>
                  {timeAgo(item.updatedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
