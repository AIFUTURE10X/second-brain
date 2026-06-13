import path from "node:path";

export const LOCAL_FILE_VIEWER_PATH = "/api/local-file";

export function isLocalFileUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "file:";
  } catch {
    return false;
  }
}

export function localFileViewerHref(url: string): string {
  return isLocalFileUrl(url)
    ? `${LOCAL_FILE_VIEWER_PATH}?url=${encodeURIComponent(url)}`
    : url;
}

export function localFilePathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") return null;

    const pathname = decodeURIComponent(parsed.pathname || "");
    if (parsed.hostname) return `//${parsed.hostname}${pathname}`;
    return pathname.replace(/^\/([A-Za-z]:\/)/, "$1");
  } catch {
    return null;
  }
}

export function isPathInsideRoot(filePath: string, root: string): boolean {
  const resolvedFile = path.resolve(filePath).toLowerCase();
  const resolvedRoot = path.resolve(root).toLowerCase();
  const rootWithSeparator = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;

  return resolvedFile === resolvedRoot || resolvedFile.startsWith(rootWithSeparator);
}

export function localFileContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html" || extension === ".htm") return "text/html; charset=utf-8";
  if (extension === ".md" || extension === ".markdown") return "text/markdown; charset=utf-8";
  if (extension === ".txt" || extension === ".log") return "text/plain; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}
