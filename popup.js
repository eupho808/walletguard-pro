// popup.js — WalletGuard Pro v4 CALM
// Minimal dashboard: hero score, protection checks, activity, permissions, addresses.

/**
 * @file Popup UI controller. Reads state from the background service worker
 *       via chrome.runtime.sendMessage and renders it into popup.html.
 *       All visual strings come from lib/i18n (window.WG_POPUP_LIB.i18n).
 * @namespace PopupApp
 */

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

  /**
   * Wire up click / change handlers for the popup. Idempotent across popup
   * reopens (event listeners attach once per page load, which is fine since
   * the popup DOM is rebuilt each time the user opens it).
   * @returns {void}
   */
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

    // Alerts badge — scroll to activity section
    const alertsBadge = document.getElementById("alerts-badge");
    if (alertsBadge) alertsBadge.addEventListener("click", () => {
      const list = document.getElementById("logs-list");
      if (list) list.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // Section navigation — Token/NFT permission rows trigger an approval
    // rescan via the SW. The user sees a "Scanning..." toast; the count
    // updates on next popup open (or auto-refresh after rescan completes).
    const approvalSection = document.getElementById("approval-section");
    if (approvalSection) approvalSection.addEventListener("click", async () => {
      await triggerRescan("token");
    });

    const nftSection = document.getElementById("nft-section");
    if (nftSection) nftSection.addEventListener("click", async () => {
      await triggerRescan("nft");
    });

    // v3.6: Bulk revoke button
    const bulkBtn = document.getElementById("bulk-revoke-btn");
    if (bulkBtn) bulkBtn.addEventListener("click", showBulkRevokePreview);

    // v3.6: Bulk revoke modal close handlers
    const bulkModal = document.getElementById("bulk-revoke-modal");
    if (bulkModal) {
      bulkModal.addEventListener("click", (ev) => {
        if (ev.target.closest("[data-bulk-revoke-close]")) hideBulkRevokeModal();
      });
    }
    const bulkCopy = document.getElementById("bulk-revoke-copy");
    if (bulkCopy) bulkCopy.addEventListener("click", copyBulkRevokePlan);

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

  /**
   * Fetch all popup data in parallel and render it. Each section runs in its
   * own try/catch so a single failing source (e.g. approval scan cold cache)
   * doesn't blank the rest of the UI.
   * @returns {Promise<void>}
   */
  async function refresh() {
    setLoading(true);
    try {
      const data = await sendMessage({ action: "getPopupData" });
      if (data && !data.error) applyStats(data);
    } catch (e) { /* noop */ }

    try {
      const approvalData = await sendMessage({ action: "getApprovalScan" });
      applyApprovals(approvalData || {});
    } catch (e) { /* noop */ }

    try {
      const portData = await sendMessage({ action: "getPortfolioView" });
      applyPortfolio(portData || {});
    } catch (e) { /* noop */ }

    try {
      const bulkData = await sendMessage({ action: "getBulkRevokePlan" });
      applyBulkRevokeAvailability(bulkData || {});
    } catch (e) { /* noop */ }

    try {
      const sec = await sendMessage({ action: "getSecurityCenter" });
      applySecurityCenter(sec || {});
    } catch (e) { /* noop */ }

    try {
      const addrData = await sendMessage({ action: "getAddressBook" });
      applyAddressBook(addrData || {});
    } catch (e) { /* noop */ }
    setLoading(false);
  }

  function setLoading(on) {
    const score = document.getElementById("wallet-score");
    if (score) score.classList.toggle("is-loading", !!on);
  }

  /**
   * Send a message to the background service worker. Resolves with the
   * worker's response or { error } if the channel failed (e.g. SW asleep).
   * @param {object} msg - Action payload understood by background.js handlers.
   * @returns {Promise<object>}
   */
  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
        else resolve(response);
      });
    });
  }

  /**
   * Trigger an approval rescan via the SW. If no wallet has been seen yet,
   * shows a hint toast pointing the user to send a transaction first.
   * @param {"token"|"nft"} kind - Used for the toast label only.
   * @returns {Promise<void>}
   */
  async function triggerRescan(kind) {
    const metaEl = document.getElementById(kind === "token" ? "approval-meta-text" : "nft-meta-text");
    const prevText = metaEl ? metaEl.textContent : "";
    if (metaEl) metaEl.textContent = t("popup.permissions.scanning");
    try {
      const res = await sendMessage({ action: "rescanApprovals" });
      if (res && res.error) {
        toast(t("popup.permissions.scanFailed", { error: res.error }));
        if (metaEl) metaEl.textContent = prevText;
        return;
      }
      // Refresh just the approval rows so the count updates without a full reload.
      const fresh = await sendMessage({ action: "getApprovalScan" });
      applyApprovals(fresh || {});
      toast(t("popup.permissions.scanDone"));
    } catch {
      toast(t("popup.permissions.scanFailed", { error: "network" }));
      if (metaEl) metaEl.textContent = prevText;
    }
  }

  // ============================================================
  // HERO SCORE
  // ============================================================

  /**
   * Render the hero Safety Score, status badge, connected wallet, unread
   * alerts badge, and the activity timeline from a getPopupData response.
   * @param {{stats?: object, logs?: Array, enabled?: boolean, wallet?: string,
   *          chainId?: number|null, chainName?: string|null}} data
   * @returns {void}
   */
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

    applyWallet(data);
    applyAlertsBadge(data);
    renderActivity(logs);
  }

  /**
   * Show the connected wallet line above the hero score. Hidden until a
   * real transaction has been intercepted (LAST_WALLET populated).
   * @param {{wallet?: string, chainName?: string|null}} data
   * @returns {void}
   */
  function applyWallet(data) {
    const section = document.getElementById("wallet-section");
    const addrEl = document.getElementById("wallet-addr");
    const chainEl = document.getElementById("wallet-chain");
    if (!section || !addrEl) return;

    const addr = data.wallet || "";
    const chain = data.chainName || "";

    if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
      addrEl.textContent = shorten(addr);
      addrEl.title = addr;
      if (chainEl) chainEl.textContent = chain || "";
      section.hidden = false;
    } else {
      section.hidden = true;
    }
  }

  /**
   * Show or hide the unread-alerts badge in the topbar. Counts critical
   * log entries (BLOCKED / CRITICAL / Phishing / flagged / danger) from the
   * last 24 hours. Capped at 9+ for visual stability.
   * @param {{logs?: Array}} data
   * @returns {void}
   */
  function applyAlertsBadge(data) {
    const badge = document.getElementById("alerts-badge");
    const countEl = document.getElementById("alerts-count");
    if (!badge || !countEl) return;
    const count = computeUnreadCount(data);
    if (count > 0) {
      countEl.textContent = count > 9 ? "9+" : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function computeUnreadCount(data) {
    const logs = data.logs || [];
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return logs.filter((l) => {
      if (!l || !l.time) return false;
      if (new Date(l.time).getTime() < since) return false;
      const m = String(l.message || "");
      return /BLOCKED|CRITICAL|Phishing|flagged|danger/i.test(m);
    }).length;
  }

  /**
   * Compute the 0-100 Safety Score from cumulative stats.
   * Deductions: phishingBlocked (max 30), permitsDetected (max 20),
   * warningsShown (max 15). Result is clamped and rounded.
   * @param {{phishingBlocked?: number, permitsDetected?: number,
   *          warningsShown?: number}} stats
   * @returns {number}
   */
  function computeSafetyScore(stats) {
    let score = 100;
    score -= Math.min((stats.phishingBlocked || 0) * 5, 30);
    score -= Math.min((stats.permitsDetected || 0) * 2, 20);
    score -= Math.min((stats.warningsShown || 0), 15);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Animate the hero score to `target` over 500ms with ease-out cubic.
   * Also updates the score colour (.warn / .danger) and the state caption
   * (protected / caution / atRisk / danger) based on thresholds.
   * @param {number} target - New score value 0-100.
   * @returns {void}
   */
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
    // Generation token — if a newer setScore call starts while we're animating,
    // it bumps this counter and we abort to avoid two loops fighting.
    const myToken = ++__scoreGen;
    function tick(now) {
      if (myToken !== __scoreGen) return;
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(startN + (target - startN) * eased);
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /** Monotonic counter — see setScore() for usage. */
  let __scoreGen = 0;

  // ============================================================
  // ACTIVITY
  // ============================================================

  /**
   * Render the recent activity timeline (last 12 entries). Each row is
   * classified by `classifyLog()` into danger / warn / good / info which
   * drives the left-border colour.
   * @param {Array<{time: string, message: string}>} logs
   * @returns {void}
   */
  function renderActivity(logs) {
    const list = document.getElementById("logs-list");
    if (!list) return;
    if (!logs || logs.length === 0) {
      list.innerHTML = '<li class="activity__empty">' + escapeHtml(t("popup.activity.empty")) + "</li>";
      return;
    }
    const items = logs.slice(0, 12).map((entry) => {
      const time = formatTime(entry.time);
      const msg = escapeHtml(entry.message || "");
      const level = classifyLog(entry.message || "");
      return `<li class="activity__item activity__item--${level}">
        <span class="activity__time">${time}</span>
        <span class="activity__text">${msg}</span>
      </li>`;
    }).join("");
    list.innerHTML = items;
  }

  /**
   * Classify a log message into a severity bucket for visual rendering.
   * Pattern-matching is intentionally simple and tolerant (case-insensitive
   * via the /i flag on substring regexes).
   * @param {string} message - Raw log message text.
   * @returns {"danger"|"warn"|"good"|"info"}
   */
  function classifyLog(message) {
    if (/BLOCKED|CRITICAL|Phishing|flagged/i.test(message)) return "danger";
    // "disabled" / "paused" / "stopped" — protection reduced → warn
    if (/Permit|Warning|risk|MEV|sandwich|disabled|paused|stopped/i.test(message)) return "warn";
    if (/enabled|protected|installed|updated|reset|saved|cleared/i.test(message)) return "good";
    return "info";
  }

  /**
   * Format an ISO timestamp as HH:MM in the user's local timezone.
   * Returns "--:--" if the input is malformed.
   * @param {string} iso
   * @returns {string}
   */
  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch { return "--:--"; }
  }

  // ============================================================
  // PROTECTION CHECKS
  // ============================================================

  /**
   * Render the protection checks list. Each row gets .is-on / .is-warn /
   * .is-off which drives its left-border and value colour.
   * @param {{enabled?: boolean, threatFeedEnabled?: boolean,
   *          autoRevokeOptedIn?: boolean, dnaWalletCount?: number}} sec
   * @returns {void}
   */
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

  /**
   * Render the token + NFT permission rows from the latest approval scan.
   * If risky > 0 the row gets .has-risky which colours the count red.
   * @param {{scan?: {summary?: {total?: number, risky?: number, unlimited?: number,
   *                            nft?: {total?: number, risky?: number}},
   *                  nftSummary?: {total?: number, risky?: number}}|null}} data
   * @returns {void}
   */
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

  /** Cached address-book state, keyed by lowercase address. */
  let __addressBook = {};

  /**
   * Replace the cached address book and re-render.
   * @param {{book?: Record<string, {label?: string, trust?: string}>}} data
   * @returns {void}
   */
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

  /**
   * Validate the address-input row, send addAddress to the SW, then refresh
   * the list. Shows a shake animation and error toast on invalid input.
   * @returns {Promise<void>}
   */
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

  // ============================================================
  // v3.6: PORTFOLIO VIEW
  // ============================================================

  /**
   * Render the portfolio summary section. Shows at-risk USD, counts, and
   * top-3 risks. Hidden until a real scan has been run.
   * @param {{portfolio?: object|null, reason?: string}} data
   * @returns {void}
   */
  function applyPortfolio(data) {
    const section = document.getElementById("portfolio-section");
    if (!section) return;
    const p = data && data.portfolio;
    if (!p || p.totalApprovals === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const atRiskEl = document.getElementById("portfolio-at-risk");
    if (atRiskEl) {
      const usd = p.totalAtRiskUsd || 0;
      atRiskEl.textContent = usd === 0 ? "$0" : "$" + usd.toLocaleString();
      atRiskEl.classList.toggle("is-critical", p.riskyCount > 0);
      atRiskEl.classList.toggle("is-high", usd >= 1000 && p.riskyCount === 0);
    }
    const countsEl = document.getElementById("portfolio-counts");
    if (countsEl) {
      const parts = [];
      if (p.riskyCount > 0) parts.push(p.riskyCount + " risky");
      if (p.unlimitedCount > 0) parts.push(p.unlimitedCount + " unlimited");
      if (p.staleCount > 0) parts.push(p.staleCount + " stale");
      countsEl.textContent = parts.length === 0 ? "All clean" : parts.join(" · ");
    }
    const topEl = document.getElementById("portfolio-top");
    if (topEl) {
      const top = (p.topRisks || []).slice(0, 3);
      if (top.length === 0) {
        topEl.innerHTML = "";
        return;
      }
      topEl.innerHTML = top.map((r) => {
        const usdStr = r.usd === null ? "—" : "$" + Math.round(r.usd).toLocaleString();
        return `<li class="portfolio__top-item">
          <span class="portfolio__top-sym">${escapeHtml(r.tokenSymbol || "?")}</span>
          <span class="portfolio__top-usd">${usdStr}</span>
          <span class="portfolio__top-chain">${escapeHtml(r.chainName || "")}</span>
        </li>`;
      }).join("");
    }
  }

  // ============================================================
  // v3.6: BULK REVOKE
  // ============================================================

  let __activeBulkPlan = null;

  /**
   * Show the bulk-revoke button only when there's a non-empty plan.
   * @param {{plan?: object|null, reason?: string}} data
   * @returns {void}
   */
  function applyBulkRevokeAvailability(data) {
    const section = document.getElementById("bulk-revoke-section");
    const descEl = document.getElementById("bulk-revoke-desc");
    if (!section) return;
    const plan = data && data.plan;
    if (!plan || !plan.batches || plan.batches.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    if (descEl) {
      const n = plan.candidateCount || 0;
      const b = plan.batches.length;
      descEl.textContent = `${n} approval${n > 1 ? "s" : ""} → ${b} transaction${b > 1 ? "s" : ""}.`;
    }
  }

  /**
   * Re-fetch the bulk revoke plan and show it in the preview modal.
   * Each batch shows its chain, token, approval count, and calldata.
   * User can copy the entire plan to clipboard as JSON.
   * @returns {Promise<void>}
   */
  async function showBulkRevokePreview() {
    const res = await sendMessage({ action: "getBulkRevokePlan" });
    if (!res || !res.plan || !res.plan.batches || res.plan.batches.length === 0) {
      toast(res && res.reason || "No bulk revoke plan available.");
      return;
    }
    __activeBulkPlan = res.plan;
    const modal = document.getElementById("bulk-revoke-modal");
    const lead = document.getElementById("bulk-revoke-modal-lead");
    const list = document.getElementById("bulk-revoke-modal-list");
    if (!modal || !list) return;
    const n = res.plan.candidateCount || 0;
    const b = res.plan.batches.length;
    if (lead) lead.textContent = `${n} approval${n > 1 ? "s" : ""} ready to revoke across ${b} transaction${b > 1 ? "s" : ""}.`;
    list.innerHTML = res.plan.batches.map((batch) => {
      return `<div class="bulk-revoke__batch">
        <div class="bulk-revoke__batch-head">
          <span class="bulk-revoke__batch-chain">${escapeHtml(batch.chainName || "Chain")}</span>
          <span class="bulk-revoke__batch-sym">${escapeHtml(batch.tokenSymbol || "?")}</span>
          <span class="bulk-revoke__batch-count">${batch.approvalCount} approval${batch.approvalCount > 1 ? "s" : ""}</span>
        </div>
        <div class="bulk-revoke__batch-data mono mono-break">${escapeHtml(batch.data || "")}</div>
      </div>`;
    }).join("");
    modal.hidden = false;
  }

  function hideBulkRevokeModal() {
    const m = document.getElementById("bulk-revoke-modal");
    if (m) m.hidden = true;
    __activeBulkPlan = null;
  }

  async function copyBulkRevokePlan() {
    if (!__activeBulkPlan) return;
    const payload = JSON.stringify(__activeBulkPlan, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      toast(t("popup.bulkRevoke.copied"));
    } catch {
      toast(t("popup.bulkRevoke.copyFailed"));
    }
  }
})();
