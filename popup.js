// popup.js - WalletGuard Pro Dashboard
// Pulls real statistics from background service worker.
// All UI strings come from lib/i18n (via window.WG_POPUP_LIB.i18n) so the
// dashboard is fully translated at runtime.

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
    document.getElementById("reset-btn").addEventListener("click", async () => {
      if (!confirm(t("popup.confirm.reset"))) return;
      const res = await sendMessage({ action: "resetStats" });
      if (res && res.stats) {
        renderDashboard({ stats: res.stats, logs: [], enabled: true, version: "" });
      }
    });

    document.getElementById("settings-btn").addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById("rescan-btn").addEventListener("click", triggerRescan);

    // Revoke flow: delegated click handlers on the approval + NFT lists,
    // and on the modal's close / copy buttons.
    const approvalList = document.getElementById("approval-list");
    if (approvalList) approvalList.addEventListener("click", handleRevokeClick);
    const nftList = document.getElementById("nft-list");
    if (nftList) nftList.addEventListener("click", handleRevokeClick);

    const modal = document.getElementById("revoke-modal");
    if (modal) {
      modal.addEventListener("click", (ev) => {
        if (ev.target.hasAttribute("data-revoke-close")) hideRevokeModal();
      });
    }
    const copyBtn = document.getElementById("revoke-modal-copy");
    if (copyBtn) copyBtn.addEventListener("click", copyRevokeCalldata);

    // Escape closes the modal.
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

    // Approval scan is fetched independently so a failed scan doesn't block dashboard.
    try {
      const approvalData = await sendMessage({ action: "getApprovalScan" });
      renderApprovals(approvalData || {});
    } catch (e) {
      console.error("WalletGuard: failed to fetch approval scan:", e);
    }

    // v2.0: last simulation receipt (independent fetch).
    try {
      const simData = await sendMessage({ action: "getLastReceipt" });
      renderSimulation(simData || {});
    } catch (e) {
      console.error("WalletGuard: failed to fetch simulation:", e);
    }

    // v2.0: address book list (independent fetch).
    try {
      const addrData = await sendMessage({ action: "getAddressBook" });
      renderAddressBook(addrData || {});
    } catch (e) {
      console.error("WalletGuard: failed to fetch address book:", e);
    }

    // v2.2: security center (independent fetch).
    try {
      const sec = await sendMessage({ action: "getSecurityCenter" });
      renderSecurityCenter(sec || {});
    } catch (e) {
      console.error("WalletGuard: failed to fetch security center:", e);
    }
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

  function renderDashboard(data) {
    const stats = data.stats || {};
    const logs = data.logs || [];
    const enabled = data.enabled !== false;

    // ---- Status ----
    const dot = document.getElementById("status-dot");
    const badge = document.getElementById("status-badge");
    if (enabled) {
      dot.classList.remove("disabled");
      badge.classList.remove("disabled");
      badge.textContent = t("popup.header.active");
    } else {
      dot.classList.add("disabled");
      badge.classList.add("disabled");
      badge.textContent = t("popup.header.paused");
    }

    // ---- Wallet Safety Score ----
    const score = computeSafetyScore(stats);
    const scoreEl = document.getElementById("wallet-score");
    scoreEl.textContent = score;
    scoreEl.classList.remove("warn", "danger");
    if (score < 50) scoreEl.classList.add("danger");
    else if (score < 75) scoreEl.classList.add("warn");

    // ---- Stats ----
    document.getElementById("sites-count").textContent = stats.scannedSites || 0;
    document.getElementById("intercepted-count").textContent = stats.interceptedTransactions || 0;
    document.getElementById("blocked-count").textContent = stats.blockedTransactions || 0;
    document.getElementById("permits-count").textContent = stats.permitsDetected || 0;
    document.getElementById("phishing-count").textContent = stats.phishingBlocked || 0;

    // ---- Logs ----
    renderLogs(logs);
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

  function renderLogs(logs) {
    const list = document.getElementById("logs-list");
    if (!logs || logs.length === 0) {
      list.innerHTML = '<div class="log-empty">' + escapeHtml(t("popup.logs.empty")) + "</div>";
      return;
    }

    const html = logs.slice(0, 15).map((entry) => {
      const time = formatTime(entry.time);
      const msg = escapeHtml(entry.message);
      let cls = "";
      if (msg.includes("BLOCKED") || msg.includes("CRITICAL") || msg.includes("flagged") || msg.includes("blacklist")) cls = "alert";
      else if (msg.includes("Permit") || msg.includes("Warning")) cls = "warn";
      return `<div class="log-item">
        <span class="log-time">${time}</span>
        <span class="log-message ${cls}">${msg}</span>
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
  // APPROVAL SCANNER UI
  // ============================================================

  async function triggerRescan() {
    const btn = document.getElementById("rescan-btn");
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("scanning");
    const originalText = btn.textContent;
    btn.textContent = t("popup.approvals.scanning");

    try {
      const res = await sendMessage({ action: "rescanApprovals" });
      if (res && res.error) {
        alert(t("popup.approvals.scanFailed", { error: res.error }));
        return;
      }
      if (res && res.scan) {
        renderApprovals({ scan: res.scan, wallet: res.scan.address });
      }
    } catch (e) {
      alert(t("popup.approvals.scanFailed", { error: (e && e.message) || e }));
    } finally {
      btn.disabled = false;
      btn.classList.remove("scanning");
      btn.textContent = originalText;
    }
  }

  function renderApprovals(data) {
    const scan = data.scan || null;
    const wallet = data.wallet || (scan && scan.address) || "";

    // Wallet line
    const walletEl = document.getElementById("approval-wallet");
    walletEl.textContent = wallet ? shorten(wallet) : t("popup.approvals.wallet.none");

    // Timestamp + chain scope line.
    const timeEl = document.getElementById("approval-time");
    if (scan && scan.scannedAt) {
      let chainLabel = "";
      if (scan.multiChain) {
        const s = scan.summary || {};
        const scanned = s.chainsScanned || 0;
        const failed = s.chainsFailed || 0;
        const total = scanned + failed;
        if (total > 0) {
          chainLabel = " " + t("popup.approvals.chains", { scanned, total });
        }
      } else if (scan.chainName) {
        chainLabel = " " + t("popup.approvals.chain", { name: scan.chainName });
      }
      timeEl.textContent = t("popup.approvals.scanned", { time: relativeTime(scan.scannedAt) }) + chainLabel;
    } else {
      timeEl.textContent = t("popup.approvals.scannedNever");
    }

    // Aggregate approvals from all chains (multi-chain) or use directly.
    const allApprovals = flattenApprovals(scan);

    // Summary tiles
    const totalEl = document.getElementById("approval-total");
    const riskyEl = document.getElementById("approval-risky");
    const unlimEl = document.getElementById("approval-unlimited");
    const riskyTile = document.getElementById("approval-risky-tile");

    if (!scan) {
      totalEl.textContent = "--";
      riskyEl.textContent = "--";
      unlimEl.textContent = "--";
      riskyTile.classList.remove("hot");
    } else {
      const s = scan.summary || { total: 0, risky: 0, unlimited: 0 };
      totalEl.textContent = s.total;
      riskyEl.textContent = s.risky;
      unlimEl.textContent = s.unlimited;
      if (s.risky > 0) riskyTile.classList.add("hot");
      else riskyTile.classList.remove("hot");
    }

    // Approval list
    const list = document.getElementById("approval-list");
    const empty = document.getElementById("approval-empty");

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
      Array.from(list.querySelectorAll(".approval-card")).forEach((el) => el.remove());
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
      ? `<button class="approval-revoke" data-revoke-id="${escapeHtml(a._cardId || "")}"
                 title="${escapeHtml(t("popup.approvals.revokeTitle"))}">${escapeHtml(t("popup.revoke.title").replace(" approval", ""))}</button>`
      : "";

    return `
      <div class="approval-card r-${level}" ${a._cardId ? `data-card-id="${escapeHtml(a._cardId)}"` : ""}>
        <div class="approval-top">
          <span class="approval-token">${escapeHtml(a.tokenSymbol)} <span style="color:#4c5264;font-weight:500;font-size:10px;">${escapeHtml(a.tokenType)}</span></span>
          <span class="approval-allowance ${allowanceClass}">${escapeHtml(allowanceText)}</span>
        </div>
        <div class="approval-bottom">
          <span class="approval-spender" title="${escapeHtml(a.spender)}">${escapeHtml(spenderLabel)}</span>
          <span class="approval-chain">${escapeHtml(a.chainName || "?")}</span>
        </div>
        ${reason ? `<div class="approval-reason">${escapeHtml(reason)}</div>` : ""}
        ${revokeBtn ? `<div class="approval-actions">${revokeBtn}</div>` : ""}
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

    const allNFTs = flattenNFTApprovals(scan);

    if (!scan) {
      totalEl.textContent = "--";
      riskyEl.textContent = "--";
      riskyTile.classList.remove("hot");
      metaEl.textContent = "";
    } else {
      const s = scan.nftSummary || (scan.summary && scan.summary.nft) || { total: 0, risky: 0 };
      totalEl.textContent = s.total;
      riskyEl.textContent = s.risky;
      if (s.risky > 0) riskyTile.classList.add("hot");
      else riskyTile.classList.remove("hot");

      if (scan.multiChain && s.byChain && Object.keys(s.byChain).length > 0) {
        const parts = Object.entries(s.byChain)
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `${name} (${count})`);
        metaEl.textContent = parts.join(" \u00b7 ");
      } else if (scan.chainName) {
        metaEl.textContent = scan.chainName;
      } else {
        metaEl.textContent = "";
      }
    }

    if (allNFTs.length === 0) {
      empty.textContent = scan
        ? t("popup.nft.empty.scanned")
        : t("popup.nft.empty.never");
      empty.style.display = "";
      Array.from(list.querySelectorAll(".nft-card")).forEach((el) => el.remove());
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
      ? `<button class="approval-revoke" data-revoke-id="${escapeHtml(a._cardId || "")}"
                 title="${escapeHtml(t("popup.approvals.revokeTitle"))}">${escapeHtml(t("popup.revoke.title").replace(" approval", ""))}</button>`
      : "";

    return `
      <div class="nft-card r-${level}" ${a._cardId ? `data-card-id="${escapeHtml(a._cardId)}"` : ""}>
        <div class="nft-top">
          <span class="nft-collection">${escapeHtml(collectionLabel)} <span class="nft-type">${escapeHtml(a.tokenType || "NFT")}</span></span>
          <span class="nft-risk-badge r-${level}">${escapeHtml(level)}</span>
        </div>
        <div class="nft-bottom">
          <span class="nft-operator ${operatorClass}" title="${escapeHtml(a.operator || "")}">${escapeHtml(operatorLabel)}</span>
          <span class="nft-chain">${escapeHtml(a.chainName || "?")}</span>
        </div>
        ${reason ? `<div class="nft-reason">${escapeHtml(reason)}</div>` : ""}
        ${revokeBtn ? `<div class="approval-actions">${revokeBtn}</div>` : ""}
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
  //
  // Compact dashboard with 6 tiles summarising every protection layer.

  function renderSecurityCenter(sec) {
    const setVal = (id, text, cls) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.classList.remove("warn", "bad", "good");
      if (cls) el.classList.add(cls);
    };

    // 1. Protection status
    setVal("sec-enabled-value", sec.enabled ? t("popup.sec.on") : t("popup.sec.off"),
      sec.enabled ? "good" : "bad");

    // 2. Approvals
    if (sec.totalApprovals > 0) {
      const risky = sec.riskyApprovals || 0;
      setVal("sec-approvals-value", `${sec.totalApprovals}${risky > 0 ? ` (${risky}!)` : ""}`,
        risky > 0 ? "warn" : "good");
    } else {
      setVal("sec-approvals-value", "—", "");
    }

    // 3. Stale approvals
    const stale = sec.staleApprovalCount || 0;
    setVal("sec-stale-value", stale > 0 ? String(stale) : "0",
      stale > 0 ? "warn" : "good");

    // 4. Wallet DNA
    const dnaCount = sec.dnaWalletCount || 0;
    setVal("sec-dna-value", dnaCount > 0 ? `${dnaCount}` : "—",
      dnaCount > 0 ? "good" : "");

    // 5. Threat feed
    if (sec.threatFeedEnabled) {
      const n = sec.threatFeedCount || 0;
      setVal("sec-feed-value", `${n}`, "good");
    } else {
      setVal("sec-feed-value", t("popup.sec.off"), "warn");
    }

    // 6. Auto-clean
    setVal("sec-autorevoke-value", sec.autoRevokeOptedIn ? t("popup.sec.on") : t("popup.sec.off"),
      sec.autoRevokeOptedIn ? "good" : "warn");

    // Toggle buttons
    const feedBtn = document.getElementById("sec-feed-toggle");
    if (feedBtn) {
      feedBtn.classList.toggle("is-active", !!sec.threatFeedEnabled);
      feedBtn.textContent = sec.threatFeedEnabled ? t("popup.sec.feedOptOut") : t("popup.sec.feedOptIn");
    }
    const autoBtn = document.getElementById("sec-autorevoke-toggle");
    if (autoBtn) {
      autoBtn.classList.toggle("is-active", !!sec.autoRevokeOptedIn);
      autoBtn.textContent = sec.autoRevokeOptedIn ? t("popup.sec.autorevokeOptOut") : t("popup.sec.autorevokeOptIn");
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
  }

  function initSecurityCenter() {
    const feedBtn = document.getElementById("sec-feed-toggle");
    if (feedBtn) feedBtn.addEventListener("click", () => toggleSec("feed"));
    const autoBtn = document.getElementById("sec-autorevoke-toggle");
    if (autoBtn) autoBtn.addEventListener("click", () => toggleSec("autorevoke"));
  }

  // ============================================================
  // v2.0 SIMULATION RECEIPT (last intercepted transaction)
  // ============================================================
  //
  // Render the most recent tx that the content script analyzed. Shows
  // asset changes, MEV risk, and revert status. Populated by the
  // background SW when it receives a `txReceipt` message.

  function renderSimulation(data) {
    const section = document.getElementById("sim-section");
    if (!section) return;
    const receipt = data && data.receipt;
    if (!receipt) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    // Meta line: chain + age.
    const metaEl = document.getElementById("sim-meta");
    if (metaEl) {
      const chain = receipt.chainName || (receipt.chainId ? "Chain " + receipt.chainId : "");
      const age = receipt.scannedAt ? relativeTime(receipt.scannedAt) : "";
      metaEl.textContent = [chain, age].filter(Boolean).join(" \u00b7 ");
    }

    // Status icon + headline.
    const icon = document.getElementById("sim-status-icon");
    const headline = document.getElementById("sim-status-headline");
    const detail = document.getElementById("sim-status-detail");
    icon.className = "sim-status-icon " + (receipt.statusKind || "unknown");
    icon.textContent = receipt.statusIcon || "?";
    headline.textContent = receipt.statusHeadline || t("popup.sim.unknown");
    detail.textContent = receipt.statusDetail || "";

    // Asset changes.
    const assetsEl = document.getElementById("sim-assets");
    const lines = receipt.assetLines || [];
    if (assetsEl) {
      if (lines.length === 0) {
        assetsEl.innerHTML = '<div style="font-size:11px;color:#4c5264;padding:4px 8px;">No asset changes detected.</div>';
      } else {
        assetsEl.innerHTML = lines.map((l) => `
          <div class="sim-asset-row">
            <span>${escapeHtml(l.symbol || "?")}</span>
            <span class="sim-asset-out">${escapeHtml(l.sent || "0")}</span>
            <span class="sim-asset-arrow">&rarr;</span>
            <span class="sim-asset-in">${escapeHtml(l.received || "0")}</span>
          </div>
        `).join("");
      }
    }

    // MEV + risk list.
    const risksEl = document.getElementById("sim-risks");
    const risks = (receipt.mevRisks && receipt.mevRisks.length > 0)
      ? receipt.mevRisks
      : (receipt.risks || []);
    if (risksEl) {
      if (risks.length === 0) {
        risksEl.innerHTML = '<div class="sim-risk low"><strong>No MEV / risk flags.</strong> This transaction looks safe to sign.</div>';
      } else {
        risksEl.innerHTML = risks.map((r) => `
          <div class="sim-risk ${escapeHtml(r.severity || "low")}">
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
  //
  // Local-only CRUD for address labels. The background SW persists
  // the book in chrome.storage.local under wg_addressBook.

  let __addressBook = {};

  function renderAddressBook(data) {
    const list = document.getElementById("addr-list");
    const empty = document.getElementById("addr-empty");
    if (!list || !empty) return;

    __addressBook = (data && data.book) || {};

    const entries = Object.entries(__addressBook).map(([addr, e]) => ({ address: addr, ...e }));
    if (entries.length === 0) {
      empty.style.display = "";
      Array.from(list.querySelectorAll(".addr-card")).forEach((el) => el.remove());
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

    list.innerHTML = entries.map((e) => {
      const trust = e.trust || "neutral";
      const label = e.label || "(unlabeled)";
      const tags = Array.isArray(e.tags) && e.tags.length > 0
        ? ` <span style="color:#8a92a3;font-size:10px;">[${escapeHtml(e.tags.join(", "))}]</span>`
        : "";
      return `
        <div class="addr-card trust-${escapeHtml(trust)}">
          <div>
            <div class="addr-card-label">${escapeHtml(label)}${tags}</div>
            <div class="addr-card-addr">${escapeHtml(shorten(e.address))}</div>
          </div>
          <span class="addr-card-trust ${escapeHtml(trust)}">${escapeHtml(trust)}</span>
          <button class="addr-card-del" data-addr-del="${escapeHtml(e.address)}" title="Remove">&times;</button>
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
      addrInput.focus();
      addrInput.style.borderColor = "#ff4d4d";
      setTimeout(() => { addrInput.style.borderColor = ""; }, 1400);
      return;
    }
    const res = await sendMessage({
      action: "addAddress",
      address: addr,
      label: label,
      trust: trust
    });
    if (res && res.error) {
      console.error("addr-book: add failed:", res.error);
      return;
    }
    addrInput.value = "";
    labelInput.value = "";
    renderAddressBook(res && res.book ? { book: res.book } : { book: __addressBook });
    // Refetch authoritative state.
    const fresh = await sendMessage({ action: "getAddressBook" });
    renderAddressBook(fresh || {});
  }

  async function handleAddrDelete(ev) {
    const btn = ev.target.closest("[data-addr-del]");
    if (!btn) return;
    const addr = btn.getAttribute("data-addr-del");
    if (!addr) return;
    const res = await sendMessage({ action: "removeAddress", address: addr });
    if (res && res.book) renderAddressBook({ book: res.book });
  }

  async function handleAddrExport() {
    const res = await sendMessage({ action: "getAddressBook" });
    const book = (res && res.book) || __addressBook || {};
    const json = JSON.stringify(book, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      flashExportButton(t("popup.addrbook.exported"), true);
    } catch {
      // Fallback: download as a file via a Blob URL.
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
        flashExportButton(t("popup.addrbook.exported"), true);
      } catch {
        flashExportButton(t("popup.addrbook.exportFailed"), false);
      }
    }
  }

  function flashExportButton(text, ok) {
    const btn = document.getElementById("addr-export-btn");
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = text;
    btn.classList.add(ok ? "is-ok" : "is-fail");
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove("is-ok", "is-fail");
    }, 1400);
  }

  function initAddressBook() {
    const addBtn = document.getElementById("addr-add-btn");
    if (addBtn) addBtn.addEventListener("click", handleAddrAdd);
    const list = document.getElementById("addr-list");
    if (list) list.addEventListener("click", handleAddrDelete);
    const exportBtn = document.getElementById("addr-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", handleAddrExport);
    // Enter key in label field submits.
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
    const btn = ev.target.closest(".approval-revoke");
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
      lead.classList.add("revoke-modal__lead--error");
      chainEl.textContent = "\u2014";
      toEl.textContent = "\u2014";
      valueEl.textContent = "\u2014";
      dataEl.textContent = "\u2014";
      revokeCashLink.style.display = "none";
      copyBtn.style.display = "none";
    } else {
      lead.classList.remove("revoke-modal__lead--error");
      lead.textContent = plan.description || t("popup.revoke.leadFallback");
      chainEl.textContent = (plan.chainName || "Chain " + plan.chainId) + " (" + plan.chainId + ")";
      toEl.textContent = plan.to;
      valueEl.textContent = plan.value;
      dataEl.textContent = plan.data;
      revokeCashLink.style.display = "";
      copyBtn.style.display = "";

      let walletAddress = "";
      if (approval) {
        walletAddress = approval.address || "";
      }
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
      flashCopyButton(t("popup.revoke.copied"), true);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        flashCopyButton(t("popup.revoke.copied"), true);
      } catch {
        flashCopyButton(t("popup.revoke.copyFailed"), false);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  function flashCopyButton(text, ok) {
    const btn = document.getElementById("revoke-modal-copy");
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = text;
    btn.classList.add(ok ? "is-ok" : "is-fail");
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove("is-ok", "is-fail");
    }, 1400);
  }

  // ============================================================
  // ONBOARDING TOUR
  // ============================================================
  //
  // 4-step overlay shown on first popup open. Persists completion in
  // chrome.storage.local. Replayable from settings.

  const ONBOARDING_STEPS = 4;
  const ONBOARDING_STORAGE = "wg_onboardingCompleted";

  function initOnboarding() {
    const overlay = document.getElementById("onboarding-overlay");
    if (!overlay) return;

    // Wire buttons (always, so "Replay tour" from settings can re-trigger).
    const skipBtn = document.getElementById("onboarding-skip");
    const nextBtn = document.getElementById("onboarding-next");
    if (skipBtn) skipBtn.addEventListener("click", completeOnboarding);
    if (nextBtn) nextBtn.addEventListener("click", advanceOnboarding);
    document.addEventListener("keydown", (ev) => {
      if (overlay.hidden) return;
      if (ev.key === "Escape") completeOnboarding();
      else if (ev.key === "Enter" || ev.key === "ArrowRight") advanceOnboarding();
    });

    // Show only on first run.
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
      d.className = "onboarding__dot" + (i === idx ? " onboarding__dot--active" : "");
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

  // Public hook for "Replay tour" button in settings page.
  window.__wgReplayOnboarding = function () {
    try { setStorage(ONBOARDING_STORAGE, false); } catch { /* ignore */ }
    showOnboardingStep(0);
  };

  // chrome.storage.local helpers (graceful fallback for tests / non-extension).
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
