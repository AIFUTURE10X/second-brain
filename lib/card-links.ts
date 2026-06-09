type CardLinkEntry = {
  body?: string;
};

type CardLinkSource = {
  url?: string;
  content?: string;
  notes?: string;
  noteEntries?: CardLinkEntry[];
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

function stripTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?)}\]]+$/g, "");
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function extractTextUrls(text: string): string[] {
  const urls: string[] = [];

  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0] || "";
    const cleaned = stripTrailingUrlPunctuation(raw);
    if (!cleaned || !isHttpUrl(cleaned)) continue;
    urls.push(cleaned);
  }

  return urls;
}

export function extractCardLinks(source: CardLinkSource): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  const texts = [
    source.url || "",
    source.content || "",
    source.notes || "",
    ...(source.noteEntries || []).map((entry) => entry.body || ""),
  ];

  for (const text of texts) {
    for (const url of extractTextUrls(text)) {
      if (seen.has(url)) continue;
      seen.add(url);
      links.push(url);
    }
  }

  return links;
}

export function formatCardLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const suffix = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return `${host}${suffix}` || host;
  } catch {
    return url;
  }
}
