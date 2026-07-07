// lib/portfolio-view.js - Aggregate approval data into a portfolio summary.
//
// Computes:
//   - Total USD value at risk (using blast-radius data if available, else naive count)
//   - Top-3 risks by severity
//   - Per-chain breakdown
//   - Stale approval count + total at-risk USD
//
// Used by the popup to show "Portfolio" summary. World-first feature —
// no other wallet extension shows real-time USD blast-radius at this level.

import { STALE_LEVELS } from "./stale-tracker.js";

// Static fallback prices for common tokens (USD). Used when blast-radius
// isn't available or hasn't computed a price yet.
const STATIC_PRICES = {
  USDC: 1, USDT: 1, DAI: 1, FRAX: 1, BUSD: 1, TUSD: 1,
  WETH: 3000, ETH: 3000, WBTC: 60000, BTC: 60000,
  LINK: 15, UNI: 8, AAVE: 100, MKR: 1500, CRV: 0.5,
  MATIC: 0.8, ARB: 1.2, OP: 2.5
};

/**
 * Estimate USD value of a single approval.
 * Uses blast-radius data if available; falls back to static price × format.
 *
 * @param {Object} approval - { tokenSymbol, allowanceFmt, isUnlimited, blastRadius? }
 * @returns {number|null} USD value, or null if unknown
 */
