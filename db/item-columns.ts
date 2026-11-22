import { items } from "./schema";

/**
 * Client-facing columns of `items`.
 *
 * Excludes internal Postgres-only columns (`embedding` — 1536 floats ≈ 20 KB
 * JSON per row — and `searchTsv`), which no client consumes and which bloated
 * every list, delta-sync, and mutation payload by an order of magnitude.
 */
export const ITEM_PUBLIC_COLUMNS = {
  id: items.id,
  type: items.type,
  title: items.title,
  content: items.content,
  url: items.url,
  notes: items.notes,
  noteEntries: items.noteEntries,
  checklistItems: items.checklistItems,
  websiteLinks: items.websiteLinks,
  tags: items.tags,
  category: items.category,
  pinned: items.pinned,
  completed: items.completed,
  completedAt: items.completedAt,
  reviewedAt: items.reviewedAt,
  workflowStatus: items.workflowStatus,
  favourite: items.favourite,
  actionRequired: items.actionRequired,
  archivedAt: items.archivedAt,
  readingStatus: items.readingStatus,
  recurrence: items.recurrence,
  attachments: items.attachments,
  ogTitle: items.ogTitle,
  ogDescription: items.ogDescription,
  ogImage: items.ogImage,
  siteName: items.siteName,
  favicon: items.favicon,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
} as const;
