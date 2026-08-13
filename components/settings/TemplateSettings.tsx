"use client";

import { useEffect, useState } from "react";
import { showToast } from "../Toast";
import { TYPES, type Category, type ItemType } from "@/lib/brain-model";
import {
  CARD_TEMPLATES_SETTINGS_KEY,
  MAX_CARD_TEMPLATES,
  normalizeCardTemplates,
} from "@/lib/card-templates.mjs";
import {
  SETTINGS_GHOST_BUTTON_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_PRIMARY_BUTTON_CLASS,
  SETTINGS_PRIMARY_BUTTON_STYLE,
  SETTINGS_SELECT_CLASS,
  SettingsCard,
  SettingsEmptyNote,
} from "./ui";

// The template `type` field is validated against this list by
// normalizeCardTemplates — "folder" cards are not template-able.
const TEMPLATE_TYPES: ItemType[] = ["note", "link", "clip", "thought", "task", "memory"];
const RECURRENCE_OPTIONS = ["", "daily", "weekly", "monthly"] as const;

type CardTemplate = ReturnType<typeof normalizeCardTemplates>[number];

interface TemplateDraft {
  id: string | null;
  name: string;
  type: ItemType;
  tags: string;
  category: string;
  content: string;
  checklist: string;
  recurrence: string;
}

const EMPTY_DRAFT: TemplateDraft = {
  id: null,
  name: "",
  type: "note",
  tags: "",
  category: "",
  content: "",
  checklist: "",
  recurrence: "",
};

function draftFromTemplate(template: CardTemplate): TemplateDraft {
  return {
    id: template.id,
    name: template.name,
    type: template.type as ItemType,
    tags: (template.tags || []).join(", "),
    category: template.category || "",
    content: template.content || "",
    checklist: (template.checklist || []).join("\n"),
    recurrence: template.recurrence || "",
  };
}

