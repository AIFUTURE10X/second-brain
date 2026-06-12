import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/db";
import { requireAuth } from "@/lib/auth";

// POST /api/admin/fix-yt-thumbs
// One-shot backfill: rewrites legacy maxresdefault.jpg URLs (which YouTube
// often serves as a 120x90 grey placeholder) to hqdefault.jpg, which is
// guaranteed to exist for every video.
export async function POST(req: NextRequest) {
  const denied = await requireAuth(req);
  if (denied) return denied;

  const result = await sql`
    UPDATE items
    SET og_image = REPLACE(og_image, '/maxresdefault.jpg', '/hqdefault.jpg'),
        updated_at = NOW()
    WHERE og_image LIKE 'https://img.youtube.com/vi/%/maxresdefault.jpg'
    RETURNING id, og_image
  `;

  return NextResponse.json({ ok: true, updated: result.length, items: result });
}
