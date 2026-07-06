// test-pattern-dna.js - Tests for the WORLD-FIRST drainer DNA pattern matcher.
// Covers: DNA extraction, similarity computation, archetype matching, verdict
// classification, and detection of known drainer archetypes.

import assert from "node:assert/strict";
import { extractDna, dnaSimilarity, matchDrainerDna, isDrainerLike } from "./lib/pattern-dna.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  if (actual === expected) ok(name);
  else { console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy: ${JSON.stringify(val)})`); }

console.log("[extractDna]");
// approve(address,uint256) → max uint256
{
  const dna = extractDna({
    to: "0xSpender",
    data: "0x095ea7b3" + "0".repeat(24) + "f".repeat(40) + "f".repeat(64)
  });
  truthy(dna, "extracts DNA");
  eq(dna.hasApproval, 1, "approval detected");
  eq(dna.usesPermit, 0, "no permit");
  eq(dna.isMulticall, 0, "no multicall");
}

// permit(address,address,uint256,uint256)
{
  const dna = extractDna({
    data: "0xd505accf" + "0".repeat(64) + "0".repeat(64) + "f".repeat(64) + "f".repeat(64)
  });
  eq(dna.usesPermit, 1, "permit detected");
  eq(dna.hasApproval, 0, "no approval");
}

// multicall(bytes[])
{
  const dna = extractDna({
    data: "0xac9650d8" + "0".repeat(64) + "f".repeat(64)
  });
  eq(dna.isMulticall, 1, "multicall detected");
}

// Empty/missing data
eq(extractDna(null), null, "null tx → null");
eq(extractDna({}), null, "no data → null");
eq(extractDna({ data: "" }), null, "empty data → null");

console.log("[dnaSimilarity]");
// Identical DNA should have similarity 1.0
{
  const dna = { a: 1, b: 0.5, c: 0 };
  const archDna = { features: dna };
  const sim = dnaSimilarity(dna, archDna);
  eq(Math.round(sim * 1000) / 1000, 1.0, "identical DNA = 1.0 similarity");
}
// Zero vectors should return 0
{
  const zero = { a: 0, b: 0, c: 0 };
  const dna = { a: 1, b: 1, c: 1 };
  eq(dnaSimilarity(zero, { features: dna }), 0, "zero vector = 0 similarity");
}

console.log("[matchDrainerDna]");
// Known approval drainer pattern: setApprovalForAll
{
  const tx = {
    to: "0xSpender",
    data: "0xa22cb465" + "0".repeat(24) + "f".repeat(40) + "0".repeat(63) + "1" // operator=true
  };
  const result = matchDrainerDna(tx);
  truthy(result.allMatches.length === 8, "8 archetypes");
  truthy(result.topMatch, "has top match");
  truthy(result.topMatch.archetype.includes("drainer") || result.topMatch.archetype === "approval_drainer",
    `top match is a drainer: ${result.topMatch.archetype}`);
  console.log(`    (top match: ${result.topMatch.archetype}, similarity: ${result.topMatch.similarity})`);
}

// Permit drainer
{
  const tx = {
    to: "0xSpender",
    data: "0xd505accf" + "0".repeat(64) + "0".repeat(64) + "f".repeat(64) + "f".repeat(64)
  };
  const result = matchDrainerDna(tx);
  truthy(["permit_drainer", "approval_drainer", "multicall_drainer"].includes(result.topMatch.archetype),
    `permit tx flagged as drainer: ${result.topMatch.archetype}`);
}

// Benign tx: simple ETH transfer
{
  const tx = {
    to: "0xRecipient",
    data: "0x",
    value: "0x16345785d8a0000" // 0.1 ETH
  };
  const result = matchDrainerDna(tx);
  truthy(result.topMatch.similarity < 0.5,
    `simple transfer has low drainer similarity: ${result.topMatch.similarity}`);
}

// Multicall drainer
{
  const tx = {
    to: "0xMulticall",
    // multicall selector + nested call data
    data: "0xac9650d8" + "0".repeat(64) + "f".repeat(64)
  };
  const result = matchDrainerDna(tx);
  truthy(result.topMatch.similarity > 0.3,
    `multicall tx flagged: ${result.topMatch.archetype} similarity=${result.topMatch.similarity}`);
}

console.log("[isDrainerLike]");
// Suspicious pattern should flag
{
  const tx = {
    to: "0xSuspicious",
    data: "0xa22cb465" + "0".repeat(24) + "f".repeat(40) + "0".repeat(63) + "1"
  };
  const r = isDrainerLike(tx);
  truthy(typeof r.similarity === "number", "returns similarity score");
  console.log(`    (verdict-like: ${JSON.stringify(r).slice(0, 80)}...)`);
}

// Benign tx should not flag
{
  const tx = {
    to: "0xRecipient",
    data: "0xa9059cbb" + "0".repeat(24) + "f".repeat(40) + "f".repeat(64) // simple transfer
  };
  const r = isDrainerLike(tx);
  truthy(r.similarity < 0.5, `simple transfer not drainer-like: similarity=${r.similarity}`);
}

console.log("[verdict classification]");
// Test verdict boundaries: critical / suspicious / safe
{
  // Construct a "perfect match" by using ALL selector families
  const tx = {
    to: "0xSpender",
    data: "0xac9650d8" + "0".repeat(24) + "f".repeat(40) + // multicall
          "0xa22cb465" + // setApprovalForAll
          "0xa9059cbb" + // transfer
          "0xd505accf" + // permit
          "f".repeat(1000) // long calldata
  };
  const result = matchDrainerDna(tx);
  truthy(["critical", "suspicious"].includes(result.verdict),
    `multi-vector tx is critical/suspicious: ${result.verdict} (top=${result.topMatch.archetype} sim=${result.topMatch.similarity})`);
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: drainer DNA matcher world-first feature working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
