"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { showToast } from "./Toast";
import { VoiceButton } from "./VoiceButton";
import { LinkifiedText } from "./LinkifiedText";
import TaskChecklistEditor from "./TaskChecklistEditor";
import Vault from "./Vault";
import { itemMatchesCardSearch } from "@/lib/card-search";
import { SYNC_CHANNEL, getSyncClientId, type SyncMessage, type SyncPayload } from "@/lib/sync";
import { mergeReminderDateTimeParts, splitReminderDateTime } from "@/lib/reminders.mjs";
import { isMemoryOfWeekEnabled, MEMORY_OF_WEEK_ENABLED_KEY } from "@/lib/telegram-memory-settings.mjs";
import { nextViewMode, parseViewMode, type ViewMode } from "@/lib/view-mode";
import { compressImageForUpload } from "@/lib/image-compression";
import { draftStorageKey, parseDraftPayload, serializeDraftPayload } from "@/lib/item-draft-autosave";
import { newChecklistItem, normalizeChecklistItems, type ChecklistItem } from "@/lib/task-checklists";

const CLIENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

type ItemType = "note" | "link" | "clip" | "thought" | "task" | "memory";

interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

interface NoteEntry {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface Item {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  url: string;
  notes: string;
  noteEntries?: NoteEntry[];
  checklistItems?: ChecklistItem[];
  tags: string[];
  category: string;
  pinned: boolean;
  completed?: boolean;
  completedAt?: string | null;
  favourite?: boolean;
  actionRequired?: boolean;
  attachments?: Attachment[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  siteName: string;
  favicon: string;
  createdAt: string;
  updatedAt: string;
}

interface Reminder {
  id: string;
  itemId: string;
  message: string;
  dueAt: string;
  status: "pending" | "sent" | "done";
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RelatedItemSummary {
  id: string;
  type: ItemType;
  title: string;
  url: string;
  category: string;
  tags: string[];
  ogTitle: string;
  siteName: string;
  favicon: string;
}

interface ItemRelation {
  id?: string;
  itemAId: string;
  itemBId: string;
  itemA: RelatedItemSummary;
  itemB: RelatedItemSummary;
  createdAt?: string;
}

const newEntryId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `e_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const formatStamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Some browsers report `.md` files with an empty type — force markdown so the
// server allowlist accepts it. Pass through everything else.
function resolveContentType(file: File): string {
  if (/\.(md|markdown)$/i.test(file.name)) return "text/markdown";
  return file.type || "application/octet-stream";
}

function fileIcon(contentType: string, name?: string): string {
  if (contentType.startsWith("image/")) return "🖼";
  if (contentType === "application/pdf") return "📄";
  if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType === "text/csv") return "📊";
  if (contentType.includes("word") || contentType.includes("document")) return "📝";
  if (contentType === "text/markdown" || contentType === "text/x-markdown" || (name && /\.(md|markdown)$/i.test(name))) return "Ⓜ";
  if (contentType === "text/plain") return "📃";
  return "📎";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Category {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  position?: number;
}

const TYPES: Record<ItemType, { icon: string; label: string; color: string }> = {
  note: { icon: "✎", label: "Note", color: "#E8A838" },
  link: { icon: "◈", label: "Link", color: "#5B8DEF" },
  clip: { icon: "✂", label: "Clip", color: "#6FCF97" },
  thought: { icon: "◉", label: "Thought", color: "#BB6BD9" },
  task: { icon: "☐", label: "Task", color: "#56CCF2" },
  memory: { icon: "💡", label: "Memory", color: "#F2C94C" },
};

const TAG_COLORS = ["#E8A838", "#5B8DEF", "#6FCF97", "#BB6BD9", "#EB5757", "#56CCF2", "#F2994A", "#9B51E0"];
const CAT_COLORS = ["#E8A838", "#5B8DEF", "#6FCF97", "#BB6BD9", "#EB5757", "#56CCF2", "#F2994A", "#9B51E0", "#27AE60", "#F2C94C"];

function viewModeIcon(mode: ViewMode): string {
  if (mode === "comfortable") return "▦";
  if (mode === "list") return "☰";
  return "≡";
}

function viewModeLabel(mode: ViewMode): string {
  if (mode === "comfortable") return "Comfortable";
  if (mode === "list") return "List";
  return "Compact";
}

const SOURCE_LABELS: Record<string, string> = {
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

const REMINDER_TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

function sourceFromUrl(url: string): { key: string; label: string } | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const label = SOURCE_LABELS[host] || host;
    return { key: label, label };
  } catch {
    return null;
  }
}

function timeAgo(dateStr: string) {
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

function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatReminderDue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function checklistProgress(items?: ChecklistItem[]): { completed: number; total: number } {
  const total = items?.length ?? 0;
  const completed = (items || []).filter(item => item.completed).length;
  return { completed, total };
}

function hasMeaningfulFormContent(form: {
  title: string;
  content: string;
  url: string;
  noteEntries: NoteEntry[];
  checklistItems: ChecklistItem[];
  tags: string;
  category: string;
  attachments: Attachment[];
  reminderDueAt: string;
  reminderMessage: string;
  relatedItemIds: string[];
}): boolean {
  return Boolean(
    form.title.trim() ||
    form.content.trim() ||
    form.url.trim() ||
    form.tags.trim() ||
    form.category.trim() ||
    form.reminderDueAt.trim() ||
    form.reminderMessage.trim() ||
    form.noteEntries.some(entry => entry.body.trim()) ||
    form.checklistItems.some(item => item.text.trim()) ||
    form.attachments.length > 0 ||
    form.relatedItemIds.length > 0
  );
}

export default function Brain() {
  const [items, setItems] = useState<Item[]>([]);
  const [relations, setRelations] = useState<ItemRelation[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"all" | ItemType>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [withNotesOnly, setWithNotesOnly] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [actionOnly, setActionOnly] = useState(false);
  const [remindersOnly, setRemindersOnly] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagMenuSearch, setTagMenuSearch] = useState("");
  const [quickTaskText, setQuickTaskText] = useState("");
  const [quickTaskSaving, setQuickTaskSaving] = useState(false);
  const [quickMemoryText, setQuickMemoryText] = useState("");
  const [quickMemorySaving, setQuickMemorySaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [memoryOfWeekEnabled, setMemoryOfWeekEnabled] = useState(true);
  const [memoryOfWeekSaving, setMemoryOfWeekSaving] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "note" as ItemType,
    title: "",
    content: "",
    url: "",
    noteEntries: [] as NoteEntry[],
    checklistItems: [] as ChecklistItem[],
    tags: "",
    category: "",
    attachments: [] as Attachment[],
    favourite: false,
    actionRequired: false,
    reminderId: "",
    reminderDueAt: "",
    reminderMessage: "",
    relatedItemIds: [] as string[],
  });
  const focusEntryIdRef = useRef<string | null>(null);
  const entryRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const syncClientIdRef = useRef<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failedPreviewUrls, setFailedPreviewUrls] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ name: "", color: CAT_COLORS[0], parentId: "" });
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const [catSort, setCatSort] = useState<"manual" | "asc" | "desc">("manual");
  const [draggingCatId, setDraggingCatId] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(50);
  const [density, setDensity] = useState<ViewMode>("comfortable");
  const [showTagManager, setShowTagManager] = useState(false);
  const [mergingTag, setMergingTag] = useState<{ from: string[]; to: string } | null>(null);
  const [tagMergeLoading, setTagMergeLoading] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [customCatColors, setCustomCatColors] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [relatedPickerOpen, setRelatedPickerOpen] = useState(false);
  const [relatedPickerSearch, setRelatedPickerSearch] = useState("");
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const restoredDraftKeyRef = useRef<string | null>(null);

  // Persist density preference across reloads
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("sb_density") : null;
    const parsed = parseViewMode(saved);
    if (parsed) setDensity(parsed);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("sb_density", density);
  }, [density]);

  useEffect(() => {
    fetch(`/api/settings?key=${MEMORY_OF_WEEK_ENABLED_KEY}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setMemoryOfWeekEnabled(isMemoryOfWeekEnabled(data?.[MEMORY_OF_WEEK_ENABLED_KEY]));
      })
      .catch(() => {});
  }, []);

  const updateMemoryOfWeekEnabled = async (enabled: boolean) => {
    const previous = memoryOfWeekEnabled;
    setMemoryOfWeekEnabled(enabled);
    setMemoryOfWeekSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: MEMORY_OF_WEEK_ENABLED_KEY, value: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save setting");
      showToast(enabled ? "Memory of the week is on" : "Memory of the week is off", "success");
    } catch {
      setMemoryOfWeekEnabled(previous);
      showToast("Failed to update memory setting", "error");
    } finally {
      setMemoryOfWeekSaving(false);
    }
  };

  // Custom category colors — synced to server via /api/settings, with
  // localStorage acting as an instant cache so the palette renders before
  // the network responds.
  const customColorsLoaded = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 1) Hydrate from cache for instant paint
    try {
      const raw = window.localStorage.getItem("sb_custom_cat_colors");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCustomCatColors(parsed.filter((c): c is string => typeof c === "string"));
      }
    } catch {}
    // 2) Reconcile with server (source of truth)
    fetch("/api/settings?key=custom_cat_colors")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const remote = data?.custom_cat_colors;
        if (Array.isArray(remote)) {
          setCustomCatColors(remote.filter((c: unknown): c is string => typeof c === "string"));
        }
      })
      .catch(() => {})
      .finally(() => { customColorsLoaded.current = true; });
  }, []);

  // Persist which parent categories are collapsed (per-device)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("sb_collapsed_cats");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCollapsedCats(new Set(parsed.filter((c): c is string => typeof c === "string")));
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("sb_collapsed_cats", JSON.stringify(Array.from(collapsedCats)));
  }, [collapsedCats]);

  const toggleCatCollapsed = (id: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sb_custom_cat_colors", JSON.stringify(customCatColors));
    // Don't push to server until the initial load has completed — otherwise
    // we'd overwrite the server's list with whatever the empty/cached state was.
    if (!customColorsLoaded.current) return;
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "custom_cat_colors", value: customCatColors }),
    }).catch(() => {});
  }, [customCatColors]);

  const addCustomCatColor = (hex: string): string => {
    const normalized = hex.toLowerCase();
    if (CAT_COLORS.map(c => c.toLowerCase()).includes(normalized)) return hex;
    setCustomCatColors(prev => prev.map(c => c.toLowerCase()).includes(normalized) ? prev : [...prev, hex]);
    return hex;
  };
  const removeCustomCatColor = (hex: string) => {
    const normalized = hex.toLowerCase();
    setCustomCatColors(prev => prev.filter(c => c.toLowerCase() !== normalized));
  };

  const fetchItems = useCallback(async (query?: string) => {
    try {
      const url = query ? `/api/items?q=${encodeURIComponent(query)}` : "/api/items";
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) setItems(await res.json());
      else showToast("Failed to load items", "error");
    } catch {
      showToast("Failed to load items", "error");
    }
    setLoading(false);
  }, []);

  const fetchRelations = useCallback(async () => {
    try {
      const res = await fetch("/api/item-relations", { cache: "no-store" });
      if (res.ok) setRelations(await res.json());
    } catch {}
  }, []);

  const fetchReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders", { cache: "no-store" });
      if (res.ok) setReminders(await res.json());
    } catch {}
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      if (res.ok) setCategories(await res.json());
      else showToast("Failed to load categories", "error");
    } catch {
      showToast("Failed to load categories", "error");
    }
  }, []);

  const clearRuntimeCaches = useCallback(async () => {
    if (typeof window === "undefined") return;

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith("sb-")).map(key => caches.delete(key)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.update().catch(() => undefined)));
      navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_RUNTIME_CACHES" });
    }
  }, []);

  const reloadForAppUpdate = useCallback(async () => {
    try {
      const res = await fetch(`/api/app-version?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return false;
      const data = await res.json() as { version?: string };
      const serverVersion = typeof data.version === "string" ? data.version : "";
      if (!serverVersion || serverVersion === CLIENT_APP_VERSION) return false;

      showToast("New app version found. Reloading...", "success");
      await clearRuntimeCaches();
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  }, [clearRuntimeCaches]);

  const markPreviewImageFailed = useCallback((src?: string) => {
    if (!src) return;
    setFailedPreviewUrls(prev => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);

  useEffect(() => { fetchItems(); fetchCategories(); fetchRelations(); fetchReminders(); }, [fetchItems, fetchCategories, fetchRelations, fetchReminders]);

  // Live sync across windows (main app + pop-out card windows)
  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    syncClientIdRef.current = getSyncClientId();
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    syncChannelRef.current = ch;
    ch.onmessage = (ev: MessageEvent<SyncMessage>) => {
      const msg = ev.data;
      if (!msg || msg.source === syncClientIdRef.current) return;
        if (msg.type === "item-updated" || msg.type === "item-created") {
          const incoming = msg.item as Item;
        setItems(prev => {
          const idx = prev.findIndex(i => i.id === incoming.id);
          if (idx === -1) return [incoming, ...prev];
          const next = prev.slice();
          next[idx] = incoming;
          return next;
        });
        fetchCategories();
      } else if (msg.type === "item-deleted") {
        setItems(prev => prev.filter(i => i.id !== msg.id));
        fetchRelations();
      } else if (msg.type === "relations-updated") {
        fetchRelations();
      } else if (msg.type === "reminders-updated") {
        fetchReminders();
      }
    };
    return () => { ch.close(); syncChannelRef.current = null; };
  }, [fetchCategories, fetchRelations, fetchReminders]);

  const broadcastSync = useCallback((msg: SyncPayload) => {
    const ch = syncChannelRef.current;
    if (!ch) return;
    ch.postMessage({ ...msg, source: syncClientIdRef.current } as SyncMessage);
  }, []);

  const popOutCard = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    const absoluteUrl = new URL(`/card/${id}`, window.location.origin).toString();

    // Tauri desktop app: open the card in the user's default system browser via
    // the opener plugin. WebView2 multi-window is too unreliable for our use
    // case, and Chrome handles popups (and copy-paste between them) properly.
    const tauriIpc = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
    if (tauriIpc && typeof tauriIpc.invoke === "function") {
      tauriIpc.invoke("plugin:opener|open_url", { url: absoluteUrl, with: null })
        .catch((err: unknown) => {
          console.error("[popOut] opener failed:", err);
          showToast(`Pop-out failed: ${String(err)}`, "error");
        });
      return;
    }

    // Regular browser path — popup window
    const w = 720;
    const h = 900;
    const left = window.screenX + Math.max(0, window.outerWidth - w - 40);
    const top = window.screenY + 40;
    let popup: Window | null = null;
    try {
      popup = window.open(absoluteUrl, `card-${id}`, `popup,width=${w},height=${h},left=${left},top=${top}`);
    } catch {
      popup = null;
    }
    if (popup === null) {
      window.location.href = absoluteUrl;
    }
  }, []);

  const openCardInCurrentTab = useCallback((id: string) => {
    if (typeof window === "undefined") return;
    window.location.href = new URL(`/card/${id}`, window.location.origin).toString();
  }, []);

  // Open the add form when launched via PWA shortcut (?new=1)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setShowAdd(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Auto-refresh when user returns to the tab (e.g. after clipping from extension)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchItems(search.trim() || undefined);
        fetchCategories();
        fetchRelations();
        fetchReminders();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchItems, fetchCategories, fetchRelations, fetchReminders, search]);

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(50); }, [view, catFilter, search, sortBy, sourceFilter, withNotesOnly, favouritesOnly, actionOnly, remindersOnly, reviewMode]);

  // Close modals on Escape, focus search on Cmd/Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (vaultOpen) setVaultOpen(false);
        else if (relatedPickerOpen) { setRelatedPickerOpen(false); setRelatedPickerSearch(""); }
        else if (pickerOpen) { setPickerOpen(false); setPickerSearch(""); }
        else if (showAdd) closeForm();
        else if (showCatManager) setShowCatManager(false);
        else if (showTagManager) { setShowTagManager(false); setMergingTag(null); }
        else if (tagMenuOpen) setTagMenuOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAdd, showCatManager, showTagManager, tagMenuOpen, pickerOpen, relatedPickerOpen, vaultOpen]);

  // Paste image from clipboard while the add/edit modal is open
  useEffect(() => {
    if (!showAdd) return;
    console.log("[paste] listener attached (modal open)");
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      console.log("[paste] event fired", { itemCount: items.length, kinds: items.map(i => `${i.kind}:${i.type}`) });
      const imageFiles: File[] = [];
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            const ext = it.type.split("/")[1] || "png";
            const named = f.name && f.name !== "image.png"
              ? f
              : new File([f], `pasted-${Date.now()}.${ext}`, { type: it.type });
            imageFiles.push(named);
          }
        }
      }
      console.log("[paste] image files extracted:", imageFiles.length);
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFileUpload(imageFiles);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => {
      console.log("[paste] listener removed");
      window.removeEventListener("paste", onPaste);
    };
  }, [showAdd]);

  // Unwrap hard line-wrapped prose: join single newlines inside paragraphs,
  // but preserve blank lines, headers, lists, blockquotes, and code blocks.
  const unwrapPastedText = useCallback((text: string): string => {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const isStructure = (l: string) =>
      /^(\s*[-*+>]\s|\s*\d+[.)]\s|\s*#{1,6}\s|\s{4,}\S|\t)/.test(l) ||
      /^```/.test(l.trim());
    const lines = normalized.split("\n");
    const out: string[] = [];
    let buffer: string[] = [];
    let inFence = false;
    const flush = () => {
      if (buffer.length === 0) return;
      out.push(buffer.map(l => l.trim()).join(" ").trim());
      buffer = [];
    };
    for (const line of lines) {
      if (/^```/.test(line.trim())) {
        flush();
        out.push(line);
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        out.push(line);
      } else if (line.trim() === "") {
        flush();
        out.push("");
      } else if (isStructure(line)) {
        flush();
        out.push(line);
      } else {
        buffer.push(line);
      }
    }
    flush();
    return out.join("\n").replace(/\n{3,}/g, "\n\n");
  }, []);

  const handleSmartPaste = useCallback(
    (field: "content") => (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text || !text.includes("\n")) return;
      const cleaned = unwrapPastedText(text);
      if (cleaned === text) return;
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const newValue = ta.value.slice(0, start) + cleaned + ta.value.slice(end);
      setForm(f => ({ ...f, [field]: newValue }));
      const caret = start + cleaned.length;
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = caret;
      });
    },
    [unwrapPastedText]
  );

  // Manual paste-from-clipboard button (bypasses browser paste-event quirks)
  const pasteFromClipboard = useCallback(async () => {
    try {
      if (!navigator.clipboard?.read) {
        showToast("Clipboard API not available in this browser", "error");
        return;
      }
      const items = await navigator.clipboard.read();
      const imageFiles: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const ext = type.split("/")[1] || "png";
            imageFiles.push(new File([blob], `pasted-${Date.now()}.${ext}`, { type }));
            break;
          }
        }
      }
      if (imageFiles.length === 0) {
        showToast("No image in clipboard", "error");
        return;
      }
      await handleFileUpload(imageFiles);
    } catch (err) {
      console.error("[pasteButton] failed:", err);
      showToast("Clipboard access denied — grant permission or try Ctrl+V", "error");
    }
  }, []);

  // Close tag menu when clicking outside
  useEffect(() => {
    if (!tagMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-tag-menu]")) setTagMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tagMenuOpen]);

  // Close help popover when clicking outside
  useEffect(() => {
    if (!helpOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-help-menu]")) setHelpOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [helpOpen]);

  // Debounced server-side search
  useEffect(() => {
    if (!search.trim()) {
      fetchItems();
      return;
    }
    const timer = setTimeout(() => fetchItems(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search, fetchItems]);

  useEffect(() => {
    if (!showAdd || typeof window === "undefined") return;
    const key = draftStorageKey(editingId);
    const draft = parseDraftPayload<typeof form>(window.localStorage.getItem(key));
    if (!draft || restoredDraftKeyRef.current === key) return;
    restoredDraftKeyRef.current = key;
    setForm(current => ({
      ...current,
      ...draft.form,
      noteEntries: Array.isArray(draft.form.noteEntries) ? draft.form.noteEntries : current.noteEntries,
      checklistItems: Array.isArray(draft.form.checklistItems) ? normalizeChecklistItems(draft.form.checklistItems) : current.checklistItems,
      attachments: Array.isArray(draft.form.attachments) ? draft.form.attachments : current.attachments,
      relatedItemIds: Array.isArray(draft.form.relatedItemIds) ? draft.form.relatedItemIds : current.relatedItemIds,
    }));
    showToast("Restored unsaved draft", "success");
  }, [showAdd, editingId]);

  useEffect(() => {
    if (!showAdd || typeof window === "undefined") return;
    const key = draftStorageKey(editingId);
    const timer = window.setTimeout(() => {
      if (!hasMeaningfulFormContent(form)) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, serializeDraftPayload({ editingId, form }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [showAdd, editingId, form]);

  useEffect(() => {
    if (!showAdd || typeof window === "undefined") return;
    const key = draftStorageKey(editingId);
    const flushDraft = () => {
      if (!hasMeaningfulFormContent(form)) return;
      window.localStorage.setItem(key, serializeDraftPayload({ editingId, form }));
    };
    window.addEventListener("beforeunload", flushDraft);
    return () => window.removeEventListener("beforeunload", flushDraft);
  }, [showAdd, editingId, form]);

  const resetForm = (keepOpen = false) => {
    const lastCategory = form.category;
    const lastType = form.type;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftStorageKey(editingId));
    }
    restoredDraftKeyRef.current = null;
    setForm({ type: lastType, title: "", content: "", url: "", noteEntries: [], checklistItems: [], tags: "", category: lastCategory, attachments: [], favourite: false, actionRequired: false, reminderId: "", reminderDueAt: "", reminderMessage: "", relatedItemIds: [] });
    if (!keepOpen) {
      setShowAdd(false);
    }
    setEditingId(null);
  };

  const closeForm = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftStorageKey(editingId));
    }
    restoredDraftKeyRef.current = null;
    setForm({ type: "note", title: "", content: "", url: "", noteEntries: [], checklistItems: [], tags: "", category: "", attachments: [], favourite: false, actionRequired: false, reminderId: "", reminderDueAt: "", reminderMessage: "", relatedItemIds: [] });
    setShowAdd(false);
    setEditingId(null);
  };

  const addNoteEntry = () => {
    const now = new Date().toISOString();
    const entry: NoteEntry = { id: newEntryId(), body: "", createdAt: now, updatedAt: now };
    focusEntryIdRef.current = entry.id;
    setForm(f => ({ ...f, noteEntries: [...f.noteEntries, entry] }));
  };

  const updateNoteEntry = (id: string, body: string) => {
    const now = new Date().toISOString();
    setForm(f => ({
      ...f,
      noteEntries: f.noteEntries.map(e => e.id === id ? { ...e, body, updatedAt: now } : e),
    }));
  };

  const deleteNoteEntry = (id: string) => {
    setForm(f => ({ ...f, noteEntries: f.noteEntries.filter(e => e.id !== id) }));
  };

  const addChecklistRow = () => {
    setForm(f => ({ ...f, checklistItems: [...f.checklistItems, newChecklistItem()] }));
  };

  const updateChecklistRowText = (id: string, text: string) => {
    setForm(f => ({
      ...f,
      checklistItems: f.checklistItems.map(item => item.id === id ? { ...item, text } : item),
    }));
  };

  const toggleChecklistRow = (id: string) => {
    const now = new Date().toISOString();
    setForm(f => ({
      ...f,
      checklistItems: f.checklistItems.map(item => (
        item.id === id
          ? { ...item, completed: !item.completed, completedAt: item.completed ? null : now }
          : item
      )),
    }));
  };

  const deleteChecklistRow = (id: string) => {
    setForm(f => ({ ...f, checklistItems: f.checklistItems.filter(item => item.id !== id) }));
  };

  useEffect(() => {
    const target = focusEntryIdRef.current;
    if (!target) return;
    const el = entryRefs.current[target];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      focusEntryIdRef.current = null;
    }
  }, [form.noteEntries]);

  const insertFromCard = (item: Item) => {
    const entryBodies = (item.noteEntries || []).map(e => e.body).filter(Boolean);
    const legacy = item.notes ? [item.notes] : [];
    const body = [item.content, ...legacy, ...entryBodies].filter(Boolean).join("\n\n");
    const snippet = item.title ? `${item.title}\n${body}`.trim() : body;
    if (!snippet) { setPickerOpen(false); setPickerSearch(""); return; }
    const el = contentRef.current;
    setForm(f => {
      const current = f.content || "";
      const start = el?.selectionStart ?? current.length;
      const end = el?.selectionEnd ?? current.length;
      const prefix = current.slice(0, start);
      const suffix = current.slice(end);
      const sep = prefix && !prefix.endsWith("\n") ? "\n\n" : "";
      const next = `${prefix}${sep}${snippet}${suffix}`;
      return { ...f, content: next };
    });
    setPickerOpen(false);
    setPickerSearch("");
  };

  const relatedItemsForId = useCallback((itemId: string): RelatedItemSummary[] => {
    return relations
      .filter(rel => rel.itemAId === itemId || rel.itemBId === itemId)
      .map(rel => rel.itemAId === itemId ? rel.itemB : rel.itemA)
      .filter(Boolean);
  }, [relations]);

  const activeReminderForId = useCallback((itemId: string): Reminder | null => {
    const rows = reminders
      .filter(reminder => reminder.itemId === itemId && reminder.status !== "done")
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    return rows[0] || null;
  }, [reminders]);

  const toggleRelatedSelection = (itemId: string) => {
    setForm(f => ({
      ...f,
      relatedItemIds: f.relatedItemIds.includes(itemId)
        ? f.relatedItemIds.filter(id => id !== itemId)
        : [...f.relatedItemIds, itemId],
    }));
  };

  const syncRelatedItems = async (itemId: string, nextIds: string[], previousIds: string[]) => {
    const next = new Set(nextIds.filter(id => id && id !== itemId));
    const previous = new Set(previousIds.filter(id => id && id !== itemId));
    const additions = [...next].filter(id => !previous.has(id));
    const removals = [...previous].filter(id => !next.has(id));

    await Promise.all([
      ...additions.map(targetItemId => fetch("/api/item-relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceItemId: itemId, targetItemId }),
      })),
      ...removals.map(targetItemId => fetch("/api/item-relations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceItemId: itemId, targetItemId }),
      })),
    ]);

    if (additions.length > 0 || removals.length > 0) {
      await fetchRelations();
      broadcastSync({ type: "relations-updated", itemId });
    }
  };

  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: Attachment[] = [];
    try {
      for (const file of Array.from(files)) {
        const uploadFile = await compressImageForUpload(file);
        if (uploadFile.size > 50 * 1024 * 1024) {
          showToast(`${uploadFile.name} exceeds 50 MB`, "error");
          continue;
        }
        const contentType = resolveContentType(uploadFile);
        const body = uploadFile.type === contentType ? uploadFile : new File([uploadFile], uploadFile.name, { type: contentType });
        const blob = await upload(uploadFile.name, body, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        uploaded.push({
          url: blob.url,
          name: uploadFile.name,
          contentType,
          size: uploadFile.size,
        });
      }
      if (uploaded.length > 0) {
        setForm(f => ({ ...f, attachments: [...f.attachments, ...uploaded] }));
        showToast(`Uploaded ${uploaded.length} file${uploaded.length > 1 ? "s" : ""}`, "success");
      }
    } catch (err) {
      showToast((err as Error).message || "Upload failed", "error");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (url: string) => {
    setForm(f => ({ ...f, attachments: f.attachments.filter(a => a.url !== url) }));
  };

  const renameAttachment = (url: string, name: string) => {
    setForm(f => ({
      ...f,
      attachments: f.attachments.map(att => att.url === url ? { ...att, name } : att),
    }));
  };

  // Attach files directly to an existing card (from drag/drop onto the card)
  const attachFilesToItem = async (itemId: string, files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    const target = items.find(i => i.id === itemId);
    if (!target) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of fileArr) {
        const uploadFile = await compressImageForUpload(file);
        if (uploadFile.size > 50 * 1024 * 1024) {
          showToast(`${uploadFile.name} exceeds 50 MB`, "error");
          continue;
        }
        const contentType = resolveContentType(uploadFile);
        const body = uploadFile.type === contentType ? uploadFile : new File([uploadFile], uploadFile.name, { type: contentType });
        const blob = await upload(uploadFile.name, body, {
          access: "public",
          handleUploadUrl: "/api/upload",
        });
        uploaded.push({
          url: blob.url,
          name: uploadFile.name,
          contentType,
          size: uploadFile.size,
        });
      }
      if (uploaded.length === 0) { setUploading(false); return; }
      const nextAttachments = [...(target.attachments || []), ...uploaded];
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, attachments: nextAttachments }),
      });
      if (!res.ok) {
        showToast("Failed to save attachment", "error");
        setUploading(false);
        return;
      }
      const saved = await res.json().catch(() => null);
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, attachments: nextAttachments } : i));
      if (saved && saved.id) broadcastSync({ type: "item-updated", item: saved });
      showToast(`Attached ${uploaded.length} file${uploaded.length > 1 ? "s" : ""}`, "success");
    } catch (err) {
      showToast((err as Error).message || "Upload failed", "error");
    }
    setUploading(false);
  };

  const syncReminder = async (itemId: string) => {
    const reminderId = form.reminderId.trim();
    const dueInput = form.reminderDueAt.trim();
    const message = form.reminderMessage.trim();

    if (!dueInput) {
      if (reminderId) {
        await fetch(`/api/reminders?id=${encodeURIComponent(reminderId)}`, { method: "DELETE" });
        broadcastSync({ type: "reminders-updated", itemId });
      }
      return;
    }

    const dueAt = new Date(dueInput);
    if (Number.isNaN(dueAt.getTime())) {
      showToast("Reminder date is invalid", "error");
      return;
    }

    const payload = { itemId, message, dueAt: dueAt.toISOString(), status: "pending" };
    const res = await fetch("/api/reminders", {
      method: reminderId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reminderId ? { id: reminderId, ...payload } : payload),
    });
    if (!res.ok) {
      showToast("Failed to save reminder", "error");
      return;
    }
    broadcastSync({ type: "reminders-updated", itemId });
  };

  const updateReminderDate = (date: string) => {
    setForm(f => {
      const parts = splitReminderDateTime(f.reminderDueAt);
      return { ...f, reminderDueAt: mergeReminderDateTimeParts(date, parts.time) };
    });
  };

  const updateReminderTime = (time: string) => {
    setForm(f => {
      const parts = splitReminderDateTime(f.reminderDueAt);
      return { ...f, reminderDueAt: mergeReminderDateTimeParts(parts.date, time) };
    });
  };

  const setReminderPreset = (daysFromNow: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    const datePart = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    setForm(f => {
      const parts = splitReminderDateTime(f.reminderDueAt);
      return { ...f, reminderDueAt: mergeReminderDateTimeParts(datePart, parts.time) };
    });
  };

  const handleSave = async (andAddAnother = false) => {
    if (!form.title.trim() && !form.content.trim() && !form.url.trim()) return;
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const noteEntries = form.noteEntries.filter(e => e.body.trim().length > 0);
    const checklistItems = normalizeChecklistItems(form.checklistItems);
    const { relatedItemIds, reminderId, reminderDueAt, reminderMessage, ...itemForm } = form;
    const previousRelatedIds = editingId ? relatedItemsForId(editingId).map(item => item.id) : [];
    // Once entries exist, clear the legacy single-blob field on the server so
    // we don't double-render after the migration on next load.
    const legacyClear = noteEntries.length > 0 && editingId ? { notes: "" } : {};
    const payload = editingId
      ? { id: editingId, ...itemForm, tags, noteEntries, checklistItems, ...legacyClear }
      : { ...itemForm, tags, noteEntries, checklistItems };
    try {
      const res = await fetch(editingId ? "/api/items" : "/api/items", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        showToast("Failed to save item", "error");
        setSaving(false);
        return;
      }
      try {
        const saved = await res.clone().json();
        if (saved && saved.id) {
          await syncRelatedItems(saved.id, relatedItemIds, previousRelatedIds);
          await syncReminder(saved.id);
          broadcastSync({ type: editingId ? "item-updated" : "item-created", item: saved });
        }
      } catch {}
      showToast(editingId ? "Item updated" : "Item saved", "success");
      await fetchItems();
      await fetchReminders();
      if (editingId) {
        await fetchCategories();
        if (andAddAnother) resetForm(true);
        else closeForm();
      } else {
        await fetchCategories();
        resetForm(true);
      }
    } catch {
      showToast("Failed to save item", "error");
    }
    setSaving(false);
  };

  const quickAddTask = async () => {
    const text = quickTaskText.trim();
    if (!text || quickTaskSaving) return;
    setQuickTaskSaving(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "task", title: text, tags: [], category: "" }),
      });
      if (!res.ok) {
        showToast("Failed to add task", "error");
      } else {
        setQuickTaskText("");
        await fetchItems();
      }
    } catch {
      showToast("Failed to add task", "error");
    }
    setQuickTaskSaving(false);
  };

  const quickAddMemory = async () => {
    const text = quickMemoryText.trim();
    if (!text || quickMemorySaving) return;
    setQuickMemorySaving(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "memory", title: text, tags: [], category: "" }),
      });
      if (!res.ok) {
        showToast("Failed to save memory", "error");
      } else {
        setQuickMemoryText("");
        await fetchItems();
      }
    } catch {
      showToast("Failed to save memory", "error");
    }
    setQuickMemorySaving(false);
  };

  const mergeTags = async (from: string[], to: string) => {
    setTagMergeLoading(true);
    try {
      const res = await fetch("/api/tags/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      if (!res.ok) {
        showToast("Merge failed", "error");
        return;
      }
      const data = await res.json();
      showToast(`Merged into #${to} (${data.affected} items)`, "success");
      await fetchItems();
      setMergingTag(null);
    } catch {
      showToast("Merge failed", "error");
    }
    setTagMergeLoading(false);
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/export?format=json");
      if (!res.ok) {
        showToast("Export failed", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `second-brain-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded", "success");
    } catch {
      showToast("Export failed", "error");
    }
  };

  const toggleChecklistItemOnCard = async (item: Item, checklistId: string) => {
    const currentRows = item.checklistItems || [];
    const now = new Date().toISOString();
    const checklistItems = currentRows.map(row => (
      row.id === checklistId
        ? { ...row, completed: !row.completed, completedAt: row.completed ? null : now }
        : row
    ));

    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, checklistItems }),
      });
      if (!res.ok) {
        showToast("Failed to update checklist item", "error");
        return;
      }
      const saved: Item = await res.json();
      setItems(prev => prev.map(existing => existing.id === saved.id ? saved : existing));
      broadcastSync({ type: "item-updated", item: saved });
    } catch {
      showToast("Failed to update checklist item", "error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    try {
      const res = await fetch(`/api/items?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Failed to delete item", "error");
        return;
      }
      setItems(prev => prev.filter(i => i.id !== id));
      setReminders(prev => prev.filter(r => r.itemId !== id));
      if (expandedId === id) setExpandedId(null);
      await fetchRelations();
      broadcastSync({ type: "item-deleted", id });
    } catch {
      showToast("Failed to delete item", "error");
    }
  };

  const handlePin = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned: !item.pinned }),
      });
      if (!res.ok) {
        showToast("Failed to update pin", "error");
        return;
      }
      try {
        const saved = await res.clone().json();
        if (saved && saved.id) broadcastSync({ type: "item-updated", item: saved });
      } catch {}
      setItems(prev => prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i));
    } catch {
      showToast("Failed to update pin", "error");
    }
  };

  const handleToggleFlag = async (id: string, flag: "favourite" | "actionRequired") => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const next = !item[flag];
    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [flag]: next }),
      });
      if (!res.ok) {
        showToast("Failed to update", "error");
        return;
      }
      try {
        const saved = await res.clone().json();
        if (saved && saved.id) broadcastSync({ type: "item-updated", item: saved });
      } catch {}
      setItems(prev => prev.map(i => i.id === id ? { ...i, [flag]: next } : i));
    } catch {
      showToast("Failed to update", "error");
    }
  };

  const handleSummarize = async (id: string) => {
    setSummarizing(id);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
        showToast("Summary added", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Summarization failed", "error");
      }
    } catch {
      showToast("Summarization failed", "error");
    }
    setSummarizing(null);
  };

  const handleEdit = (item: Item) => {
    let entries = Array.isArray(item.noteEntries) ? item.noteEntries : [];
    if (entries.length === 0 && item.notes && item.notes.trim()) {
      const stamp = item.createdAt || new Date().toISOString();
      entries = [{ id: newEntryId(), body: item.notes, createdAt: stamp, updatedAt: stamp }];
    }
    const reminder = activeReminderForId(item.id);
    setForm({
      type: item.type,
      title: item.title,
      content: item.content || "",
      url: item.url || "",
      noteEntries: entries,
      checklistItems: item.checklistItems || [],
      tags: (item.tags || []).join(", "),
      category: item.category || "",
      attachments: item.attachments || [],
      favourite: !!item.favourite,
      actionRequired: !!item.actionRequired,
      reminderId: reminder?.id || "",
      reminderDueAt: toDateTimeLocal(reminder?.dueAt),
      reminderMessage: reminder?.message || "",
      relatedItemIds: relatedItemsForId(item.id).map(related => related.id),
    });
    setEditingId(item.id);
    restoredDraftKeyRef.current = null;
    setShowAdd(true);
  };

  const handleAddCategory = async () => {
    if (!newCat.name.trim()) return;
    setCatLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCat.name, color: newCat.color, parentId: newCat.parentId || null }),
      });
      if (!res.ok) {
        showToast("Failed to add category", "error");
      } else {
        const created: Category = await res.json();
        setCategories(prev => [...prev, created].sort(sortByPosition));
        setNewCat({ name: "", color: CAT_COLORS[0], parentId: "" });
        showToast("Category created", "success");
      }
    } catch {
      showToast("Failed to add category", "error");
    }
    setCatLoading(false);
  };

  const handleEditCategory = async () => {
    if (!editingCat) return;
    setCatLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCat.id, name: editingCat.name, color: editingCat.color, parentId: editingCat.parentId }),
      });
      if (!res.ok) {
        showToast("Failed to update category", "error");
      } else {
        const updated: Category = await res.json();
        setCategories(prev => prev.map(c => c.id === updated.id ? updated : c).sort(sortByPosition));
        setEditingCat(null);
        await fetchItems();
      }
    } catch {
      showToast("Failed to update category", "error");
    }
    setCatLoading(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Delete this category? Items in this category will be uncategorized.")) return;
    setCatLoading(true);
    try {
      const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Failed to delete category", "error");
      } else {
        setCategories(prev => prev.filter(c => c.id !== id && c.parentId !== id));
        if (editingCat?.id === id) setEditingCat(null);
        await fetchItems();
      }
    } catch {
      showToast("Failed to delete category", "error");
    }
    setCatLoading(false);
  };

  // Sort by position (manual order from server) then name as tiebreak
  const sortByPosition = (a: Category, b: Category) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name);

  // Reorder a category within its parent group via drag-and-drop. Persists to server.
  const reorderCategory = async (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const dragged = categories.find(c => c.id === draggedId);
    const target = categories.find(c => c.id === targetId);
    if (!dragged || !target || dragged.parentId !== target.parentId) return;

    const siblings = categories
      .filter(c => c.parentId === dragged.parentId)
      .sort(sortByPosition);
    const without = siblings.filter(c => c.id !== draggedId);
    const targetIdx = without.findIndex(c => c.id === targetId);
    const reordered = [
      ...without.slice(0, targetIdx),
      dragged,
      ...without.slice(targetIdx),
    ];
    const orders = reordered.map((c, i) => ({ id: c.id, position: i }));

    setCategories(prev => prev.map(c => {
      const o = orders.find(x => x.id === c.id);
      return o ? { ...c, position: o.position } : c;
    }));

    try {
      await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders }),
      });
    } catch {
      showToast("Failed to save order", "error");
    }
  };

  // Helper: get parent categories (no parent)
  const allParentCats = categories.filter(c => !c.parentId).sort(sortByPosition);
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId).sort(sortByPosition);
  // Get all category names under a parent (for filtering)
  const getCatNamesUnderParent = (name: string) => {
    const parent = categories.find(c => c.name === name && !c.parentId);
    if (!parent) return [name];
    return [name, ...getChildren(parent.id).map(c => c.name)];
  };

  // Hide categories with zero items from the filter bar (they remain in the DB
  // and reappear automatically when an item is assigned to them again).
  const usedCatNames = new Set(items.map(i => i.category).filter(Boolean));
  const parentCats = allParentCats.filter(cat => {
    if (usedCatNames.has(cat.name)) return true;
    return getChildren(cat.id).some(sub => usedCatNames.has(sub.name));
  });

  // Text search is now server-side; client filters only type + category + source
  const filtered = items
    .filter(i => view === "all" || i.type === view)
    .filter(i => {
      if (catFilter === "all") return true;
      const matchNames = getCatNamesUnderParent(catFilter);
      return matchNames.includes(i.category);
    })
    .filter(i => {
      if (!sourceFilter) return true;
      return sourceFromUrl(i.url)?.key === sourceFilter;
    })
    .filter(i => {
      if (!withNotesOnly) return true;
      const hasLegacy = (i.notes?.trim().length ?? 0) > 0;
      const hasEntry = (i.noteEntries || []).some(e => e.body?.trim().length > 0);
      return hasLegacy || hasEntry;
    })
    .filter(i => !favouritesOnly || !!i.favourite)
    .filter(i => !actionOnly || !!i.actionRequired)
    .filter(i => !remindersOnly || reminders.some(r => r.itemId === i.id && r.status === "pending"))
    .filter(i => {
      if (!reviewMode) return true;
      const noCategory = !i.category?.trim();
      const noTags = (i.tags?.length ?? 0) === 0;
      const shortTitle = (i.title?.trim().length ?? 0) < 10;
      const staleTask = i.type === "task" && Date.now() - new Date(i.createdAt).getTime() > 30 * 86400000;
      return noCategory || noTags || shortTitle || staleTask;
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      if (a.type === "task" && b.type === "task" && !!a.completed !== !!b.completed) {
        return a.completed ? 1 : -1;
      }
      const da = new Date(a.createdAt).getTime();
      const db2 = new Date(b.createdAt).getTime();
      return sortBy === "newest" ? db2 - da : da - db2;
    });

  // Reset pagination when filters change
  const visibleItems = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const allTags = [...new Set(items.flatMap(i => i.tags || []))];
  const withNotesCount = items.filter(i => {
    const hasLegacy = (i.notes?.trim().length ?? 0) > 0;
    const hasEntry = (i.noteEntries || []).some(e => e.body?.trim().length > 0);
    return hasLegacy || hasEntry;
  }).length;
  const favouriteCount = items.filter(i => i.favourite).length;
  const actionCount = items.filter(i => i.actionRequired).length;
  const reminderCount = reminders.filter(r => r.status === "pending").length;
  const reviewCount = items.filter(i => {
    const noCategory = !i.category?.trim();
    const noTags = (i.tags?.length ?? 0) === 0;
    const shortTitle = (i.title?.trim().length ?? 0) < 10;
    const staleTask = i.type === "task" && Date.now() - new Date(i.createdAt).getTime() > 30 * 86400000;
    return noCategory || noTags || shortTitle || staleTask;
  }).length;

  const tagCounts = (() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags || []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  })();
  const tagColor = (tag: string) => TAG_COLORS[allTags.indexOf(tag) % TAG_COLORS.length] || TAG_COLORS[0];

  // Group tags by normalized form — catches #ai/#AI/#a.i. etc. Returns only groups with 2+ variants.
  const duplicateGroups = (() => {
    const groups = new Map<string, string[]>();
    for (const tag of allTags) {
      const normalized = tag.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!normalized) continue;
      const list = groups.get(normalized) || [];
      list.push(tag);
      groups.set(normalized, list);
    }
    return Array.from(groups.values())
      .filter(v => v.length > 1)
      .sort((a, b) => (tagCounts.get(b[0]) ?? 0) - (tagCounts.get(a[0]) ?? 0));
  })();

  const tagsByCount = [...allTags].sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0));
  const INLINE_TAG_LIMIT = 8;
  const inlineTags = (() => {
    const top = tagsByCount.slice(0, INLINE_TAG_LIMIT);
    if (search && allTags.includes(search) && !top.includes(search)) {
      return [search, ...top.slice(0, INLINE_TAG_LIMIT - 1)];
    }
    return top;
  })();
  const menuTags = tagMenuSearch.trim()
    ? tagsByCount.filter(t => t.toLowerCase().includes(tagMenuSearch.toLowerCase()))
    : tagsByCount;

  const sourceCounts = (() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const item of items) {
      const src = sourceFromUrl(item.url);
      if (!src) continue;
      const existing = counts.get(src.key);
      if (existing) existing.count += 1;
      else counts.set(src.key, { label: src.label, count: 1 });
    }
    return Array.from(counts.entries())
      .map(([key, v]) => ({ key, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count);
  })();
  const counts: Record<string, number> = {
    all: items.length,
    ...Object.fromEntries(Object.keys(TYPES).map(k => [
      k,
      k === "task"
        ? items.filter(i => i.type === k && !i.completed).length
        : items.filter(i => i.type === k).length,
    ])),
  };

  const getCatColor = (name: string) => categories.find(c => c.name === name)?.color || "#666";

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="px-5 pt-5 pb-4">
          <div className="skeleton h-7 w-40 mb-2" />
          <div className="skeleton h-3 w-24 mb-5" />
          <div className="skeleton h-10 w-full mb-3" />
          <div className="flex gap-1.5 mb-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton h-8 w-16 rounded-lg" />)}
          </div>
        </div>
        <div className="px-4 space-y-2.5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="skeleton rounded-xl p-4" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="flex gap-3">
                <div className="skeleton w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative pb-8">
      {/* Header */}
      <div className="sticky top-0 z-50 px-3 sm:px-5 pt-4 sm:pt-5 pb-0 border-b border-brand-border" style={{ background: "linear-gradient(180deg, #13161B 0%, #0D0F12 100%)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold whitespace-nowrap" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#E8A838" }}>
              ◆ Second Brain
            </h1>
            <p className="text-[11px] text-gray-600 font-mono mt-0.5">
              {items.length} items · synced
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 justify-start sm:justify-end flex-wrap">
            <div className="relative" data-help-menu>
              <button
                onClick={() => setHelpOpen(v => !v)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
                aria-label="Show Telegram bot commands"
                aria-expanded={helpOpen}
                title="Telegram commands"
              >✈</button>
              {helpOpen && (
                <div
                  data-help-menu
                  className="fixed left-4 right-4 top-[68px] z-50 rounded-xl border border-brand-border bg-[#0D0F12] p-4 shadow-2xl text-left sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[360px]"
                >
                  <div className="text-xs font-mono text-gray-400 mb-2 flex items-center justify-between">
                    <span>Telegram: <a href="https://t.me/philsbrain_bot" target="_blank" rel="noreferrer" className="text-[#5B8DEF] hover:underline">@philsbrain_bot</a></span>
                    <button
                      onClick={() => setHelpOpen(false)}
                      className="text-gray-600 hover:text-gray-300 text-xs"
                      aria-label="Close help"
                    >×</button>
                  </div>
                  <div className="space-y-2 text-[11px] font-mono">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[#5B8DEF] shrink-0 w-24">URL</span>
                      <span className="text-gray-400">→ ◈ Link (auto-tagged)</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[#BB6BD9] shrink-0 w-24">plain text</span>
                      <span className="text-gray-400">→ ◉ Thought</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[#56CCF2] shrink-0 w-24">/t &lt;text&gt;</span>
                      <span className="text-gray-400">→ ☐ Task</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[#F2C94C] shrink-0 w-24">/m &lt;text&gt;</span>
                      <span className="text-gray-400">→ 💡 Memory</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[#6FCF97] shrink-0 w-24">forward msg</span>
                      <span className="text-gray-400">→ captures content</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600 font-mono mt-3 pt-3 border-t border-brand-border">
                    Long-press any message in any chat, tap Forward, pick the bot.
                  </p>
                  <div className="mt-3 pt-3 border-t border-brand-border">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-gray-300">Memory of the week</p>
                        <p className="text-[10px] font-mono text-gray-600">
                          {memoryOfWeekEnabled ? "Telegram reminder is on" : "Telegram reminder is off"}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={memoryOfWeekEnabled}
                        aria-label={memoryOfWeekEnabled ? "Turn off Memory of the week" : "Turn on Memory of the week"}
                        disabled={memoryOfWeekSaving}
                        onClick={() => updateMemoryOfWeekEnabled(!memoryOfWeekEnabled)}
                        className="relative h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-60"
                        style={{
                          borderColor: memoryOfWeekEnabled ? "#F2C94C80" : "#333842",
                          background: memoryOfWeekEnabled ? "#F2C94C28" : "#181B21",
                        }}
                      >
                        <span
                          className="absolute top-1 h-5 w-5 rounded-full transition-all"
                          style={{
                            left: memoryOfWeekEnabled ? "22px" : "4px",
                            background: memoryOfWeekEnabled ? "#F2C94C" : "#5B616D",
                            boxShadow: memoryOfWeekEnabled ? "0 0 12px rgba(242, 201, 76, 0.35)" : "none",
                          }}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setVaultOpen(true)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-[#E8A838] hover:border-[#E8A83860] active:scale-95 transition"
              aria-label="Open encrypted vault"
              title="Encrypted vault"
            >▣</button>
            <button
              onClick={() => setDensity(nextViewMode)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
              aria-label={`Switch to ${viewModeLabel(nextViewMode(density))} view`}
              title={`${viewModeLabel(density)} view`}
            >{viewModeIcon(density)}</button>
            <button
              onClick={async () => {
                if (isRefreshing) return;
                setIsRefreshing(true);
                try {
                  const reloading = await reloadForAppUpdate();
                  if (reloading) return;
                  await Promise.all([fetchItems(search.trim() || undefined), fetchCategories(), fetchRelations(), fetchReminders()]);
                  showToast("Refreshed", "success");
                } finally {
                  setIsRefreshing(false);
                }
              }}
              disabled={isRefreshing}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition disabled:opacity-60"
              aria-label="Refresh app and items"
              title="Refresh app and items"
            >
              <span style={{ display: "inline-block", animation: isRefreshing ? "spin 0.8s linear infinite" : undefined }}>↻</span>
            </button>
            <button
              onClick={() => setShowCatManager(true)}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
              aria-label="Manage categories"
            >⊞</button>
            <button
              onClick={handleExport}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
              aria-label="Download JSON backup"
              title="Download backup (JSON)"
            >↓</button>
            <button
              onClick={() => { closeForm(); setShowAdd(true); }}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-white text-xl flex items-center justify-center font-light transition-transform hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)", boxShadow: "0 4px 16px rgba(232,168,56,0.35)" }}
              aria-label="Add new item"
            >+</button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            ref={searchInputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes, clips, thoughts… (Ctrl+K)"
            aria-label="Search items"
            className="w-full py-2.5 pl-9 pr-3 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">⌕</span>
        </div>

        {/* Type filters */}
        <div className="flex flex-wrap gap-1.5 pb-1.5">
          {[{ key: "all" as const, label: "All", icon: "◇", color: "#E8A838" }, ...Object.entries(TYPES).map(([k, v]) => ({ key: k as "all" | ItemType, label: v.label, icon: v.icon, color: v.color }))].map(tab => {
            const isTask = tab.key === "task";
            const hasOpenTasks = isTask && counts.task > 0;
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setView(tab.key); if (tab.key === "all") setCatFilter("all"); }}
                className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 flex items-center gap-1.5"
                style={{
                  border: `1px solid ${tab.color}${active ? "70" : "25"}`,
                  background: active ? `${tab.color}18` : "transparent",
                  color: active ? tab.color : `${tab.color}A0`,
                }}
              >
                <span>{tab.icon} {tab.label}</span>
                {hasOpenTasks ? (
                  <span
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold text-white"
                    style={{ background: "#56CCF2" }}
                  >{counts.task}</span>
                ) : (
                  <span className="opacity-60 text-[10px]">{counts[tab.key]}</span>
                )}
              </button>
            );
          })}
          {withNotesCount > 0 && (
            <button
              onClick={() => setWithNotesOnly(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 ml-1"
              style={{
                border: withNotesOnly ? "1px solid #6FCF9770" : "1px solid #6FCF9725",
                background: withNotesOnly ? "#6FCF9720" : "transparent",
                color: withNotesOnly ? "#6FCF97" : "#6FCF9780",
              }}
              title="Show only items with notes attached"
            >
              ✎ With notes <span className="opacity-50 text-[10px]">{withNotesCount}</span>
            </button>
          )}
          {favouriteCount > 0 && (
            <button
              onClick={() => setFavouritesOnly(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 ml-1"
              style={{
                border: favouritesOnly ? "1px solid #F2C94C90" : "1px solid #F2C94C30",
                background: favouritesOnly ? "#F2C94C25" : "transparent",
                color: favouritesOnly ? "#F2C94C" : "#F2C94C90",
              }}
              title="Show only favourites"
            >
              ★ Favourites <span className="opacity-50 text-[10px]">{favouriteCount}</span>
            </button>
          )}
          {actionCount > 0 && (
            <button
              onClick={() => setActionOnly(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 ml-1"
              style={{
                border: actionOnly ? "1px solid #EB575790" : "1px solid #EB575730",
                background: actionOnly ? "#EB575725" : "transparent",
                color: actionOnly ? "#EB5757" : "#EB575790",
              }}
              title="Show only items needing action"
            >
              ⚡ Needs action <span className="opacity-50 text-[10px]">{actionCount}</span>
            </button>
          )}
          {reminderCount > 0 && (
            <button
              onClick={() => setRemindersOnly(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 ml-1"
              style={{
                border: remindersOnly ? "1px solid #56CCF290" : "1px solid #56CCF230",
                background: remindersOnly ? "#56CCF225" : "transparent",
                color: remindersOnly ? "#56CCF2" : "#56CCF290",
              }}
              title="Show cards with pending reminders"
            >
              ⏰ Reminders <span className="opacity-50 text-[10px]">{reminderCount}</span>
            </button>
          )}
          {reviewCount > 0 && (
            <button
              onClick={() => setReviewMode(v => !v)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 ml-1"
              style={{
                border: reviewMode ? "1px solid #EB575770" : "1px solid #EB575725",
                background: reviewMode ? "#EB575720" : "transparent",
                color: reviewMode ? "#EB5757" : "#EB575780",
              }}
              title="Items needing attention: no category, no tags, short title, or stale tasks"
            >
              ⚑ Review <span className="opacity-50 text-[10px]">{reviewCount}</span>
            </button>
          )}
          {(() => {
            const activeFilters = [
              view !== "all",
              catFilter !== "all",
              sourceFilter !== null,
              withNotesOnly,
              favouritesOnly,
              actionOnly,
              remindersOnly,
              reviewMode,
              search.trim().length > 0,
            ].filter(Boolean).length;
            const hasActive = activeFilters > 0;
            return (
              <button
                onClick={() => {
                  if (!hasActive) return;
                  setView("all");
                  setCatFilter("all");
                  setSourceFilter(null);
                  setWithNotesOnly(false);
                  setFavouritesOnly(false);
                  setActionOnly(false);
                  setRemindersOnly(false);
                  setReviewMode(false);
                  setSearch("");
                }}
                disabled={!hasActive}
                className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all shrink-0 ml-1 flex items-center gap-1.5 disabled:cursor-not-allowed"
                style={{
                  border: hasActive ? "1px solid #ffffff35" : "1px solid #ffffff15",
                  background: hasActive ? "#ffffff10" : "transparent",
                  color: hasActive ? "#ddd" : "#555",
                }}
                title={hasActive ? "Clear all active filters and search" : "No active filters"}
              >
                × Clear filters {hasActive && <span className="opacity-60 text-[10px]">{activeFilters}</span>}
              </button>
            );
          })()}
        </div>

        {/* Category filters — hierarchical */}
        {categories.length > 0 && (
          <div className="flex flex-col gap-1 pb-3 pt-1.5">
            <div className="flex gap-1 items-center overflow-x-auto scroll-fade">
              {catFilter !== "all" ? (
                <button
                  onClick={() => { setCatFilter("all"); setView("all"); }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-mono transition flex items-center gap-1 shrink-0"
                  style={{ border: "1px solid #E8A83850", background: "#E8A83815", color: "#E8A838" }}
                >← All</button>
              ) : (
                <button
                  onClick={() => setCatFilter("all")}
                  className="px-2.5 py-1 rounded-md text-[11px] font-mono transition shrink-0"
                  style={{ border: "1px solid #ffffff30", background: "#ffffff10", color: "#fff" }}
                >All</button>
              )}
              {parentCats.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCatFilter(catFilter === cat.name ? "all" : cat.name)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-mono transition whitespace-nowrap shrink-0"
                  style={{
                    border: `1px solid ${cat.color}${catFilter === cat.name ? "60" : "40"}`,
                    background: catFilter === cat.name ? `${cat.color}20` : `${cat.color}10`,
                    color: cat.color,
                  }}
                >{cat.name}</button>
              ))}
            </div>
            {/* Subcategories row — shows when parent is selected */}
            {catFilter !== "all" && (() => {
              const parent = categories.find(c => c.name === catFilter && !c.parentId);
              const subs = parent ? getChildren(parent.id).filter(s => usedCatNames.has(s.name)) : [];
              return subs.length > 0 ? (
                <div className="flex gap-1 items-center overflow-x-auto scroll-fade pl-4">
                  {subs.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setCatFilter(sub.name)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono transition whitespace-nowrap shrink-0"
                      style={{
                        border: catFilter === sub.name ? `1px solid ${sub.color}50` : `1px solid ${sub.color}20`,
                        background: catFilter === sub.name ? `${sub.color}15` : "transparent",
                        color: catFilter === sub.name ? sub.color : "#555",
                      }}
                    >↳ {sub.name}</button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        )}
      </div>

      {/* Sources (filter by site) */}
      {sourceCounts.length > 0 && (
        <div className="flex gap-1.5 px-5 pt-2.5 overflow-x-auto scroll-fade">
          {[...sourceCounts]
            .sort((a, b) => {
              const aActive = sourceFilter === a.key ? 1 : 0;
              const bActive = sourceFilter === b.key ? 1 : 0;
              return bActive - aActive;
            })
            .map(src => {
              const active = sourceFilter === src.key;
              return (
                <button
                  key={src.key}
                  onClick={() => setSourceFilter(active ? null : src.key)}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap shrink-0"
                  style={{
                    border: `1px solid ${active ? "#E8A83870" : "#44444460"}`,
                    background: active ? "#E8A83820" : "transparent",
                    color: active ? "#E8A838" : "#aaa",
                  }}
                >
                  {src.label} <span className="opacity-50">{src.count}</span>
                </button>
              );
            })}
        </div>
      )}

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="relative px-5 py-2.5" data-tag-menu>
          <div className="flex gap-1.5 items-center flex-wrap">
            {inlineTags.map(tag => {
              const color = tagColor(tag);
              const active = search === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setSearch(active ? "" : tag)}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap"
                  style={{
                    border: `1px solid ${color}30`,
                    background: active ? `${color}20` : "transparent",
                    color,
                  }}
                >#{tag}</button>
              );
            })}
            {tagsByCount.length > INLINE_TAG_LIMIT && (
              <button
                onClick={() => setTagMenuOpen(v => !v)}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500"
                aria-expanded={tagMenuOpen}
              >
                + {tagsByCount.length - INLINE_TAG_LIMIT} more {tagMenuOpen ? "▴" : "▾"}
              </button>
            )}
          </div>

          {tagMenuOpen && (
            <div
              data-tag-menu
              className="absolute top-full left-5 right-5 z-40 mt-1 rounded-xl border border-brand-border bg-[#0D0F12] p-3 shadow-2xl max-w-2xl"
            >
              <input
                type="text"
                autoFocus
                value={tagMenuSearch}
                onChange={e => setTagMenuSearch(e.target.value)}
                placeholder="Search tags…"
                className="w-full mb-2 px-3 py-2 rounded-lg bg-[#13161B] border border-brand-border text-sm text-gray-200 outline-none focus:border-gray-500"
              />
              <div className="max-h-64 overflow-y-auto no-scrollbar">
                {menuTags.length === 0 ? (
                  <div className="text-gray-500 text-xs p-4 text-center">No tags match &ldquo;{tagMenuSearch}&rdquo;</div>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {menuTags.map(tag => {
                      const color = tagColor(tag);
                      const active = search === tag;
                      return (
                        <button
                          key={tag}
                          onClick={() => {
                            setSearch(active ? "" : tag);
                            setTagMenuOpen(false);
                            setTagMenuSearch("");
                          }}
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap"
                          style={{
                            border: `1px solid ${color}30`,
                            background: active ? `${color}20` : "transparent",
                            color,
                          }}
                        >
                          #{tag} <span className="opacity-50">{tagCounts.get(tag) ?? 0}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-brand-border flex items-center justify-between">
                <span className="text-[10px] text-gray-600 font-mono">
                  {duplicateGroups.length > 0
                    ? `${duplicateGroups.length} duplicate group${duplicateGroups.length > 1 ? "s" : ""} found`
                    : "No duplicates"}
                </span>
                <button
                  onClick={() => { setTagMenuOpen(false); setShowTagManager(true); }}
                  className="text-[11px] font-mono text-gray-400 hover:text-[#E8A838] transition"
                >
                  Manage tags →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick-add task input (on Task view) */}
      {view === "task" && (
        <div className="px-4 pt-2 pb-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={quickTaskText}
              onChange={e => setQuickTaskText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") quickAddTask(); }}
              placeholder="Add a task…"
              className="flex-1 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm text-gray-200 outline-none placeholder:text-gray-500 focus:border-gray-500"
            />
            <VoiceButton
              onTranscript={t => setQuickTaskText(prev => (prev ? prev + " " : "") + t)}
              disabled={quickTaskSaving}
            />
            <button
              onClick={quickAddTask}
              disabled={!quickTaskText.trim() || quickTaskSaving}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 active:scale-95 transition"
              style={{ background: "linear-gradient(135deg, #56CCF2, #2D9CDB)" }}
            >
              {quickTaskSaving ? "…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Quick-add memory input (on Memory view) */}
      {view === "memory" && (
        <div className="px-4 pt-2 pb-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={quickMemoryText}
              onChange={e => setQuickMemoryText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") quickAddMemory(); }}
              placeholder="Remember something…"
              className="flex-1 px-3 py-2 rounded-lg bg-brand-muted border border-brand-border text-sm text-gray-200 outline-none placeholder:text-gray-500 focus:border-gray-500"
            />
            <VoiceButton
              onTranscript={t => setQuickMemoryText(prev => (prev ? prev + " " : "") + t)}
              disabled={quickMemorySaving}
            />
            <button
              onClick={quickAddMemory}
              disabled={!quickMemoryText.trim() || quickMemorySaving}
              className="px-4 py-2 rounded-lg text-[#13161B] text-sm font-medium disabled:opacity-50 active:scale-95 transition"
              style={{ background: "linear-gradient(135deg, #F2C94C, #F2994A)" }}
            >
              {quickMemorySaving ? "…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Sort */}
      <div className="flex justify-end px-5 py-1">
        <button onClick={() => setSortBy(s => s === "newest" ? "oldest" : "newest")} className="text-[11px] text-gray-600 font-mono">
          ↕ {sortBy === "newest" ? "Newest" : "Oldest"}
        </button>
      </div>

      {/* Items */}
      <div className={`px-4 ${density === "compact" ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2" : density === "list" ? "flex flex-col gap-1.5" : ""}`}>
        {filtered.length === 0 && (
          <div className={`text-center py-16 text-gray-700 ${density === "compact" ? "col-span-full" : ""}`}>
            <div className="text-4xl mb-3">◇</div>
            {items.length === 0 ? (
              <>
                <p className="text-sm font-mono text-gray-500">Your second brain is empty</p>
                <p className="text-xs mt-1.5 text-gray-600">Save notes, links, clips & thoughts</p>
                <button
                  onClick={() => { closeForm(); setShowAdd(true); }}
                  className="mt-4 px-5 py-2 rounded-xl text-white text-sm font-medium"
                  style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)" }}
                >+ Add your first item</button>
              </>
            ) : catFilter !== "all" ? (
              <>
                <p className="text-sm font-mono text-gray-500">No items in this category</p>
                <p className="text-xs mt-1.5 text-gray-600">Try a different category or add an item</p>
              </>
            ) : (
              <>
                <p className="text-sm font-mono text-gray-500">No matches</p>
                <p className="text-xs mt-1.5 text-gray-600">Try a different search term</p>
              </>
            )}
          </div>
        )}

        {visibleItems.map((item, idx) => {
          const t = TYPES[item.type] || TYPES.note;
          const itemIcon = item.type === "task" && item.completed ? "☑" : t.icon;
          const expanded = expandedId === item.id;
          const checklistItems = item.checklistItems || [];
          const checklist = expanded ? checklistItems : checklistItems.slice(0, 3);
          const taskProgress = checklistProgress(checklistItems);
          const hasChecklist = item.type === "task" && checklistItems.length > 0;
          const firstImageAttachment = (item.attachments || []).find(a => a.contentType?.startsWith("image/") && !failedPreviewUrls.has(a.url));
          const hasOgPreview = !!(item.ogImage && !failedPreviewUrls.has(item.ogImage) && (item.type === "link" || item.type === "clip"));
          const hasAttachmentPreview = !hasOgPreview && !!firstImageAttachment;
          const hasPreview = hasOgPreview || hasAttachmentPreview;
          const previewImageSrc = hasOgPreview ? item.ogImage : firstImageAttachment?.url;
          const previewLinkUrl = hasOgPreview ? item.url : firstImageAttachment?.url;
          const displayedAttachments = hasAttachmentPreview
            ? (item.attachments || []).filter(a => a.url !== firstImageAttachment?.url)
            : (item.attachments || []);
          const isYouTube = item.siteName === "YouTube";
          const isCompact = density === "compact" && !expanded;
          const isList = density === "list" && !expanded;
          const compactCardClass = isCompact ? "aspect-square flex flex-col" : "";
          const compactPreviewClass = "relative block w-full aspect-[5/4] bg-brand-muted overflow-hidden group shrink-0";
          const compactBodyClass = isCompact ? "flex flex-1 flex-col justify-between min-h-0 px-3 py-2.5" : isList ? "px-3 py-2.5" : "p-4";
          const compactTitleClass = isCompact ? "text-[13px] line-clamp-2" : isList ? "text-[13px]" : "text-sm";
          const relatedItems = relatedItemsForId(item.id);
          const reminder = activeReminderForId(item.id);

          const isDragTarget = dragOverCardId === item.id;
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setExpandedId(expanded ? null : item.id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(expanded ? null : item.id); } }}
              onDragEnter={e => {
                const types = Array.from(e.dataTransfer?.types || []);
                if (!types.some(t => t === "Files" || t === "application/x-moz-file")) return;
                setDragOverCardId(item.id);
              }}
              onDragOver={e => {
                const types = Array.from(e.dataTransfer?.types || []);
                if (!types.some(t => t === "Files" || t === "application/x-moz-file")) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={e => {
                const related = e.relatedTarget as Node | null;
                if (related && e.currentTarget.contains(related)) return;
                setDragOverCardId(prev => prev === item.id ? null : prev);
              }}
              onDrop={e => {
                if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
                e.preventDefault();
                e.stopPropagation();
                setDragOverCardId(null);
                attachFilesToItem(item.id, e.dataTransfer.files);
              }}
              className={`bg-brand-card ${isList ? "rounded-lg" : "rounded-xl"} ${compactCardClass} ${density === "compact" ? "" : density === "list" ? "" : "mb-2.5"} cursor-pointer transition-all overflow-hidden relative group`}
              style={{
                border: `1px solid ${isDragTarget ? "#E8A838" : item.pinned ? "#E8A83850" : item.type === "task" && item.completed ? "#56CCF240" : "#1E2128"}`,
                background: isDragTarget ? "#E8A83820" : item.pinned ? "#E8A83808" : item.type === "task" && item.completed ? "#56CCF208" : undefined,
                animation: `fadeSlide 0.3s ease ${idx * 0.03}s both`,
                boxShadow: isDragTarget ? "0 0 0 2px #E8A83840" : undefined,
                opacity: item.type === "task" && item.completed ? 0.88 : 1,
              }}
            >
              {/* Quick action overlay (edit + delete) — both density modes */}
              <div className="absolute top-1.5 right-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                <button
                  onClick={e => { e.stopPropagation(); handleEdit(item); }}
                  className="w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-[#E8A838] hover:bg-[#E8A83820] active:scale-90 transition flex items-center justify-center text-[11px]"
                  aria-label="Edit item"
                  title="Edit"
                >✎</button>
                <button
                  onClick={e => { e.stopPropagation(); popOutCard(item.id); }}
                  className="w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-[#5B8DEF] hover:bg-[#5B8DEF20] active:scale-90 transition flex items-center justify-center text-[11px]"
                  aria-label="Pop out in new window"
                  title="Pop out"
                >⇱</button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                  className="w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm text-gray-400 hover:text-red-400 hover:bg-red-500/20 active:scale-90 transition flex items-center justify-center text-sm"
                  aria-label="Delete item"
                  title="Delete"
                >×</button>
              </div>

              {/* Compact-mode top thumbnail (shorter than comfortable banner) */}
              {hasPreview && isCompact && (
                <a
                  href={previewLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className={compactPreviewClass}
                  title={isYouTube ? "Open on YouTube" : hasOgPreview ? "Open link" : "Open image"}
                >
                  <img
                    src={previewImageSrc}
                    alt=""
                    loading="lazy"
                    onError={() => markPreviewImageFailed(previewImageSrc)}
                    className="w-full h-full object-cover object-center"
                  />
                  {isYouTube && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                        <span className="text-white text-xs ml-0.5">▶</span>
                      </div>
                    </div>
                  )}
                </a>
              )}

              {/* Thumbnail preview for links */}
              {hasPreview && !isCompact && !isList && (
                <a
                  href={previewLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="relative block w-full h-32 sm:h-40 bg-brand-muted overflow-hidden group"
                  title={isYouTube ? "Open on YouTube" : hasOgPreview ? "Open link" : "Open image"}
                >
                  <img
                    src={previewImageSrc}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={() => markPreviewImageFailed(previewImageSrc)}
                  />
                  {isYouTube && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                        <span className="text-white text-lg ml-0.5">▶</span>
                      </div>
                    </div>
                  )}
                  {hasOgPreview && item.siteName && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 rounded-md px-2 py-1 max-w-[calc(100%-1rem)]">
                      {item.favicon && <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0" loading="lazy" />}
                      <span className="text-[10px] text-gray-300 font-mono shrink-0">{item.siteName}</span>
                      {isYouTube && item.ogDescription && (
                        <span className="text-[10px] text-gray-400 font-mono truncate" title={item.ogDescription}>
                          · {item.ogDescription}
                        </span>
                      )}
                    </div>
                  )}
                </a>
              )}

              <div className={compactBodyClass}>
                <div className={`flex ${isCompact ? "gap-2" : isList ? "gap-2.5 items-center" : "gap-3"}`}>
                  {hasPreview && isList && (
                    <a
                      href={previewLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="relative w-12 h-12 rounded-md bg-brand-muted overflow-hidden shrink-0 border border-brand-border"
                      title={isYouTube ? "Open on YouTube" : hasOgPreview ? "Open link" : "Open image"}
                    >
                      <img
                        src={previewImageSrc}
                        alt=""
                        loading="lazy"
                        onError={() => markPreviewImageFailed(previewImageSrc)}
                        className="w-full h-full object-cover"
                      />
                      {isYouTube && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] bg-black/20">▶</span>
                      )}
                    </a>
                  )}
                  {!hasPreview && (
                    <div
                      className={`${isCompact ? "w-6 h-6 text-xs" : isList ? "w-8 h-8 text-sm" : "w-8 h-8 text-base"} rounded-lg flex items-center justify-center shrink-0`}
                      style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}
                    >{itemIcon}</div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.pinned && <span className="text-[10px]" title="Pinned">📌</span>}
                      {item.favourite && <span className="text-[10px]" style={{ color: "#F2C94C" }} title="Favourite">★</span>}
                      {item.actionRequired && <span className="text-[10px]" style={{ color: "#EB5757" }} title="Needs action">⚡</span>}
                      {reminder && <span className="text-[10px]" style={{ color: "#56CCF2" }} title={`Reminder: ${formatReminderDue(reminder.dueAt)}`}>⏰</span>}
                      {hasPreview && !isCompact && !isList && (
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0"
                          style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}
                        >{itemIcon}</div>
                      )}
                      <p className={`${compactTitleClass} font-semibold text-gray-100 ${expanded ? "" : isCompact ? "" : "truncate"} ${item.type === "task" && item.completed ? "line-through text-gray-400" : ""}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {item.title || item.ogTitle || "Untitled"}
                      </p>
                      {hasChecklist && (
                        <span className="text-[10px] font-mono text-gray-500">
                          {taskProgress.completed}/{taskProgress.total}
                        </span>
                      )}
                    </div>

                    {/* YouTube channel/author name */}
                    {isYouTube && item.ogDescription && (
                      <p className="text-[11px] mt-0.5 truncate flex items-center gap-1" style={{ color: "#EB5757" }}>
                        <span className="text-[9px]" aria-hidden>▶</span>
                        <span className="truncate">{item.ogDescription}</span>
                      </p>
                    )}

                    {/* OG description for links (when no user content) — skip for YouTube since
                        ogDescription holds the channel name shown above */}
                    {item.ogDescription && !item.content && !isCompact && !isYouTube && (
                      <p className={`text-xs text-gray-500 mt-1 ${isList ? "line-clamp-1" : "line-clamp-2"}`}>{item.ogDescription}</p>
                    )}

                    {item.url && !isCompact && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className={`${isList ? "text-[10px] mt-0.5" : "text-[11px] mt-1"} text-type-link font-mono block truncate hover:underline`}
                      >↗ {item.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}</a>
                    )}

                    {item.content && !isCompact && (
                      <LinkifiedText
                        text={item.content}
                        className={`${isList ? "text-[11px] mt-0.5 line-clamp-1" : "text-xs mt-1.5"} text-gray-500 leading-relaxed ${expanded ? "whitespace-pre-wrap" : isList ? "line-clamp-1" : "line-clamp-2"}`}
                      />
                    )}

                    {/* Notes section (separate from content) — entries first, legacy fallback */}
                    {!isCompact && !isList && (() => {
                      const entries = (item.noteEntries || []).filter(e => e.body?.trim().length > 0);
                      if (entries.length > 0) {
                        const visible = expanded ? entries : entries.slice(0, 2);
                        return (
                          <div className="mt-2 pl-2.5 border-l-2 flex flex-col gap-1" style={{ borderColor: t.color + "40" }}>
                            {visible.map(e => (
                              <LinkifiedText
                                key={e.id}
                                text={e.body}
                                className={`text-[11px] text-gray-400 italic leading-relaxed ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}
                              />
                            ))}
                            {!expanded && entries.length > 2 && (
                              <span className="text-[10px] font-mono text-gray-600">+{entries.length - 2} more entries</span>
                            )}
                          </div>
                        );
                      }
                      if (item.notes) {
                        return (
                          <div className={`mt-2 pl-2.5 border-l-2 ${expanded ? "" : "line-clamp-2"}`} style={{ borderColor: t.color + "40" }}>
                            <LinkifiedText text={item.notes} className="text-[11px] text-gray-400 italic leading-relaxed" />
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {hasChecklist && !isCompact && (
                      <div className="mt-2.5 flex flex-col gap-1.5">
                        {checklist.map(row => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              toggleChecklistItemOnCard(item, row.id);
                            }}
                            className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-muted/50 px-2.5 py-2 text-left hover:border-[#56CCF260] transition"
                            aria-label={`${row.completed ? "Uncheck" : "Check"} ${row.text}`}
                            title={row.completed ? "Mark incomplete" : "Mark complete"}
                          >
                            <span
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px]"
                              style={{
                                borderColor: row.completed ? "#56CCF2" : "#3A3D44",
                                color: row.completed ? "#56CCF2" : "#666",
                                background: row.completed ? "#56CCF220" : "transparent",
                              }}
                            >
                              {row.completed ? "✓" : ""}
                            </span>
                            <span className={`text-sm ${row.completed ? "text-gray-500 line-through" : "text-gray-200"}`}>
                              {row.text}
                            </span>
                          </button>
                        ))}
                        {!expanded && checklistItems.length > checklist.length && (
                          <span className="text-[10px] font-mono text-gray-600">
                            +{checklistItems.length - checklist.length} more checklist items
                          </span>
                        )}
                      </div>
                    )}

                    {expanded && relatedItems.length > 0 && !isCompact && !isList && (
                      <div className="mt-2.5 pt-2.5 border-t border-brand-border">
                        <p className="text-[10px] text-gray-600 font-mono mb-1.5">Related</p>
                        <div className="flex flex-wrap gap-1.5">
                          {relatedItems.map(related => {
                            const relatedType = TYPES[related.type] || TYPES.note;
                            return (
                              <div
                                key={related.id}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-brand-muted border border-brand-border max-w-full"
                              >
                                {related.url ? (
                                  <a
                                    href={related.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1.5 min-w-0 text-left hover:text-white transition"
                                    title="Open source URL"
                                  >
                                    <span className="text-[10px] shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                                    <span className="text-[11px] text-gray-300 truncate max-w-[180px]">
                                      {related.title || related.ogTitle || related.url || "Untitled"}
                                    </span>
                                    <span className="text-[10px] text-type-link shrink-0">↗</span>
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); openCardInCurrentTab(related.id); }}
                                    className="flex items-center gap-1.5 min-w-0 text-left hover:text-white transition"
                                    title="Open related card"
                                  >
                                    <span className="text-[10px] shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                                    <span className="text-[11px] text-gray-300 truncate max-w-[180px]">
                                      {related.title || related.ogTitle || "Untitled"}
                                    </span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className={`flex items-center gap-2 ${isCompact ? "mt-1" : "mt-2"} flex-wrap`}>
                      {item.category && (
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: getCatColor(item.category) + "15", color: getCatColor(item.category), border: `1px solid ${getCatColor(item.category)}30` }}
                        >{item.category}</span>
                      )}
                      {reminder && (
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "#56CCF215", color: "#56CCF2", border: "1px solid #56CCF230" }}
                          title={reminder.message || "Reminder"}
                        >⏰ {formatReminderDue(reminder.dueAt)}</span>
                      )}
                      {(item.tags || []).slice(0, isCompact ? 3 : undefined).map((tag, ti) => (
                        <span key={ti} className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ color: TAG_COLORS[ti % TAG_COLORS.length], background: TAG_COLORS[ti % TAG_COLORS.length] + "10" }}>#{tag}</span>
                      ))}
                      {isCompact && (item.tags || []).length > 3 && (
                        <span className="text-[10px] text-gray-600 font-mono">+{(item.tags || []).length - 3}</span>
                      )}
                      {isCompact && displayedAttachments.length > 0 && (
                        <span className="text-[10px] text-gray-500 font-mono" title={`${displayedAttachments.length} attachment${displayedAttachments.length > 1 ? "s" : ""}`}>📎 {displayedAttachments.length}</span>
                      )}
                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleFlag(item.id, "favourite"); }}
                          className="text-[12px] leading-none px-1 py-0.5 rounded hover:bg-white/5 transition"
                          style={{ color: item.favourite ? "#F2C94C" : "#3a3d44", opacity: item.favourite ? 1 : 0.7 }}
                          title={item.favourite ? "Unfavourite" : "Mark as favourite"}
                          aria-label={item.favourite ? "Unfavourite" : "Mark as favourite"}
                        >{item.favourite ? "★" : "☆"}</button>
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleFlag(item.id, "actionRequired"); }}
                          className="text-[12px] leading-none px-1 py-0.5 rounded hover:bg-white/5 transition"
                          style={{ color: item.actionRequired ? "#EB5757" : "#3a3d44", opacity: item.actionRequired ? 1 : 0.7 }}
                          title={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                          aria-label={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                        >⚡</button>
                        <span className="text-[10px] text-gray-700 font-mono ml-1">{timeAgo(item.createdAt)}</span>
                      </div>
                    </div>

                    {/* Attachments */}
                    {displayedAttachments.length > 0 && !isCompact && !isList && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {displayedAttachments.map(att => (
                          <a
                            key={att.url}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono bg-brand-muted border border-brand-border text-gray-300 hover:border-gray-600 hover:text-white transition"
                            title={`${att.name} · ${formatSize(att.size)}`}
                          >
                            <span>{fileIcon(att.contentType, att.name)}</span>
                            <span className="max-w-[160px] truncate">{att.name}</span>
                            <span className="text-gray-600 text-[9px]">{formatSize(att.size)}</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Action buttons — hidden in compact view unless expanded */}
                    {!isCompact && !isList && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-2.5 border-t border-brand-border">
                      <button
                        onClick={e => { e.stopPropagation(); handlePin(item.id); }}
                        className="px-3 py-1.5 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                        style={{ border: "1px solid #E8A83830", background: "#E8A83810", color: "#E8A838" }}
                      >{item.pinned ? "Unpin" : "Pin"}</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleFlag(item.id, "favourite"); }}
                        className="px-3 py-1.5 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                        style={{
                          border: item.favourite ? "1px solid #F2C94C90" : "1px solid #F2C94C30",
                          background: item.favourite ? "#F2C94C25" : "#F2C94C10",
                          color: "#F2C94C",
                        }}
                        title={item.favourite ? "Remove from favourites" : "Mark as favourite"}
                      >{item.favourite ? "★ Favourite" : "☆ Favourite"}</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleToggleFlag(item.id, "actionRequired"); }}
                        className="px-3 py-1.5 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                        style={{
                          border: item.actionRequired ? "1px solid #EB575790" : "1px solid #EB575730",
                          background: item.actionRequired ? "#EB575725" : "#EB575710",
                          color: "#EB5757",
                        }}
                        title={item.actionRequired ? "Clear action flag" : "Mark as needing action"}
                      >{item.actionRequired ? "⚡ Action needed" : "⚡ Flag action"}</button>
                      <button
                        onClick={e => { e.stopPropagation(); handleEdit(item); }}
                        className="px-3 py-1.5 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                        style={{ border: "1px solid #5B8DEF30", background: "#5B8DEF10", color: "#5B8DEF" }}
                      >Edit</button>
                      <button
                        disabled={summarizing === item.id}
                        onClick={e => { e.stopPropagation(); handleSummarize(item.id); }}
                        className="px-3 py-1.5 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95 disabled:opacity-50 flex items-center gap-1"
                        style={{ border: "1px solid #56CCF230", background: "#56CCF210", color: "#56CCF2" }}
                      >
                        {summarizing === item.id && <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full" style={{ animation: "spin 0.6s linear infinite" }} />}
                        {summarizing === item.id ? "Summarizing" : "Summarize"}
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <button
            onClick={() => setVisibleCount(c => c + 50)}
            className={`w-full py-3 mb-4 rounded-xl text-xs font-mono border border-brand-border text-gray-500 hover:text-gray-300 transition ${density === "compact" ? "col-span-full" : ""}`}
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        )}
      </div>

      {vaultOpen && <Vault onClose={() => setVaultOpen(false)} />}

      {/* Add/Edit Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          style={{ background: "#0D0F12EE" }}
          onDragEnter={e => {
            const types = Array.from(e.dataTransfer?.types || []);
            const hasFiles = types.some(t => t === "Files" || t === "application/x-moz-file");
            console.log("[drag] enter", { types, hasFiles });
            if (hasFiles) setIsDragOver(true);
          }}
          onDragOver={e => {
            // MUST preventDefault on every tick or the drop event won't fire.
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={e => {
            const related = e.relatedTarget as Node | null;
            if (related && e.currentTarget.contains(related)) return;
            setIsDragOver(false);
          }}
          onDrop={e => {
            e.preventDefault();
            setIsDragOver(false);
            const fileCount = e.dataTransfer?.files?.length || 0;
            console.log("[drag] drop", { fileCount });
            if (fileCount > 0) {
              handleFileUpload(e.dataTransfer.files);
            }
          }}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-[210] flex items-center justify-center pointer-events-none border-2 border-dashed border-[#E8A838] bg-[#E8A83820] backdrop-blur-[2px]">
              <div className="text-center">
                <div className="text-4xl mb-2">📎</div>
                <p className="text-base font-mono text-[#E8A838]">Drop to attach</p>
              </div>
            </div>
          )}
          <div className="flex-1 cursor-pointer" onClick={closeForm} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-4 pb-6 max-h-[90vh] overflow-y-auto relative">
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4 gap-2">
              <h2 className="text-base font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {editingId ? "Edit Item" : "Add to Brain"}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={() => { const id = editingId; closeForm(); popOutCard(id); }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-brand-border text-gray-400 hover:text-[#5B8DEF] hover:border-[#5B8DEF60] transition"
                  title="Open this card in a new window"
                >⇱ Pop out</button>
              )}
            </div>

            {/* Type picker */}
            <div className="flex gap-1.5 mb-3">
              {(Object.entries(TYPES) as [ItemType, typeof TYPES.note][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setForm(f => ({ ...f, type: k }))}
                  className="flex-1 py-2 rounded-lg text-xs font-mono font-medium transition"
                  style={{
                    border: form.type === k ? `1px solid ${v.color}60` : "1px solid #252830",
                    background: form.type === k ? `${v.color}15` : "#181B21",
                    color: form.type === k ? v.color : "#666",
                  }}
                >{v.icon} {v.label}</button>
              ))}
            </div>

            {/* Flags */}
            <div className="flex gap-1.5 mb-4">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, favourite: !f.favourite }))}
                className="px-3 py-1.5 rounded-md text-[11px] font-mono transition active:scale-95"
                style={{
                  border: form.favourite ? "1px solid #F2C94C90" : "1px solid #F2C94C30",
                  background: form.favourite ? "#F2C94C25" : "#F2C94C10",
                  color: "#F2C94C",
                }}
              >{form.favourite ? "★ Favourite" : "☆ Mark favourite"}</button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, actionRequired: !f.actionRequired }))}
                className="px-3 py-1.5 rounded-md text-[11px] font-mono transition active:scale-95"
                style={{
                  border: form.actionRequired ? "1px solid #EB575790" : "1px solid #EB575730",
                  background: form.actionRequired ? "#EB575725" : "#EB575710",
                  color: "#EB5757",
                }}
              >{form.actionRequired ? "⚡ Action needed" : "⚡ Flag for action"}</button>
            </div>

            <div className="mb-4 rounded-lg border border-brand-border bg-brand-muted/40 p-3">
              {(() => {
                const reminderParts = splitReminderDateTime(form.reminderDueAt);
                return (
                  <>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="text-[11px] font-mono text-gray-400 tracking-wide" htmlFor="reminder-due">
                  Telegram reminder
                </label>
                {form.reminderDueAt && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, reminderDueAt: "", reminderMessage: "" }))}
                    className="text-[11px] font-mono text-gray-500 hover:text-red-300 transition"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2 mb-2">
                <input
                  id="reminder-due"
                  type="date"
                  value={reminderParts.date}
                  onChange={e => updateReminderDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#101318] border border-brand-border rounded-lg text-sm text-gray-300 outline-none"
                />
                <select
                  value={reminderParts.time}
                  onChange={e => updateReminderTime(e.target.value)}
                  className="w-full px-3 py-2 bg-[#101318] border border-brand-border rounded-lg text-sm text-gray-300 outline-none"
                  aria-label="Reminder time"
                >
                  {REMINDER_TIME_OPTIONS.map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  ["Today", 0],
                  ["Tomorrow", 1],
                  ["Next week", 7],
                  ["30 days", 30],
                ].map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setReminderPreset(days as number)}
                    className="px-2 py-1 rounded-md text-[11px] font-mono border border-brand-border text-gray-500 hover:text-[#56CCF2] hover:border-[#56CCF260] transition"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                value={form.reminderMessage}
                onChange={e => setForm(f => ({ ...f, reminderMessage: e.target.value }))}
                placeholder="What should Telegram remind you about?"
                aria-label="Reminder message"
                className="w-full px-3 py-2 bg-[#101318] border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500"
              />
                  </>
                );
              })()}
            </div>

            {/* Category selector — pick existing, type new, or auto */}
            <div className="flex gap-1.5 mb-2 flex-wrap items-center">
              <button
                onClick={() => setForm(f => ({ ...f, category: "" }))}
                className="px-2.5 py-1 rounded-md text-[11px] font-mono transition"
                style={{
                  border: !form.category ? "1px solid #ffffff30" : "1px solid #252830",
                  background: !form.category ? "#ffffff10" : "#181B21",
                  color: !form.category ? "#fff" : "#666",
                }}
              >Auto</button>
              {allParentCats.map(cat => (
                <span key={cat.id} className="contents">
                  <button
                    onClick={() => setForm(f => ({ ...f, category: cat.name }))}
                    className="px-2.5 py-1 rounded-md text-[11px] font-mono transition"
                    style={{
                      border: form.category === cat.name ? `1px solid ${cat.color}60` : "1px solid #252830",
                      background: form.category === cat.name ? `${cat.color}15` : "#181B21",
                      color: form.category === cat.name ? cat.color : "#666",
                    }}
                  >{cat.name}</button>
                  {getChildren(cat.id).map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => setForm(f => ({ ...f, category: sub.name }))}
                      className="px-2 py-1 rounded-md text-[10px] font-mono transition"
                      style={{
                        border: form.category === sub.name ? `1px solid ${sub.color}60` : "1px solid #252830",
                        background: form.category === sub.name ? `${sub.color}15` : "#181B21",
                        color: form.category === sub.name ? sub.color : "#555",
                      }}
                    >↳ {sub.name}</button>
                  ))}
                </span>
              ))}
            </div>
            <input
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder="Type a category name (new or existing)"
              aria-label="Category"
              className="w-full px-3 py-2 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-4 placeholder:text-gray-500"
            />

            {/* Fields */}
            {(form.type === "link" || form.type === "clip") && (
              <input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://... (auto-fetches title & thumbnail)"
                aria-label="URL"
                className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 placeholder:text-gray-500"
              />
            )}
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={form.url ? "Title (auto-filled from URL if empty)" : "Title"}
              aria-label="Title"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 placeholder:text-gray-500"
            />
            {form.type === "task" && (
              <TaskChecklistEditor
                items={form.checklistItems}
                onAdd={addChecklistRow}
                onToggle={toggleChecklistRow}
                onTextChange={updateChecklistRowText}
                onRemove={deleteChecklistRow}
              />
            )}
            <textarea
              ref={contentRef}
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              onPaste={handleSmartPaste("content")}
              placeholder={form.type === "thought" ? "What's on your mind..." : "Content / description..."}
              aria-label="Content"
              rows={3}
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-1.5 resize-y leading-relaxed placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={() => { setPickerOpen(true); setPickerSearch(""); }}
              className="mb-2.5 text-[11px] font-mono text-gray-500 hover:text-gray-300 transition"
            >
              + Insert from another card
            </button>
            <label className="block text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide">
              Notes <span className="text-gray-600 font-normal">(each entry is independently editable / deletable)</span>
            </label>
            <div className="flex flex-col gap-2 mb-2">
              {form.noteEntries.map(entry => (
                <div key={entry.id} className="rounded-lg border border-brand-border bg-brand-muted">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-brand-border">
                    <span className="text-[10px] font-mono text-gray-500">{formatStamp(entry.createdAt)}</span>
                    {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
                      <span className="text-[10px] font-mono text-gray-600">· edited {formatStamp(entry.updatedAt)}</span>
                    )}
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => deleteNoteEntry(entry.id)}
                      aria-label="Delete entry"
                      title="Delete entry"
                      className="text-[11px] font-mono text-gray-500 hover:text-red-400 transition px-1"
                    >×</button>
                  </div>
                  <textarea
                    ref={el => { entryRefs.current[entry.id] = el; }}
                    value={entry.body}
                    onChange={e => updateNoteEntry(entry.id, e.target.value)}
                    placeholder="Write a note..."
                    aria-label="Note entry"
                    rows={3}
                    className="w-full px-3 py-2 bg-transparent text-sm text-gray-300 outline-none resize-y leading-relaxed placeholder:text-gray-500"
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addNoteEntry}
              className="mb-2.5 text-[11px] font-mono text-gray-500 hover:text-gray-300 transition"
            >
              + Add entry
            </button>
            <label className="block text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide">
              Related cards
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {form.relatedItemIds.length === 0 ? (
                <span className="text-[11px] text-gray-600 font-mono">No related cards yet</span>
              ) : (
                form.relatedItemIds.map(id => {
                  const related = items.find(it => it.id === id);
                  const relatedType = related ? TYPES[related.type] : TYPES.note;
                  const label = related?.title || related?.ogTitle || related?.url || "Related card";
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1.5 rounded-md bg-brand-muted border border-brand-border text-[11px] text-gray-300 transition max-w-full overflow-hidden"
                    >
                      {related?.url ? (
                        <a
                          href={related.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 min-w-0 pl-2 py-1 hover:text-white transition"
                          title="Open source URL"
                        >
                          <span className="shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                          <span className="truncate max-w-[180px]">{label}</span>
                          <span className="text-type-link shrink-0">↗</span>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openCardInCurrentTab(id)}
                          className="flex items-center gap-1.5 min-w-0 pl-2 py-1 hover:text-white transition"
                          title="Open related card"
                        >
                          <span className="shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                          <span className="truncate max-w-[180px]">{label}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleRelatedSelection(id)}
                        className="px-2 py-1 text-gray-600 hover:text-red-300 hover:bg-red-500/10 transition shrink-0"
                        title="Remove related card"
                        aria-label={`Remove ${label}`}
                      >×</button>
                    </div>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => { setRelatedPickerOpen(true); setRelatedPickerSearch(""); }}
              className="mb-2.5 text-[11px] font-mono text-gray-500 hover:text-gray-300 transition"
            >
              + Link related cards
            </button>
            <label className="block text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide">
              Tags <span className="text-gray-600 font-normal">(comma-separated)</span>
            </label>
            <input
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="Tags: python, tutorial, important"
              aria-label="Tags, comma separated"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-4 placeholder:text-gray-500"
            />

            <label className="block text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide">
              Attachments <span className="text-gray-600 font-normal">(PDF, XLS, DOC, MD, images — max 50 MB · drop or paste here)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.xls,.xlsx,.doc,.docx,.csv,.txt,.md,.markdown,image/*"
              onChange={e => handleFileUpload(e.target.files)}
              className="hidden"
              aria-label="Attach files"
            />
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 px-3 py-2.5 bg-brand-muted border border-dashed border-brand-border rounded-lg text-sm text-gray-400 outline-none hover:border-gray-600 hover:text-gray-300 active:scale-[0.99] transition disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "+ Attach files"}
              </button>
              <button
                type="button"
                onClick={pasteFromClipboard}
                disabled={uploading}
                className="px-3 py-2.5 bg-brand-muted border border-dashed border-brand-border rounded-lg text-sm text-gray-400 outline-none hover:border-gray-600 hover:text-gray-300 active:scale-[0.99] transition disabled:opacity-50"
                title="Paste image from clipboard"
              >
                📋 Paste
              </button>
            </div>
            {form.attachments.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-4">
                {form.attachments.map(att => (
                  <div
                    key={att.url}
                    className="flex items-center gap-2 px-3 py-2 bg-brand-muted border border-brand-border rounded-lg text-xs"
                  >
                    <span className="text-sm">{fileIcon(att.contentType, att.name)}</span>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={att.name}
                        onChange={e => renameAttachment(att.url, e.target.value)}
                        placeholder="Attachment name"
                        aria-label={`Rename ${att.name || "attachment"}`}
                        className="w-full bg-transparent text-sm text-gray-300 outline-none placeholder:text-gray-500"
                      />
                    </div>
                    <span className="text-gray-600 font-mono text-[10px]">{formatSize(att.size)}</span>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 hover:text-white w-5 h-5 flex items-center justify-center"
                      aria-label={`Open ${att.name || "attachment"}`}
                      title="Open"
                    >
                      ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.url)}
                      className="text-gray-500 hover:text-red-400 w-5 h-5 flex items-center justify-center"
                      aria-label={`Remove ${att.name}`}
                      title="Remove"
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button onClick={closeForm} className="py-3 px-4 rounded-xl bg-brand-muted border border-brand-border text-gray-500 text-sm font-medium active:scale-95 transition">
                  Cancel
                </button>
                <button
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl text-white text-sm font-semibold transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)", boxShadow: "0 4px 16px rgba(232,168,56,0.25)" }}
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Save"}
                </button>
              </div>
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="w-full py-2.5 rounded-xl text-xs font-mono border border-brand-border text-gray-400 hover:text-white transition disabled:opacity-50 active:scale-[0.99]"
              >
                {editingId ? "Update & Add Another" : "Save & Add Another"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Card Picker — insert content from another card */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[210] flex flex-col justify-end" style={{ background: "#0D0F12EE" }}>
          <div className="flex-1 cursor-pointer" onClick={() => { setPickerOpen(false); setPickerSearch(""); }} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-4 pb-6 max-h-[80vh] flex flex-col">
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <h2 className="text-base font-semibold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Insert from another card
            </h2>
            <input
              autoFocus
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Search cards by title, content, or tag..."
              aria-label="Search cards"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-3 placeholder:text-gray-500"
            />
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
              {(() => {
                const q = pickerSearch.trim().toLowerCase();
                const matches = items
                  .filter(it => it.id !== editingId)
                  .filter(it => itemMatchesCardSearch(it, q))
                  .slice(0, 100);
                if (matches.length === 0) {
                  return <div className="text-xs text-gray-500 font-mono py-6 text-center">No cards found</div>;
                }
                return matches.map(it => {
                  const t = TYPES[it.type];
                  const firstEntry = (it.noteEntries || []).map(e => e.body).find(Boolean) || "";
                  const preview = (it.content || firstEntry || it.notes || "").slice(0, 120);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => insertFromCard(it)}
                      className="text-left px-3 py-2 rounded-lg bg-brand-muted border border-brand-border hover:border-gray-600 transition"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ color: t.color }} className="text-xs">{t.icon}</span>
                        <span className="text-sm text-gray-200 truncate flex-1">{it.title || "(untitled)"}</span>
                        {it.category && (
                          <span className="text-[10px] font-mono text-gray-500">{it.category}</span>
                        )}
                      </div>
                      {preview && (
                        <div className="text-[11px] text-gray-500 line-clamp-2">{preview}</div>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
            <button
              onClick={() => { setPickerOpen(false); setPickerSearch(""); }}
              className="mt-3 py-2.5 rounded-xl bg-brand-muted border border-brand-border text-gray-400 text-sm font-medium active:scale-[0.99] transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Related Card Picker — create explicit two-way card links */}
      {relatedPickerOpen && (
        <div className="fixed inset-0 z-[215] flex flex-col justify-end" style={{ background: "#0D0F12EE" }}>
          <div className="flex-1 cursor-pointer" onClick={() => { setRelatedPickerOpen(false); setRelatedPickerSearch(""); }} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-4 pb-6 max-h-[80vh] flex flex-col">
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <h2 className="text-base font-semibold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Link related cards
            </h2>
            <input
              autoFocus
              value={relatedPickerSearch}
              onChange={e => setRelatedPickerSearch(e.target.value)}
              placeholder="Search cards to link..."
              aria-label="Search related cards"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-3 placeholder:text-gray-500"
            />
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
              {(() => {
                const q = relatedPickerSearch.trim().toLowerCase();
                const matches = items
                  .filter(it => it.id !== editingId)
                  .filter(it => itemMatchesCardSearch(it, q))
                  .slice(0, 100);
                if (matches.length === 0) {
                  return <div className="text-xs text-gray-500 font-mono py-6 text-center">No cards found</div>;
                }
                return matches.map(it => {
                  const t = TYPES[it.type];
                  const selected = form.relatedItemIds.includes(it.id);
                  const preview = (it.content || it.url || it.notes || "").slice(0, 120);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => toggleRelatedSelection(it.id)}
                      className="text-left px-3 py-2 rounded-lg bg-brand-muted border transition"
                      style={{ borderColor: selected ? "#E8A83880" : "#252830", background: selected ? "#E8A83812" : undefined }}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ color: t.color }} className="text-xs">{t.icon}</span>
                        <span className="text-sm text-gray-200 truncate flex-1">{it.title || it.ogTitle || "(untitled)"}</span>
                        {it.category && (
                          <span className="text-[10px] font-mono text-gray-500">{it.category}</span>
                        )}
                        <span className="text-[11px] font-mono" style={{ color: selected ? "#E8A838" : "#555" }}>
                          {selected ? "linked" : "link"}
                        </span>
                      </div>
                      {preview && (
                        <div className="text-[11px] text-gray-500 line-clamp-2">{preview}</div>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
            <button
              onClick={() => { setRelatedPickerOpen(false); setRelatedPickerSearch(""); }}
              className="mt-3 py-2.5 rounded-xl text-sm font-medium active:scale-[0.99] transition"
              style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)", color: "#fff" }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {showCatManager && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end" style={{ background: "#0D0F12EE" }}>
          <div className="flex-1 cursor-pointer" onClick={() => setShowCatManager(false)} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-4 pb-6 max-h-[85vh] overflow-y-auto">
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h2 className="text-base font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Categories
              </h2>
              <div className="flex gap-1 text-[10px] font-mono">
                {(["manual", "asc", "desc"] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setCatSort(mode)}
                    className="px-2 py-1 rounded transition border"
                    style={{
                      borderColor: catSort === mode ? "#E8A83870" : "#ffffff15",
                      background: catSort === mode ? "#E8A83815" : "transparent",
                      color: catSort === mode ? "#E8A838" : "#888",
                    }}
                    title={mode === "manual" ? "Drag to reorder" : mode === "asc" ? "Sort A → Z" : "Sort Z → A"}
                  >
                    {mode === "manual" ? "↕ Manual" : mode === "asc" ? "A → Z" : "Z → A"}
                  </button>
                ))}
              </div>
            </div>

            {/* Existing categories — hierarchical */}
            {categories.length === 0 && (
              <p className="text-xs text-gray-600 font-mono mb-4">No categories yet. Add one below, or just save items — AI will auto-categorize.</p>
            )}
            {(() => {
              const sortFn = catSort === "asc"
                ? (a: Category, b: Category) => a.name.localeCompare(b.name)
                : catSort === "desc"
                  ? (a: Category, b: Category) => b.name.localeCompare(a.name)
                  : sortByPosition;
              const parents = categories.filter(c => !c.parentId).sort(sortFn);
              const childrenSorted = (pid: string) => categories.filter(c => c.parentId === pid).sort(sortFn);
              const draggable = catSort === "manual";
              const rowDragProps = (cat: Category) => draggable ? {
                draggable: true,
                onDragStart: (e: React.DragEvent) => { setDraggingCatId(cat.id); e.dataTransfer.effectAllowed = "move"; },
                onDragEnd: () => setDraggingCatId(null),
                onDragOver: (e: React.DragEvent) => {
                  if (!draggingCatId || draggingCatId === cat.id) return;
                  const dragged = categories.find(c => c.id === draggingCatId);
                  if (dragged?.parentId !== cat.parentId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                },
                onDrop: (e: React.DragEvent) => {
                  e.preventDefault();
                  if (draggingCatId) reorderCategory(draggingCatId, cat.id);
                  setDraggingCatId(null);
                },
              } : {};
              return parents.map(cat => {
                const subs = childrenSorted(cat.id);
                const collapsed = collapsedCats.has(cat.id);
                return (
                <div key={cat.id}>
                  <div
                    {...rowDragProps(cat)}
                    className="flex items-center justify-between py-2 border-b border-brand-border transition-opacity"
                    style={{ opacity: draggingCatId === cat.id ? 0.4 : 1 }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {draggable && <span className="text-gray-700 cursor-grab active:cursor-grabbing select-none text-xs" title="Drag to reorder">⋮⋮</span>}
                      {subs.length > 0 ? (
                        <button
                          onClick={() => toggleCatCollapsed(cat.id)}
                          className="text-gray-500 hover:text-gray-200 text-[10px] w-4 h-4 flex items-center justify-center transition shrink-0"
                          aria-expanded={!collapsed}
                          aria-label={collapsed ? `Expand ${cat.name}` : `Collapse ${cat.name}`}
                          title={collapsed ? "Show subcategories" : "Hide subcategories"}
                        >{collapsed ? "▸" : "▾"}</button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                      <span className="text-sm text-gray-300 truncate">{cat.name}</span>
                      <span className="text-[10px] text-gray-700 font-mono shrink-0">
                        {items.filter(i => getCatNamesUnderParent(cat.name).includes(i.category)).length}
                      </span>
                      {subs.length > 0 && collapsed && (
                        <span
                          className="text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-full ml-1"
                          style={{ color: cat.color, background: `${cat.color}15`, border: `1px solid ${cat.color}30` }}
                          title={`${subs.length} subcategor${subs.length === 1 ? "y" : "ies"}`}
                        >+{subs.length}</span>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditingCat({ ...cat })} disabled={catLoading} aria-label={`Edit ${cat.name}`} className="text-[11px] text-gray-600 hover:text-blue-400 font-mono transition disabled:opacity-50">✎</button>
                      <button onClick={() => handleDeleteCategory(cat.id)} disabled={catLoading} aria-label={`Delete ${cat.name}`} className="text-[11px] text-gray-600 hover:text-red-400 font-mono transition disabled:opacity-50">✕</button>
                    </div>
                  </div>
                  {/* Subcategories */}
                  {!collapsed && subs.map(sub => (
                    <div
                      key={sub.id}
                      {...rowDragProps(sub)}
                      className="flex items-center justify-between py-1.5 pl-6 border-b border-brand-border/50 transition-opacity"
                      style={{ opacity: draggingCatId === sub.id ? 0.4 : 1 }}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {draggable && <span className="text-gray-700 cursor-grab active:cursor-grabbing select-none text-[10px]" title="Drag to reorder">⋮⋮</span>}
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: sub.color }} />
                        <span className="text-xs text-gray-400 truncate">↳ {sub.name}</span>
                        <span className="text-[10px] text-gray-700 font-mono shrink-0">
                          {items.filter(i => i.category === sub.name).length}
                        </span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setEditingCat({ ...sub })} disabled={catLoading} aria-label={`Edit ${sub.name}`} className="text-[10px] text-gray-600 hover:text-blue-400 font-mono transition disabled:opacity-50">✎</button>
                        <button onClick={() => handleDeleteCategory(sub.id)} disabled={catLoading} aria-label={`Delete ${sub.name}`} className="text-[10px] text-gray-600 hover:text-red-400 font-mono transition disabled:opacity-50">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                );
              });
            })()}

            {/* Edit category inline */}
            {editingCat && (
              <div className="mt-3 p-3 rounded-lg border border-type-link/30 bg-type-link/5">
                <p className="text-[11px] text-type-link font-mono mb-2">Editing: {editingCat.name}</p>
                <input
                  value={editingCat.name}
                  onChange={e => setEditingCat(c => c ? { ...c, name: e.target.value } : null)}
                  className="w-full px-3 py-1.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2 placeholder:text-gray-500"
                />
                <div className="flex gap-2 items-center mb-2 flex-wrap">
                  <span className="text-[10px] text-gray-600 font-mono">Color:</span>
                  {[...CAT_COLORS.slice(0, 8), ...customCatColors].map(c => (
                    <span key={c} className="relative group">
                      <button onClick={() => setEditingCat(cat => cat ? { ...cat, color: c } : null)}
                        className="w-4 h-4 rounded-full transition-transform"
                        style={{ background: c, border: editingCat.color === c ? "2px solid white" : "2px solid transparent", transform: editingCat.color === c ? "scale(1.2)" : "scale(1)" }}
                        aria-label={`Use color ${c}`}
                      />
                      {customCatColors.includes(c) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCustomCatColor(c); }}
                          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gray-800 text-gray-400 text-[8px] hidden group-hover:flex items-center justify-center border border-gray-600"
                          title="Remove this custom color"
                          aria-label={`Remove custom color ${c}`}
                        >×</button>
                      )}
                    </span>
                  ))}
                  <label
                    className="relative w-4 h-4 rounded-full cursor-pointer flex items-center justify-center text-[8px] text-gray-400"
                    style={{ border: "1px dashed #555" }}
                    title="Add new color"
                  >
                    +
                    <input
                      type="color"
                      defaultValue="#888888"
                      onChange={e => {
                        const picked = addCustomCatColor(e.target.value);
                        setEditingCat(cat => cat ? { ...cat, color: picked } : null);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label="Add custom color"
                    />
                  </label>
                </div>
                <div className="flex gap-2 items-center mb-2">
                  <span className="text-[10px] text-gray-600 font-mono">Parent:</span>
                  <select
                    value={editingCat.parentId || ""}
                    onChange={e => setEditingCat(c => c ? { ...c, parentId: e.target.value || null } : null)}
                    className="px-2 py-1 bg-brand-muted border border-brand-border rounded text-xs text-gray-300 outline-none"
                  >
                    <option value="">None (top-level)</option>
                    {parentCats.filter(c => c.id !== editingCat.id).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleEditCategory} disabled={catLoading} className="px-3 py-1.5 rounded-lg text-[11px] font-mono text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)" }}>{catLoading ? "Saving..." : "Save"}</button>
                  <button onClick={() => setEditingCat(null)} className="px-3 py-1.5 rounded-lg text-[11px] font-mono text-gray-500 border border-brand-border">Cancel</button>
                </div>
              </div>
            )}

            {/* Add new category */}
            <div className="mt-4">
              <div className="flex gap-2">
                <input
                  value={newCat.name}
                  onChange={e => setNewCat(n => ({ ...n, name: e.target.value }))}
                  placeholder="New category name"
                  aria-label="New category name"
                  className="flex-1 px-3 py-2 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500"
                  onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                />
                <button
                  onClick={handleAddCategory}
                  disabled={catLoading}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-white shrink-0 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)" }}
                >{catLoading ? "..." : "Add"}</button>
              </div>
              <div className="flex gap-2 items-center mt-2 flex-wrap">
                <div className="flex gap-1 items-center flex-wrap">
                  {[...CAT_COLORS.slice(0, 6), ...customCatColors].map(c => (
                    <span key={c} className="relative group">
                      <button onClick={() => setNewCat(n => ({ ...n, color: c }))}
                        className="w-4 h-4 rounded-full transition-transform block"
                        style={{ background: c, border: newCat.color === c ? "2px solid white" : "2px solid transparent", transform: newCat.color === c ? "scale(1.2)" : "scale(1)" }}
                        aria-label={`Use color ${c}`}
                      />
                      {customCatColors.includes(c) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeCustomCatColor(c); }}
                          className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-gray-800 text-gray-400 text-[8px] hidden group-hover:flex items-center justify-center border border-gray-600"
                          title="Remove this custom color"
                          aria-label={`Remove custom color ${c}`}
                        >×</button>
                      )}
                    </span>
                  ))}
                  <label
                    className="relative w-4 h-4 rounded-full cursor-pointer flex items-center justify-center text-[8px] text-gray-400 ml-1"
                    style={{ border: "1px dashed #555" }}
                    title="Add new color"
                  >
                    +
                    <input
                      type="color"
                      defaultValue="#888888"
                      onChange={e => {
                        const picked = addCustomCatColor(e.target.value);
                        setNewCat(n => ({ ...n, color: picked }));
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label="Add custom color"
                    />
                  </label>
                </div>
                <select
                  value={newCat.parentId}
                  onChange={e => setNewCat(n => ({ ...n, parentId: e.target.value }))}
                  className="px-2 py-1 bg-brand-muted border border-brand-border rounded text-[11px] text-gray-400 outline-none"
                >
                  <option value="">Top-level</option>
                  {parentCats.map(c => (
                    <option key={c.id} value={c.id}>Sub of {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Export / Import */}
            <div className="mt-6 pt-4 border-t border-brand-border">
              <p className="text-[11px] text-gray-600 font-mono mb-2">Data</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    window.open("/api/export?format=json", "_blank");
                  }}
                  className="flex-1 py-2 rounded-lg text-[11px] font-mono border border-brand-border text-gray-400 hover:text-white transition"
                >Export JSON</button>
                <button
                  onClick={() => {
                    window.open("/api/export?format=markdown", "_blank");
                  }}
                  className="flex-1 py-2 rounded-lg text-[11px] font-mono border border-brand-border text-gray-400 hover:text-white transition"
                >Export MD</button>
                <label className="flex-1 py-2 rounded-lg text-[11px] font-mono border border-brand-border text-gray-400 hover:text-white transition text-center cursor-pointer">
                  Import
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      try {
                        const data = JSON.parse(text);
                        const res = await fetch("/api/import", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(data),
                        });
                        if (res.ok) {
                          const result = await res.json();
                          showToast(`Imported ${result.importedItems} items, ${result.importedCategories} categories`, "success");
                          fetchItems();
                          fetchCategories();
                        } else {
                          showToast("Import failed", "error");
                        }
                      } catch {
                        showToast("Invalid JSON file", "error");
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <button
              onClick={() => setShowCatManager(false)}
              className="w-full mt-4 py-3 rounded-xl bg-brand-muted border border-brand-border text-gray-500 text-sm font-medium"
            >Done</button>
          </div>
        </div>
      )}

      {/* Tag Manager Modal */}
      {showTagManager && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end" style={{ background: "#0D0F12EE" }}>
          <div className="flex-1 cursor-pointer" onClick={() => { setShowTagManager(false); setMergingTag(null); }} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-4 pb-6 max-h-[85vh] overflow-y-auto">
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <h2 className="text-base font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Tag Cleanup
            </h2>
            <p className="text-[11px] text-gray-600 font-mono mb-4">
              {duplicateGroups.length === 0
                ? "No duplicate groups detected. Tags differing only by case or punctuation (#ai / #AI / #a.i.) appear here."
                : `${duplicateGroups.length} group${duplicateGroups.length > 1 ? "s" : ""} with case/punctuation variants.`}
            </p>

            {duplicateGroups.map((group, gi) => {
              const sorted = [...group].sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0));
              const suggestedTo = sorted[0];
              const isActive = mergingTag && group.every(t => mergingTag.from.includes(t) || mergingTag.to === t);
              return (
                <div key={gi} className="mb-3 p-3 rounded-lg border border-brand-border bg-brand-muted/30">
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {sorted.map(tag => {
                      const color = tagColor(tag);
                      return (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[11px] font-mono"
                          style={{ border: `1px solid ${color}30`, background: `${color}10`, color }}
                        >
                          #{tag} <span className="opacity-60">{tagCounts.get(tag) ?? 0}</span>
                        </span>
                      );
                    })}
                  </div>

                  {isActive && mergingTag ? (
                    <div className="flex gap-2 items-center mt-2">
                      <label className="text-[11px] text-gray-500 font-mono">Merge all into:</label>
                      <input
                        value={mergingTag.to}
                        onChange={e => setMergingTag(m => m ? { ...m, to: e.target.value } : null)}
                        className="flex-1 px-2 py-1 rounded-md bg-brand-muted border border-brand-border text-[12px] text-gray-200 outline-none"
                      />
                      <button
                        onClick={() => mergeTags(mergingTag.from, mergingTag.to.trim())}
                        disabled={tagMergeLoading || !mergingTag.to.trim()}
                        className="px-3 py-1 rounded-md text-[11px] font-mono text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)" }}
                      >{tagMergeLoading ? "…" : "Merge"}</button>
                      <button
                        onClick={() => setMergingTag(null)}
                        className="px-2 py-1 rounded-md text-[11px] font-mono text-gray-500 border border-brand-border"
                      >Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMergingTag({ from: group, to: suggestedTo })}
                      className="text-[11px] font-mono text-[#5B8DEF] hover:text-[#E8A838]"
                    >→ Merge variants</button>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => { setShowTagManager(false); setMergingTag(null); }}
              className="w-full mt-4 py-3 rounded-xl bg-brand-muted border border-brand-border text-gray-500 text-sm font-medium"
            >Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
