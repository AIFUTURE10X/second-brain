import { sql } from "drizzle-orm";
import { pgTable, text, boolean, integer, uuid, timestamp, jsonb, uniqueIndex, index, customType, vector } from "drizzle-orm/pg-core";
import type { ChecklistItem } from "@/lib/task-checklists";

// Postgres tsvector — drizzle-orm has no built-in column type for it.
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export type Attachment = {
  url: string;
  name: string;
  contentType: string;
  size: number;
};

export type NoteEntry = {
  id: string;
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

// Synced user preferences keyed by string. Single-user app so no user_id.
// value is a JSON blob — keep it small. Examples: "custom_cat_colors": ["#ff0", "#0ff"]
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#E8A838"),
  parentId: uuid("parent_id"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("categories_name_idx").on(table.name),
]);

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().default("note"), // note | link | clip | thought
  title: text("title").notNull().default(""),
  content: text("content").default(""),
  url: text("url").default(""),
  notes: text("notes").default(""), // legacy single-blob annotations — kept for back-compat; new edits use noteEntries
  noteEntries: jsonb("note_entries").$type<NoteEntry[]>().default([]),
  checklistItems: jsonb("checklist_items").$type<ChecklistItem[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  category: text("category").default(""),
  pinned: boolean("pinned").default(false),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at", { mode: "date" }),
  favourite: boolean("favourite").default(false),
  actionRequired: boolean("action_required").default(false),
  // Archive (roadmap 2.4): archived cards are hidden from the default grid
  // and search; null = active. Set/cleared via PUT { archivedAt }.
  archivedAt: timestamp("archived_at", { mode: "date" }),
  // Read-later (roadmap 2.9): unread | reading | done on link cards;
  // null = not tracked (non-link types, pre-feature links).
  readingStatus: text("reading_status"),
  // Recurring tasks (roadmap 2.11): daily | weekly | monthly. Completing a
  // recurring task spawns the next open occurrence.
  recurrence: text("recurrence"),
  attachments: jsonb("attachments").$type<Attachment[]>().default([]),
  // OpenGraph / link preview data (auto-filled on save)
  ogTitle: text("og_title").default(""),
  ogDescription: text("og_description").default(""),
  ogImage: text("og_image").default(""),
  siteName: text("site_name").default(""),
  favicon: text("favicon").default(""),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  // Semantic-search embedding (OpenAI text-embedding-3-small — keep in sync
  // with EMBEDDING_DIMENSIONS in lib/embeddings.mjs). Written best-effort
  // after saves by lib/embedding-store.ts; nullable so the app works without
  // OPENAI_API_KEY. Requires the pgvector extension (scripts/db-setup.sql).
  embedding: vector("embedding", { dimensions: 1536 }),
  // Weighted search document, maintained by Postgres itself. Weights:
  // A=title, B=tags+category ('simple' config so tags aren't stemmed),
  // C=body text incl. note entries + checklist rows, D=link/OG metadata.
  // jsonb columns are cast to text — set-returning extractors aren't allowed
  // in generated columns, and the extra JSON-key tokens are harmless noise.
  searchTsv: tsvector("search_tsv").generatedAlwaysAs(
    sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(tags::text, '') || ' ' || coalesce(category, '')), 'B') || setweight(to_tsvector('english', coalesce(content, '') || ' ' || coalesce(notes, '') || ' ' || coalesce(note_entries::text, '') || ' ' || coalesce(checklist_items::text, '')), 'C') || setweight(to_tsvector('english', coalesce(og_title, '') || ' ' || coalesce(og_description, '') || ' ' || coalesce(site_name, '') || ' ' || coalesce(url, '')), 'D')`
  ),
}, (table) => [
  index("items_category_idx").on(table.category),
  index("items_pinned_created_idx").on(table.pinned, table.createdAt),
  // Polling sync (?since=) scans by last modification time.
  index("items_updated_idx").on(table.updatedAt),
  index("items_search_tsv_idx").using("gin", table.searchTsv),
  // Trigram index for the zero-result fuzzy fallback. Requires the pg_trgm
  // extension (scripts/db-setup.sql); declared here so db:push won't drop it.
  index("items_title_trgm_idx").using("gin", table.title.op("gin_trgm_ops")),
  // Approximate-nearest-neighbour index for semantic search (cosine distance).
  // Requires the pgvector extension (scripts/db-setup.sql).
  index("items_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
]);

// Tombstones for polling sync: clients catching up via /api/items?since=
// need to learn about hard deletes, which `updated_at > since` can't surface.
// Only the id and deletion time are retained — no card content.
export const deletedItems = pgTable("deleted_items", {
  id: uuid("id").primaryKey(),
  deletedAt: timestamp("deleted_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("deleted_items_deleted_idx").on(table.deletedAt),
]);

export const itemRelations = pgTable("item_relations", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemAId: uuid("item_a_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  itemBId: uuid("item_b_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("item_relations_pair_idx").on(table.itemAId, table.itemBId),
  index("item_relations_item_a_idx").on(table.itemAId),
  index("item_relations_item_b_idx").on(table.itemBId),
]);

export const vaultConfigs = pgTable("vault_configs", {
  id: text("id").primaryKey().default("default"),
  version: integer("version").notNull().default(1),
  kdf: text("kdf").notNull().default("PBKDF2-SHA256"),
  kdfSalt: text("kdf_salt").notNull(),
  kdfIterations: integer("kdf_iterations").notNull(),
  masterKeyNonce: text("master_key_nonce").notNull(),
  masterKeyCiphertext: text("master_key_ciphertext").notNull(),
  recoveryKeySalt: text("recovery_key_salt").notNull(),
  recoveryKeyNonce: text("recovery_key_nonce").notNull(),
  recoveryKeyCiphertext: text("recovery_key_ciphertext").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const vaultItems = pgTable("vault_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: integer("version").notNull().default(1),
  nonce: text("nonce").notNull(),
  ciphertext: text("ciphertext").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("vault_items_created_idx").on(table.createdAt),
]);

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  message: text("message").notNull().default(""),
  dueAt: timestamp("due_at", { mode: "date" }).notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | done
  sentAt: timestamp("sent_at", { mode: "date" }),
  // Snooze (roadmap 2.8): cron skips pending reminders until this passes.
  snoozedUntil: timestamp("snoozed_until", { mode: "date" }),
  // Recurring reminders (roadmap 2.8): daily | weekly | monthly — cron
  // advances due_at instead of marking sent.
  recurrence: text("recurrence"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("reminders_item_idx").on(table.itemId),
  index("reminders_status_due_idx").on(table.status, table.dueAt),
]);
