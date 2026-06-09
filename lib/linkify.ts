import { formatCardLinkLabel, normalizeCardLinkUrl } from "./card-links";

export type LinkifiedTextSegment =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

export function linkifyText(text: string): LinkifiedTextSegment[] {
  if (!text) return [];

  const segments: LinkifiedTextSegment[] = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  let lastIndex = 0;

  for (const match of text.matchAll(urlPattern)) {
    const raw = match[0] || "";
    const start = match.index ?? 0;
    const linkText = stripTrailingUrlPunctuation(raw);
    if (!linkText || !isHttpUrl(linkText)) continue;
    const normalizedHref = normalizeCardLinkUrl(linkText);

    if (start > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, start) });
    }

    segments.push({ type: "link", text: formatCardLinkLabel(normalizedHref), href: normalizedHref });
    lastIndex = start + linkText.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

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
