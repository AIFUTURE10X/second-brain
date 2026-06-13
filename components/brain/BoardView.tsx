import { TAG_COLORS, TYPES, WORKFLOW_STATUS_META, type Item } from "@/lib/brain-model";
import { timeAgo } from "@/lib/brain-format";

interface BoardViewProps {
  items: Item[];
  categoryNames: string[];
  selectedIds: Set<string>;
  relationCounts: Map<string, number>;
  getCatColor: (name: string) => string;
  onToggleSelected: (id: string) => void;
  onOpenCard: (id: string) => void;
  onToggleFlag: (id: string, flag: "favourite" | "actionRequired") => void;
  onMarkReviewed: (id: string) => void;
}

export function BoardView({
  items,
  categoryNames,
  selectedIds,
  relationCounts,
  getCatColor,
  onToggleSelected,
  onOpenCard,
  onToggleFlag,
  onMarkReviewed,
}: BoardViewProps) {
  const usedCategoryNames = items.map(item => item.category).filter((value): value is string => Boolean(value));
  const columnNames = Array.from(new Set([...categoryNames.filter(name => usedCategoryNames.includes(name)), ...usedCategoryNames, "Uncategorized"]));
  const groupedItems = columnNames.map(name => ({
    name,
    items: name === "Uncategorized" ? items.filter(item => !item.category) : items.filter(item => item.category === name),
  })).filter(group => group.items.length > 0);

  return (
    <div className="rounded-xl border border-brand-border/70 bg-[#0D1016] p-2">
      <div className="grid min-h-[18rem] grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] items-start gap-2.5">
        {groupedItems.map(group => {
          const color = group.name === "Uncategorized" ? "#6B7280" : getCatColor(group.name);
          return (
            <section
              key={group.name}
              className="flex max-h-[calc(100vh-17rem)] min-h-[18rem] min-w-0 flex-col overflow-hidden rounded-lg border border-brand-border bg-brand-card"
              aria-label={`${group.name} column`}
            >
              <div className="flex items-center justify-between border-b border-brand-border bg-brand-muted/80 px-3 py-2 backdrop-blur">
                <span
                  className="min-w-0 truncate text-[11px] font-semibold"
                  style={{ color }}
                >
                  {group.name}
                </span>
                <span className="rounded-full border border-brand-border px-1.5 py-0.5 text-[10px] font-mono text-gray-500">
                  {group.items.length}
                </span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 pr-1.5">
                {group.items.map(item => {
                  const type = TYPES[item.type] || TYPES.note;
                  const selected = selectedIds.has(item.id);
                  const isUnreviewed = item.reviewedAt === null;
                  const workflowStatus = WORKFLOW_STATUS_META[item.workflowStatus || "active"];
                  const relationCount = relationCounts.get(item.id) || 0;
                  return (
                    <article
                      key={item.id}
                      onClick={() => onOpenCard(item.id)}
                      className={`cursor-pointer rounded-lg border bg-[#0F1217] p-2 transition hover:border-[#5B8DEF50] ${selected ? "border-[#5B8DEF80] shadow-[0_0_0_1px_#5B8DEF40]" : "border-brand-border"}`}
                    >
                      <div className="mb-1.5 flex items-start gap-2">
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); onToggleSelected(item.id); }}
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#5B8DEF60] text-[9px] text-[#5B8DEF]"
                          aria-pressed={selected}
                          aria-label={selected ? "Deselect card" : "Select card"}
                          title={selected ? "Deselect" : "Select"}
                        >
                          {selected ? "✓" : ""}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-[12px] font-semibold text-gray-100" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            {item.title || item.ogTitle || "Untitled"}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span
                              className="rounded px-1 py-0.5 text-[9px] font-mono"
                              style={{ color: type.color, background: `${type.color}14`, border: `1px solid ${type.color}30` }}
                            >
                              {type.icon} {type.label}
                            </span>
                            <span
                              className="rounded border px-1 py-0.5 text-[9px] font-mono"
                              style={{ color: workflowStatus.color, background: `${workflowStatus.color}14`, borderColor: `${workflowStatus.color}30` }}
                            >
                              {workflowStatus.label}
                            </span>
                            <span className="ml-auto text-[9px] font-mono text-gray-700">{timeAgo(item.createdAt)}</span>
                          </div>
                          {relationCount > 0 && (
                            <div className="mt-1">
                              <span className="rounded border border-[#6FCF9730] bg-[#6FCF9712] px-1.5 py-0.5 text-[9px] font-mono text-[#6FCF97]">
                                Related {relationCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {item.content && <p className="line-clamp-2 text-[11px] text-gray-600">{item.content}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {(item.tags || []).slice(0, 3).map((tag, index) => (
                          <span
                            key={tag}
                            className="rounded px-1 py-0.5 text-[9px] font-mono"
                            style={{ color: TAG_COLORS[index % TAG_COLORS.length], background: `${TAG_COLORS[index % TAG_COLORS.length]}12` }}
                          >
                            #{tag}
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); onToggleFlag(item.id, "favourite"); }}
                          className="ml-auto rounded px-1 py-0.5 text-[12px] transition hover:bg-white/5"
                          style={{ color: item.favourite ? "#F2C94C" : "#3A3D44" }}
                          aria-label={item.favourite ? "Unfavourite" : "Mark as favourite"}
                          title={item.favourite ? "Unfavourite" : "Mark as favourite"}
                        >
                          {item.favourite ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); onToggleFlag(item.id, "actionRequired"); }}
                          className="rounded px-1 py-0.5 text-[12px] transition hover:bg-white/5"
                          style={{ color: item.actionRequired ? "#EB5757" : "#3A3D44" }}
                          aria-label={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                          title={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                        >
                          ⚡
                        </button>
                        {isUnreviewed && (
                          <button
                            type="button"
                            onClick={event => { event.stopPropagation(); onMarkReviewed(item.id); }}
                            className="rounded border border-[#5B8DEF40] bg-[#5B8DEF12] px-1.5 py-0.5 text-[9px] font-mono text-[#5B8DEF]"
                            title="Mark reviewed"
                          >
                            Inbox
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
