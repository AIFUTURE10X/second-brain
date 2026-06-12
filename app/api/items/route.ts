import { NextRequest, NextResponse, after } from "next/server";
import { db, sql } from "@/db";
import { items, categories, deletedItems } from "@/db/schema";
import { eq, gt, desc, asc, and, isNull, isNotNull, sql as sqlExpr, type SQL } from "drizzle-orm";
import { enrichUrl } from "@/lib/enrich";
import { checkApiKey } from "@/lib/api-key";
import { aiTagAndCategorize } from "@/lib/ai-tagger";
import { shouldEnrichUrlOnUpdate } from "@/lib/item-updates.mjs";
import { buildItemSearchTsQuery } from "@/lib/item-search";
import { embeddingsEnabled, generateEmbedding, vectorLiteral, SEMANTIC_DISTANCE_CUTOFF, SEMANTIC_SEARCH_LIMIT } from "@/lib/embeddings.mjs";
import { mergeHybridResults } from "@/lib/hybrid-search.mjs";
import { SYNC_CURSOR_OVERLAP_MS } from "@/lib/polling-sync.mjs";
import { embeddingInputChanged, updateItemEmbedding } from "@/lib/embedding-store";
import { jsonError, parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { itemCreateSchema, itemUpdateSchema } from "@/lib/validation";
import { deriveTaskCompletion, normalizeChecklistItems } from "@/lib/task-checklists";
import { appendYouTubeDescriptionLinksToNotes, fetchYouTubeDescriptionLinks, type YouTubeDescriptionLink } from "@/lib/youtube";

// snake_case → camelCase column list shared by the raw-SQL search paths so
// their rows match the Drizzle-select shape the frontend expects.
const ITEM_COLUMNS_SQL = `
  id, type, title, content, url, notes, tags, category, pinned, attachments,
  favourite,
  completed,
  action_required AS "actionRequired",
  checklist_items AS "checklistItems",
  note_entries AS "noteEntries",
  favicon,
  og_title AS "ogTitle",
  og_description AS "ogDescription",
  og_image AS "ogImage",
  site_name AS "siteName",
  completed_at AS "completedAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

// Nearest-neighbour lookup over item embeddings (cosine distance, HNSW
// index). Rows past the distance cutoff are noise and excluded entirely.
async function semanticSearchRows(queryVector: number[], archivedFilterSql: string) {
  return await sql.query(
    `SELECT ${ITEM_COLUMNS_SQL}
     FROM items
     WHERE embedding IS NOT NULL
       AND (embedding <=> $1::vector) < $2
       ${archivedFilterSql}
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral(queryVector), SEMANTIC_DISTANCE_CUTOFF, SEMANTIC_SEARCH_LIMIT]
  );
}

function prepareTaskFields(
  type: unknown,
  incomingChecklistItems: unknown,
  fallbackChecklistItems: unknown,
  fallbackCompleted: unknown,
  fallbackCompletedAt: unknown,
) {
  if (type !== "task") {
    return {
      checklistItems: [],
      completed: false,
      completedAt: null,
    };
  }

  const checklistItems = normalizeChecklistItems(
    incomingChecklistItems === undefined ? fallbackChecklistItems : incomingChecklistItems
  );
  const derived = deriveTaskCompletion(
    checklistItems,
    fallbackCompleted === true,
    fallbackCompletedAt instanceof Date
      ? fallbackCompletedAt.toISOString()
      : typeof fallbackCompletedAt === "string"
        ? fallbackCompletedAt
        : null,
  );
  return {
    checklistItems,
    completed: derived.completed,
    completedAt: derived.completedAt ? new Date(derived.completedAt) : null,
  };
}

