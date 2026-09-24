// MV3 background service worker — right-click capture (roadmap 2.6).
// Context menu entries post straight to /api/save with the host + key the
// user configured in the popup; success/failure is flagged on the action
// badge (no notification permission needed).

const DEFAULT_HOST = "https://second-brain-bice-two.vercel.app";
const GENERIC_VERCEL_HOSTS = new Set(["https://vercel.app", "https://www.vercel.app"]);

function resolveConfiguredHost(rawHost) {
  try {
    const url = new URL(String(rawHost || "").trim());
    const origin = url.origin;
    if ((url.protocol === "https:" || url.protocol === "http:") && !GENERIC_VERCEL_HOSTS.has(origin)) {
      return origin;
    }
  } catch {}
  return DEFAULT_HOST;
}

async function migrateStoredHost() {
  const { host } = await chrome.storage.local.get(["host"]);
  const resolvedHost = resolveConfiguredHost(host);
  if (resolvedHost !== host) await chrome.storage.local.set({ host: resolvedHost });
}

const MENU_ITEMS = [
  { id: "save-page", title: "Save page to Brain", contexts: ["page"] },
  { id: "save-link", title: "Save link to Brain", contexts: ["link"] },
  { id: "save-selection", title: "Save selection to Brain", contexts: ["selection"] },
];

chrome.runtime.onInstalled.addListener(() => {
  migrateStoredHost();
  // removeAll first: onInstalled also fires on extension reload/update, and
  // re-creating an existing menu id would error.
  chrome.contextMenus.removeAll(() => {
    for (const item of MENU_ITEMS) {
      chrome.contextMenus.create(item);
    }
  });
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
}

async function saveToBrain(payload) {
  let { host, key } = await chrome.storage.local.get(["host", "key"]);
  const resolvedHost = resolveConfiguredHost(host);
  if (resolvedHost !== host) {
    host = resolvedHost;
    await chrome.storage.local.set({ host });
  }
  if (!host || !key) {
    flashBadge("set", "#EB5757"); // popup setup needed
    return;
  }
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify(payload),
    });
    flashBadge(res.ok ? "✓" : "!", res.ok ? "#6FCF97" : "#EB5757");
  } catch {
    flashBadge("!", "#EB5757");
  }
}

// Keyboard shortcuts (roadmap 3.1) — see manifest "commands".
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab?.url) return;

  if (command === "save-page") {
    saveToBrain({ type: "link", url: tab.url, title: tab.title || "" });
    return;
  }

  if (command === "annotate-selection") {
    let selection = "";
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || "",
      });
      selection = result?.result || "";
    } catch {}
    if (!selection.trim()) {
      flashBadge("sel", "#EB5757"); // nothing highlighted
      return;
    }
    // annotate: true appends to the existing card for this URL; the server
    // falls back to creating a new card when none exists.
    saveToBrain({ url: tab.url, text: selection, title: tab.title || "", annotate: true });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const pageUrl = tab?.url || info.pageUrl || "";
  const pageTitle = tab?.title || "";

  if (info.menuItemId === "save-link" && info.linkUrl) {
    saveToBrain({
      type: "link",
      url: info.linkUrl,
      // Chrome exposes the anchor text as selectionText for link clicks in
      // some cases; fall back to letting the server enrich the title.
      title: info.selectionText || "",
    });
    return;
  }

  if (info.menuItemId === "save-selection" && info.selectionText) {
    saveToBrain({
      type: "clip",
      title: pageTitle,
      content: info.selectionText,
      url: pageUrl,
    });
    return;
  }

  if (info.menuItemId === "save-page" && pageUrl) {
    saveToBrain({
      type: "link",
      url: pageUrl,
      title: pageTitle,
    });
  }
});
