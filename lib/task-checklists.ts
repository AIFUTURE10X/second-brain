export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt: string | null;
}

function checklistId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `chk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toCompletedAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function newChecklistItem(text = ""): ChecklistItem {
  return {
    id: checklistId(),
    text,
    completed: false,
    completedAt: null,
  };
}

export function normalizeChecklistItems(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const raw = typeof entry === "object" && entry !== null ? entry as Record<string, unknown> : {};
      const text = typeof raw.text === "string" ? raw.text.trim() : "";
      if (!text) return null;
      const completed = raw.completed === true;
      const completedAt = completed ? toCompletedAt(raw.completedAt) || new Date().toISOString() : null;
      return {
        id: typeof raw.id === "string" && raw.id.trim() ? raw.id : checklistId(),
        text,
        completed,
        completedAt,
      } satisfies ChecklistItem;
    })
    .filter((entry): entry is ChecklistItem => entry !== null);
}

export function deriveTaskCompletion(
  checklistItems: ChecklistItem[],
  fallbackCompleted: boolean,
  fallbackCompletedAt: string | null,
): { completed: boolean; completedAt: string | null } {
  if (checklistItems.length === 0) {
    return {
      completed: false,
      completedAt: null,
    };
  }

  if (checklistItems.some((item) => !item.completed)) {
    return {
      completed: false,
      completedAt: null,
    };
  }

  return {
    completed: true,
    completedAt: toCompletedAt(fallbackCompletedAt) || new Date().toISOString(),
  };
}
