// lib/price-oracle.js - Real-time on-chain price oracle.
//
// Replaces the static price table in blast-radius.js with live quotes from
// on-chain DEXes. Uses Uniswap V3 QuoterV2 where available, Uniswap V2
// router getAmountsOut as fallback, and the static table as last resort.
//
// Architecture:
//   • getUsdPriceLive(token, provider, chainId) — returns live USD price
//   • In-memory 60s cache per (token, chainId) — avoids hammering RPC
//   • Graceful fallback: V3 quote → V2 quote → static → null
//   • Pure function design — pass any wallet provider with eth_call

import { shortAddr } from "./decoder.js";

// Uniswap V3 QuoterV2 addresses per chain.
const QUOTER_V3 = {
  1:      "0x61fFE014bA17989E743c5F6cB21bF9697520f21F",
  10:     "0x61fFE014bA17989E743c5F6cB21bF9697520f21F",
  56:     "0x61fFE014bA17989E743c5F6cB21bF9697520f21F",
  137:    "0x61fFE014bA17989E743c5F6cB21bF9697520f21F",
  8453:   "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  42161:  "0x61fFE014bA17989E743c5F6cB21bF9697520f21F",
  43114:  "0x61fFE014bA17989E743c5F6cB21bF9697520f21F",
  59144:  "0x6c56BE72d65eb6f3c916c6D1692F74c8d4C1e6a5"
};

// WETH addresses per chain (used as the routing hub for V3 quotes).
const WETH_BY_CHAIN = {
  1:      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  10:     "0x4200000000000000000000000000000000000006",
  56:     "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  137:    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  8453:   "0x4200000000000000000000000000000000000006",
  42161:  "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  43114:  "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  59144:  "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f"
};

// Uniswap V2 Router (for fallback). Same address across most chains.
const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// Common fee tiers for Uniswap V3 (out of 1_000_000).
const FEE_TIERS = [100, 500, 3000, 10000]; // 0.01%, 0.05%, 0.3%, 1%

// Static fallback — same as blast-radius but kept here for self-containment.
const STATIC_PRICES = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 1.00,
  "0xdac17f958d2ee523a2206206994597c13d831ec7": 1.00,
  "0x6b175474e89094c44da98b954eedeac495271d0f": 1.00,
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 3000.00,
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 60000.00,
  "0x4fabb145d64652a948d72533023f6e7a623c7c53": 1.00,
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": 3000.00,
  "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0": 0.50,
  "0x0000000000000000000000000000000000000000": 3000.00
};

// In-memory price cache. 60s TTL.
const _cache = new Map();
const CACHE_TTL_MS = 60_000;

function cacheKey(token, chainId) {
  return `${(token || "").toLowerCase()}-${chainId || 0}`;
}

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.price;
}

function cacheSet(key, price) {
  _cache.set(key, { ts: Date.now(), price });
}

/**
 * Try to get a price via Uniswap V3 QuoterV2.
 * Strategy: try every fee tier; return the first quote > 0.
 */
async function tryUniswapV3(tokenAddress, provider, chainId) {
  const quoter = QUOTER_V3[chainId];
  const weth = WETH_BY_CHAIN[chainId];
  if (!quoter || !weth) return null;
  if (tokenAddress.toLowerCase() === weth.toLowerCase()) {
    // WETH itself — price is the WETH/USD price we already know.
    return STATIC_PRICES[weth.toLowerCase()] || 3000;
  }

  // Try each fee tier. Most liquid pools are usually 3000 (0.3%) or 500 (0.05%).
  for (const fee of FEE_TIERS) {
    try {
      // quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96)
      // Selector: 0xf7729d43
      const selector = "0xf7729d43";
      const tokenIn = tokenAddress.toLowerCase().replace("0x", "").padStart(64, "0");
      const tokenOut = weth.toLowerCase().replace("0x", "").padStart(64, "0");
      const feeHex = fee.toString(16).padStart(64, "0");
      const amountIn = (10n ** 18n).toString(16).padStart(64, "0"); // 1 token
      const sqrtLimit = "0".repeat(64); // no limit
      const data = selector + tokenIn + tokenOut + feeHex + amountIn + sqrtLimit;

      const result = await provider.request({
        method: "eth_call",
        params: [{ to: quoter, data }, "latest"]
      });
      // Result is (uint256 amountOut, uint160 sqrtPriceX96After, uint32 ticksCrossed, uint256 gasEstimate)
      const amountOut = BigInt(result.slice(0, 66));
      if (amountOut > 0n) {
        // We got WETH out per 1 token in. Need WETH/USD price.
        const wethUsd = STATIC_PRICES[weth.toLowerCase()] || 3000;
        // For 18-decimal token: amountOut is in wei. amountOut / 1e18 = WETH per token. * wethUsd = USD per token.
        // For 6-decimal USDC: amountOut is still in wei (WETH has 18 decimals).
        const wethPerToken = Number(amountOut) / 1e18;
        return wethPerToken * wethUsd;
      }
    } catch {
      // Try next fee tier.
    }
  }
  return null;
}

/**
 * Try Uniswap V2 router getAmountsOut. Uses WETH as the hub pair.
 */
