export function normalizeUrlForUpdate(value) {
  return String(value || "").trim();
}

export function shouldEnrichUrlOnUpdate({ currentUrl, nextUrl, nextOgTitle }) {
  const normalizedNextUrl = normalizeUrlForUpdate(nextUrl);
  if (!normalizedNextUrl) return false;
  if (String(nextOgTitle || "").trim()) return false;
  return normalizedNextUrl !== normalizeUrlForUpdate(currentUrl);
}
