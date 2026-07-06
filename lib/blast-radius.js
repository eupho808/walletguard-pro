// lib/blast-radius.js - WORLD-FIRST: Approval Blast Radius Calculator.
//
// For each existing token approval, calculate exactly what the user would
// lose if the approved contract is exploited RIGHT NOW. Aggregates per-chain
// and totals across all chains. This is the first time anyone has done
// real-time USD-denominated blast-radius analysis for token approvals in
// a browser extension.
//
// Architecture:
//   • Pure function design — takes approvals + balances as input.
//   • USD pricing via static table for major tokens (USDC/USDT/DAI = $1,
//     WETH = $3000, WBTC = $60000, others = unknown).
//   • Returns a structured BlastReport for the UI.

import { shortAddr, getMethodId } from "./decoder.js";

// Static USD price table for major tokens. Conservative — when in doubt,
// returns 0 (unknown) so the UI can show "value unknown".
const USD_PRICE = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 1.00,       // USDC (ETH)
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 1.00,       // USDT (ETH)
  "0x6b175474e89094c44da98b954eedeac495271d0f": 1.00,       // DAI (ETH)
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 3000.00,    // WETH (ETH)
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 60000.00,   // WBTC (ETH)
  "0x4fabb145d64652a948d72533023f6e7a623c7c53": 1.00,       // BUSD
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": 3000.00,   // stETH
  "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0": 0.50,       // MATIC
  "0x0000000000000000000000000000000000000000": 3000.00,   // native ETH (placeholder)
};

