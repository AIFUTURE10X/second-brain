import { NextRequest, NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
import { aiTagImage } from "@/lib/ai-vision-tagger";
import { checkApiKeyHeaderOnly } from "@/lib/api-key";
import { jsonError, parseBody, serverError } from "@/lib/api-errors";
import { embeddingsEnabled } from "@/lib/embeddings.mjs";
import { updateItemEmbedding } from "@/lib/embedding-store";
import { initialReadingStatus } from "@/lib/reading-status.mjs";
import { syncWikiRelations } from "@/lib/wiki-link-store";
import {
  INGEST_IMAGE_CONTENT_TYPES,
  INGEST_MAX_BYTES,
  buildIngestContent,
  defaultIngestTitle,
  ingestFieldsSchema,
  mergeIngestAiSuggestion,
  normalizeImageContentType,
  parseAutoTagFlag,
  parseCapturedAt,
  parseTagList,
  sanitizeFileName,
  visionMediaType,
} from "@/lib/ingest";

/**
 * POST /api/ingest — multipart/form-data image capture endpoint.
 *
 * Built for native clients (the Windows screenshot app): one POST uploads the
 * image to Vercel Blob and creates a card with it attached. Unlike /api/upload
 * (a browser-only client-token handshake) everything happens server-side.
 *
 * Auth: `x-api-key` header only (checkApiKeyHeaderOnly) — never `?key=`.
 *
 * Fields (multipart):
 *   file        required — image/png|jpeg|gif|webp|avif|bmp|heic|heif (no svg)
 *   title       optional — defaults to "Screenshot yyyy-MM-dd HH:mm"
 *   notes       optional — becomes the card body
 *   source      optional — provenance, appended to the body ("via …")
 *   capturedAt  optional — ISO 8601; drives the default title
 *   tags        optional — comma-separated
 *   category    optional — auto-created if unknown
 *   type        optional — defaults to "clip"
 *   autoTag     optional — "1"/"true" asks Claude vision for title/category/tags
 *
 * Returns 201 { id, title, attachmentUrl, category, tags }.
 *
 * With autoTag the image itself is sent to Claude vision. Anything the client
 * supplied explicitly still wins; the AI only fills what was left blank. The
 * call is best-effort — no key, an unsupported media type, an error or a
 * timeout all fall back to the plain path rather than failing the upload.
 */
export async function POST(req: NextRequest) {
  const denied = checkApiKeyHeaderOnly(req);
  if (denied) return denied;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Image ingestion is not configured: missing BLOB_READ_WRITE_TOKEN." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "Expected a multipart/form-data body");
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonError(400, "Missing file: attach the image as the `file` part");
  }
  if (file.size > INGEST_MAX_BYTES) {
    return jsonError(400, `File too large: max ${Math.round(INGEST_MAX_BYTES / (1024 * 1024))} MB`);
  }
  const contentType = normalizeImageContentType(file.type);
  if (!contentType) {
    return jsonError(400, `Unsupported file type. Allowed: ${INGEST_IMAGE_CONTENT_TYPES.join(", ")}`);
  }

  // Only the text parts go through zod; a File where a string belongs is
  // dropped here and reported as a validation failure by the schema.
  const textFields: Record<string, string> = {};
  for (const key of ["title", "notes", "source", "capturedAt", "tags", "category", "type", "autoTag"]) {
    const value = form.get(key);
    if (typeof value === "string" && value.trim() !== "") textFields[key] = value;
  }
  const parsed = parseBody(ingestFieldsSchema, textFields);
  if (!parsed.success) return parsed.res;
  const fields = parsed.data;

  let capturedDate = new Date();
  let capturedOffset = 0;
  if (fields.capturedAt) {
    const captured = parseCapturedAt(fields.capturedAt);
    if (!captured.ok) return jsonError(400, "Invalid capturedAt: expected an ISO 8601 timestamp");
    capturedDate = captured.date;
    capturedOffset = captured.offsetMinutes;
  }

  const type = fields.type || "clip";
  const content = buildIngestContent(fields.notes || "", fields.source || "");
  const autoTag = parseAutoTagFlag(fields.autoTag);
  const fileName = sanitizeFileName(file.name, contentType);

  // What the client actually asked for — these always beat the AI suggestion.
  let title = (fields.title || "").trim();
  let category = (fields.category || "").trim();
  let tags = parseTagList(fields.tags);

  try {
    // One read of the category table serves both the AI prompt and the
    // auto-create match below.
    const needsCategoryList = autoTag || Boolean(category);
    const existingCats = needsCategoryList
      ? await db.select({ name: categories.name }).from(categories).orderBy(asc(categories.name))
      : [];

    // Everything the client left blank can come from the image. Skipped for
    // media types Claude vision doesn't accept (avif/bmp/heic/heif).
    const mediaType = autoTag ? visionMediaType(contentType) : null;
    if (mediaType && (!title || !category || tags.length === 0)) {
      const suggestion = await aiTagImage({
        base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
        mediaType,
        existingCategories: existingCats.map(c => c.name),
        hintTitle: title || (fields.notes || "").trim(),
      });
      const merged = mergeIngestAiSuggestion({ title, category, tags }, suggestion);
      title = merged.title;
      category = merged.category;
      tags = merged.tags;
    }

    if (!title) title = defaultIngestTitle(capturedDate, capturedOffset);

    // Auto-create the category if it doesn't exist (same rule as /api/save).
    if (category) {
      const match = existingCats.find(c => c.name.toLowerCase() === category.toLowerCase());
      if (match) {
        category = match.name; // preserve existing casing
      } else {
        try {
          await db.insert(categories).values({ name: category });
        } catch {}
      }
    }

    const blob = await put(`ingest/${fileName}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType,
    });

    const [row] = await db
      .insert(items)
      .values({
        type,
        title,
        content,
        url: "",
        tags,
        category,
        pinned: false,
        readingStatus: initialReadingStatus(type),
        reviewedAt: null,
        workflowStatus: "inbox",
        attachments: [{ url: blob.url, name: fileName, contentType, size: file.size }],
      })
      .returning({
        id: items.id,
        title: items.title,
        category: items.category,
        tags: items.tags,
      });

    // Post-response, same as /api/save: never block the upload on OpenAI.
    if (embeddingsEnabled()) after(() => updateItemEmbedding(row.id));
    // Notes may contain [[wiki links]] (roadmap 2.2).
    after(() => syncWikiRelations(row.id));

    return NextResponse.json(
      {
        id: row.id,
        title: row.title,
        attachmentUrl: blob.url,
        category: row.category ?? "",
        tags: row.tags ?? [],
      },
      { status: 201 },
    );
  } catch (error) {
    return serverError(error);
  }
}
