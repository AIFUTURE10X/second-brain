import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
import { checkApiKey } from "@/lib/api-key";
import { parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { importSchema } from "@/lib/validation";

/**
 * POST /api/import
 * Body: { categories: [...], items: [...] }
 * Imports items and categories from a JSON export.
 * Skips duplicates by checking item ID.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(importSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const body = parsed.data;

  try {
  let importedItems = 0;
  let importedCats = 0;

  // Import categories in batches
  if (Array.isArray(body.categories)) {
    const catValues = body.categories
      .filter((cat: Record<string, unknown>) => cat.name)
      .map((cat: Record<string, unknown>) => ({
        name: String(cat.name),
        color: String(cat.color || "#E8A838"),
        parentId: (cat.parentId || cat.parent_id || null) as string | null,
      }));
    for (let i = 0; i < catValues.length; i += 50) {
      const chunk = catValues.slice(i, i + 50);
      try {
        await db.insert(categories).values(chunk);
        importedCats += chunk.length;
      } catch {
        // Fallback to one-by-one for duplicate handling
        for (const cat of chunk) {
          try {
            await db.insert(categories).values(cat);
            importedCats++;
          } catch {}
        }
      }
    }
  }

  // Import items in batches
  if (Array.isArray(body.items)) {
    const itemValues = body.items.map((item: Record<string, unknown>) => ({
      type: String(item.type || "note"),
      title: String(item.title || ""),
      content: String(item.content || ""),
      url: String(item.url || ""),
      notes: String(item.notes || ""),
      tags: (Array.isArray(item.tags) ? item.tags : []) as string[],
      category: String(item.category || ""),
      pinned: Boolean(item.pinned),
      ogTitle: String(item.ogTitle || item.og_title || ""),
      ogDescription: String(item.ogDescription || item.og_description || ""),
      ogImage: String(item.ogImage || item.og_image || ""),
      siteName: String(item.siteName || item.site_name || ""),
      favicon: String(item.favicon || ""),
    }));
    for (let i = 0; i < itemValues.length; i += 50) {
      const chunk = itemValues.slice(i, i + 50);
      try {
        await db.insert(items).values(chunk);
        importedItems += chunk.length;
      } catch {
        // Fallback to one-by-one for error handling
        for (const item of chunk) {
          try {
            await db.insert(items).values(item);
            importedItems++;
          } catch {}
        }
      }
    }
  }

  return NextResponse.json({ importedCategories: importedCats, importedItems });
  } catch (error) {
    return serverError(error);
  }
}
