export function searchTokens(input: string): string[] {
  return input
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
}

export function buildItemSearchTsQuery(input: string): string {
  return searchTokens(input)
    .map(formatTsQueryTerm)
    .join(" & ");
}

function formatTsQueryTerm(term: string): string {
  return shouldUsePrefixMatch(term) ? `${term}:*` : term;
}

function shouldUsePrefixMatch(term: string): boolean {
  return term.length !== 4;
}
