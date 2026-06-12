export function searchTokens(input: string): string[] {
  return input
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
}

export function buildItemSearchTsQuery(input: string): string {
  return searchTokens(input)
    .map(term => `${term}:*`)
    .join(" & ");
}
