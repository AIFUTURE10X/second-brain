import type { ChecklistItem } from "./task-checklists";
import type { ViewMode } from "./view-mode";

export const SOURCE_LABELS: Record<string, string> = {
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "m.youtube.com": "YouTube",
  "x.com": "X/Twitter",
  "twitter.com": "X/Twitter",
  "github.com": "GitHub",
  "medium.com": "Medium",
  "reddit.com": "Reddit",
  "linkedin.com": "LinkedIn",
  "tiktok.com": "TikTok",
  "instagram.com": "Instagram",
  "claude.ai": "Claude",
  "anthropic.com": "Anthropic",
  "vercel.com": "Vercel",
};

export function sourceFromUrl(url: string): { key: string; label: string } | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const label = SOURCE_LABELS[host] || host;
    return { key: label, label };
  } catch {
    return null;
  }
}

export const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function formatReminderDue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Some browsers report `.md` files with an empty type — force markdown so the
// server allowlist accepts it. Pass through everything else.
export function resolveContentType(file: File): string {
  if (/\.(md|markdown)$/i.test(file.name)) return "text/markdown";
  return file.type || "application/octet-stream";
}

export function fileIcon(contentType: string, name?: string): string {
  if (contentType.startsWith("image/")) return "🖼";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType === "text/csv") return "📊";
  if (contentType.includes("word") || contentType.includes("document")) return "📝";
  if (contentType === "text/markdown" || contentType === "text/x-markdown" || (name && /\.(md|markdown)$/i.test(name))) return "Ⓜ";
  if (contentType === "text/plain") return "📃";
  return "📎";
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function viewModeIcon(mode: ViewMode): string {
  if (mode === "list") return "☰";
  if (mode === "table") return "▦";
  if (mode === "board") return "▥";
  return "≡";
}

export function viewModeLabel(mode: ViewMode): string {
  if (mode === "list") return "List";
  if (mode === "table") return "Table";
  if (mode === "board") return "Board";
  return "Compact";
}

export function checklistProgress(items?: ChecklistItem[]): { completed: number; total: number } {
  const total = items?.length ?? 0;
  const completed = (items || []).filter(item => item.completed).length;
  return { completed, total };
}
