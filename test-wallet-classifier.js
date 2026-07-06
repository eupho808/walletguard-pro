// test-wallet-classifier.js - Tests for lib/wallet-classifier.js
import assert from "node:assert/strict";
import { WALLET_TYPES, classifyWallet, getRulesForType, checkRulesViolation } from "./lib/wallet-classifier.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }

console.log("[classifyWallet — contract]");
{
  const result = classifyWallet({ address: "0xabc", codeAtAddress: true, txCount: 100 });
  eq(result.type, WALLET_TYPES.contract, "contract detected");
  eq(result.confidence, 1.0, "confidence 1.0");
  truthy(result.recommendedRules, "has rules");
}

console.log("[classifyWallet — exchange]");
{
  const binanceAddr = "0x28c6c06298d514db089934071355e5743bf21d60";
  const result = classifyWallet({ address: binanceAddr, txCount: 1000 });
  eq(result.type, WALLET_TYPES.exchange, "Binance detected");
  eq(result.confidence, 1.0, "exchange confidence 1.0");
  // Case-insensitive
  const result2 = classifyWallet({ address: binanceAddr.toUpperCase(), txCount: 1000 });
  eq(result2.type, WALLET_TYPES.exchange, "case-insensitive");
}

console.log("[classifyWallet — fresh]");
{
  const result = classifyWallet({ address: "0xnew", txCount: 3 });
  eq(result.type, WALLET_TYPES.fresh, "fresh detected (3 txs)");
  const result2 = classifyWallet({ address: "0xnew", txCount: 0 });
  eq(result2.type, WALLET_TYPES.fresh, "fresh detected (0 txs)");
}

console.log("[classifyWallet — whale]");
{
  const result = classifyWallet({ address: "0xrich", txCount: 100, balanceEth: 250 });
  eq(result.type, WALLET_TYPES.whale, "whale detected (>100 ETH)");
}

console.log("[classifyWallet — cold storage]");
{
  const NOW = Math.floor(Date.now() / 1000);
  const ONE_DAY = 86400;
  const result = classifyWallet({
    address: "0xcold",
    txCount: 10,
    firstActivityAt: NOW - 800 * ONE_DAY, // 800 days old
    lastActivityAt: NOW - 60 * ONE_DAY,    // 60 days inactive
    balanceEth: 10
  });
  eq(result.type, WALLET_TYPES.cold, "cold storage detected");
}

console.log("[classifyWallet — defi power user]");
{
  const result = classifyWallet({ address: "0xdefi", txCount: 200, uniqueTokens: 75, balanceEth: 5 });
  eq(result.type, WALLET_TYPES.defi, "defi detected (75 tokens)");
}

console.log("[classifyWallet — hot wallet (active)]");
{
  const result = classifyWallet({ address: "0xhot", txCount: 200, uniqueTokens: 10, balanceEth: 1 });
  eq(result.type, WALLET_TYPES.hot, "hot detected (200 txs)");
}

console.log("[classifyWallet — unknown / no data]");
{
  const result = classifyWallet({ address: "0xmid", txCount: 20 });
  eq(result.type, WALLET_TYPES.unknown, "unknown for moderate data");
  const result2 = classifyWallet(null);
  eq(result2.type, WALLET_TYPES.unknown, "null → unknown");
  eq(result2.confidence, 0, "null confidence 0");
  const result3 = classifyWallet({});
  eq(result3.type, WALLET_TYPES.unknown, "no address → unknown");
}

console.log("[classifyWallet — classification priority]");
{
  // Contract takes priority over everything else
  const result = classifyWallet({
    address: "0xcontract",
    codeAtAddress: true,
    txCount: 100000,
    balanceEth: 10000,
    uniqueTokens: 200
  });
  eq(result.type, WALLET_TYPES.contract, "contract beats whale/defi");
  // Exchange takes priority over whale/fresh
  const binanceAddr = "0x28c6c06298d514db089934071355e5743bf21d60";
  const result2 = classifyWallet({ address: binanceAddr, txCount: 0, balanceEth: 500 });
  eq(result2.type, WALLET_TYPES.exchange, "exchange beats fresh/whale");
}

