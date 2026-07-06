// lib/wallet-classifier.js - Wallet type detection with adaptive risk rules.
//
// Classifies wallets into types and adjusts security rules accordingly.
// A cold storage wallet needs stricter rules than a hot wallet.
// A whale wallet needs extra warnings on large transactions.
// A contract (multisig, etc.) needs different rules entirely.
//
// Detections:
//   • cold-storage: rare activity, high balance, fresh receiving addresses
//   • hot-wallet: frequent activity, many token interactions
//   • whale: balance > 100 ETH equivalent (configurable)
//   • contract: has code at address
//   • exchange: known exchange addresses (hardcoded list)
//   • defi-power-user: 50+ unique token interactions

import { shortAddr } from "./decoder.js";

// Known exchange deposit addresses (partial — main hot wallets only).
// In production this would be community-curated threat intelligence.
const KNOWN_EXCHANGES = new Set([
  "0x28c6c06298d514db089934071355e5743bf21d60", // Binance 14
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549", // Binance 15
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963e", // Binance 16
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f", // Binance 17
  "0x9696f695e58d23a0c4f48c1f3c2e5f5c4b8e7e88", // Coinbase
  "0x388c818ca8b9251b393131c08a736a67ccb19297", // Coinbase
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43", // Coinbase 2
  "0x505e71695e9bc45943c58adbec1650977eba08dd", // Kraken
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", // Kraken 2
  "0x0a869d79a7052c7f1b55a8babbea0760d0b45429"  // Kraken 3
]);

// Wallet types.
export const WALLET_TYPES = {
  unknown: "unknown",
  hot: "hot",
  cold: "cold",
  whale: "whale",
  contract: "contract",
  exchange: "exchange",
  defi: "defi",
  fresh: "fresh"
};

/**
 * Classify a wallet based on observable metrics.
 *
 * @param {Object} metrics — {
 *   address, codeAtAddress, txCount, lastActivityAt, balanceEth,
 *   uniqueTokens, firstActivityAt, totalReceived, totalSent
 * }
 * @returns {Object} — { type, confidence, reason, recommendedRules }
 */
export function classifyWallet(metrics) {
  if (!metrics || !metrics.address) {
    return { type: WALLET_TYPES.unknown, confidence: 0, reason: "no data" };
  }

  // 1. Contract check (has code).
  if (metrics.codeAtAddress === true) {
    return {
      type: WALLET_TYPES.contract,
      confidence: 1.0,
      reason: "Address has contract code — not an EOA",
      recommendedRules: getRulesForType(WALLET_TYPES.contract)
    };
  }

  // 2. Exchange check.
  if (KNOWN_EXCHANGES.has(metrics.address.toLowerCase())) {
    return {
      type: WALLET_TYPES.exchange,
      confidence: 1.0,
      reason: "Known exchange hot wallet",
      recommendedRules: getRulesForType(WALLET_TYPES.exchange)
    };
  }

  // 3. Fresh wallet (< 5 transactions).
  if (metrics.txCount !== undefined && metrics.txCount < 5) {
    return {
      type: WALLET_TYPES.fresh,
      confidence: 0.7,
      reason: `Only ${metrics.txCount || 0} transactions`,
      recommendedRules: getRulesForType(WALLET_TYPES.fresh)
    };
  }

  // 4. Whale (> 100 ETH).
  if (metrics.balanceEth !== undefined && metrics.balanceEth > 100) {
    return {
      type: WALLET_TYPES.whale,
      confidence: 0.9,
      reason: `Balance ${metrics.balanceEth.toFixed(2)} ETH (whale threshold)`,
      recommendedRules: getRulesForType(WALLET_TYPES.whale)
    };
  }

  // 5. Cold storage heuristic.
  //    - Wallet age > 1 year
  //    - Last activity > 30 days ago
  //    - Low tx count for the age
  if (metrics.firstActivityAt && metrics.lastActivityAt) {
    const walletAgeDays = (Date.now() / 1000 - metrics.firstActivityAt) / 86400;
    const daysSinceActivity = (Date.now() / 1000 - metrics.lastActivityAt) / 86400;
    const txRate = (metrics.txCount || 0) / Math.max(walletAgeDays, 1);

    if (walletAgeDays > 365 && daysSinceActivity > 30 && txRate < 0.05) {
      return {
        type: WALLET_TYPES.cold,
        confidence: 0.85,
        reason: `Inactive ${daysSinceActivity.toFixed(0)} days, ${txRate.toFixed(2)} tx/day`,
        recommendedRules: getRulesForType(WALLET_TYPES.cold)
      };
    }
  }

  // 6. DeFi power user.
  if (metrics.uniqueTokens !== undefined && metrics.uniqueTokens >= 50) {
    return {
      type: WALLET_TYPES.defi,
      confidence: 0.8,
      reason: `${metrics.uniqueTokens} unique token interactions`,
      recommendedRules: getRulesForType(WALLET_TYPES.defi)
    };
  }

  // 7. Default: hot wallet (frequent activity).
  if (metrics.txCount !== undefined && metrics.txCount >= 50) {
    return {
      type: WALLET_TYPES.hot,
      confidence: 0.6,
      reason: `${metrics.txCount} transactions (active)`,
      recommendedRules: getRulesForType(WALLET_TYPES.hot)
    };
  }

  return {
    type: WALLET_TYPES.unknown,
    confidence: 0.3,
    reason: "Insufficient data for classification",
    recommendedRules: getRulesForType(WALLET_TYPES.unknown)
  };
}

