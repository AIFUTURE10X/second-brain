import type { Item } from "@/lib/brain-model";
import { isAiSummaryEntry, stripLegacyAiSummary } from "@/lib/item-summary";
import { LinkifiedText } from "../LinkifiedText";

export function CardNotes({ item, expanded, color }: { item: Item; expanded: boolean; color: string }) {
  const entries = (item.noteEntries || []).filter(entry => entry.body?.trim() && !isAiSummaryEntry(entry.body));
  const legacyNotes = stripLegacyAiSummary(item.notes || "");
  if (!entries.length && !legacyNotes) return null;
  const visible = expanded ? entries : entries.slice(0, 2);
  return (
    <div className="mt-2 pl-2.5 border-l-2 flex flex-col gap-1" style={{ borderColor: color + "40" }}>
      {visible.map(entry => (
        <LinkifiedText key={entry.id} text={entry.body}
          className={`text-[11px] text-gray-400 italic leading-relaxed ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`} />
      ))}
      {!expanded && entries.length > 2 && <span className="text-[10px] font-mono text-gray-600">+{entries.length - 2} more entries</span>}
      {!entries.length && legacyNotes && <LinkifiedText text={legacyNotes} className={`text-[11px] text-gray-400 italic leading-relaxed ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`} />}
    </div>
  );
}