// GET all items — supports ?q= for full-text search
export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;
  try {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const q = url.searchParams.get("q")?.trim();
  const tag = url.searchParams.get("tag")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const type = url.searchParams.get("type")?.trim();
  const since = url.searchParams.get("since")?.trim();
  // Archive (roadmap 2.4): the default grid and search exclude archived
  // cards; ?archived=1 returns only the archive. ?since= deltas are exempt —
  // pollers must see archive/unarchive transitions to stay in sync.
  const archivedOnly = url.searchParams.get("archived") === "1";
  const archivedFilterSql = archivedOnly ? "AND archived_at IS NOT NULL" : "AND archived_at IS NULL";

  if (id) {
    const [row] = await db.select().from(items).where(eq(items.id, id));
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  }

  // Polling sync: delta of everything that changed after `since`. Returns a
  // different shape from the list/search paths — { items, deletedIds,
  // serverTime } — where serverTime is the cursor for the next poll
  // (captured before the queries run, minus an overlap, so writes that race
  // this request are re-delivered rather than skipped).
  if (since) {
    const sinceDate = new Date(since);
    if (Number.isNaN(sinceDate.getTime())) return jsonError(400, "Invalid since timestamp");
    const serverTime = new Date(Date.now() - SYNC_CURSOR_OVERLAP_MS).toISOString();
    const changed = await db
      .select()
      .from(items)
      .where(gt(items.updatedAt, sinceDate))
      .orderBy(asc(items.updatedAt));
    const tombstones = await db
      .select({ id: deletedItems.id })
      .from(deletedItems)
      .where(gt(deletedItems.deletedAt, sinceDate));
    return NextResponse.json({
      items: changed,
      deletedIds: tombstones.map(t => t.id),
      serverTime,
    });
  }

  // Structured filters (?tag= / ?category= / ?type=) — combinable with each
  // other and with ?q=. On the search paths the rows are already in hand, so
  // they're filtered in JS; the no-search path filters in SQL.
  const matchesStructuredFilters = (row: { tags?: unknown; category?: string | null; type?: string | null }) =>
    (!tag || (Array.isArray(row.tags) && row.tags.includes(tag))) &&
    (!category || row.category === category) &&
    (!type || row.type === type);

  if (q) {
    // Hybrid search: weighted FTS over search_tsv merged with pgvector
    // semantic ranking via reciprocal rank fusion (lib/hybrid-search.mjs).
    // ?semantic=0 forces FTS-only, ?semantic=1 returns pure semantic ranking;
    // the default auto-merges whenever OPENAI_API_KEY is configured. Every
    // semantic failure mode (no key, column/extension not migrated yet,
    // OpenAI error) degrades silently to the FTS-only behaviour.
    const semanticParam = url.searchParams.get("semantic");

    // Full-text search against the weighted, GIN-indexed search_tsv column
    // (see db/schema.ts — covers title, tags, category, body, note entries,
    // checklist rows, and link metadata).
    const tsquery = buildItemSearchTsQuery(q);
    // Loose row shape for the raw-SQL search paths — all optional so the
    // neon driver's Record<string, any> rows assign without casts.
    type SearchRow = { id?: string; pinned?: boolean | null; tags?: unknown; category?: string | null; type?: string | null } & Record<string, unknown>;
    let ftsRows: SearchRow[] = [];
    if (tsquery) {
      ftsRows = await sql.query(
        `SELECT ${ITEM_COLUMNS_SQL}
         FROM items, to_tsquery('english', $1) AS query
         WHERE search_tsv @@ query
           ${archivedFilterSql}
         ORDER BY pinned DESC,
                  ts_rank_cd(search_tsv, query) DESC,
                  created_at DESC`,
        [tsquery]
      );
    }

    let semanticRows: SearchRow[] = [];
    let semanticUsed = false;
    if (semanticParam !== "0" && embeddingsEnabled()) {
      try {
        const queryVector = await generateEmbedding(q);
        if (queryVector) {
          semanticRows = await semanticSearchRows(queryVector, archivedFilterSql);
          semanticUsed = true;
        }
      } catch (error) {
        console.error("Semantic search failed:", error);
      }
    }

    const ranked = semanticParam === "1" && semanticUsed
      ? semanticRows
      : mergeHybridResults(ftsRows, semanticRows);
    const matched = ranked.filter(matchesStructuredFilters);
    if (matched.length > 0) {
      // Flagged via header rather than a body shape change so existing
      // clients that expect a bare array keep working.
      return NextResponse.json(
        matched,
        semanticUsed ? { headers: { "x-search-semantic": "1" } } : undefined
      );
    }
    // Zero hits — trigram fallback over titles so typos still surface
    // cards ("recat" finds "react").
    try {
      const fuzzy = await sql.query(
        `SELECT ${ITEM_COLUMNS_SQL}
         FROM items
         WHERE word_similarity($1, title) > 0.3
           ${archivedFilterSql}
         ORDER BY pinned DESC,
                  word_similarity($1, title) DESC,
                  created_at DESC
         LIMIT 25`,
        [q]
      );
      return NextResponse.json(fuzzy.filter(matchesStructuredFilters), { headers: { "x-search-fuzzy": "1" } });
    } catch (error) {
      // pg_trgm not installed yet (scripts/db-setup.sql) — degrade to no results.
      console.error("Fuzzy search fallback failed:", error);
      return NextResponse.json([]);
    }
  }

  const conditions: SQL[] = [];
  if (tag) conditions.push(sqlExpr`${items.tags} @> ${JSON.stringify([tag])}::jsonb`);
  if (category) conditions.push(eq(items.category, category));
  if (type) conditions.push(eq(items.type, type));
  conditions.push(archivedOnly ? isNotNull(items.archivedAt) : isNull(items.archivedAt));

  const rows = await db
    .select()
    .from(items)
    .where(and(...conditions))
    .orderBy(desc(items.pinned), desc(items.createdAt));
  return NextResponse.json(rows);
  } catch (error) {
    return serverError(error);
  }
}

