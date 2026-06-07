export interface VaultEditPanelTarget {
  scrollIntoView: (options?: ScrollIntoViewOptions) => void;
}

export interface VaultEditFocusTarget {
  focus: (options?: FocusOptions) => void;
}

export function revealVaultEditForm(
  panel: VaultEditPanelTarget | null,
  firstField: VaultEditFocusTarget | null,
): boolean {
  if (!panel && !firstField) return false;
  panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  firstField?.focus({ preventScroll: true });
  return true;
}
