// settings.js - WalletGuard Pro Settings Page Logic

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  attachListeners();
  loadVersion();
});

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

function loadVersion() {
  try {
    const manifest = chrome.runtime.getManifest();
    document.getElementById("version-pill").textContent = `v${manifest.version}`;
  } catch {
    /* no-op */
  }
}

async function loadSettings() {
  const data = await sendMessage({ action: "getSettings" });
  if (!data || data.error) {
    showToast("Failed to load settings", "error");
    return;
  }

  // API key
  document.getElementById("api-key-input").value = data.apiKey || "";

  // Enabled toggle
  const enabled = data.enabled !== false;
  applyEnabledUI(enabled);

  // Multi-chain toggle
  const multichain = data.multiChain === true;
  applyMultiChainUI(multichain);

  // Whitelist
  renderList("whitelist-list", data.whitelist || [], "whitelist");

  // Blacklist
  renderList("blacklist-list", data.customBlacklist || [], "blacklist");
}

function applyEnabledUI(enabled) {
  const toggle = document.getElementById("enabled-toggle");
  const pill = document.getElementById("status-pill");
  if (enabled) {
    toggle.classList.add("on");
    pill.textContent = "ACTIVE";
    pill.classList.remove("inactive");
  } else {
    toggle.classList.remove("on");
    pill.textContent = "PAUSED";
    pill.classList.add("inactive");
  }
}

function applyMultiChainUI(on) {
  const toggle = document.getElementById("multichain-toggle");
  const pill = document.getElementById("multichain-pill");
  if (!toggle || !pill) return;
  if (on) {
    toggle.classList.add("on");
    pill.textContent = "ON";
    pill.classList.remove("inactive");
  } else {
    toggle.classList.remove("on");
    pill.textContent = "OFF";
    pill.classList.add("inactive");
  }
}

