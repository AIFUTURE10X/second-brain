"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { upload } from "@vercel/blob/client";
import { showToast } from "./Toast";
import { VoiceButton } from "./VoiceButton";
import Vault from "./Vault";
import { SYNC_CHANNEL, getSyncClientId, type SyncMessage, type SyncPayload } from "@/lib/sync";
import { SYNC_POLL_INTERVAL_MS, mergeSyncedItems, parseSyncDelta } from "@/lib/polling-sync.mjs";
import { applyOfflineUpdate, buildOfflineTempItem, isOfflineTempId } from "@/lib/offline-replay.mjs";
import {
  enqueueWrite,
  isOfflineQueueSupported,
  pendingWriteCount,
  removeQueuedCreate,
  replayQueuedWrites,
  type QueuedWriteInput,
} from "@/lib/offline-queue";
import { isMemoryOfWeekEnabled, MEMORY_OF_WEEK_ENABLED_KEY } from "@/lib/telegram-memory-settings.mjs";
import { nextViewMode, parseViewMode, type ViewMode } from "@/lib/view-mode";
import { compressImageForUpload } from "@/lib/image-compression";
import { draftStorageKey } from "@/lib/item-draft-autosave";
import { normalizeChecklistItems, type ChecklistItem } from "@/lib/task-checklists";
import {
  CAT_COLORS,
  TAG_COLORS,
  TYPES,
  newEntryId,
  type Attachment,
  type Category,
  type Item,
  type ItemRelation,
  type ItemType,
  type NoteEntry,
  type RelatedItemSummary,
  type Reminder,
} from "@/lib/brain-model";
import {
  resolveContentType,
  sourceFromUrl,
  toDateTimeLocal,
  viewModeIcon,
  viewModeLabel,
} from "@/lib/brain-format";
import { TelegramHelpMenu } from "./brain/TelegramHelpMenu";
import { ItemCard } from "./brain/ItemCard";
import { QuickCaptureBar } from "./brain/QuickCaptureBar";
import { FilterBar } from "./brain/FilterBar";
import { EmptyState } from "./brain/EmptyState";
import { SkeletonCard } from "./brain/SkeletonCard";
import { ItemFormModal } from "./brain/ItemFormModal";
import { ConflictDialog } from "./brain/ConflictDialog";
import { withConcurrencyGuard } from "@/lib/item-updates.mjs";
import {
  SAVED_SEARCHES_SETTINGS_KEY,
  addSavedSearch,
  captureFilterState,
  expandFilterState,
  normalizeSavedSearches,
  removeSavedSearch,
} from "@/lib/saved-searches.mjs";
import { groupItemsByDay, itemInDateRange } from "@/lib/date-range.mjs";
import { isToRead, nextReadingStatus } from "@/lib/reading-status.mjs";
import {
  CARD_TEMPLATES_SETTINGS_KEY,
  applyTemplateToForm,
  buildTemplateFromForm,
  normalizeCardTemplates,
} from "@/lib/card-templates.mjs";
import { BulkActionsBar } from "./brain/BulkActionsBar";
import { AskBrainPanel } from "./brain/AskBrainPanel";
import { ensureNotificationPermission, notifyDesktop } from "@/lib/desktop-notifications";
import {
  NOTIFIED_STORAGE_KEY,
  NOTIFY_TOGGLE_STORAGE_KEY,
  appendNotifiedIds,
  pickDueReminderNotifications,
} from "@/lib/reminder-notifications.mjs";

const CLIENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

