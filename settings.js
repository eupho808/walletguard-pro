// settings.js - WalletGuard Pro Settings Page Logic
// All UI strings come from lib/i18n (via window.WG_POPUP_LIB.i18n).

/**
 * @file Settings page controller. Lists and edits all extension state via
 *       chrome.runtime.sendMessage. All visible text comes from lib/i18n.
 * @namespace SettingsApp
 */

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

  /**
   * Send a message to the background service worker.
   * @param {object} msg - Action payload.
   * @returns {Promise<object>}
   */
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

  /**
   * Render the extension version from the runtime manifest into the header.
   * @returns {void}
   */
  function loadVersion() {
    try {
      const manifest = chrome.runtime.getManifest();
      document.getElementById("version-pill").textContent = `v${manifest.version}`;
    } catch { /* no-op */ }
  }

  // Populate the locale <select> from i18n.availableLocales() and
  // LOCALE_DISPLAY. Mark the current locale as selected. Switching the
  // dropdown updates translations live AND persists to chrome.storage.
  /**
   * Build the language <select> from i18n.availableLocales() and mark the
   * current locale as selected.
   * @returns {void}
   */
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

  /**
   * Fetch all settings from the background service worker and populate the
   * UI. Shows an error toast if the worker fails to respond.
   * @returns {Promise<void>}
   */
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

    const notifEnabled = data.notificationsEnabled !== false;
    applyToggleUI("notifications-toggle", "notifications-pill", notifEnabled, "settings.toggle.on", "settings.toggle.off");

    const threatFeedEnabled = data.threatFeedEnabled === true;
    applyToggleUI("threatfeed-toggle", "threatfeed-pill", threatFeedEnabled, "settings.toggle.on", "settings.toggle.off");

    renderList("whitelist-list", data.whitelist || [], "whitelist");
    renderList("blacklist-list", data.customBlacklist || [], "blacklist");
  }

  function applyEnabledUI(enabled) {
    const toggle = document.getElementById("enabled-toggle");
    const pill = document.getElementById("status-pill");
    if (!toggle) return;
    if (enabled) {
      toggle.setAttribute("aria-checked", "true");
      pill.textContent = t("popup.header.active");
      pill.classList.remove("wg-pill--off");
    } else {
      toggle.setAttribute("aria-checked", "false");
      pill.textContent = t("popup.header.paused");
      pill.classList.add("wg-pill--off");
    }
  }

  function applyMultiChainUI(on) {
    const toggle = document.getElementById("multichain-toggle");
    const pill = document.getElementById("multichain-pill");
    if (!toggle || !pill) return;
    if (on) {
      toggle.setAttribute("aria-checked", "true");
      pill.textContent = t("settings.toggle.on");
      pill.classList.remove("wg-pill--off");
    } else {
      toggle.setAttribute("aria-checked", "false");
      pill.textContent = t("settings.toggle.off");
      pill.classList.add("wg-pill--off");
    }
  }

  // Generic toggle + pill helper.
  /**
   * Generic helper for paired toggle + pill controls.
   * @param {string} toggleId - Element id of the toggle button.
   * @param {string} pillId   - Element id of the status pill.
   * @param {boolean} on      - Current state.
   * @param {string} onKey    - i18n key for the "on" pill text.
   * @param {string} offKey   - i18n key for the "off" pill text.
   * @returns {void}
   */
  function applyToggleUI(toggleId, pillId, on, onKey, offKey) {
    const toggle = document.getElementById(toggleId);
    const pill = document.getElementById(pillId);
    if (!toggle || !pill) return;
    toggle.setAttribute("aria-checked", on ? "true" : "false");
    pill.textContent = t(on ? onKey : offKey);
    pill.classList.toggle("wg-pill--off", !on);
  }

  /**
   * Render a whitelist or blacklist list. Empty state shows a translated
   * placeholder.
   * @param {string} elementId - UL container id.
   * @param {string[]} items   - List of addresses/domains.
   * @param {"whitelist"|"blacklist"} listType - Drives empty-state copy and
   *        the data-type attribute used by removeFromList().
   * @returns {void}
   */
  function renderList(elementId, items, listType) {
    const container = document.getElementById(elementId);
    const emptyKey = listType === "whitelist" ? "settings.list.whitelistEmpty" : "settings.list.blacklistEmpty";
    if (!items || items.length === 0) {
      container.innerHTML = `<div class="wg-list-empty">${escapeHtml(t(emptyKey))}</div>`;
      return;
    }

    container.innerHTML = items.map((item, idx) => `
      <div class="wg-list-item">
        <span class="wg-list-item__addr">${escapeHtml(item)}</span>
        <button class="wg-list-item__remove" data-type="${listType}" data-index="${idx}" title="${escapeHtml(t("settings.list.remove"))}" aria-label="${escapeHtml(t("settings.list.remove"))}">\u00d7</button>
      </div>
    `).join("");

    container.querySelectorAll(".wg-list-item__remove").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const type = btn.dataset.type;
        const index = parseInt(btn.dataset.index, 10);
        await removeFromList(type, index);
      });
    });
  }

  /**
   * Wire up every settings-page control. Idempotent across navigations.
   * @returns {void}
   */
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

    // ---- Protection toggle ----
    document.getElementById("enabled-toggle").addEventListener("click", async () => {
      const toggle = document.getElementById("enabled-toggle");
      const newState = toggle.getAttribute("aria-checked") !== "true";
      const res = await sendMessage({ action: "setEnabled", enabled: newState });
      if (res && !res.error) {
        applyEnabledUI(res.enabled);
        showToast(res.enabled ? t("settings.toast.protectionOn") : t("settings.toast.protectionOff"), "success");
      }
    });

    // ---- Multi-chain toggle ----
    document.getElementById("multichain-toggle").addEventListener("click", async () => {
      const toggle = document.getElementById("multichain-toggle");
      const newState = toggle.getAttribute("aria-checked") !== "true";
      const res = await sendMessage({ action: "setMultiChain", enabled: newState });
      if (res && !res.error) {
        applyMultiChainUI(res.multiChain);
        showToast(res.multiChain ? t("settings.toast.multichainOn") : t("settings.toast.multichainOff"), "success");
      }
    });

    // ---- Notifications toggle ----
    document.getElementById("notifications-toggle").addEventListener("click", async () => {
      const toggle = document.getElementById("notifications-toggle");
      const newState = toggle.getAttribute("aria-checked") !== "true";
      const res = await sendMessage({ action: "saveSettings", notificationsEnabled: newState });
      if (res && !res.error) {
        applyToggleUI("notifications-toggle", "notifications-pill", newState, "settings.toggle.on", "settings.toggle.off");
        showToast(newState ? t("settings.toast.notificationsOn") : t("settings.toast.notificationsOff"), "success");
      }
    });

    // ---- Threat feed toggle ----
    document.getElementById("threatfeed-toggle").addEventListener("click", async () => {
      const toggle = document.getElementById("threatfeed-toggle");
      const newState = toggle.getAttribute("aria-checked") !== "true";
      const res = await sendMessage({ action: "saveSettings", threatFeedEnabled: newState });
      if (res && !res.error) {
        applyToggleUI("threatfeed-toggle", "threatfeed-pill", newState, "settings.toggle.on", "settings.toggle.off");
        showToast(newState ? t("settings.toast.threatFeedOn") : t("settings.toast.threatFeedOff"), "success");
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

    // ---- Export Settings ----
    document.getElementById("export-settings-btn").addEventListener("click", async () => {
      const res = await sendMessage({ action: "exportSettings" });
      if (!res || res.error) {
        showToast(t("settings.toast.exportFailed"), "error");
        return;
      }
      const json = JSON.stringify(res, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        showToast(t("settings.toast.settingsCopied"), "success");
      } catch {
        try {
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "walletguard-settings-" + new Date().toISOString().slice(0, 10) + ".json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast(t("settings.toast.settingsExported"), "success");
        } catch {
          showToast(t("settings.toast.exportFailed"), "error");
        }
      }
    });

    // ---- Import Settings ----
    const importBtn = document.getElementById("import-settings-btn");
    const importFile = document.getElementById("import-settings-file");
    if (importBtn && importFile) {
      importBtn.addEventListener("click", () => importFile.click());
      importFile.addEventListener("change", async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        if (!confirm(t("settings.confirm.importSettings"))) {
          importFile.value = "";
          return;
        }
        try {
          const text = await file.text();
          const payload = JSON.parse(text);
          const res = await sendMessage({ action: "importSettings", payload });
          if (res && !res.error) {
            showToast(t("settings.toast.settingsImported", { count: res.imported }), "success");
            await refreshDynamicUI();
          } else {
            showToast(t("settings.toast.importFailed"), "error");
          }
        } catch {
          showToast(t("settings.toast.importFailed"), "error");
        } finally {
          importFile.value = "";
        }
      });
    }

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
  /**
   * Re-apply the imperative UI bits (toggle pills, list items) after a
   * locale switch so they pick up the new translations.
   * @returns {Promise<void>}
   */
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

  /**
   * Remove the entry at `index` from the persisted whitelist/blacklist and
   * re-render the corresponding list.
   * @param {"whitelist"|"blacklist"} type
   * @param {number} index - Position in the array.
   * @returns {Promise<void>}
   */
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

  /**
   * Validate user input for whitelist/blacklist: accepts an Ethereum
   * address (0x + 40 hex) or a domain (foo.bar).
   * @param {string} value
   * @returns {boolean}
   */
  function isValidInput(value) {
    if (/^0x[a-fA-F0-9]{40}$/.test(value)) return true;
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) return true;
    return false;
  }

  /**
   * Shorten a string to 10...4 form for toast messages.
   * @param {string} s
   * @returns {string}
   */
  function shorten(s) {
    if (s.length <= 16) return s;
    return `${s.slice(0, 10)}...${s.slice(-4)}`;
  }

  /**
   * Escape HTML entities to prevent XSS in interpolated strings.
   * @param {unknown} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  /** Active toast timer (cleared on re-toast). */
  let toastTimer = null;

  /**
   * Show a transient toast near the bottom of the settings page.
   * @param {string} text - Message to display.
   * @param {"success"|"error"} [kind="success"]
   * @returns {void}
   */
  function showToast(text, kind = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = text;
    toast.className = `wg-toast is-show is-${kind}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("is-show");
    }, 2500);
  }
})();
