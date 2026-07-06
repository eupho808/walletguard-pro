// lib/stale-tracker.js - Approval age tracking + stale detection + spend profiling.
//
// Tracks when each token approval was granted, identifies stale approvals
// (>180 days unused), and profiles actual on-chain usage to surface
// "approved but never used" grants.
//
// Features:
//   • Age tracking from Approval event block timestamps
//   • Stale detection (180d default, configurable)
//   • Spend profiling: how many times has each spender actually used the allowance?
//   • "Approved but never used" detection — safest auto-revoke candidates
//   • Bulk revoke plan generation
//
// World-first:
//   No extension does "you approved Uniswap 3 times, used 2 — revoke 1 unused".

const STALE_THRESHOLD_DAYS = 180;
const DEEPLY_STALE_DAYS = 365;

// Stale severity levels.
export const STALE_LEVELS = {
  fresh: 0,        // < 30 days
  recent: 1,       // 30-90 days
  aging: 2,        // 90-180 days
  stale: 3,        // 180-365 days
  ancient: 4       // > 365 days
};

/**
 * Compute age in days from a unix timestamp.
 */
export function ageInDays(grantedAt) {
  if (!grantedAt || typeof grantedAt !== "number") return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - grantedAt;
  return Math.floor(ageSec / 86400);
}

/**
 * Classify approval age into a stale level.
 */
export function staleLevel(grantedAt, options = {}) {
  const staleThreshold = options.staleThresholdDays || STALE_THRESHOLD_DAYS;
  const deeplyStale = options.deeplyStaleDays || DEEPLY_STALE_DAYS;
  const days = ageInDays(grantedAt);
  if (days === null) return STALE_LEVELS.fresh;
  if (days < 30) return STALE_LEVELS.fresh;
  if (days < 90) return STALE_LEVELS.recent;
  if (days < staleThreshold) return STALE_LEVELS.aging;
  if (days < deeplyStale) return STALE_LEVELS.stale;
  return STALE_LEVELS.ancient;
}

/**
 * Human-readable age description.
 */
export function ageDescription(days) {
  if (days === null || days === undefined) return "unknown age";
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "1 month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  if (days < 730) return "1 year ago";
  return `${Math.floor(days / 365)} years ago`;
}

/**
 * Annotate an approval with age + stale info.
 *
 * @param {Object} approval — { tokenAddress, spender, grantedAt, ... }
 * @returns {Object} — approval with { ageDays, staleLevel, staleLabel, ... }
 */
export function annotateStale(approval, options = {}) {
  if (!approval) return null;
  const days = ageInDays(approval.grantedAt);
  const level = staleLevel(approval.grantedAt, options);
  const labels = ["fresh", "recent", "aging", "stale", "ancient"];
  return {
    ...approval,
    ageDays: days,
    staleLevel: level,
    staleLabel: labels[level] || "fresh",
    ageDescription: ageDescription(days),
    isStale: level >= STALE_LEVELS.stale,
    isAutoRevokeCandidate: isAutoRevokeCandidate(approval, options)
  };
}

/**
 * Determine if an approval is a strong auto-revoke candidate.
 * Criteria:
 *   1. Age > 180 days (stale)
 *   2. AND (spend count = 0 OR unlimited)
 *   3. AND not in whitelist
 */
export function isAutoRevokeCandidate(approval, options = {}) {
  if (!approval) return false;
  if (approval.whitelisted) return false;

  // Must be stale.
  const days = ageInDays(approval.grantedAt);
  const threshold = options.staleThresholdDays || STALE_THRESHOLD_DAYS;
  if (days === null || days < threshold) return false;

  // Must be unused or unlimited.
  const spendCount = approval.spendCount || 0;
  const isUnlimited = approval.unlimited === true
    || (typeof approval.allowance === "string" && /^f+$/i.test(approval.allowance))
    || (typeof approval.allowance === "bigint" && approval.allowance >= ((1n << 256n) - 1n));

  return spendCount === 0 || isUnlimited;
}

/**
 * Bulk-annotate a list of approvals.
 */
export function annotateStaleAll(approvals, options = {}) {
  if (!Array.isArray(approvals)) return [];
  return approvals.map((a) => annotateStale(a, options));
}

