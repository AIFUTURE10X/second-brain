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
      const display = currentUrl.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80);
      document.getElementById("urlPreview").textContent = display;
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
  document.getElementById("setupError").classList.remove("show");
}

function showMain() {
  document.getElementById("setup").classList.remove("show");
  document.getElementById("main").classList.add("show");
}

function showSetupError(msg) {
  const el = document.getElementById("setupError");
  el.textContent = msg;
  el.classList.add("show");
}

async function saveConfig() {
  const host = document.getElementById("hostInput").value.trim().replace(/\/+$/, "");
  const key = document.getElementById("keyInput").value.trim();

  // Validate URL format
  if (!host) {
    showSetupError("Please enter your Second Brain URL");
    return;
  }
  try {
    const u = new URL(host);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      showSetupError("URL must start with https:// or http://");
      return;
    }
  } catch {
    showSetupError("Invalid URL format. Example: https://your-app.vercel.app");
    return;
  }
  if (!key) {
    showSetupError("Please enter your API key");
    return;
  }

  // Test connection
  const btn = document.getElementById("connectBtn");
  btn.disabled = true;
  btn.textContent = "Testing connection...";
  document.getElementById("setupError").classList.remove("show");

  try {
    const res = await fetch(`${host}/api/categories`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      config = { host, key };
      await chrome.storage.local.set({ host, key });
      btn.textContent = "Connected!";
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = "Connect";
        showMain();
      }, 800);
    } else if (res.status === 401) {
      showSetupError("Invalid API key. Check your API_SECRET value.");
      btn.disabled = false;
      btn.textContent = "Connect";
    } else {
      showSetupError(`Server returned ${res.status}. Check your URL.`);
      btn.disabled = false;
      btn.textContent = "Connect";
    }
  } catch {
    showSetupError("Can't reach server. Check the URL and try again.");
    btn.disabled = false;
    btn.textContent = "Connect";
  }
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

  try {
    const res = await fetch(`${config.host}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const result = await res.json();
      if (!result.id) {
        status.textContent = "Saved, but response was unexpected";
        status.className = "status ok";
      } else {
        status.textContent = "✓ Saved to Brain!";
        status.className = "status ok";
      }
      btn.textContent = "Saved!";
      setTimeout(() => window.close(), 2500);
    } else {
      const text = await res.text();
      let errMsg = `${res.status} ${res.statusText}`;
      try { errMsg = JSON.parse(text).error || errMsg; } catch {}
      status.textContent = `✗ ${errMsg}`;
      status.className = "status err";
      btn.disabled = false;
      btn.textContent = "Save to Brain";
    }
  } catch {
    status.textContent = "✗ Can't reach Second Brain. Check Settings.";
    status.className = "status err";
    btn.disabled = false;
    btn.textContent = "Save to Brain";
  }
}