/**
 * Get recommended security rules for a wallet type.
 * Each rule has: { name, threshold, severity }
 */
export function getRulesForType(walletType) {
  switch (walletType) {
    case WALLET_TYPES.cold:
      return {
        unlimitedApproval: { allowed: false, severity: "high" },
        largeTx: { thresholdEth: 0.1, severity: "medium" },
        approvalExpiryDays: 90,
        requireReapprovalDays: 30,
        // Cold wallets should NEVER grant unlimited approvals.
        // Should re-approve every 90 days.
        notes: "Cold storage — strict rules. Limit unlimited approvals, require frequent re-confirmation."
      };
    case WALLET_TYPES.whale:
      return {
        unlimitedApproval: { allowed: false, severity: "critical" },
        largeTx: { thresholdEth: 1.0, severity: "high" },
        approvalExpiryDays: 60,
        requireReapprovalDays: 14,
        notes: "Whale wallet — extra scrutiny on large transfers."
      };
    case WALLET_TYPES.fresh:
      return {
        unlimitedApproval: { allowed: false, severity: "critical" },
        largeTx: { thresholdEth: 0.05, severity: "high" },
        approvalExpiryDays: 30,
        requireReapprovalDays: 7,
        notes: "Fresh wallet — assume high phishing risk. Warn on all approvals."
      };
    case WALLET_TYPES.exchange:
      return {
        unlimitedApproval: { allowed: false, severity: "medium" },
        largeTx: { thresholdEth: 10.0, severity: "medium" },
        approvalExpiryDays: 365,
        requireReapprovalDays: 90,
        notes: "Exchange address — known entity, lower scrutiny on routine transfers."
      };
    case WALLET_TYPES.contract:
      return {
        unlimitedApproval: { allowed: true, severity: "info" },
        largeTx: { thresholdEth: 100.0, severity: "low" },
        approvalExpiryDays: 365,
        requireReapprovalDays: 365,
        notes: "Contract address — different rules apply. Focus on tx semantics."
      };
    case WALLET_TYPES.defi:
      return {
        unlimitedApproval: { allowed: true, severity: "low" },
        largeTx: { thresholdEth: 1.0, severity: "low" },
        approvalExpiryDays: 180,
        requireReapprovalDays: 30,
        notes: "DeFi power user — understands approvals. Lower friction, higher risk visibility."
      };
    case WALLET_TYPES.hot:
      return {
        unlimitedApproval: { allowed: false, severity: "medium" },
        largeTx: { thresholdEth: 0.5, severity: "medium" },
        approvalExpiryDays: 180,
        requireReapprovalDays: 30,
        notes: "Active hot wallet — standard protection."
      };
    default:
      return {
        unlimitedApproval: { allowed: false, severity: "high" },
        largeTx: { thresholdEth: 0.5, severity: "medium" },
        approvalExpiryDays: 180,
        requireReapprovalDays: 30,
        notes: "Unknown type — apply standard rules."
      };
  }
}

/**
 * Check if a transaction violates the wallet's recommended rules.
 */
export function checkRulesViolation(tx, classification, rules) {
  if (!tx || !classification || !rules) return null;
  const violations = [];

  // Unlimited approval check.
  const maxUint256 = (1n << 256n) - 1n;
  let allowance = 0n;
  try {
    if (typeof tx.allowance === "bigint") allowance = tx.allowance;
    else if (typeof tx.allowance === "string") allowance = BigInt(tx.allowance);
  } catch { /* ignore */ }

  if (allowance >= maxUint256 && rules.unlimitedApproval.allowed === false) {
    violations.push({
      rule: "unlimited-approval",
      severity: rules.unlimitedApproval.severity,
      message: `Unlimited approvals not recommended for ${classification.type} wallets`
    });
  }

  // Large transaction check.
  let txValueEth = 0;
  try {
    if (tx.value) {
      const v = typeof tx.value === "bigint" ? tx.value : BigInt(tx.value);
      txValueEth = Number(v) / 1e18;
    }
  } catch { /* ignore */ }

  if (txValueEth > rules.largeTx.thresholdEth) {
    violations.push({
      rule: "large-tx",
      severity: rules.largeTx.severity,
      message: `Transaction value ${txValueEth.toFixed(4)} ETH exceeds ${rules.largeTx.thresholdEth} ETH threshold for ${classification.type}`
    });
  }

  return violations.length > 0 ? violations : null;
}
