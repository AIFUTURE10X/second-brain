export function isYouTubeUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "").toLowerCase();
    return host === "youtube.com" || host === "youtu.be" || host === "music.youtube.com";
  } catch {
    return false;
  }
}

export function isYouTubeChannelUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "").toLowerCase();
    if (host !== "youtube.com" && host !== "music.youtube.com") return false;

    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (!first) return false;
    return first.startsWith("@") || (["c", "user"].includes(first) && !!second);
  } catch {
    return false;
  }
}

export function extractYouTubeOwnerHintFromUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "").toLowerCase();
    if (host !== "youtube.com" && host !== "music.youtube.com") return "";

    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (!first) return "";

    if (first.startsWith("@")) return humanizeOwnerToken(first.slice(1));
    if ((first === "c" || first === "user") && second) return humanizeOwnerToken(second);
    return "";
  } catch {
    return "";
  }
}

export function extractYouTubeOwnerNameFromTitle(title: string): string {
  return title
    .replace(/\s*-\s*YouTube(?:\s+Music)?\s*$/i, "")
    .trim();
}

export function buildYouTubeOwnerSearchText(primaryOwner: string, urlStr: string): string {
  const values = [
    extractYouTubeOwnerNameFromTitle(primaryOwner),
    extractYouTubeOwnerHintFromUrl(urlStr),
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  return values
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

function humanizeOwnerToken(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {}

  return decoded
    .replace(/^@+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
