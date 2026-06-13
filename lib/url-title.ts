function readablePathSegment(segment: string): string {
  const decoded = decodeURIComponent(segment).replace(/[-_+]+/g, " ").trim();
  if (!decoded || decoded.length < 3 || decoded.length > 60) return "";
  if (!/[a-z]/i.test(decoded)) return "";
  return decoded.replace(/\s+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export function fallbackTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";

    const host = parsed.hostname.replace(/^www\./i, "");
    if (!host) return "";

    const pathTitle = parsed.pathname
      .split("/")
      .filter(Boolean)
      .reverse()
      .map(readablePathSegment)
      .find(Boolean);

    return pathTitle ? `${pathTitle} - ${host}` : host;
  } catch {
    return "";
  }
}
