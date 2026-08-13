import { NextRequest, NextResponse, after } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { items, categories } from "@/db/schema";
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
  normalizeImageContentType,
  parseCapturedAt,
  parseTagList,
  sanitizeFileName,
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
 *
 * Returns 201 { id, title, attachmentUrl }.
 *
 * No AI tagging here: screenshots carry no text for the tagger to read, so it
 * would add latency for nothing. The client sends its own tags.
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
  for (const key of ["title", "notes", "source", "capturedAt", "tags", "category", "type"]) {
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
  const title = (fields.title || "").trim() || defaultIngestTitle(capturedDate, capturedOffset);
  const content = buildIngestContent(fields.notes || "", fields.source || "");
  const tags = parseTagList(fields.tags);
  let category = (fields.category || "").trim();
  const fileName = sanitizeFileName(file.name, contentType);

  try {
    // Auto-create the category if it doesn't exist (same rule as /api/save).
    if (category) {
      const existingCats = await db.select({ name: categories.name }).from(categories);
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
      .returning({ id: items.id, title: items.title });

    // Post-response, same as /api/save: never block the upload on OpenAI.
    if (embeddingsEnabled()) after(() => updateItemEmbedding(row.id));
    // Notes may contain [[wiki links]] (roadmap 2.2).
    after(() => syncWikiRelations(row.id));

    return NextResponse.json({ id: row.id, title: row.title, attachmentUrl: blob.url }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
