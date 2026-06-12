export function normalizeUrlForUpdate(value) {
  return String(value || "").trim();
}

export function shouldEnrichUrlOnUpdate({ currentUrl, nextUrl, nextOgTitle }) {
  const normalizedNextUrl = normalizeUrlForUpdate(nextUrl);
  if (!normalizedNextUrl) return false;
  if (String(nextOgTitle || "").trim()) return false;
  return normalizedNextUrl !== normalizeUrlForUpdate(currentUrl);
}

// Attach the optimistic-concurrency token to an item update payload.
// force=true (the conflict dialog's Overwrite) or a missing base timestamp
// falls back to last-write-wins — the same behavior old clients get when
// they omit expectedUpdatedAt entirely.
export function withConcurrencyGuard(payload, baseUpdatedAt, force = false) {
  if (force || !baseUpdatedAt) return payload;
  return { ...payload, expectedUpdatedAt: baseUpdatedAt };
}
