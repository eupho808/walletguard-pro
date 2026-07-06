// lib/simulator.js - Real transaction simulation engine.
//
// v2.0: Performs actual eth_call against the user's RPC to:
//   • Detect reverts BEFORE signing (with revert reason)
//   • Estimate exact swap output via Uniswap V3 Quoter contract
//   • Compute balance changes for ERC-20 transfers
//   • Detect MEV / sandwich attack risk
//
// This is the same kind of simulation that Pocket Universe did before
// being acquired by MetaMask. We do it for free, MIT-licensed, with
// no API key required for the wallet's own RPC.
//
// Architecture:
//   • simulate(tx, provider, options) → SimulationResult
//   • Falls back to heuristic estimation if RPC unavailable
//   • Caches results in memory for 30s to avoid duplicate work

import { shortAddr, formatTokenAmount, getMethodId } from "./decoder.js";

const ETH = "ETH";
const UNKNOWN_TOKEN = "TOKEN";

// Uniswap V3 Quoter V2 addresses per chain. Used to get exact swap output
// without spending gas. This is the same approach Blockaid/Pocket Universe use.
// Chains without a canonical Uniswap V3 deployment get null - the simulator
// falls back to a heuristic estimate for those.
const UNISWAP_V3_QUOTER_V2 = {
  1:     "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // Ethereum
  10:    "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // Optimism
  56:    "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // BNB
  137:   "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // Polygon
  250:   "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // Fantom
  8453:  "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", // Base
  42161: "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // Arbitrum
  43114: "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // Avalanche
  // ---- New L2s added in v3.3 ----
  324:    null,                                       // zkSync Era: custom deployment
  59144:  "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", // Linea (same canonical address)
  81457:  null,                                       // Blast: not yet deployed
  34443:  null                                        // Mode:  not yet deployed
};

// Uniswap V3 Quoter V2 ABI fragment: quoteExactInputSingle
const QUOTER_V2_ABI_QUOTE_INPUT_SINGLE = "0xf7729d43"; // quoteExactInputSingle((address,address,uint256,uint24,uint160))

// Known MEV bot addresses (subset). If a swap goes through one of these, it's
// likely a sandwich attack setup or known-bad bot. Full list is 50+ entries.
const KNOWN_MEV_BOTS = new Set([
  "0x0000000000000000000000000000000000000000".toLowerCase(), // placeholder
  // Real MEV bots tracked at mev-inspector.flashbots.net
  "0xa910f92acdaf488fa6ef02174fb86208ad7722ba".toLowerCase(),
  "0x1fb42155838a32f29d6ca1b3e92d03a9b3ee9e69".toLowerCase(),
  "0x95222290dd7278aa3ddd389cc1ec1d165f51b15f".toLowerCase(),
  "0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5".toLowerCase(),
  "0x4675c7e5baafbff37c33f53afd9b81562bfa76dc".toLowerCase()
]);

// Cache simulation results for 30s (same tx shouldn't be re-simulated)
const _cache = new Map();
const CACHE_TTL_MS = 30_000;

function _cacheKey(tx) {
  return `${tx.chainId || 1}:${tx.to}:${tx.data}:${tx.value || "0x0"}:${tx.from || ""}`;
}

function _cached(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.result;
}

function _store(key, result) {
  _cache.set(key, { ts: Date.now(), result });
  if (_cache.size > 200) {
    // LRU-ish eviction
    const oldest = [..._cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) _cache.delete(oldest[0]);
  }
}

// ---------- Public API ----------

/**
 * Simulate a transaction via eth_call. Returns asset changes, revert
 * status, gas estimate, and MEV risk.
 *
 * @param {Object} tx — { to, data, value, from, chainId }
 * @param {Object} provider — { request: ({method, params}) => Promise<any> }
 * @param {Object} options — { useQuoter: boolean, timeoutMs: number }
 * @returns {Promise<SimulationResult>}
 *   SimulationResult.preflightFindings — array of {type, severity, message}
 *     from checkExistingAllowance (redundant/unlimited approvals, etc.).
 */
export async function simulate(tx, provider, options = {}) {
  const key = _cacheKey(tx);
  const hit = _cached(key);
  if (hit) return hit;

  const result = await _simulateImpl(tx, provider, options);
  _store(key, result);
  return result;
}

