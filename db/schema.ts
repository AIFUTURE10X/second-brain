import { pgTable, text, boolean, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().default("note"), // note | link | clip | thought
  title: text("title").notNull().default(""),
  content: text("content").default(""),
  url: text("url").default(""),
  tags: jsonb("tags").$type<string[]>().default([]),
  pinned: boolean("pinned").default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});
