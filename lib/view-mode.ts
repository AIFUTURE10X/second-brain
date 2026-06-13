export type ViewMode = "list" | "compact" | "table" | "board";

export function parseViewMode(value: unknown): ViewMode | null {
  return value === "list" || value === "compact" || value === "table" || value === "board" ? value : null;
}

export function nextViewMode(mode: ViewMode): ViewMode {
  if (mode === "list") return "compact";
  if (mode === "compact") return "table";
  if (mode === "table") return "board";
  return "list";
}
