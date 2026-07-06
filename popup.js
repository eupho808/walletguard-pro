// popup.js - WalletGuard Pro Dashboard v3.0
// Renders all sections, animates counters, manages interactions.

(function () {
  const i18n = (typeof window !== "undefined" && window.WG_POPUP_LIB && window.WG_POPUP_LIB.i18n) || null;

  function t(key, params) {
    return i18n && i18n.t ? i18n.t(key, params) : key;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (i18n && i18n.initI18n) await i18n.initI18n();
    if (i18n && i18n.applyTranslations) i18n.applyTranslations(document);
    await refreshData();
    attachListeners();
    initAddressBook();
    initSecurityCenter();
    initOnboarding();
  });

  function attachListeners() {
    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) resetBtn.addEventListener("click", async () => {
      if (!confirm(t("popup.confirm.reset"))) return;
      const res = await sendMessage({ action: "resetStats" });
      if (res && res.stats) {
        renderDashboard({ stats: res.stats, logs: [], enabled: true, version: "" });
        showToast(t("popup.toast.statsReset"), "success");
      }
    });

    const settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) settingsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    const rescanBtn = document.getElementById("rescan-btn");
    if (rescanBtn) rescanBtn.addEventListener("click", triggerRescan);

    // Revoke delegation
    const approvalList = document.getElementById("approval-list");
    if (approvalList) approvalList.addEventListener("click", handleRevokeClick);
    const nftList = document.getElementById("nft-list");
    if (nftList) nftList.addEventListener("click", handleRevokeClick);

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
  }

  async function refreshData() {
    try {
      const data = await sendMessage({ action: "getPopupData" });
      if (data && !data.error) {
        renderDashboard(data);
      } else {
        renderDashboard({ stats: {}, logs: [], enabled: true, version: "" });
      }
    } catch (e) {
      console.error("WalletGuard: failed to fetch data:", e);
      renderDashboard({ stats: {}, logs: [], enabled: true, version: "" });
    }

    try {
      const approvalData = await sendMessage({ action: "getApprovalScan" });
      renderApprovals(approvalData || {});
    } catch (e) { console.error("WalletGuard: failed to fetch approval scan:", e); }

    try {
      const simData = await sendMessage({ action: "getLastReceipt" });
      renderSimulation(simData || {});
    } catch (e) { console.error("WalletGuard: failed to fetch simulation:", e); }

    try {
      const addrData = await sendMessage({ action: "getAddressBook" });
      renderAddressBook(addrData || {});
    } catch (e) { console.error("WalletGuard: failed to fetch address book:", e); }

    try {
      const sec = await sendMessage({ action: "getSecurityCenter" });
      renderSecurityCenter(sec || {});
    } catch (e) { console.error("WalletGuard: failed to fetch security center:", e); }
  }

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

  // ============================================================
  // DASHBOARD RENDERING
  // ============================================================

  function renderDashboard(data) {
    const stats = data.stats || {};
    const logs = data.logs || [];
    const enabled = data.enabled !== false;

    // Status indicator + badge
    const dot = document.getElementById("status-dot");
    const badge = document.getElementById("status-badge");
    if (dot) dot.classList.toggle("disabled", !enabled);
    if (badge) {
      badge.classList.toggle("disabled", !enabled);
      badge.textContent = enabled ? t("popup.header.active") : t("popup.header.paused");
    }

    // Safety Score with animated ring + caption
    const score = computeSafetyScore(stats);
    animateScore(score);

    // Animated counters for stats
    setCounter("sites-count", stats.scannedSites || 0);
    setCounter("intercepted-count", stats.interceptedTransactions || 0);
    setCounter("blocked-count", stats.blockedTransactions || 0);
    setCounter("permits-count", stats.permitsDetected || 0);
    setCounter("phishing-count", stats.phishingBlocked || 0);

    renderLogs(logs);
  }

  // ---- Animated safety score ring + number + caption ----
  function animateScore(targetScore) {
    const scoreEl = document.getElementById("wallet-score");
    const ringEl = document.getElementById("score-ring-fill");
    const captionTitle = document.getElementById("score-caption-title");
    const captionText = document.getElementById("score-caption-text");

    if (!scoreEl || !ringEl) return;

    // Color class
    scoreEl.classList.remove("warn", "danger");
    ringEl.classList.remove("warn", "danger");
    let cls = "";
    if (targetScore < 50) cls = "danger";
    else if (targetScore < 75) cls = "warn";
    if (cls) { scoreEl.classList.add(cls); ringEl.classList.add(cls); }

    // Caption
    if (captionTitle && captionText) {
      if (targetScore >= 90) {
        captionTitle.textContent = t("popup.score.titleProtected") || "Protected";
        captionText.textContent = t("popup.score.captionSafe") || "All systems operational";
      } else if (targetScore >= 70) {
        captionTitle.textContent = t("popup.score.titleCaution") || "Caution";
        captionText.textContent = t("popup.score.captionCaution") || "Some risky activity detected";
      } else if (targetScore >= 40) {
        captionTitle.textContent = t("popup.score.titleAtRisk") || "At risk";
        captionText.textContent = t("popup.score.captionAtRisk") || "Multiple warnings — review activity";
      } else {
        captionTitle.textContent = t("popup.score.titleDanger") || "Danger";
        captionText.textContent = t("popup.score.captionDanger") || "Critical risks present — verify every tx";
      }
    }

    // Number animation (count-up over 600ms)
    const start = parseInt(scoreEl.textContent, 10);
    const startN = isNaN(start) ? 0 : start;
    const dur = 700;
    const t0 = performance.now();
    function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3); // ease-out cubic
      const v = Math.round(startN + (targetScore - startN) * eased);
      scoreEl.textContent = v;
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // Ring animation (circumference = 2πr, r=52 => ~326.7)
    const C = 2 * Math.PI * 52;
    const offset = C * (1 - targetScore / 100);
    ringEl.style.strokeDasharray = String(C);
    ringEl.style.strokeDashoffset = String(offset);
  }

  // ---- Animated counter (used for stats) ----
  function setCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = parseInt(el.textContent, 10);
    const startN = isNaN(start) ? 0 : start;
    if (startN === target) { el.textContent = target; return; }

    el.classList.remove("is-counting");
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add("is-counting");

    const dur = 600;
    const t0 = performance.now();
    function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(startN + (target - startN) * eased);
      el.textContent = v;
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function computeSafetyScore(stats) {
    let score = 100;
    const permits = stats.permitsDetected || 0;
    const blocked = stats.blockedTransactions || 0;
    const warnings = stats.warningsShown || 0;
    const phishing = stats.phishingBlocked || 0;

    score -= Math.min(phishing * 5, 30);
    score -= Math.min(permits * 2, 20);
    score -= Math.min(warnings, 15);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ============================================================
  // LOGS / TIMELINE
  // ============================================================

  function renderLogs(logs) {
    const list = document.getElementById("logs-list");
    if (!list) return;
    if (!logs || logs.length === 0) {
      list.innerHTML = '<div class="wg-empty">' + escapeHtml(t("popup.logs.empty")) + "</div>";
      return;
    }

    const html = logs.slice(0, 15).map((entry, idx) => {
      const time = formatTime(entry.time);
      const msg = escapeHtml(entry.message);
      let dotCls = "";
      let msgCls = "";
      if (msg.includes("BLOCKED") || msg.includes("CRITICAL") || msg.includes("flagged") || msg.includes("blacklist")) {
        dotCls = "alert"; msgCls = "alert";
      } else if (msg.includes("Permit") || msg.includes("Warning")) {
        dotCls = "warn"; msgCls = "warn";
      } else if (msg.includes("enabled") || msg.includes("✓") || msg.includes("Protected")) {
        dotCls = "good"; msgCls = "good";
      }
      return `<div class="wg-log-item" style="animation-delay:${idx * 30}ms">
        <span class="wg-log-time">${time}</span>
        <span class="wg-log-dot ${dotCls}" aria-hidden="true"></span>
        <span class="wg-log-message ${msgCls}">${msg}</span>
      </div>`;
    }).join("");

    list.innerHTML = html;
  }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return "--:--";
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  // ============================================================
  // TOAST
  // ============================================================

  let __toastTimer = null;
  function showToast(text, kind = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = text;
    toast.className = "wg-toast is-show is-" + kind;
    if (__toastTimer) clearTimeout(__toastTimer);
    __toastTimer = setTimeout(() => {
      toast.classList.remove("is-show");
    }, 2500);
  }

  // ============================================================
  // APPROVAL SCANNER UI
  // ============================================================

  async function triggerRescan() {
    const btn = document.getElementById("rescan-btn");
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("is-scanning");
    const originalText = btn.textContent;

    try {
      const res = await sendMessage({ action: "rescanApprovals" });
      if (res && res.error) {
        showToast(t("popup.toast.scanFailed") || "Scan failed", "error");
        return;
      }
      if (res && res.scan) {
        renderApprovals({ scan: res.scan, wallet: res.scan.address });
        showToast(t("popup.toast.scanComplete") || "Scan complete", "success");
      }
    } catch (e) {
      showToast(t("popup.toast.scanFailed") || "Scan failed", "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-scanning");
      btn.textContent = originalText;
    }
  }

  function renderApprovals(data) {
    const scan = data.scan || null;
    const wallet = data.wallet || (scan && scan.address) || "";

    const walletEl = document.getElementById("approval-wallet");
    if (walletEl) walletEl.textContent = wallet ? shorten(wallet) : (t("popup.approvals.wallet.none") || "No wallet");

    const timeEl = document.getElementById("approval-time");
    if (timeEl) {
      if (scan && scan.scannedAt) {
        let chainLabel = "";
        if (scan.multiChain) {
          const s = scan.summary || {};
          const scanned = s.chainsScanned || 0;
          const failed = s.chainsFailed || 0;
          const total = scanned + failed;
          if (total > 0) chainLabel = " " + t("popup.approvals.chains", { scanned, total });
        } else if (scan.chainName) {
          chainLabel = " " + t("popup.approvals.chain", { name: scan.chainName });
        }
        timeEl.textContent = t("popup.approvals.scanned", { time: relativeTime(scan.scannedAt) }) + chainLabel;
      } else {
        timeEl.textContent = t("popup.approvals.scannedNever");
      }
    }

    const allApprovals = flattenApprovals(scan);

    const totalEl = document.getElementById("approval-total");
    const riskyEl = document.getElementById("approval-risky");
    const unlimEl = document.getElementById("approval-unlimited");
    const riskyTile = document.getElementById("approval-risky-tile");

    if (!scan) {
      if (totalEl) totalEl.textContent = "--";
      if (riskyEl) riskyEl.textContent = "--";
      if (unlimEl) unlimEl.textContent = "--";
      if (riskyTile) riskyTile.classList.remove("hot");
    } else {
      const s = scan.summary || { total: 0, risky: 0, unlimited: 0 };
      setCounterOnEl(totalEl, s.total);
      setCounterOnEl(riskyEl, s.risky);
      setCounterOnEl(unlimEl, s.unlimited);
      if (riskyTile) riskyTile.classList.toggle("hot", s.risky > 0);
    }

    const list = document.getElementById("approval-list");
    const empty = document.getElementById("approval-empty");
    if (!list || !empty) { renderNFTApprovals(scan); return; }

    if (allApprovals.length === 0) {
      if (scan && scan.multiChain && (scan.summary || {}).chainsFailed) {
        const failed = (scan.summary || {}).chainsFailed;
        empty.textContent = t("popup.approvals.empty.multiFailed", { failed });
      } else if (wallet) {
        empty.textContent = t("popup.approvals.empty.clean");
      } else {
        empty.textContent = t("popup.approvals.empty.noWallet");
      }
      empty.style.display = "";
      Array.from(list.querySelectorAll(".wg-approval-card")).forEach((el) => el.remove());
    } else {
      empty.style.display = "none";

      const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const top = allApprovals.slice().sort((a, b) => {
        const ra = order[a.risk.level] ?? 9;
        const rb = order[b.risk.level] ?? 9;
        if (ra !== rb) return ra - rb;
        return (b.isUnlimited ? 1 : 0) - (a.isUnlimited ? 1 : 0);
      }).slice(0, 5);

      top.forEach((a, i) => { a._cardId = "erc20-" + i; });

      list.innerHTML = top.map(renderApprovalCard).join("");
      attachRevokeDelegation(list, top, "erc20");
    }

    renderNFTApprovals(scan);
  }

  function setCounterOnEl(el, target) {
    if (!el) return;
    const start = parseInt(el.textContent, 10);
    const startN = isNaN(start) ? 0 : start;
    if (startN === target) { el.textContent = target; return; }
    const dur = 500;
    const t0 = performance.now();
    function tick(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = Math.round(startN + (target - startN) * eased);
      el.textContent = v;
      if (k < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function flattenApprovals(scan) {
    if (!scan) return [];
    if (scan.multiChain && Array.isArray(scan.chains)) {
      const out = [];
      for (const c of scan.chains) {
        if (c.error || !Array.isArray(c.approvals)) continue;
        for (const a of c.approvals) {
          if (!a.chainName && c.chainName) a.chainName = c.chainName;
          if (!a.chainId && c.chainId) a.chainId = c.chainId;
          out.push(a);
        }
      }
      return out;
    }
    return Array.isArray(scan.approvals) ? scan.approvals : [];
  }

  function flattenNFTApprovals(scan) {
    if (!scan) return [];
    if (scan.multiChain && Array.isArray(scan.chains)) {
      const out = [];
      for (const c of scan.chains) {
        if (!Array.isArray(c.nftApprovals)) continue;
        for (const a of c.nftApprovals) {
          if (!a.chainName && c.chainName) a.chainName = c.chainName;
          if (!a.chainId && c.chainId) a.chainId = c.chainId;
          out.push(a);
        }
      }
      return out;
    }
    return Array.isArray(scan.nftApprovals) ? scan.nftApprovals : [];
  }

  function renderApprovalCard(a) {
    const level = a.risk.level;
    const allowanceClass = a.isUnlimited ? "unlimited" : "limited";
    const allowanceText = a.isUnlimited
      ? t("popup.revoke.allowanceUnlimited")
      : `${a.allowanceFmt} ${a.tokenSymbol}`;

    const reason = (a.risk.reasons && a.risk.reasons[0]) || "";
    const spenderLabel = a.spenderName
      ? a.spenderName
      : a.spender.slice(0, 6) + "..." + a.spender.slice(-4);

    const canRevoke = level === "critical" || level === "high" || level === "medium";
    const revokeBtn = canRevoke
      ? `<button class="wg-approval-card__revoke" data-revoke-id="${escapeHtml(a._cardId || "")}"
                 title="${escapeHtml(t("popup.approvals.revokeTitle"))}">${escapeHtml(t("popup.revoke.title").replace(" approval", ""))}</button>`
      : "";

    return `
      <div class="wg-approval-card r-${level}" ${a._cardId ? `data-card-id="${escapeHtml(a._cardId)}"` : ""}>
        <div class="wg-approval-card__top">
          <span class="wg-approval-card__token">${escapeHtml(a.tokenSymbol)} <span class="wg-approval-card__token-type">${escapeHtml(a.tokenType)}</span></span>
          <span class="wg-approval-card__allowance ${allowanceClass}">${escapeHtml(allowanceText)}</span>
        </div>
        <div class="wg-approval-card__bottom">
          <span class="wg-approval-card__spender" title="${escapeHtml(a.spender)}">${escapeHtml(spenderLabel)}</span>
          <span class="wg-approval-card__chain">${escapeHtml(a.chainName || "?")}</span>
        </div>
        ${reason ? `<div class="wg-approval-card__reason">${escapeHtml(reason)}</div>` : ""}
        ${revokeBtn}
      </div>
    `;
  }

  // ============================================================
  // NFT APPROVAL SCANNER UI
  // ============================================================

  function renderNFTApprovals(scan) {
    const list = document.getElementById("nft-list");
    const empty = document.getElementById("nft-empty");
    const totalEl = document.getElementById("nft-total");
    const riskyEl = document.getElementById("nft-risky");
    const riskyTile = document.getElementById("nft-risky-tile");
    const metaEl = document.getElementById("nft-meta");

    if (!list || !empty) return;
    const allNFTs = flattenNFTApprovals(scan);

    if (!scan) {
      if (totalEl) totalEl.textContent = "--";
      if (riskyEl) riskyEl.textContent = "--";
      if (riskyTile) riskyTile.classList.remove("hot");
      if (metaEl) metaEl.textContent = "";
    } else {
      const s = scan.nftSummary || (scan.summary && scan.summary.nft) || { total: 0, risky: 0 };
      setCounterOnEl(totalEl, s.total);
      setCounterOnEl(riskyEl, s.risky);
      if (riskyTile) riskyTile.classList.toggle("hot", s.risky > 0);

      if (scan.multiChain && s.byChain && Object.keys(s.byChain).length > 0) {
        const parts = Object.entries(s.byChain)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `${name} (${count})`);
        if (metaEl) metaEl.textContent = parts.join(" \u00b7 ");
      } else if (scan.chainName) {
        if (metaEl) metaEl.textContent = scan.chainName;
      } else {
        if (metaEl) metaEl.textContent = "";
      }
    }

    if (allNFTs.length === 0) {
      empty.textContent = scan
        ? t("popup.nft.empty.scanned")
        : t("popup.nft.empty.never");
      empty.style.display = "";
      Array.from(list.querySelectorAll(".wg-approval-card")).forEach((el) => el.remove());
      return;
    }
    empty.style.display = "none";

    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const top = allNFTs.slice().sort((a, b) => {
      const ra = order[(a.risk || {}).level] ?? 9;
      const rb = order[(b.risk || {}).level] ?? 9;
      return ra - rb;
    }).slice(0, 5);

    top.forEach((a, i) => { a._cardId = "nft-" + i; });

    list.innerHTML = top.map(renderNFTCard).join("");
    attachRevokeDelegation(list, top, "nft");
  }

  function renderNFTCard(a) {
    const level = (a.risk && a.risk.level) || "info";
    const reason = (a.risk && a.risk.reasons && a.risk.reasons[0]) || "";
    const operatorLabel = a.operatorName
      ? a.operatorName
      : (a.operator || "").slice(0, 6) + "..." + (a.operator || "").slice(-4);
    const operatorClass = a.operatorName ? "verified" : "";
    const collectionLabel = a.collectionName || ((a.collection || "").slice(0, 6) + "...");

    const canRevoke = level === "critical" || level === "high" || level === "medium";
    const revokeBtn = canRevoke
      ? `<button class="wg-approval-card__revoke" data-revoke-id="${escapeHtml(a._cardId || "")}"
                 title="${escapeHtml(t("popup.approvals.revokeTitle"))}">${escapeHtml(t("popup.revoke.title").replace(" approval", ""))}</button>`
      : "";

    return `
      <div class="wg-approval-card r-${level}" ${a._cardId ? `data-card-id="${escapeHtml(a._cardId)}"` : ""}>
        <div class="wg-approval-card__top">
          <span class="wg-approval-card__token">${escapeHtml(collectionLabel)} <span class="wg-approval-card__token-type">${escapeHtml(a.tokenType || "NFT")}</span></span>
          <span class="wg-approval-card__risk-badge r-${level}">${escapeHtml(level)}</span>
        </div>
        <div class="wg-approval-card__bottom">
          <span class="wg-approval-card__operator wg-approval-card__spender ${operatorClass}" title="${escapeHtml(a.operator || "")}">${escapeHtml(operatorLabel)}</span>
          <span class="wg-approval-card__chain">${escapeHtml(a.chainName || "?")}</span>
        </div>
        ${reason ? `<div class="wg-approval-card__reason">${escapeHtml(reason)}</div>` : ""}
        ${revokeBtn}
      </div>
    `;
  }

  function relativeTime(iso) {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const min = Math.floor(diff / 60000);
      if (min < 1) return t("popup.approvals.time.justNow");
      if (min < 60) return t("popup.approvals.time.minutesAgo", { n: min });
      const hr = Math.floor(min / 60);
      if (hr < 24) return t("popup.approvals.time.hoursAgo", { n: hr });
      const d = Math.floor(hr / 24);
      return t("popup.approvals.time.daysAgo", { n: d });
    } catch {
      return t("popup.approvals.time.unknown");
    }
  }

  function shorten(addr) {
    if (!addr || addr.length < 12) return addr || "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // ============================================================
  // v2.2 SECURITY CENTER
  // ============================================================

  function renderSecurityCenter(sec) {
    const setVal = (tileId, valId, text, cls) => {
      const el = document.getElementById(valId);
      if (!el) return;
      el.textContent = text;
      el.classList.remove("warn", "bad", "good");
      if (cls) el.classList.add(cls);
      // Mark tile so the icon also recolors
      const tile = document.getElementById(tileId);
      if (tile) {
        tile.classList.remove("has-value-good", "has-value-warn", "has-value-bad");
        if (cls) tile.classList.add("has-value-" + cls);
      }
    };

    // 1. Protection status
    setVal("sec-enabled", "sec-enabled-value", sec.enabled ? (t("popup.sec.on") || "ON") : (t("popup.sec.off") || "OFF"),
      sec.enabled ? "good" : "bad");

    // 2. Approvals
    if (sec.totalApprovals > 0) {
      const risky = sec.riskyApprovals || 0;
      setVal("sec-approvals", "sec-approvals-value", `${sec.totalApprovals}${risky > 0 ? ` (${risky}!)` : ""}`,
        risky > 0 ? "warn" : "good");
    } else {
      setVal("sec-approvals", "sec-approvals-value", "—", "");
    }

    // 3. Stale approvals
    const stale = sec.staleApprovalCount || 0;
    setVal("sec-stale", "sec-stale-value", stale > 0 ? String(stale) : "0",
      stale > 0 ? "warn" : "good");

    // 4. Wallet DNA
    const dnaCount = sec.dnaWalletCount || 0;
    setVal("sec-dna", "sec-dna-value", dnaCount > 0 ? `${dnaCount}` : "—",
      dnaCount > 0 ? "good" : "");

    // 5. Threat feed
    if (sec.threatFeedEnabled) {
      const n = sec.threatFeedCount || 0;
      setVal("sec-feed", "sec-feed-value", `${n}`, "good");
    } else {
      setVal("sec-feed", "sec-feed-value", t("popup.sec.off") || "OFF", "warn");
    }

    // 6. Auto-clean
    setVal("sec-autorevoke", "sec-autorevoke-value", sec.autoRevokeOptedIn ? (t("popup.sec.on") || "ON") : (t("popup.sec.off") || "OFF"),
      sec.autoRevokeOptedIn ? "good" : "warn");

    // Toggle buttons
    const feedBtn = document.getElementById("sec-feed-toggle");
    if (feedBtn) {
      feedBtn.classList.toggle("is-active", !!sec.threatFeedEnabled);
      feedBtn.textContent = sec.threatFeedEnabled ? (t("popup.sec.feedOptOut") || "Disable threat feed") : (t("popup.sec.feedOptIn") || "Enable threat feed");
    }
    const autoBtn = document.getElementById("sec-autorevoke-toggle");
    if (autoBtn) {
      autoBtn.classList.toggle("is-active", !!sec.autoRevokeOptedIn);
      autoBtn.textContent = sec.autoRevokeOptedIn ? (t("popup.sec.autorevokeOptOut") || "Disable auto-clean") : (t("popup.sec.autorevokeOptIn") || "Enable auto-clean");
    }
  }

  async function toggleSec(kind) {
    const res = await sendMessage({ action: "getSecurityCenter" });
    const sec = res || {};
    let action, value;
    if (kind === "feed") {
      action = "setThreatFeedEnabled";
      value = !sec.threatFeedEnabled;
    } else if (kind === "autorevoke") {
      action = "setAutoRevokeOptIn";
      value = !sec.autoRevokeOptedIn;
    } else {
      return;
    }
    await sendMessage({ action, [kind === "feed" ? "enabled" : "optedIn"]: value });
    const fresh = await sendMessage({ action: "getSecurityCenter" });
    renderSecurityCenter(fresh || {});
    showToast(value ? (t("popup.toast.enabled") || "Enabled") : (t("popup.toast.disabled") || "Disabled"), "success");
  }

  function initSecurityCenter() {
    const feedBtn = document.getElementById("sec-feed-toggle");
    if (feedBtn) feedBtn.addEventListener("click", () => toggleSec("feed"));
    const autoBtn = document.getElementById("sec-autorevoke-toggle");
    if (autoBtn) autoBtn.addEventListener("click", () => toggleSec("autorevoke"));
  }

  // ============================================================
  // v2.0 SIMULATION RECEIPT
  // ============================================================

  function renderSimulation(data) {
    const section = document.getElementById("sim-section");
    if (!section) return;
    const receipt = data && data.receipt;
    if (!receipt) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    const metaEl = document.getElementById("sim-meta");
    if (metaEl) {
      const chain = receipt.chainName || (receipt.chainId ? "Chain " + receipt.chainId : "");
      const age = receipt.scannedAt ? relativeTime(receipt.scannedAt) : "";
      metaEl.textContent = [chain, age].filter(Boolean).join(" \u00b7 ");
    }

    const icon = document.getElementById("sim-status-icon");
    const headline = document.getElementById("sim-status-headline");
    const detail = document.getElementById("sim-status-detail");
    if (icon) {
      icon.className = "wg-sim__icon " + (receipt.statusKind || "unknown");
      icon.textContent = receipt.statusIcon || "?";
    }
    if (headline) headline.textContent = receipt.statusHeadline || t("popup.sim.unknown");
    if (detail) detail.textContent = receipt.statusDetail || "";

    const assetsEl = document.getElementById("sim-assets");
    const lines = receipt.assetLines || [];
    if (assetsEl) {
      if (lines.length === 0) {
        assetsEl.innerHTML = '<div class="wg-empty">No asset changes detected.</div>';
      } else {
        assetsEl.innerHTML = lines.map((l) => `
          <div class="wg-sim__asset-row">
            <span>${escapeHtml(l.symbol || "?")}</span>
            <span class="wg-sim__asset-out">${escapeHtml(l.sent || "0")}</span>
            <span class="wg-sim__asset-arrow">&rarr;</span>
            <span class="wg-sim__asset-in">${escapeHtml(l.received || "0")}</span>
          </div>
        `).join("");
      }
    }

    const risksEl = document.getElementById("sim-risks");
    const risks = (receipt.mevRisks && receipt.mevRisks.length > 0)
      ? receipt.mevRisks
      : (receipt.risks || []);
    if (risksEl) {
      if (risks.length === 0) {
        risksEl.innerHTML = '<div class="wg-sim__risk low"><strong>No MEV / risk flags.</strong> This transaction looks safe to sign.</div>';
      } else {
        risksEl.innerHTML = risks.map((r) => `
          <div class="wg-sim__risk ${escapeHtml(r.severity || "low")}">
            <strong>${escapeHtml(r.title || r.type || "Risk")}</strong>
            ${r.message ? " \u2014 " + escapeHtml(r.message) : ""}
          </div>
        `).join("");
      }
    }
  }

  // ============================================================
  // v2.0 ADDRESS BOOK
  // ============================================================

  let __addressBook = {};

  function renderAddressBook(data) {
    const list = document.getElementById("addr-list");
    const empty = document.getElementById("addr-empty");
    if (!list || !empty) return;

    __addressBook = (data && data.book) || {};

    const entries = Object.entries(__addressBook).map(([addr, e]) => ({ address: addr, ...e }));
    if (entries.length === 0) {
      empty.style.display = "";
      Array.from(list.querySelectorAll(".wg-addr-card")).forEach((el) => el.remove());
      return;
    }
    empty.style.display = "none";

    entries.sort((a, b) => {
      const ta = a.trust || "neutral";
      const tb = b.trust || "neutral";
      const order = { blocked: 0, trusted: 1, neutral: 2 };
      const oa = order[ta] ?? 9;
      const ob = order[tb] ?? 9;
      if (oa !== ob) return oa - ob;
      return (a.label || "").localeCompare(b.label || "");
    });

    list.innerHTML = entries.map((e, idx) => {
      const trust = e.trust || "neutral";
      const label = e.label || "(unlabeled)";
      const tags = Array.isArray(e.tags) && e.tags.length > 0
        ? ` <span style="color:#8a92a3;font-size:10px;">[${escapeHtml(e.tags.join(", "))}]</span>`
        : "";
      const initials = (label || "?").slice(0, 2).toUpperCase();
      return `
        <div class="wg-addr-card trust-${escapeHtml(trust)}" style="animation-delay:${idx * 40}ms">
          <div class="wg-addr-card__avatar">${escapeHtml(initials)}</div>
          <div class="wg-addr-card__body">
            <div class="wg-addr-card__label">${escapeHtml(label)}${tags}</div>
            <div class="wg-addr-card__addr">${escapeHtml(shorten(e.address))}</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span class="wg-addr-card__trust ${escapeHtml(trust)}">${escapeHtml(trust)}</span>
            <button class="wg-addr-card__del" data-addr-del="${escapeHtml(e.address)}" title="Remove" aria-label="Remove">&times;</button>
          </div>
        </div>
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
      addrInput.focus();
      showToast(t("popup.toast.invalidAddress") || "Invalid address", "error");
      return;
    }
    const res = await sendMessage({
      action: "addAddress",
      address: addr,
      label: label,
      trust: trust
    });
    if (res && res.error) {
      showToast(t("popup.toast.addFailed") || "Failed to add", "error");
      return;
    }
    addrInput.value = "";
    labelInput.value = "";
    renderAddressBook(res && res.book ? { book: res.book } : { book: __addressBook });
    showToast(t("popup.toast.added") || "Added", "success");
    const fresh = await sendMessage({ action: "getAddressBook" });
    renderAddressBook(fresh || {});
  }

  async function handleAddrDelete(ev) {
    const btn = ev.target.closest("[data-addr-del]");
    if (!btn) return;
    const addr = btn.getAttribute("data-addr-del");
    if (!addr) return;
    const res = await sendMessage({ action: "removeAddress", address: addr });
    if (res && res.book) {
      renderAddressBook({ book: res.book });
      showToast(t("popup.toast.removed") || "Removed", "success");
    }
  }

  async function handleAddrExport() {
    const res = await sendMessage({ action: "getAddressBook" });
    const book = (res && res.book) || __addressBook || {};
    const json = JSON.stringify(book, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      showToast(t("popup.addrbook.exported") || "Copied to clipboard", "success");
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
        showToast(t("popup.addrbook.exported") || "Downloaded", "success");
      } catch {
        showToast(t("popup.addrbook.exportFailed") || "Export failed", "error");
      }
    }
  }

  function initAddressBook() {
    const addBtn = document.getElementById("addr-add-btn");
    if (addBtn) addBtn.addEventListener("click", handleAddrAdd);
    const list = document.getElementById("addr-list");
    if (list) list.addEventListener("click", handleAddrDelete);
    const exportBtn = document.getElementById("addr-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", handleAddrExport);
    const labelInput = document.getElementById("addr-label");
    if (labelInput) labelInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddrAdd();
    });
    const addrInput = document.getElementById("addr-input");
    if (addrInput) addrInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAddrAdd();
    });
  }

  // ============================================================
  // REVOKE FLOW
  // ============================================================

  let __revokeMap = new Map();
  let __activeRevokePlan = null;

  function attachRevokeDelegation(container, items, kind) {
    for (const a of items) {
      if (a._cardId) __revokeMap.set(a._cardId, { approval: a, kind: kind });
    }
  }

  function handleRevokeClick(ev) {
    const btn = ev.target.closest(".wg-approval-card__revoke");
    if (!btn) return;
    const id = btn.getAttribute("data-revoke-id");
    if (!id) return;
    const entry = __revokeMap.get(id);
    if (!entry) return;

    const lib = (typeof window !== "undefined" && window.WG_POPUP_LIB && window.WG_POPUP_LIB.revokeGenerator) || null;
    if (!lib || typeof lib.buildRevokeTx !== "function") {
      showRevokeModal({ error: t("popup.revoke.error.noLib") });
      return;
    }

    let plan;
    try {
      plan = lib.buildRevokeTx(entry.approval);
    } catch (e) {
      showRevokeModal({ error: t("popup.revoke.error.generate", { error: (e && e.message) || e }) });
      return;
    }
    if (!plan) {
      showRevokeModal({ error: t("popup.revoke.error.unknownKind") });
      return;
    }
    showRevokeModal({ plan: plan, approval: entry.approval });
  }

  function showRevokeModal({ plan, approval, error }) {
    const modal = document.getElementById("revoke-modal");
    if (!modal) return;
    __activeRevokePlan = plan || null;

    const lead = document.getElementById("revoke-modal-lead");
    const chainEl = document.getElementById("revoke-modal-chain");
    const toEl = document.getElementById("revoke-modal-to");
    const valueEl = document.getElementById("revoke-modal-value");
    const dataEl = document.getElementById("revoke-modal-data");
    const revokeCashLink = document.getElementById("revoke-modal-revoke-cash");
    const copyBtn = document.getElementById("revoke-modal-copy");

    if (error) {
      lead.textContent = error;
      lead.classList.add("is-error");
      chainEl.textContent = "\u2014";
      toEl.textContent = "\u2014";
      valueEl.textContent = "\u2014";
      dataEl.textContent = "\u2014";
      revokeCashLink.style.display = "none";
      copyBtn.style.display = "none";
    } else {
      lead.classList.remove("is-error");
      lead.textContent = plan.description || t("popup.revoke.leadFallback");
      chainEl.textContent = (plan.chainName || "Chain " + plan.chainId) + " (" + plan.chainId + ")";
      toEl.textContent = plan.to;
      valueEl.textContent = plan.value;
      dataEl.textContent = plan.data;
      revokeCashLink.style.display = "";
      copyBtn.style.display = "";

      let walletAddress = "";
      if (approval) walletAddress = approval.address || "";
      revokeCashLink.href = walletAddress
        ? "https://revoke.cash/address/" + walletAddress
        : "https://revoke.cash/";
    }

    modal.hidden = false;
  }

  function hideRevokeModal() {
    const modal = document.getElementById("revoke-modal");
    if (modal) modal.hidden = true;
    __activeRevokePlan = null;
  }

  async function copyRevokeCalldata() {
    if (!__activeRevokePlan) return;
    const p = __activeRevokePlan;
    const payload = JSON.stringify({
      chainId: p.chainId,
      to: p.to,
      data: p.data,
      value: p.value
    }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      showToast(t("popup.revoke.copied") || "Copied to clipboard", "success");
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showToast(t("popup.revoke.copied") || "Copied", "success");
      } catch {
        showToast(t("popup.revoke.copyFailed") || "Copy failed", "error");
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  // ============================================================
  // ONBOARDING TOUR
  // ============================================================

  const ONBOARDING_STEPS = 4;
  const ONBOARDING_STORAGE = "wg_onboardingCompleted";

  function initOnboarding() {
    const overlay = document.getElementById("onboarding-overlay");
    if (!overlay) return;
    const skipBtn = document.getElementById("onboarding-skip");
    const nextBtn = document.getElementById("onboarding-next");
    if (skipBtn) skipBtn.addEventListener("click", completeOnboarding);
    if (nextBtn) nextBtn.addEventListener("click", advanceOnboarding);
    document.addEventListener("keydown", (ev) => {
      if (overlay.hidden) return;
      if (ev.key === "Escape") completeOnboarding();
      else if (ev.key === "Enter" || ev.key === "ArrowRight") advanceOnboarding();
    });
    maybeShowOnboarding();
  }

  async function maybeShowOnboarding() {
    let completed = false;
    try {
      completed = await getStorage(ONBOARDING_STORAGE, false);
    } catch { /* default to false */ }
    if (!completed) showOnboardingStep(0);
  }

  function showOnboardingStep(idx) {
    const overlay = document.getElementById("onboarding-overlay");
    if (!overlay) return;
    const n = idx + 1;

    document.getElementById("onboarding-title").textContent = t("onboarding.step" + n + ".title");
    document.getElementById("onboarding-body").textContent  = t("onboarding.step" + n + ".body");
    document.getElementById("onboarding-indicator").textContent =
      t("onboarding.indicator", { current: n, total: ONBOARDING_STEPS });

    const dotsEl = document.getElementById("onboarding-dots");
    dotsEl.innerHTML = "";
    for (let i = 0; i < ONBOARDING_STEPS; i++) {
      const d = document.createElement("span");
      d.className = "wg-onboarding__dot" + (i === idx ? " wg-onboarding__dot--active" : "");
      dotsEl.appendChild(d);
    }

    const nextBtn = document.getElementById("onboarding-next");
    nextBtn.textContent = (n === ONBOARDING_STEPS) ? t("common.done") : t("common.next");

    overlay.hidden = false;
    overlay.dataset.step = String(idx);
  }

  function advanceOnboarding() {
    const overlay = document.getElementById("onboarding-overlay");
    if (!overlay || overlay.hidden) return;
    const idx = parseInt(overlay.dataset.step || "0", 10);
    if (idx + 1 >= ONBOARDING_STEPS) {
      completeOnboarding();
    } else {
      showOnboardingStep(idx + 1);
    }
  }

  function completeOnboarding() {
    const overlay = document.getElementById("onboarding-overlay");
    if (overlay) overlay.hidden = true;
    try { setStorage(ONBOARDING_STORAGE, true); } catch { /* ignore */ }
  }

  window.__wgReplayOnboarding = function () {
    try { setStorage(ONBOARDING_STORAGE, false); } catch { /* ignore */ }
    showOnboardingStep(0);
  };

  function getStorage(key, fallback) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get([key], (result) => {
            resolve(result && key in result ? result[key] : fallback);
          });
          return;
        }
      } catch { /* fall through */ }
      resolve(fallback);
    });
  }

  function setStorage(key, value) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: value });
      }
    } catch { /* ignore */ }
  }
})();