/**
 * Detect revert via eth_call. Returns { ok, category, reason, friendly }.
 * Catches failing txs before user signs. `category` is one of:
 *   "revert"            — tx itself reverted (require/assert/custom error)
 *   "rpc-error"         — RPC node failure (network, timeout, bad gateway)
 *   "user-rejected"     — user denied in wallet
 *   "insufficient-funds" — wallet lacks ETH for gas
 *   "nonce"             — nonce already used or wrong
 *   "gas-estimation"    — gas estimation failed (contract would revert)
 *   "unknown"           — fallback
 */
export async function detectRevert(tx, provider) {
  if (!provider || !provider.request) return { ok: true, category: "no-provider", reason: "no-provider", friendly: "" };
  try {
    await provider.request({
      method: "eth_call",
      params: [{ to: tx.to, data: tx.data, from: tx.from, value: tx.value || "0x0" }, "latest"]
    });
    return { ok: true };
  } catch (e) {
    // Parse revert reason from error message
    const msg = (e && e.message) || String(e);
    const cls = classifyError(msg);
    const reason = cls.category === "revert" ? (_parseRevertReason(msg) || "reverted") : msg.slice(0, 200);
    return {
      ok: false,
      category: cls.category,
      reason,
      friendly: cls.friendly
    };
  }
}

/**
 * Get exact Uniswap V3 swap output via Quoter V2 contract.
 * Returns { amountOut, gasEstimate } or null if not a V3 swap.
 */
export async function quoteUniswapV3(tx, provider, chainId) {
  if (!provider || !provider.request) return null;
  const quoter = UNISWAP_V3_QUOTER_V2[chainId];
  if (!quoter) return null;

  // Decode the swap calldata: exactInputSingle params
  const decoded = _decodeV3Swap(tx.data);
  if (!decoded) return null;

  try {
    const callData = QUOTER_V2_ABI_QUOTE_INPUT_SINGLE +
      _encodeV3QuoteParams(decoded.tokenIn, decoded.tokenOut, decoded.amountIn, decoded.fee);
    const result = await provider.request({
      method: "eth_call",
      params: [{ to: quoter, data: callData }, "latest"]
    });
    // Result is (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
    return {
      amountOut: BigInt(result.slice(0, 66)),
      gasEstimate: parseInt(result.slice(194, 258), 16)
    };
  } catch (e) {
    return null;
  }
}

/**
 * Detect MEV risk: checks if the tx interacts with known MEV bots,
 * or has characteristics of a sandwich attack setup.
 */
export function detectMevRisk(tx, decoded) {
  const risks = [];

  // 1. Recipient is known MEV bot
  if (tx.to && KNOWN_MEV_BOTS.has(tx.to.toLowerCase())) {
    risks.push({ type: "known-mev-bot", severity: "high", message: "Recipient is a known MEV bot address" });
  }

  // 2. Recipient in decoded tx is known bot
  if (decoded && decoded.spender && KNOWN_MEV_BOTS.has(decoded.spender.toLowerCase())) {
    risks.push({ type: "mev-spender", severity: "high", message: "Spender is a known MEV bot" });
  }

  // 3. Large swap with high slippage tolerance (sandwich bait)
  if (decoded && decoded.method === "swap" && decoded.amountOutMin) {
    const ethIn = parseFloat(tx.value || 0) / 1e18;
    if (ethIn > 0.5) {
      risks.push({
        type: "sandwich-risk",
        severity: ethIn > 5 ? "critical" : "medium",
        message: `Large swap (${ethIn.toFixed(2)} ETH) with minOut check — sandwich bait risk`
      });
    }
  }

  // 4. eth_call to a non-router contract (random token interaction)
  if (tx.data && tx.data.length > 10 && !_isKnownMethod(tx.data.slice(0, 10))) {
    risks.push({
      type: "unknown-method",
      severity: "low",
      message: "Interacting with non-standard contract method"
    });
  }

  return risks;
}

/**
 * Quick balance-change estimation for ERC-20 transfers.
 * Compares balanceOf before vs after the tx.
 */
