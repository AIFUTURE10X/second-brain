import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { checkApiKey } from "@/lib/api-key";
import { isPathInsideRoot, localFileContentType, localFilePathFromUrl } from "@/lib/local-file-links";

export const runtime = "nodejs";

const MAX_LOCAL_FILE_BYTES = 20 * 1024 * 1024;

function allowedLocalFileRoots(): string[] {
  const configured = process.env.LOCAL_FILE_ALLOWED_ROOTS
    ?.split(path.delimiter)
    .map(root => root.trim())
    .filter(Boolean);

  return configured && configured.length > 0 ? configured : [process.cwd()];
}

function contentDispositionFor(filePath: string): string {
  const filename = path.basename(filePath).replace(/["\r\n]/g, "_") || "local-file";
  return `inline; filename="${filename}"`;
}

export async function GET(req: NextRequest) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const localFileUrl = new URL(req.url).searchParams.get("url") || "";
  const filePath = localFilePathFromUrl(localFileUrl);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid local file URL" }, { status: 400 });
  }

  const allowed = allowedLocalFileRoots().some(root => isPathInsideRoot(filePath, root));
  if (!allowed) {
    return NextResponse.json({ error: "Local file is outside the allowed folder" }, { status: 403 });
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Local path is not a file" }, { status: 400 });
    }
    if (info.size > MAX_LOCAL_FILE_BYTES) {
      return NextResponse.json({ error: "Local file is too large to preview" }, { status: 413 });
    }

    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": localFileContentType(filePath),
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": contentDispositionFor(filePath),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") {
      return NextResponse.json({ error: "Local file not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not open local file" }, { status: 500 });
  }
}
