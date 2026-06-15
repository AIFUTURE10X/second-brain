"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type Dispatch, type RefObject, type SetStateAction } from "react";
import TaskChecklistEditor from "../TaskChecklistEditor";
import { showToast } from "../Toast";
import { itemMatchesCardSearch } from "@/lib/card-search";
import { draftStorageKey, parseDraftPayload, serializeDraftPayload } from "@/lib/item-draft-autosave";
import { mergeReminderDateTimeParts, splitReminderDateTime } from "@/lib/reminders.mjs";
import { newChecklistItem, normalizeChecklistItems, type ChecklistItem } from "@/lib/task-checklists";
import {
  REMINDER_TIME_OPTIONS,
  TYPES,
  hasMeaningfulFormContent,
  newEntryId,
  type Attachment,
  type Category,
  type Item,
  type ItemType,
  type NoteEntry,
} from "@/lib/brain-model";
import { fileIcon, formatSize, formatStamp } from "@/lib/brain-format";

export interface ItemFormState {
  type: ItemType;
  title: string;
  content: string;
  url: string;
  noteEntries: NoteEntry[];
  checklistItems: ChecklistItem[];
  tags: string;
  category: string;
  attachments: Attachment[];
  favourite: boolean;
  actionRequired: boolean;
  // Recurring tasks (roadmap 2.11): "" = none, else daily|weekly|monthly.
  recurrence: string;
  reminderId: string;
  reminderDueAt: string;
  reminderMessage: string;
  // Recurring reminders (roadmap 2.8): "" = one-shot.
  reminderRecurrence: string;
  relatedItemIds: string[];
}

