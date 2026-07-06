// test-new-features.js - Regression tests for v3.3 additions.
//
// Covers:
//   - 4 new L2 chains in MULTICHAIN_RPCS (zkSync, Linea, Blast, Mode)
//   - SEED_BLACKLIST / SEED_BLACKLIST_DOMAINS / SEED_BLACKLIST_SELECTORS
//     wired into the risk engine
//   - Risk engine produces "Known-Bad Address" factor for blacklisted addresses
//   - Risk engine produces "Known-Bad Domain" factor for blacklisted hostnames
//   - Risk engine produces "Known-Bad Selector" factor for blacklisted selectors

import assert from "node:assert";
import fs from "node:fs";

import {
  SEED_BLACKLIST,
  SEED_BLACKLIST_DOMAINS,
  SEED_BLACKLIST_SELECTORS
} from "./lib/constants.js";
import { computeRisk } from "./lib/risk-engine.js";

let passed = 0, failed = 0;
const failures = [];

function it(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(".");
  } catch (e) {
    failed++;
    failures.push({ name, err: e });
    process.stdout.write("F");
  }
}
function section(t) { process.stdout.write("\n  " + t + "\n  "); }

function readFile(path) {
  return fs.readFileSync(path, "utf8");
}

// ============================================================
section("4 new L2 chains (zkSync, Linea, Blast, Mode)");

it("CHAIN_NAMES has all 4 new L2s", () => {
  // Mirror the CHAIN_NAMES export object shape - it lives inside the IIFE
  // in content.js but we re-declare the same structure here for direct testing.
  const expected = {
    324: { name: "zkSync Era" },
    59144: { name: "Linea" },
    81457: { name: "Blast" },
    34443: { name: "Mode" }
  };
  // We can only test this via source because CHAIN_NAMES is private.
  const src = readFile("approval-scanner.js");
  for (const [id, info] of Object.entries(expected)) {
    const re = new RegExp(`"0x${Number(id).toString(16)}"\\s*:\\s*\\{\\s*name:\\s*"${info.name}"`);
    assert(re.test(src), `CHAIN_NAMES missing or wrong for chain ${id}: expected ${info.name}`);
  }
});

it("MULTICHAIN_RPCS has all 4 new L2s with valid https URLs", () => {
  const src = readFile("approval-scanner.js");
  const expectedRpcs = [
    "mainnet.era.zksync.io",
    "rpc.linea.build",
    "rpc.blast.io",
    "mainnet.mode.network"
  ];
  for (const host of expectedRpcs) {
    const re = new RegExp(`https://${host.replace(/\./g, "\\.")}`);
    assert(re.test(src), `MULTICHAIN_RPCS missing https://${host}`);
  }
});

it("CHAIN_LOOKBACK has entries for all 4 new L2s", () => {
  const src = readFile("approval-scanner.js");
  for (const id of [324, 59144, 81457, 34443]) {
    const re = new RegExp(`\\b${id}\\s*:\\s*\\d+n`);
    assert(re.test(src), `CHAIN_LOOKBACK missing for chain ${id}`);
  }
});

// ============================================================
section("SEED_BLACKLIST shapes (Set for O(1) lookup)");

it("SEED_BLACKLIST is a Set", () => {
  assert(SEED_BLACKLIST instanceof Set, `SEED_BLACKLIST is ${typeof SEED_BLACKLIST}, expected Set`);
});

it("SEED_BLACKLIST_DOMAINS is a Set", () => {
  assert(SEED_BLACKLIST_DOMAINS instanceof Set);
});

it("SEED_BLACKLIST_SELECTORS is a Set", () => {
  assert(SEED_BLACKLIST_SELECTORS instanceof Set);
});

it("all blacklist addresses are lowercase 0x + 40 hex", () => {
  for (const a of SEED_BLACKLIST) {
    assert(/^0x[a-f0-9]{40}$/.test(a), `bad blacklist address: ${a}`);
  }
});

