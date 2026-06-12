import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/api-key";
import { jsonError } from "@/lib/api-errors";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/svg+xml",
];

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB (Vercel Pro plan — plenty of blob storage)

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = checkApiKey(request);
  if (denied) return denied;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "File uploads are not configured: missing BLOB_READ_WRITE_TOKEN." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_SIZE,
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // No-op; the item save/update flow records the attachment URL
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    // Don't echo internal error text to the client — log it and return a
    // stable message (most rejections are type/size rule violations).
    console.error("[upload] rejected:", error);
    return jsonError(400, "Upload rejected: file type or size not allowed");
  }
}
