"use client";

import { useState } from "react";
import { showToast } from "../Toast";
import {
  SETTINGS_GHOST_BUTTON_CLASS,
  SETTINGS_PRIMARY_BUTTON_CLASS,
  SETTINGS_PRIMARY_BUTTON_STYLE,
  SettingsCard,
} from "./ui";

const EXPORT_FORMATS: { format: string; label: string; extension: string; blurb: string }[] = [
  { format: "json", label: "Export JSON", extension: "json", blurb: "Full backup — items + categories. The only format /api/import reads back." },
  { format: "csv", label: "Export CSV", extension: "csv", blurb: "Spreadsheet-friendly row per card." },
  { format: "markdown", label: "Export Markdown", extension: "md", blurb: "One heading per card, for reading or publishing." },
];

interface DataSettingsProps {
  /** An import creates cards and categories — refetch both afterwards. */
  onDataImported: () => void;
}

/**
 * Backup and restore. Moved here from the bottom of the old Category Manager
 * sheet and the header ↓ button.
 */
export function DataSettings({ onDataImported }: DataSettingsProps) {
  const [busyFormat, setBusyFormat] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleExport = async (format: string, extension: string) => {
    setBusyFormat(format);
    try {
      const res = await fetch(`/api/export?format=${format}`);
      if (!res.ok) {
        showToast("Export failed", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `second-brain-${stamp}.${extension}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Backup downloaded", "success");
    } catch {
      showToast("Export failed", "error");
    } finally {
      setBusyFormat(null);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        showToast("Import failed", "error");
        return;
      }
      const result = await res.json();
      showToast(`Imported ${result.importedItems} items, ${result.importedCategories} categories`, "success");
      onDataImported();
    } catch {
      showToast("Invalid JSON file", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <SettingsCard title="Export" description="Downloads everything currently in the database.">
        <div className="space-y-2">
          {EXPORT_FORMATS.map(entry => (
            <div key={entry.format} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-border bg-brand-muted/30 p-3">
              <p className="min-w-0 flex-1 font-mono text-[11px] text-gray-500">{entry.blurb}</p>
              <button
                type="button"
                onClick={() => handleExport(entry.format, entry.extension)}
                disabled={busyFormat !== null}
                className={`${SETTINGS_GHOST_BUTTON_CLASS} shrink-0`}
              >{busyFormat === entry.format ? "…" : `↓ ${entry.label}`}</button>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Import"
        description="Reads a JSON export back in. Cards are inserted as new rows — importing a backup of cards you still have will duplicate them."
      >
        <label className={`${SETTINGS_PRIMARY_BUTTON_CLASS} cursor-pointer`} style={SETTINGS_PRIMARY_BUTTON_STYLE}>
          {importing ? "Importing…" : "↑ Choose a JSON file"}
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            disabled={importing}
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleImport(file);
            }}
          />
        </label>
      </SettingsCard>
    </div>
  );
}