it("all blacklist selectors are 0x + 8 hex", () => {
  for (const s of SEED_BLACKLIST_SELECTORS) {
    assert(/^0x[a-f0-9]{8}$/.test(s), `bad blacklist selector: ${s}`);
  }
});

it("blacklist has >= 10 entries (was 2 before v3.3)", () => {
  assert(SEED_BLACKLIST.size >= 10, `only ${SEED_BLACKLIST.size} addresses - need >= 10`);
  assert(SEED_BLACKLIST_DOMAINS.size >= 10, `only ${SEED_BLACKLIST_DOMAINS.size} domains`);
  assert(SEED_BLACKLIST_SELECTORS.size >= 3, `only ${SEED_BLACKLIST_SELECTORS.size} selectors`);
});

// ============================================================
section("Risk engine: blacklisted address -> CRITICAL");

it("address in SEED_BLACKLIST produces 'Known-Bad Address' factor", () => {
  // Pick any address from the blacklist
  const badAddr = [...SEED_BLACKLIST][0];
  const result = computeRisk({
    target: badAddr,
    from: "0x" + "a".repeat(40),
    value: "0x0",
    data: "0x"
  });
  const factor = result.factors.find((f) => f.name === "Known-Bad Address (drainer / phisher)");
  assert(factor, "expected a 'Known-Bad Address' factor");
  assert.strictEqual(factor.severity, "critical", `severity was ${factor.severity}`);
  assert(factor.weight >= 50, `weight was ${factor.weight} - should be CRITICAL (>50)`);
});

it("blacklisted address always returns early (no Whitelist factor possible)", () => {
  // Even if the address is in the user's whitelist, the blacklist check
  // comes FIRST and short-circuits - the whitelist can never cancel out
  // a known-bad address.
  const badAddr = [...SEED_BLACKLIST][0];
  const result = computeRisk({
    target: badAddr,
    from: "0x" + "a".repeat(40),
    value: "0x0",
    data: "0x",
    trustedAddresses: new Set([badAddr])  // user whitelisted it
  });
  const whitelisted = result.factors.find((f) => f.name === "Whitelisted Address");
  assert(!whitelisted, "whitelist must not cancel a known-bad address");
});

it("non-blacklisted address produces no Known-Bad factor", () => {
  const safeAddr = "0x" + "1234567890abcdef".repeat(4).slice(0, 40);
  const result = computeRisk({
    target: safeAddr,
    from: "0x" + "a".repeat(40),
    value: "0x0",
    data: "0x"
  });
  const factor = result.factors.find((f) => f.name === "Known-Bad Address (drainer / phisher)");
  assert(!factor, "false positive: random address flagged as known-bad");
});

// ============================================================
section("Risk engine: blacklisted domain -> CRITICAL");

it("hostname in SEED_BLACKLIST_DOMAINS produces 'Known-Bad Domain' factor", () => {
  const badHost = [...SEED_BLACKLIST_DOMAINS][0];
  const result = computeRisk({
    hostname: badHost,
    target: "0x" + "a".repeat(40),
    from: "0x" + "b".repeat(40),
    value: "0x0",
    data: "0x"
  });
  const factor = result.factors.find((f) => f.name === "Known-Bad Domain (drainer / phisher)");
  assert(factor, `expected Known-Bad Domain factor for ${badHost}`);
  assert.strictEqual(factor.severity, "critical");
});

it("www. prefix is normalized for blacklist check", () => {
  const badHost = [...SEED_BLACKLIST_DOMAINS][0];
  const result = computeRisk({
    hostname: "www." + badHost,
    target: "0x" + "a".repeat(40),
    from: "0x" + "b".repeat(40),
    value: "0x0",
    data: "0x"
  });
  const factor = result.factors.find((f) => f.name === "Known-Bad Domain (drainer / phisher)");
  assert(factor, "www. prefix must not bypass the blacklist");
});

// ============================================================
section("Risk engine: blacklisted selector -> CRITICAL");

