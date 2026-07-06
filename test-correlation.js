// test-correlation.js - Tests for the WORLD-FIRST cross-approval correlation engine.
// Covers: same-deployer clustering, same-week deployment, stacked approvals,
// converging flow detection, and aggregate report generation.

import assert from "node:assert/strict";
import {
  groupByDeployer,
  groupByDeployWeek,
  findStackedApprovals,
  findConvergingFlow,
  correlateApprovals
} from "./lib/correlation.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  if (actual === expected) ok(name);
  else { console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}
function truthy(val, name) {
  if (val) ok(name);
  else { console.log(`  FAIL ${name}: got falsy ${JSON.stringify(val)}`); failed++; }
}

const NOW = Math.floor(Date.now() / 1000);
const ONE_WEEK = 7 * 24 * 60 * 60;

console.log("[groupByDeployer]");
// Multiple approvals to contracts deployed by same EOA
{
  const approvals = [
    { tokenAddress: "0xUSDC", spender: "0xA", deployer: "0xDeployer1", chainId: 1 },
    { tokenAddress: "0xUSDT", spender: "0xB", deployer: "0xDeployer1", chainId: 1 },
    { tokenAddress: "0xDAI", spender: "0xC", deployer: "0xDeployer2", chainId: 1 }
  ];
  const groups = groupByDeployer(approvals);
  eq(Object.keys(groups).length, 1, "1 suspicious group (Deployer1)");
  eq(groups["0xdeployer1"].length, 2, "Deployer1 has 2 approvals");
  eq(groups["0xdeployer2"], undefined, "Deployer2 has only 1 (not suspicious)");
}

// No duplicates → empty
{
  const groups = groupByDeployer([
    { spender: "0xA", deployer: "0xD1" },
    { spender: "0xB", deployer: "0xD2" }
  ]);
  eq(Object.keys(groups).length, 0, "no duplicates → no groups");
}

console.log("[groupByDeployWeek]");
// 3+ approvals deployed in same week (use same-day timestamps for guaranteed match)
{
  const approvals = [
    { spender: "0xA", deployedAt: NOW },
    { spender: "0xB", deployedAt: NOW },
    { spender: "0xC", deployedAt: NOW }
  ];
  const groups = groupByDeployWeek(approvals);
  truthy(Object.keys(groups).length >= 1, "at least 1 week-cluster");
  const weekKey = Object.keys(groups)[0];
  eq(groups[weekKey].length, 3, "3 approvals in same week");
}

// Only 2 in same week → not suspicious
{
  const groups = groupByDeployWeek([
    { spender: "0xA", deployedAt: NOW },
    { spender: "0xB", deployedAt: NOW }
  ]);
  eq(Object.keys(groups).length, 0, "only 2 → not suspicious");
}

console.log("[findStackedApprovals]");
// Same (token, spender, chain) approved twice
{
  const stacked = findStackedApprovals([
    { tokenAddress: "0xUSDC", spender: "0xA", chainId: 1 },
    { tokenAddress: "0xUSDC", spender: "0xA", chainId: 1 },  // duplicate
    { tokenAddress: "0xUSDC", spender: "0xB", chainId: 1 }   // different spender
  ]);
  eq(stacked.length, 1, "1 stacked pair found");
  eq(stacked[0].first.spender, "0xA", "first approval");
  eq(stacked[0].duplicate.spender, "0xA", "duplicate approval");
}

{
  const stacked = findStackedApprovals([
    { tokenAddress: "0xUSDC", spender: "0xA", chainId: 1 },
    { tokenAddress: "0xUSDC", spender: "0xA", chainId: 137 }  // different chain → OK
  ]);
  eq(stacked.length, 0, "different chain → not stacked");
}

console.log("[findConvergingFlow]");
// Multiple chains to same spender = converging
{
  const converging = findConvergingFlow([
    { spender: "0xA", chainId: 1, atRiskUsd: 1000 },
    { spender: "0xA", chainId: 137, atRiskUsd: 500 },
    { spender: "0xB", chainId: 1, atRiskUsd: 100 }
  ]);
  eq(converging.length, 1, "1 converging spender (0xA across chains)");
  eq(converging[0].spender, "0xA", "converging is 0xA");
  eq(converging[0].chains.length, 2, "spans 2 chains");
}

// High blast radius single-chain
{
  const converging = findConvergingFlow([
    { spender: "0xRich", chainId: 1, atRiskUsd: 50000 }
  ]);
  eq(converging.length, 1, "high blast radius flagged");
}

console.log("[correlateApprovals] — full report");
// Multi-vector drainer kit: same deployer, same week, stacked, converging
{
  const report = correlateApprovals([
    { tokenAddress: "0xUSDC", spender: "0xA", deployer: "0xKitty", deployedAt: NOW, chainId: 1, atRiskUsd: 5000 },
    { tokenAddress: "0xUSDT", spender: "0xB", deployer: "0xKitty", deployedAt: NOW - 86400, chainId: 1, atRiskUsd: 3000 },
    { tokenAddress: "0xUSDC", spender: "0xA", deployer: "0xKitty", deployedAt: NOW, chainId: 137, atRiskUsd: 2000 }
  ]);
  truthy(report.findings.length >= 2, `multiple findings: ${report.findings.length}`);
  truthy(report.riskScore >= 30, `high risk score: ${report.riskScore}`);
  truthy(report.summary.includes("correlation"), `summary mentions correlation: ${report.summary}`);
  truthy(report.hasHighRiskFindings, "has high-risk findings");
}

// Clean approvals: no correlation
{
  const report = correlateApprovals([
    { tokenAddress: "0xUSDC", spender: "0xA", deployer: "0xD1", deployedAt: NOW - 365 * 86400, chainId: 1, atRiskUsd: 50 },
    { tokenAddress: "0xUSDT", spender: "0xB", deployer: "0xD2", deployedAt: NOW - 200 * 86400, chainId: 1, atRiskUsd: 100 }
  ]);
  eq(report.findings.length, 0, "clean approvals → no findings");
  eq(report.summary, "No correlated risk patterns detected.", "clean summary");
  eq(report.hasHighRiskFindings, false, "no high-risk");
}

// Empty approvals
{
  const report = correlateApprovals([]);
  eq(report.findings.length, 0, "empty → no findings");
  eq(report.riskScore, 0, "empty → 0 risk score");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: correlation engine world-first feature working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
