import { pgTable, text, boolean, integer, uuid, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

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
  tags: jsonb("tags").$type<string[]>().default([]),
  category: text("category").default(""),
  pinned: boolean("pinned").default(false),
  favourite: boolean("favourite").default(false),
  actionRequired: boolean("action_required").default(false),
  attachments: jsonb("attachments").$type<Attachment[]>().default([]),
  // OpenGraph / link preview data (auto-filled on save)
  ogTitle: text("og_title").default(""),
  ogDescription: text("og_description").default(""),
  ogImage: text("og_image").default(""),
  siteName: text("site_name").default(""),
  favicon: text("favicon").default(""),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("items_category_idx").on(table.category),
  index("items_pinned_created_idx").on(table.pinned, table.createdAt),
]);
