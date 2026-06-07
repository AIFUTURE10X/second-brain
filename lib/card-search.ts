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

export function itemMatchesCardSearch(item: SearchableCard, query: string): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return true;

  const haystackTokens = tokenize(searchableCardText(item));
  return queryTokens.every((queryToken) =>
    haystackTokens.some((haystackToken) => tokenMatches(haystackToken, queryToken)),
  );
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

function tokenMatches(haystackToken: string, queryToken: string): boolean {
  if (queryToken.length === 4) return haystackToken === queryToken;
  return haystackToken.startsWith(queryToken);
}
