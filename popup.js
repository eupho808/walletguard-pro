// popup.js — WalletGuard Pro v4 CALM
// Minimal dashboard: hero score, protection checks, activity, permissions, addresses.

(function () {
  const i18n = (typeof window !== "undefined" && window.WG_POPUP_LIB && window.WG_POPUP_LIB.i18n) || null;

  function t(key, params) {
    return i18n && i18n.t ? i18n.t(key, params) : key;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (i18n && i18n.initI18n) await i18n.initI18n();
    if (i18n && i18n.applyTranslations) i18n.applyTranslations(document);
    attachListeners();
    await refresh();
  });

  function attachListeners() {
    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", async () => {
      if (!confirm(t("popup.confirm.reset"))) return;
      const res = await sendMessage({ action: "resetStats" });
      if (res && res.stats) {
        applyStats({ stats: res.stats, logs: [], enabled: true });
        toast(t("popup.toast.statsReset"));
      }
    });

    const settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    // Section navigation — token/NFT/address rows
    const approvalSection = document.getElementById("approval-section");
    if (approvalSection) approvalSection.addEventListener("click", async () => {
      const btn = document.getElementById("rescan-btn");
      if (btn) btn.click();
    });

    const nftSection = document.getElementById("nft-section");
    if (nftSection) nftSection.addEventListener("click", async () => {
      const btn = document.getElementById("rescan-btn");
      if (btn) btn.click();
    });

    // Hidden revoke flow kept for compatibility
    const modal = document.getElementById("revoke-modal");
    if (modal) {
      modal.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-revoke-close]")) hideRevokeModal();
      });
    }
    const copyBtn = document.getElementById("revoke-modal-copy");
    if (copyBtn) copyBtn.addEventListener("click", copyRevokeCalldata);

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && modal && !modal.hidden) hideRevokeModal();
    });

    // Address book
    const addrAdd = document.getElementById("addr-add-btn");
    if (addrAdd) addrAdd.addEventListener("click", handleAddrAdd);
    const addrList = document.getElementById("addr-list");
    if (addrList) addrList.addEventListener("click", handleAddrDelete);
    const addrExport = document.getElementById("addr-export-btn");
    if (addrExport) addrExport.addEventListener("click", handleAddrExport);
    const addrLabel = document.getElementById("addr-label");
    if (addrLabel) addrLabel.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddrAdd();
    });
    const addrInput = document.getElementById("addr-input");
    if (addrInput) addrInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddrAdd();
    });
  }

  async function refresh() {
    try {
      const data = await sendMessage({ action: "getPopupData" });
      if (data && !data.error) applyStats(data);
    } catch (e) { /* noop */ }

    try {
      const approvalData = await sendMessage({ action: "getApprovalScan" });
      applyApprovals(approvalData || {});
    } catch (e) { /* noop */ }

    try {
      const sec = await sendMessage({ action: "getSecurityCenter" });
      applySecurityCenter(sec || {});
    } catch (e) { /* noop */ }

    try {
      const addrData = await sendMessage({ action: "getAddressBook" });
      applyAddressBook(addrData || {});
    } catch (e) { /* noop */ }
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
        else resolve(response);
      });
    });
  }

  // ============================================================
  // HERO SCORE
  // ============================================================

  function applyStats(data) {
    const stats = data.stats || {};
    const logs = data.logs || [];
    const enabled = data.enabled !== false;

    const score = computeSafetyScore(stats);
    setScore(score);

    const badge = document.getElementById("status-badge");
    if (badge) badge.textContent = enabled
      ? t("popup.status.protected")
      : t("popup.status.paused");

    renderActivity(logs);
  }

  function computeSafetyScore(stats) {
    let score = 100;
    score -= Math.min((stats.phishingBlocked || 0) * 5, 30);
    score -= Math.min((stats.permitsDetected || 0) * 2, 20);
    score -= Math.min((stats.warningsShown || 0), 15);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function setScore(target) {
    const el = document.getElementById("wallet-score");
    const stateEl = document.getElementById("score-state");
    if (!el) return;

    el.classList.remove("warn", "danger");
    if (target < 50) el.classList.add("danger");
    else if (target < 75) el.classList.add("warn");

    if (stateEl) {
      if (target >= 90) stateEl.textContent = t("popup.state.protected");
      else if (target >= 70) stateEl.textContent = t("popup.state.caution");
      else if (target >= 40) stateEl.textContent = t("popup.state.atRisk");
      else stateEl.textContent = t("popup.state.danger");
    }

    const start = parseInt(el.textContent, 10);
    const startN = isNaN(start) ? 0 : start;
    if (startN === target) { el.textContent = target; return; }
    const dur = 500;
    const t0 = performance.now();
    function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(startN + (target - startN) * eased);
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ============================================================
  // ACTIVITY
  // ============================================================

  function renderActivity(logs) {
    const list = document.getElementById("logs-list");
    if (!list) return;
    if (!logs || logs.length === 0) {
      list.innerHTML = '<li class="activity__empty">' + escapeHtml(t("popup.activity.empty")) + "</li>";
      return;
    }
    const items = logs.slice(0, 12).map((entry) => {
      const time = formatTime(entry.time);
      const msg = escapeHtml(entry.message);
      let cls = "";
      if (msg.includes("BLOCKED") || msg.includes("CRITICAL") || msg.includes("flagged")) cls = "alert";
      else if (msg.includes("Permit") || msg.includes("Warning")) cls = "warn";
      else if (msg.includes("enabled") || msg.includes("Protected")) cls = "good";
      return `<li class="activity__item">
        <span class="activity__time">${time}</span>
        <span class="activity__text ${cls}">${msg}</span>
      </li>`;
    }).join("");
    list.innerHTML = items;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch { return "--:--"; }
  }

  // ============================================================
  // PROTECTION CHECKS
  // ============================================================

  function applySecurityCenter(sec) {
    const setCheck = (id, valueId, on, valueText, warn) => {
      const row = document.getElementById(id);
      const val = document.getElementById(valueId);
      if (!row || !val) return;
      row.classList.remove("is-on", "is-warn", "is-off");
      row.classList.add(on ? (warn ? "is-warn" : "is-on") : "is-off");
      val.textContent = valueText;
    };

    setCheck(
      "check-protection",
      "check-protection-value",
      sec.enabled !== false,
      sec.enabled !== false ? t("popup.value.enabled") : t("popup.value.disabled"),
      false
    );

    setCheck(
      "check-threats",
      "check-threats-value",
      !!sec.threatFeedEnabled,
      sec.threatFeedEnabled ? t("popup.value.enabled") : t("popup.value.disabled"),
      false
    );

    setCheck(
      "check-cleanup",
      "check-cleanup-value",
      !!sec.autoRevokeOptedIn,
      sec.autoRevokeOptedIn ? t("popup.value.enabled") : t("popup.value.disabled"),
      false
    );

    const dnaCount = sec.dnaWalletCount || 0;
    const dnaEl = document.getElementById("check-dna-value");
    const dnaRow = document.getElementById("check-dna");
    if (dnaEl && dnaRow) {
      dnaRow.classList.remove("is-on", "is-warn", "is-off");
      if (dnaCount > 0) {
        dnaRow.classList.add("is-on");
        dnaEl.textContent = String(dnaCount);
      } else {
        dnaRow.classList.add("is-off");
        dnaEl.textContent = "—";
      }
    }
  }

  // ============================================================
  // TOKEN + NFT PERMISSIONS (rows)
  // ============================================================

  function applyApprovals(data) {
    const scan = data.scan || null;

    const countEl = document.getElementById("approval-count");
    const metaEl = document.getElementById("approval-meta-text");
    const section = document.getElementById("approval-section");

    if (!scan) {
      if (countEl) countEl.textContent = "—";
      if (metaEl) metaEl.textContent = t("popup.permissions.notScanned");
      section && section.classList.remove("has-risky");
    } else {
      const s = scan.summary || { total: 0, risky: 0, unlimited: 0 };
      const risky = s.risky || 0;
      if (countEl) countEl.textContent = String(s.total);
      if (metaEl) {
        if (risky > 0) metaEl.textContent = t("popup.permissions.riskyCount", { risky, total: s.total });
        else if (s.total > 0) metaEl.textContent = t("popup.permissions.allSafe", { total: s.total });
        else metaEl.textContent = t("popup.permissions.noApprovals");
      }
      if (section) section.classList.toggle("has-risky", risky > 0);
    }

    // NFT
    const nftCountEl = document.getElementById("nft-count");
    const nftMetaEl = document.getElementById("nft-meta-text");
    const nftSection = document.getElementById("nft-section");
    const nftSummary = (scan && (scan.nftSummary || (scan.summary && scan.summary.nft))) || null;
    const nftTotal = nftSummary ? nftSummary.total : null;
    const nftRisky = nftSummary ? nftSummary.risky : 0;

    if (nftCountEl) nftCountEl.textContent = nftTotal == null ? "—" : String(nftTotal);
    if (nftMetaEl) {
      if (!scan) nftMetaEl.textContent = t("popup.permissions.notScanned");
      else if (nftRisky > 0) nftMetaEl.textContent = t("popup.permissions.riskyCount", { risky: nftRisky, total: nftTotal });
      else if (nftTotal > 0) nftMetaEl.textContent = t("popup.permissions.allSafe", { total: nftTotal });
      else nftMetaEl.textContent = t("popup.permissions.noNft");
    }
    if (nftSection) nftSection.classList.toggle("has-risky", nftRisky > 0);
  }

  // ============================================================
  // ADDRESS BOOK
  // ============================================================

  let __addressBook = {};

  function applyAddressBook(data) {
    __addressBook = (data && data.book) || {};
    renderAddressBook();
  }

  function renderAddressBook() {
    const list = document.getElementById("addr-list");
    if (!list) return;
    const entries = Object.entries(__addressBook)
      .map(([addr, e]) => ({ address: addr, ...e }))
      .sort((a, b) => {
        const order = { blocked: 0, trusted: 1, neutral: 2 };
        const oa = order[a.trust] ?? 9;
        const ob = order[b.trust] ?? 9;
        if (oa !== ob) return oa - ob;
        return (a.label || "").localeCompare(b.label || "");
      });

    if (entries.length === 0) {
      list.innerHTML = '<li class="activity__empty">' + escapeHtml(t("popup.addressBook.empty")) + "</li>";
      return;
    }

    list.innerHTML = entries.map((e) => {
      const trust = e.trust || "neutral";
      const label = e.label || shorten(e.address);
      const initials = (label || "?").slice(0, 2).toUpperCase();
      return `
        <li class="addr-row trust-${escapeHtml(trust)}">
          <span class="addr-row__avatar">${escapeHtml(initials)}</span>
          <div class="addr-row__body">
            <span class="addr-row__label">${escapeHtml(label)}</span>
            <span class="addr-row__addr">${escapeHtml(shorten(e.address))}</span>
          </div>
          <span class="addr-row__trust">${escapeHtml(trust)}</span>
          <button class="addr-row__del" data-addr-del="${escapeHtml(e.address)}" aria-label="Remove">&times;</button>
        </li>
      `;
    }).join("");
  }

  async function handleAddrAdd() {
    const addrInput = document.getElementById("addr-input");
    const labelInput = document.getElementById("addr-label");
    const trustSelect = document.getElementById("addr-trust");
    if (!addrInput || !labelInput) return;
    const addr = addrInput.value.trim();
    const label = labelInput.value.trim();
    const trust = (trustSelect && trustSelect.value) || "neutral";
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      addrInput.classList.remove("is-error");
      void addrInput.offsetWidth;
      addrInput.classList.add("is-error");
      toast(t("popup.toast.invalidAddress"));
      return;
    }
    const res = await sendMessage({ action: "addAddress", address: addr, label, trust });
    if (res && res.error) {
      toast(t("popup.toast.addFailed"));
      return;
    }
    addrInput.value = "";
    labelInput.value = "";
    applyAddressBook(res && res.book ? { book: res.book } : { book: __addressBook });
    const fresh = await sendMessage({ action: "getAddressBook" });
    applyAddressBook(fresh || {});
    toast(t("popup.toast.added"));
  }

  async function handleAddrDelete(ev) {
    const btn = ev.target.closest("[data-addr-del]");
    if (!btn) return;
    const addr = btn.getAttribute("data-addr-del");
    if (!addr) return;
    const res = await sendMessage({ action: "removeAddress", address: addr });
    if (res && res.book) {
      applyAddressBook({ book: res.book });
      toast(t("popup.toast.removed"));
    }
  }

  async function handleAddrExport() {
    const res = await sendMessage({ action: "getAddressBook" });
    const book = (res && res.book) || __addressBook;
    const json = JSON.stringify(book, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      toast(t("popup.toast.exported"));
    } catch {
      try {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "walletguard-address-book-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast(t("popup.toast.exported"));
      } catch {
        toast(t("popup.toast.exportFailed"));
      }
    }
  }

  function shorten(addr) {
    if (!addr || addr.length < 12) return addr || "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // ============================================================
  // TOAST
  // ============================================================

  let __toastTimer = null;
  function toast(text) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("is-show");
    if (__toastTimer) clearTimeout(__toastTimer);
    __toastTimer = setTimeout(() => el.classList.remove("is-show"), 2200);
  }

  // ============================================================
  // REVOKE (kept for compatibility)
  // ============================================================

  let __activeRevokePlan = null;

  function hideRevokeModal() {
    const m = document.getElementById("revoke-modal");
    if (m) m.hidden = true;
    __activeRevokePlan = null;
  }

  async function copyRevokeCalldata() {
    if (!__activeRevokePlan) return;
    const p = __activeRevokePlan;
    const payload = JSON.stringify({ chainId: p.chainId, to: p.to, data: p.data, value: p.value }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast(t("popup.revoke.copied"));
    } catch {
      toast(t("popup.revoke.copyFailed"));
    }
  }
})();
