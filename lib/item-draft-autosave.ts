export interface DraftPayload<TForm> {
  editingId: string | null;
  form: TForm;
  savedAt: string;
}

const DRAFT_PREFIX = "sb_main_form_draft";

export function draftStorageKey(editingId: string | null): string {
  return editingId ? `${DRAFT_PREFIX}:edit:${editingId}` : `${DRAFT_PREFIX}:new`;
}

export function serializeDraftPayload<TForm>(payload: { editingId: string | null; form: TForm }): string {
  return JSON.stringify({
    editingId: payload.editingId,
    form: payload.form,
    savedAt: new Date().toISOString(),
  } satisfies DraftPayload<TForm>);
}

export function parseDraftPayload<TForm>(raw: string | null): DraftPayload<TForm> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DraftPayload<TForm>>;
    const editingId = parsed.editingId;
    if (editingId !== null && typeof editingId !== "string") return null;
    if (!("form" in parsed)) return null;
    if (typeof parsed.savedAt !== "string" || !parsed.savedAt.trim()) return null;
    return {
      editingId: editingId ?? null,
      form: parsed.form as TForm,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}
