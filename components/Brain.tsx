"use client";

import { useState, useEffect, useCallback } from "react";
import { showToast } from "./Toast";

type ItemType = "note" | "link" | "clip" | "thought";

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
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  siteName: string;
  favicon: string;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

const TYPES: Record<ItemType, { icon: string; label: string; color: string }> = {
  note: { icon: "✎", label: "Note", color: "#E8A838" },
  link: { icon: "◈", label: "Link", color: "#5B8DEF" },
  clip: { icon: "✂", label: "Clip", color: "#6FCF97" },
  thought: { icon: "◉", label: "Thought", color: "#BB6BD9" },
};

const TAG_COLORS = ["#E8A838", "#5B8DEF", "#6FCF97", "#BB6BD9", "#EB5757", "#56CCF2", "#F2994A", "#9B51E0"];
const CAT_COLORS = ["#E8A838", "#5B8DEF", "#6FCF97", "#BB6BD9", "#EB5757", "#56CCF2", "#F2994A", "#9B51E0", "#27AE60", "#F2C94C"];

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"all" | ItemType>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: "note" as ItemType,
    title: "",
    content: "",
    url: "",
    notes: "",
    tags: "",
    category: "",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ name: "", color: CAT_COLORS[0], parentId: "" });
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);

  const fetchItems = useCallback(async (query?: string) => {
    try {
      const url = query ? `/api/items?q=${encodeURIComponent(query)}` : "/api/items";
      const res = await fetch(url);
      if (res.ok) setItems(await res.json());
      else showToast("Failed to load items", "error");
    } catch {
      showToast("Failed to load items", "error");
    }
    setLoading(false);
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (res.ok) setCategories(await res.json());
      else showToast("Failed to load categories", "error");
    } catch {
      showToast("Failed to load categories", "error");
    }
  }, []);

  useEffect(() => { fetchItems(); fetchCategories(); }, [fetchItems, fetchCategories]);

  // Auto-refresh when user returns to the tab (e.g. after clipping from extension)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchItems(search.trim() || undefined);
        fetchCategories();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchItems, fetchCategories, search]);

  // Reset pagination when filters change
  useEffect(() => { setVisibleCount(50); }, [view, catFilter, search, sortBy]);

  // Close modals on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showAdd) closeForm();
        else if (showCatManager) setShowCatManager(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAdd, showCatManager]);

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
    setForm({ type: lastType, title: "", content: "", url: "", notes: "", tags: "", category: lastCategory });
    if (!keepOpen) {
      setShowAdd(false);
    }
    setEditingId(null);
  };

  const closeForm = () => {
    setForm({ type: "note", title: "", content: "", url: "", notes: "", tags: "", category: "" });
    setShowAdd(false);
    setEditingId(null);
  };

  const handleSave = async (andAddAnother = false) => {
    if (!form.title.trim() && !form.content.trim() && !form.url.trim()) return;
    setSaving(true);
    const tags = form.tags.split(",").map(t => t.trim()).filter(Boolean);
    try {
      const res = await fetch(editingId ? "/api/items" : "/api/items", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form, tags } : { ...form, tags }),
      });
      if (!res.ok) {
        showToast("Failed to save item", "error");
        setSaving(false);
        return;
      }
      showToast(editingId ? "Item updated" : "Item saved", "success");
      await fetchItems();
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    try {
      const res = await fetch(`/api/items?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast("Failed to delete item", "error");
        return;
      }
      setItems(prev => prev.filter(i => i.id !== id));
      if (expandedId === id) setExpandedId(null);
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
      setItems(prev => prev.map(i => i.id === id ? { ...i, pinned: !i.pinned } : i));
    } catch {
      showToast("Failed to update pin", "error");
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
    setForm({
      type: item.type,
      title: item.title,
      content: item.content || "",
      url: item.url || "",
      notes: item.notes || "",
      tags: (item.tags || []).join(", "),
      category: item.category || "",
    });
    setEditingId(item.id);
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
        setNewCat({ name: "", color: CAT_COLORS[0], parentId: "" });
        showToast("Category created", "success");
        await fetchCategories();
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
        setEditingCat(null);
        await fetchCategories();
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
        if (editingCat?.id === id) setEditingCat(null);
        await fetchCategories();
        await fetchItems();
      }
    } catch {
      showToast("Failed to delete category", "error");
    }
    setCatLoading(false);
  };

  // Helper: get parent categories (no parent)
  const parentCats = categories.filter(c => !c.parentId);
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId);
  // Get all category names under a parent (for filtering)
  const getCatNamesUnderParent = (name: string) => {
    const parent = categories.find(c => c.name === name && !c.parentId);
    if (!parent) return [name];
    return [name, ...getChildren(parent.id).map(c => c.name)];
  };

  // Text search is now server-side; client filters only type + category
  const filtered = items
    .filter(i => view === "all" || i.type === view)
    .filter(i => {
      if (catFilter === "all") return true;
      const matchNames = getCatNamesUnderParent(catFilter);
      return matchNames.includes(i.category);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
      const da = new Date(a.createdAt).getTime();
      const db2 = new Date(b.createdAt).getTime();
      return sortBy === "newest" ? db2 - da : da - db2;
    });

  // Reset pagination when filters change
  const visibleItems = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const allTags = [...new Set(items.flatMap(i => i.tags || []))];
  const counts: Record<string, number> = {
    all: items.length,
    ...Object.fromEntries(Object.keys(TYPES).map(k => [k, items.filter(i => i.type === k).length])),
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
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await Promise.all([fetchItems(search.trim() || undefined), fetchCategories()]);
                showToast("Refreshed", "success");
              }}
              className="w-10 h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
              aria-label="Refresh items"
              title="Refresh"
            >↻</button>
            <button
              onClick={() => setShowCatManager(true)}
              className="w-10 h-10 rounded-xl text-gray-500 text-sm flex items-center justify-center border border-brand-border hover:text-gray-300 hover:border-gray-600 active:scale-95 transition"
              aria-label="Manage categories"
            >⊞</button>
            <button
              onClick={() => { closeForm(); setShowAdd(true); }}
              className="w-10 h-10 rounded-xl text-white text-xl flex items-center justify-center font-light transition-transform hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, #E8A838, #EB5757)", boxShadow: "0 4px 16px rgba(232,168,56,0.3)" }}
              aria-label="Add new item"
            >+</button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search notes, clips, thoughts..."
            aria-label="Search items"
            className="w-full py-2.5 pl-9 pr-3 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none placeholder:text-gray-500"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 text-sm">⌕</span>
        </div>

        {/* Type filters */}
        <div className="flex gap-1 overflow-x-auto pb-1.5 scroll-fade">
          {[{ key: "all" as const, label: "All", icon: "◇" }, ...Object.entries(TYPES).map(([k, v]) => ({ key: k as "all" | ItemType, label: v.label, icon: v.icon }))].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setView(tab.key); if (tab.key === "all") setCatFilter("all"); }}
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

        {/* Category filters — hierarchical */}
        {categories.length > 0 && (
          <div className="flex flex-col gap-1 pb-3 pt-1.5">
            <div className="flex gap-1 items-center overflow-x-auto">
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
              const subs = parent ? getChildren(parent.id) : [];
              return subs.length > 0 ? (
                <div className="flex gap-1 items-center overflow-x-auto pl-4">
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
            {items.length === 0 ? (
              <>
                <p className="text-sm font-mono text-gray-500">Your second brain is empty</p>
                <p className="text-xs mt-1.5 text-gray-600">Save notes, links, clips & thoughts</p>
                <button
                  onClick={() => { closeForm(); setShowAdd(true); }}
                  className="mt-4 px-5 py-2 rounded-xl text-white text-sm font-medium"
                  style={{ background: "linear-gradient(135deg, #E8A838, #EB5757)" }}
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
          const expanded = expandedId === item.id;
          const hasPreview = item.ogImage && (item.type === "link" || item.type === "clip");
          const isYouTube = item.siteName === "YouTube";

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setExpandedId(expanded ? null : item.id)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(expanded ? null : item.id); } }}
              className="bg-brand-card rounded-xl mb-2.5 cursor-pointer transition-all overflow-hidden"
              style={{
                border: `1px solid ${item.pinned ? "#E8A83850" : "#1E2128"}`,
                background: item.pinned ? "#E8A83808" : undefined,
                animation: `fadeSlide 0.3s ease ${idx * 0.03}s both`,
              }}
            >
              {/* Thumbnail preview for links */}
              {hasPreview && (
                <div className="relative w-full h-32 sm:h-40 bg-brand-muted overflow-hidden">
                  <img
                    src={item.ogImage}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isYouTube && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                        <span className="text-white text-lg ml-0.5">▶</span>
                      </div>
                    </div>
                  )}
                  {item.siteName && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 rounded-md px-2 py-1">
                      {item.favicon && <img src={item.favicon} alt="" className="w-3.5 h-3.5 rounded-sm" loading="lazy" />}
                      <span className="text-[10px] text-gray-300 font-mono">{item.siteName}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="p-4">
                <div className="flex gap-3">
                  {!hasPreview && (
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                      style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}
                    >{t.icon}</div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {item.pinned && <span className="text-[10px]" title="Pinned">📌</span>}
                      {hasPreview && (
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0"
                          style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}
                        >{t.icon}</div>
                      )}
                      <p className={`text-sm font-semibold text-gray-100 ${expanded ? "" : "truncate"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {item.title || item.ogTitle || "Untitled"}
                      </p>
                    </div>

                    {/* OG description for links (when no user content) */}
                    {item.ogDescription && !item.content && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.ogDescription}</p>
                    )}

                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[11px] text-type-link font-mono block mt-1 truncate hover:underline"
                      >↗ {item.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}</a>
                    )}

                    {item.content && (
                      <p className={`text-xs text-gray-500 mt-1.5 leading-relaxed ${expanded ? "whitespace-pre-wrap" : "line-clamp-2"}`}>
                        {item.content}
                      </p>
                    )}

                    {/* Notes section (separate from content) */}
                    {item.notes && (
                      <div className={`mt-2 pl-2.5 border-l-2 ${expanded ? "" : "line-clamp-2"}`} style={{ borderColor: t.color + "40" }}>
                        <p className="text-[11px] text-gray-400 italic leading-relaxed">{item.notes}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {item.category && (
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: getCatColor(item.category) + "15", color: getCatColor(item.category), border: `1px solid ${getCatColor(item.category)}30` }}
                        >{item.category}</span>
                      )}
                      {(item.tags || []).map((tag, ti) => (
                        <span key={ti} className="text-[10px] font-mono px-1 py-0.5 rounded" style={{ color: TAG_COLORS[ti % TAG_COLORS.length], background: TAG_COLORS[ti % TAG_COLORS.length] + "10" }}>#{tag}</span>
                      ))}
                      <span className="text-[10px] text-gray-700 ml-auto font-mono">{timeAgo(item.createdAt)}</span>
                    </div>

                    {/* Action buttons — always visible */}
                    <div className="flex gap-2 mt-3 pt-2.5 border-t border-brand-border">
                      <button
                        onClick={e => { e.stopPropagation(); handlePin(item.id); }}
                        className="px-3 py-1.5 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95"
                        style={{ border: "1px solid #E8A83830", background: "#E8A83810", color: "#E8A838" }}
                      >{item.pinned ? "Unpin" : "Pin"}</button>
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
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(item.id); }}
                        className="px-3 py-1.5 rounded-md text-[11px] font-mono transition hover:brightness-125 active:scale-95 ml-auto"
                        style={{ border: "1px solid #EB575730", background: "#EB575715", color: "#EB5757" }}
                      >Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <button
            onClick={() => setVisibleCount(c => c + 50)}
            className="w-full py-3 mb-4 rounded-xl text-xs font-mono border border-brand-border text-gray-500 hover:text-gray-300 transition"
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end" style={{ background: "#0D0F12EE" }}>
          <div className="flex-1 cursor-pointer" onClick={closeForm} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-4 pb-6 max-h-[90vh] overflow-y-auto">
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
              {parentCats.map(cat => (
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
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder={form.type === "thought" ? "What's on your mind..." : "Content / description..."}
              aria-label="Content"
              rows={3}
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 resize-y leading-relaxed placeholder:text-gray-500"
            />
            {(form.type === "link" || form.type === "clip") && (
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="My annotations on this link..."
                aria-label="Annotations"
                rows={2}
                className="w-full px-3 py-2.5 bg-brand-muted border border-type-link/20 rounded-lg text-sm text-gray-400 italic outline-none mb-2.5 resize-y leading-relaxed placeholder:text-gray-500"
              />
            )}
            <input
              value={form.tags}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="e.g. python, tutorial, important"
              aria-label="Tags, comma separated"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-4 placeholder:text-gray-500"
            />

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button onClick={closeForm} className="py-3 px-4 rounded-xl bg-brand-muted border border-brand-border text-gray-500 text-sm font-medium active:scale-95 transition">
                  Cancel
                </button>
                <button
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl text-white text-sm font-semibold transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #E8A838, #EB5757)", boxShadow: "0 4px 16px rgba(232,168,56,0.25)" }}
                >
                  {saving ? "Saving..." : editingId ? "Update" : "Save"}
                </button>
              </div>
              {!editingId && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl text-xs font-mono border border-brand-border text-gray-400 hover:text-white transition disabled:opacity-50 active:scale-[0.99]"
                >
                  Save & Add Another
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      {showCatManager && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end" style={{ background: "#0D0F12EE" }}>
          <div className="flex-1 cursor-pointer" onClick={() => setShowCatManager(false)} />
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-5 pt-4 pb-6 max-h-[85vh] overflow-y-auto">
            <div className="w-9 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <h2 className="text-base font-semibold mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Categories
            </h2>

            {/* Existing categories — hierarchical */}
            {categories.length === 0 && (
              <p className="text-xs text-gray-600 font-mono mb-4">No categories yet. Add one below, or just save items — AI will auto-categorize.</p>
            )}
            {parentCats.map(cat => (
              <div key={cat.id}>
                <div className="flex items-center justify-between py-2 border-b border-brand-border">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                    <span className="text-sm text-gray-300 truncate">{cat.name}</span>
                    <span className="text-[10px] text-gray-700 font-mono shrink-0">
                      {items.filter(i => getCatNamesUnderParent(cat.name).includes(i.category)).length}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditingCat({ ...cat })} disabled={catLoading} aria-label={`Edit ${cat.name}`} className="text-[11px] text-gray-600 hover:text-blue-400 font-mono transition disabled:opacity-50">✎</button>
                    <button onClick={() => handleDeleteCategory(cat.id)} disabled={catLoading} aria-label={`Delete ${cat.name}`} className="text-[11px] text-gray-600 hover:text-red-400 font-mono transition disabled:opacity-50">✕</button>
                  </div>
                </div>
                {/* Subcategories */}
                {getChildren(cat.id).map(sub => (
                  <div key={sub.id} className="flex items-center justify-between py-1.5 pl-6 border-b border-brand-border/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
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
            ))}

            {/* Edit category inline */}
            {editingCat && (
              <div className="mt-3 p-3 rounded-lg border border-type-link/30 bg-type-link/5">
                <p className="text-[11px] text-type-link font-mono mb-2">Editing: {editingCat.name}</p>
                <input
                  value={editingCat.name}
                  onChange={e => setEditingCat(c => c ? { ...c, name: e.target.value } : null)}
                  className="w-full px-3 py-1.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2 placeholder:text-gray-500"
                />
                <div className="flex gap-2 items-center mb-2">
                  <span className="text-[10px] text-gray-600 font-mono">Color:</span>
                  {CAT_COLORS.slice(0, 8).map(c => (
                    <button key={c} onClick={() => setEditingCat(cat => cat ? { ...cat, color: c } : null)}
                      className="w-4 h-4 rounded-full transition-transform"
                      style={{ background: c, border: editingCat.color === c ? "2px solid white" : "2px solid transparent", transform: editingCat.color === c ? "scale(1.2)" : "scale(1)" }}
                    />
                  ))}
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
                  <button onClick={handleEditCategory} disabled={catLoading} className="px-3 py-1.5 rounded-lg text-[11px] font-mono text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg, #E8A838, #EB5757)" }}>{catLoading ? "Saving..." : "Save"}</button>
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
                  style={{ background: "linear-gradient(135deg, #E8A838, #EB5757)" }}
                >{catLoading ? "..." : "Add"}</button>
              </div>
              <div className="flex gap-2 items-center mt-2">
                <div className="flex gap-1 items-center">
                  {CAT_COLORS.slice(0, 6).map(c => (
                    <button key={c} onClick={() => setNewCat(n => ({ ...n, color: c }))}
                      className="w-4 h-4 rounded-full transition-transform"
                      style={{ background: c, border: newCat.color === c ? "2px solid white" : "2px solid transparent", transform: newCat.color === c ? "scale(1.2)" : "scale(1)" }}
                    />
                  ))}
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
    </div>
  );
}
