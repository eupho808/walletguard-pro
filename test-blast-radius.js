// test-blast-radius.js - Tests for the WORLD-FIRST blast-radius calculator.
// Covers: per-approval blast, aggregate USD totals, severity classification,
// chain breakdown, ranking, and edge cases (unknown prices, zero balance,
// unlimited approvals).

import assert from "node:assert/strict";
import {
  blastRadiusForApproval,
  aggregateBlastRadius,
  rankByBlastRadius,
  getUsdPrice,
  estimateValueUsd
} from "./lib/blast-radius.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  if (actual === expected) ok(name);
  else { console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy: ${JSON.stringify(val)})`); }

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const UNKNOWN = "0x1234567890123456789012345678901234567890";

console.log("[getUsdPrice]");
eq(getUsdPrice(USDC), 1.00, "USDC price is $1");
eq(getUsdPrice(WETH), 3000.00, "WETH price is $3000");
eq(getUsdPrice(UNKNOWN), null, "Unknown token returns null");
eq(getUsdPrice(null), null, "null token returns null");

console.log("[estimateValueUsd]");
eq(estimateValueUsd(USDC, "1000000000"), 1000, "1000 USDC = $1000");
eq(estimateValueUsd(WETH, "1000000000000000000"), 3000, "1 WETH = $3000");
eq(estimateValueUsd(UNKNOWN, "1000000000000000000"), null, "Unknown token = null USD");
eq(estimateValueUsd(USDC, "0"), 0, "0 balance = $0");

console.log("[blastRadiusForApproval] — per-approval");

// Unlimited USDC approval, 1000 USDC balance → blast $1000
{
  const approval = {
    tokenAddress: USDC,
    spender: "0xSpender",
    allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // max uint256
    balance: "1000000000" // 1000 USDC (6 decimals)
  };
  const r = blastRadiusForApproval(approval);
  eq(r.atRiskUsd, 1000, "unlimited approval: blast = balance = $1000");
  eq(r.isUnlimited, true, "isUnlimited true");
  eq(r.severity, "medium", "severity medium ($1000)");
  truthy(r.atRiskTokens.startsWith("1000"), `atRiskTokens starts with 1000: ${r.atRiskTokens}`);
}

// Limited approval: 500 USDC, balance 1000 → blast $500
{
  const approval = {
    tokenAddress: USDC,
    spender: "0xSpender",
    allowance: "500000000", // 500 USDC
    balance: "1000000000"  // 1000 USDC
  };
  const r = blastRadiusForApproval(approval);
  eq(r.atRiskUsd, 500, "limited approval: blast = allowance = $500");
  eq(r.isUnlimited, false, "isUnlimited false");
}

// Limited approval: 2000 USDC, balance 1000 → blast $1000 (capped by balance)
{
  const approval = {
    tokenAddress: USDC,
    spender: "0xSpender",
    allowance: "2000000000",
    balance: "1000000000"
  };
  const r = blastRadiusForApproval(approval);
  eq(r.atRiskUsd, 1000, "limited approval > balance: blast = balance = $1000");
}

// Zero balance → zero blast
{
  const approval = {
    tokenAddress: USDC,
    spender: "0xSpender",
    allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    balance: "0"
  };
  const r = blastRadiusForApproval(approval);
  eq(r.atRiskUsd, 0, "zero balance: blast = 0");
  eq(r.severity, "none", "severity none");
}

// Unknown token — no USD value but still computed
{
  const approval = {
    tokenAddress: UNKNOWN,
    spender: "0xSpender",
    allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    balance: "1000000000000000000"
  };
  const r = blastRadiusForApproval(approval);
  eq(r.atRiskUsd, null, "unknown token: USD = null");
  eq(r.priceKnown, false, "priceKnown false");
  eq(r.severity, "unknown", "severity unknown");
}

// Critical severity: >$10k at risk
{
  const approval = {
    tokenAddress: WETH,
    spender: "0xSpender",
    allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    balance: "10000000000000000000" // 10 WETH
  };
  const r = blastRadiusForApproval(approval);
  eq(r.atRiskUsd, 30000, "10 WETH unlimited = $30k");
  eq(r.severity, "critical", "severity critical (>$10k)");
}

// Low severity: $50
{
  const approval = {
    tokenAddress: USDC,
    spender: "0xSpender",
    allowance: "50000000", // 50 USDC
    balance: "50000000"
  };
  const r = blastRadiusForApproval(approval);
  eq(r.atRiskUsd, 50, "50 USDC = $50");
  eq(r.severity, "low", "severity low (<$100)");
}

// High severity: $5k
{
  const approval = {
    tokenAddress: USDC,
    spender: "0xSpender",
    allowance: "5000000000", // 5000 USDC
    balance: "5000000000"
  };
  const r = blastRadiusForApproval(approval);
  eq(r.severity, "high", "severity high ($1000-$10k)");
}

console.log("[blastRadiusForApproval] — edge cases");
eq(blastRadiusForApproval(null), null, "null approval returns null");
eq(blastRadiusForApproval({}), null, "empty approval returns null");
{
  const r = blastRadiusForApproval({
    tokenAddress: USDC,
    spender: "0xSpender",
    allowance: "notanumber",
    balance: "1000000000"
  });
  eq(r, null, "invalid allowance BigInt returns null");
}

console.log("[aggregateBlastRadius]");
{
  const approvals = [
    { tokenAddress: USDC, spender: "0xA", allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", balance: "5000000000", chainId: 1 }, // 5000 USDC
    { tokenAddress: WETH, spender: "0xB", allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", balance: "2000000000000000000", chainId: 1 }, // 2 WETH
    { tokenAddress: USDC, spender: "0xC", allowance: "100000000", balance: "100000000", chainId: 137 } // 100 USDC on Polygon
  ];
  const report = aggregateBlastRadius(approvals);
  eq(report.totalAtRiskUsd, 5000 + 6000 + 100, "total = 5000 + 6000 + 100 = 11100");
  eq(report.totalApprovals, 3, "totalApprovals = 3");
  eq(report.perChain[1].count, 2, "chain 1 has 2 approvals");
  eq(report.perChain[137].count, 1, "chain 137 has 1 approval");
  eq(report.perChain[137].atRiskUsd, 100, "chain 137 at risk = $100");
  truthy(report.perApproval.length === 3, "perApproval has 3 entries");
  truthy(report.summary.includes("3 approvals"), `summary mentions count: ${report.summary}`);
}

{
  const approvals = [
    { tokenAddress: WETH, spender: "0xA", allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", balance: "20000000000000000000", chainId: 1 } // 20 WETH
  ];
  const report = aggregateBlastRadius(approvals);
  eq(report.criticalCount, 1, "1 critical");
  truthy(report.summary.includes("critical"), "summary mentions critical");
}

{
  const approvals = [];
  const report = aggregateBlastRadius(approvals);
  eq(report.totalApprovals, 0, "empty approvals");
  eq(report.summary, "No active approvals.", "empty summary");
  eq(report.totalAtRiskUsd, 0, "empty total = 0");
}

console.log("[rankByBlastRadius]");
{
  const approvals = [
    { tokenAddress: USDC, spender: "0xLow", allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", balance: "50000000", chainId: 1 },   // $50
    { tokenAddress: USDC, spender: "0xCrit", allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", balance: "50000000000", chainId: 1 },  // $50k
    { tokenAddress: USDC, spender: "0xMed", allowance: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", balance: "500000000", chainId: 1 }     // $500
  ];
  const ranked = rankByBlastRadius(approvals);
  eq(ranked.length, 3, "ranked has 3 entries");
  eq(ranked[0].blast.spender, "0xCrit", "top is critical $50k");
  eq(ranked[2].blast.spender, "0xLow", "bottom is $50");
  truthy(ranked[0].score > ranked[2].score, "scores descend");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: blast-radius calculator world-first feature working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