console.log("[getRulesForType]");
{
  const cold = getRulesForType(WALLET_TYPES.cold);
  eq(cold.unlimitedApproval.allowed, false, "cold: no unlimited");
  eq(cold.unlimitedApproval.severity, "high", "cold: high severity");
  eq(cold.largeTx.thresholdEth, 0.1, "cold: 0.1 ETH threshold");
  eq(cold.approvalExpiryDays, 90, "cold: 90 day expiry");

  const whale = getRulesForType(WALLET_TYPES.whale);
  eq(whale.unlimitedApproval.severity, "critical", "whale: critical severity");
  eq(whale.largeTx.thresholdEth, 1.0, "whale: 1 ETH threshold");

  const fresh = getRulesForType(WALLET_TYPES.fresh);
  eq(fresh.requireReapprovalDays, 7, "fresh: 7 day re-approval");
  eq(fresh.largeTx.thresholdEth, 0.05, "fresh: 0.05 ETH threshold");

  const exchange = getRulesForType(WALLET_TYPES.exchange);
  eq(exchange.unlimitedApproval.allowed, false, "exchange: no unlimited");
  eq(exchange.largeTx.thresholdEth, 10.0, "exchange: 10 ETH threshold");

  const contract = getRulesForType(WALLET_TYPES.contract);
  eq(contract.unlimitedApproval.allowed, true, "contract: unlimited allowed");

  const defi = getRulesForType(WALLET_TYPES.defi);
  eq(defi.unlimitedApproval.allowed, true, "defi: unlimited allowed");

  // Default rules for unknown
  const unknown = getRulesForType(WALLET_TYPES.unknown);
  eq(unknown.unlimitedApproval.allowed, false, "unknown: no unlimited");
}

console.log("[checkRulesViolation — unlimited approval]");
{
  const rules = getRulesForType(WALLET_TYPES.cold);
  const classification = { type: WALLET_TYPES.cold };
  // MaxUint256 = unlimited
  const tx = { allowance: (1n << 256n) - 1n };
  const violations = checkRulesViolation(tx, classification, rules);
  truthy(violations, "unlimited cold → violation");
  eq(violations[0].rule, "unlimited-approval", "rule type");
  eq(violations[0].severity, "high", "severity");
  // Allowed type (contract) → no violation
  const contractRules = getRulesForType(WALLET_TYPES.contract);
  const contractViolations = checkRulesViolation(tx, { type: WALLET_TYPES.contract }, contractRules);
  eq(contractViolations, null, "unlimited contract → no violation");
  // Limited approval → no violation
  const limitedTx = { allowance: 1000n };
  eq(checkRulesViolation(limitedTx, classification, rules), null, "limited → no violation");
}

console.log("[checkRulesViolation — large tx]");
{
  const rules = getRulesForType(WALLET_TYPES.fresh);
  const classification = { type: WALLET_TYPES.fresh };
  // 1 ETH = 1e18 wei
  const tx = { value: BigInt("1000000000000000000") }; // 1 ETH
  const violations = checkRulesViolation(tx, classification, rules);
  truthy(violations, "1 ETH on fresh → violation");
  eq(violations[0].rule, "large-tx", "rule type");
  eq(violations[0].severity, "high", "high severity");
  // 0.01 ETH → no violation (below 0.05 threshold)
  const smallTx = { value: BigInt("10000000000000000") };
  eq(checkRulesViolation(smallTx, classification, rules), null, "0.01 ETH → no violation");
}

console.log("[checkRulesViolation — multiple violations]");
{
  const rules = getRulesForType(WALLET_TYPES.fresh);
  const classification = { type: WALLET_TYPES.fresh };
  // Both unlimited AND large
  const tx = { allowance: (1n << 256n) - 1n, value: BigInt("1000000000000000000") };
  const violations = checkRulesViolation(tx, classification, rules);
  eq(violations.length, 2, "two violations");
}

console.log("[checkRulesViolation — string inputs]");
{
  const rules = getRulesForType(WALLET_TYPES.cold);
  const classification = { type: WALLET_TYPES.cold };
  const tx = { allowance: "115792089237316195423570985008687907853269984665640564039457584007913129639935" };
  const violations = checkRulesViolation(tx, classification, rules);
  truthy(violations, "string unlimited → violation");
  const tx2 = { value: "200000000000000000" }; // 0.2 ETH
  const violations2 = checkRulesViolation(tx2, classification, rules);
  truthy(violations2, "string 0.2 ETH > 0.1 threshold → violation");
}

console.log("[checkRulesViolation — edge cases]");
{
  const rules = getRulesForType(WALLET_TYPES.cold);
  const classification = { type: WALLET_TYPES.cold };
  eq(checkRulesViolation(null, classification, rules), null, "null tx → null");
  eq(checkRulesViolation({}, classification, rules), null, "empty tx → null");
  eq(checkRulesViolation({ allowance: 100n }, null, rules), null, "null classification → null");
  eq(checkRulesViolation({ allowance: 100n }, classification, null), null, "null rules → null");
}

console.log("[WALLET_TYPES constant]");
{
  truthy(typeof WALLET_TYPES === "object", "WALLET_TYPES is object");
  truthy(WALLET_TYPES.cold === "cold", "cold type");
  truthy(WALLET_TYPES.whale === "whale", "whale type");
  truthy(WALLET_TYPES.exchange === "exchange", "exchange type");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Wallet classifier working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
