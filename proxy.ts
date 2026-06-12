import { NextRequest, NextResponse } from "next/server";
import { verifyApiToken, verifySessionCookie } from "@/lib/auth";

/**
 * Global auth gate. Everything requires a session cookie or API token except:
 *  - /login and /api/auth/login (the way in)
 *  - /api/app-version (public version probe used by the desktop updater)
 *  - /api/telegram (authenticated by Telegram's x-telegram-bot-api-secret-token)
 *  - /api/cron/* (authenticated by the CRON_SECRET bearer Vercel sends)
 *  - /api/upload calls carrying x-vercel-signature (Vercel Blob's
 *    onUploadCompleted callback — handleUpload verifies the signature itself)
 */

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/app-version"]);

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (pathname === "/api/telegram" || pathname.startsWith("/api/cron/")) return NextResponse.next();
  if (pathname === "/api/upload" && req.headers.get("x-vercel-signature")) return NextResponse.next();

  if (await verifySessionCookie(req)) return NextResponse.next();
  if (await verifyApiToken(req)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.url);
  const next = pathname + search;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json|sw.js).*)"],
};