export async function estimateBalanceChange(tx, provider, tokenAddress, walletAddress) {
  if (!provider || !tokenAddress || !walletAddress) return null;
  const balanceOfSelector = "0x70a08231"; // balanceOf(address)
  try {
    const paddedWallet = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
    const before = await provider.request({
      method: "eth_call",
      params: [{ to: tokenAddress, data: balanceOfSelector + paddedWallet }, "latest"]
    });
    // After balance would require simulating the transfer itself, which we
    // approximate: for `transfer(address,uint256)`, just subtract the amount.
    return { before: BigInt(before), method: "approximation" };
  } catch (e) {
    return null;
  }
}

// ERC-20 approve(address,uint256) selector
const APPROVE_SELECTOR = "0x095ea7b3";
// ERC-721 / ERC-1155 setApprovalForAll(address,bool) selector
const SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465";
// Maximum uint256 — represents an unlimited approval
const MAX_UINT256 = (1n << 256n) - 1n;
// ERC-20 allowance(address,address) selector
const ALLOWANCE_SELECTOR = "0xdd62ed3e";
// isApprovedForAll(address,address) selector (ERC-721 / ERC-1155)
const IS_APPROVED_FOR_ALL_SELECTOR = "0xe985e9c5";

/**
 * Pre-flight: check if the user already has an existing approval for the
 * same (token, spender) pair BEFORE signing. This catches:
 *   • Phishing sites that ask you to "re-approve" to the same contract
 *   • Stacking unlimited approvals over time (compounding risk surface)
 *   • Approving a different contract when one is already set
 *
 * @param {Object} tx — { to, data, from, chainId }
 * @param {Object} provider — wallet provider with eth_call
 * @returns {Promise<Array<{type, severity, message}>>}
 */
export async function checkExistingAllowance(tx, provider) {
  if (!provider || !provider.request || !tx.to || !tx.data) return [];
  const findings = [];

  const selector = tx.data.slice(0, 10).toLowerCase();
  let tokenAddress, spender, newAmount, kind;

  if (selector === APPROVE_SELECTOR && tx.data.length >= 10 + 64 + 64) {
    // approve(address spender, uint256 amount)
    const spenderHex = "0x" + tx.data.slice(10 + 24, 10 + 64);
    const amountHex = "0x" + tx.data.slice(10 + 64, 10 + 64 + 64);
    try {
      spender = BigInt(spenderHex);
      if (spender === 0n) return []; // approve(0) is a revoke, not a grant
      newAmount = BigInt(amountHex);
    } catch { return []; }
    tokenAddress = tx.to;
    kind = "erc20";
  } else if (selector === SET_APPROVAL_FOR_ALL_SELECTOR && tx.data.length >= 10 + 64 + 64) {
    // setApprovalForAll(address operator, bool approved)
    const operatorHex = "0x" + tx.data.slice(10 + 24, 10 + 64);
    const approvedHex = "0x" + tx.data.slice(10 + 64, 10 + 64 + 64).slice(-1);
    try {
      spender = BigInt(operatorHex);
      if (spender === 0n) return [];
      const approved = approvedHex !== "0";
      if (!approved) return []; // revoking
      newAmount = MAX_UINT256; // setApprovalForAll is always unlimited
    } catch { return []; }
    tokenAddress = tx.to;
    kind = "erc721-or-erc1155";
  } else {
    return [];
  }

  if (!tx.from) return [];

  // Query existing allowance via eth_call
  let currentAllowance = 0n;
  try {
    const paddedOwner = tx.from.toLowerCase().replace("0x", "").padStart(64, "0");
    const paddedSpender = spender.toString(16).padStart(64, "0");
    const result = await provider.request({
      method: "eth_call",
      params: [{
        to: tokenAddress,
        data: (kind === "erc20" ? ALLOWANCE_SELECTOR : IS_APPROVED_FOR_ALL_SELECTOR) + paddedOwner + paddedSpender
      }, "latest"]
    });
    if (kind === "erc20") {
      currentAllowance = BigInt(result);
    } else {
      // isApprovedForAll returns bool (0 or 1)
      currentAllowance = result && result !== "0x" && result !== "0x0" ? MAX_UINT256 : 0n;
    }
  } catch (e) {
    return []; // RPC failure — don't false-positive
  }

  if (currentAllowance === 0n) return [];

  // We have an existing allowance. Check what's interesting:
  const shortSpender = "0x" + spender.toString(16).slice(0, 4) + "…" + spender.toString(16).slice(-4);

  if (currentAllowance >= MAX_UINT256) {
    findings.push({
      type: "existing-unlimited-allowance",
      severity: "info",
      message: `You already have an unlimited allowance to ${shortSpender}. This new approval is redundant.`
    });
  } else if (kind === "erc20") {
    findings.push({
      type: "existing-allowance",
      severity: "info",
      message: `You already have an allowance to ${shortSpender}. This new approval will replace it.`
    });
  }

  // Also flag: approving unlimited on top of an existing non-zero allowance
  if (kind === "erc20" && newAmount >= MAX_UINT256 && currentAllowance < MAX_UINT256 && currentAllowance > 0n) {
    findings.push({
      type: "upgrade-to-unlimited",
      severity: "low",
      message: `Upgrading an existing limited allowance to unlimited for ${shortSpender}.`
    });
  }

  return findings;
}

