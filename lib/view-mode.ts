export type ViewMode = "comfortable" | "list" | "compact";

export function parseViewMode(value: unknown): ViewMode | null {
  return value === "comfortable" || value === "list" || value === "compact" ? value : null;
}

export function nextViewMode(mode: ViewMode): ViewMode {
  if (mode === "comfortable") return "list";
  if (mode === "list") return "compact";
  return "comfortable";
}
