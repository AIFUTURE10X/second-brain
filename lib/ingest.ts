import { z } from "zod";
import { itemTypeSchema } from "./validation";

// Pure helpers for POST /api/ingest (multipart image capture from the
// screenshot app). No next/server or db imports so node:test can transpile
// and load this module directly — same pattern as lib/validation.ts.

/**
 * Capture formats only. `image/svg+xml` is deliberately excluded: it is not a
 * capture format and a stored SVG is a script-execution vector when served
 * from the blob origin.
 */
export const INGEST_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/heic",
  "image/heif",
] as const;

/**
 * Local-dev backstop. Vercel serverless caps request bodies around 4.5 MB, so
 * in prod the platform rejects oversized uploads long before this check.
 */
export const INGEST_MAX_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Normalises a multipart part's content type ("image/JPEG; charset=binary",
 * the common "image/jpg" misspelling) and returns the canonical type, or null
 * when it isn't an accepted capture format.
 */
export function normalizeImageContentType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let type = raw.split(";")[0].trim().toLowerCase();
  if (type === "image/jpg") type = "image/jpeg";
  return (INGEST_IMAGE_CONTENT_TYPES as readonly string[]).includes(type) ? type : null;
}

/**
 * Blob keys are built from a client-supplied filename, so keep only
 * filename-safe ASCII (no directory separators, no control characters) and
 * guarantee an extension matching the content type.
 */
export function sanitizeFileName(raw: string | null | undefined, contentType: string): string {
  const base = (raw || "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  const extension = EXTENSION_BY_TYPE[contentType] || "bin";
  if (!base) return `screenshot.${extension}`;
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${extension}`;
}

/**
 * Minutes east of UTC encoded in an ISO 8601 string ("Z" → 0, "+10:00" → 600),
 * or null when the string carries no offset.
 */
export function isoOffsetMinutes(raw: string): number | null {
  const match = /(?:(Z)|([+-])(\d{2}):?(\d{2}))$/.exec(raw.trim());
  if (!match) return null;
  if (match[1]) return 0;
  const minutes = Number(match[3]) * 60 + Number(match[4]);
  return match[2] === "-" ? -minutes : minutes;
}

export type ParsedCapturedAt = { ok: true; date: Date; offsetMinutes: number } | { ok: false };

/** Parses the optional `capturedAt` field, keeping the client's UTC offset. */
export function parseCapturedAt(raw: string): ParsedCapturedAt {
  const trimmed = (raw || "").trim();
  const date = new Date(trimmed);
  if (!trimmed || Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, date, offsetMinutes: isoOffsetMinutes(trimmed) ?? 0 };
}

/**
 * "yyyy-MM-dd HH:mm" in the capture's own timezone — the wall-clock time the
 * user saw when the shot was taken, not the server's UTC clock.
 */
export function formatCaptureStamp(date: Date, offsetMinutes = 0): string {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}

export function defaultIngestTitle(date: Date, offsetMinutes = 0): string {
  return `Screenshot ${formatCaptureStamp(date, offsetMinutes)}`;
}

/** Comma-separated tags, parsed the same way /api/save parses its string form. */
export function parseTagList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);
}

/**
 * Formats Claude vision accepts. A capture the client sends in another allowed
 * format (avif/bmp/heic/heif) is still stored — we just skip the AI call for it
 * rather than send a media type the API would reject.
 */
export const AI_VISION_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export type AiVisionMediaType = (typeof AI_VISION_MEDIA_TYPES)[number];

/** The canonical media type to send to Claude vision, or null if unsupported. */
export function visionMediaType(raw: string | null | undefined): AiVisionMediaType | null {
  const type = normalizeImageContentType(raw);
  if (!type) return null;
  return (AI_VISION_MEDIA_TYPES as readonly string[]).includes(type) ? (type as AiVisionMediaType) : null;
}

/**
 * `autoTag` opt-in flag. Deliberately strict: only "1"/"true" (any casing) turn
 * AI tagging on, so a client that sends "0"/"false"/junk gets the plain path.
 */
export function parseAutoTagFlag(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const value = raw.trim().toLowerCase();
  return value === "1" || value === "true";
}

/** Model output is untrusted: lowercase, trim, drop blanks/dupes, cap at 5. */
export function normalizeAiTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string" && typeof entry !== "number") continue;
    const tag = String(entry).trim().toLowerCase().slice(0, 40);
    if (tag) seen.add(tag);
    if (seen.size >= 5) break;
  }
  return [...seen];
}

export interface IngestAiSuggestion {
  title?: string;
  category?: string;
  tags?: string[];
}

/**
 * Precedence: whatever the client explicitly sent always wins; the AI only
 * fills the gaps. So "I typed a title but left category on Auto" gets the typed
 * title and an AI category. `title` may come back empty — the caller falls back
 * to the timestamp default.
 */
export function mergeIngestAiSuggestion(
  client: { title: string; category: string; tags: string[] },
  ai: IngestAiSuggestion,
): { title: string; category: string; tags: string[] } {
  const clientTitle = (client.title || "").trim();
  const clientCategory = (client.category || "").trim();
  const clientTags = client.tags || [];
  return {
    title: clientTitle || (ai.title || "").trim(),
    category: clientCategory || (ai.category || "").trim(),
    tags: clientTags.length > 0 ? clientTags : normalizeAiTags(ai.tags),
  };
}

/**
 * `source` has no DB column of its own (e.g. "screenshot-app/region"), so it
 * rides along as a provenance line at the end of the card body.
 */
export function buildIngestContent(notes: string, source: string): string {
  const body = (notes || "").trim();
  const from = (source || "").trim();
  if (!from) return body;
  return body ? `${body}\n\nvia ${from}` : `via ${from}`;
}

// Text fields of the multipart body. Everything is optional; `file` is
// validated separately (it is a File, not a string).
export const ingestFieldsSchema = z
  .object({
    title: z.string().optional(),
    notes: z.string().optional(),
    source: z.string().optional(),
    capturedAt: z.string().optional(),
    tags: z.string().optional(),
    category: z.string().optional(),
    type: itemTypeSchema.optional(),
    // "1"/"true" asks the server to derive title/category/tags from the image.
    autoTag: z.string().optional(),
  })
  .strict();

export type IngestFields = z.infer<typeof ingestFieldsSchema>;