it("setApprovalForAll produces 'Known-Bad Selector' factor", () => {
  const result = computeRisk({
    target: "0x" + "a".repeat(40),
    from: "0x" + "b".repeat(40),
    value: "0x0",
    // setApprovalForAll(address,bool) = 0xa22cb465
    data: "0xa22cb465" + "00".repeat(64) + "0000000000000000000000000000000000000000000000000000000000000001"
  });
  const factor = result.factors.find((f) => f.name === "Known-Bad Selector");
  assert(factor, "expected Known-Bad Selector factor for setApprovalForAll");
  assert.strictEqual(factor.severity, "critical");
});

it("non-blacklisted selector (e.g. transfer) produces no Known-Bad Selector factor", () => {
  const result = computeRisk({
    target: "0x" + "a".repeat(40),
    from: "0x" + "b".repeat(40),
    value: "0x0",
    // transfer(address,uint256) = 0xa9059cbb
    data: "0xa9059cbb" + "00".repeat(64) + "00".repeat(64)
  });
  const factor = result.factors.find((f) => f.name === "Known-Bad Selector");
  assert(!factor, "false positive: transfer() flagged as Known-Bad Selector");
});

// ============================================================
section("NFT approval: known-marketplace softening");

it("setApprovalForAll to a known marketplace (OpenSea Seaport) is LOW risk", () => {
  // OpenSea Seaport 1.5
  const opensea = "0x1e0049783f008a0085193e00003d00cd54003c71";
  // setApprovalForAll(address,bool) where operator=OpenSea, approved=true
  const openseaHex = opensea.slice(2).padStart(64, "0").toLowerCase();
  const data = "0xa22cb465" + openseaHex + "0".repeat(63) + "1";
  const result = computeRisk({
    target: "0x" + "c".repeat(40),  // NFT contract
    from: "0x" + "d".repeat(40),
    value: "0x0",
    data,
    decoded: { operator: opensea }
  });
  const factor = result.factors.find((f) => f.name === "NFT Listing Approval (Known Marketplace)");
  assert(factor, "expected soft LOW factor for OpenSea setApprovalForAll");
  assert.strictEqual(factor.severity, "low");
  // The CRITICAL "NFT Approval For All" factor must NOT fire
  const critical = result.factors.find((f) => f.name === "NFT Approval For All");
  assert(!critical, "OpenSea listing should not produce CRITICAL NFT factor");
});

it("setApprovalForAll to an UNKNOWN address is still CRITICAL", () => {
  const unknownOp = "0x" + "9".repeat(40);
  const opHex = unknownOp.slice(2).padStart(64, "0").toLowerCase();
  const data = "0xa22cb465" + opHex + "0".repeat(63) + "1";
  const result = computeRisk({
    target: "0x" + "c".repeat(40),
    from: "0x" + "d".repeat(40),
    value: "0x0",
    data,
    decoded: { operator: unknownOp }
  });
  const factor = result.factors.find((f) => f.name === "NFT Approval For All");
  assert(factor, "unknown operator must still produce CRITICAL NFT factor");
  assert.strictEqual(factor.severity, "critical");
});

it("KNOWN_NFT_OPERATORS is exported from constants.js", () => {
  // Cross-import check - risk-engine imports it, so it must be a real Set
  const src = readFile("lib/constants.js");
  assert(/export const KNOWN_NFT_OPERATORS = new Set/.test(src),
    "KNOWN_NFT_OPERATORS must be exported from lib/constants.js");
  assert(src.includes("OpenSea Seaport"), "OpenSea Seaport must be in KNOWN_NFT_OPERATORS");
  assert(src.includes("Blur marketplace"), "Blur must be in KNOWN_NFT_OPERATORS");
});

// ============================================================
process.stdout.write("\n\n");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (failures.length > 0) {
  console.log("\n  Failures:");
  for (const { name, err } of failures) {
    console.log(`    - ${name}: ${err.message}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