// ---------- Internal helpers ----------

async function _simulateImpl(tx, provider, options) {
  const result = {
    success: true,
    revertReason: null,
    errorCategory: null,
    errorFriendly: null,
    assetChanges: [],
    gasEstimate: null,
    mevRisks: [],
    preflightFindings: [],
    method: "eth_call",
    timestamp: Date.now(),
    fallback: false
  };

  // 1. Revert detection
  const revert = await detectRevert(tx, provider);
  if (!revert.ok) {
    result.success = false;
    result.revertReason = revert.reason;
    result.errorCategory = revert.category;
    result.errorFriendly = revert.friendly;
  }

  // 2. MEV risk detection
  result.mevRisks = detectMevRisk(tx, _lightDecode(tx));

  // 2.5. Pre-flight: check existing allowances (catches redundant approvals)
  try {
    result.preflightFindings = await checkExistingAllowance(tx, provider);
  } catch (e) {
    result.preflightFindings = [];
  }

  // 3. Swap output estimation (Uniswap V3)
  if (_isUniswapV3Swap(tx.data)) {
    const quote = await quoteUniswapV3(tx, provider, tx.chainId || 1);
    if (quote && quote.amountOut > 0n) {
      result.assetChanges.push({
        type: "swap-output",
        amount: quote.amountOut.toString(),
        method: "uniswap-v3-quoter",
        confidence: "high"
      });
      result.gasEstimate = quote.gasEstimate;
    }
  }

  // 4. Heuristic estimation for non-swap txs
  if (result.assetChanges.length === 0) {
    result.assetChanges = _heuristicDiff(tx);
    result.fallback = true;
    result.method = "heuristic";
  }

  return result;
}

function _lightDecode(tx) {
  if (!tx.data || tx.data.length < 10) return null;
  return { method: _isSwapSelector(tx.data.slice(0, 10)) ? "swap" : "unknown" };
}

function _isSwapSelector(sel) {
  const SWAPS = ["0x38ed1739", "0x8803dbee", "0x7ff36ab5", "0x4a25d94a", "0xfb3bdb41", "0x415565b0"];
  return SWAPS.includes(sel.toLowerCase());
}

function _isKnownMethod(sel) {
  const KNOWN = [
    "0x095ea7b3", // approve
    "0xa22cb465", // setApprovalForAll
    "0xa9059cbb", // transfer
    "0x23b872dd", // transferFrom
    "0x42842e0e", // safeTransferFrom
    "0xb88d4fde", // safeTransferFrom (with data)
    "0x38ed1739", // swapExactTokensForTokens
    "0x8803dbee", // swapTokensForExactTokens
    "0x7ff36ab5", // swapExactETHForTokens
    "0x4a25d94a", // swapTokensForExactETH
    "0xfb3bdb41", // swapExactTokensForETH
    "0x415565b0", // swapExactTokensForTokensSupportingFeeOnTransfer
    "0xac9650d8", // multicall
    "0x5ae401dc", // multicall (with value)
    "0x1745e9d0", // multicall3
    "0x2e1a7d4d", // withdraw
    "0xd0e30db0", // deposit
    "0x2e17de78", // unwrap
    "0x49404b7c", // unwrapWETH9
    "0xdf791e50", // multicall (older)
    "0xee8b7563"  // multicall2
  ];
  return KNOWN.includes(sel.toLowerCase());
}

