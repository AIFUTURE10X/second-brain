import { z } from "zod";

// Pure schema module — no next/server import so node:test can load it
// directly. Request-level helpers (jsonError, parseBody) live in
// lib/api-errors.ts.

export const itemTypeSchema = z.enum(["note", "link", "clip", "thought", "task", "memory"]);

const noteEntrySchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const checklistItemSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  completed: z.boolean().optional(),
  completedAt: z.string().nullable().optional(),
});

const attachmentSchema = z.object({
  url: z.string(),
  name: z.string(),
  contentType: z.string(),
  size: z.number(),
});

const itemFields = {
  type: itemTypeSchema.optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  url: z.string().optional(),
  notes: z.string().optional(),
  noteEntries: z.array(noteEntrySchema).optional(),
  checklistItems: z.array(checklistItemSchema).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  pinned: z.boolean().optional(),
  completed: z.boolean().optional(),
  completedAt: z.string().nullable().optional(),
  favourite: z.boolean().optional(),
  actionRequired: z.boolean().optional(),
  // ISO timestamp to archive, null to unarchive (roadmap 2.4).
  archivedAt: z.string().nullable().optional(),
  // Read-later tracking on link cards (roadmap 2.9).
  readingStatus: z.enum(["unread", "reading", "done"]).nullable().optional(),
  // Recurring tasks (roadmap 2.11).
  recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImage: z.string().optional(),
  siteName: z.string().optional(),
  favicon: z.string().optional(),
};

export const itemCreateSchema = z.object(itemFields).strict();

// .strict() is the actual mass-assignment fix: PUT used to spread arbitrary
// body keys straight into the UPDATE statement, so any items column
// (created_at, completed_at, …) could be overwritten by name.
export const itemUpdateSchema = z
  .object({
    id: z.string().min(1, "Missing id"),
    // Optimistic-concurrency token: the item's updatedAt as the client last
    // saw it. When present, the UPDATE is guarded and a mismatch returns 409
    // with the current server row. Absent (old clients) → last-write-wins.
    expectedUpdatedAt: z.string().optional(),
    ...itemFields,
  })
  .strict();

// /api/save is the automation endpoint (extension, Telegram, shortcuts) —
// deliberately permissive: unknown extra keys are ignored, tags accept a
// comma-separated string, and at least one content field must be present.
export const saveSchema = z
  .object({
    url: z.string().optional(),
    text: z.string().optional(),
    title: z.string().optional(),
    content: z.string().optional(),
    notes: z.string().optional(),
    category: z.string().optional(),
    type: itemTypeSchema.optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    // Extension highlight → annotate the existing card for this URL (3.1).
    annotate: z.boolean().optional(),
  })
  .passthrough()
  .refine(
    body => Boolean(body.url?.trim() || body.text?.trim() || body.title?.trim() || body.content?.trim()),
    "Provide at least url, text, title, or content"
  );

export const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name required"),
    color: z.string().optional(),
    parentId: z.string().nullable().optional(),
  })
  .strict();

export const categoryUpdateSchema = z
  .object({
    id: z.string().min(1, "Missing id"),
    name: z.string().trim().min(1).optional(),
    color: z.string().optional(),
    parentId: z.string().nullable().optional(),
  })
  .strict();

export const categoryReorderSchema = z
  .object({
    orders: z.array(z.object({ id: z.string().min(1), position: z.number().int() }).strict()).default([]),
  })
  .strict();

export const settingsPutSchema = z
  .object({
    key: z.string().min(1, "Missing key"),
    value: z.unknown().refine(value => value !== undefined, "Missing value"),
  })
  .strict();

export const settingsDeleteSchema = z
  .object({
    keys: z.array(z.string()).optional(),
  })
  .passthrough();

export const reminderUpdateSchema = z
  .object({
    id: z.string().min(1, "Missing id"),
    // Sent by the card form's create/update path; reminders can't move
    // between cards, so it's accepted and ignored.
    itemId: z.string().optional(),
    message: z.string().optional(),
    dueAt: z.union([z.string(), z.number()]).optional(),
    status: z.enum(["pending", "sent", "done"]).optional(),
    sentAt: z.string().nullable().optional(),
    // Snooze + recurrence (roadmap 2.8).
    snoozedUntil: z.string().nullable().optional(),
    recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
  })
  .strict();

export const tagsMergeSchema = z
  .object({
    from: z.array(z.string().min(1)).min(1, "from[] and to required"),
    to: z.string().trim().min(1, "from[] and to required"),
  })
  .strict();

export const importSchema = z
  .object({
    categories: z.array(z.record(z.string(), z.unknown())).optional(),
    items: z.array(z.record(z.string(), z.unknown())).optional(),
    exportedAt: z.string().optional(),
  })
  .passthrough();

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => `${issue.path.join(".") || "body"}: ${issue.message}`);
}
