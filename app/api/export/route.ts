import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
import { desc, asc } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

/**
 * GET /api/export?format=json|csv|markdown
 * Exports all items (and categories) for backup/migration.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const format = new URL(req.url).searchParams.get("format") || "json";

  const allItems = await db.select().from(items).orderBy(desc(items.createdAt));
  const allCats = await db.select().from(categories).orderBy(asc(categories.name));

  if (format === "csv") {
    const header = "id,type,title,url,content,notes,tags,category,pinned,createdAt";
    const rows = allItems.map(i =>
      [i.id, i.type, `"${(i.title || "").replace(/"/g, '""')}"`, i.url, `"${(i.content || "").replace(/"/g, '""')}"`, `"${(i.notes || "").replace(/"/g, '""')}"`, `"${(i.tags || []).join(",")}"`, i.category, i.pinned, i.createdAt?.toISOString()].join(",")
    );
    const csv = [header, ...rows].join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=second-brain-export.csv" },
    });
  }

  if (format === "markdown") {
    const lines = allItems.map(i => {
      const parts = [`## ${i.title || "Untitled"}`, ""];
      if (i.url) parts.push(`**URL:** ${i.url}`);
      if (i.category) parts.push(`**Category:** ${i.category}`);
      if (i.tags?.length) parts.push(`**Tags:** ${i.tags.join(", ")}`);
      if (i.content) parts.push("", i.content);
      if (i.notes) parts.push("", `> ${i.notes.replace(/\n/g, "\n> ")}`);
      parts.push("", `*Type: ${i.type} | ${i.createdAt?.toISOString()}*`, "", "---", "");
      return parts.join("\n");
    });
    const md = `# Second Brain Export\n\n${lines.join("\n")}`;
    return new NextResponse(md, {
      headers: { "Content-Type": "text/markdown", "Content-Disposition": "attachment; filename=second-brain-export.md" },
    });
  }

  // Default: JSON
  return NextResponse.json(
    { exportedAt: new Date().toISOString(), categories: allCats, items: allItems },
    { headers: { "Content-Disposition": "attachment; filename=second-brain-export.json" } }
  );
}
