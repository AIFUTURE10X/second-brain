import type { ChecklistItem } from "./task-checklists";

export type ItemType = "note" | "link" | "clip" | "thought" | "task" | "memory";

export interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

export interface NoteEntry {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  url: string;
  notes: string;
  noteEntries?: NoteEntry[];
  checklistItems?: ChecklistItem[];
  tags: string[];
  category: string;
  pinned: boolean;
  completed?: boolean;
  completedAt?: string | null;
  favourite?: boolean;
  actionRequired?: boolean;
  archivedAt?: string | null;
  attachments?: Attachment[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  siteName: string;
  favicon: string;
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  itemId: string;
  message: string;
  dueAt: string;
  status: "pending" | "sent" | "done";
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelatedItemSummary {
  id: string;
  type: ItemType;
  title: string;
  url: string;
  category: string;
  tags: string[];
  ogTitle: string;
  siteName: string;
  favicon: string;
}

export interface ItemRelation {
  id?: string;
  itemAId: string;
  itemBId: string;
  itemA: RelatedItemSummary;
  itemB: RelatedItemSummary;
  createdAt?: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  position?: number;
}

export const TYPES: Record<ItemType, { icon: string; label: string; color: string }> = {
  note: { icon: "✎", label: "Note", color: "#E8A838" },
  link: { icon: "◈", label: "Link", color: "#5B8DEF" },
  clip: { icon: "✂", label: "Clip", color: "#6FCF97" },
  thought: { icon: "◉", label: "Thought", color: "#BB6BD9" },
  task: { icon: "☐", label: "Task", color: "#56CCF2" },
  memory: { icon: "💡", label: "Memory", color: "#F2C94C" },
};

export const TAG_COLORS = ["#E8A838", "#5B8DEF", "#6FCF97", "#BB6BD9", "#EB5757", "#56CCF2", "#F2994A", "#9B51E0"];
export const CAT_COLORS = ["#E8A838", "#5B8DEF", "#6FCF97", "#BB6BD9", "#EB5757", "#56CCF2", "#F2994A", "#9B51E0", "#27AE60", "#F2C94C"];

export const REMINDER_TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

export const newEntryId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `e_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function hasMeaningfulFormContent(form: {
  title: string;
  content: string;
  url: string;
  noteEntries: NoteEntry[];
  checklistItems: ChecklistItem[];
  tags: string;
  category: string;
  attachments: Attachment[];
  reminderDueAt: string;
  reminderMessage: string;
  relatedItemIds: string[];
}): boolean {
  return Boolean(
    form.title.trim() ||
    form.content.trim() ||
    form.url.trim() ||
    form.tags.trim() ||
    form.category.trim() ||
    form.reminderDueAt.trim() ||
    form.reminderMessage.trim() ||
    form.noteEntries.some(entry => entry.body.trim()) ||
    form.checklistItems.some(item => item.text.trim()) ||
    form.attachments.length > 0 ||
    form.relatedItemIds.length > 0
  );
}