interface ItemFormModalProps {
  form: ItemFormState;
  setForm: Dispatch<SetStateAction<ItemFormState>>;
  editingId: string | null;
  saving: boolean;
  uploading: boolean;
  items: Item[];
  allParentCats: Category[];
  getChildren: (parentId: string) => Category[];
  restoredDraftKeyRef: RefObject<string | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  pickerSearch: string;
  setPickerSearch: (value: string) => void;
  relatedPickerOpen: boolean;
  setRelatedPickerOpen: (open: boolean) => void;
  relatedPickerSearch: string;
  setRelatedPickerSearch: (value: string) => void;
  closeForm: () => void;
  handleSave: (andAddAnother?: boolean) => void;
  handleFileUpload: (files: FileList | File[] | null) => void;
  pasteFromClipboard: () => void;
  handleSmartPaste: (field: "content") => (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  openCardInCurrentTab: (id: string) => void;
  popOutCard: (id: string) => void;
  templates: { id: string; name: string }[];
  onApplyTemplate: (id: string) => void;
  onSaveTemplate: () => void;
  onDeleteTemplate: (id: string) => void;
}

// Add/edit bottom sheet plus the two card pickers it spawns. Form state stays
// in Brain (save/close/upload orchestration lives there); everything that only
// mutates the form — note entries, checklist rows, reminder fields, related
// links, attachments metadata — plus the draft-autosave effects lives here.
// Only rendered while the form is open, so effects don't need a showAdd gate.
export function ItemFormModal({
  form,
  setForm,
  editingId,
  saving,
  uploading,
  items,
  allParentCats,
  getChildren,
  restoredDraftKeyRef,
  fileInputRef,
  pickerOpen,
  setPickerOpen,
  pickerSearch,
  setPickerSearch,
  relatedPickerOpen,
  setRelatedPickerOpen,
  relatedPickerSearch,
  setRelatedPickerSearch,
  closeForm,
  handleSave,
  handleFileUpload,
  pasteFromClipboard,
  handleSmartPaste,
  openCardInCurrentTab,
  popOutCard,
  templates,
  onApplyTemplate,
  onSaveTemplate,
  onDeleteTemplate,
}: ItemFormModalProps) {
  // Duplicate detection (roadmap 2.12): as the URL/title is typed, ask the
  // server for cards with the same canonical URL or a near-identical title.
  type DuplicateMatch = { id: string; title: string | null; url: string | null; type: string | null; match: string };
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  useEffect(() => {
    const url = form.url.trim();
    const title = form.title.trim();
    if (!url && title.length < 4) {
      setDuplicates([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (url) params.set("url", url);
        if (title) params.set("title", title);
        if (editingId) params.set("excludeId", editingId);
        const res = await fetch(`/api/items/duplicates?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        setDuplicates(Array.isArray(data?.duplicates) ? data.duplicates : []);
      } catch {}
    }, 600);
    return () => clearTimeout(timer);
  }, [form.url, form.title, editingId]);
  const [isDragOver, setIsDragOver] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const focusEntryIdRef = useRef<string | null>(null);
  const entryRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Restore an unsaved draft once per open form
  useEffect(() => {
    if (typeof window === "undefined") return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // Debounced draft autosave
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = draftStorageKey(editingId);
    const timer = window.setTimeout(() => {
      if (!hasMeaningfulFormContent(form)) {
        window.localStorage.removeItem(key);
        return;
      }
      window.localStorage.setItem(key, serializeDraftPayload({ editingId, form }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [editingId, form]);

  // Flush the draft if the tab closes mid-edit
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = draftStorageKey(editingId);
    const flushDraft = () => {
      if (!hasMeaningfulFormContent(form)) return;
      window.localStorage.setItem(key, serializeDraftPayload({ editingId, form }));
    };
    window.addEventListener("beforeunload", flushDraft);
    return () => window.removeEventListener("beforeunload", flushDraft);
  }, [editingId, form]);

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

  // Focus a freshly added note entry once it exists in the DOM
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

  const toggleRelatedSelection = (itemId: string) => {
    setForm(f => ({
      ...f,
      relatedItemIds: f.relatedItemIds.includes(itemId)
        ? f.relatedItemIds.filter(id => id !== itemId)
        : [...f.relatedItemIds, itemId],
    }));
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

  return (
    <>
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
          <div className="bg-brand-card border-t border-brand-border rounded-t-2xl px-4 sm:px-5 pt-4 pb-6 min-h-[92dvh] max-h-[100dvh] sm:min-h-0 sm:max-h-[90vh] overflow-y-auto relative">
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
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {(Object.entries(TYPES) as [ItemType, typeof TYPES.note][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setForm(f => ({ ...f, type: k }))}
                  className="py-2 rounded-lg text-xs font-mono font-medium transition"
                  style={{
                    border: form.type === k ? `1px solid ${v.color}60` : "1px solid #252830",
                    background: form.type === k ? `${v.color}15` : "#181B21",
                    color: form.type === k ? v.color : "#666",
                  }}
                >{v.icon} {v.label}</button>
              ))}
            </div>

            {/* Card templates (roadmap 2.10) — prefill type/tags/category/checklist */}
            {(templates.length > 0 || !editingId) && (
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                <span className="text-[10px] font-mono text-gray-600">Template:</span>
                {templates.map(template => (
                  <span key={template.id} className="inline-flex items-center rounded-full border border-[#6FCF9750] bg-[#6FCF9710] text-[#6FCF97]">
                    <button
                      type="button"
                      onClick={() => onApplyTemplate(template.id)}
                      className="px-2.5 py-0.5 text-[11px] font-mono whitespace-nowrap hover:text-white transition"
                      title={`Apply template: ${template.name}`}
                    >
                      ▤ {template.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTemplate(template.id)}
                      className="pr-2 text-[11px] opacity-50 hover:opacity-100 transition"
                      aria-label={`Delete template ${template.name}`}
                      title="Delete template"
                    >×</button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={onSaveTemplate}
                  className="px-2.5 py-0.5 rounded-full text-[11px] font-mono whitespace-nowrap border border-dashed border-gray-600 text-gray-400 hover:text-[#6FCF97] hover:border-[#6FCF9760] transition"
                  title="Save the current type, tags, category, content, and checklist as a template"
                >
                  + Save as template
                </button>
              </div>
            )}

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
              <div className="mt-2 flex items-center gap-2">
                <label className="text-[11px] font-mono text-gray-500" htmlFor="reminder-recurrence">↻ Repeats</label>
                <select
                  id="reminder-recurrence"
                  value={form.reminderRecurrence}
                  onChange={e => setForm(f => ({ ...f, reminderRecurrence: e.target.value }))}
                  className="px-2 py-1 bg-[#101318] border border-brand-border rounded-lg text-xs font-mono text-gray-300 outline-none"
                >
                  <option value="">once</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                </select>
              </div>
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
            {form.type === "folder" && (
              <>
                <input
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="C:\Users\you\Documents  (or \\server\share, /Users/you/…)"
                  aria-label="Folder or file path"
                  className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-1.5 placeholder:text-gray-500 font-mono"
                />
                <p className="text-[10px] text-gray-500 mb-2.5 leading-relaxed">
                  Paste a local folder/file path. In the <span className="text-gray-400">desktop app</span> the card opens it in File Explorer; in a browser it copies the path to paste yourself.
                </p>
              </>
            )}
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={form.url ? "Title (auto-filled from URL if empty)" : "Title"}
              aria-label="Title"
              className="w-full px-3 py-2.5 bg-brand-muted border border-brand-border rounded-lg text-sm text-gray-300 outline-none mb-2.5 placeholder:text-gray-500"
            />
            {duplicates.length > 0 && (
              <div className="mb-2.5 rounded-lg border border-[#E8A83850] bg-[#E8A83812] px-3 py-2">
                <p className="text-[11px] font-mono text-[#E8A838] mb-1.5">
                  ⚠ Similar card{duplicates.length > 1 ? "s" : ""} already saved:
                </p>
                <div className="flex flex-col gap-1">
                  {duplicates.map(dup => (
                    <button
                      key={dup.id}
                      type="button"
                      onClick={() => { const id = dup.id; closeForm(); openCardInCurrentTab(id); }}
                      className="flex items-center gap-2 text-left text-[12px] text-gray-300 hover:text-[#E8A838] transition"
                      title={dup.url || dup.title || ""}
                    >
                      <span className="shrink-0 text-[10px] font-mono uppercase opacity-60">{dup.match === "url" ? "same url" : "similar title"}</span>
                      <span className="truncate">{dup.title || dup.url || "Untitled"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {form.type === "task" && (
              <TaskChecklistEditor
                items={form.checklistItems}
                onAdd={addChecklistRow}
                onToggle={toggleChecklistRow}
                onTextChange={updateChecklistRowText}
                onRemove={deleteChecklistRow}
              />
            )}
            {form.type === "task" && (
              <div className="flex items-center gap-2 mb-2.5">
                <label className="text-[11px] font-mono text-gray-400" htmlFor="task-recurrence">↻ Repeats</label>
                <select
                  id="task-recurrence"
                  value={form.recurrence}
                  onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
                  className="px-2 py-1.5 bg-brand-muted border border-brand-border rounded-lg text-xs font-mono text-gray-300 outline-none"
                >
                  <option value="">never</option>
                  <option value="daily">daily</option>
                  <option value="weekly">weekly</option>
                  <option value="monthly">monthly</option>
                </select>
                {form.recurrence && (
                  <span className="text-[10px] font-mono text-gray-600">completing spawns the next occurrence</span>
                )}
              </div>
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
    </>
  );
}
