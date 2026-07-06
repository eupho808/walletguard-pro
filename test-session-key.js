// test-session-key.js - Tests for lib/session-key-analyzer.js

import {
  MAX_UINT256,
  MAX_UINT256_HEX,
  ZERO_ADDRESS,
  PERMISSION_RPC_METHODS,
  KNOWN_SAFE_PROTOCOLS,
  isPermissionRequest,
  parsePermissions,
  analyzeSession
} from "./lib/session-key-analyzer.js";

let passed = 0;
let failed = 0;

function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  if (actual === expected) ok(name);
  else { console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}
function truthy(v, name) { if (v) ok(name); else { console.log(`  FAIL ${name}: expected truthy got ${v}`); failed++; } }
function falsy(v, name)  { if (!v) ok(name); else { console.log(`  FAIL ${name}: expected falsy got ${v}`); failed++; } }

// ---- Constants ----
eq(MAX_UINT256 > 0n, true, "MAX_UINT256 is positive bigint");
eq(MAX_UINT256_HEX.length, 66, "MAX_UINT256_HEX is 0x + 64 chars");
eq(ZERO_ADDRESS, "0x0000000000000000000000000000000000000000", "ZERO_ADDRESS");
ok(`PERMISSION_RPC_METHODS has ${PERMISSION_RPC_METHODS.length} methods`);
truthy(PERMISSION_RPC_METHODS.includes("wallet_grantPermissions"), "wallet_grantPermissions in list");
truthy(KNOWN_SAFE_PROTOCOLS.length >= 5, "KNOWN_SAFE_PROTOCOLS has >= 5");

// ---- isPermissionRequest ----
falsy(isPermissionRequest(null), "null is not a permission request");
falsy(isPermissionRequest("not json"), "non-JSON string is not");
falsy(isPermissionRequest({ method: "eth_sendTransaction" }), "regular tx is not");

truthy(isPermissionRequest({ method: "wallet_grantPermissions", params: [] }), "wallet_grantPermissions is detected");
truthy(isPermissionRequest({ method: "wallet_sendCalls" }), "wallet_sendCalls is detected");
truthy(isPermissionRequest({ method: "wallet_getPermissions" }), "wallet_getPermissions is detected");
truthy(isPermissionRequest({ method: "wallet_revokePermissions" }), "wallet_revokePermissions is detected");
truthy(isPermissionRequest({ permissions: {} }), "direct permissions object is detected");
truthy(isPermissionRequest([{ method: "wallet_grantPermissions", params: [] }]), "batch detected");

// JSON string
truthy(isPermissionRequest('{"method":"wallet_grantPermissions","params":[{}]}'), "JSON string detected");
falsy(isPermissionRequest('{"method":"eth_chainId"}'), "regular JSON-RPC not detected");

// ---- parsePermissions ----
const parsed = parsePermissions({
  method: "wallet_grantPermissions",
  params: [{
    address: "0x" + "ab".repeat(20),
    chainId: 1,
    expiry: 1234567890,
    permissions: {
      contractAccess: ["0x1234"],
      nativeTokenLimit: "1000000000000000000",
      erc20TokenLimit: {},
      interval: 60
    }
  }]
});
truthy(parsed !== null, "parsePermissions returns non-null for valid input");
eq(parsed.address, "0x" + "ab".repeat(20), "address preserved");
eq(parsed.chainId, 1, "chainId parsed");
eq(parsed.expiry, 1234567890n, "expiry as BigInt");

const missing = parsePermissions({ method: "eth_sendTransaction" });
eq(missing, null, "non-permission returns null");

// ---- analyzeSession: baseline (none) ----
const baseline = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 1,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n, // 1 hour from now
  permissions: {
    contractAccess: ["0x" + "aa".repeat(20)],
    nativeTokenLimit: "1000000000000000000",
    erc20TokenLimit: {},
    interval: 60
  }
});
eq(baseline.riskLevel, "none", "well-scoped session → none");
truthy(baseline.recommendations.length > 0, "baseline has recommendations");

// ---- analyzeSession: zero address ----
const zeroAddr = analyzeSession({
  address: ZERO_ADDRESS,
  chainId: 1,
  expiry: 0n,
  permissions: { contractAccess: ["0xa"] }
});
eq(zeroAddr.riskLevel, "critical", "zero address signer → critical");
truthy(zeroAddr.risks.some(r => r.type === "zero-address-signer"), "zero-address risk present");

// ---- analyzeSession: no expiry ----
const noExp = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 1,
  expiry: 0n,
  permissions: { contractAccess: ["0xa"] }
});
truthy(noExp.risks.some(r => r.type === "no-expiry"), "no-expiry risk present");
truthy(["critical", "high", "medium"].includes(noExp.riskLevel), "no-expiry escalates risk");

// ---- analyzeSession: wildcard contract access ----
const wild = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 1,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  permissions: { contractAccess: ["*"] }
});
eq(wild.riskLevel, "critical", "wildcard contract access → critical");
truthy(wild.risks.some(r => r.type === "wildcard-contract-access"), "wildcard risk present");

// ---- analyzeSession: unlimited native limit ----
const unlimNative = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 1,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  permissions: { contractAccess: ["0xa"], nativeTokenLimit: MAX_UINT256_HEX }
});
truthy(unlimNative.risks.some(r => r.type === "unlimited-native-limit"), "unlimited native limit detected");

// ---- analyzeSession: unlimited ERC-20 limit ----
const unlimErc20 = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 1,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  permissions: {
    contractAccess: ["0xa"],
    erc20TokenLimit: { "0xUSDC": MAX_UINT256_HEX }
  }
});
truthy(unlimErc20.risks.some(r => r.type === "unlimited-erc20-limit"), "unlimited ERC-20 detected");

// ---- analyzeSession: empty contract access ----
const emptyCA = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 1,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  permissions: { contractAccess: [] }
});
truthy(emptyCA.risks.some(r => r.type === "empty-contract-access"), "empty contract access detected");

// ---- analyzeSession: no rate limit ----
const noRate = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 1,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  permissions: { contractAccess: ["0xa"], interval: 0 }
});
truthy(noRate.risks.some(r => r.type === "no-rate-limit"), "no rate limit detected");

// ---- analyzeSession: any-chain ----
const anyChain = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 0,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  permissions: { contractAccess: ["0xa"] }
});
truthy(anyChain.risks.some(r => r.type === "any-chain"), "any-chain detected");

// ---- analyzeSession: known-safe origin downgrades risk ----
const safeOrigin = analyzeSession({
  address: "0x" + "11".repeat(20),
  chainId: 0,
  expiry: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
  permissions: { contractAccess: ["0xa"] }
}, { origin: "https://app.uniswap.org" });
eq(safeOrigin.riskLevel, "low", "known-safe origin downgrades any-chain → low");
truthy(safeOrigin.info.some(i => i.type === "known-safe-protocol"), "known-safe info present");

// ---- analyzeSession: 5 critical red flags → critical ----
const horror = analyzeSession({
  address: ZERO_ADDRESS,
  chainId: 0,
  expiry: 0n,
  permissions: {
    contractAccess: ["*"],
    nativeTokenLimit: MAX_UINT256_HEX,
    erc20TokenLimit: { "0xUSDC": MAX_UINT256_HEX },
    interval: 0
  }
});
eq(horror.riskLevel, "critical", "5 critical flags → critical");
truthy(horror.risks.length >= 5, "horror has 5+ risks");
eq(horror.summary.includes("attack"), true, "summary mentions attack");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
