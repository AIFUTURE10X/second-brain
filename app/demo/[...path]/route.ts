import { NextRequest, NextResponse } from "next/server";
import { DEMO_SANDBOX_CSP, blobStoreHost, demoBlobUrl } from "@/lib/demo-links.mjs";

export const runtime = "nodejs";

const MAX_DEMO_BYTES = 20 * 1024 * 1024;

// Shows a demo page attached to a card (see lib/demo-links.mjs). Public like the blob URL
// itself, so a demo opens on a phone or for a prospect without the API key; it serves only
// .html files from this app's own blob store, sandboxed away from the app's origin.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const host = process.env.BLOB_PUBLIC_HOST || blobStoreHost(process.env.BLOB_READ_WRITE_TOKEN);
  const url = demoBlobUrl(path, host);
  if (!url) return NextResponse.json({ error: "Not a demo page" }, { status: 404 });

  const upstream = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!upstream?.ok) return NextResponse.json({ error: "Demo not found" }, { status: upstream?.status === 404 ? 404 : 502 });
  const size = Number(upstream.headers.get("content-length") || 0);
  if (size > MAX_DEMO_BYTES) return NextResponse.json({ error: "Demo too large" }, { status: 413 });
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_DEMO_BYTES) return NextResponse.json({ error: "Demo too large" }, { status: 413 });

  return new NextResponse(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": DEMO_SANDBOX_CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=300",
    },
  });
}
