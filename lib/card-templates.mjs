// Card templates (roadmap 2.10) — reusable prefills for the add-card form,
// stored in the synced settings table under one JSON key. Pure module.

export const CARD_TEMPLATES_SETTINGS_KEY = "card_templates";
export const MAX_CARD_TEMPLATES = 20;

const ITEM_TYPES = ["note", "link", "clip", "thought", "task", "memory"];

/** Validate the settings JSON; tolerates junk from older clients. */
export function normalizeCardTemplates(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(entry =>
      entry && typeof entry === "object" && !Array.isArray(entry) &&
      typeof entry.id === "string" && entry.id.length > 0 &&
      typeof entry.name === "string" && entry.name.trim().length > 0
    )
    .slice(0, MAX_CARD_TEMPLATES)
    .map(entry => ({
      id: entry.id,
      name: entry.name.trim(),
      type: ITEM_TYPES.includes(entry.type) ? entry.type : "note",
      tags: Array.isArray(entry.tags) ? entry.tags.map(String).filter(Boolean) : [],
      category: typeof entry.category === "string" ? entry.category : "",
      content: typeof entry.content === "string" ? entry.content : "",
      checklist: Array.isArray(entry.checklist) ? entry.checklist.map(String).filter(Boolean) : [],
      recurrence: ["daily", "weekly", "monthly"].includes(entry.recurrence) ? entry.recurrence : "",
    }));
}

/** Capture the reusable parts of the current form as a template. */
export function buildTemplateFromForm(name, form) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  return {
    id: crypto.randomUUID(),
    name: trimmed,
    type: form.type || "note",
    tags: String(form.tags || "").split(",").map(t => t.trim()).filter(Boolean),
    category: form.category || "",
    content: form.content || "",
    checklist: Array.isArray(form.checklistItems)
      ? form.checklistItems.map(row => String(row?.text || "").trim()).filter(Boolean)
      : [],
    recurrence: form.recurrence || "",
  };
}

/**
 * Prefill the add form from a template. Only template-owned fields are
 * touched; anything the user already typed (title, url, attachments…) stays.
 */
export function applyTemplateToForm(form, template, newRowId = () => crypto.randomUUID()) {
  return {
    ...form,
    type: template.type,
    tags: template.tags.join(", "),
    category: template.category,
    content: template.content || form.content,
    recurrence: template.recurrence || "",
    checklistItems: template.checklist.map(text => ({
      id: newRowId(),
      text,
      completed: false,
      completedAt: null,
    })),
  };
}
