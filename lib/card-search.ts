export type SearchableCard = {
  title?: string;
  content?: string;
  notes?: string;
  url?: string;
  category?: string;
  tags?: string[];
  ogTitle?: string;
  ogDescription?: string;
  siteName?: string;
  noteEntries?: Array<{ body?: string }>;
  checklistItems?: Array<{ text?: string }>;
};

export function itemMatchesCardSearch(item: SearchableCard, query: string, exact = false): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return true;

  const haystackTokens = tokenize(searchableCardText(item));
  return queryTokens.every((queryToken) =>
    haystackTokens.some((haystackToken) => tokenMatches(haystackToken, queryToken, exact)),
  );
}

// Precision-first filtering, mirroring the server search's staging: cards
// containing every query term as a whole word win outright; prefix matches
// ("mark" → "market") only surface when no card matched exactly, which keeps
// mid-typing partials working without letting them pollute finished words.
export function filterCardsBySearch<T extends SearchableCard>(cards: T[], query: string): T[] {
  const exactMatches = cards.filter((card) => itemMatchesCardSearch(card, query, true));
  if (exactMatches.length > 0) return exactMatches;
  return cards.filter((card) => itemMatchesCardSearch(card, query));
}

function searchableCardText(item: SearchableCard): string {
  return [
    item.title,
    item.content,
    item.notes,
    item.url,
    item.category,
    item.ogTitle,
    item.ogDescription,
    item.siteName,
    ...(item.tags || []),
    ...(item.noteEntries || []).map((entry) => entry.body),
    ...(item.checklistItems || []).map((item) => item.text),
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function tokenMatches(haystackToken: string, queryToken: string, exact: boolean): boolean {
  return exact ? haystackToken === queryToken : haystackToken.startsWith(queryToken);
}
