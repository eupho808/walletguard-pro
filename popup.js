// popup.js - WalletGuard Pro Dashboard
// Pulls real statistics from background service worker.

document.addEventListener("DOMContentLoaded", async () => {
  await refreshData();
  attachListeners();
});

function attachListeners() {
  document.getElementById("reset-btn").addEventListener("click", async () => {
    if (!confirm("Reset all WalletGuard statistics?")) return;
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
    badge.textContent = "ACTIVE";
  } else {
    dot.classList.add("disabled");
    badge.classList.add("disabled");
    badge.textContent = "PAUSED";
  }

  // ---- Wallet Safety Score ----
  // Heuristic: 100 minus penalties from real-world events.
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
  // Base 100, deduct for risky activity.
  let score = 100;
  const permits = stats.permitsDetected || 0;
  const blocked = stats.blockedTransactions || 0;
  const warnings = stats.warningsShown || 0;
  const phishing = stats.phishingBlocked || 0;

  // Phishing encounters lower score
  score -= Math.min(phishing * 5, 30);
  // Permits signed lower score (user signed them though, so lighter penalty)
  score -= Math.min(permits * 2, 20);
  // Warnings indicate risky dApps encountered
  score -= Math.min(warnings, 15);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function renderLogs(logs) {
  const list = document.getElementById("logs-list");
  if (!logs || logs.length === 0) {
    list.innerHTML = '<div class="log-empty">No activity yet. Browse a dApp to see logs.</div>';
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
  btn.textContent = "Scanning";

  try {
    const res = await sendMessage({ action: "rescanApprovals" });
    if (res && res.error) {
      alert("Scan failed: " + res.error);
      return;
    }
    if (res && res.scan) {
      renderApprovals({ scan: res.scan, wallet: res.scan.address });
    }
  } catch (e) {
    alert("Scan failed: " + (e.message || e));
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
  walletEl.textContent = wallet
    ? shorten(wallet)
    : "no wallet yet";

  // Timestamp + chain scope line.
  const timeEl = document.getElementById("approval-time");
  if (scan && scan.scannedAt) {
    let chainLabel = "";
    if (scan.multiChain) {
      const s = scan.summary || {};
      const scanned = s.chainsScanned || 0;
      const failed = s.chainsFailed || 0;
      const total = scanned + failed;
      chainLabel = total > 0
        ? ` (${scanned}/${total} chains)`
        : "";
    } else if (scan.chainName) {
      chainLabel = ` (${scan.chainName})`;
    }
    timeEl.textContent = "scanned " + relativeTime(scan.scannedAt) + chainLabel;
  } else {
    timeEl.textContent = "never scanned";
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
      empty.textContent = `No active approvals found, but ${failed} chain(s) failed to respond. Try again later.`;
    } else {
      empty.textContent = wallet
        ? "No active approvals found. Wallet looks clean!"
        : "No wallet detected yet. Make any transaction through WalletGuard and your active approvals will be scanned on the current chain.";
    }
    empty.style.display = "";
    Array.from(list.querySelectorAll(".approval-card")).forEach((el) => el.remove());
  } else {
    empty.style.display = "none";

    // Sort and pick top 5 by risk severity.
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const top = allApprovals.slice().sort((a, b) => {
      const ra = order[a.risk.level] ?? 9;
      const rb = order[b.risk.level] ?? 9;
      if (ra !== rb) return ra - rb;
      return (b.isUnlimited ? 1 : 0) - (a.isUnlimited ? 1 : 0);
    }).slice(0, 5);

    // Attach a stable card ID so the Revoke button can look up the original
    // approval object (with full chain info) when clicked.
    top.forEach((a, i) => { a._cardId = "erc20-" + i; });

    list.innerHTML = top.map(renderApprovalCard).join("");
    attachRevokeDelegation(list, top, "erc20");
  }

  // NFT approvals (separate section).
  renderNFTApprovals(scan);
}

// Flatten a scan result (single or multi-chain) into a single array
// of approval objects. Each approval already has chainId/chainName
// attached, so the renderer can show a badge.
function flattenApprovals(scan) {
  if (!scan) return [];
  if (scan.multiChain && Array.isArray(scan.chains)) {
    const out = [];
    for (const c of scan.chains) {
      if (c.error || !Array.isArray(c.approvals)) continue;
      for (const a of c.approvals) {
        // Defensive: if a chain result forgot to attach chainName, use the wrapper.
        if (!a.chainName && c.chainName) a.chainName = c.chainName;
        if (!a.chainId && c.chainId) a.chainId = c.chainId;
        out.push(a);
      }
    }
    return out;
  }
  return Array.isArray(scan.approvals) ? scan.approvals : [];
}

// Flatten NFT approvals across all chains. Returns an array of
// NFT approval objects with attached chainName / chainId (defensive).
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
    ? "Unlimited"
    : `${a.allowanceFmt} ${a.tokenSymbol}`;

  const reason = (a.risk.reasons && a.risk.reasons[0]) || "";
  const spenderLabel = a.spenderName
    ? a.spenderName
    : a.spender.slice(0, 6) + "..." + a.spender.slice(-4);

  // Only show Revoke button for actually-risky approvals: critical / high / medium.
  // Low/info (e.g. whitelisted, verified protocol) are noise if we offer to revoke.
  const canRevoke = level === "critical" || level === "high" || level === "medium";
  const revokeBtn = canRevoke
    ? `<button class="approval-revoke" data-revoke-id="${escapeHtml(a._cardId || "")}" title="Generate revoke calldata">Revoke</button>`
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

  // Summary tiles.
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

    // Meta line: show chain scope when multi-chain.
    if (scan.multiChain && s.byChain && Object.keys(s.byChain).length > 0) {
      const parts = Object.entries(s.byChain)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} (${count})`);
      metaEl.textContent = parts.join(" · ");
    } else if (scan.chainName) {
      metaEl.textContent = scan.chainName;
    } else {
      metaEl.textContent = "";
    }
  }

  // List.
  if (allNFTs.length === 0) {
    if (scan) {
      empty.textContent = "No active NFT collection approvals. Your NFTs are safe from custody-takeover.";
    } else {
      empty.textContent = "NFT approvals will appear here after your first scan.";
    }
    empty.style.display = "";
    Array.from(list.querySelectorAll(".nft-card")).forEach((el) => el.remove());
    return;
  }
  empty.style.display = "none";

  // Sort by risk severity (critical first), pick top 5.
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const top = allNFTs.slice().sort((a, b) => {
    const ra = order[(a.risk || {}).level] ?? 9;
    const rb = order[(b.risk || {}).level] ?? 9;
    return ra - rb;
  }).slice(0, 5);

  // Attach stable card IDs so Revoke buttons can look up the source approval.
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

  // Same risk-gating as ERC-20: only offer Revoke for critical/high/medium.
  const canRevoke = level === "critical" || level === "high" || level === "medium";
  const revokeBtn = canRevoke
    ? `<button class="approval-revoke" data-revoke-id="${escapeHtml(a._cardId || "")}" title="Generate revoke calldata">Revoke</button>`
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
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
  } catch {
    return "unknown";
  }
}

function shorten(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// ============================================================
// REVOKE FLOW
// ============================================================
//
// WalletGuard Pro never signs — we generate calldata and let the user
// broadcast via their wallet or revoke.cash. `popup-bundle.js` exposes
// `window.WG_POPUP_LIB.revokeGenerator.buildRevokeTx(approval)` which
// returns the plan shown in the modal.

let __revokeMap = new Map();      // cardId -> { approval, kind }
let __activeRevokePlan = null;     // last-generated plan (for copy)

function attachRevokeDelegation(container, items, kind) {
  // Stash a lookup so the click handler can resolve data-revoke-id back to
  // the original approval object (we don't re-query storage on click).
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

  // Resolve the revoke plan via the bundled lib module.
  const lib = (typeof window !== "undefined" && window.WG_POPUP_LIB && window.WG_POPUP_LIB.revokeGenerator) || null;
  if (!lib || typeof lib.buildRevokeTx !== "function") {
    showRevokeModal({
      error: "Revoke generator not loaded. Reload the popup or update WalletGuard Pro."
    });
    return;
  }

  let plan;
  try {
    plan = lib.buildRevokeTx(entry.approval);
  } catch (e) {
    showRevokeModal({
      error: "Could not generate revoke calldata: " + (e.message || e)
    });
    return;
  }
  if (!plan) {
    showRevokeModal({
      error: "Unknown approval kind — cannot generate a revoke plan."
    });
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
    chainEl.textContent = "—";
    toEl.textContent = "—";
    valueEl.textContent = "—";
    dataEl.textContent = "—";
    revokeCashLink.style.display = "none";
    copyBtn.style.display = "none";
  } else {
    lead.classList.remove("revoke-modal__lead--error");
    lead.textContent = plan.description || "Revoke approval";
    chainEl.textContent = (plan.chainName || "Chain " + plan.chainId) + " (" + plan.chainId + ")";
    toEl.textContent = plan.to;
    valueEl.textContent = plan.value;
    dataEl.textContent = plan.data;
    revokeCashLink.style.display = "";
    copyBtn.style.display = "";

    // Deep link to revoke.cash for the affected address — but only when we
    // know the wallet address (it's in the approval object as `address` for
    // single-chain, or we can pull it from the global scan context for
    // multi-chain). If unknown, fall back to revoke.cash root.
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
  // Copy a structured JSON envelope so the receiver can reconstruct the tx.
  const payload = JSON.stringify({
    chainId: p.chainId,
    to: p.to,
    data: p.data,
    value: p.value
  }, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    flashCopyButton("Copied!", true);
  } catch (e) {
    // Fallback: select-and-copy via a temporary textarea.
    const ta = document.createElement("textarea");
    ta.value = payload;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      flashCopyButton("Copied!", true);
    } catch {
      flashCopyButton("Copy failed", false);
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
