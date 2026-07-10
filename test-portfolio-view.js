// test-portfolio-view.js - Tests for lib/portfolio-view.js
import assert from "node:assert/strict";
import { computePortfolio, estimateApprovalUsd, formatUsd } from "./lib/portfolio-view.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }

console.log("[estimateApprovalUsd]");
{
  // Static price lookup
  eq(estimateApprovalUsd({ tokenSymbol: "USDC", allowanceFmt: "1000.5" }), 1000.5, "1000.5 USDC = $1000.5");
  eq(estimateApprovalUsd({ tokenSymbol: "WETH", allowanceFmt: "2" }), 6000, "2 WETH = $6000");
  eq(estimateApprovalUsd({ tokenSymbol: "WBTC", allowanceFmt: "0.5" }), 30000, "0.5 WBTC = $30000");
  // Unlimited without balance → null
  eq(estimateApprovalUsd({ tokenSymbol: "USDC", allowanceFmt: "Unlimited", isUnlimited: true }), null, "unlimited → null");
  // Unknown token → null
  eq(estimateApprovalUsd({ tokenSymbol: "OBSCURE", allowanceFmt: "100" }), null, "unknown token → null");
  // Empty / null inputs
  eq(estimateApprovalUsd(null), null, "null → null");
  eq(estimateApprovalUsd({}), null, "empty → null");
  // Blast-radius data takes precedence
  eq(estimateApprovalUsd({ tokenSymbol: "USDC", allowanceFmt: "100", blastRadius: { usdValue: 999 } }), 999, "blast-radius wins");
}

console.log("[formatUsd]");
{
  eq(formatUsd(null), "—", "null → dash");
  eq(formatUsd(0), "$0", "0 → $0");
  eq(formatUsd(0.5), "<$1", "0.5 → <$1");
  eq(formatUsd(50), "$50", "50 → $50");
  eq(formatUsd(999), "$999", "999 → $999");
  eq(formatUsd(1500), "$1.5k", "1500 → $1.5k");
  eq(formatUsd(50000), "$50.0k", "50000 → $50k");
  eq(formatUsd(2500000), "$2.50M", "2.5M → $2.50M");
}

console.log("[computePortfolio — single chain]");
{
  const scan = {
    summary: { total: 3, risky: 1, unlimited: 1 },
    chainId: 1,
    chainName: "Ethereum",
    approvals: [
      { token: "0xUSDC", tokenSymbol: "USDC", spender: "0xs1", allowanceFmt: "100", isUnlimited: false, chainId: 1, chainName: "Ethereum" },
      { token: "0xWETH", tokenSymbol: "WETH", spender: "0xs2", allowanceFmt: "5", isUnlimited: false, chainId: 1, chainName: "Ethereum" },
      { token: "0xUNK", tokenSymbol: "OBSCURE", spender: "0xs3", allowanceFmt: "Unlimited", isUnlimited: true, chainId: 1, chainName: "Ethereum" }
    ]
  };
  const p = computePortfolio(scan);
  truthy(p, "returns portfolio");
  eq(p.totalApprovals, 3, "3 total");
  // 100 USDC = $100 (low), 5 WETH = $15000 (critical), UNK = null. Total = $15100.
  eq(p.totalAtRiskUsd, 15100, "$15.1k at risk");
  eq(p.unlimitedCount, 1, "1 unlimited");
  eq(p.riskyCount, 1, "1 risky (>$10k WETH)");
  eq(p.staleCount, 0, "0 stale");
  eq(p.chains.length, 1, "1 chain breakdown");
  eq(p.chains[0].chainId, 1, "chainId = 1");
  eq(p.chains[0].atRiskUsd, 15100, "chain at risk = $15.1k");
  eq(p.topRisks.length, 3, "3 top risks");
  eq(p.topRisks[0].tokenSymbol, "WETH", "top risk is WETH ($15k)");
  truthy(p.message.includes("3 active"), "message mentions 3 active");
  truthy(p.message.includes("$15,100"), "message mentions $15.1k");
}