function renderList(elementId, items, listType) {
  const container = document.getElementById(elementId);
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="list-empty">${listType === "whitelist" ? "No trusted addresses yet." : "No custom blacklist entries."}</div>`;
    return;
  }

  container.innerHTML = items.map((item, idx) => `
    <div class="list-item">
      <span class="addr">${escapeHtml(item)}</span>
      <button class="remove" data-type="${listType}" data-index="${idx}" title="Remove">&times;</button>
    </div>
  `).join("");

  container.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const type = btn.dataset.type;
      const index = parseInt(btn.dataset.index, 10);
      await removeFromList(type, index);
    });
  });
}

function attachListeners() {
  // ---- Protection toggle ----
  document.getElementById("enabled-toggle").addEventListener("click", async () => {
    const toggle = document.getElementById("enabled-toggle");
    const newState = !toggle.classList.contains("on");
    const res = await sendMessage({ action: "setEnabled", enabled: newState });
    if (res && !res.error) {
      applyEnabledUI(res.enabled);
      showToast(res.enabled ? "Protection enabled" : "Protection paused", "success");
    }
  });

  // ---- Multi-chain toggle ----
  document.getElementById("multichain-toggle").addEventListener("click", async () => {
    const toggle = document.getElementById("multichain-toggle");
    const newState = !toggle.classList.contains("on");
    const res = await sendMessage({ action: "setMultiChain", enabled: newState });
    if (res && !res.error) {
      applyMultiChainUI(res.multiChain);
      showToast(res.multiChain
        ? "Multi-chain scan enabled (all 6 chains)"
        : "Multi-chain scan disabled (current chain only)", "success");
    }
  });

  // ---- API key visibility toggle ----
  document.getElementById("toggle-key-vis").addEventListener("click", () => {
    const input = document.getElementById("api-key-input");
    const btn = document.getElementById("toggle-key-vis");
    if (input.type === "password") {
      input.type = "text";
      btn.textContent = "Hide";
    } else {
      input.type = "password";
      btn.textContent = "Show";
    }
  });

  // ---- Save API key ----
  document.getElementById("save-api-btn").addEventListener("click", async () => {
    const apiKey = document.getElementById("api-key-input").value.trim();
    const res = await sendMessage({ action: "saveSettings", apiKey });
    if (res && !res.error) {
      showToast("API key saved", "success");
    } else {
      showToast("Failed to save API key", "error");
    }
  });

  // ---- Clear API key ----
  document.getElementById("clear-api-btn").addEventListener("click", async () => {
    if (!confirm("Clear the OpenRouter API key? AI checks will be disabled.")) return;
    document.getElementById("api-key-input").value = "";
    const res = await sendMessage({ action: "saveSettings", apiKey: "" });
    if (res && !res.error) {
      showToast("API key cleared", "success");
    }
  });

  // ---- Whitelist add ----
  document.getElementById("add-whitelist-btn").addEventListener("click", async () => {
    const input = document.getElementById("whitelist-input");
    const value = input.value.trim();
    if (!value) return;
    if (!isValidInput(value)) {
      showToast("Invalid format. Use 0x... address or domain.tld", "error");
      return;
    }
    const current = await getCurrentList("whitelist");
    if (current.some((x) => x.toLowerCase() === value.toLowerCase())) {
      showToast("Already in whitelist", "error");
      return;
    }
    current.push(value);
    const res = await sendMessage({ action: "saveSettings", whitelist: current });
    if (res && !res.error) {
      input.value = "";
      renderList("whitelist-list", current, "whitelist");
      showToast("Added to whitelist", "success");
    }
  });

  // Enter to add whitelist
  document.getElementById("whitelist-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("add-whitelist-btn").click();
  });

  // ---- Blacklist add ----
  document.getElementById("add-blacklist-btn").addEventListener("click", async () => {
    const input = document.getElementById("blacklist-input");
    const value = input.value.trim();
    if (!value) return;
    if (!isValidInput(value)) {
      showToast("Invalid format. Use 0x... address or domain.tld", "error");
      return;
    }
    const current = await getCurrentList("blacklist");
    if (current.some((x) => x.toLowerCase() === value.toLowerCase())) {
      showToast("Already in blacklist", "error");
      return;
    }
    current.push(value);
    const res = await sendMessage({ action: "saveSettings", customBlacklist: current });
    if (res && !res.error) {
      input.value = "";
      renderList("blacklist-list", current, "blacklist");
      showToast("Added to blacklist", "success");
    }
  });

  document.getElementById("blacklist-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") document.getElementById("add-blacklist-btn").click();
  });

  // ---- Reset stats ----
  document.getElementById("reset-stats-btn").addEventListener("click", async () => {
    if (!confirm("Reset all WalletGuard statistics? This cannot be undone.")) return;
    const res = await sendMessage({ action: "resetStats" });
    if (res && !res.error) {
      showToast("Statistics reset", "success");
    }
  });

  // ---- Clear AI cache ----
  document.getElementById("clear-cache-btn").addEventListener("click", async () => {
    if (!confirm("Clear the AI address check cache? Future checks will re-query OpenRouter.")) return;
    await chrome.storage.local.remove("wg_aiCache");
    showToast("AI cache cleared", "success");
  });
}

async function getCurrentList(type) {
  const key = type === "whitelist" ? "whitelist" : "customBlacklist";
  const data = await sendMessage({ action: "getSettings" });
  return (data && data[key]) || [];
}

async function removeFromList(type, index) {
  const key = type === "whitelist" ? "whitelist" : "customBlacklist";
  const current = await getCurrentList(type);
  if (index < 0 || index >= current.length) return;
  const removed = current.splice(index, 1)[0];
  const payload = type === "whitelist" ? { whitelist: current } : { customBlacklist: current };
  const res = await sendMessage({ action: "saveSettings", ...payload });
  if (res && !res.error) {
    renderList(type === "whitelist" ? "whitelist-list" : "blacklist-list", current, type);
    showToast(`Removed ${shorten(removed)}`, "success");
  }
}

function isValidInput(value) {
  // 0x address (40 hex chars) or domain.tld with at least one dot
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return true;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) return true;
  return false;
}

function shorten(s) {
  if (s.length <= 16) return s;
  return `${s.slice(0, 10)}...${s.slice(-4)}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

let toastTimer = null;
function showToast(text, kind = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.className = `toast show ${kind}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}
