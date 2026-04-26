"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { SYNC_CHANNEL, getSyncClientId, type SyncMessage, type SyncPayload } from "@/lib/sync";

type ItemType = "note" | "link" | "clip" | "thought" | "task" | "memory";

interface Attachment {
  url: string;
  name: string;
  contentType: string;
  size: number;
}

interface Item {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  url: string;
  notes: string;
  tags: string[];
  category: string;
  pinned: boolean;
  attachments?: Attachment[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  siteName: string;
  favicon: string;
  createdAt: string;
  updatedAt: string;
}

const TYPES: Record<ItemType, { icon: string; label: string; color: string }> = {
  note: { icon: "✎", label: "Note", color: "#E8A838" },
  link: { icon: "◈", label: "Link", color: "#5B8DEF" },
  clip: { icon: "✂", label: "Clip", color: "#6FCF97" },
  thought: { icon: "◉", label: "Thought", color: "#BB6BD9" },
  task: { icon: "☐", label: "Task", color: "#56CCF2" },
  memory: { icon: "💡", label: "Memory", color: "#F2C94C" },
};

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

  const [form, setForm] = useState({
    type: "note" as ItemType,
    title: "",
    content: "",
    url: "",
    notes: "",
    tags: "",
    category: "",
  });

  const channelRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef<string>("");
  const dirtyRef = useRef(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const appendNoteEntry = () => {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const divider = `--- ${stamp} ---\n`;
    setForm(f => {
      const trimmed = f.notes.replace(/\s+$/, "");
      const next = trimmed ? `${trimmed}\n\n${divider}` : divider;
      return { ...f, notes: next };
    });
    setDirty(true);
    requestAnimationFrame(() => {
      const el = notesRef.current;
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
        el.scrollTop = el.scrollHeight;
      }
    });
  };

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const applyItem = useCallback((next: Item) => {
    setItem(next);
    setForm({
      type: next.type,
      title: next.title || "",
      content: next.content || "",
      url: next.url || "",
      notes: next.notes || "",
      tags: (next.tags || []).join(", "),
      category: next.category || "",
    });
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
  }, [id, applyItem]);

  const broadcast = (msg: SyncPayload) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.postMessage({ ...msg, source: clientIdRef.current } as SyncMessage);
  };

  const onField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    if (!id || saving) return;
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    try {
      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...form, tags }),
      });
      if (!res.ok) { setSaving(false); return; }
      const saved: Item = await res.json();
      applyItem(saved);
      setSavedAt(Date.now());
      broadcast({ type: "item-updated", item: saved });
    } catch {}
    setSaving(false);
  };

  const reloadFromRemote = () => {
    setRemoteUpdate(null);
    fetchItem();
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

  return (
    <div className="min-h-screen bg-brand-dark text-gray-200 p-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: t.color }}>{t.icon}</span>
        <span className="text-xs font-mono text-gray-500">{t.label}</span>
        {item.category && (
          <span className="text-xs font-mono text-gray-500">· {item.category}</span>
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

      <div className="flex gap-1.5 mb-4 flex-wrap">
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

      <input
        value={form.title}
        onChange={e => onField("title", e.target.value)}
        placeholder="Title"
        aria-label="Title"
        className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 placeholder:text-gray-500"
      />

      <textarea
        value={form.content}
        onChange={e => onField("content", e.target.value)}
        placeholder="Content / description..."
        aria-label="Content"
        rows={10}
        className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 resize-y leading-relaxed placeholder:text-gray-500"
      />

      <label className="block text-[11px] font-mono text-gray-400 mb-1.5 tracking-wide flex items-center gap-2">
        <span>Notes</span>
        <span className="text-gray-600 font-normal">(your annotations — append timestamped entries to keep a running log)</span>
      </label>
      <textarea
        ref={notesRef}
        value={form.notes}
        onChange={e => onField("notes", e.target.value)}
        placeholder={form.type === "link" || form.type === "clip" ? "My annotations on this link..." : "Add notes about this card..."}
        aria-label="Notes"
        rows={form.type === "link" || form.type === "clip" ? 4 : 6}
        className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-400 italic outline-none mb-1.5 resize-y leading-relaxed placeholder:text-gray-500"
      />
      <button
        type="button"
        onClick={appendNoteEntry}
        className="mb-2.5 text-[11px] font-mono text-gray-500 hover:text-gray-300 transition"
      >
        + Append timestamped entry
      </button>

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
          onClick={() => {
            // window.close() doesn't work in Tauri windows — use the custom command
            const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
            if (tauri?.invoke && id) {
              tauri.invoke("close_card_window", { label: `card-${id}` })
                .catch((err: unknown) => console.error("[card] close failed:", err));
              return;
            }
            window.close();
          }}
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
