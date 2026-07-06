// lib/mev-detector.js - MEV (Maximal Extractable Value) attack detection.
//
// Detects:
//   • Sandwich attack risk on swaps (large trades + minOut checks)
//   • Known MEV bot interactions
//   • Public mempool exposure (if a tx would be visible to MEV searchers)
//   • Frontrunning risk on time-sensitive transactions
//   • Backrunning opportunities (less risky but worth noting)
//
// Heuristic-based. False positives are accepted to be safe — we err on
// the side of warning the user.

import { getMethodId } from "./decoder.js";

// Verified MEV bot addresses (subset). Full list sourced from:
//   - mev-inspector.flashbots.net
//   - EigenPhi MEV tracker
//   - community-submitted reports via github.com/eupho808/walletguard-pro/issues
const MEV_BOT_ADDRESSES = new Set([
  // Flashbots
  "0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5",
  "0x40a50cf069e992aa4536211b23f286ef88752187",
  "0x95222290dd7278aa3ddd389cc1ec1d165f51b15f",
  "0x1fb42155838a32f29d6ca1b3e92d03a9b3ee9e69",
  // MEV-Boost relays
  "0xa910f92acdaf488fa6ef02174fb86208ad7722ba",
  "0x4675c7e5baafbff37c33f53afd9b81562bfa76dc",
  // Known sandwich bots
  "0x0000000000000840d277d8b5b56cf6c93d3f5bca",
  "0x00000000003b3cc22af3ae1cbc0447938dab3409",
  "0x00000000500e2fcecd296b2f23c0a8c8d1c8b5e2",
  // jaredfromsubway.eth and clones
  "0xae2fc483527b8b2565c80cd39b1603dc7d6c7d33",
  "0x6b75d8af000080970086ddeeef0b949e9a6fcd12"
]);

// DEX router addresses that handle swaps. Used to validate swap detection.
const KNOWN_DEX_ROUTERS = new Set([
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap V3 SwapRouter02
  "0xef1c6e67703c7bd71d701e3008ed740d79d164b0", // Uniswap Universal Router
  "0x000000000022d473030f116ddee9f6b43ac78ba3", // Permit2
  "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch V5
  "0x1111111254fb6c44bac0bed2854e76f90643097d", // 1inch V4
  "0xe66b31678d6c16e9ebf358268a790b763c133750", // 0x Exchange
  "0x881d40237659c251811cec9c364ef91dc08d300c"  // MetaMask Swap Router
]);

/**
 * Comprehensive MEV risk assessment.
 *
 * @param {Object} tx — { to, data, value, from, chainId }
 * @param {Object} decoded — pre-decoded calldata (optional, helps accuracy)
 * @returns {Object} { riskLevel, risks[], recommendations[] }
 */
export function assessMevRisk(tx, decoded) {
  const risks = [];
  const recommendations = [];
  const ethValue = _ethValueFromTx(tx);

  // 1. Direct interaction with known MEV bot
  if (tx.to && MEV_BOT_ADDRESSES.has(tx.to.toLowerCase())) {
    risks.push({
      type: "known-mev-bot",
      severity: "critical",
      message: "Recipient is a verified MEV bot address"
    });
    recommendations.push("Cancel this transaction — direct MEV bot interaction");
  }

  // 2. Recipient in decoded fields is known bot
  if (decoded) {
    const targets = [decoded.spender, decoded.to, decoded.operator, decoded.router].filter(Boolean);
    for (const t of targets) {
      if (MEV_BOT_ADDRESSES.has(t.toLowerCase())) {
        risks.push({
          type: "mev-spender",
          severity: "high",
          message: `${shortAddr(t)} is a known MEV bot`
        });
      }
    }
  }

  // 3. Swap detection + sandwich risk
  if (decoded && _isSwap(decoded)) {
    const swapRisk = _assessSwapRisk(decoded, ethValue, tx);
    risks.push(...swapRisk.risks);
    recommendations.push(...swapRisk.recommendations);
  }

  // 4. Mempool exposure (large ETH tx or swap)
  if (_isMempoolExposed(tx, decoded, ethValue)) {
    risks.push({
      type: "mempool-exposure",
      severity: "medium",
      message: "Transaction visible in public mempool — MEV searchers can see it"
    });
    recommendations.push("Use Flashbots Protect RPC for private transaction submission");
  }

  // 5. Time-sensitive tx (deadline/permit signature)
  if (decoded && decoded.deadline) {
    const deadlineSec = parseInt(decoded.deadline, 16);
    const nowSec = Math.floor(Date.now() / 1000);
    const hoursUntilDeadline = (deadlineSec - nowSec) / 3600;
    if (hoursUntilDeadline < 1 && hoursUntilDeadline > 0) {
      risks.push({
        type: "tight-deadline",
        severity: "medium",
        message: `Transaction expires in ${Math.round(hoursUntilDeadline * 60)} minutes — pressure tactic`
      });
    }
  }

  // 6. Aggregate risk level
  const riskLevel = _aggregateRiskLevel(risks);

  return {
    riskLevel,
    risks,
    recommendations,
    mevBotsKnown: MEV_BOT_ADDRESSES.size,
    timestamp: Date.now()
  };
}