export default function Brain() {
  const [items, setItems] = useState<Item[]>([]);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [relations, setRelations] = useState<ItemRelation[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsError, setItemsError] = useState(false);
  const [searchFuzzy, setSearchFuzzy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<"all" | ItemType>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [withNotesOnly, setWithNotesOnly] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [actionOnly, setActionOnly] = useState(false);
  const [remindersOnly, setRemindersOnly] = useState(false);
  const [readLaterOnly, setReadLaterOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [datePreset, setDatePreset] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [savedSearches, setSavedSearches] = useState<{ id: string; name: string; state: Record<string, unknown> }[]>([]);
  const savedSearchesLoaded = useRef(false);
  type CardTemplate = ReturnType<typeof normalizeCardTemplates>[number];
  const [cardTemplates, setCardTemplates] = useState<CardTemplate[]>([]);
  const cardTemplatesLoaded = useRef(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [quickTaskText, setQuickTaskText] = useState("");
  const [quickTaskSaving, setQuickTaskSaving] = useState(false);
  const [quickMemoryText, setQuickMemoryText] = useState("");
  const [quickMemorySaving, setQuickMemorySaving] = useState(false);
  const [quickCapturing, setQuickCapturing] = useState(false);
  const [memoryOfWeekEnabled, setMemoryOfWeekEnabled] = useState(true);
  const [memoryOfWeekSaving, setMemoryOfWeekSaving] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [desktopNotify, setDesktopNotify] = useState(false);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // updatedAt of the item as of edit start — the optimistic-concurrency base.
  const [editBaseUpdatedAt, setEditBaseUpdatedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Item | null>(null);
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
    recurrence: "",
    reminderId: "",
    reminderDueAt: "",
    reminderMessage: "",
    reminderRecurrence: "",
    relatedItemIds: [] as string[],
  });
  const [uploading, setUploading] = useState(false);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const syncClientIdRef = useRef<string>("");
  // Cursor for the ?since= polling sync — the server time of the last full
  // fetch or delta poll. Null until the first full item list has loaded.
  const syncCursorRef = useRef<string | null>(null);
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

  // Saved searches — synced via /api/settings under one JSON key.
  useEffect(() => {
    fetch(`/api/settings?key=${SAVED_SEARCHES_SETTINGS_KEY}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setSavedSearches(normalizeSavedSearches(data?.[SAVED_SEARCHES_SETTINGS_KEY]) as { id: string; name: string; state: Record<string, unknown> }[]);
      })
      .catch(() => {})
      .finally(() => { savedSearchesLoaded.current = true; });
  }, []);

  const persistSavedSearches = useCallback((list: { id: string; name: string; state: Record<string, unknown> }[]) => {
    setSavedSearches(list);
    if (!savedSearchesLoaded.current) return;
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: SAVED_SEARCHES_SETTINGS_KEY, value: list }),
    }).catch(() => {});
  }, []);

  const currentFilterState = () => ({
    search: search.trim(),
    view,
    catFilter,
    tagFilter,
    sourceFilter,
    withNotesOnly,
    favouritesOnly,
    actionOnly,
    remindersOnly,
    readLaterOnly,
    reviewMode,
    archivedOnly,
    sortBy,
    datePreset,
    dateFrom,
    dateTo,
  });

  const handleSaveCurrentSearch = () => {
    const state = captureFilterState(currentFilterState());
    if (Object.keys(state).length === 0) {
      showToast("Nothing to save — set a search or filters first", "error");
      return;
    }
    const name = prompt("Name this saved search:");
    if (!name?.trim()) return;
    const { list, entry } = addSavedSearch(savedSearches, name, currentFilterState());
    if (!entry) return;
    persistSavedSearches(list as { id: string; name: string; state: Record<string, unknown> }[]);
    showToast(`Saved "${entry.name}"`, "success");
  };

  const applySavedSearch = (entry: { id: string; name: string; state: Record<string, unknown> }) => {
    const state = expandFilterState(entry.state);
    setSearch(state.search as string);
    setView(state.view as "all" | ItemType);
    setCatFilter(state.catFilter as string);
    setTagFilter(state.tagFilter as string | null);
    setSourceFilter(state.sourceFilter as string | null);
    setWithNotesOnly(Boolean(state.withNotesOnly));
    setFavouritesOnly(Boolean(state.favouritesOnly));
    setActionOnly(Boolean(state.actionOnly));
    setRemindersOnly(Boolean(state.remindersOnly));
    setReadLaterOnly(Boolean(state.readLaterOnly));
    setReviewMode(Boolean(state.reviewMode));
    setArchivedOnly(Boolean(state.archivedOnly));
    setSortBy(state.sortBy as "newest" | "oldest");
    setDatePreset(state.datePreset as "all" | "today" | "week" | "month" | "custom");
    setDateFrom(state.dateFrom as string);
    setDateTo(state.dateTo as string);
  };

  const deleteSavedSearch = (id: string) => {
    persistSavedSearches(removeSavedSearch(savedSearches, id));
  };

  // Card templates (roadmap 2.10) — synced via /api/settings like saved searches.
  useEffect(() => {
    fetch(`/api/settings?key=${CARD_TEMPLATES_SETTINGS_KEY}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setCardTemplates(normalizeCardTemplates(data?.[CARD_TEMPLATES_SETTINGS_KEY]));
      })
      .catch(() => {})
      .finally(() => { cardTemplatesLoaded.current = true; });
  }, []);

  const persistCardTemplates = useCallback((list: CardTemplate[]) => {
    setCardTemplates(list);
    if (!cardTemplatesLoaded.current) return;
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: CARD_TEMPLATES_SETTINGS_KEY, value: list }),
    }).catch(() => {});
  }, []);

  const applyCardTemplate = (id: string) => {
    const template = cardTemplates.find(t => t.id === id);
    if (!template) return;
    setForm(f => applyTemplateToForm(f, template) as typeof f);
    showToast(`Template "${template.name}" applied`, "success");
  };

  const saveCurrentAsTemplate = () => {
    const name = prompt("Name this template:");
    if (!name?.trim()) return;
    const template = buildTemplateFromForm(name, form);
    if (!template) return;
    persistCardTemplates([...cardTemplates, template as CardTemplate]);
    showToast(`Template "${template.name}" saved`, "success");
  };

  const deleteCardTemplate = (id: string) => {
    persistCardTemplates(cardTemplates.filter(t => t.id !== id));
  };

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

  // Self-healing schema migration: a 500 from /api/items right after a
  // deploy usually means the database is missing newly added columns. The
  // app is same-origin (authorized), so it can run the idempotent
  // /api/admin/migrate itself and reload. The sessionStorage flag survives
  // the reload, so a 500 with a different cause can never loop.
  const trySelfMigrate = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    const flag = "sb_self_migrate_attempted";
    if (window.sessionStorage.getItem(flag)) return false;
    window.sessionStorage.setItem(flag, "1");
    try {
      const res = await fetch("/api/admin/migrate", { method: "POST" });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const fetchItems = useCallback(async (query?: string) => {
    if (query) setSearching(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (archivedOnly) params.set("archived", "1");
      const qs = params.toString();
      const url = qs ? `/api/items?${qs}` : "/api/items";
      const res = await fetch(url, { cache: "no-store" });
      if (res.status >= 500 && await trySelfMigrate()) {
        showToast("Database updated — reloading…", "success");
        window.location.reload();
        return;
      }
      if (res.ok) {
        setItems(await res.json());
        setSearchFuzzy(res.headers.get("x-search-fuzzy") === "1");
        setItemsError(false);
        if (!query) {
          // Anchor the polling-sync cursor to the server's clock (Date
          // header) so client clock skew can't make polls miss changes.
          const serverDate = new Date(res.headers.get("date") || Date.now());
          syncCursorRef.current = (Number.isNaN(serverDate.getTime()) ? new Date() : serverDate).toISOString();
        }
      } else {
        showToast("Failed to load items", "error");
        setItemsError(true);
      }
    } catch {
      showToast("Failed to load items", "error");
      setItemsError(true);
    }
    setSearching(false);
    setLoading(false);
  }, [archivedOnly, trySelfMigrate]);

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

  const refreshPendingOffline = useCallback(async () => {
    if (!isOfflineQueueSupported()) return;
    try {
      setPendingOffline(await pendingWriteCount());
    } catch {}
  }, []);

  // Queue a write that failed at the network level for replay on reconnect.
  // Returns false when queueing isn't possible (no IndexedDB / quota error)
  // so callers fall back to the normal failure toast.
  const queueWriteOffline = useCallback(async (input: QueuedWriteInput): Promise<boolean> => {
    if (!isOfflineQueueSupported()) return false;
    try {
      await enqueueWrite(input);
      await refreshPendingOffline();
      return true;
    } catch {
      return false;
    }
  }, [refreshPendingOffline]);

  const replayOfflineQueue = useCallback(async () => {
    if (!isOfflineQueueSupported()) return;
    try {
      const summary = await replayQueuedWrites();
      if (summary.done > 0) {
        showToast(`Synced ${summary.done} offline change${summary.done === 1 ? "" : "s"}`, "success");
      }
      if (summary.conflicts > 0) {
        showToast(`${summary.conflicts} offline edit${summary.conflicts === 1 ? "" : "s"} conflicted — server version kept`, "error");
      }
      if (summary.done > 0 || summary.conflicts > 0 || summary.dropped > 0) {
        await Promise.all([fetchItems(search.trim() || undefined), fetchCategories(), fetchRelations(), fetchReminders()]);
      }
    } catch {}
    refreshPendingOffline();
  }, [fetchItems, fetchCategories, fetchRelations, fetchReminders, refreshPendingOffline, search]);

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

  // Desktop notifications for due reminders (roadmap 3.2). Opt-in via the
  // header bell; works in browser tabs, the installed PWA, and the Tauri
  // desktop wrapper (notification plugin via IPC).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDesktopNotify(window.localStorage.getItem(NOTIFY_TOGGLE_STORAGE_KEY) === "on");
  }, []);

  const toggleDesktopNotify = async () => {
    if (desktopNotify) {
      setDesktopNotify(false);
      window.localStorage.setItem(NOTIFY_TOGGLE_STORAGE_KEY, "off");
      showToast("Reminder notifications off", "success");
      return;
    }
    const granted = await ensureNotificationPermission();
    if (!granted) {
      showToast("Notification permission was denied", "error");
      return;
    }
    setDesktopNotify(true);
    window.localStorage.setItem(NOTIFY_TOGGLE_STORAGE_KEY, "on");
    showToast("Reminder notifications on", "success");
  };

  useEffect(() => {
    if (!desktopNotify || typeof window === "undefined") return;
    const check = () => {
      let notifiedIds: string[] = [];
      try {
        const raw = window.localStorage.getItem(NOTIFIED_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) notifiedIds = parsed.filter((id): id is string => typeof id === "string");
      } catch {}
      const due = pickDueReminderNotifications(reminders, notifiedIds) as Reminder[];
      if (due.length === 0) return;
      for (const reminder of due) {
        const item = items.find(i => i.id === reminder.itemId);
        notifyDesktop(
          reminder.message?.trim() || "Reminder",
          item?.title || item?.ogTitle || "Open Second Brain to see the card",
        );
      }
      window.localStorage.setItem(
        NOTIFIED_STORAGE_KEY,
        JSON.stringify(appendNotifiedIds(notifiedIds, due.map(r => r.id)))
      );
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [desktopNotify, reminders, items]);

  // Offline write queue: replay queued writes on load and whenever the
  // browser reports connectivity is back.
  useEffect(() => {
    replayOfflineQueue();
    const onOnline = () => { replayOfflineQueue(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [replayOfflineQueue]);

  // Polling sync: while the tab is visible and no search is active (the items
  // state holds server search results then), fetch ?since= deltas and merge
  // them into local state. Deletes propagate via tombstones. Returning to a
  // hidden tab is covered by the visibilitychange full refresh below.
  useEffect(() => {
    if (search.trim() || archivedOnly) return;
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      const cursor = syncCursorRef.current;
      if (!cursor) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/items?since=${encodeURIComponent(cursor)}`, { cache: "no-store" });
        if (!res.ok) return;
        const delta = parseSyncDelta(await res.json());
        if (!delta) return;
        if (delta.serverTime) syncCursorRef.current = delta.serverTime;
        if (delta.items.length === 0 && delta.deletedIds.length === 0) return;
        setItems(prev => mergeSyncedItems(prev, delta.items, delta.deletedIds) as Item[]);
        if (delta.items.length > 0) fetchCategories();
        if (delta.deletedIds.length > 0) fetchRelations();
      } catch {
        // Offline or transient failure — try again on the next tick.
      } finally {
        inFlight = false;
      }
    };
    const interval = setInterval(poll, SYNC_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [search, archivedOnly, fetchCategories, fetchRelations]);

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
  useEffect(() => { setVisibleCount(50); }, [view, catFilter, search, sortBy, sourceFilter, tagFilter, withNotesOnly, favouritesOnly, actionOnly, remindersOnly, readLaterOnly, reviewMode, archivedOnly, datePreset, dateFrom, dateTo]);

  // Close modals on Escape, focus search on Cmd/Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (askOpen) setAskOpen(false);
        else if (vaultOpen) setVaultOpen(false);
        else if (relatedPickerOpen) { setRelatedPickerOpen(false); setRelatedPickerSearch(""); }
        else if (pickerOpen) { setPickerOpen(false); setPickerSearch(""); }
        else if (showAdd) closeForm();
        else if (showCatManager) setShowCatManager(false);
        else if (showTagManager) { setShowTagManager(false); setMergingTag(null); }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [askOpen, pickerOpen, relatedPickerOpen, showAdd, showCatManager, showTagManager, vaultOpen]);

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

  // Debounced server-side search
  useEffect(() => {
    if (!search.trim()) {
      fetchItems();
      return;
    }
    const timer = setTimeout(() => fetchItems(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search, fetchItems]);

  const resetForm = (keepOpen = false) => {
    const lastCategory = form.category;
    const lastType = form.type;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftStorageKey(editingId));
    }
    restoredDraftKeyRef.current = null;
    setForm({ type: lastType, title: "", content: "", url: "", noteEntries: [], checklistItems: [], tags: "", category: lastCategory, attachments: [], favourite: false, actionRequired: false, recurrence: "", reminderId: "", reminderDueAt: "", reminderMessage: "", reminderRecurrence: "", relatedItemIds: [] });
    if (!keepOpen) {
      setShowAdd(false);
    }
    setEditingId(null);
    setEditBaseUpdatedAt(null);
  };

  const closeForm = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftStorageKey(editingId));
    }
    restoredDraftKeyRef.current = null;
    setForm({ type: "note", title: "", content: "", url: "", noteEntries: [], checklistItems: [], tags: "", category: "", attachments: [], favourite: false, actionRequired: false, recurrence: "", reminderId: "", reminderDueAt: "", reminderMessage: "", reminderRecurrence: "", relatedItemIds: [] });
    setShowAdd(false);
    setEditingId(null);
    setEditBaseUpdatedAt(null);
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

    const payload = {
      itemId,
      message,
      dueAt: dueAt.toISOString(),
      status: "pending",
      recurrence: form.reminderRecurrence || null,
    };
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

  const handleSave = async (andAddAnother = false, force = false) => {
    if (!form.title.trim() && !form.content.trim() && !form.url.trim()) return;
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const noteEntries = form.noteEntries.filter(e => e.body.trim().length > 0);
    const checklistItems = normalizeChecklistItems(form.checklistItems);
    const { relatedItemIds, reminderId, reminderDueAt, reminderMessage, reminderRecurrence, recurrence, ...itemForm } = form;
    // "" (no recurrence) → null; only tasks carry recurrence.
    const recurrenceValue = form.type === "task" && recurrence ? recurrence : null;
    const previousRelatedIds = editingId ? relatedItemsForId(editingId).map(item => item.id) : [];
    // Once entries exist, clear the legacy single-blob field on the server so
    // we don't double-render after the migration on next load.
    const legacyClear = noteEntries.length > 0 && editingId ? { notes: "" } : {};
    const payload = editingId
      ? withConcurrencyGuard({ id: editingId, ...itemForm, tags, noteEntries, checklistItems, recurrence: recurrenceValue, ...legacyClear }, editBaseUpdatedAt, force)
      : { ...itemForm, tags, noteEntries, checklistItems, recurrence: recurrenceValue };
    try {
      const res = await fetch(editingId ? "/api/items" : "/api/items", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        if (data?.current) {
          setConflict(data.current as Item);
          setSaving(false);
          return;
        }
      }
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
      // Network-level failure (offline) — queue the write and update the
      // local state optimistically; replay happens on reconnect.
      const queued = editingId
        ? await queueWriteOffline({ kind: "update", payload: payload as { id: string } & Record<string, unknown> })
        : await (async () => {
            const temp = buildOfflineTempItem(payload) as Item;
            const ok = await queueWriteOffline({ kind: "create", payload, tempId: temp.id });
            if (ok) setItems(prev => [temp, ...prev]);
            return ok;
          })();
      if (queued) {
        if (editingId) {
          setItems(prev => prev.map(i => i.id === editingId ? applyOfflineUpdate(i, payload) as Item : i));
        }
        showToast("Offline — saved to sync queue", "success");
        if (editingId && !andAddAnother) closeForm();
        else resetForm(true);
      } else {
        showToast("Failed to save item", "error");
      }
    }
    setSaving(false);
  };

  const quickAddTask = async () => {
    const text = quickTaskText.trim();
    if (!text || quickTaskSaving) return;
    setQuickTaskSaving(true);
    const payload = { type: "task", title: text, tags: [], category: "" };
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        showToast("Failed to add task", "error");
      } else {
        setQuickTaskText("");
        await fetchItems();
      }
    } catch {
      const temp = buildOfflineTempItem(payload) as Item;
      if (await queueWriteOffline({ kind: "create", payload, tempId: temp.id })) {
        setItems(prev => [temp, ...prev]);
        setQuickTaskText("");
        showToast("Task saved offline — will sync", "success");
      } else {
        showToast("Failed to add task", "error");
      }
    }
    setQuickTaskSaving(false);
  };

  const quickAddMemory = async () => {
    const text = quickMemoryText.trim();
    if (!text || quickMemorySaving) return;
    setQuickMemorySaving(true);
    const payload = { type: "memory", title: text, tags: [], category: "" };
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        showToast("Failed to save memory", "error");
      } else {
        setQuickMemoryText("");
        await fetchItems();
      }
    } catch {
      const temp = buildOfflineTempItem(payload) as Item;
      if (await queueWriteOffline({ kind: "create", payload, tempId: temp.id })) {
        setItems(prev => [temp, ...prev]);
        setQuickMemoryText("");
        showToast("Memory saved offline — will sync", "success");
      } else {
        showToast("Failed to save memory", "error");
      }
    }
    setQuickMemorySaving(false);
  };

  // Shared by FilterBar's Clear-all and the no-matches empty state.
  const clearAllFilters = () => {
    setView("all");
    setCatFilter("all");
    setSourceFilter(null);
    setTagFilter(null);
    setWithNotesOnly(false);
    setFavouritesOnly(false);
    setActionOnly(false);
    setRemindersOnly(false);
    setReadLaterOnly(false);
    setReviewMode(false);
    setArchivedOnly(false);
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  // Quick capture — mirrors the Telegram bot grammar: URL → link,
  // "/t text" → task, "/m text" → memory, anything else → thought.
  const captureQuick = async (raw: string): Promise<boolean> => {
    const text = raw.trim();
    if (!text || quickCapturing) return false;
    let payload: { type: ItemType; title?: string; url?: string };
    let label: string;
    const taskMatch = text.match(/^\/t\s+(.+)$/i);
    const memoryMatch = text.match(/^\/m\s+(.+)$/i);
    if (taskMatch) {
      payload = { type: "task", title: taskMatch[1] };
      label = "Task";
    } else if (memoryMatch) {
      payload = { type: "memory", title: memoryMatch[1] };
      label = "Memory";
    } else if (/^https?:\/\/\S+$/i.test(text)) {
      payload = { type: "link", url: text };
      label = "Link";
    } else {
      payload = { type: "thought", title: text };
      label = "Thought";
    }
    setQuickCapturing(true);
    const fullPayload = { tags: [], category: "", ...payload };
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPayload),
      });
      if (!res.ok) {
        // Server reachable but rejected — not an offline situation.
        showToast("Failed to save", "error");
        return false;
      }
      const row: Item = await res.json();
      setItems(prev => [row, ...prev]);
      showToast(`${label} saved`, "success");
      fetchItems(search.trim() || undefined); // reconcile order and any late enrichment in the background
      return true;
    } catch {
      const temp = buildOfflineTempItem(fullPayload) as Item;
      if (await queueWriteOffline({ kind: "create", payload: fullPayload, tempId: temp.id })) {
        setItems(prev => [temp, ...prev]);
        showToast(`${label} saved offline — will sync`, "success");
        return true;
      }
      showToast("Failed to save", "error");
      return false;
    } finally {
      setQuickCapturing(false);
    }
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
    if (isOfflineTempId(item.id)) return;
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
      if (await queueWriteOffline({ kind: "update", payload: { id: item.id, checklistItems } })) {
        setItems(prev => prev.map(existing => existing.id === item.id ? { ...existing, checklistItems } : existing));
        showToast("Offline — change queued for sync", "success");
      } else {
        showToast("Failed to update checklist item", "error");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    // Optimistic placeholder from an offline create — cancel the queued
    // write instead of calling the API (the server has never seen this id).
    if (isOfflineTempId(id)) {
      try {
        await removeQueuedCreate(id);
      } catch {}
      setItems(prev => prev.filter(i => i.id !== id));
      if (expandedId === id) setExpandedId(null);
      refreshPendingOffline();
      return;
    }
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
      if (await queueWriteOffline({ kind: "delete", id })) {
        setItems(prev => prev.filter(i => i.id !== id));
        setReminders(prev => prev.filter(r => r.itemId !== id));
        if (expandedId === id) setExpandedId(null);
        showToast("Offline — delete queued for sync", "success");
      } else {
        showToast("Failed to delete item", "error");
      }
    }
  };

  const handlePin = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || isOfflineTempId(id)) return;
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
      if (await queueWriteOffline({ kind: "update", payload: { id, pinned: !item.pinned } })) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i));
        showToast("Offline — change queued for sync", "success");
      } else {
        showToast("Failed to update pin", "error");
      }
    }
  };

  const handleToggleFlag = async (id: string, flag: "favourite" | "actionRequired") => {
    const item = items.find(i => i.id === id);
    if (!item || isOfflineTempId(id)) return;
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
      if (await queueWriteOffline({ kind: "update", payload: { id, [flag]: next } })) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, [flag]: next } : i));
        showToast("Offline — change queued for sync", "success");
      } else {
        showToast("Failed to update", "error");
      }
    }
  };

  const handleCycleReadingStatus = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || isOfflineTempId(id)) return;
    const readingStatus = nextReadingStatus(item.readingStatus) as Item["readingStatus"];
    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, readingStatus }),
      });
      if (!res.ok) {
        showToast("Failed to update reading status", "error");
        return;
      }
      try {
        const saved = await res.clone().json();
        if (saved && saved.id) broadcastSync({ type: "item-updated", item: saved });
      } catch {}
      setItems(prev => prev.map(i => i.id === id ? { ...i, readingStatus } : i));
    } catch {
      if (await queueWriteOffline({ kind: "update", payload: { id, readingStatus } })) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, readingStatus } : i));
        showToast("Offline — change queued for sync", "success");
      } else {
        showToast("Failed to update reading status", "error");
      }
    }
  };

  const handleArchive = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || isOfflineTempId(id)) return;
    const archivedAt = item.archivedAt ? null : new Date().toISOString();
    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, archivedAt }),
      });
      if (!res.ok) {
        showToast("Failed to archive item", "error");
        return;
      }
      try {
        const saved = await res.clone().json();
        if (saved && saved.id) broadcastSync({ type: "item-updated", item: saved });
      } catch {}
      // The card leaves the current view either way (active grid ↔ archive).
      setItems(prev => prev.filter(i => i.id !== id));
      if (expandedId === id) setExpandedId(null);
      showToast(archivedAt ? "Archived — find it under More → Archived" : "Restored from archive", "success");
    } catch {
      if (await queueWriteOffline({ kind: "update", payload: { id, archivedAt } })) {
        setItems(prev => prev.filter(i => i.id !== id));
        showToast("Offline — change queued for sync", "success");
      } else {
        showToast("Failed to archive item", "error");
      }
    }
  };

  // ── Bulk actions (roadmap 2.5) ─────────────────────────────────────────────
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // Sequential PUT per item — reuses single-item validation and keeps payloads
  // small. Fine at personal-app scale (tens of selected cards).
  const runBulk = async (
    ids: string[],
    request: (item: Item) => { method: "PUT" | "DELETE"; url: string; body?: Record<string, unknown> },
    label: string,
  ) => {
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      const item = items.find(i => i.id === id);
      if (!item || isOfflineTempId(id)) { failed++; continue; }
      try {
        const { method, url, body } = request(item);
        const res = await fetch(url, {
          method,
          ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
        });
        if (res.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setBulkBusy(false);
    exitSelectMode();
    showToast(failed > 0 ? `${label}: ${ok} done, ${failed} failed` : `${label}: ${ok} item${ok === 1 ? "" : "s"}`, failed > 0 ? "error" : "success");
    await Promise.all([fetchItems(search.trim() || undefined), fetchCategories(), fetchRelations(), fetchReminders()]);
  };

  const bulkAddTag = (tag: string) => {
    const ids = Array.from(selectedIds);
    runBulk(ids, item => ({
      method: "PUT",
      url: "/api/items",
      body: { id: item.id, tags: [...new Set([...(item.tags || []), tag])] },
    }), `Tagged #${tag}`);
  };

  const bulkSetCategory = (name: string) => {
    const ids = Array.from(selectedIds);
    runBulk(ids, item => ({
      method: "PUT",
      url: "/api/items",
      body: { id: item.id, category: name },
    }), `Moved to ${name}`);
  };

  const bulkArchive = (archive: boolean) => {
    const ids = Array.from(selectedIds);
    const archivedAt = archive ? new Date().toISOString() : null;
    runBulk(ids, item => ({
      method: "PUT",
      url: "/api/items",
      body: { id: item.id, archivedAt },
    }), archive ? "Archived" : "Unarchived");
  };

  const bulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (!confirm(`Delete ${ids.length} item${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    runBulk(ids, item => ({
      method: "DELETE",
      url: `/api/items?id=${encodeURIComponent(item.id)}`,
    }), "Deleted");
  };

  // Signed share links (roadmap 3.3): mint a read-only /shared/<id>?share=
  // URL and put it on the clipboard.
  const handleShare = async (id: string) => {
    if (isOfflineTempId(id)) return;
    try {
      const res = await fetch(`/api/items/share?id=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        showToast(data?.error || "Failed to create share link", "error");
        return;
      }
      await navigator.clipboard.writeText(data.url);
      showToast("Read-only share link copied", "success");
    } catch {
      showToast("Failed to create share link", "error");
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
    if (isOfflineTempId(item.id)) {
      showToast("This card is waiting to sync — editable after reconnecting", "error");
      return;
    }
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
      recurrence: item.recurrence || "",
      reminderId: reminder?.id || "",
      reminderDueAt: toDateTimeLocal(reminder?.dueAt),
      reminderMessage: reminder?.message || "",
      reminderRecurrence: reminder?.recurrence || "",
      relatedItemIds: relatedItemsForId(item.id).map(related => related.id),
    });
    setEditingId(item.id);
    setEditBaseUpdatedAt(item.updatedAt || null);
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
    // Server already scopes archived/active, but poll deltas and broadcast
    // messages can slip cards from the other side into local state.
    .filter(i => (archivedOnly ? !!i.archivedAt : !i.archivedAt))
    .filter(i => itemInDateRange(i, { preset: datePreset, from: dateFrom, to: dateTo }))
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
    .filter(i => !tagFilter || (i.tags || []).includes(tagFilter))
    .filter(i => {
      if (!withNotesOnly) return true;
      const hasLegacy = (i.notes?.trim().length ?? 0) > 0;
      const hasEntry = (i.noteEntries || []).some(e => e.body?.trim().length > 0);
      return hasLegacy || hasEntry;
    })
    .filter(i => !favouritesOnly || !!i.favourite)
    .filter(i => !actionOnly || !!i.actionRequired)
    .filter(i => !remindersOnly || reminders.some(r => r.itemId === i.id && r.status === "pending"))
    .filter(i => !readLaterOnly || isToRead(i))
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

  const activeFilterCount = [
    view !== "all",
    catFilter !== "all",
    sourceFilter !== null,
    tagFilter !== null,
    withNotesOnly,
    favouritesOnly,
    actionOnly,
    remindersOnly,
    readLaterOnly,
    reviewMode,
    archivedOnly,
    datePreset !== "all",
    search.trim().length > 0,
  ].filter(Boolean).length;

  // Timeline view (roadmap 2.3): when a date filter is active, group the
  // visible cards into day buckets with col-span headers.
  const timelineGroups = datePreset !== "all" ? groupItemsByDay(visibleItems) : null;
  const timelineHeaderLabel = (key: string) => {
    const date = new Date(`${key}T12:00:00`);
    if (Number.isNaN(date.getTime())) return key;
    return date.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  };

  const allTags = [...new Set(items.flatMap(i => i.tags || []))];
  const withNotesCount = items.filter(i => {
    const hasLegacy = (i.notes?.trim().length ?? 0) > 0;
    const hasEntry = (i.noteEntries || []).some(e => e.body?.trim().length > 0);
    return hasLegacy || hasEntry;
  }).length;
  const favouriteCount = items.filter(i => i.favourite).length;
  const actionCount = items.filter(i => i.actionRequired).length;
  const reminderCount = reminders.filter(r => r.status === "pending").length;
  const readLaterCount = items.filter(i => isToRead(i)).length;
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
          {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} delay={i * 0.1} />)}
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
            <TelegramHelpMenu
              memoryOfWeekEnabled={memoryOfWeekEnabled}
              memoryOfWeekSaving={memoryOfWeekSaving}
              onToggleMemoryOfWeek={updateMemoryOfWeekEnabled}
            />
            <button
              onClick={() => setAskOpen(true)}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-[#E8A838] hover:border-[#E8A83860] active:scale-95 transition"
              aria-label="Ask my brain (AI chat over your cards)"
              title="Ask my brain"
            >✦</button>
            <button
              onClick={toggleDesktopNotify}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-sm flex items-center justify-center border active:scale-95 transition"
              style={{
                color: desktopNotify ? "#E8A838" : "#6b7280",
                borderColor: desktopNotify ? "#E8A83860" : "#1E2128",
              }}
              aria-label={desktopNotify ? "Disable reminder notifications" : "Enable reminder notifications"}
              title={desktopNotify ? "Reminder notifications: on" : "Reminder notifications: off"}
            >{desktopNotify ? "◉" : "◌"}</button>
            <button
              onClick={() => setVaultOpen(true)}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-[#E8A838] hover:border-[#E8A83860] active:scale-95 transition"
              aria-label="Open encrypted vault"
              title="Encrypted vault"
            >▣</button>
            <button
              onClick={() => setDensity(nextViewMode)}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
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
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition disabled:opacity-60"
              aria-label="Refresh app and items"
              title="Refresh app and items"
            >
              <span style={{ display: "inline-block", animation: isRefreshing ? "spin 0.8s linear infinite" : undefined }}>↻</span>
            </button>
            <button
              onClick={() => setShowCatManager(true)}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
              aria-label="Manage categories"
            >⊞</button>
            <button
              onClick={handleExport}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
              aria-label="Download JSON backup"
              title="Download backup (JSON)"
            >↓</button>
            <button
              onClick={() => { closeForm(); setShowAdd(true); }}
              className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl text-white text-xl flex items-center justify-center font-light transition-transform hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)", boxShadow: "0 4px 16px rgba(232,168,56,0.35)" }}
              aria-label="Add new item"
            >+</button>
          </div>
        </div>

        {/* Quick capture */}
        <QuickCaptureBar saving={quickCapturing} onCapture={captureQuick} />

        {/* Filter bar: search / type / category / tags / more / sort */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchInputRef={searchInputRef}
          searching={searching}
          view={view}
          onViewChange={setView}
          counts={counts}
          catFilter={catFilter}
          onCatFilterChange={setCatFilter}
          parentCats={parentCats}
          getChildren={getChildren}
          getCatNamesUnderParent={getCatNamesUnderParent}
          usedCatNames={usedCatNames}
          itemCount={items.length}
          sourceCounts={sourceCounts}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          tagsByCount={tagsByCount}
          tagCounts={tagCounts}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          tagColor={tagColor}
          duplicateGroupCount={duplicateGroups.length}
          onOpenTagManager={() => setShowTagManager(true)}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          withNotesOnly={withNotesOnly}
          onWithNotesOnly={setWithNotesOnly}
          withNotesCount={withNotesCount}
          favouritesOnly={favouritesOnly}
          onFavouritesOnly={setFavouritesOnly}
          favouriteCount={favouriteCount}
          actionOnly={actionOnly}
          onActionOnly={setActionOnly}
          actionCount={actionCount}
          remindersOnly={remindersOnly}
          onRemindersOnly={setRemindersOnly}
          reminderCount={reminderCount}
          readLaterOnly={readLaterOnly}
          onReadLaterOnly={setReadLaterOnly}
          readLaterCount={readLaterCount}
          reviewMode={reviewMode}
          onReviewMode={setReviewMode}
          reviewCount={reviewCount}
          archivedOnly={archivedOnly}
          onArchivedOnly={setArchivedOnly}
          datePreset={datePreset}
          onDatePreset={setDatePreset}
          dateFrom={dateFrom}
          onDateFrom={setDateFrom}
          dateTo={dateTo}
          onDateTo={setDateTo}
          selectMode={selectMode}
          onSelectMode={(v) => { setSelectMode(v); if (!v) setSelectedIds(new Set()); }}
        />
      </div>

      {/* Saved searches — named filter snapshots, synced via settings */}
      {(savedSearches.length > 0 || activeFilterCount > 0) && (
        <div className="px-5 pt-2 pb-1 flex gap-1.5 items-center flex-wrap">
          <span className="text-[10px] font-mono text-gray-600">Saved:</span>
          {savedSearches.map(entry => (
            <span
              key={entry.id}
              className="inline-flex items-center rounded-full border border-[#9B51E050] bg-[#9B51E012] text-[#C39BE8]"
            >
              <button
                onClick={() => applySavedSearch(entry)}
                className="px-2.5 py-0.5 text-[11px] font-mono whitespace-nowrap hover:text-[#E8A838] transition"
                title="Apply this saved search"
              >
                ◈ {entry.name}
              </button>
              <button
                onClick={() => deleteSavedSearch(entry.id)}
                className="pr-2 text-[11px] opacity-50 hover:opacity-100 transition"
                aria-label={`Delete saved search ${entry.name}`}
                title="Delete saved search"
              >
                ×
              </button>
            </span>
          ))}
          {activeFilterCount > 0 && (
            <button
              onClick={handleSaveCurrentSearch}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-mono whitespace-nowrap border border-dashed border-gray-600 text-gray-400 hover:text-[#E8A838] hover:border-[#E8A83860] transition"
              title="Save the current search + filters as a chip"
            >
              + Save current
            </button>
          )}
        </div>
      )}

      {/* Active structured-filter chips */}
      {(view !== "all" || catFilter !== "all" || sourceFilter || tagFilter) && (
        <div className="px-5 pt-2 pb-1 flex gap-1.5 items-center flex-wrap">
          <span className="text-[10px] font-mono text-gray-600">Filtered:</span>
          {view !== "all" && (
            <button
              onClick={() => setView("all")}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap"
              style={{ border: `1px solid ${TYPES[view].color}50`, background: `${TYPES[view].color}15`, color: TYPES[view].color }}
              title="Clear type filter"
            >{TYPES[view].icon} {TYPES[view].label} ×</button>
          )}
          {catFilter !== "all" && (
            <button
              onClick={() => setCatFilter("all")}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap"
              style={{ border: `1px solid ${getCatColor(catFilter)}50`, background: `${getCatColor(catFilter)}15`, color: getCatColor(catFilter) }}
              title="Clear category filter"
            >⊞ {catFilter} ×</button>
          )}
          {sourceFilter && (
            <button
              onClick={() => setSourceFilter(null)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap border border-gray-600 text-gray-300 hover:border-gray-400"
              title="Clear source filter"
            >◈ {sourceCounts.find(src => src.key === sourceFilter)?.label || sourceFilter} ×</button>
          )}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition whitespace-nowrap"
              style={{ border: `1px solid ${tagColor(tagFilter)}50`, background: `${tagColor(tagFilter)}15`, color: tagColor(tagFilter) }}
              title="Clear tag filter"
            >#{tagFilter} ×</button>
          )}
          <button
            onClick={() => { setView("all"); setCatFilter("all"); setSourceFilter(null); setTagFilter(null); }}
            className="text-[10px] font-mono text-gray-600 hover:text-gray-300 transition ml-1"
          >Clear all</button>
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

      {/* Items */}
      <div
        className={`px-4 ${density === "compact" ? "grid grid-cols-1 gap-2 sm:[grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),17rem))]" : density === "list" ? "flex flex-col gap-1.5" : ""}`}
      >
        {searchFuzzy && search.trim() && filtered.length > 0 && (
          <div className={`mb-2 rounded-lg border border-[#E8A83840] bg-[#E8A83810] px-3 py-2 text-[11px] font-mono text-[#E8A838] ${density === "compact" ? "col-span-full" : ""}`}>
            No exact matches for &ldquo;{search.trim()}&rdquo; — showing close matches
          </div>
        )}
        {archivedOnly && (
          <div className={`mb-2 rounded-lg border border-[#9aa1ad40] bg-[#9aa1ad10] px-3 py-2 text-[11px] font-mono text-gray-300 ${density === "compact" ? "col-span-full" : ""}`}>
            Viewing archived cards — restore with ↩ on a card, or toggle Archived off under More
          </div>
        )}
        {selectMode && selectedIds.size === 0 && (
          <div className={`mb-2 flex items-center justify-between gap-3 rounded-lg border border-[#E8A83840] bg-[#E8A83810] px-3 py-2 text-[11px] font-mono text-[#E8A838] ${density === "compact" ? "col-span-full" : ""}`}>
            <span>Select mode — tap cards to select them for bulk actions</span>
            <button onClick={exitSelectMode} className="shrink-0 underline underline-offset-2 hover:opacity-80">
              Exit
            </button>
          </div>
        )}
        {pendingOffline > 0 && (
          <div className={`mb-2 flex items-center justify-between gap-3 rounded-lg border border-[#E8A83840] bg-[#E8A83810] px-3 py-2 text-[11px] font-mono text-[#E8A838] ${density === "compact" ? "col-span-full" : ""}`}>
            <span>{pendingOffline} change{pendingOffline === 1 ? "" : "s"} waiting to sync — will retry when back online</span>
            <button onClick={() => replayOfflineQueue()} className="shrink-0 underline underline-offset-2 hover:opacity-80">
              Sync now
            </button>
          </div>
        )}
        {filtered.length === 0 && (
          <EmptyState
            variant={items.length === 0 ? (itemsError ? "error" : "new") : "no-matches"}
            className={density === "compact" ? "col-span-full" : ""}
            onAddFirst={() => { closeForm(); setShowAdd(true); }}
            onClearFilters={clearAllFilters}
            onRetry={() => fetchItems(search.trim() || undefined)}
          />
        )}

        {(timelineGroups ?? [{ key: "", items: visibleItems }]).map(group => {
          let runningIdx = 0;
          return (
            <div key={group.key || "all"} className="contents">
              {group.key && (
                <div className={`mb-1 mt-2 first:mt-0 text-[11px] font-mono uppercase tracking-[0.15em] text-gray-500 ${density === "compact" ? "col-span-full" : ""}`}>
                  {timelineHeaderLabel(group.key)} <span className="opacity-50">· {group.items.length}</span>
                </div>
              )}
              {group.items.map(item => {
                const idx = runningIdx++;
                const card = (
                  <ItemCard
                    key={item.id}
                    item={item}
                    idx={idx}
                    expanded={expandedId === item.id}
                    density={density}
                    isSummarizing={summarizing === item.id}
                    isDragTarget={dragOverCardId === item.id}
                    relatedItems={relatedItemsForId(item.id)}
                    reminder={activeReminderForId(item.id)}
                    failedPreviewUrls={failedPreviewUrls}
                    getCatColor={getCatColor}
                    onToggleExpanded={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    setDragTargetId={setDragOverCardId}
                    onAttachFiles={files => attachFilesToItem(item.id, files)}
                    onEdit={() => handleEdit(item)}
                    onPopOut={() => popOutCard(item.id)}
                    onDelete={() => handleDelete(item.id)}
                    onArchive={() => handleArchive(item.id)}
                    onCycleReadingStatus={() => handleCycleReadingStatus(item.id)}
                    onShare={() => handleShare(item.id)}
                    onPreviewImageFailed={markPreviewImageFailed}
                    onToggleChecklistRow={rowId => toggleChecklistItemOnCard(item, rowId)}
                    onOpenCard={openCardInCurrentTab}
                    onToggleFlag={flag => handleToggleFlag(item.id, flag)}
                    onPin={() => handlePin(item.id)}
                    onSummarize={() => handleSummarize(item.id)}
                  />
                );
                if (!selectMode) return card;
                const selected = selectedIds.has(item.id);
                // Selection overlay: captures the click so the card below
                // never expands; visual ring marks selected cards.
                return (
                  <div key={item.id} className="relative">
                    {card}
                    <button
                      onClick={() => toggleSelected(item.id)}
                      className="absolute inset-0 z-20 rounded-xl transition"
                      style={{
                        border: selected ? "2px solid #E8A838" : "2px solid transparent",
                        background: selected ? "#E8A83812" : "transparent",
                      }}
                      aria-label={selected ? "Deselect card" : "Select card"}
                      aria-pressed={selected}
                    >
                      <span
                        className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold"
                        style={{
                          borderColor: selected ? "#E8A838" : "#9aa1ad80",
                          background: selected ? "#E8A838" : "#0D0F12C0",
                          color: selected ? "#13161B" : "#9aa1ad",
                        }}
                      >
                        {selected ? "✓" : ""}
                      </span>
                    </button>
                  </div>
                );
              })}
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

      {/* Bulk actions bar (roadmap 2.5) */}
      {selectMode && selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          categories={categories}
          archivedView={archivedOnly}
          busy={bulkBusy}
          onAddTag={bulkAddTag}
          onSetCategory={bulkSetCategory}
          onArchive={bulkArchive}
          onDelete={bulkDelete}
          onSelectAll={() => setSelectedIds(new Set(filtered.filter(i => !isOfflineTempId(i.id)).map(i => i.id)))}
          onClear={exitSelectMode}
        />
      )}

      {askOpen && <AskBrainPanel onClose={() => setAskOpen(false)} onOpenCard={(id) => { setAskOpen(false); openCardInCurrentTab(id); }} />}

      {vaultOpen && <Vault onClose={() => setVaultOpen(false)} />}

      {/* Add/Edit Modal */}
      {showAdd && (
        <ItemFormModal
          form={form}
          setForm={setForm}
          templates={cardTemplates}
          onApplyTemplate={applyCardTemplate}
          onSaveTemplate={saveCurrentAsTemplate}
          onDeleteTemplate={deleteCardTemplate}
          editingId={editingId}
          saving={saving}
          uploading={uploading}
          items={items}
          allParentCats={allParentCats}
          getChildren={getChildren}
          restoredDraftKeyRef={restoredDraftKeyRef}
          fileInputRef={fileInputRef}
          pickerOpen={pickerOpen}
          setPickerOpen={setPickerOpen}
          pickerSearch={pickerSearch}
          setPickerSearch={setPickerSearch}
          relatedPickerOpen={relatedPickerOpen}
          setRelatedPickerOpen={setRelatedPickerOpen}
          relatedPickerSearch={relatedPickerSearch}
          setRelatedPickerSearch={setRelatedPickerSearch}
          closeForm={closeForm}
          handleSave={handleSave}
          handleFileUpload={handleFileUpload}
          pasteFromClipboard={pasteFromClipboard}
          handleSmartPaste={handleSmartPaste}
          openCardInCurrentTab={openCardInCurrentTab}
          popOutCard={popOutCard}
        />
      )}

      {conflict && (
        <ConflictDialog
          serverItem={conflict}
          onUseServer={() => {
            const server = conflict;
            setConflict(null);
            handleEdit(server);
          }}
          onOverwrite={() => {
            setConflict(null);
            handleSave(false, true);
          }}
        />
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
