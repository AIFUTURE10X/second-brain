import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/db";
import { items, categories, deletedItems } from "@/db/schema";
import { eq, gt, desc, asc, and, isNull, isNotNull, sql as sqlExpr, type SQL } from "drizzle-orm";
import { enrichUrl } from "@/lib/enrich";
import { checkApiKey } from "@/lib/api-key";
import { aiTagAndCategorize } from "@/lib/ai-tagger";
import { shouldEnrichUrlOnUpdate } from "@/lib/item-updates.mjs";
import { embeddingsEnabled } from "@/lib/embeddings.mjs";
import { hybridSearchItems } from "@/lib/search-items";
import { initialReadingStatus } from "@/lib/reading-status.mjs";
import { SYNC_CURSOR_OVERLAP_MS } from "@/lib/polling-sync.mjs";
import { embeddingInputChanged, updateItemEmbedding } from "@/lib/embedding-store";
import { syncWikiRelations } from "@/lib/wiki-link-store";
import { spawnNextTaskOccurrence } from "@/lib/recurring-tasks";
import { jsonError, parseBody, readJsonBody, serverError } from "@/lib/api-errors";
import { itemCreateSchema, itemUpdateSchema } from "@/lib/validation";
import { deriveTaskCompletion, normalizeChecklistItems } from "@/lib/task-checklists";
import { appendYouTubeDescriptionLinksToNotes, fetchYouTubeDescriptionLinks, type YouTubeDescriptionLink } from "@/lib/youtube";

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
    // Hybrid search shared with Telegram /find (lib/search-items.ts):
    // weighted FTS + pgvector semantic ranking merged via reciprocal rank
    // fusion, trigram fuzzy fallback on zero hits. ?semantic=0 forces
    // FTS-only, ?semantic=1 returns pure semantic ranking. Result flags map
    // to headers rather than a body shape change so existing clients that
    // expect a bare array keep working.
    const semanticParam = url.searchParams.get("semantic");
    const result = await hybridSearchItems(q, {
      archivedOnly,
      semanticMode: semanticParam === "0" ? "off" : semanticParam === "1" ? "only" : "auto",
      filter: matchesStructuredFilters,
    });
    const headers: Record<string, string> = {};
    if (result.semanticUsed) headers["x-search-semantic"] = "1";
    if (result.fuzzy) headers["x-search-fuzzy"] = "1";
    return NextResponse.json(result.rows, Object.keys(headers).length > 0 ? { headers } : undefined);
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
      readingStatus: body.readingStatus ?? initialReadingStatus(body.type || "note"),
      recurrence: (body.type || "note") === "task" ? body.recurrence ?? null : null,
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
  // Resolve [[wiki links]] into item_relations (roadmap 2.2).
  after(() => syncWikiRelations(row.id));

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
  // Resolve [[wiki links]] into item_relations (roadmap 2.2).
  after(() => syncWikiRelations(row.id));
  // Completing a recurring task spawns its next occurrence (roadmap 2.11).
  if (row.type === "task" && row.completed && !current.completed) {
    after(() => spawnNextTaskOccurrence(row));
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
