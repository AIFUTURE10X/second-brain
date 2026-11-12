import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/api-key";
import { jsonError, serverError } from "@/lib/api-errors";
import { assetKeys, isAssetCategory } from "@/lib/aios-asset.mjs";
import { setCardAsset } from "@/lib/aios-asset-store";

/**
 * POST /api/items/asset { id, categories } — the web 🗂 picker. Files one card under
 * every listed AI OS asset category (["website", "animation"], …) or takes it back ([]),
 * and returns the updated card. Only the asset tags change (lib/aios-asset.mjs).
 * The older { id, category } shape (a key, or null to take back) still works.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id.trim().toLowerCase() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return jsonError(400, "Missing or invalid id");
    // categories (or the older category) must be sent: keys file the card, [] or an
    // explicit null takes it back. A missing field is a 400, never a silent take-back.
    let categories: string[];
    if (Array.isArray(body?.categories)) {
      if (body.categories.length > 9 || !body.categories.every(isAssetCategory)) return jsonError(400, "categories must be known keys");
      categories = assetKeys(body.categories);
    } else if (body?.category === null || isAssetCategory(body?.category)) {
      categories = assetKeys(body.category);
    } else {
      return jsonError(400, "categories must be a list of known keys");
    }

    const row = await setCardAsset(id, categories);
    if (!row) return jsonError(404, "Not found");
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}
