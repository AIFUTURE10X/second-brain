"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import TaskChecklistEditor from "@/components/TaskChecklistEditor";
import { SYNC_CHANNEL, getSyncClientId, type SyncMessage, type SyncPayload } from "@/lib/sync";
import { mergeReminderDateTimeParts, splitReminderDateTime } from "@/lib/reminders.mjs";
import { newChecklistItem, normalizeChecklistItems, type ChecklistItem } from "@/lib/task-checklists";
import { ensureWebsiteLinkUrl, extractCardLinks, formatCardLinkLabel } from "@/lib/card-links";
import { localFileViewerHref } from "@/lib/local-file-links";
import { showToast } from "@/components/Toast";
import { copyToClipboard } from "@/lib/clipboard";
import { openLocalPathInDesktop } from "@/lib/desktop";

type ItemType = "note" | "link" | "clip" | "thought" | "task" | "memory" | "folder";

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

interface WebsiteLink {
  url: string;
  label: string;
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
  websiteLinks?: WebsiteLink[];
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
  itemAId: string;
  itemBId: string;
  itemA: RelatedItemSummary;
  itemB: RelatedItemSummary;
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

function toDateTimeLocal(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const TYPES: Record<ItemType, { icon: string; label: string; color: string }> = {
  note: { icon: "✎", label: "Note", color: "#E8A838" },
  link: { icon: "◈", label: "Link", color: "#5B8DEF" },
  clip: { icon: "✂", label: "Clip", color: "#6FCF97" },
  thought: { icon: "◉", label: "Thought", color: "#BB6BD9" },
  task: { icon: "☐", label: "Task", color: "#56CCF2" },
  memory: { icon: "💡", label: "Memory", color: "#F2C94C" },
  folder: { icon: "📁", label: "Folder", color: "#F2994A" },
};

const REMINDER_TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const totalMinutes = 7 * 60 + i * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

export default function CardPopoutPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [remoteUpdate, setRemoteUpdate] = useState<number | null>(null);
  const [relatedItems, setRelatedItems] = useState<RelatedItemSummary[]>([]);
  const [reminder, setReminder] = useState<Reminder | null>(null);

  const [form, setForm] = useState({
    type: "note" as ItemType,
    title: "",
    content: "",
    url: "",
    noteEntries: [] as NoteEntry[],
    checklistItems: [] as ChecklistItem[],
    websiteLinks: [] as WebsiteLink[],
    tags: "",
    category: "",
    favourite: false,
    actionRequired: false,
    reminderId: "",
    reminderDueAt: "",
    reminderMessage: "",
  });
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const cardLinks = extractCardLinks(form);

  const channelRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>("");
  const dirtyRef = useRef(false);
  const focusEntryIdRef = useRef<string | null>(null);
  const entryRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const addNoteEntry = () => {
    const now = new Date().toISOString();
    const entry: NoteEntry = { id: newEntryId(), body: "", createdAt: now, updatedAt: now };
    focusEntryIdRef.current = entry.id;
    setForm(f => ({ ...f, noteEntries: [...f.noteEntries, entry] }));
    setDirty(true);
  };

  const updateNoteEntry = (id: string, body: string) => {
    const now = new Date().toISOString();
    setForm(f => ({
      ...f,
      noteEntries: f.noteEntries.map(e => e.id === id ? { ...e, body, updatedAt: now } : e),
    }));
    setDirty(true);
  };

  const deleteNoteEntry = (id: string) => {
    setForm(f => ({ ...f, noteEntries: f.noteEntries.filter(e => e.id !== id) }));
    setDirty(true);
  };

  const commitNewLink = () => {
    const url = newLinkUrl.trim();
    if (!url) return;
    setForm(f => ({ ...f, websiteLinks: [...f.websiteLinks, { url, label: newLinkLabel.trim() }] }));
    setNewLinkUrl("");
    setNewLinkLabel("");
    setDirty(true);
  };

  const removeWebsiteLink = (index: number) => {
    setForm(f => ({ ...f, websiteLinks: f.websiteLinks.filter((_, i) => i !== index) }));
    setDirty(true);
  };

  const addChecklistRow = () => {
    setForm(f => ({ ...f, checklistItems: [...f.checklistItems, newChecklistItem()] }));
    setDirty(true);
  };

  const updateChecklistRowText = (id: string, text: string) => {
    setForm(f => ({
      ...f,
      checklistItems: f.checklistItems.map(item => item.id === id ? { ...item, text } : item),
    }));
    setDirty(true);
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
    setDirty(true);
  };

  const deleteChecklistRow = (id: string) => {
    setForm(f => ({ ...f, checklistItems: f.checklistItems.filter(item => item.id !== id) }));
    setDirty(true);
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

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const applyItem = useCallback((next: Item) => {
    setItem(next);
    let entries = Array.isArray(next.noteEntries) ? next.noteEntries : [];
    if (entries.length === 0 && next.notes && next.notes.trim()) {
      // Legacy notes field — surface as a single entry so it can be split/edited
      const stamp = next.createdAt || new Date().toISOString();
      entries = [{ id: newEntryId(), body: next.notes, createdAt: stamp, updatedAt: stamp }];
    }
    setForm(f => ({
      type: next.type,
      title: next.title || "",
      content: next.content || "",
      url: next.url || "",
      noteEntries: entries,
      checklistItems: next.checklistItems || [],
      websiteLinks: next.websiteLinks || [],
      tags: (next.tags || []).join(", "),
      category: next.category || "",
      favourite: !!next.favourite,
      actionRequired: !!next.actionRequired,
      reminderId: f.reminderId,
      reminderDueAt: f.reminderDueAt,
      reminderMessage: f.reminderMessage,
    }));
    setDirty(false);
  }, []);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    console.log("[card] fetching", id);
    try {
      const res = await fetch(`/api/items?id=${encodeURIComponent(id)}`);
      console.log("[card] fetch response", { status: res.status, ok: res.ok });
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      if (!res.ok) { setLoading(false); return; }
      const row: Item = await res.json();
      console.log("[card] item loaded:", row.title || row.id);
      applyItem(row);
      setLoading(false);
      document.title = row.title ? `${row.title} — Second Brain` : "Card — Second Brain";
    } catch (err) {
      console.error("[card] fetch failed:", err);
      setLoading(false);
    }
  }, [id, applyItem]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  const fetchRelations = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/item-relations?itemId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const rows: ItemRelation[] = await res.json();
      setRelatedItems(rows
        .map(rel => rel.itemAId === id ? rel.itemB : rel.itemA)
        .filter(Boolean));
    } catch {}
  }, [id]);

  useEffect(() => { fetchRelations(); }, [fetchRelations]);

  const fetchReminder = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/reminders?itemId=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const rows: Reminder[] = await res.json();
      const active = rows
        .filter(row => row.status !== "done")
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0] || null;
      setReminder(active);
      setForm(f => ({
        ...f,
        reminderId: active?.id || "",
        reminderDueAt: toDateTimeLocal(active?.dueAt),
        reminderMessage: active?.message || "",
      }));
    } catch {}
  }, [id]);

  useEffect(() => { fetchReminder(); }, [fetchReminder]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    clientIdRef.current = getSyncClientId();
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (ev: MessageEvent<SyncMessage>) => {
      const msg = ev.data;
      if (!msg || msg.source === clientIdRef.current) return;
      if (msg.type === "item-deleted" && msg.id === id) {
        setDeleted(true);
        return;
      }
      if (msg.type === "relations-updated" && msg.itemId === id) {
        fetchRelations();
        return;
      }
      if (msg.type === "reminders-updated" && (!msg.itemId || msg.itemId === id)) {
        fetchReminder();
        return;
      }
      if ((msg.type === "item-updated" || msg.type === "item-created")) {
        const incoming = msg.item as Item;
        if (incoming.id !== id) return;
        if (dirtyRef.current) {
          setRemoteUpdate(Date.now());
          return;
        }
        applyItem(incoming);
      }
    };
    return () => { ch.close(); channelRef.current = null; };
  }, [id, applyItem, fetchRelations, fetchReminder]);

  const broadcast = (msg: SyncPayload) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.postMessage({ ...msg, source: clientIdRef.current } as SyncMessage);
  };

  const onField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const syncReminder = async () => {
    if (!id) return;
    const reminderId = form.reminderId.trim();
    const dueInput = form.reminderDueAt.trim();
    const message = form.reminderMessage.trim();

    if (!dueInput) {
      if (reminderId) {
        await fetch(`/api/reminders?id=${encodeURIComponent(reminderId)}`, { method: "DELETE" });
        setReminder(null);
        broadcast({ type: "reminders-updated", itemId: id });
      }
      return;
    }

    const dueAt = new Date(dueInput);
    if (Number.isNaN(dueAt.getTime())) return;

    const payload = { itemId: id, message, dueAt: dueAt.toISOString(), status: "pending" };
    const res = await fetch("/api/reminders", {
      method: reminderId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reminderId ? { id: reminderId, ...payload } : payload),
    });
    if (!res.ok) return;
    const savedReminder: Reminder = await res.json();
    setReminder(savedReminder);
    setForm(f => ({ ...f, reminderId: savedReminder.id }));
    broadcast({ type: "reminders-updated", itemId: id });
  };

  const updateReminderDate = (date: string) => {
    setForm(f => {
      const parts = splitReminderDateTime(f.reminderDueAt);
      return { ...f, reminderDueAt: mergeReminderDateTimeParts(date, parts.time) };
    });
    setDirty(true);
  };

  const updateReminderTime = (time: string) => {
    setForm(f => {
      const parts = splitReminderDateTime(f.reminderDueAt);
      return { ...f, reminderDueAt: mergeReminderDateTimeParts(parts.date, time) };
    });
    setDirty(true);
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
    setDirty(true);
  };

  const save = async () => {
    if (!id || saving) return;
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    const { reminderId, reminderDueAt, reminderMessage, websiteLinks: rawWebsiteLinks, ...itemForm } = form;
    // Drop entries whose body is entirely empty so we don't persist accidental blanks.
    const entries = form.noteEntries.filter(e => e.body.trim().length > 0);
    const checklistItems = normalizeChecklistItems(form.checklistItems);
    // Drop blank rows and normalize bare hosts to https:// before saving.
    const websiteLinks = rawWebsiteLinks
      .map(link => ({ url: ensureWebsiteLinkUrl(link.url), label: link.label.trim() }))
      .filter(link => link.url);
    // Once entries exist, retire the legacy single-blob `notes` field so it
    // doesn't reappear next load alongside the migrated entry.
    const legacyClear = entries.length > 0 ? { notes: "" } : {};
    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...itemForm, tags, noteEntries: entries, checklistItems, websiteLinks, ...legacyClear }),
      });
      if (!res.ok) { setSaving(false); return; }
      const saved: Item = await res.json();
      applyItem(saved);
      setSavedAt(Date.now());
      broadcast({ type: "item-updated", item: saved });
      await syncReminder();
    } catch {}
    setSaving(false);
  };

  const reloadFromRemote = () => {
    setRemoteUpdate(null);
    fetchItem();
  };

  const openRelatedCard = (related: RelatedItemSummary) => {
    window.location.assign(new URL(`/card/${related.id}`, window.location.origin).toString());
  };

  const closeCardPage = async () => {
    const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
    if (tauri?.invoke && id) {
      try {
        await tauri.invoke("close_card_window", { label: `card-${id}` });
        return;
      } catch (err) {
        console.error("[card] close failed:", err);
      }
    }

    window.location.href = "/";
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  if (!id || notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 p-6 text-center">
        <div>
          <div className="text-xl mb-2">Card not found</div>
          <div className="text-sm text-gray-500">It may have been deleted.</div>
        </div>
      </div>
    );
  }

  if (loading || !item) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm font-mono">
        Loading…
      </div>
    );
  }

  const t = TYPES[item.type] || TYPES.note;
  const headerIcon = item.type === "task" && item.completed ? "☑" : t.icon;

  return (
    <div className="min-h-screen bg-brand-dark text-gray-200 p-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: t.color }}>{headerIcon}</span>
        <span className="text-xs font-mono text-gray-500">{t.label}</span>
        {item.category && (
          <span className="text-xs font-mono text-gray-500">· {item.category}</span>
        )}
        {item.type === "task" && item.checklistItems && item.checklistItems.length > 0 && (
          <span className="text-xs font-mono text-gray-500">
            · {item.checklistItems.filter(row => row.completed).length}/{item.checklistItems.length}
          </span>
        )}
        <div className="flex-1" />
        {savedAt && !dirty && (
          <span className="text-[10px] font-mono text-gray-500">saved</span>
        )}
        {dirty && (
          <span className="text-[10px] font-mono text-[#E8A838]">unsaved</span>
        )}
      </div>

      {deleted && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-xs">
          This card was deleted in another window.
        </div>
      )}

      {remoteUpdate && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-[#E8A83860] bg-[#E8A83815] text-[#E8A838] text-xs flex items-center gap-2">
          <span className="flex-1">This card was edited in another window — you have unsaved changes here.</span>
          <button
            onClick={reloadFromRemote}
            className="px-2 py-1 rounded-md border border-[#E8A83860] hover:bg-[#E8A83820] transition"
          >Reload</button>
        </div>
      )}

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {(Object.entries(TYPES) as [ItemType, typeof TYPES.note][]).map(([k, v]) => (
          <button
            key={k}
            onClick={() => onField("type", k)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition"
            style={{
              border: form.type === k ? `1px solid ${v.color}60` : "1px solid #252830",
              background: form.type === k ? `${v.color}15` : "#181B21",
              color: form.type === k ? v.color : "#666",
            }}
          >{v.icon} {v.label}</button>
        ))}
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => onField("favourite", !form.favourite)}
          className="px-3 py-1.5 rounded-md text-[11px] font-mono transition active:scale-95"
          style={{
            border: form.favourite ? "1px solid #F2C94C90" : "1px solid #F2C94C30",
            background: form.favourite ? "#F2C94C25" : "#F2C94C10",
            color: "#F2C94C",
          }}
        >{form.favourite ? "★ Favourite" : "☆ Mark favourite"}</button>
        <button
          type="button"
          onClick={() => onField("actionRequired", !form.actionRequired)}
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
          <label className="text-[11px] font-mono text-gray-400 tracking-wide" htmlFor="card-reminder-due">
            Telegram reminder
          </label>
          {form.reminderDueAt && (
            <button
              type="button"
              onClick={() => {
                onField("reminderDueAt", "");
                onField("reminderMessage", "");
              }}
              className="text-[11px] font-mono text-gray-500 hover:text-red-300 transition"
            >
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2 mb-2">
          <input
            id="card-reminder-due"
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
          onChange={e => onField("reminderMessage", e.target.value)}
          placeholder="What should Telegram remind you about?"
          aria-label="Reminder message"
          className="w-full px-3 py-2 bg-[#101318] border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500"
        />
            </>
          );
        })()}
      </div>

      <input
        value={form.category}
        onChange={e => onField("category", e.target.value)}
        placeholder="Category"
        aria-label="Category"
        className="w-full px-3 py-2 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-3 placeholder:text-gray-500"
      />

      {(form.type === "link" || form.type === "clip") && (
        <input
          value={form.url}
          onChange={e => onField("url", e.target.value)}
          placeholder="URL"
          aria-label="URL"
          className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 placeholder:text-gray-500"
        />
      )}

      {form.type === "folder" && (
        <div className="mb-2.5">
          <div className="flex gap-1.5">
            <input
              value={form.url}
              onChange={e => onField("url", e.target.value)}
              placeholder="C:\Users\you\Documents  (or \\server\share, /Users/you/…)"
              aria-label="Folder or file path"
              className="flex-1 min-w-0 px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none font-mono placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={async () => {
                const path = form.url.trim();
                if (await openLocalPathInDesktop(path)) {
                  showToast("Opening folder…", "success");
                  return;
                }
                const ok = await copyToClipboard(path);
                showToast(ok ? "Path copied — paste into File Explorer" : "Couldn't copy path", ok ? "success" : "error");
              }}
              disabled={!form.url.trim()}
              className="shrink-0 px-3 rounded-lg text-[11px] font-mono border border-[#F2994A40] bg-[#F2994A10] text-[#F2994A] transition hover:brightness-125 active:scale-95 disabled:opacity-40"
              title="Open folder (desktop app) or copy path"
            >📁 Open / Copy</button>
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
            In the desktop app this opens the folder in File Explorer. In a browser it copies the path (browsers can&apos;t open local folders directly).
          </p>
        </div>
      )}

      <input
        value={form.title}
        onChange={e => onField("title", e.target.value)}
        placeholder="Title"
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
        value={form.content}
        onChange={e => onField("content", e.target.value)}
        placeholder="Content / description..."
        aria-label="Content"
        rows={10}
        className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 resize-y leading-relaxed placeholder:text-gray-500"
      />

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
        Website links <span className="text-gray-600 font-normal">(quick links shown on the card)</span>
      </label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {form.websiteLinks.length === 0 ? (
          <span className="text-[11px] text-gray-600 font-mono">No website links yet</span>
        ) : (
          form.websiteLinks.map((link, index) => {
            const normalized = ensureWebsiteLinkUrl(link.url);
            const label = link.label.trim() || formatCardLinkLabel(normalized);
            return (
              <div
                key={index}
                className="flex items-center gap-1.5 rounded-md bg-brand-muted border border-brand-border text-[11px] text-gray-300 transition max-w-full overflow-hidden"
              >
                <a
                  href={localFileViewerHref(normalized)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 min-w-0 pl-2 py-1 hover:text-white transition"
                  title={`Open ${normalized} in a new tab`}
                >
                  <span className="shrink-0 text-type-link">◈</span>
                  <span className="truncate max-w-[220px]">{label}</span>
                  <span className="text-type-link shrink-0">↗</span>
                </a>
                <button
                  type="button"
                  onClick={() => removeWebsiteLink(index)}
                  className="px-2 py-1 text-gray-600 hover:text-red-300 hover:bg-red-500/10 transition shrink-0"
                  aria-label={`Remove ${label}`}
                  title="Remove link"
                >×</button>
              </div>
            );
          })
        )}
      </div>
      <div className="mb-4 flex items-center gap-1.5">
        <input
          value={newLinkUrl}
          onChange={e => setNewLinkUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitNewLink(); } }}
          placeholder="https://example.com"
          aria-label="New website link URL"
          className="flex-1 min-w-0 px-3 py-2 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500 font-mono"
        />
        <input
          value={newLinkLabel}
          onChange={e => setNewLinkLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitNewLink(); } }}
          placeholder="Label"
          aria-label="New website link label"
          className="w-20 sm:w-32 shrink-0 px-3 py-2 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500"
        />
        <button
          type="button"
          onClick={commitNewLink}
          disabled={!newLinkUrl.trim()}
          className="shrink-0 px-3 py-2 rounded-lg text-[11px] font-mono border border-brand-border text-gray-400 hover:text-white hover:border-gray-600 transition disabled:opacity-40"
        >
          + Add
        </button>
      </div>

      {cardLinks.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide">Links</p>
          <div className="flex flex-col gap-1.5">
            {cardLinks.map((link) => (
              <a
                key={link}
                href={localFileViewerHref(link)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-muted px-3 py-2 text-left hover:text-white hover:border-[#5B8DEF60] transition"
                title={link}
              >
                <span className="text-type-link shrink-0">↗</span>
                <span className="text-[12px] text-gray-300 truncate">{formatCardLinkLabel(link)}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {relatedItems.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide">Related cards</p>
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
                      className="flex items-center gap-1.5 min-w-0 text-left hover:text-white transition"
                      title="Open source URL"
                    >
                      <span className="text-[10px] shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                      <span className="text-[11px] text-gray-300 truncate max-w-[220px]">
                        {related.title || related.ogTitle || related.url || "Untitled"}
                      </span>
                      <span className="text-[10px] text-type-link shrink-0">↗</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openRelatedCard(related)}
                      className="flex items-center gap-1.5 min-w-0 text-left hover:text-white transition"
                      title="Open related card"
                    >
                      <span className="text-[10px] shrink-0" style={{ color: relatedType.color }}>{relatedType.icon}</span>
                      <span className="text-[11px] text-gray-300 truncate max-w-[220px]">
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
      <label className="block text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide">
        Tags <span className="text-gray-600 font-normal">(comma-separated)</span>
      </label>
      <input
        value={form.tags}
        onChange={e => onField("tags", e.target.value)}
        placeholder="tag1, tag2"
        aria-label="Tags"
        className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-4 placeholder:text-gray-500"
      />

      <div className="flex gap-2">
        <button
          onClick={closeCardPage}
          className="py-3 px-4 rounded-xl bg-brand-muted border border-brand-border text-gray-500 text-sm font-medium active:scale-95 transition"
        >Close</button>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="flex-1 py-3 rounded-xl text-white text-sm font-semibold transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #F2C94C, #E8A838)", boxShadow: "0 4px 16px rgba(232,168,56,0.25)" }}
        >
          {saving ? "Saving…" : dirty ? "Save (⌘S)" : "Saved"}
        </button>
      </div>

      <div className="mt-4 text-[10px] font-mono text-gray-600 text-center">
        Changes sync live with the main window.
      </div>
    </div>
  );
}
