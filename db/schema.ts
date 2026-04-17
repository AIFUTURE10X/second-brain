import { pgTable, text, boolean, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#E8A838"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().default("note"), // note | link | clip | thought
  title: text("title").notNull().default(""),
  content: text("content").default(""),
  url: text("url").default(""),
  notes: text("notes").default(""), // personal annotations (separate from content)
  tags: jsonb("tags").$type<string[]>().default([]),
  category: text("category").default(""),
  pinned: boolean("pinned").default(false),
  // OpenGraph / link preview data (auto-filled on save)
  ogTitle: text("og_title").default(""),
  ogDescription: text("og_description").default(""),
  ogImage: text("og_image").default(""),
  siteName: text("site_name").default(""),
  favicon: text("favicon").default(""),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});
