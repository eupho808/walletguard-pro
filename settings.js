// settings.js - WalletGuard Pro Settings Page Logic
// All UI strings come from lib/i18n (via window.WG_POPUP_LIB.i18n).

(function () {
  const i18n = (typeof window !== "undefined" && window.WG_POPUP_LIB && window.WG_POPUP_LIB.i18n) || null;

  function t(key, params) {
    return i18n && i18n.t ? i18n.t(key, params) : key;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (i18n && i18n.initI18n) await i18n.initI18n();
    if (i18n && i18n.applyTranslations) i18n.applyTranslations(document);
    populateLocaleSelect();
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
    } catch { /* no-op */ }
  }

  // Populate the locale <select> from i18n.availableLocales() and
  // LOCALE_DISPLAY. Mark the current locale as selected. Switching the
  // dropdown updates translations live AND persists to chrome.storage.
  function populateLocaleSelect() {
    const sel = document.getElementById("locale-select");
    if (!sel || !i18n) return;
    const current = i18n.getLocale ? i18n.getLocale() : "en";
    const supported = i18n.availableLocales ? i18n.availableLocales() : ["en"];
    const display = i18n.LOCALE_DISPLAY || {};
    sel.innerHTML = "";
    for (const code of supported) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = display[code] || code;
      if (code === current) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  async function loadSettings() {
    const data = await sendMessage({ action: "getSettings" });
    if (!data || data.error) {
      showToast(t("settings.toast.loadFailed"), "error");
      return;
    }

    document.getElementById("api-key-input").value = data.apiKey || "";

    const enabled = data.enabled !== false;
    applyEnabledUI(enabled);

    const multichain = data.multiChain === true;
    applyMultiChainUI(multichain);

    renderList("whitelist-list", data.whitelist || [], "whitelist");
    renderList("blacklist-list", data.customBlacklist || [], "blacklist");
  }

  function applyEnabledUI(enabled) {
    const toggle = document.getElementById("enabled-toggle");
    const pill = document.getElementById("status-pill");
    if (enabled) {
      toggle.classList.add("on");
      pill.textContent = t("popup.header.active");
      pill.classList.remove("inactive");
    } else {
      toggle.classList.remove("on");
      pill.textContent = t("popup.header.paused");
      pill.classList.add("inactive");
    }
  }

  function applyMultiChainUI(on) {
    const toggle = document.getElementById("multichain-toggle");
    const pill = document.getElementById("multichain-pill");
    if (!toggle || !pill) return;
    if (on) {
      toggle.classList.add("on");
      pill.textContent = t("settings.toggle.on");
      pill.classList.remove("inactive");
    } else {
      toggle.classList.remove("on");
      pill.textContent = t("settings.toggle.off");
      pill.classList.add("inactive");
    }
  }

  function renderList(elementId, items, listType) {
    const container = document.getElementById(elementId);
    const emptyKey = listType === "whitelist" ? "settings.list.whitelistEmpty" : "settings.list.blacklistEmpty";
    if (!items || items.length === 0) {
      container.innerHTML = `<div class="list-empty">${escapeHtml(t(emptyKey))}</div>`;
      return;
    }

    container.innerHTML = items.map((item, idx) => `
      <div class="list-item">
        <span class="addr">${escapeHtml(item)}</span>
        <button class="remove" data-type="${listType}" data-index="${idx}" title="${escapeHtml(t("settings.list.remove"))}">&times;</button>
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
    // ---- Locale selector ----
    const localeSelect = document.getElementById("locale-select");
    if (localeSelect) {
      localeSelect.addEventListener("change", async () => {
        const code = localeSelect.value;
        if (i18n && i18n.saveLocale) {
          await i18n.saveLocale(code);
          i18n.applyTranslations(document);
          // Re-apply dynamic UI that was set imperatively.
          await refreshDynamicUI();
          const display = i18n.LOCALE_DISPLAY || {};
          showToast(t("settings.toast.localeSaved", { name: display[code] || code }), "success");
        }
      });
    }

    // ---- Replay onboarding tour ----
    const replayBtn = document.getElementById("replay-onboarding-btn");
    if (replayBtn) {
      replayBtn.addEventListener("click", async () => {
        // Open the popup so the overlay has somewhere to render.
        try { chrome.action.openPopup(); } catch { /* Firefox MV2 uses different API */ }
        // Also clear the completion flag so next popup open shows the tour.
        try {
          await new Promise((resolve) => {
            chrome.storage.local.set({ wg_onboardingCompleted: false }, resolve);
          });
        } catch { /* ignore */ }
      });
    }

    // ---- Protection toggle ----
    document.getElementById("enabled-toggle").addEventListener("click", async () => {
      const toggle = document.getElementById("enabled-toggle");
      const newState = !toggle.classList.contains("on");
      const res = await sendMessage({ action: "setEnabled", enabled: newState });
      if (res && !res.error) {
        applyEnabledUI(res.enabled);
        showToast(res.enabled ? t("settings.toast.protectionOn") : t("settings.toast.protectionOff"), "success");
      }
    });

    // ---- Multi-chain toggle ----
    document.getElementById("multichain-toggle").addEventListener("click", async () => {
      const toggle = document.getElementById("multichain-toggle");
      const newState = !toggle.classList.contains("on");
      const res = await sendMessage({ action: "setMultiChain", enabled: newState });
      if (res && !res.error) {
        applyMultiChainUI(res.multiChain);
        showToast(res.multiChain ? t("settings.toast.multichainOn") : t("settings.toast.multichainOff"), "success");
      }
    });

    // ---- API key visibility toggle ----
    document.getElementById("toggle-key-vis").addEventListener("click", () => {
      const input = document.getElementById("api-key-input");
      const btn = document.getElementById("toggle-key-vis");
      if (input.type === "password") {
        input.type = "text";
        btn.textContent = t("settings.api.hide");
      } else {
        input.type = "password";
        btn.textContent = t("settings.api.show");
      }
    });

    // ---- Save API key ----
    document.getElementById("save-api-btn").addEventListener("click", async () => {
      const apiKey = document.getElementById("api-key-input").value.trim();
      const res = await sendMessage({ action: "saveSettings", apiKey });
      if (res && !res.error) {
        showToast(t("settings.toast.apiSaved"), "success");
      } else {
        showToast(t("settings.toast.apiSaveFailed"), "error");
      }
    });

    // ---- Clear API key ----
    document.getElementById("clear-api-btn").addEventListener("click", async () => {
      if (!confirm(t("settings.confirm.clearApi"))) return;
      document.getElementById("api-key-input").value = "";
      const res = await sendMessage({ action: "saveSettings", apiKey: "" });
      if (res && !res.error) {
        showToast(t("settings.toast.apiCleared"), "success");
      }
    });

    // ---- Whitelist add ----
    document.getElementById("add-whitelist-btn").addEventListener("click", async () => {
      const input = document.getElementById("whitelist-input");
      const value = input.value.trim();
      if (!value) return;
      if (!isValidInput(value)) {
        showToast(t("settings.toast.invalidInput"), "error");
        return;
      }
      const current = await getCurrentList("whitelist");
      if (current.some((x) => x.toLowerCase() === value.toLowerCase())) {
        showToast(t("settings.toast.alreadyWhitelisted"), "error");
        return;
      }
      current.push(value);
      const res = await sendMessage({ action: "saveSettings", whitelist: current });
      if (res && !res.error) {
        input.value = "";
        renderList("whitelist-list", current, "whitelist");
        showToast(t("settings.toast.addedWhitelist"), "success");
      }
    });

    document.getElementById("whitelist-input").addEventListener("keypress", (e) => {
      if (e.key === "Enter") document.getElementById("add-whitelist-btn").click();
    });

    // ---- Blacklist add ----
    document.getElementById("add-blacklist-btn").addEventListener("click", async () => {
      const input = document.getElementById("blacklist-input");
      const value = input.value.trim();
      if (!value) return;
      if (!isValidInput(value)) {
        showToast(t("settings.toast.invalidInput"), "error");
        return;
      }
      const current = await getCurrentList("blacklist");
      if (current.some((x) => x.toLowerCase() === value.toLowerCase())) {
        showToast(t("settings.toast.alreadyBlacklisted"), "error");
        return;
      }
      current.push(value);
      const res = await sendMessage({ action: "saveSettings", customBlacklist: current });
      if (res && !res.error) {
        input.value = "";
        renderList("blacklist-list", current, "blacklist");
        showToast(t("settings.toast.addedBlacklist"), "success");
      }
    });

    document.getElementById("blacklist-input").addEventListener("keypress", (e) => {
      if (e.key === "Enter") document.getElementById("add-blacklist-btn").click();
    });

    // ---- Reset stats ----
    document.getElementById("reset-stats-btn").addEventListener("click", async () => {
      if (!confirm(t("settings.confirm.resetStats"))) return;
      const res = await sendMessage({ action: "resetStats" });
      if (res && !res.error) {
        showToast(t("settings.toast.statsReset"), "success");
      }
    });

    // ---- Clear AI cache ----
    document.getElementById("clear-cache-btn").addEventListener("click", async () => {
      if (!confirm(t("settings.confirm.clearCache"))) return;
      await chrome.storage.local.remove("wg_aiCache");
      showToast(t("settings.toast.cacheCleared"), "success");
    });
  }

  // After applyTranslations() replaces all data-i18n text, the imperative
  // pills (ACTIVE/PAUSED, ON/OFF, Remove tooltips) keep their last-rendered
  // values. Re-apply them so the UI stays consistent after a locale switch.
  async function refreshDynamicUI() {
    const data = await sendMessage({ action: "getSettings" });
    if (data && !data.error) {
      applyEnabledUI(data.enabled !== false);
      applyMultiChainUI(data.multiChain === true);
      renderList("whitelist-list", data.whitelist || [], "whitelist");
      renderList("blacklist-list", data.customBlacklist || [], "blacklist");
    }
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
      showToast(t("settings.toast.removed", { addr: shorten(removed) }), "success");
    }
  }

  function isValidInput(value) {
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
})();
