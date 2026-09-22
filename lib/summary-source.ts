import { isPrivateUrl } from "./enrich";
import { decodeHtmlEntities } from "./html-text";

export function sourceExcerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  // Include the beginning, middle and conclusion of long videos or pages.
  const part = Math.floor(limit / 3);
  const middle = Math.floor((text.length - part) / 2);
  return `[Source excerpts; some content omitted]\n${text.slice(0, part)}\n[... omitted ...]\n${text.slice(middle, middle + part)}\n[... omitted ...]\n${text.slice(-part)}`;
}

export async function fetchSummaryPageText(url: string): Promise<string> {
  const signal = AbortSignal.timeout(10_000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      if (isPrivateUrl(url)) return "";
      const res = await fetch(url, {
        headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", Accept: "text/html" },
        signal, redirect: "manual",
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) return "";
        url = new URL(location, url).href;
        continue;
      }
      if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) return "";
      const html = await res.text();
      const text = decodeHtmlEntities(html
        .replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ").trim();
      return sourceExcerpt(text, 30_000);
    }
  } catch {
    // The prompt explicitly labels the fallback as saved text / metadata only.
  }
  return "";
}
