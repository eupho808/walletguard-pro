// test-eip7702.js - Tests for lib/eip7702-detector.js

import {
  EIP7702_TX_TYPE,
  KNOWN_SAFE_DELEGATIONS,
  isEip7702Tx,
  parseAuthorizationList,
  assessEip7702Risk
} from "./lib/eip7702-detector.js";

let passed = 0;
let failed = 0;

function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  // Custom BigInt-safe comparison
  const a = JSON.stringify(actual, (_k, v) => typeof v === 'bigint' ? `__bn:${v.toString()}__` : v);
  const e = JSON.stringify(expected, (_k, v) => typeof v === 'bigint' ? `__bn:${v.toString()}__` : v);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(v, name) { if (v) ok(name); else { console.log(`  FAIL ${name}: expected truthy got ${v}`); failed++; } }
function falsy(v, name)  { if (!v) ok(name); else { console.log(`  FAIL ${name}: expected falsy got ${v}`); failed++; } }

// ---- Constants ----
eq(EIP7702_TX_TYPE, 0x04, "EIP7702_TX_TYPE is 0x04");
ok(`KNOWN_SAFE_DELEGATIONS has ${KNOWN_SAFE_DELEGATIONS.length} entries (>= 10)`);
truthy(KNOWN_SAFE_DELEGATIONS.length >= 10, "known-safe list has >= 10");

// ---- isEip7702Tx ----
falsy(isEip7702Tx(null), "null is not 7702");
falsy(isEip7702Tx(undefined), "undefined is not 7702");
falsy(isEip7702Tx("0x"), "empty hex is not 7702");
falsy(isEip7702Tx("0x02"), "type 0x02 is not 7702");
truthy(isEip7702Tx("0x04"), "type 0x04 hex string is 7702");
truthy(isEip7702Tx("0x04abcdef"), "type 0x04 with calldata is 7702");
truthy(isEip7702Tx({ type: 4 }), "decoded object with type=4 is 7702");
truthy(isEip7702Tx({ type: "0x04" }), "decoded object with type='0x04' is 7702");
truthy(isEip7702Tx({ authorizationList: [] }), "object with authorizationList is 7702");
falsy(isEip7702Tx({ type: 2 }), "type 2 is not 7702");

// ---- parseAuthorizationList ----
const emptyList = parseAuthorizationList([]);
eq(emptyList.length, 0, "empty array parses to empty list");
const nullList = parseAuthorizationList(null);
eq(nullList.length, 0, "null parses to empty list");

const objList = parseAuthorizationList([
  { chainId: 1, address: "0x1111111111111111111111111111111111111111", nonce: 5, y: 0, r: "0xabc", s: "0xdef" },
  { chainId: "0x1", address: "0x2222222222222222222222222222222222222222", nonce: "0x6", y: 1, r: 100n, s: 200n }
]);
eq(objList.length, 2, "two-object list parses to 2 entries");
eq(objList[0].chainId, 1n, "first entry chainId is 1n");
eq(objList[0].address, "0x1111111111111111111111111111111111111111", "first entry address");
eq(objList[0].nonce, 5n, "first entry nonce is 5n");
eq(objList[1].address, "0x2222222222222222222222222222222222222222", "second entry address normalized lowercase");
eq(objList[1].r, 100n, "second entry r parsed as BigInt");

// ---- assessEip7702Risk: empty ----
const emptyResult = assessEip7702Risk([]);
eq(emptyResult.riskLevel, "none", "empty list → none");
truthy(emptyResult.info.some(i => i.type === "empty-authorization-list"), "empty info tag");

// ---- assessEip7702Risk: known-safe ----
const safeResult = assessEip7702Risk([
  { chainId: 1, address: KNOWN_SAFE_DELEGATIONS[0].address, nonce: 0, y: 0, r: 1n, s: 2n }
]);
eq(safeResult.riskLevel, "none", "known-safe delegation → none");
truthy(safeResult.info.some(i => i.type === "known-safe-delegation"), "known-safe info present");

// ---- assessEip7702Risk: unknown contract ----
const unknownResult = assessEip7702Risk([
  { chainId: 1, address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", nonce: 0, y: 0, r: 1n, s: 2n }
]);
truthy(unknownResult.risks.some(r => r.type === "unverified-delegation"), "unknown contract → unverified risk");

// ---- assessEip7702Risk: EOA delegation (no code) ----
const eoaResult = assessEip7702Risk(
  [{ chainId: 1, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", nonce: 0, y: 0, r: 1n, s: 2n }],
  { contractCode: { "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": false } }
);
eq(eoaResult.riskLevel, "critical", "EOA delegation → critical");
truthy(eoaResult.risks.some(r => r.type === "eoa-delegation"), "EOA risk present");

// ---- assessEip7702Risk: chain ID mismatch ----
const chainMismatch = assessEip7702Risk(
  [{ chainId: 137, address: "0x1111111111111111111111111111111111111111", nonce: 0, y: 0, r: 1n, s: 2n }],
  { currentChainId: 1 }
);
eq(chainMismatch.riskLevel, "high", "chain ID mismatch → high");
truthy(chainMismatch.risks.some(r => r.type === "chain-id-mismatch"), "chain mismatch risk present");

// ---- assessEip7702Risk: multi-delegation ----
const multiResult = assessEip7702Risk([
  { chainId: 1, address: "0x1111111111111111111111111111111111111111", nonce: 0, y: 0, r: 1n, s: 2n },
  { chainId: 1, address: "0x2222222222222222222222222222222222222222", nonce: 0, y: 0, r: 1n, s: 2n },
  { chainId: 1, address: "0x3333333333333333333333333333333333333333", nonce: 0, y: 0, r: 1n, s: 2n }
]);
eq(multiResult.riskLevel, "high", "multi-delegation → high");
truthy(multiResult.risks.some(r => r.type === "multi-delegation"), "multi-delegation risk present");

// ---- assessEip7702Risk: future nonce ----
const futureNonce = assessEip7702Risk(
  [{ chainId: 1, address: "0x1111111111111111111111111111111111111111", nonce: 100, y: 0, r: 1n, s: 2n }],
  { accountNonce: 5 }
);
truthy(futureNonce.risks.some(r => r.type === "future-nonce"), "future-nonce risk present");

// ---- assessEip7702Risk: homoglyph ----
const homoglyph = assessEip7702Risk(
  [{ chainId: 1, address: "0xab1234567890abcdef1234567890abcdef123456", nonce: 0, y: 0, r: 1n, s: 2n }],
  { userAddress: "0xab1234567890abcdef1234567890abcdef123456" }
);
// Same address as user = exact match (homoglyph heuristic catches address-spoofing attempts)
truthy(homoglyph.risks.some(r => r.type === "homoglyph-suspect"), "homoglyph risk present for matching prefix/suffix");

// ---- assessEip7702Risk: combined (highest wins) ----
const comboResult = assessEip7702Risk([
  { chainId: 137, address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", nonce: 0, y: 0, r: 1n, s: 2n }
], {
  currentChainId: 1,
  contractCode: { "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": false }
});
eq(comboResult.riskLevel, "critical", "EOA + chain mismatch → critical (max wins)");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
