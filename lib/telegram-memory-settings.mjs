export const MEMORY_OF_WEEK_ENABLED_KEY = "memory_of_week_enabled";

export function parseMemoryToggleCommand(rawText) {
  const text = String(rawText || "").trim();
  const toggle = text.match(/^\/(?:memories|memory)_(on|off)(?:@\w+)?\s*$/i);
  if (toggle) {
    return { action: toggle[1].toLowerCase() };
  }

  if (/^\/(?:memories|memory)(?:@\w+)?\s*$/i.test(text)) {
    return { action: "status" };
  }

  return null;
}

export function isMemoryOfWeekEnabled(value) {
  if (value === false) return false;
  if (value && typeof value === "object" && value.enabled === false) return false;
  return true;
}
