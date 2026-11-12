// Demo pages (single-file .html builds) attached to cards. Vercel Blob refuses to show
// HTML in the browser (it sends it as a download), so the app serves an attached page at
// /demo/<blob path> from its own blob store, inside a CSP sandbox with no same-origin
// access: the demo's scripts run, but it can't read the app's cookies or call its API.
// Pure module — node:test loads it directly.

export const DEMO_VIEWER_PREFIX = "/demo/";
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const HTML_PATH = /\.html?$/i;

/** The CSP for a served demo: scripts, popups, forms and downloads work; same-origin never. */
export const DEMO_SANDBOX_CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads allow-pointer-lock";

export function isHtmlAttachment(att) {
  const type = String(att?.contentType ?? "").toLowerCase();
  if (type.startsWith("text/html")) return true;
  return HTML_PATH.test(String(att?.name ?? "")) || HTML_PATH.test(safePath(att?.url) ?? "");
}

function safePath(url) {
  try { return new URL(String(url)).pathname; } catch { return null; }
}

/** An attached page on a public blob store → the app's viewer link; anything else unchanged. */
export function demoViewerHref(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { return url; }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return url;
  if (!HTML_PATH.test(parsed.pathname)) return url;
  return `${DEMO_VIEWER_PREFIX}${parsed.pathname.replace(/^\/+/, "")}`;
}

/** The store's public host from BLOB_READ_WRITE_TOKEN ("vercel_blob_rw_<storeId>_<secret>"). */
export function blobStoreHost(token) {
  const match = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(String(token ?? ""));
  return match ? `${match[1].toLowerCase()}${BLOB_HOST_SUFFIX}` : null;
}

/**
 * The blob URL a /demo/<segments> request may serve, or null. Only .html files on the
 * app's own store: no other host, no dot segments, no query.
 */
export function demoBlobUrl(segments, host) {
  if (!host || !Array.isArray(segments) || segments.length === 0) return null;
  const decoded = segments.map(segment => String(segment));
  if (decoded.some(segment => !segment || segment === "." || segment === ".." || /[\\/?#]/.test(segment))) return null;
  const pathname = decoded.map(encodeURIComponent).join("/");
  if (!HTML_PATH.test(pathname)) return null;
  return `https://${host}/${pathname}`;
}