console.log("[computePortfolio — multi-chain]");
{
  const scan = {
    summary: { total: 2, risky: 0, unlimited: 0, chainsScanned: 2 },
    chains: [
      { chainId: 1, chainName: "Ethereum", approvals: [
        { token: "0xUSDC", tokenSymbol: "USDC", spender: "0xs1", allowanceFmt: "500", isUnlimited: false, chainId: 1, chainName: "Ethereum" }
      ]},
      { chainId: 137, chainName: "Polygon", approvals: [
        { token: "0xUSDC", tokenSymbol: "USDC", spender: "0xs2", allowanceFmt: "200", isUnlimited: false, chainId: 137, chainName: "Polygon" }
      ]}
    ]
  };
  const p = computePortfolio(scan);
  eq(p.totalApprovals, 2, "2 total across chains");
  eq(p.totalAtRiskUsd, 700, "$700 at risk (500+200)");
  eq(p.chains.length, 2, "2 chain breakdowns");
  eq(p.chains[0].atRiskUsd, 500, "Ethereum $500");
  eq(p.chains[1].atRiskUsd, 200, "Polygon $200");
}

console.log("[computePortfolio — with NFT approvals]");
{
  const scan = {
    summary: { total: 1, risky: 1, unlimited: 0 },
    chainId: 1,
    chainName: "Ethereum",
    approvals: [],
    nftApprovals: [
      { collection: "0xBAYC", tokenName: "BAYC", tokenSymbol: "BAYC", operator: "0xop", spender: "0xop", allowanceFmt: "Full custody", isUnlimited: true, chainId: 1, chainName: "Ethereum" }
    ]
  };
  const p = computePortfolio(scan);
  eq(p.totalApprovals, 1, "1 NFT approval counted");
  eq(p.unlimitedCount, 1, "1 unlimited (NFT)");
}

console.log("[computePortfolio — with blast radius data]");
{
  const scan = {
    summary: { total: 2 },
    chainId: 1,
    chainName: "Ethereum",
    approvals: [
      { token: "0xUSDC", tokenSymbol: "USDC", spender: "0xs1", allowanceFmt: "Unlimited", isUnlimited: true, chainId: 1, chainName: "Ethereum" },
      { token: "0xLINK", tokenSymbol: "LINK", spender: "0xs2", allowanceFmt: "10", chainId: 1, chainName: "Ethereum" }
    ]
  };
  const blastReport = {
    perApproval: [
      { tokenAddress: "0xusdc", spender: "0xs1", chainId: 1, usdValue: 5000 }
    ]
  };
  const p = computePortfolio(scan, { blastRadiusReport: blastReport });
  // USDC unlimited now has blast = $5000. LINK = 10 * $15 = $150.
  eq(p.totalAtRiskUsd, 5150, "$5.15k at risk (5000+150)");
  eq(p.riskyCount, 1, "1 risky (USDC $5k is high)");
}

console.log("[computePortfolio — with stale data]");
{
  const scan = {
    summary: { total: 2 },
    chainId: 1,
    chainName: "Ethereum",
    approvals: [
      { token: "0xUSDC", tokenSymbol: "USDC", spender: "0xs1", allowanceFmt: "100", chainId: 1, chainName: "Ethereum" },
      { token: "0xDAI", tokenSymbol: "DAI", spender: "0xs2", allowanceFmt: "50", chainId: 1, chainName: "Ethereum" }
    ]
  };
  const staleApprovals = [
    { tokenAddress: "0xusdc", spender: "0xs1", chainId: 1, staleLevel: 3, staleLabel: "stale", isStale: true, ageDays: 200 },
    { tokenAddress: "0xdai", spender: "0xs2", chainId: 1, staleLevel: 0, staleLabel: "fresh", isStale: false, ageDays: 10 }
  ];
  const p = computePortfolio(scan, { staleApprovals });
  eq(p.staleCount, 1, "1 stale");
}

console.log("[computePortfolio — empty / null]");
{
  eq(computePortfolio(null), null, "null → null");
  const empty = { summary: { total: 0 }, approvals: [] };
  const p = computePortfolio(empty);
  eq(p.totalApprovals, 0, "empty → 0");
  truthy(p.message.includes("No active"), "empty message");
}

