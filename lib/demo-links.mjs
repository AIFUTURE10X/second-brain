// Demo pages (single-file .html builds) attached to cards. Vercel Blob refuses to show
// HTML in the browser (it sends it as a download), so the app serves an attached page at
// /demo/<store id>/<blob path> from its own blob store, inside a CSP sandbox with no same-origin
// access: the demo's scripts run, but it can't read the app's cookies or call its API.
// Pure module — node:test loads it directly.

export const DEMO_VIEWER_PREFIX = "/demo/";
const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const HTML_PATH = /\.html?$/i;
const STORE_ID = /^[a-z0-9]+$/;

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

/**
 * An attached page on a public blob store → the app's viewer link, /demo/<storeId>/<path>;
 * anything else unchanged. The store id is kept so the viewer never confuses two stores.
 */
export function demoViewerHref(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { return url; }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(BLOB_HOST_SUFFIX)) return url;
  const storeId = parsed.hostname.slice(0, -BLOB_HOST_SUFFIX.length);
  if (!STORE_ID.test(storeId) || !HTML_PATH.test(parsed.pathname)) return url;
  return `${DEMO_VIEWER_PREFIX}${storeId}/${parsed.pathname.replace(/^\/+/, "")}`;
}

/** The store's public host from BLOB_READ_WRITE_TOKEN ("vercel_blob_rw_<storeId>_<secret>"). */
export function blobStoreHost(token) {
  const match = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(String(token ?? ""));
  return match ? `${match[1].toLowerCase()}${BLOB_HOST_SUFFIX}` : null;
}

export function storeHost(storeId) {
  return STORE_ID.test(String(storeId ?? "")) ? `${storeId}${BLOB_HOST_SUFFIX}` : null;
}

/**
 * Where a /demo/<storeId>/<path…> request goes: { serve } for an .html file on this app's
 * own store, { redirect } to the original blob for another store (the viewer can only
 * vouch for its own), or null. Next hands over the segments already decoded, so they are
 * encoded exactly once here; only separators and dot segments are refused.
 */
export function demoTarget(segments, ownHost) {
  if (!Array.isArray(segments) || segments.length < 2) return null;
  const [storeId, ...rest] = segments.map(segment => String(segment));
  const host = storeHost(storeId.toLowerCase());
  if (!host) return null;
  if (rest.some(segment => !segment || segment === "." || segment === ".." || /[\\/]/.test(segment))) return null;
  if (!HTML_PATH.test(rest[rest.length - 1])) return null;
  const url = `https://${host}/${rest.map(encodeURIComponent).join("/")}`;
  return host === ownHost ? { serve: url } : { redirect: url };
}
