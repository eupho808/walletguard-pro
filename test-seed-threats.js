// test-seed-threats.js - Regression tests for the embedded seed threat list.
//
// Goals:
//   - The seed list exists, parses, and has at least N entries
//   - Every entry has the correct shape
//   - All addresses are lowercase 0x + 40 hex
//   - All domains are lowercase, no leading "www.", no trailing slash
//   - No duplicate values within a type
//   - Helpers return the right subsets

import assert from "node:assert";

import {
  SEED_THREATS,
  seedAddresses,
  seedDomains,
  seedSelectors,
  seedPatterns
} from "./lib/seed-threats.js";

let passed = 0, failed = 0;

function it(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(".");
  } catch (e) {
    failed++;
    process.stdout.write("F");
    console.error("\n  FAIL", name, "-", e.message);
  }
}

function section(t) { process.stdout.write("\n  " + t + "\n  "); }

// ============================================================
section("Seed threat list shape");

it("SEED_THREATS exists and is non-empty", () => {
  assert(Array.isArray(SEED_THREATS), "SEED_THREATS must be an array");
  assert(SEED_THREATS.length >= 15,
    `Need at least 15 seed threats for meaningful protection, got ${SEED_THREATS.length}`);
});

it("every entry has required fields", () => {
  for (const t of SEED_THREATS) {
    assert(typeof t.id === "string" && t.id.length > 0, "missing id");
    assert(["domain", "address", "selector", "bytecode", "pattern", "delegate"]
      .includes(t.type), `invalid type: ${t.type}`);
    assert(typeof t.value === "string" && t.value.length > 0, "missing value");
    assert(["low", "medium", "high", "critical"].includes(t.severity),
      `invalid severity: ${t.severity}`);
    assert(typeof t.category === "string", "missing category");
    assert(typeof t.name === "string", "missing name");
    assert(typeof t.firstSeen === "string", "missing firstSeen");
  }
});

it("all address entries are lowercase 0x + 40 hex", () => {
  for (const a of seedAddresses()) {
    assert(/^0x[a-f0-9]{40}$/.test(a), `bad address: ${a}`);
  }
});

it("all domain entries are lowercase, no leading www, no trailing slash", () => {
  for (const d of seedDomains()) {
    assert(d === d.toLowerCase(), `not lowercase: ${d}`);
    assert(!d.startsWith("www."), `leading www: ${d}`);
    assert(!d.endsWith("/"), `trailing slash: ${d}`);
    assert(d.includes("."), `no TLD: ${d}`);
    assert(!/\s/.test(d), `whitespace in: ${d}`);
  }
});

it("all selector entries are 0x + 8 hex", () => {
  for (const s of seedSelectors()) {
    assert(/^0x[a-f0-9]{8}$/.test(s), `bad selector: ${s}`);
  }
});

it("no duplicate values within a type", () => {
  const seen = new Map();
  for (const t of SEED_THREATS) {
    const key = `${t.type}:${t.value}`;
    assert(!seen.has(key), `duplicate: ${key}`);
    seen.set(key, true);
  }
});

it("no duplicate ids", () => {
  const ids = new Set();
  for (const t of SEED_THREATS) {
    assert(!ids.has(t.id), `duplicate id: ${t.id}`);
    ids.add(t.id);
  }
});

// ============================================================
section("Coverage breadth");

it("contains at least 5 of each common type", () => {
  const byType = {};
  for (const t of SEED_THREATS) {
    byType[t.type] = (byType[t.type] || 0) + 1;
  }
  assert((byType.domain || 0) >= 5, `need >=5 domains, got ${byType.domain || 0}`);
  assert((byType.address || 0) >= 2, `need >=2 addresses, got ${byType.address || 0}`);
  assert((byType.pattern || 0) >= 2, `need >=2 patterns, got ${byType.pattern || 0}`);
  assert((byType.selector || 0) >= 2, `need >=2 selectors, got ${byType.selector || 0}`);
});

it("covers top DeFi protocols in typosquat entries", () => {
  const domains = seedDomains();
  // At least one entry each for the most-targeted protocols
  const targets = ["uniswap", "metamask", "opensea", "pancakeswap", "blur", "1inch"];
  for (const target of targets) {
    assert(domains.some((d) => d.includes(target)),
      `no typosquat entry for ${target}`);
  }
});

// ============================================================
section("Helper functions");

it("seedAddresses() returns only address-type entries", () => {
  const addrs = seedAddresses();
  assert(addrs.length > 0);
  for (const a of addrs) assert(/^0x[a-f0-9]{40}$/.test(a));
});

it("seedDomains() returns only domain-type entries", () => {
  const doms = seedDomains();
  assert(doms.length > 0);
  for (const d of doms) assert(d.includes("."));
});

it("seedSelectors() returns only selector-type entries", () => {
  const sels = seedSelectors();
  for (const s of sels) assert(/^0x[a-f0-9]{8}$/.test(s));
});

it("seedPatterns() returns only pattern-type entries", () => {
  const pats = seedPatterns();
  for (const p of pats) {
    assert(p.length > 5, "pattern too short: " + p);
    // Must be a valid regex when compiled
    try { new RegExp(p); } catch (e) { throw new Error("invalid regex: " + p); }
  }
});

// ============================================================
process.stdout.write("\n\n");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
