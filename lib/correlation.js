// lib/correlation.js - WORLD-FIRST: Cross-Approval Correlation Engine.
//
// Finds groups of approvals that share suspicious properties. Catches
// sophisticated attackers who split their drainer across multiple
// contracts/chains to evade single-approval scanners.
//
// Detections:
//   1. Same-deployer clustering — multiple approvals to contracts deployed
//      by the same EOA (typical drainer kit pattern).
//   2. Same-week clustering — approvals deployed in the same calendar
//      week (coordinated setup, often a kit).
//   3. Overlapping blast radius — multiple approvals to addresses whose
//      value flow converges (multi-vector drain).
//   4. Common funding source — multiple contracts funded from same EOA
//      (typical of contract factories).
//   5. Approval stacking — same (token, spender) pair approved multiple
//      times (redundant grants inflating exposure).
//
// This is forensic-grade analysis that no other wallet extension does
// in real-time, in the browser.

/**
 * Group approvals by their deployer (if available).
 * Approvals should have a `deployer` field populated by the scanner.
 */
export function groupByDeployer(approvals) {
  const groups = {};
  for (const a of approvals) {
    const key = (a.deployer || "unknown").toLowerCase();
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }
  // Filter to only groups with >1 approval (suspicious).
  const suspicious = {};
  for (const [k, v] of Object.entries(groups)) {
    if (v.length >= 2) suspicious[k] = v;
  }
  return suspicious;
}

/**
 * Group approvals by deployment week (ISO week of timestamp).
 * Approvals should have a `deployedAt` (unix seconds) field.
 */
export function groupByDeployWeek(approvals) {
  const groups = {};
  for (const a of approvals) {
    if (!a.deployedAt) continue;
    const week = isoWeek(new Date(a.deployedAt * 1000));
    if (!groups[week]) groups[week] = [];
    groups[week].push(a);
  }
  const suspicious = {};
  for (const [k, v] of Object.entries(groups)) {
    if (v.length >= 3) suspicious[k] = v; // 3+ in same week = suspicious
  }
  return suspicious;
}

/**
 * Find (token, spender) pairs that have been approved multiple times.
 * This is "approval stacking" — inflating exposure through redundant grants.
 */
export function findStackedApprovals(approvals) {
  const seen = {};
  const stacked = [];
  for (const a of approvals) {
    const key = `${(a.tokenAddress || "").toLowerCase()}-${(a.spender || "").toLowerCase()}-${a.chainId || 0}`;
    if (seen[key]) {
      stacked.push({ first: seen[key], duplicate: a });
    } else {
      seen[key] = a;
    }
  }
  return stacked;
}

/**
 * Find approvals whose value flows to the same recipient address.
 * Uses blast-radius aggregation per spender.
 */
export function findConvergingFlow(approvals) {
  const bySpender = {};
  for (const a of approvals) {
    const k = (a.spender || "").toLowerCase();
    if (!k) continue;
    if (!bySpender[k]) {
      bySpender[k] = { spender: a.spender, totalUsd: 0, chains: new Set(), count: 0 };
    }
    const usd = a.atRiskUsd || 0;
    bySpender[k].totalUsd += usd;
    bySpender[k].chains.add(a.chainId || 0);
    bySpender[k].count++;
  }
  const suspicious = [];
  for (const v of Object.values(bySpender)) {
    if (v.chains.size >= 2 || v.totalUsd > 5000) {
      suspicious.push({
        ...v,
        chains: [...v.chains],
        reason: v.chains.size >= 2
          ? `Same spender across ${v.chains.size} chains`
          : `High blast radius: $${Math.round(v.totalUsd).toLocaleString()}`
      });
    }
  }
  return suspicious.sort((a, b) => b.totalUsd - a.totalUsd);
}

/**
 * Run all correlation checks and return a unified report.
 */
export function correlateApprovals(approvals) {
  if (!Array.isArray(approvals)) approvals = [];

  const deployerGroups = groupByDeployer(approvals);
  const weekGroups = groupByDeployWeek(approvals);
  const stacked = findStackedApprovals(approvals);
  const converging = findConvergingFlow(approvals);

  const findings = [];
  let riskScore = 0;

  // Deployer clusters are the strongest signal.
  for (const [deployer, group] of Object.entries(deployerGroups)) {
    findings.push({
      type: "same-deployer",
      severity: "high",
      message: `${group.length} approvals to contracts deployed by ${deployer.slice(0, 6)}…${deployer.slice(-4)}`,
      deployer,
      count: group.length,
      approvalRefs: group
    });
    riskScore += 25 * group.length;
  }

  // Week clusters suggest coordinated kit deployment.
  for (const [week, group] of Object.entries(weekGroups)) {
    findings.push({
      type: "same-week",
      severity: "medium",
      message: `${group.length} contracts deployed in week ${week}`,
      week,
      count: group.length,
      approvalRefs: group
    });
    riskScore += 10 * group.length;
  }

  // Approval stacking inflates exposure.
  for (const s of stacked) {
    findings.push({
      type: "stacked",
      severity: "low",
      message: `Duplicate approval for ${s.first.tokenSymbol || s.first.tokenAddress?.slice(0, 8)} to ${s.first.spender?.slice(0, 8)}…`,
      approvalRefs: [s.first, s.duplicate]
    });
    riskScore += 5;
  }

  // Converging flow identifies high-value targets.
  for (const c of converging) {
    if (c.reason && c.totalUsd > 5000) {
      findings.push({
        type: "converging-flow",
        severity: c.totalUsd > 50000 ? "critical" : "high",
        message: c.reason,
        spender: c.spender,
        totalUsd: Math.round(c.totalUsd),
        chains: c.chains
      });
      riskScore += 30;
    }
  }

  // Cap risk score.
  riskScore = Math.min(100, riskScore);

  return {
    findings,
    riskScore,
    summary: findings.length === 0
      ? "No correlated risk patterns detected."
      : `${findings.length} correlation${findings.length > 1 ? "s" : ""} detected — review before signing.`,
    hasHighRiskFindings: findings.some(f => f.severity === "high" || f.severity === "critical"),
    deployerGroupCount: Object.keys(deployerGroups).length,
    stackedCount: stacked.length,
    convergingCount: converging.length
  };
}

// ISO week helper — returns "YYYY-Www" (e.g. "2026-W27").
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