export function estimateApprovalUsd(approval) {
  if (!approval) return null;

  // Prefer blast-radius data if available (already includes price + balance).
  if (approval.blastRadius && typeof approval.blastRadius.usdValue === "number") {
    return approval.blastRadius.usdValue;
  }

  // Fallback: static price × parsed allowance.
  const symbol = (approval.tokenSymbol || "").toUpperCase();
  const price = STATIC_PRICES[symbol];
  if (!price) return null;

  // Parse allowanceFmt like "1000.5 USDC" or "Unlimited" or "0".
  const fmt = String(approval.allowanceFmt || "");
  if (/unlimited/i.test(fmt)) return null; // can't estimate without balance
  const match = fmt.match(/^([\d.]+)/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (isNaN(amount)) return null;
  return amount * price;
}

/**
 * Compute at-risk severity bucket for a USD value.
 */
function severityFromUsd(usd) {
  if (usd === null || usd === undefined) return "unknown";
  if (usd === 0) return "none";
  if (usd < 100) return "low";
  if (usd < 1000) return "medium";
  if (usd < 10000) return "high";
  return "critical";
}

/**
 * Compute the portfolio summary from approval scan data.
 *
 * @param {Object} scanData - The scan object from wg_approvalScan storage.
 *                            Shape: { summary, approvals, nftApprovals, chains?, byChain }
 * @param {Object} [options] - { blastRadiusReport?, staleApprovals? }
 * @returns {Object} Portfolio summary
 */
export function computePortfolio(scanData, options = {}) {
  if (!scanData) return null;

  // Flatten all approvals across chains. Multi-chain scans nest by `chains`;
  // single-chain scans put them directly under `approvals`.
  let allApprovals = [];
  if (Array.isArray(scanData.chains)) {
    for (const chain of scanData.chains) {
      if (Array.isArray(chain.approvals)) {
        for (const a of chain.approvals) allApprovals.push(a);
      }
    }
  }
  if (Array.isArray(scanData.approvals)) {
    allApprovals = allApprovals.concat(scanData.approvals);
  }
  if (Array.isArray(scanData.nftApprovals)) {
    allApprovals = allApprovals.concat(scanData.nftApprovals);
  }

  // Enrich with blast-radius data if provided.
  const blastByKey = new Map();
  if (options.blastRadiusReport && Array.isArray(options.blastRadiusReport.perApproval)) {
    for (const r of options.blastRadiusReport.perApproval) {
      const key = (r.tokenAddress || "").toLowerCase() + "|" + (r.spender || "").toLowerCase() + "|" + (r.chainId || 0);
      blastByKey.set(key, r);
    }
  }
  // Enrich with stale tracker data if provided.
  const staleByKey = new Map();
  if (Array.isArray(options.staleApprovals)) {
    for (const s of options.staleApprovals) {
      const key = (s.tokenAddress || s.token || "").toLowerCase() + "|" + (s.spender || "").toLowerCase() + "|" + (s.chainId || 0);
      staleByKey.set(key, s);
    }
  }

  let totalAtRiskUsd = 0;
  let riskyCount = 0;
  let unlimitedCount = 0;
  let staleCount = 0;
  const chainBreakdown = {};
  const top = [];

  for (const a of allApprovals) {
    const token = (a.token || a.tokenAddress || a.collection || "").toLowerCase();
    const spender = (a.spender || a.operator || "").toLowerCase();
    const chainId = a.chainId || 0;
    const key = token + "|" + spender + "|" + chainId;

    // Attach blast-radius if available.
    const blast = blastByKey.get(key);
    if (blast) a.blastRadius = blast;

    // Attach stale info if available.
    const stale = staleByKey.get(key);
    if (stale) {
      a.staleLevel = stale.staleLevel;
      a.staleLabel = stale.staleLabel;
      a.isStale = stale.isStale;
      a.ageDays = stale.ageDays;
    }

    const usd = estimateApprovalUsd(a);
    const severity = severityFromUsd(usd);

    if (usd !== null && usd > 0) totalAtRiskUsd += usd;
    if (severity === "high" || severity === "critical") riskyCount++;
    if (a.isUnlimited) unlimitedCount++;
    if (a.isStale || (a.staleLevel !== undefined && a.staleLevel >= STALE_LEVELS.stale)) staleCount++;

    // Per-chain aggregation.
    if (!chainBreakdown[chainId]) {
      chainBreakdown[chainId] = {
        chainId,
        chainName: a.chainName || ("Chain " + chainId),
        count: 0,
        atRiskUsd: 0,
        riskyCount: 0
      };
    }
    chainBreakdown[chainId].count++;
    if (usd !== null && usd > 0) chainBreakdown[chainId].atRiskUsd += usd;
    if (severity === "high" || severity === "critical") chainBreakdown[chainId].riskyCount++;

    // Track for top-3 ranking.
    top.push({
      tokenSymbol: a.tokenSymbol || a.tokenName || "Unknown",
      tokenAddress: token,
      spender: spender,
      spenderName: a.spenderName || a.operatorName || null,
      chainId,
      chainName: a.chainName || ("Chain " + chainId),
      usd,
      severity,
      isUnlimited: !!a.isUnlimited,
      isStale: !!a.isStale,
      ageDays: a.ageDays || null
    });
  }

  // Sort top by USD descending; nulls at end.
  top.sort((a, b) => {
    const ua = a.usd === null ? -1 : a.usd;
    const ub = b.usd === null ? -1 : b.usd;
    return ub - ua;
  });

  const totalApprovals = allApprovals.length;
  const summary = scanData.summary || {};

  return {
    totalApprovals,
    totalAtRiskUsd: Math.round(totalAtRiskUsd * 100) / 100,
    riskyCount,
    unlimitedCount,
    staleCount,
    chainsScanned: summary.chainsScanned || 1,
    chainsFailed: summary.chainsFailed || 0,
    chains: Object.values(chainBreakdown),
    topRisks: top.slice(0, 5),
    severityCounts: {
      critical: top.filter((r) => r.severity === "critical").length,
      high: top.filter((r) => r.severity === "high").length,
      medium: top.filter((r) => r.severity === "medium").length,
      low: top.filter((r) => r.severity === "low").length,
      unknown: top.filter((r) => r.severity === "unknown").length
    },
    message: buildPortfolioMessage({
      totalAtRiskUsd,
      riskyCount,
      totalApprovals,
      unlimitedCount,
      staleCount
    })
  };
}

function buildPortfolioMessage({ totalAtRiskUsd, riskyCount, totalApprovals, unlimitedCount, staleCount }) {
  if (totalApprovals === 0) return "No active approvals.";
  if (riskyCount === 0 && staleCount === 0) {
    return `${totalApprovals} active approval${totalApprovals > 1 ? "s" : ""}. All safe.`;
  }
  const parts = [];
  parts.push(`${totalApprovals} active approval${totalApprovals > 1 ? "s" : ""}.`);
  if (totalAtRiskUsd > 0) parts.push(`$${totalAtRiskUsd.toLocaleString()} at risk.`);
  if (riskyCount > 0) parts.push(`${riskyCount} risky.`);
  if (unlimitedCount > 0) parts.push(`${unlimitedCount} unlimited.`);
  if (staleCount > 0) parts.push(`${staleCount} stale.`);
  return parts.join(" ");
}

/**
 * Format a USD value for display.
 */
export function formatUsd(usd) {
  if (usd === null || usd === undefined) return "—";
  if (usd === 0) return "$0";
  if (usd < 1) return "<$1";
  if (usd < 1000) return `$${Math.round(usd)}`;
  if (usd < 1000000) return `$${(usd / 1000).toFixed(1)}k`;
  return `$${(usd / 1000000).toFixed(2)}M`;
}