console.log("[computePortfolio — severity counts]");
{
  const scan = {
    summary: { total: 4 },
    chainId: 1,
    chainName: "Ethereum",
    approvals: [
      { tokenSymbol: "WBTC", spender: "0x1", allowanceFmt: "1", chainId: 1, chainName: "Ethereum" }, // $60k = critical
      { tokenSymbol: "WETH", spender: "0x2", allowanceFmt: "1", chainId: 1, chainName: "Ethereum" }, // $3k = high
      { tokenSymbol: "USDC", spender: "0x3", allowanceFmt: "500", chainId: 1, chainName: "Ethereum" }, // $500 = medium
      { tokenSymbol: "USDC", spender: "0x4", allowanceFmt: "5", chainId: 1, chainName: "Ethereum" }    // $5 = low
    ]
  };
  const p = computePortfolio(scan);
  eq(p.severityCounts.critical, 1, "1 critical");
  eq(p.severityCounts.high, 1, "1 high");
  eq(p.severityCounts.medium, 1, "1 medium");
  eq(p.severityCounts.low, 1, "1 low");
}

console.log("[computePortfolio — message variations]");
{
  // All safe
  const safe = computePortfolio({
    summary: { total: 2 },
    chainId: 1, chainName: "Ethereum",
    approvals: [
      { tokenSymbol: "USDC", spender: "0xs1", allowanceFmt: "100", chainId: 1, chainName: "Ethereum" }
    ]
  });
  truthy(safe.message.includes("All safe"), "all-safe message");

  // Risky only
  const risky = computePortfolio({
    summary: { total: 3, risky: 1 },
    chainId: 1, chainName: "Ethereum",
    approvals: [
      { tokenSymbol: "USDC", spender: "0xs1", allowanceFmt: "100", chainId: 1, chainName: "Ethereum" },
      { tokenSymbol: "WBTC", spender: "0xs2", allowanceFmt: "1", chainId: 1, chainName: "Ethereum" }
    ]
  });
  truthy(risky.message.includes("risky"), "risky message");
}

// ============================================================
// BUG FIX REGRESSION TESTS
// ============================================================

console.log("[bug fix: blast-radius key uses tokenAddress, not symbol]");
{
  // Before the fix, lookup used `a.token` (the symbol), which never matched
  // `r.tokenAddress` (the contract address) in the blast-radius report.
  // Now the approval is enriched with blast data → estimateApprovalUsd
  // returns the blast value instead of falling back to static pricing.
  const scan = {
    summary: { total: 1 },
    chainId: 1, chainName: "Ethereum",
    approvals: [{
      tokenSymbol: "USDC",           // symbol (was used as key — wrong)
      tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // contract address
      spender: "0xb0b",
      allowanceFmt: "100",
      chainId: 1,
      chainName: "Ethereum"
    }]
  };
  const blastReport = {
    perApproval: [{
      tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      spender: "0xb0b",
      chainId: 1,
      usdValue: 7777.77
    }]
  };
  const p = computePortfolio(scan, { blastRadiusReport: blastReport });
  eq(p.totalAtRiskUsd, 7777.77, "blast-radius value used (not static price)");
  eq(p.topRisks[0].usd, 7777.77, "top risk carries blast value");
}

console.log("[bug fix: null scanData returns null cleanly]");
{
  // Bug: computePortfolio(null) must return null (not throw)
  eq(computePortfolio(null), null, "null scan → null portfolio");
  eq(computePortfolio(undefined), null, "undefined scan → null portfolio");
}

console.log("[bug fix: computePortfolio handles symbol-only approvals without crashing]");
{
  // Approvals with only tokenSymbol and no tokenAddress should still process
  // (use static price fallback). The key lookup for blast data should not crash.
  const scan = {
    summary: { total: 1 },
    chainId: 1, chainName: "Ethereum",
    approvals: [{
      tokenSymbol: "USDC", // no tokenAddress
      spender: "0xb0b",
      allowanceFmt: "100",
      chainId: 1,
      chainName: "Ethereum"
    }]
  };
  const p = computePortfolio(scan, {
    blastRadiusReport: { perApproval: [{ tokenAddress: "0xDIFFERENT", spender: "0xb0b", chainId: 1, usdValue: 999 }] }
  });
  // Static price fallback: 100 USDC = $100
  eq(p.totalAtRiskUsd, 100, "static fallback used when no tokenAddress match");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Portfolio view working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