/**
 * Generate a summary report of stale approvals.
 */
export function staleSummary(annotatedApprovals) {
  if (!Array.isArray(annotatedApprovals)) return null;
  const counts = { fresh: 0, recent: 0, aging: 0, stale: 0, ancient: 0 };
  let totalStaleUsd = 0;
  let totalAutoRevokeUsd = 0;
  let autoRevokeCount = 0;

  for (const a of annotatedApprovals) {
    const label = a.staleLabel || "fresh";
    counts[label] = (counts[label] || 0) + 1;
    if (a.isStale) {
      totalStaleUsd += a.atRiskUsd || 0;
    }
    if (a.isAutoRevokeCandidate) {
      totalAutoRevokeUsd += a.atRiskUsd || 0;
      autoRevokeCount++;
    }
  }

  return {
    counts,
    total: annotatedApprovals.length,
    staleCount: counts.stale + counts.ancient,
    autoRevokeCount,
    totalStaleUsd: Math.round(totalStaleUsd * 100) / 100,
    totalAutoRevokeUsd: Math.round(totalAutoRevokeUsd * 100) / 100,
    message: buildSummaryMessage(counts, totalStaleUsd, autoRevokeCount)
  };
}

function buildSummaryMessage(counts, totalStaleUsd, autoRevokeCount) {
  const staleTotal = counts.stale + counts.ancient;
  if (staleTotal === 0) return "All approvals fresh.";
  const usd = Math.round(totalStaleUsd).toLocaleString();
  if (autoRevokeCount > 0) {
    return `${staleTotal} stale ($${usd}), ${autoRevokeCount} safe to auto-revoke.`;
  }
  return `${staleTotal} stale approvals ($${usd}).`;
}

/**
 * Profile actual usage of an approval.
 * Counts how many times the spender has called transferFrom/transfer on this token
 * from the user's address since the grant.
 *
 * @param {Object} usageData — { transferFromCount, transferCount, lastUsedAt }
 * @returns {Object} — usage profile { totalSpends, lastUsedDaysAgo, isUnused }
 */
export function profileUsage(usageData) {
  if (!usageData) return { totalSpends: 0, lastUsedDaysAgo: null, isUnused: true };
  const totalSpends = (usageData.transferFromCount || 0) + (usageData.transferCount || 0);
  const lastUsedDaysAgo = usageData.lastUsedAt ? ageInDays(usageData.lastUsedAt) : null;
  return {
    totalSpends,
    lastUsedDaysAgo,
    isUnused: totalSpends === 0,
    lastUsedDescription: lastUsedDaysAgo === null ? "never used" : ageDescription(lastUsedDaysAgo)
  };
}

/**
 * Generate a spend profile report for all approvals.
 *
 * For each approval, compute:
 *   - spendCount: how many times the spender used it
 *   - lastUsedAt: timestamp of last use
 *   - isUnused: spendCount === 0
 *   - wasteScore: 0-100, how wasteful is keeping this approval
 *
 * wasteScore formula:
 *   - Base: 50 if unused, scaled by age
 *   - +20 if unlimited and unused (high risk)
 *   - +20 if > 365 days old
 *   - -30 if used recently (last 30 days)
 */
export function generateSpendProfile(approval, usageData) {
  if (!approval) return null;
  const usage = profileUsage(usageData);
  const days = ageInDays(approval.grantedAt) || 0;

  let waste = usage.isUnused ? 50 : 0;
  if (usage.isUnused && approval.unlimited) waste += 20;
  if (days > 365) waste += 20;
  if (usage.lastUsedDaysAgo !== null && usage.lastUsedDaysAgo < 30) waste -= 30;

  waste = Math.max(0, Math.min(100, waste));

  let recommendation = "keep";
  if (waste >= 80) recommendation = "revoke-immediately";
  else if (waste >= 50) recommendation = "revoke-recommended";
  else if (waste >= 25) recommendation = "consider-revoke";
  else if (usage.totalSpends > 0) recommendation = "active";

  return {
    approval,
    usage,
    wasteScore: waste,
    recommendation
  };
}
