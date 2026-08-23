export function searchTokens(input: string): string[] {
  return input
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
}

// Exact-word query: every term must appear as a whole word (Postgres still
// stems, so "recipes" matches "recipe"). Tried first so a finished word only
// returns cards that actually contain it — "mark" no longer surfaces cards
// that merely contain "market".
export function buildExactItemSearchTsQuery(input: string): string {
  return searchTokens(input).join(" & ");
}

// Prefix query: fallback for mid-typing partials ("netw" → "network") when
// the exact-word query has no hits.
export function buildItemSearchTsQuery(input: string): string {
  return searchTokens(input)
    .map(term => `${term}:*`)
    .join(" & ");
}
