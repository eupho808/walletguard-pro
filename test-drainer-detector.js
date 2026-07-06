// test-drainer-detector.js

import {
  DRAINER_SELECTORS,
  KNOWN_DRAINER_BYTECODES,
  extractSelectors,
  detectDrainerCalldata,
  matchDrainerBytecode
} from "./lib/drainer-detector.js";

let passed = 0, failed = 0;
function ok(n) { console.log(`  ok  ${n}`); passed++; }
function eq(a, e, n) { if (JSON.stringify(a) === JSON.stringify(e)) ok(n); else { console.log(`  FAIL ${n}: expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`); failed++; } }
function truthy(v, n) { if (v) ok(n); else { console.log(`  FAIL ${n}: expected truthy got ${v}`); failed++; } }
function falsy(v, n)  { if (!v) ok(n); else { console.log(`  FAIL ${n}: expected falsy got ${v}`); failed++; } }

// ---- Constants ----
truthy(DRAINER_SELECTORS.length >= 8, `DRAINER_SELECTORS has ${DRAINER_SELECTORS.length} entries`);
truthy(DRAINER_SELECTORS.some((d) => d.selector === "0x095ea7b3"), "approve in list");
truthy(DRAINER_SELECTORS.some((d) => d.selector === "0x23b872dd"), "transferFrom in list");

// ---- extractSelectors ----
eq(extractSelectors("0x").length, 0, "empty calldata yields no selectors");
eq(extractSelectors("0x095ea7b3").length, 1, "single-selector calldata yields 1");
const repeatSel = extractSelectors("0x095ea7b3095ea7b3");
// extractSelectors counts overlapping 4-byte windows
truthy(repeatSel.length >= 2, `repeated selector yields multiple windows (got ${repeatSel.length})`);
truthy(repeatSel.includes("0x095ea7b3"), "selector at offset 0 captured");

// ---- detectDrainerCalldata: no data ----
const r0 = detectDrainerCalldata({ data: "0x" });
eq(r0.riskLevel, "none", "no data → none");

const r1 = detectDrainerCalldata({});
eq(r1.riskLevel, "none", "missing tx → none");

// ---- detectDrainerCalldata: many transfer selectors (drainer pattern) ----
// Build a calldata with 3+ different transfer selectors chained.
const evilData =
  "0x095ea7b3" + "00".repeat(64) +
  "23b872dd" + "00".repeat(64) +
  "42842e0e" + "00".repeat(64);
const r2 = detectDrainerCalldata({ data: evilData, to: "0xtoken", from: "0xuser" });
truthy(r2.risks.some((r) => r.type === "many-transfer-selectors"), "many-transfer-selectors detected");
eq(r2.riskLevel, "high", "many-transfer-selectors escalates to high");

// ---- detectDrainerCalldata: transferFrom with foreign owner ----
const userAddr = "0x1111111111111111111111111111111111111111";
const attackerAddr = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const transferFromData = "0x23b872dd" + "000000000000000000000000" + attackerAddr.slice(2) + "00".repeat(64);
const r3 = detectDrainerCalldata({
  data: transferFromData,
  to: "0xtoken",
  from: userAddr
}, { userAddress: userAddr });
truthy(r3.risks.some((r) => r.type === "transferfrom-with-foreign-owner"), "foreign-owner transferFrom detected");
eq(r3.riskLevel, "critical", "foreign-owner → critical");

// ---- detectDrainerCalldata: setApprovalForAll true ----
const safData = "0xa22cb465" + "000000000000000000000000" + attackerAddr.slice(2) + "0000000000000000000000000000000000000000000000000000000000000001";
const r4 = detectDrainerCalldata({ data: safData, to: "0xnft", from: userAddr });
truthy(r4.risks.some((r) => r.type === "setApprovalForAll-true"), "setApprovalForAll true detected");

// ---- detectDrainerCalldata: permit unlimited ----
// permit(address,address,uint256,uint256,uint8,bytes32,bytes32):
//   owner, spender, value, deadline, v, r, s
// value is the 3rd ABI arg (index 2): position 8 + 2*64 = 136 hex chars
// from end of selector, OR 138 in the data WITH 0x prefix.
// Build a single batch of zeros for owner (128 hex chars) followed by
// the value (f's), no extra zeros in between.
const permitData = "0xd505accf" + "00".repeat(64) + "f".repeat(64) + "00".repeat(64 * 5);
const r5 = detectDrainerCalldata({ data: permitData, to: "0xtoken" });
truthy(r5.risks.some((r) => r.type === "permit-unlimited"), `permit-unlimited detected (risks: ${JSON.stringify(r5.risks.map(x => x.type))})`);
eq(r5.riskLevel, "high", "permit-unlimited → high");

// ---- detectDrainerCalldata: multicall drain ----
const multiCallDrain = "0xac9650d8" + "00".repeat(64) + "095ea7b3" + "00".repeat(64) + "23b872dd" + "00".repeat(64);
const r6 = detectDrainerCalldata({ data: multiCallDrain, to: "0xmulti" });
truthy(r6.risks.some((r) => r.type === "multicall-drain"), "multicall-drain detected");

// ---- detectDrainerCalldata: approve + transferFrom combo ----
const comboData = "0x095ea7b3" + "00".repeat(64) + "23b872dd" + "00".repeat(64);
const r7 = detectDrainerCalldata({ data: comboData, to: "0xtoken" });
truthy(r7.risks.some((r) => r.type === "approve-and-drain"), "approve-and-drain detected");

// ---- matchDrainerBytecode ----
eq(matchDrainerBytecode(null).match, false, "null hash → no match");
eq(matchDrainerBytecode("0xnonsense").match, false, "unknown hash → no match");
eq(KNOWN_DRAINER_BYTECODES.length, 0, "bytecode registry is empty (awaiting seed from feed)");

// ---- detectDrainerCalldata: legit single approve ----
const legitApprove = "0x095ea7b3" + "0000000000000000000000001111111111111111111111111111111111111111" + "0000000000000000000000000000000000000000000000000de0b6b3a7640000";
const r8 = detectDrainerCalldata({ data: legitApprove, to: "0xtoken" });
// 1 ETH approval is not unlimited — should not trigger permit-unlimited
falsy(r8.risks.some((r) => r.type === "permit-unlimited"), "1 ETH approval not flagged as unlimited");
falsy(r8.risks.some((r) => r.type === "many-transfer-selectors"), "single approve not flagged as many-transfers");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