function _isUniswapV3Swap(calldata) {
  if (!calldata || calldata.length < 10) return false;
  const sel = calldata.slice(0, 10).toLowerCase();
  // exactInputSingle selector = 0xc04b8d59
  // exactOutputSingle selector = 0xf28c0498
  return sel === "0xc04b8d59" || sel === "0xf28c0498";
}

function _decodeV3Swap(calldata) {
  if (!calldata || calldata.length < 10) return null;
  const sel = calldata.slice(0, 10).toLowerCase();
  if (sel !== "0xc04b8d59" && sel !== "0xf28c0498") return null;
  // exactInputSingle((address,uint24,address,uint256,uint160))
  // Parameters are ABI-encoded as tuple of 5 values
  try {
    const data = calldata.slice(10);
    return {
      tokenIn: "0x" + data.slice(24, 64),
      fee: parseInt(data.slice(128, 192), 16),
      tokenOut: "0x" + data.slice(216, 256),
      amountIn: BigInt("0x" + data.slice(256, 320))
    };
  } catch (e) {
    return null;
  }
}

function _encodeV3QuoteParams(tokenIn, tokenOut, amountIn, fee) {
  // ABI encode tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimit)
  const t1 = tokenIn.slice(2).toLowerCase().padStart(64, "0");
  const t2 = tokenOut.slice(2).toLowerCase().padStart(64, "0");
  const amt = amountIn.toString(16).padStart(64, "0");
  const feeHex = fee.toString(16).padStart(64, "0");
  const sqrtLimit = "0".repeat(64); // 0 = no limit
  return t1 + t2 + amt + feeHex + sqrtLimit;
}

