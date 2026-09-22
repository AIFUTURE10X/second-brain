import type { NoteEntry } from "./brain-model";

// Keep summaries in the existing editable notes format: no migration required.
export const AI_SUMMARY_HEADER = "--- AI Summary ---";
const OVERVIEW_HEADER = "At a glance:";
const DETAILS_HEADER = "Details:";

export interface ItemSummary {
  shortSummary: string;
  detailedSummary: string;
}

export function isAiSummaryEntry(body: string | null | undefined): boolean {
  return (body || "").trim().startsWith(AI_SUMMARY_HEADER);
}

export function hasAiSummary(entries: NoteEntry[] | null | undefined): boolean {
  return (entries || []).some(entry => isAiSummaryEntry(entry.body));
}

export function stripLegacyAiSummary(notes: string): string {
  const index = notes.indexOf(AI_SUMMARY_HEADER);
  return (index === -1 ? notes : notes.slice(0, index)).trim();
}

export function getItemSummary(item: { noteEntries?: NoteEntry[] | null; notes?: string | null }): ItemSummary | null {
  const entry = item.noteEntries?.find(entry => isAiSummaryEntry(entry.body));
  const legacyIndex = (item.notes || "").indexOf(AI_SUMMARY_HEADER);
  const body = entry?.body || (legacyIndex >= 0 ? item.notes!.slice(legacyIndex) : "");
  const text = body.trim().slice(AI_SUMMARY_HEADER.length).trim();
  if (!text) return null;

  const detailsIndex = text.indexOf(`\n${DETAILS_HEADER}`);
  if (text.startsWith(OVERVIEW_HEADER) && detailsIndex >= 0) {
    return {
      shortSummary: text.slice(OVERVIEW_HEADER.length, detailsIndex).trim(),
      detailedSummary: text.slice(detailsIndex + DETAILS_HEADER.length + 1).trim(),
    };
  }

  // Older summaries contain only bullets. Surface the first point on the card,
  // and keep the entire original summary inside until the user regenerates it.
  const firstPoint = text.split(/\n/).find(line => line.trim()) || text;
  return {
    shortSummary: firstPoint.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim(),
    detailedSummary: text,
  };
}

export function upsertAiSummaryEntry(entries: NoteEntry[], summary: ItemSummary): NoteEntry[] {
  const now = new Date().toISOString();
  const existing = entries.find(entry => isAiSummaryEntry(entry.body));
  const body = `${AI_SUMMARY_HEADER}\n${OVERVIEW_HEADER}\n${summary.shortSummary.trim()}\n\n${DETAILS_HEADER}\n${summary.detailedSummary.trim()}`;
  const updated = {
    id: existing?.id || crypto.randomUUID(),
    body,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  return [...entries.filter(entry => !isAiSummaryEntry(entry.body)), updated];
}
