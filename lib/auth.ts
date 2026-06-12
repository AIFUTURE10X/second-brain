import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, safeEqual, verifySessionToken } from "@/lib/session";

/**
 * Request authentication for pages and API routes.
 *
 * A request is authorized if EITHER:
 *   - it carries a valid `sb_session` cookie (the logged-in browser UI), or
 *   - it carries the API token (`Authorization: Bearer <API_SECRET>`, or the
 *     legacy `x-api-key` header during the transition) — used by the browser
 *     extension and other non-browser clients.
 *
 * Fails closed: if AUTH_SECRET / API_SECRET are unset, the corresponding
 * check denies instead of allowing.
 */

export async function verifySessionCookie(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(process.env.AUTH_SECRET, token);
}

export async function verifyApiToken(req: NextRequest): Promise<boolean> {
  const secret = process.env.API_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  // Legacy header kept while the extension migrates to Authorization: Bearer.
  const candidate = bearer ?? req.headers.get("x-api-key");
  return !!candidate && (await safeEqual(candidate, secret));
}

/** Returns null when authorized, or a 401 JSON response. */
export async function requireAuth(req: NextRequest): Promise<NextResponse | null> {
  if (await verifySessionCookie(req)) return null;
  if (await verifyApiToken(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