async function tryUniswapV2(tokenAddress, provider, chainId) {
  const weth = WETH_BY_CHAIN[chainId];
  if (!weth) return null;
  if (tokenAddress.toLowerCase() === weth.toLowerCase()) {
    return STATIC_PRICES[weth.toLowerCase()] || 3000;
  }

  // getAmountsOut(uint256 amountIn, address[] path)
  // Selector: 0xd06ca61f
  try {
    const selector = "0xd06ca61f";
    const amountIn = (10n ** 18n).toString(16).padStart(64, "0");
    const pathOffset = (32 * 2).toString(16).padStart(64, "0");
    // Path is dynamic — needs length + elements
    const pathLength = "0000000000000000000000000000000000000000000000000000000000000002";
    const tokenIn = tokenAddress.toLowerCase().replace("0x", "").padStart(64, "0");
    const tokenOut = weth.toLowerCase().replace("0x", "").padStart(64, "0");
    const data = selector + amountIn + pathOffset + pathLength + tokenIn + tokenOut;

    const result = await provider.request({
      method: "eth_call",
      params: [{ to: UNISWAP_V2_ROUTER, data }, "latest"]
    });
    // Decode getAmountsOut response:
    //   word 0: offset to array (0x20)
    //   word 1: array length (e.g. 2)
    //   word 2: array[0] = amountIn
    //   word 3: array[1] = amountOut
    const amountOut = BigInt("0x" + result.slice(2 + 64 * 3, 2 + 64 * 4));
    if (amountOut > 0n) {
      const wethUsd = STATIC_PRICES[weth.toLowerCase()] || 3000;
      const wethPerToken = Number(amountOut) / 1e18;
      return wethPerToken * wethUsd;
    }
  } catch {
    // V2 quote failed.
  }
  return null;
}

/**
 * Static fallback. Returns null if token is unknown.
 */
function tryStatic(tokenAddress) {
  if (!tokenAddress) return null;
  const lower = tokenAddress.toLowerCase();
  return STATIC_PRICES[lower] ?? null;
}

/**
 * Get USD price for a token. Tries (in order):
 *   1. Cache (60s TTL)
 *   2. Uniswap V3 QuoterV2 (on-chain quote)
 *   3. Uniswap V2 router getAmountsOut (fallback)
 *   4. Static price table (last resort)
 *
 * @param {string} tokenAddress — ERC-20 token address
 * @param {Object} provider — wallet provider with eth_call (or null for static-only)
 * @param {number} chainId — chain ID (1 = Ethereum, 137 = Polygon, etc.)
 * @returns {Promise<number|null>} — USD price, or null if unknown
 */
export async function getUsdPriceLive(tokenAddress, provider, chainId) {
  if (!tokenAddress) return null;

  // Zero address = native ETH, handled by static.
  if (tokenAddress.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return STATIC_PRICES["0x0000000000000000000000000000000000000000"];
  }

  // Cache check.
  const key = cacheKey(tokenAddress, chainId);
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  // No provider? Go straight to static.
  if (!provider || !provider.request) {
    const price = tryStatic(tokenAddress);
    if (price !== null) cacheSet(key, price);
    return price;
  }

  // Try on-chain quotes.
  let price = await tryUniswapV3(tokenAddress, provider, chainId);
  if (price !== null && price > 0) {
    cacheSet(key, price);
    return price;
  }

  price = await tryUniswapV2(tokenAddress, provider, chainId);
  if (price !== null && price > 0) {
    cacheSet(key, price);
    return price;
  }

  // Last resort: static table.
  price = tryStatic(tokenAddress);
  if (price !== null) cacheSet(key, price);
  return price;
}

/**
 * Synchronous version — only uses static + cache. Use when no provider available.
 */
export function getUsdPriceSync(tokenAddress) {
  if (!tokenAddress) return null;
  const key = cacheKey(tokenAddress, 0);
  const cached = cacheGet(key);
  if (cached !== null) return cached;
  const price = tryStatic(tokenAddress);
  if (price !== null) cacheSet(key, price);
  return price;
}

/**
 * Estimate USD value of a token amount using the most accurate price available.
 * Returns { price, source } so the UI can show "live quote" vs "static estimate".
 */
export async function estimateValueUsdLive(tokenAddress, amountRaw, provider, chainId) {
  const price = await getUsdPriceLive(tokenAddress, provider, chainId);
  if (price === null || amountRaw === null || amountRaw === undefined) {
    return { priceUsd: null, valueUsd: null, source: "unknown" };
  }
  let bn;
  try {
    bn = typeof amountRaw === "bigint" ? amountRaw : BigInt(amountRaw);
  } catch {
    return { priceUsd: null, valueUsd: null, source: "invalid-amount" };
  }
  // Try to detect decimals — most ERC-20s are 18, stables are 6.
  const decimals = guessDecimals(tokenAddress);
  const numTokens = Number(bn) / 10 ** decimals;
  const valueUsd = Math.round(numTokens * price * 100) / 100;

  let source = "static";
  if (provider && provider.request) {
    const key = cacheKey(tokenAddress, chainId);
    if (_cache.has(key)) {
      const entry = _cache.get(key);
      if (Date.now() - entry.ts <= CACHE_TTL_MS) source = "live-or-cached";
    }
  }
  return { priceUsd: price, valueUsd, source };
}

function guessDecimals(tokenAddress) {
  if (!tokenAddress) return 18;
  const lower = tokenAddress.toLowerCase();
  // Known 6-decimal stables
  const sixDec = new Set([
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
    "0x55d398326f99059ff775485246999027b3197955", // USDT BSC
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC Polygon
    "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC Polygon native
    "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"  // DAI Polygon
  ]);
  return sixDec.has(lower) ? 6 : 18;
}

/**
 * Clear the price cache. Useful when user toggles providers or refreshes.
 */
export function clearPriceCache() {
  _cache.clear();
}

/**
 * Get cache statistics for debugging.
 */
export function getPriceCacheStats() {
  return {
    size: _cache.size,
    keys: [..._cache.keys()]
  };
}
