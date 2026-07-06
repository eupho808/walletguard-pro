// test-simulator-v2.js - Tests for the real transaction simulator + MEV detector.
//
// Covers:
//   • Revert detection (parsing revert reasons)
//   • Heuristic fallback for unknown txs
//   • Cache behavior
//   • MEV detection via known bot addresses
//   • Sandwich risk detection
//   • Mempool exposure heuristics
//   • Address book helpers

import { simulate, detectRevert, detectMevRisk } from "./lib/simulator.js";
import { assessMevRisk, estimatePriceImpact } from "./lib/mev-detector.js";
import { diffTransaction } from "./lib/simulator.js";
import { normalizeAddress, isValidEntry } from "./lib/address-book.js";

// ---------- Mock provider ----------
function mockProvider(behaviors) {
  return {
    request: async ({ method, params }) => {
      const key = `${method}:${JSON.stringify(params[0] || {})}`;
      if (behaviors[key] !== undefined) {
        const v = behaviors[key];
        if (v && typeof v === "object" && "message" in v) throw v;
        if (typeof v === "function") return v({ method, params });
        return v;
      }
      return "0x";
    }
  };
}

// ---------- Test helpers ----------
let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok ", name);
  } catch (e) {
    failed++;
    console.error("  FAIL", name, "-", (e && e.message) || e);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}
assert.equal = (a, b, msg) => { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
assert.ok = assert;
assert.match = (s, re, msg) => { if (!re.test(String(s))) throw new Error(msg || `Expected ${JSON.stringify(s)} to match ${re}`); };

// ---------- Revert detection ----------

console.log("[detectRevert]");
await test("returns ok for successful eth_call", async () => {
  const provider = mockProvider({});
  const result = await detectRevert({ to: "0xabc", data: "0x", from: "0xdef" }, provider);
  assert.equal(result.ok, true);
});
await test("parses Solidity revert reason", async () => {
  const provider = mockProvider({
    "eth_call:{\"to\":\"0xabc\",\"data\":\"0x\",\"from\":\"0xdef\",\"value\":\"0x0\"}": new Error("execution reverted: Insufficient balance")
  });
  const result = await detectRevert({ to: "0xabc", data: "0x", from: "0xdef" }, provider);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Insufficient balance/);
});
await test("parses panic code", async () => {
  const provider = mockProvider({
    "eth_call:{\"to\":\"0xabc\",\"data\":\"0x\",\"value\":\"0x0\"}": new Error("reverted with panic code 0x11")
  });
  const result = await detectRevert({ to: "0xabc", data: "0x" }, provider);
  assert.match(result.reason, /Panic code/);
});
await test("handles missing provider", async () => {
  const result = await detectRevert({ to: "0xabc", data: "0x" }, null);
  assert.equal(result.reason, "no-provider");
});

// ---------- simulate() ----------

console.log("[simulate]");
await test("detects successful swap", async () => {
  const provider = mockProvider({});
  const tx = {
    to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
    data: "0x38ed1739" + "0".repeat(128),
    from: "0xuser",
    value: "0x16345785d8a0000",
    chainId: 1
  };
  const result = await simulate(tx, provider);
  assert.equal(result.success, true);
});
await test("detects revert", async () => {
  const provider = mockProvider({
    "eth_call:{\"to\":\"0xtoken\",\"data\":\"0xapprove\",\"from\":\"0xuser\",\"value\":\"0x0\"}": new Error("execution reverted: ERC20: insufficient allowance")
  });
  const result = await simulate({ to: "0xtoken", data: "0xapprove", from: "0xuser", value: "0x0" }, provider);
  assert.equal(result.success, false);
});
await test("heuristic fallback when no provider", async () => {
  const result = await simulate({ to: "0xabc", data: "0x", value: "0x16345785d8a0000" }, null);
  assert.equal(result.method, "heuristic");
});
await test("detects MEV bot interaction", async () => {
  const provider = mockProvider({});
  // Use an address from simulator's KNOWN_MEV_BOTS (Flashbots)
  const tx = { to: "0xdafea492d9c6733ae3d56b7ed1adb60692c98bc5", data: "0x", value: "0x16345785d8a0000", from: "0xuser" };
  const result = await simulate(tx, provider);
  assert.ok(result.mevRisks.some(r => r.type === "known-mev-bot"));
});
await test("caches results within 30s window", async () => {
  let calls = 0;
  const provider = { request: async () => { calls++; return "0x"; } };
  const tx = { to: "0xabc", data: "0x1234", value: "0x0" };
  await simulate(tx, provider);
  await simulate(tx, provider);
  await simulate(tx, provider);
  assert.equal(calls, 1);
});

