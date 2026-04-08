"use client";

import { useState, useEffect, useCallback } from "react";

type ItemType = "note" | "link" | "clip" | "thought";

interface Item {
  id: string;
  type: ItemType;
  title: string;
  content: string;
  url: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPES: Record<ItemType, { icon: string; label: string; color: string }> = {
  note: { icon: "✎", label: "Note", color: "#E8A838" },
  link: { icon: "◈", label: "Link", color: "#5B8DEF" },
  clip: { icon: "✂", label: "Clip", color: "#6FCF97" },
  thought: { icon: "◉", label: "Thought", color: "#BB6BD9" },
};

const TAG_COLORS = ["#E8A838", "#5B8DEF", "#6FCF97", "#BB6BD9", "#EB5757", "#56CCF2", "#F2994A", "#9B51E0"];

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

export default function Brain() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"all" | ItemType>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ type: "note" as ItemType, title: "", content: "", url: "", tags: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/items");
      if (res.ok) setItems(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const resetForm = () => {
    setForm({ type: "note", title: "", content: "", url: "", tags: "" });
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.title.trim() && !form.content.trim()) return;
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    try {
      if (editingId) {
        await fetch("/api/items", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form, tags }),
        });
      } else {
        await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, tags }),
        });
      }
      await fetchItems();
      resetForm();
    } catch {}
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/items?id=${id}`, { method: "DELETE" });
    setItems(prev => prev.filter(i => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handlePin = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    await fetch("/api/items", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, pinned: !item.pinned }),
    });
    setItems(prev => prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i));
  };

  const handleEdit = (item: Item) => {
    setForm({ type: item.type, title: item.title, content: item.content || "", url: item.url || "", tags: (item.tags || []).join(", ") });
    setEditingId(item.id);
    setShowAdd(true);
  };

  const filtered = items
    .filter(i => view === "all" || i.type === view)
    .filter(i => {
      if (!search) return true;
      const s = search.toLowerCase();
      return i.title?.toLowerCase().includes(s) || i.content?.toLowerCase().includes(s) || (i.tags || []).some(t => t.toLowerCase().includes(s));
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      const da = new Date(a.createdAt).getTime();
      const db2 = new Date(b.createdAt).getTime();
      return sortBy === "newest" ? db2 - da : da - db2;
    });

  const allTags = [...new Set(items.flatMap(i => i.tags || []))];
  const counts: Record<string, number> = {
    all: items.length,
    ...Object.fromEntries(Object.keys(TYPES).map(k => [k, items.filter(i => i.type === k).length])),
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 font-mono text-sm">Loading your brain...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative pb-24">
      {/* Header */}
      <div className="sticky top-0 z-50 px-5 pt-5 pb-0 border-b border-brand-border" style={{ background: "linear-gradient(180deg, #13161B 0%, #0D0F12 100%)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", background: "linear-gradient(135deg, #E8A838, #EB5757)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              ◆ Second Brain
            </h1>
            <p className="text-[11px] text-gray-600 font-mono mt-0.5">
              {items.length} items · synced
            </p>
          </div>
          <button
            onClick={() => { resetForm(); setShowAdd(true); }}
            className="w-9 h-9 rounded-xl text-white text-xl flex items-center justify-center font-light transition-transform hover:scale-105"
            style={{ background: "linear-gradient(135deg, #E8A838, #EB5757)", boxShadow: "0 4px 16px rgba(232,168,56,0.3)" }}
          >+</button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes, clips, thoughts..."
            className="w-full py-2.5 pl-9 pr-3 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-600"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">⌕</span>
        </div>

        {/* Filters */}
        <div className="flex gap-1 overflow-x-auto pb-3">
          {[{ key: "all" as const, label: "All", icon: "◇" }, ...Object.entries(TYPES).map(([k, v]) => ({ key: k as "all" | ItemType, label: v.label, icon: v.icon }))].map(tab => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-mono font-medium transition-all"
              style={{
                border: view === tab.key ? "1px solid #E8A83850" : "1px solid transparent",
                background: view === tab.key ? "#E8A83815" : "transparent",
                color: view === tab.key ? "#E8A838" : "#666",
              }}
            >
              {tab.icon} {tab.label} <span className="opacity-50 text-[10px]">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap px-5 py-2.5">
          {allTags.slice(0, 12).map((tag, i) => (
            <button
              key={tag}
              onClick={() => setSearch(search === tag ? "" : tag)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-mono transition"
              style={{
                border: `1px solid ${TAG_COLORS[i % TAG_COLORS.length]}30`,
                background: search === tag ? `${TAG_COLORS[i % TAG_COLORS.length]}20` : "transparent",
                color: TAG_COLORS[i % TAG_COLORS.length],
              }}
            >#{tag}</button>
          ))}
        </div>
      )}

      {/* Sort */}
      <div className="flex justify-end px-5 py-1">
        <button onClick={() => setSortBy(s => s === "newest" ? "oldest" : "newest")} className="text-[11px] text-gray-600 font-mono">
          ↕ {sortBy === "newest" ? "Newest" : "Oldest"}
        </button>
      </div>

      {/* Items */}
      <div className="px-4">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-700">
            <div className="text-4xl mb-3">◇</div>
            <p className="text-sm font-mono">{items.length === 0 ? "Your second brain is empty" : "No matches"}</p>
            <p className="text-xs mt-1.5 text-gray-800">{items.length === 0 ? "Tap + to add your first item" : "Try a different search"}</p>
          </div>
        )}

        {filtered.map((item, idx) => {
          const t = TYPES[item.type] || TYPES.note;
          const expanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => setExpandedId(expanded ? null : item.id)}
              className="bg-brand-card rounded-xl p-4 mb-2.5 cursor-pointer transition-all"
              style={{
                border: `1px solid ${item.pinned ? "#E8A83840" : "#1E2128"}`,
                animation: `fadeSlide 0.3s ease ${idx * 0.03}s both`,
              }}
            >
              <div className="flex gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                  style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}
                >{t.icon}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.pinned && <span className="text-[10px]">📌</span>}
                    <p className={`text-sm font-medium text-gray-200 ${expanded ? "" : "truncate"}`}>{item.title || "Untitled"}</p>
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-[11px] text-type-link font-mono block mt-1 truncate hover:underline"
                    >↗ {item.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}</a>
                  )}

                  {item.content && (
                    <p className={`text-xs text-gray-500 mt-1.5 leading-relaxed ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>
                      {item.content}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {(item.tags || []).map((tag, ti) => (
                      <span key={ti} className="text-[10px] font-mono opacity-70" style={{ color: TAG_COLORS[ti % TAG_COLORS.length] }}>#{tag}</span>
                    ))}
                    <span className="text-[10px] text-gray-700 ml-auto font-mono">{timeAgo(item.createdAt)}</span>
                  </div>

                  {expanded && (
                    <div className="flex gap-2 mt-3 pt-2.5 border-t border-brand-border">
                      {[
                        { label: item.pinned ? "Unpin" : "Pin", action: () => handlePin(item.id), color: "#E8A838" },
                        { label: "Edit", action: () => handleEdit(item), color: "#5B8DEF" },
                        { label: "Delete", action: () => handleDelete(item.id), color: "#EB5757" },
                      ].map(btn => (
                        <button
                          key={btn.label}
                          onClick={e => { e.stopPropagation(); btn.action(); }}
                          className="px-3.5 py-1 rounded-md text-[11px] font-mono transition hover:brightness-125"
                          style={{ border: `1px solid ${btn.color}30`, background: `${btn.color}10`, color: btn.color }}
                        >{btn.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end" style={{ background: "#0D0F12EE" }}>
          <div className="flex-1 cursor-pointer" onClick={resetForm} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <h2 className="text-base font-semibold mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {editingId ? "Edit Item" : "Add to Brain"}
            </h2>

            {/* Type picker */}
            <div className="flex gap-1.5 mb-4">
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

            {/* Fields */}
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Title"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 placeholder:text-gray-600"
            />
            {(form.type === "link" || form.type === "clip") && (
              <input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 placeholder:text-gray-600"
              />
            )}
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={form.type === "thought" ? "What's on your mind..." : "Content / notes..."}
              rows={4}
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 resize-y leading-relaxed placeholder:text-gray-600"
            />
            <input
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="Tags (comma separated)"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-4 placeholder:text-gray-600"
            />

            <div className="flex gap-2.5">
              <button onClick={resetForm} className="flex-1 py-3 rounded-xl bg-brand-muted border border-brand-border text-gray-500 text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-[2] py-3 rounded-xl text-white text-sm font-semibold transition-transform hover:scale-[1.01] disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E8A838, #EB5757)", boxShadow: "0 4px 16px rgba(232,168,56,0.25)" }}
              >
                {saving ? "Saving..." : editingId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
