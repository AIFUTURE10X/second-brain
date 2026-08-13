"use client";

import { useEffect, useState } from "react";
import { showToast } from "../Toast";
import { ViewModePicker } from "../brain/ViewModePicker";
import { ensureNotificationPermission } from "@/lib/desktop-notifications";
import { NOTIFY_TOGGLE_STORAGE_KEY } from "@/lib/reminder-notifications.mjs";
import { parseViewMode, type ViewMode } from "@/lib/view-mode";
import { SettingsCard, SettingsToggleRow } from "./ui";

const DENSITY_STORAGE_KEY = "sb_density";

/**
 * General preferences. Both live in localStorage (per-device on purpose): the
 * reminder-notification opt-in used to be the ◉/◌ header toggle, and the
 * default card view is the density the grid opens with.
 */
export function GeneralSettings() {
  const [desktopNotify, setDesktopNotify] = useState(false);
  const [density, setDensity] = useState<ViewMode>("list");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDesktopNotify(window.localStorage.getItem(NOTIFY_TOGGLE_STORAGE_KEY) === "on");
    const parsed = parseViewMode(window.localStorage.getItem(DENSITY_STORAGE_KEY));
    if (parsed) setDensity(parsed);
  }, []);

  const toggleDesktopNotify = async (next: boolean) => {
    if (!next) {
      setDesktopNotify(false);
      window.localStorage.setItem(NOTIFY_TOGGLE_STORAGE_KEY, "off");
      showToast("Reminder notifications off", "success");
      return;
    }
    const granted = await ensureNotificationPermission();
    if (!granted) {
      showToast("Notification permission was denied", "error");
      return;
    }
    setDesktopNotify(true);
    window.localStorage.setItem(NOTIFY_TOGGLE_STORAGE_KEY, "on");
    showToast("Reminder notifications on", "success");
  };

  const changeDensity = (mode: ViewMode) => {
    setDensity(mode);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, mode);
    showToast("Default view saved", "success");
  };

  return (
    <div className="space-y-3">
      <SettingsCard
        title="Notifications"
        description="Stored on this device only — each browser or desktop install opts in separately."
      >
        <SettingsToggleRow
          label="Desktop reminder notifications"
          description={desktopNotify ? "Due reminders pop a system notification" : "Reminders stay inside the app"}
          checked={desktopNotify}
          onChange={toggleDesktopNotify}
        />
      </SettingsCard>

      <SettingsCard
        title="Default view"
        description="The layout the card grid opens with. The header picker still switches views for the session."
      >
        <ViewModePicker density={density} onDensityChange={changeDensity} />
      </SettingsCard>
    </div>
  );
}
