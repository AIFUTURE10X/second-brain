let config = { host: "", key: "" };
let currentUrl = "";
let currentTitle = "";
let selectedText = "";
let selectedType = "link";

// Init
document.addEventListener("DOMContentLoaded", async () => {
  // Load config
  const stored = await chrome.storage.local.get(["host", "key"]);
  config.host = stored.host || "";
  config.key = stored.key || "";

  if (!config.host || !config.key) {
    showSetup();
  } else {
    showMain();
  }

  // Get current tab info
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentUrl = tab.url || "";
      currentTitle = tab.title || "";
      document.getElementById("urlPreview").textContent = currentUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60);
      document.getElementById("titleInput").placeholder = currentTitle || "Title";
    }

    // Try to get selected text
    if (tab?.id) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || "",
      });
      selectedText = result?.result || "";
      if (selectedText) {
        document.getElementById("notesInput").value = selectedText;
      }
    }
  } catch {}

  // Wire up all buttons (no inline onclick — Chrome MV3 CSP blocks them)
  document.getElementById("connectBtn").addEventListener("click", saveConfig);
  document.getElementById("saveBtn").addEventListener("click", saveItem);
  document.getElementById("settingsBtn").addEventListener("click", showSetup);

  // Type buttons
  document.querySelectorAll("#typeButtons button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#typeButtons button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedType = btn.dataset.type;
    });
  });
});

function showSetup() {
  document.getElementById("setup").classList.add("show");
  document.getElementById("main").classList.remove("show");
  document.getElementById("hostInput").value = config.host;
  document.getElementById("keyInput").value = config.key;
}

function showMain() {
  document.getElementById("setup").classList.remove("show");
  document.getElementById("main").classList.add("show");
}

async function saveConfig() {
  const host = document.getElementById("hostInput").value.trim().replace(/\/+$/, "");
  const key = document.getElementById("keyInput").value.trim();
  if (!host || !key) return;
  config = { host, key };
  await chrome.storage.local.set({ host, key });
  showMain();
}

async function saveItem() {
  const btn = document.getElementById("saveBtn");
  const status = document.getElementById("status");
  btn.disabled = true;
  btn.textContent = "Saving...";
  status.textContent = "";
  status.className = "status";

  const title = document.getElementById("titleInput").value.trim();
  const notes = document.getElementById("notesInput").value.trim();
  const tags = document.getElementById("tagsInput").value.trim();
  const category = document.getElementById("categoryInput").value.trim();

  const payload = {
    type: selectedType,
    url: (selectedType === "link" || selectedType === "clip") ? currentUrl : "",
    title: title || undefined,
    notes: notes || undefined,
    tags: tags || undefined,
    category: category || undefined,
    content: (selectedType === "note" || selectedType === "thought") ? notes : undefined,
  };

  const endpoint = `${config.host}/api/save?key=${encodeURIComponent(config.key)}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      status.textContent = "✓ Saved!";
      status.className = "status ok";
      btn.textContent = "Saved!";
      setTimeout(() => window.close(), 1500);
    } else {
      const text = await res.text();
      let errMsg = `${res.status} ${res.statusText}`;
      try { errMsg = JSON.parse(text).error || errMsg; } catch {}
      status.textContent = `✗ ${errMsg}`;
      status.className = "status err";
      btn.disabled = false;
      btn.textContent = "Save to Brain";
    }
  } catch (e) {
    // Show the URL we tried so user can verify it's correct
    status.textContent = `✗ ${e.message || "Network error"} → ${endpoint.slice(0, 50)}...`;
    status.className = "status err";
    btn.disabled = false;
    btn.textContent = "Save to Brain";
  }
}
