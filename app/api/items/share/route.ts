import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkApiKey } from "@/lib/api-key";
import { jsonError, serverError } from "@/lib/api-errors";
import { sharingEnabled, shareUrlForCard } from "@/lib/share-links";

/**
 * GET /api/items/share?id=…  (roadmap 3.3)
 * Mints a signed read-only link for one card: { url }.
 * Requires normal API auth; the minted link itself does not.
 */
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id")?.trim();
    if (!id) return jsonError(400, "Missing id");
    if (!sharingEnabled()) {
      return jsonError(500, "Set SHARE_SECRET (or API_SECRET) to enable share links");
    }

    const [row] = await db.select({ id: items.id }).from(items).where(eq(items.id, id));
    if (!row) return jsonError(404, "Not found");

    const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
    return NextResponse.json({ url: shareUrlForCard(base, id) });
  } catch (error) {
    return serverError(error);
  }
}
