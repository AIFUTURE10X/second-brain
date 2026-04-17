import { NextRequest, NextResponse } from "next/server";

/**
 * Checks the request for a valid API key.
 * Returns null if authorized, or a 401 response if not.
 *
 * Authorized if ANY of:
 *   - API_SECRET is not set (dev mode / no protection)
 *   - Request has a valid `x-api-key` header
 *   - Request has a valid `?key=` query param
 *   - Request comes from the same origin (browser UI — has Referer or Sec-Fetch-Site: same-origin)
 */
export function checkApiKey(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;
  if (!secret) return null; // no secret configured — allow all

  // Allow same-origin requests (the browser UI calling its own API)
  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") return null;

  // Check API key from header or query param
  const fromHeader = req.headers.get("x-api-key");
  const fromQuery = new URL(req.url).searchParams.get("key");

  if (fromHeader === secret || fromQuery === secret) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
