import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/api-key";
import { jsonError, serverError } from "@/lib/api-errors";
import { isAssetCategory } from "@/lib/aios-asset.mjs";
import { setCardAsset } from "@/lib/aios-asset-store";

/**
 * POST /api/items/asset { id, category } — the web 🗂 picker. Files one card under an
 * AI OS asset category (category: "website", "skill", …) or takes it back (null), and
 * returns the updated card. Only the asset tag changes (lib/aios-asset.mjs).
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id.trim().toLowerCase() : "";
    if (!/^[0-9a-f-]{36}$/.test(id)) return jsonError(400, "Missing or invalid id");
    // category must be sent: a key files the card, an explicit null takes it back.
    const category = body?.category;
    if (category !== null && !isAssetCategory(category)) return jsonError(400, "category must be a known key or null");

    const row = await setCardAsset(id, category);
    if (!row) return jsonError(404, "Not found");
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}
