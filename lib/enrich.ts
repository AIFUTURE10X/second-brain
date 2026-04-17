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

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.has("v")) return u.searchParams.get("v");
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0];
    if (u.hostname.includes("youtube.com") && u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
  } catch {}
  return null;
}

async function enrichYouTube(url: string, videoId: string): Promise<EnrichResult> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!res.ok) return EMPTY;
    const data = await res.json();
    return {
      ogTitle: data.title || "",
      ogDescription: `${data.author_name || ""}`,
      ogImage: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
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
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1]?.trim() || "";
}

export async function enrichUrl(url: string): Promise<EnrichResult> {
  if (!url) return EMPTY;

  try {
    // Block private/internal URLs
    if (isPrivateUrl(url)) return EMPTY;

    // YouTube shortcut — use oEmbed (no HTML fetch needed)
    const ytId = extractYouTubeId(url);
    if (ytId) return enrichYouTube(url, ytId);

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

    if (!res.ok) return EMPTY;

    // Only read first 50KB to avoid loading huge pages
    const reader = res.body?.getReader();
    if (!reader) return EMPTY;
    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 50_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    const origin = new URL(url).origin;

    return {
      ogTitle: meta(html, "og:title") || meta(html, "twitter:title") || extractTitle(html),
      ogDescription: meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description"),
      ogImage: meta(html, "og:image") || meta(html, "twitter:image"),
      siteName: meta(html, "og:site_name") || new URL(url).hostname.replace(/^www\./, ""),
      favicon: `${origin}/favicon.ico`,
    };
  } catch {
    return EMPTY;
  }
}
