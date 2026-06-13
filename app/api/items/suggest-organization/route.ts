import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { checkApiKey } from "@/lib/api-key";
import { serverError } from "@/lib/api-errors";
import { aiTagAndCategorize } from "@/lib/ai-tagger";

export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const existingCategories = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name));
    const ai = await aiTagAndCategorize({
      title: item.title || "",
      content: item.content || "",
      url: item.url || "",
      ogTitle: item.ogTitle || "",
      ogDescription: item.ogDescription || "",
      siteName: item.siteName || "",
      existingCategories: existingCategories.map(category => category.name),
    });

    return NextResponse.json({ tags: ai.tags, category: ai.category });
  } catch (error) {
    return serverError(error);
  }
}