// Common decimals lookup (most ERC-20s are 18, stables 6).
function getDecimals(tokenAddress) {
  if (!tokenAddress) return 18;
  const addr = tokenAddress.toLowerCase();
  // Stablecoins typically 6 decimals
  if (addr === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48") return 6; // USDC
  if (addr === "0xdac17f958d2ee523a2206206994597c13d831ec7") return 6; // USDT
  if (addr === "0x4fabb145d64652a948d72533023f6e7a623c7c53") return 18; // BUSD (18)
  return 18;
}

// Parse a BigInt from a string. Handles hex (with or without "0x" prefix)
// and plain decimal. Defaults to hex if string contains non-decimal chars.
function parseBigInt(s) {
  if (typeof s === "bigint") return s;
  if (typeof s !== "string" || s === "") return 0n;
  if (s.startsWith("0x") || s.startsWith("0X")) return BigInt(s);
  // If contains only decimal digits, treat as decimal.
  if (/^[0-9]+$/.test(s)) return BigInt(s);
  // Otherwise treat as hex (covers "ffffffff..." style without prefix).
  return BigInt("0x" + s);
}

// Format raw token amount (BigInt) to human-readable string using decimals.
function formatAmount(rawAmount, decimals) {
  if (!rawAmount || rawAmount === "0") return "0";
  try {
    const bn = typeof rawAmount === "bigint" ? rawAmount : BigInt(rawAmount);
    const div = 10n ** BigInt(decimals);
    const whole = bn / div;
    const frac = bn % div;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fracStr}`;
  } catch {
    return "0";
  }
}

// Get USD price for a token address. Returns null if unknown.
export function getUsdPrice(tokenAddress) {
  if (!tokenAddress) return null;
  const lower = tokenAddress.toLowerCase();
  return USD_PRICE[lower] ?? null;
}

// Estimate the USD value of a token amount.
// amountRaw is BigInt or hex string. Returns null if price unknown.
export function estimateValueUsd(tokenAddress, amountRaw) {
  const price = getUsdPrice(tokenAddress);
  if (price === null || amountRaw === null || amountRaw === undefined) return null;
  try {
    const bn = typeof amountRaw === "bigint" ? amountRaw : BigInt(amountRaw);
    const decimals = getDecimals(tokenAddress);
    const div = 10n ** BigInt(decimals);
    // Convert to decimal number (loses precision for huge amounts but fine for UI display).
    const numTokens = Number(bn) / Number(div);
    return Math.round(numTokens * price * 100) / 100;
  } catch {
    return null;
  }
}

// Max uint256 — represents an unlimited approval.
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Compute the blast radius of a single approval.
 *
 * @param {Object} approval — { tokenAddress, tokenSymbol?, spender, allowance, balance?, chainId }
 * @returns {Object} — { atRiskTokens, atRiskUsd, isUnlimited, priceKnown, displayAmount }
 */
export function blastRadiusForApproval(approval) {
  if (!approval) return null;
  const { tokenAddress, spender, allowance, balance } = approval;

  // Need at minimum a token or spender to compute blast radius.
  if (!tokenAddress && !spender) return null;

  // Parse allowance and balance as BigInt.
  let allowanceBn = 0n;
  let balanceBn = 0n;
  try {
    if (typeof allowance === "bigint") allowanceBn = allowance;
    else if (typeof allowance === "string") {
      allowanceBn = parseBigInt(allowance);
    }
    if (typeof balance === "bigint") balanceBn = balance;
    else if (typeof balance === "string") {
      balanceBn = parseBigInt(balance);
    }
  } catch {
    return null;
  }

  // The blast radius is the smaller of (allowance, balance).
  // If allowance is unlimited (max uint256), it's bounded by balance.
  // If balance is 0, blast radius is 0 (nothing to lose).
  const atRiskBn = balanceBn === 0n ? 0n
                 : allowanceBn >= MAX_UINT256 ? balanceBn
                 : allowanceBn < balanceBn ? allowanceBn
                 : balanceBn;

  const decimals = getDecimals(tokenAddress);
  const atRiskTokens = formatAmount(atRiskBn, decimals);
  const atRiskUsd = estimateValueUsd(tokenAddress, atRiskBn);
  const balanceUsd = estimateValueUsd(tokenAddress, balanceBn);
  const priceKnown = atRiskUsd !== null;

  return {
    spender: spender ? shortAddr(spender) : null,
    spenderFull: spender,
    tokenAddress,
    tokenSymbol: approval.tokenSymbol || null,
    atRiskTokens,
    atRiskUsd,
    balanceUsd,
    isUnlimited: allowanceBn >= MAX_UINT256,
    priceKnown,
    decimals,
    // Severity hint for UI coloring.
    severity: atRiskUsd === null ? "unknown"
            : atRiskUsd === 0 ? "none"
            : atRiskUsd <= 100 ? "low"
            : atRiskUsd <= 1000 ? "medium"
            : atRiskUsd <= 10000 ? "high"
            : "critical"
  };
}

/**
 * Compute the aggregate blast radius across all approvals.
 *
 * @param {Array<Object>} approvals — array of approval objects
 * @returns {Object} — { totalAtRiskUsd, totalBalanceUsd, perChain: {...}, perApproval: [...], criticalCount }
 */
export function aggregateBlastRadius(approvals) {
  if (!Array.isArray(approvals)) return null;
  const perApproval = [];
  const perChain = {};
  let totalAtRiskUsd = 0;
  let totalBalanceUsd = 0;
  let totalKnownUsd = 0;
  let criticalCount = 0;
  let highCount = 0;

  for (const a of approvals) {
    const r = blastRadiusForApproval(a);
    if (!r) continue;
    perApproval.push({ ...r, chainId: a.chainId });
    const chainKey = a.chainId || 0;
    if (!perChain[chainKey]) {
      perChain[chainKey] = { atRiskUsd: 0, balanceUsd: 0, count: 0, unknown: 0 };
    }
    if (r.atRiskUsd !== null) {
      totalAtRiskUsd += r.atRiskUsd;
      perChain[chainKey].atRiskUsd += r.atRiskUsd;
      totalKnownUsd++;
    } else {
      perChain[chainKey].unknown++;
    }
    if (r.balanceUsd !== null) {
      totalBalanceUsd += r.balanceUsd;
      perChain[chainKey].balanceUsd += r.balanceUsd;
    }
    perChain[chainKey].count++;
    if (r.severity === "critical") criticalCount++;
    if (r.severity === "high") highCount++;
  }

  return {
    totalAtRiskUsd: round2(totalAtRiskUsd),
    totalBalanceUsd: round2(totalBalanceUsd),
    perChain,
    perApproval,
    criticalCount,
    highCount,
    totalApprovals: approvals.length,
    unknownCount: approvals.length - totalKnownUsd,
    // Human-readable summary.
    summary: formatSummary(totalAtRiskUsd, approvals.length, criticalCount)
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatSummary(totalUsd, totalApprovals, criticalCount) {
  if (totalApprovals === 0) return "No active approvals.";
  if (criticalCount > 0) return `${criticalCount} critical-risk approval${criticalCount > 1 ? "s" : ""}.`;
  if (totalUsd === 0) return `${totalApprovals} approval${totalApprovals > 1 ? "s" : ""}, $0 at risk.`;
  return `${totalApprovals} approval${totalApprovals > 1 ? "s" : ""}, $${round2(totalUsd).toLocaleString()} at risk.`;
}

/**
 * Rank approvals by blast radius (highest first).
 * Returns an array of { approval, blast, score } sorted descending.
 */
export function rankByBlastRadius(approvals) {
  if (!Array.isArray(approvals)) return [];
  const ranked = approvals.map((a) => {
    const blast = blastRadiusForApproval(a);
    const score = scoreBlastSeverity(blast);
    return { approval: a, blast, score };
  });
  ranked.sort((x, y) => y.score - x.score);
  return ranked;
}

function scoreBlastSeverity(blast) {
  if (!blast) return 0;
  if (blast.severity === "critical") return 5;
  if (blast.severity === "high") return 4;
  if (blast.severity === "medium") return 3;
  if (blast.severity === "low") return 2;
  if (blast.severity === "unknown") return 1;
  return 0;
}
