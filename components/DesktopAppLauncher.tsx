"use client";

import { useEffect } from "react";

const DESKTOP_DEEP_LINK = "secondbrain://open";
const LAUNCH_ATTEMPT_KEY = "second-brain-desktop-launch-attempted";
const PRODUCTION_HOST = "second-brain-bice-two.vercel.app";

function isTauriWebView() {
  const desktopWindow = window as unknown as {
    __SECOND_BRAIN_DESKTOP__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };

  return Boolean(desktopWindow.__SECOND_BRAIN_DESKTOP__ || desktopWindow.__TAURI_INTERNALS__);
}

function isVercelHost(hostname: string) {
  return hostname === PRODUCTION_HOST || hostname.endsWith(".vercel.app");
}

export default function DesktopAppLauncher() {
  useEffect(() => {
    if (isTauriWebView()) return;
    if (!isVercelHost(window.location.hostname)) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("browser") === "1") return;

    try {
      if (window.sessionStorage.getItem(LAUNCH_ATTEMPT_KEY)) return;
      window.sessionStorage.setItem(LAUNCH_ATTEMPT_KEY, "1");
    } catch {
      // If storage is unavailable, still try to open the desktop app once.
    }

    window.setTimeout(() => {
      window.location.href = DESKTOP_DEEP_LINK;
    }, 250);
  }, []);

  return null;
}