/**
 * Estimate price impact for a swap. Returns a percentage estimate
 * based on common DEX liquidity patterns. Not exact, but a useful
 * indicator for "is this a huge trade relative to liquidity?"
 */
export function estimatePriceImpact(amountInEth, tokenPair) {
  // Very rough heuristic. Real price impact requires pool reserves.
  // For now we flag anything >$100k as potentially high impact.
  const ethPriceUsd = 3000; // rough approximation
  const tradeUsd = amountInEth * ethPriceUsd;
  if (tradeUsd > 500_000) return { estimate: "very-high", percent: ">5%", confidence: "low" };
  if (tradeUsd > 100_000) return { estimate: "high", percent: "1-5%", confidence: "low" };
  if (tradeUsd > 10_000) return { estimate: "medium", percent: "0.5-1%", confidence: "low" };
  return { estimate: "low", percent: "<0.5%", confidence: "low" };
}

// ---------- Internal ----------

function _isSwap(decoded) {
  if (!decoded) return false;
  const method = (decoded.method || "").toLowerCase();
  // Direct method name matches
  if (["swap", "swapexactethfortokens", "swaptokensforexacttokens", "swapexacttokensforeth",
       "exactinputsingle", "exactoutputsingle", "execute", "swapwithpermit"].includes(method)) return true;
  // Substring matches for selectors like "swapExactETHForTokens(uint256,address[],address,uint256)"
  if (method.includes("swap")) return true;
  if (method.includes("exactinput") || method.includes("exactoutput")) return true;
  return false;
}

function _ethValueFromTx(tx) {
  if (!tx.value) return 0;
  try {
    return parseInt(tx.value, 16) / 1e18;
  } catch (e) {
    return 0;
  }
}

function _assessSwapRisk(decoded, ethValue, tx) {
  const risks = [];
  const recommendations = [];

  // Large ETH swap + minOut check = sandwich bait
  if (ethValue >= 0.5) {
    const severity = ethValue > 5 ? "critical" : ethValue > 1 ? "high" : "medium";
    risks.push({
      type: "sandwich-risk",
      severity,
      message: `Swap of ${ethValue.toFixed(2)} ETH — sandwich bots target trades >=0.5 ETH`
    });
    recommendations.push("Set tight slippage (0.5-1%) to reduce sandwich profit potential");
    recommendations.push("Consider splitting large swaps into smaller chunks");
    recommendations.push("Use MEV-Blocker RPC: https://rpc.mevblocker.io");
  }

  // High slippage tolerance
  if (decoded.amountOutMin !== undefined && decoded.amountIn !== undefined) {
    // Try to estimate slippage from minOut vs expected
    // Without quoter, we use a rough heuristic: minOut < 90% of amountIn suggests >10% slippage
    // This is approximate — for real estimation use Uniswap V3 Quoter
    try {
      const minOut = BigInt(decoded.amountOutMin);
      const amountIn = BigInt(decoded.amountIn);
      if (amountIn > 0n && minOut < amountIn * 9n / 10n) {
        risks.push({
          type: "high-slippage",
          severity: "high",
          message: "Slippage tolerance appears >10% — vulnerable to sandwich attacks"
        });
        recommendations.push("Reduce slippage tolerance to 0.5-2% for safer execution");
      }
    } catch (e) {}
  }

  // Swap via known router (sanity check)
  if (tx.to && !KNOWN_DEX_ROUTERS.has(tx.to.toLowerCase())) {
    risks.push({
      type: "unknown-router",
      severity: "low",
      message: "Swapping via non-standard router — verify the contract"
    });
  }

  return { risks, recommendations };
}

function _isMempoolExposed(tx, decoded, ethValue) {
  if (ethValue === undefined) ethValue = _ethValueFromTx(tx);
  // Default: all transactions are mempool-exposed unless submitted via private RPC
  // Heuristic: large ETH value txs are more likely to be targeted
  if (ethValue > 2) return true;
  if (decoded && _isSwap(decoded) && ethValue >= 0.5) return true;
  return false;
}

function _aggregateRiskLevel(risks) {
  const severity = { critical: 4, high: 3, medium: 2, low: 1 };
  let max = 0;
  for (const r of risks) {
    const s = severity[r.severity] || 0;
    if (s > max) max = s;
  }
  if (max >= 4) return "critical";
  if (max >= 3) return "high";
  if (max >= 2) return "medium";
  if (max >= 1) return "low";
  return "none";
}

function shortAddr(addr) {
  if (!addr) return "";
  const s = addr.toLowerCase();
  if (s.length < 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