function templateFromDraft(draft: TemplateDraft): CardTemplate {
  return {
    id: draft.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t_${Date.now()}`),
    name: draft.name.trim(),
    type: draft.type,
    tags: draft.tags.split(",").map(t => t.trim()).filter(Boolean),
    category: draft.category.trim(),
    content: draft.content,
    checklist: draft.checklist.split("\n").map(t => t.trim()).filter(Boolean),
    recurrence: draft.recurrence,
  } as CardTemplate;
}

/**
 * Card templates (the `card_templates` settings key). Until now templates
 * could only be created from the add-card form and never edited — this is the
 * manager. Shape must stay identical to what ItemFormModal consumes.
 */
export function TemplateSettings({ categories }: { categories: Category[] }) {
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);

  useEffect(() => {
    fetch(`/api/settings?key=${CARD_TEMPLATES_SETTINGS_KEY}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setTemplates(normalizeCardTemplates(data?.[CARD_TEMPLATES_SETTINGS_KEY])))
      .catch(() => showToast("Failed to load templates", "error"))
      .finally(() => setLoading(false));
  }, []);

  const persist = async (list: CardTemplate[], message: string) => {
    const normalized = normalizeCardTemplates(list);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: CARD_TEMPLATES_SETTINGS_KEY, value: normalized }),
      });
      if (!res.ok) throw new Error("save failed");
      setTemplates(normalized);
      setDraft(null);
      showToast(message, "success");
    } catch {
      showToast("Failed to save templates", "error");
    }
    setSaving(false);
  };

  const saveDraft = () => {
    if (!draft || !draft.name.trim()) {
      showToast("Give the template a name", "error");
      return;
    }
    const built = templateFromDraft(draft);
    const exists = templates.some(t => t.id === built.id);
    if (!exists && templates.length >= MAX_CARD_TEMPLATES) {
      showToast(`Templates are capped at ${MAX_CARD_TEMPLATES}`, "error");
      return;
    }
    const next = exists ? templates.map(t => (t.id === built.id ? built : t)) : [...templates, built];
    persist(next, exists ? "Template updated" : "Template created");
  };

  const deleteTemplate = (id: string, name: string) => {
    if (!confirm(`Delete the template "${name}"?`)) return;
    persist(templates.filter(t => t.id !== id), "Template deleted");
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Card templates"
        description="Applied from the ▤ chips in the add-card form — they prefill type, tags, category, body and checklist."
        action={
          !draft && (
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
              className={SETTINGS_PRIMARY_BUTTON_CLASS}
              style={SETTINGS_PRIMARY_BUTTON_STYLE}
              disabled={templates.length >= MAX_CARD_TEMPLATES}
              title={templates.length >= MAX_CARD_TEMPLATES ? `Templates are capped at ${MAX_CARD_TEMPLATES}` : "Create a template"}
            >+ New template</button>
          )
        }
      >
        {loading && <SettingsEmptyNote>Loading templates…</SettingsEmptyNote>}
        {!loading && templates.length === 0 && (
          <SettingsEmptyNote>No templates yet. Create one here, or save the add-card form as a template.</SettingsEmptyNote>
        )}
        <div className="space-y-2">
          {templates.map(template => {
            const meta = TYPES[template.type as ItemType] || TYPES.note;
            return (
              <div key={template.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-brand-border bg-brand-muted/30 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-200">
                    <span style={{ color: meta.color }}>▤ </span>{template.name}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-gray-600">
                    {meta.icon} {meta.label}
                    {template.category ? ` · ${template.category}` : ""}
                    {template.tags.length > 0 ? ` · ${template.tags.map((t: string) => `#${t}`).join(" ")}` : ""}
                    {template.checklist.length > 0 ? ` · ${template.checklist.length} checklist item${template.checklist.length === 1 ? "" : "s"}` : ""}
                    {template.recurrence ? ` · repeats ${template.recurrence}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setDraft(draftFromTemplate(template))}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand-border font-mono text-[12px] text-gray-500 transition hover:border-gray-600 hover:text-blue-400"
                    aria-label={`Edit template ${template.name}`}
                    title="Edit"
                  >✎</button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(template.id, template.name)}
                    disabled={saving}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand-border font-mono text-[12px] text-gray-500 transition hover:border-gray-600 hover:text-red-400 disabled:opacity-50"
                    aria-label={`Delete template ${template.name}`}
                    title="Delete"
                  >✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      {draft && (
        <SettingsCard title={draft.id ? "Edit template" : "New template"} description="Only these fields are stored — titles, URLs and attachments stay per-card.">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block font-mono text-[11px] text-gray-500" htmlFor="template-name">Name</label>
              <input
                id="template-name"
                value={draft.name}
                onChange={e => setDraft(d => (d ? { ...d, name: e.target.value } : d))}
                placeholder="Meeting notes"
                className={SETTINGS_INPUT_CLASS}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_TYPES.map(type => {
                const meta = TYPES[type];
                const active = draft.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDraft(d => (d ? { ...d, type } : d))}
                    className="min-h-[44px] rounded-lg px-3 py-2 font-mono text-xs font-medium transition"
                    style={{
                      border: active ? `1px solid ${meta.color}60` : "1px solid #252830",
                      background: active ? `${meta.color}15` : "#181B21",
                      color: active ? meta.color : "#666",
                    }}
                    aria-pressed={active}
                  >{meta.icon} {meta.label}</button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-mono text-[11px] text-gray-500" htmlFor="template-tags">Tags (comma separated)</label>
                <input
                  id="template-tags"
                  value={draft.tags}
                  onChange={e => setDraft(d => (d ? { ...d, tags: e.target.value } : d))}
                  placeholder="work, meeting"
                  className={SETTINGS_INPUT_CLASS}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[11px] text-gray-500" htmlFor="template-category">Category</label>
                <input
                  id="template-category"
                  list="settings-template-categories"
                  value={draft.category}
                  onChange={e => setDraft(d => (d ? { ...d, category: e.target.value } : d))}
                  placeholder="None"
                  className={SETTINGS_INPUT_CLASS}
                />
                <datalist id="settings-template-categories">
                  {categories.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[11px] text-gray-500" htmlFor="template-content">Body</label>
              <textarea
                id="template-content"
                value={draft.content}
                onChange={e => setDraft(d => (d ? { ...d, content: e.target.value } : d))}
                rows={4}
                placeholder="Agenda:&#10;&#10;Decisions:"
                className={`${SETTINGS_INPUT_CLASS} min-h-[96px] resize-y`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-mono text-[11px] text-gray-500" htmlFor="template-checklist">Checklist (one per line)</label>
                <textarea
                  id="template-checklist"
                  value={draft.checklist}
                  onChange={e => setDraft(d => (d ? { ...d, checklist: e.target.value } : d))}
                  rows={4}
                  placeholder={"Prep agenda\nSend recap"}
                  className={`${SETTINGS_INPUT_CLASS} min-h-[96px] resize-y`}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[11px] text-gray-500" htmlFor="template-recurrence">Repeat</label>
                <select
                  id="template-recurrence"
                  value={draft.recurrence}
                  onChange={e => setDraft(d => (d ? { ...d, recurrence: e.target.value } : d))}
                  className={SETTINGS_SELECT_CLASS}
                >
                  {RECURRENCE_OPTIONS.map(option => (
                    <option key={option || "none"} value={option}>{option ? option : "Does not repeat"}</option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-gray-600">Only applies to task cards.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveDraft} disabled={saving} className={SETTINGS_PRIMARY_BUTTON_CLASS} style={SETTINGS_PRIMARY_BUTTON_STYLE}>
                {saving ? "Saving…" : draft.id ? "Save template" : "Create template"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className={SETTINGS_GHOST_BUTTON_CLASS}>Cancel</button>
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  );
}
