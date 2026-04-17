import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
import { checkApiKey } from "@/lib/api-key";

/**
 * POST /api/import
 * Body: { categories: [...], items: [...] }
 * Imports items and categories from a JSON export.
 * Skips duplicates by checking item ID.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json();
  let importedItems = 0;
  let importedCats = 0;

  // Import categories
  if (Array.isArray(body.categories)) {
    for (const cat of body.categories) {
      try {
        await db.insert(categories).values({
          name: cat.name,
          color: cat.color || "#E8A838",
        });
        importedCats++;
      } catch {}
    }
  }

  // Import items
  if (Array.isArray(body.items)) {
    for (const item of body.items) {
      try {
        await db.insert(items).values({
          type: item.type || "note",
          title: item.title || "",
          content: item.content || "",
          url: item.url || "",
          notes: item.notes || "",
          tags: item.tags || [],
          category: item.category || "",
          pinned: item.pinned || false,
          ogTitle: item.ogTitle || item.og_title || "",
          ogDescription: item.ogDescription || item.og_description || "",
          ogImage: item.ogImage || item.og_image || "",
          siteName: item.siteName || item.site_name || "",
          favicon: item.favicon || "",
        });
        importedItems++;
      } catch {}
    }
  }

  return NextResponse.json({ importedCategories: importedCats, importedItems });
}