// POST create new item
export async function POST(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  const parsed = parseBody(itemCreateSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const body = parsed.data;

  try {
  const url = body.url?.trim() || "";

  // Auto-enrich if URL is provided and no og data was passed
  let og = { ogTitle: "", ogDescription: "", ogImage: "", siteName: "", favicon: "" };
  let descriptionLinks: YouTubeDescriptionLink[] = [];
  if (url) {
    if (!body.ogTitle) {
      og = await enrichUrl(url);
    }
    descriptionLinks = await fetchYouTubeDescriptionLinks(url);
  }

  let itemTags: string[] = body.tags || [];
  let itemCategory: string = body.category || "";

  // AI auto-tag + auto-categorize when no tags/category provided
  if (itemTags.length === 0 && !itemCategory && process.env.ANTHROPIC_API_KEY) {
    const existingCats = await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name));
    const ai = await aiTagAndCategorize({
      title: body.title || og.ogTitle || "",
      content: body.content || "",
      url,
      ogTitle: og.ogTitle,
      ogDescription: og.ogDescription,
      siteName: og.siteName,
      existingCategories: existingCats.map(c => c.name),
    });
    if (ai.tags.length > 0) itemTags = ai.tags;
    if (ai.category) {
      itemCategory = ai.category.trim();
    }
  }

  // Auto-create category if it doesn't exist (from AI or user input)
  if (itemCategory) {
    itemCategory = itemCategory.trim();
    const existingCats2 = await db.select({ name: categories.name }).from(categories);
    const match = existingCats2.find(c => c.name.toLowerCase() === itemCategory.toLowerCase());
    if (match) {
      itemCategory = match.name; // preserve existing casing
    } else {
      try {
        await db.insert(categories).values({ name: itemCategory });
      } catch {}
    }
  }

  const taskFields = prepareTaskFields(
    body.type || "note",
    body.checklistItems,
    [],
    body.completed,
    body.completedAt,
  );

  const [row] = await db
    .insert(items)
    .values({
      type: body.type || "note",
      title: body.title || og.ogTitle || "",
      content: body.content || "",
      url,
      notes: appendYouTubeDescriptionLinksToNotes(body.notes || "", descriptionLinks),
      tags: itemTags,
      category: itemCategory,
      pinned: body.pinned || false,
      checklistItems: taskFields.checklistItems,
      completed: taskFields.completed,
      completedAt: taskFields.completedAt,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      ogTitle: body.ogTitle || og.ogTitle || "",
      ogDescription: body.ogDescription || og.ogDescription || "",
      ogImage: body.ogImage || og.ogImage || "",
      siteName: body.siteName || og.siteName || "",
      favicon: body.favicon || og.favicon || "",
    })
    .returning();

  // Embed post-response so saves never block on (or fail because of) OpenAI.
  if (embeddingsEnabled()) after(() => updateItemEmbedding(row.id));

  return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}

