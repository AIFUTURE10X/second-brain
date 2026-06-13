export type ShareableCard = {
  title?: string;
  ogTitle?: string;
  content?: string;
  url?: string;
  category?: string;
  tags?: string[];
};

export type CardShareLinks = {
  email: string;
  whatsapp: string;
  telegram: string;
};

const EXCERPT_LIMIT = 220;

function cleanText(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

export function getCardShareTitle(item: ShareableCard): string {
  return cleanText(item.title) || cleanText(item.ogTitle) || cleanText(item.url) || "Second Brain card";
}

function getCardShareExcerpt(item: ShareableCard): string {
  const text = cleanText(item.content);
  if (text.length <= EXCERPT_LIMIT) return text;
  return `${text.slice(0, EXCERPT_LIMIT - 3).trim()}...`;
}

export function buildCardShareText(item: ShareableCard): string {
  const details = [
    getCardShareTitle(item),
    getCardShareExcerpt(item),
    cleanText(item.url),
    item.category ? `Category: ${cleanText(item.category)}` : "",
    item.tags?.length ? `Tags: ${item.tags.map(cleanText).filter(Boolean).join(", ")}` : "",
  ].filter(Boolean);

  return details.join("\n\n");
}

export function buildCardShareLinks(item: ShareableCard): CardShareLinks {
  const title = getCardShareTitle(item);
  const text = buildCardShareText(item);
  const url = cleanText(item.url);
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(text);

  return {
    email: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodedTitle}&body=${encodedText}`,
    whatsapp: `https://wa.me/?text=${encodedText}`,
    telegram: url
      ? `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodedTitle}`
      : `https://t.me/share/url?text=${encodedText}`,
  };
}
