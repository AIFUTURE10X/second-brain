// Section registry for /settings. Kept separate from the shell so the nav,
// the deep-link parser, and the page title all read from one list.

export const SETTINGS_SECTIONS = [
  {
    key: "general",
    label: "General",
    icon: "◎",
    blurb: "Reminder notifications and the default card view",
  },
  {
    key: "categories",
    label: "Categories",
    icon: "⊞",
    blurb: "Create, colour, nest and reorder categories",
  },
  {
    key: "tags",
    label: "Tags",
    icon: "⌗",
    blurb: "Merge duplicates and rename tags across every card",
  },
  {
    key: "templates",
    label: "Templates",
    icon: "▤",
    blurb: "Reusable prefills for the add-card form",
  },
  {
    key: "integrations",
    label: "Integrations",
    icon: "✈",
    blurb: "Telegram bot and the capture API",
  },
  {
    key: "data",
    label: "Data",
    icon: "⇄",
    blurb: "Export a backup or import a JSON export",
  },
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number]["key"];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = "general";

/** Deep links arrive as ?section=… from anywhere in the app; tolerate junk. */
export function parseSettingsSection(value: unknown): SettingsSectionKey {
  const found = SETTINGS_SECTIONS.find(section => section.key === value);
  return found ? found.key : DEFAULT_SETTINGS_SECTION;
}