// PUT update item
export async function PUT(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.res;
  // itemUpdateSchema is strict: unknown body keys are rejected instead of
  // being spread into the UPDATE (the old mass-assignment hole).
  const parsed = parseBody(itemUpdateSchema, raw.body);
  if (!parsed.success) return parsed.res;
  const { id, expectedUpdatedAt, ...updates } = parsed.data;

  try {
  const [current] = await db.select().from(items).where(eq(items.id, id));
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const nextType = updates.type || current.type;

  if (updates.url && shouldEnrichUrlOnUpdate({ currentUrl: current.url, nextUrl: updates.url, nextOgTitle: updates.ogTitle })) {
    const og = await enrichUrl(updates.url);
    updates.ogTitle = og.ogTitle;
    updates.ogDescription = og.ogDescription;
    updates.ogImage = og.ogImage;
    updates.siteName = og.siteName;
    updates.favicon = og.favicon;
  }

  // Auto-create category if it doesn't exist
  if (updates.category) {
    const categoryName = updates.category.trim();
    updates.category = categoryName;
    const existingCats = await db.select({ name: categories.name }).from(categories);
    const match = existingCats.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    if (match) {
      updates.category = match.name; // preserve existing casing
    } else {
      try {
        await db.insert(categories).values({ name: categoryName });
      } catch {}
    }
  }

  const taskFields = prepareTaskFields(
    nextType,
    updates.checklistItems,
    current.checklistItems,
    current.completed,
    current.completedAt,
  );

  // archivedAt arrives as an ISO string (or null to unarchive) but the
  // timestamp column needs a Date.
  const { archivedAt: archivedAtRaw, ...fieldUpdates } = updates;
  let archivedAtUpdate: { archivedAt: Date | null } | Record<string, never> = {};
  if (archivedAtRaw !== undefined) {
    if (archivedAtRaw === null) {
      archivedAtUpdate = { archivedAt: null };
    } else {
      const parsedDate = new Date(archivedAtRaw);
      if (Number.isNaN(parsedDate.getTime())) return jsonError(400, "Invalid archivedAt timestamp");
      archivedAtUpdate = { archivedAt: parsedDate };
    }
  }

  // When the client supplies expectedUpdatedAt, guard the UPDATE so a row
  // changed since the client loaded it matches nothing. Compare at
  // millisecond precision: Postgres stores microseconds, but the client only
  // ever saw the JSON-serialized (ms) timestamp.
  const [row] = await db
    .update(items)
    .set({
      ...fieldUpdates,
      ...archivedAtUpdate,
      checklistItems: taskFields.checklistItems,
      completed: taskFields.completed,
      completedAt: taskFields.completedAt,
      updatedAt: new Date(),
    })
    .where(
      expectedUpdatedAt
        ? and(
            eq(items.id, id),
            sqlExpr`date_trunc('milliseconds', ${items.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt}::timestamptz)`
          )
        : eq(items.id, id)
    )
    .returning();

  if (!row) {
    // Guarded update matched nothing: the item changed on another device
    // (or was deleted). Hand back the current row so the client can resolve.
    const [latest] = await db.select().from(items).where(eq(items.id, id));
    if (latest) {
      return NextResponse.json(
        { error: "Conflict: item changed on another device", current: latest },
        { status: 409 }
      );
    }
    return jsonError(404, "Not found");
  }

  // Re-embed post-response, but only when a field that feeds the embedding
  // input actually changed (quick mutations like pin/favourite don't).
  if (embeddingsEnabled() && embeddingInputChanged(current, row)) {
    after(() => updateItemEmbedding(row.id));
  }

  return NextResponse.json(row);
  } catch (error) {
    return serverError(error);
  }
}

// DELETE item
export async function DELETE(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError(400, "Missing id");

  try {
    await db.delete(items).where(eq(items.id, id));
    // Tombstone so ?since= pollers on other devices learn about the delete.
    await db
      .insert(deletedItems)
      .values({ id })
      .onConflictDoUpdate({ target: deletedItems.id, set: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
