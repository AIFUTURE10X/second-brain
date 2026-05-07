import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/db";
import { itemRelations } from "@/db/schema";
import { checkApiKey } from "@/lib/api-key";
import { canonicalRelationPair } from "@/lib/item-relations.mjs";
import { and, eq } from "drizzle-orm";

type RelatedItemSummary = {
  id: string;
  type: string;
  title: string;
  url: string;
  category: string;
  tags: string[];
  ogTitle: string;
  siteName: string;
  favicon: string;
};

type RelationRow = {
  id: string;
  itemAId: string;
  itemBId: string;
  createdAt: string;
  itemA: RelatedItemSummary;
  itemB: RelatedItemSummary;
};

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const itemId = new URL(req.url).searchParams.get("itemId");

  const rows = (itemId
    ? await sql`
      SELECT
        r.id::text AS id,
        r.item_a_id::text AS "itemAId",
        r.item_b_id::text AS "itemBId",
        r.created_at AS "createdAt",
        jsonb_build_object(
          'id', a.id::text,
          'type', a.type,
          'title', a.title,
          'url', a.url,
          'category', a.category,
          'tags', coalesce(a.tags, '[]'::jsonb),
          'ogTitle', a.og_title,
          'siteName', a.site_name,
          'favicon', a.favicon
        ) AS "itemA",
        jsonb_build_object(
          'id', b.id::text,
          'type', b.type,
          'title', b.title,
          'url', b.url,
          'category', b.category,
          'tags', coalesce(b.tags, '[]'::jsonb),
          'ogTitle', b.og_title,
          'siteName', b.site_name,
          'favicon', b.favicon
        ) AS "itemB"
      FROM item_relations r
      JOIN items a ON a.id = r.item_a_id
      JOIN items b ON b.id = r.item_b_id
      WHERE r.item_a_id = ${itemId}::uuid OR r.item_b_id = ${itemId}::uuid
      ORDER BY r.created_at DESC
    `
    : await sql`
      SELECT
        r.id::text AS id,
        r.item_a_id::text AS "itemAId",
        r.item_b_id::text AS "itemBId",
        r.created_at AS "createdAt",
        jsonb_build_object(
          'id', a.id::text,
          'type', a.type,
          'title', a.title,
          'url', a.url,
          'category', a.category,
          'tags', coalesce(a.tags, '[]'::jsonb),
          'ogTitle', a.og_title,
          'siteName', a.site_name,
          'favicon', a.favicon
        ) AS "itemA",
        jsonb_build_object(
          'id', b.id::text,
          'type', b.type,
          'title', b.title,
          'url', b.url,
          'category', b.category,
          'tags', coalesce(b.tags, '[]'::jsonb),
          'ogTitle', b.og_title,
          'siteName', b.site_name,
          'favicon', b.favicon
        ) AS "itemB"
      FROM item_relations r
      JOIN items a ON a.id = r.item_a_id
      JOIN items b ON b.id = r.item_b_id
      ORDER BY r.created_at DESC
    `) as RelationRow[];

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  let pair: { itemAId: string; itemBId: string };
  try {
    pair = canonicalRelationPair(body.itemAId || body.sourceItemId, body.itemBId || body.targetItemId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const [row] = await db
    .insert(itemRelations)
    .values(pair)
    .onConflictDoNothing()
    .returning();

  return NextResponse.json(row || pair, { status: row ? 201 : 200 });
}

export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const body = req.headers.get("content-type")?.includes("application/json")
    ? await req.json().catch(() => null)
    : null;

  let pair: { itemAId: string; itemBId: string };
  try {
    pair = canonicalRelationPair(
      body?.itemAId || body?.sourceItemId || url.searchParams.get("itemAId") || url.searchParams.get("sourceItemId"),
      body?.itemBId || body?.targetItemId || url.searchParams.get("itemBId") || url.searchParams.get("targetItemId")
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  await db
    .delete(itemRelations)
    .where(and(eq(itemRelations.itemAId, pair.itemAId), eq(itemRelations.itemBId, pair.itemBId)));

  return NextResponse.json({ ok: true });
}
