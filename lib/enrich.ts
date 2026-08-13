import { decodeHtmlBytes, decodeHtmlEntities, stripReplacementChars } from "./html-text";
import { extractYouTubeId } from "./youtube";
import {
  buildYouTubeOwnerSearchText,
  isYouTubeChannelUrl,
  isYouTubeUrl,
  extractYouTubeOwnerNameFromTitle,
} from "./youtube-owner";

export function isPrivateUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    const host = u.hostname.toLowerCase();
    // Block localhost variants
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
    // Block .local and .internal hostnames
    if (host.endsWith(".local") || host.endsWith(".internal")) return true;
    // Block private IP ranges
    const ipMatch = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10) return true;                         // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
      if (a === 192 && b === 168) return true;            // 192.168.0.0/16
      if (a === 169 && b === 254) return true;            // 169.254.0.0/16
      if (a === 0) return true;                           // 0.0.0.0/8
    }
    return false;
  } catch {
    return true;
  }
}

export interface EnrichResult {
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  siteName: string;
  favicon: string;
}

const EMPTY: EnrichResult = { ogTitle: "", ogDescription: "", ogImage: "", siteName: "", favicon: "" };

function youtubeChannelFallback(url: string): EnrichResult {
  const owner = buildYouTubeOwnerSearchText("", url);
  if (!owner) return EMPTY;
  return {
    ogTitle: owner,
    ogDescription: owner,
    ogImage: "",
    siteName: "YouTube",
    favicon: "https://www.youtube.com/favicon.ico",
  };
}

async function enrichYouTube(url: string, videoId: string): Promise<EnrichResult> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) return EMPTY;
    const data = await res.json();
    const owner = buildYouTubeOwnerSearchText(data.author_name || "", url);
    return {
      ogTitle: data.title || "",
      ogDescription: owner,
      ogImage: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      siteName: "YouTube",
      favicon: "https://www.youtube.com/favicon.ico",
    };
  } catch {
    return EMPTY;
  }
}

function meta(html: string, property: string): string {
  // Match <meta property="og:title" content="..."> or <meta name="..." content="...">
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1]).trim();
  }
  return "";
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!m?.[1]) return "";
  return decodeHtmlEntities(m[1]).trim();
}

export async function enrichUrl(url: string): Promise<EnrichResult> {
  if (!url) return EMPTY;

  try {
    // Block private/internal URLs
    if (isPrivateUrl(url)) return EMPTY;

    // YouTube shortcut — use oEmbed (no HTML fetch needed)
    const ytId = extractYouTubeId(url);
    if (ytId) return enrichYouTube(url, ytId);
    const channelFallback = isYouTubeChannelUrl(url) ? youtubeChannelFallback(url) : EMPTY;

    // Generic: fetch the page HTML and parse OG tags
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Use a social-media-crawler UA — sites allow these so their og:image
    // renders in Facebook/Twitter/Slack embeds. A generic bot UA gets 403'd.
    const res = await fetch(url, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        Accept: "text/html",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return channelFallback;

    // Only read the first 50KB to avoid loading huge pages. Buffer raw bytes
    // rather than decoding as we go: the charset isn't known until we've seen
    // the Content-Type header (or a <meta charset>), and a hard-coded UTF-8
    // decode mangles windows-1252 pages into U+FFFD.
    const reader = res.body?.getReader();
    if (!reader) return channelFallback;
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (byteLength < 50_000) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      chunks.push(value);
      byteLength += value.length;
    }
    reader.cancel();

    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const html = decodeHtmlBytes(bytes, res.headers.get("content-type"));

    const origin = new URL(url).origin;

    const result = {
      ogTitle: stripReplacementChars(
        meta(html, "og:title") || meta(html, "twitter:title") || extractTitle(html)
      ),
      ogDescription: stripReplacementChars(
        meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description")
      ),
      ogImage: meta(html, "og:image") || meta(html, "twitter:image"),
      siteName: stripReplacementChars(
        meta(html, "og:site_name") || new URL(url).hostname.replace(/^www\./, "")
      ),
      favicon: `${origin}/favicon.ico`,
    };

    if (isYouTubeUrl(url)) {
      const owner = isYouTubeChannelUrl(url)
        ? buildYouTubeOwnerSearchText(result.ogTitle, url)
        : "";

      return {
        ...result,
        ogTitle: result.ogTitle ? extractYouTubeOwnerNameFromTitle(result.ogTitle) : result.ogTitle,
        ogDescription: owner || result.ogDescription,
        siteName: "YouTube",
        favicon: "https://www.youtube.com/favicon.ico",
      };
    }

    return result;
  } catch {
    return isYouTubeChannelUrl(url) ? youtubeChannelFallback(url) : EMPTY;
  }
}
