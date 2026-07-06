// test-safe-multisig.js

import {
  SAFE_SINGLETONS,
  EXEC_TX_SELECTOR,
  APPROVE_HASH_SELECTOR,
  detectSafeTransaction,
  decodeExecTransaction,
  extractSafeSignatures,
  assessSafeRisk
} from "./lib/safe-multisig.js";

let passed = 0, failed = 0;
function ok(n) { console.log(`  ok  ${n}`); passed++; }
function eq(a, e, n) { if (JSON.stringify(a) === JSON.stringify(e)) ok(n); else { console.log(`  FAIL ${n}: expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`); failed++; } }
function truthy(v, n) { if (v) ok(n); else { console.log(`  FAIL ${n}: expected truthy got ${v}`); failed++; } }
function falsy(v, n)  { if (!v) ok(n); else { console.log(`  FAIL ${n}: expected falsy got ${v}`); failed++; } }

// ---- Constants ----
truthy(SAFE_SINGLETONS.length >= 2, "Safe singletons registered");
truthy(SAFE_SINGLETONS.some((s) => s.version === "v1.4.1"), "v1.4.1 registered");
truthy(SAFE_SINGLETONS.some((s) => s.version === "v1.3.0"), "v1.3.0 registered");
truthy(EXEC_TX_SELECTOR.startsWith("0x"), "execTx selector defined");
truthy(APPROVE_HASH_SELECTOR.startsWith("0x"), "approveHash selector defined");

// ---- detectSafeTransaction: non-Safe target ----
const r1 = detectSafeTransaction({ to: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", data: "0x095ea7b3" + "00".repeat(64) });
eq(r1.isSafeTx, false, "non-Safe target → not Safe tx");

// ---- detectSafeTransaction: Safe target with approveHash ----
const approveHashData = APPROVE_HASH_SELECTOR + "00".repeat(64);
const r2 = detectSafeTransaction({ to: SAFE_SINGLETONS[0].address, data: approveHashData });
eq(r2.isSafeTx, true, "Safe target → is Safe tx");
eq(r2.isApproveHash, true, "approveHash detected");
falsy(r2.isExecTransaction, "approveHash → not execTransaction");

// ---- detectSafeTransaction: Safe target with execTransaction ----
// Build a minimal execTransaction calldata:
//   execTransaction(address to, uint256 value, bytes data, uint8 operation, ...)
// Layout: 10 static args (320 bytes) + 2 dynamic offsets (already in static)
// then data bytes
const innerData = "0xabcdef"; // arbitrary inner call data
const innerDataLen = (innerData.length - 2) / 2; // 3 bytes
const paddedInner = innerData.slice(2).padEnd(Math.ceil(innerDataLen / 32) * 32, "0");
const toHex = "000000000000000000000000" + "a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const valueHex = "0000000000000000000000000000000000000000000000000de0b6b3a7640000"; // 1 ETH
const dataOffsetHex = "00000000000000000000000000000000000000000000000000000000000000a0"; // 160 (10 * 16)
const operationHex = "0000000000000000000000000000000000000000000000000000000000000000";
const sigsOffsetHex = "0000000000000000000000000000000000000000000000000000000000000160"; // 352
const innerDataLenHex = innerDataLen.toString(16).padStart(64, "0");

const execData = EXEC_TX_SELECTOR +
  toHex +
  valueHex +
  dataOffsetHex +
  operationHex +
  "00".repeat(32 * 5) + // safeTxGas, baseGas, gasPrice, gasToken, refundReceiver (5 * 32 bytes)
  sigsOffsetHex +
  "00".repeat(64) + // signatures length = 0
  innerDataLenHex +
  paddedInner;

const r3 = detectSafeTransaction({ to: SAFE_SINGLETONS[0].address, data: execData });
eq(r3.isSafeTx, true, "Safe target → is Safe tx");
eq(r3.isExecTransaction, true, "execTransaction detected");
truthy(r3.innerCall, "inner call decoded");
eq(r3.innerCall.to, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "inner call target correct");
// value is full 32-byte padded ABI encoding (left-padded with zeros)
eq(r3.innerCall.value, "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000", "inner call value correct (1 ETH, 32-byte padded)");
truthy(r3.innerCall.data && r3.innerCall.data.startsWith("0x"), "inner call data present");

// ---- assessSafeRisk: non-Safe ----
const ar1 = assessSafeRisk({ isSafeTx: false });
eq(ar1.riskLevel, "none", "non-Safe → none");

// ---- assessSafeRisk: approveHash ----
const ar2 = assessSafeRisk({
  isSafeTx: true,
  isApproveHash: true,
  safeVersion: "v1.4.1",
  safeAddress: SAFE_SINGLETONS[0].address
});
eq(ar2.riskLevel, "low", "approveHash → low");
truthy(ar2.recommendations.length > 0, "approveHash has recommendations");

// ---- assessSafeRisk: exec to zero address ----
const ar3 = assessSafeRisk({
  isSafeTx: true,
  isExecTransaction: true,
  safeVersion: "v1.4.1",
  safeAddress: SAFE_SINGLETONS[0].address,
  innerCall: { to: "0x0000000000000000000000000000000000000000", value: "0x0", data: "0x", operation: 0 }
});
truthy(ar3.risks.some((r) => r.type === "safe-exec-to-zero"), "zero-address exec detected");
truthy(["high", "critical"].includes(ar3.riskLevel), "zero-address exec → high+");

// ---- assessSafeRisk: delegate call ----
const ar4 = assessSafeRisk({
  isSafeTx: true,
  isExecTransaction: true,
  safeVersion: "v1.4.1",
  safeAddress: SAFE_SINGLETONS[0].address,
  innerCall: { to: "0xsomecontract", value: "0x0", data: "0x", operation: 1 }
});
truthy(ar4.risks.some((r) => r.type === "safe-delegate-call"), "delegate-call detected");
truthy(["high", "critical"].includes(ar4.riskLevel), "delegate-call → high+");

// ---- assessSafeRisk: 1-of-N threshold warning ----
const ar5 = assessSafeRisk({
  isSafeTx: true,
  isExecTransaction: true,
  safeVersion: "v1.4.1",
  safeAddress: SAFE_SINGLETONS[0].address,
  innerCall: { to: "0xvictim", value: "0x0", data: "0x", operation: 0 }
}, { threshold: 1, ownersCount: 5 });
truthy(ar5.risks.some((r) => r.type === "safe-threshold-1-of-n"), "1-of-N threshold flagged");

// ---- assessSafeRisk: 2-of-3 is safe ----
const ar6 = assessSafeRisk({
  isSafeTx: true,
  isExecTransaction: true,
  safeVersion: "v1.4.1",
  safeAddress: SAFE_SINGLETONS[0].address,
  innerCall: { to: "0xvictim", value: "0x0", data: "0x", operation: 0 }
}, { threshold: 2, ownersCount: 3 });
falsy(ar6.risks.some((r) => r.type === "safe-threshold-1-of-n"), "2-of-3 not flagged");

// ---- decodeExecTransaction: garbage ----
eq(decodeExecTransaction(null), null, "null calldata → null");
eq(decodeExecTransaction("0x"), null, "empty calldata → null");
eq(decodeExecTransaction("0xnothex"), null, "non-hex → null");

// ---- extractSafeSignatures ----
const sigRes = extractSafeSignatures(execData);
eq(sigRes.signerCount, 0, "empty signatures → 0 signers");
const sigRes2 = extractSafeSignatures(null);
eq(sigRes2.signerCount, 0, "null → 0");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
