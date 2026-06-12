// Duplicate detection (roadmap 2.12). Pure helpers — the API route does the
// DB work, the card form shows the warning.

const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src",
  "si", "feature",
]);

/**
 * Canonical form of a URL for exact-duplicate comparison: lowercase
 * scheme/host, no www., no hash, no tracking params (utm_* and friends),
 * no trailing slash. Returns "" for unparseable input.
 */
export function normalizeUrlForDuplicateCheck(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) return "";
  let url;
  try {
    url = new URL(input);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !key.toLowerCase().startsWith("utm_") && !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length > 0
    ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}`
    : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `${host}${path}${query}`;
}

/** Exact-URL duplicates from a candidate list (server-side compare). */
export function findUrlDuplicates(rawUrl, candidates, options) {
  const excludeId = options?.excludeId ?? null;
  const normalized = normalizeUrlForDuplicateCheck(rawUrl);
  if (!normalized) return [];
  return candidates.filter(candidate =>
    candidate.id !== excludeId &&
    normalizeUrlForDuplicateCheck(candidate.url) === normalized
  );
}

/** Merge URL + title matches, URL hits first, deduped by id. */
export function mergeDuplicateMatches(urlMatches, titleMatches, limit = 4) {
  const seen = new Set();
  const merged = [];
  for (const row of [...urlMatches.map(r => ({ ...r, match: "url" })), ...titleMatches.map(r => ({ ...r, match: r.match || "title" }))]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
    if (merged.length >= limit) break;
  }
  return merged;
}
