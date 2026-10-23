import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/api-key";
import { jsonError, serverError } from "@/lib/api-errors";
import { setCardIdea } from "@/lib/business-idea-store";

/**
 * POST /api/items/idea { id, send } — the web 💼 toggle. Adds (send: true) or removes
 * the business-idea tag on one card and returns the updated card. Only the tag changes,
 * so unsaved edits elsewhere and the card's reminder are left alone.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id.trim().toLowerCase() : "";
    if (!/^[0-9a-f-]{36}$/.test(id)) return jsonError(400, "Missing or invalid id");
    if (typeof body?.send !== "boolean") return jsonError(400, "send must be true or false");

    const row = await setCardIdea(id, body.send);
    if (!row) return jsonError(404, "Not found");
    return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}