// ---------- MEV detection ----------

console.log("[MEV detection]");
await test("detects known MEV bot", () => {
  const result = assessMevRisk({ to: "0xae2fc483527b8b2565c80cd39b1603dc7d6c7d33", data: "0x", value: "0x0" }, null);
  assert.equal(result.riskLevel, "critical");
});
await test("large ETH swap flagged as sandwich bait", () => {
  const tx = {
    to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
    data: "0x7ff36ab5",
    value: "0x6f05b59d3b20000", // 0.5 ETH — at threshold
    chainId: 1
  };
  const result = assessMevRisk(tx, { method: "swapExactETHForTokens" });
  assert.ok(result.risks.some(r => r.type === "sandwich-risk"));
});
await test("20 ETH swap = critical", () => {
  const tx = { to: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", data: "0xc04b8d59", value: "0x1158e460913d00000", chainId: 1 };
  const result = assessMevRisk(tx, { method: "exactInputSingle" });
  assert.equal(result.riskLevel, "critical");
});
await test("small swap = no sandwich", () => {
  const tx = { to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", data: "0x", value: "0x16345785d8a0000", chainId: 1 };
  const result = assessMevRisk(tx, { method: "swap" });
  assert.equal(result.risks.find(r => r.type === "sandwich-risk"), undefined);
});
await test("20 ETH tx = mempool exposure", () => {
  const tx = { to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", data: "0x", value: "0x1158e460913d00000", chainId: 1 };
  const result = assessMevRisk(tx, null);
  assert.ok(result.risks.some(r => r.type === "mempool-exposure"));
});
await test("provides recommendations for MEV bot", () => {
  const result = assessMevRisk({ to: "0xae2fc483527b8b2565c80cd39b1603dc7d6c7d33", data: "0x", value: "0x1158e460913d00000", chainId: 1 }, null);
  assert.ok(result.recommendations.length > 0);
});
await test("estimatePriceImpact: classifies by USD value", () => {
  assert.equal(estimatePriceImpact(0.001).estimate, "low");
  assert.equal(estimatePriceImpact(5).estimate, "medium");   // 5 ETH ~ $15k = medium
  assert.equal(estimatePriceImpact(50).estimate, "high");    // 50 ETH ~ $150k = high
  assert.equal(estimatePriceImpact(200).estimate, "very-high"); // 200 ETH ~ $600k = very-high
});

// ---------- detectMevRisk legacy ----------

console.log("[detectMevRisk legacy]");
await test("unknown method (low severity)", () => {
  const risks = detectMevRisk({ to: "0xsomecontract", data: "0xdeadbeef" + "0".repeat(64), value: "0x0" }, null);
  assert.ok(risks.some(r => r.type === "unknown-method"));
});

// ---------- diffTransaction legacy ----------

console.log("[diffTransaction legacy]");
await test("approves unlimited flagged", () => {
  // diffTransaction expects raw calldata in `decoded` (or method identifier)
  const diff = diffTransaction({ decoded: "0x095ea7b3" + "0".repeat(64) + "f".repeat(64), ethValue: "0" });
  assert.equal(diff.risk, "unlimited-allowance");
});
await test("native ETH transfer", () => {
  const diff = diffTransaction({ decoded: "0xa9059cbb" + "0".repeat(64) + "0".repeat(64), ethValue: "1.5" });
  assert.equal(diff.totalOutEth, 1.5);
});

// ---------- Address book helpers ----------

console.log("[address-book helpers]");
await test("normalize lowercase", () => {
  assert.equal(normalizeAddress("0xabcdef0123456789abcdef0123456789abcdef01"), "0xabcdef0123456789abcdef0123456789abcdef01");
});
await test("normalize uppercase", () => {
  assert.equal(normalizeAddress("0xABCDEF0123456789ABCDEF0123456789ABCDEF01"), "0xabcdef0123456789abcdef0123456789abcdef01");
});
await test("rejects too short", () => {
  assert.equal(normalizeAddress("0xabc"), null);
});
await test("rejects non-hex", () => {
  assert.equal(normalizeAddress("0xZZZZZZ0123456789abcdef0123456789abcdef01"), null);
});
await test("rejects null", () => {
  assert.equal(normalizeAddress(null), null);
});
await test("isValidEntry accepts valid", () => {
  assert.equal(isValidEntry({ label: "Alice" }), true);
});
await test("isValidEntry rejects empty label", () => {
  assert.equal(isValidEntry({ label: "" }), false);
});
await test("isValidEntry rejects too long", () => {
  assert.equal(isValidEntry({ label: "x".repeat(100) }), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
