// MV3 background service worker — right-click capture (roadmap 2.6).
// Context menu entries post straight to /api/save with the host + key the
// user configured in the popup; success/failure is flagged on the action
// badge (no notification permission needed).

const MENU_ITEMS = [
  { id: "save-page", title: "Save page to Brain", contexts: ["page"] },
  { id: "save-link", title: "Save link to Brain", contexts: ["link"] },
  { id: "save-selection", title: "Save selection to Brain", contexts: ["selection"] },
];

chrome.runtime.onInstalled.addListener(() => {
  for (const item of MENU_ITEMS) {
    chrome.contextMenus.create(item);
  }
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
}

async function saveToBrain(payload) {
  const { host, key } = await chrome.storage.local.get(["host", "key"]);
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