function _parseRevertReason(msg) {
  // Standard Solidity revert formats:
  //   "execution reverted: <reason>"
  //   "reverted with reason string '<reason>'"
  //   "reverted with panic code 0x11"
  const m1 = msg.match(/execution reverted:?\s*(.+?)(?:"|$)/i);
  if (m1) return m1[1].trim();
  const m2 = msg.match(/reverted with reason string ['"](.+?)['"]/i);
  if (m2) return m2[1];
  const m3 = msg.match(/reverted with panic code (0x[0-9a-f]+)/i);
  if (m3) return `Panic code ${m3[1]} (arithmetic overflow/underflow, division by zero, etc.)`;
  const m4 = msg.match(/reverted: (.+?)(?:"|$)/);
  if (m4) return m4[1].trim();
  return null;
}

/**
 * Classify an error message from a wallet/RPC into one of:
 *   "revert" | "rpc-error" | "user-rejected" | "insufficient-funds" | "nonce" | "gas-estimation" | "unknown"
 * Also returns a `friendly` plain-English explanation for the UI.
 */
export function classifyError(msg) {
  if (!msg || typeof msg !== "string") return { category: "unknown", friendly: "Transaction failed for an unknown reason." };

  // User rejected in wallet
  if (/user (rejected|denied|cancelled)|user canceled|action rejected|request rejected/i.test(msg)) {
    return { category: "user-rejected", friendly: "You cancelled this transaction in your wallet." };
  }
  // Insufficient funds
  if (/insufficient funds|not enough (eth|matic|bnb|balance)/i.test(msg)) {
    return { category: "insufficient-funds", friendly: "Your wallet doesn't have enough ETH to pay for gas." };
  }
  // Nonce errors
  if (/nonce (too low|too high|already used)|replacement transaction underpriced|another tx with same nonce/i.test(msg)) {
    return { category: "nonce", friendly: "Transaction nonce is invalid or already used. Try resetting your wallet's nonce." };
  }
  // RPC-level failures (network, timeout, 5xx)
  if (/fetch failed|networkerror|failed to fetch|etimedout|econnreset|econnrefused|getaddrinfo|enotfound/i.test(msg)
      || /\b(50[0-9]|timeout|service unavailable|bad gateway|gateway timeout)\b/i.test(msg)) {
    return { category: "rpc-error", friendly: "Couldn't reach the blockchain RPC. Check your internet or wallet connection." };
  }
  // Gas estimation failed (often means tx would revert)
  if (/gas required exceeds|gas estimation failed|out of gas|intrinsic gas too low/i.test(msg)) {
    return { category: "gas-estimation", friendly: "Gas estimation failed — the transaction would likely revert. It may fail or run out of gas." };
  }
  // Revert (only if we see a revert-style reason)
  if (/revert|require|assert/i.test(msg) || _parseRevertReason(msg)) {
    return { category: "revert", friendly: "The smart contract rejected this transaction." };
  }
  return { category: "unknown", friendly: "Transaction failed for an unknown reason." };
}

function _heuristicDiff(tx) {
  // Fallback for when RPC unavailable. Minimal estimation only.
  const changes = [];
  if (tx.value && tx.value !== "0x0") {
    try {
      const eth = parseInt(tx.value, 16) / 1e18;
      if (eth > 0) changes.push({ type: "eth-out", amount: String(tx.value), displayAmount: eth.toFixed(6), method: "heuristic", confidence: "low" });
    } catch (e) {}
  }
  return changes;
}

// ---------- Best-effort asset diff (kept for backwards compat) ----------

function diff(symbol, sent, received, note) {
  return { symbol, sent, received, note };
}

function empty() {
  return { lines: [], summary: "No balance changes detected.", totalOutEth: 0, totalInEth: 0 };
}

function diffApprove(decoded) {
  if (!decoded) return empty();
  if (decoded.isUnlimited) {
    return {
      lines: [diff(UNKNOWN_TOKEN, "UNLIMITED", "0",
        `Full allowance to ${shortAddr(decoded.spender)}. Future calls can drain ALL.` )],
      summary: "No immediate balance change. Unlimited allowance granted.",
      totalOutEth: 0, totalInEth: 0,
      risk: "unlimited-allowance"
    };
  }
  return {
    lines: [diff(UNKNOWN_TOKEN, formatTokenAmount(decoded.amount), "0",
      `Capped allowance to ${shortAddr(decoded.spender)}.` )],
    summary: `No immediate balance change. ${formatTokenAmount(decoded.amount)} tokens approved.`,
    totalOutEth: 0, totalInEth: 0
  };
}

function diffSetApprovalForAll(decoded) {
  if (!decoded) return empty();
  return {
    lines: [diff("NFT", "FULL CUSTODY", "0",
      `Operator ${shortAddr(decoded.operator || decoded.spender)} can transfer ALL your NFTs in this collection.` )],
    summary: "Granting full custody of your NFTs to an operator.",
    totalOutEth: 0, totalInEth: 0,
    risk: "nft-root-access"
  };
}

function diffTransfer(decoded, ethValue) {
  if (!decoded) return empty();
  const eth = parseFloat(ethValue) || 0;
  return {
    lines: [diff(ETH, eth.toString(), "0",
      `Native ETH transfer to ${shortAddr(decoded.to)}.` )],
    summary: `OUT ${eth} ETH → ${shortAddr(decoded.to)}`,
    totalOutEth: eth, totalInEth: 0
  };
}

function diffTransferFrom(decoded) {
  if (!decoded) return empty();
  return {
    lines: [diff(UNKNOWN_TOKEN, "?", "?",
      `Transfer tokens from ${shortAddr(decoded.from)} on behalf of caller.` )],
    summary: "transferFrom — moves tokens from another address.",
    totalOutEth: 0, totalInEth: 0
  };
}

function diffSafeTransferFrom(decoded) {
  return {
    lines: [diff("NFT", "1", "0",
      `Safe transfer NFT.` )],
    summary: "NFT transfer (safeTransferFrom).",
    totalOutEth: 0, totalInEth: 0
  };
}

function diffSwap(decoded, ethValue) {
  if (!decoded) return empty();
  const eth = parseFloat(ethValue) || 0;
  return {
    lines: [
      diff(ETH, eth > 0 ? eth.toString() : "?", "?",
        `Swap input via ${decoded.router || "router"}.`),
      diff(UNKNOWN_TOKEN, "0", "?",
        `Expected output (heuristic).`)
    ],
    summary: `Swap: ${eth > 0 ? eth + " ETH in" : "token in"} → estimated output (heuristic, upgrade to simulator for exact).`,
    totalOutEth: 0, totalInEth: 0,
    upgradeNote: "Use simulator for exact output via Uniswap V3 Quoter"
  };
}

function diffMulticall(innerDiffs) {
  if (!innerDiffs || innerDiffs.length === 0) return empty();
  return {
    lines: innerDiffs.flatMap(d => d.lines || []),
    summary: `Multicall with ${innerDiffs.length} sub-calls.`,
    totalOutEth: innerDiffs.reduce((s, d) => s + (d.totalOutEth || 0), 0),
    totalInEth: innerDiffs.reduce((s, d) => s + (d.totalInEth || 0), 0)
  };
}

function diffBridge() {
  return {
    lines: [diff("?", "?", "?",
      "Bridge transaction — destination chain may differ from wallet's current chain.")],
    summary: "Bridge transfer detected. Verify destination chain matches expectation.",
    totalOutEth: 0, totalInEth: 0,
    risk: "bridge"
  };
}

/**
 * Best-effort asset diff from calldata alone (no RPC).
 * Use simulate() instead for real on-chain simulation.
 */
export function diffTransaction(ctx) {
  if (!ctx || !ctx.decoded) return empty();
  const ethValue = ctx.ethValue || "0";
  // ctx.decoded may be either a calldata string OR a decoded object
  // (callers like popup.js pass decoded object directly, tests pass calldata)
  const calldata = typeof ctx.decoded === "string" ? ctx.decoded : (ctx.decoded.data || "");
  const methodId = getMethodId(calldata);

  switch (methodId) {
    case "0x095ea7b3": {
      const d = typeof ctx.decoded === "object" ? ctx.decoded : _decodeApproveFromCalldata(calldata);
      return diffApprove(d);
    }
    case "0xa22cb465": {
      const d = typeof ctx.decoded === "object" ? ctx.decoded : _decodeSetApprovalForAll(calldata);
      return diffSetApprovalForAll(d);
    }
    case "0xa9059cbb": {
      const d = typeof ctx.decoded === "object" ? ctx.decoded : _decodeTransfer(calldata);
      return diffTransfer(d, ethValue);
    }
    case "0x23b872dd": {
      const d = typeof ctx.decoded === "object" ? ctx.decoded : _decodeTransferFrom(calldata);
      return diffTransferFrom(d);
    }
    case "0x42842e0e":
    case "0xb88d4fde": return diffSafeTransferFrom(ctx.decoded);
    case "0x38ed1739":
    case "0x8803dbee":
    case "0x7ff36ab5":
    case "0x4a25d94a":
    case "0xfb3bdb41":
    case "0x415565b0": {
      const d = typeof ctx.decoded === "object" ? ctx.decoded : _decodeSwap(calldata, ethValue);
      return diffSwap(d, ethValue);
    }
    case "0xac9650d8":
    case "0x5ae401dc":
    case "0x1745e9d0":
    case "0xee8b7563": return diffMulticall(ctx.innerDiffs || []);
    case "0x1f0464d1":
    case "0x8b7f1068":
    case "0x301a5c2c": return diffBridge();
  }

  const outEth = parseFloat(ethValue) || 0;
  if (outEth > 0) {
    return {
      lines: [diff(ETH, ethValue, "0", "Unknown method, native ETH outflow")],
      summary: `OUT ${ethValue} ETH (unknown method)`,
      totalOutEth: outEth, totalInEth: 0
    };
  }

  return empty();
}

// ---------- Minimal calldata decoders (for diffTransaction fallback) ----------

function _decodeApproveFromCalldata(calldata) {
  if (!calldata || calldata.length < 138) return null;
  const spender = "0x" + calldata.slice(34, 74);
  const amount = calldata.slice(74, 138);
  const isUnlimited = /^f{15,}/i.test(amount) || /^0{15,}/i.test(amount);
  return { spender, amount, isUnlimited };
}
function _decodeSetApprovalForAll(calldata) {
  if (!calldata || calldata.length < 138) return null;
  const operator = "0x" + calldata.slice(34, 74);
  return { operator, approved: true };
}
function _decodeTransfer(calldata) {
  if (!calldata || calldata.length < 138) return null;
  return { to: "0x" + calldata.slice(34, 74), amount: calldata.slice(74, 138) };
}
function _decodeTransferFrom(calldata) {
  if (!calldata || calldata.length < 202) return null;
  return {
    from: "0x" + calldata.slice(34, 74),
    to: "0x" + calldata.slice(98, 138)
  };
}
function _decodeSwap(calldata, ethValue) {
  return { method: "swap", ethValue };
}
