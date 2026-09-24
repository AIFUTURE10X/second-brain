const DEFAULT_HOST = "https://second-brain-bice-two.vercel.app";
const GENERIC_VERCEL_HOSTS = new Set(["https://vercel.app", "https://www.vercel.app"]);

let config = { host: "", key: "" };
let currentUrl = "";
let currentTitle = "";
let selectedText = "";
let selectedType = "link";

function normalizeHost(rawHost) {
  try {
    const url = new URL(String(rawHost || "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function resolveConfiguredHost(rawHost) {
  const normalized = normalizeHost(rawHost);
  return !normalized || GENERIC_VERCEL_HOSTS.has(normalized) ? DEFAULT_HOST : normalized;
}

// Init
document.addEventListener("DOMContentLoaded", async () => {
  // Load config
  const stored = await chrome.storage.local.get(["host", "key"]);
  config.host = resolveConfiguredHost(stored.host);
  config.key = stored.key || "";

  // Older setup instructions could leave the generic Vercel website saved as
  // the API host. Migrate that value to this app's canonical deployment.
  if (config.host !== stored.host) {
    await chrome.storage.local.set({ host: config.host });
  }

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
  const rawHost = document.getElementById("hostInput").value;
  const host = normalizeHost(rawHost);
  const key = document.getElementById("keyInput").value.trim();

  // Validate URL format
  if (!rawHost.trim()) {
    showSetupError("Please enter your Second Brain URL");
    return;
  }
  if (!host) {
    showSetupError("Invalid URL format. Example: https://your-app.vercel.app");
    return;
  }
  if (GENERIC_VERCEL_HOSTS.has(host)) {
    showSetupError(`Use your Second Brain URL: ${DEFAULT_HOST}`);
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
    const res = await fetch(`${host}/api/categories?key=${encodeURIComponent(key)}`, {
      headers: { "x-api-key": key },
    });
    if (res.ok) {
      let categories;
      try { categories = await res.json(); } catch {}
      if (!Array.isArray(categories)) {
        showSetupError("This URL is not a Second Brain deployment.");
        btn.disabled = false;
        btn.textContent = "Connect";
        return;
      }
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
    } else if (res.status === 405) {
      showSetupError("Wrong Second Brain URL. Use your deployment URL.");
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
        "x-api-key": config.key,
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
      if (res.status === 405) {
        errMsg = "Wrong Second Brain URL. Open Settings and reconnect.";
      }
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
