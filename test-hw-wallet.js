// test-hw-wallet.js

import {
  KNOWN_HW_WALLETS,
  HW_STRICT_RULES,
  detectHardwareWallet,
  applyHwRules,
  confirmOnDeviceText
} from "./lib/hw-wallet.js";

let passed = 0, failed = 0;
function ok(n) { console.log(`  ok  ${n}`); passed++; }
function eq(a, e, n) { if (JSON.stringify(a) === JSON.stringify(e)) ok(n); else { console.log(`  FAIL ${n}: expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`); failed++; } }
function truthy(v, n) { if (v) ok(n); else { console.log(`  FAIL ${n}: expected truthy got ${v}`); failed++; } }
function falsy(v, n)  { if (!v) ok(n); else { console.log(`  FAIL ${n}: expected falsy got ${v}`); failed++; } }

// ---- Constants ----
truthy(KNOWN_HW_WALLETS.length >= 5, `KNOWN_HW_WALLETS has ${KNOWN_HW_WALLETS.length} vendors`);
truthy(KNOWN_HW_WALLETS.some((h) => h.name === "Ledger"), "Ledger registered");
truthy(KNOWN_HW_WALLETS.some((h) => h.name === "Trezor"), "Trezor registered");
truthy(KNOWN_HW_WALLETS.some((h) => h.name === "Keystone"), "Keystone registered");
truthy(HW_STRICT_RULES.length >= 5, `HW_STRICT_RULES has ${HW_STRICT_RULES.length} rules`);

// ---- detectHardwareWallet: no provider ----
const r0 = detectHardwareWallet(null);
eq(r0.isHardware, false, "null provider → not hardware");
eq(r0.vendor, null, "null provider → no vendor");

const r1 = detectHardwareWallet(undefined);
eq(r1.isHardware, false, "undefined provider → not hardware");

const r2 = detectHardwareWallet({});
eq(r2.isHardware, false, "empty provider → not hardware");

// ---- detectHardwareWallet: via flag ----
const ledger = detectHardwareWallet({ isLedger: true });
eq(ledger.isHardware, true, "Ledger flag detected");
eq(ledger.vendor, "Ledger", "Ledger vendor");
eq(ledger.details.method, "flag", "detection method = flag");

const trezor = detectHardwareWallet({ isTrezor: true });
eq(trezor.vendor, "Trezor", "Trezor via flag");

const keystone = detectHardwareWallet({ isKeystone: true });
eq(keystone.vendor, "Keystone", "Keystone via flag");

// ---- detectHardwareWallet: via info.name ----
const ledgerInfo = detectHardwareWallet({ info: { name: "Ledger Live" } });
eq(ledgerInfo.isHardware, true, "Ledger via info.name");
eq(ledgerInfo.vendor, "Ledger", "Ledger vendor via info.name");

const trezorInfo = detectHardwareWallet({ info: { name: "Trezor Suite" } });
eq(trezorInfo.vendor, "Trezor", "Trezor via info.name");

const gridPlusInfo = detectHardwareWallet({ info: { name: "GridPlus Lattice" } });
eq(gridPlusInfo.vendor, "GridPlus", "GridPlus via info.name");

// ---- detectHardwareWallet: via name (legacy) ----
const oldProvider = detectHardwareWallet({ name: "Trezor Bridge" });
eq(oldProvider.isHardware, true, "Trezor via name (legacy)");
eq(oldProvider.vendor, "Trezor", "Trezor vendor via name");

// ---- applyHwRules: not hardware ----
const r3 = applyHwRules({}, { isHardware: false });
eq(r3.triggers.length, 0, "no triggers when not hardware");
eq(r3.escalatedRiskLevel, null, "no escalation when not hardware");

// ---- applyHwRules: unlimited approval ----
const r4 = applyHwRules({
  data: "0x095ea7b3" + "00".repeat(24) + "1111111111111111111111111111111111111111" + "f".repeat(64)
}, { isHardware: true, vendor: "Ledger" });
truthy(r4.triggers.some((t) => t.id === "hw-no-unlimited-approvals"), "unlimited approval triggers HW rule");
truthy(["high", "critical"].includes(r4.escalatedRiskLevel), "unlimited → escalated risk");

// ---- applyHwRules: legit 1 ETH approval ----
const r5 = applyHwRules({
  data: "0x095ea7b3" + "00".repeat(24) + "1111111111111111111111111111111111111111" + "0000000000000000000000000000000000000000000000000de0b6b3a7640000"
}, { isHardware: true });
falsy(r5.triggers.some((t) => t.id === "hw-no-unlimited-approvals"), "1 ETH approval does not trigger");

// ---- applyHwRules: setApprovalForAll ----
const r6 = applyHwRules({
  data: "0xa22cb465" + "00".repeat(24) + "1111111111111111111111111111111111111111" + "0".repeat(64)
}, { isHardware: true });
truthy(r6.triggers.some((t) => t.id === "hw-no-setapprovalforall-to-new-operator"), "setApprovalForAll triggers HW rule");

// ---- applyHwRules: EIP-7702 critical ----
const r7 = applyHwRules({
  eip7702Result: { riskLevel: "critical" }
}, { isHardware: true });
truthy(r7.triggers.some((t) => t.id === "hw-no-eip7702-delegation"), "EIP-7702 triggers HW rule");
eq(r7.escalatedRiskLevel, "critical", "EIP-7702 → critical");

// ---- applyHwRules: high value to new contract ----
const r8 = applyHwRules({
  data: "0x",
  value: "0x16345785d8a0000", // 0.1 ETH
  isNewContract: false
}, { isHardware: true });
falsy(r8.triggers.some((t) => t.id === "hw-no-high-value-to-new-contract"), "0.1 ETH to known contract → no trigger");

const r9 = applyHwRules({
  data: "0x",
  value: "0xde0b6b3a7640000", // 1 ETH
  isNewContract: true
}, { isHardware: true });
truthy(r9.triggers.some((t) => t.id === "hw-no-high-value-to-new-contract"), "1 ETH to new contract triggers");

// ---- applyHwRules: session keys ----
const r10 = applyHwRules({
  sessionKeyResult: { riskLevel: "high" }
}, { isHardware: true });
truthy(r10.triggers.some((t) => t.id === "hw-no-session-keys"), "session keys trigger HW rule");

// ---- confirmOnDeviceText ----
eq(confirmOnDeviceText("Ledger"), "Verify the transaction details on your Ledger device screen. The signature never leaves the hardware wallet until you confirm on-device.", "Ledger confirm text");
eq(confirmOnDeviceText(null), "Verify the transaction details on your hardware wallet screen.", "generic confirm text");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
