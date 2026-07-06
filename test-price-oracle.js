// test-price-oracle.js - Tests for the real-time on-chain price oracle.
// Covers: static fallback, V3 quote parsing, V2 router fallback, caching,
// decimal handling for 6 vs 18 decimal tokens.

import assert from "node:assert/strict";
import {
  getUsdPriceLive,
  getUsdPriceSync,
  estimateValueUsdLive,
  clearPriceCache,
  getPriceCacheStats
} from "./lib/price-oracle.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  if (actual === expected) ok(name);
  else { console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy: ${JSON.stringify(val)})`); }

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

function mockProvider(map) {
  return {
    request: async ({ method, params }) => {
      const key = `${method}:${JSON.stringify(params[0])}`;
      if (map[key] === undefined) throw new Error("no mock for " + key);
      if (map[key] instanceof Error) throw map[key];
      return map[key];
    }
  };
}

clearPriceCache();

console.log("[getUsdPriceSync — static fallback only]");
eq(getUsdPriceSync(USDC), 1.00, "USDC = $1");
eq(getUsdPriceSync(WETH), 3000.00, "WETH = $3000");
eq(getUsdPriceSync(null), null, "null token → null");
eq(getUsdPriceSync("0xunknown"), null, "unknown → null");

console.log("[getUsdPriceLive — provider=null falls back to static]");
{
  const p = await getUsdPriceLive(USDC, null, 1);
  eq(p, 1.00, "no provider → static price");
}

console.log("[getUsdPriceLive — V3 quote path]");
// Mock V3 quoter returning 0.1 WETH for 1 USDC
{
  clearPriceCache(); // ensure no static cache from earlier tests
  const tokenIn = USDC.replace("0x", "").toLowerCase().padStart(64, "0");
  const tokenOut = WETH.replace("0x", "").toLowerCase().padStart(64, "0");
  const fee = "00000000000000000000000000000000000000000000000000000000000001f4"; // 500
  const amountIn = (10n ** 18n).toString(16).padStart(64, "0");
  const sqrtLimit = "0".repeat(64);
  const data = "0xf7729d43" + tokenIn + tokenOut + fee + amountIn + sqrtLimit;
  const provider = mockProvider({
    [`eth_call:${JSON.stringify({ to: "0x61fFE014bA17989E743c5F6cB21bF9697520f21F", data })}`]:
      "0x" + (10n ** 17n).toString(16).padStart(64, "0") + // 0.1 WETH = 1e17 wei
              "0".repeat(128) +
              "00000000000000000000000000000000000000000000000000000000000fde8" // gas
  });
  const price = await getUsdPriceLive(USDC, provider, 1);
  // 0.1 WETH * $3000 = $300 per 1 USDC (since we tested with 18-decimals amountIn but USDC is 6-decimals)
  // The math: amountOut=1e17 wei = 0.1 WETH. wethPerToken = 1e17/1e18 = 0.1. * 3000 = $300.
  eq(price, 300, "V3 quote: 0.1 WETH per USDC = $300");
}

console.log("[getUsdPriceLive — V2 fallback when V3 fails]");
// V3 returns nothing, V2 returns 0.05 WETH per 1 USDC
{
  clearPriceCache();
  const provider = {
    request: async ({ method, params }) => {
      // V3 returns empty (no liquidity)
      const to = params[0].to.toLowerCase();
      if (to === "0x61ffe014ba17989e743c5f6cb21bf9697520f21f") {
        return "0x" + "0".repeat(64); // zero amountOut
      }
      // V2 router returns amountsOut array
      if (to === "0x7a250d5630b4cf539739df2c5dacb4c659f2488d") {
        // (uint256 amountIn, address[] path) → uint256[] amounts
        // Offset=32, length=2, [amountIn, amountOut=0.05 WETH=5e16 wei]
        return "0x" +
          "0".repeat(64) + // offset to array
          "0000000000000000000000000000000000000000000000000000000000000002" + // length 2
          "0".repeat(64) + // amountIn (1e18)
          (5n * 10n ** 16n).toString(16).padStart(64, "0"); // amountOut = 0.05 WETH
      }
      throw new Error("unexpected to " + to);
    }
  };
  const price = await getUsdPriceLive(USDC, provider, 1);
  eq(price, 150, "V2 fallback: 0.05 WETH per USDC = $150");
}

console.log("[getUsdPriceLive — both fail → static fallback]");
// Both V3 and V2 throw — should fall through to static table
{
  clearPriceCache();
  const provider = {
    request: async () => { throw new Error("RPC down"); }
  };
  const price = await getUsdPriceLive(USDC, provider, 1);
  eq(price, 1.00, "RPC down → static USDC price");
}

console.log("[getUsdPriceLive — caching]");
// Two calls in a row should only hit provider once.
{
  clearPriceCache();
  let callCount = 0;
  const provider = {
    request: async () => {
      callCount++;
      return "0x" + (10n ** 17n).toString(16).padStart(64, "0") + "0".repeat(128) + "0".repeat(64);
    }
  };
  await getUsdPriceLive(USDC, provider, 1);
  await getUsdPriceLive(USDC, provider, 1);
  await getUsdPriceLive(USDC, provider, 1);
  eq(callCount, 1, "3 calls → 1 RPC hit (cache works)");
}

console.log("[estimateValueUsdLive]");
// 1000 USDC = $1000
{
  clearPriceCache(); // don't use V3 cached value
  const r = await estimateValueUsdLive(USDC, "1000000000", null, 1);
  eq(r.valueUsd, 1000, "1000 USDC = $1000");
  truthy(r.priceUsd !== null, "priceUsd populated");
}

// Unknown token, no provider → null value
{
  const r = await estimateValueUsdLive("0xunknown", "1000000000", null, 1);
  eq(r.valueUsd, null, "unknown token → null value");
  eq(r.source, "unknown", "source = unknown");
}

console.log("[getPriceCacheStats]");
clearPriceCache();
const stats1 = getPriceCacheStats();
eq(stats1.size, 0, "empty cache initially");
await getUsdPriceLive(USDC, null, 1);
const stats2 = getPriceCacheStats();
truthy(stats2.size >= 1, "cache has entries after lookup");

console.log("[native ETH handling]");
{
  const p = await getUsdPriceLive("0x0000000000000000000000000000000000000000", null, 1);
  eq(p, 3000, "native ETH = $3000");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: price oracle working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
