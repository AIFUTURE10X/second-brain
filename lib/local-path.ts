// Helpers for the "folder" item type — local folder/file paths stored in the
// item's `url` column. Browsers block navigating from a hosted (https) page to
// file:// URLs, so these paths are never rendered as clickable links; the card
// offers copy-to-clipboard instead (paste into File Explorer / Finder).

/**
 * True when the value looks like a local filesystem path rather than a web URL.
 * Recognizes Windows drive paths (C:\… / C:/…), UNC shares (\\server\share),
 * file:// URIs, and POSIX absolute paths (/Users/…) that aren't http(s) URLs.
 */
export function isLocalPath(value: string): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return false;
  if (/^file:\/\//i.test(v)) return true;          // file:// URI
  if (/^[a-zA-Z]:[\\/]/.test(v)) return true;       // C:\ or C:/
  if (/^\\\\[^\\]+/.test(v)) return true;           // \\server\share (UNC)
  if (v.startsWith("/")) return true;               // POSIX absolute path
  return false;
}

/**
 * Short, human-friendly label for a path: the final folder/file segment,
 * falling back to the full (trimmed) value. e.g. "C:\Users\me\Projects" →
 * "Projects". Used where space is tight; the full path stays in the title attr.
 */
export function formatLocalPathLabel(value: string): string {
  const v = value.trim().replace(/^file:\/\//i, "").replace(/[\\/]+$/, "");
  const parts = v.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || v;
}
