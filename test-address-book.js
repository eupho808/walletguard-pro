// test-address-book.js - Tests for the local address book.

import {
  normalizeAddress,
  isValidEntry
} from "./lib/address-book.js";

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok ", name);
  } catch (e) {
    failed++;
    console.error("  FAIL", name, "-", e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}
assert.equal = (a, b, msg) => { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

console.log("[normalizeAddress]");
test("lowercase 0x address", () => {
  assert.equal(normalizeAddress("0xabcdef0123456789abcdef0123456789abcdef01"), "0xabcdef0123456789abcdef0123456789abcdef01");
});
test("uppercase address normalized to lowercase", () => {
  assert.equal(normalizeAddress("0xABCDEF0123456789ABCDEF0123456789ABCDEF01"), "0xabcdef0123456789abcdef0123456789abcdef01");
});
test("trims whitespace", () => {
  assert.equal(normalizeAddress("  0xabcdef0123456789abcdef0123456789abcdef01  "), "0xabcdef0123456789abcdef0123456789abcdef01");
});
test("rejects missing 0x prefix", () => {
  assert.equal(normalizeAddress("abcdef0123456789abcdef0123456789abcdef01"), null);
});
test("rejects too short", () => {
  assert.equal(normalizeAddress("0xabc"), null);
});
test("rejects too long", () => {
  assert.equal(normalizeAddress("0x" + "a".repeat(41)), null);
});
test("rejects non-hex chars", () => {
  assert.equal(normalizeAddress("0xZZZZZZ0123456789abcdef0123456789abcdef01"), null);
});
test("rejects null", () => {
  assert.equal(normalizeAddress(null), null);
});
test("rejects undefined", () => {
  assert.equal(normalizeAddress(undefined), null);
});
test("rejects empty string", () => {
  assert.equal(normalizeAddress(""), null);
});
test("rejects non-string", () => {
  assert.equal(normalizeAddress(123), null);
  assert.equal(normalizeAddress({}), null);
  assert.equal(normalizeAddress([]), null);
});

console.log("[isValidEntry]");
test("valid entry with label", () => {
  assert(isValidEntry({ label: "Alice" }));
});
test("rejects empty label", () => {
  assert.equal(isValidEntry({ label: "" }), false);
});
test("rejects missing label", () => {
  assert.equal(isValidEntry({}), false);
});
test("rejects non-string label", () => {
  assert.equal(isValidEntry({ label: 123 }), false);
});
test("accepts long label (≤64 chars)", () => {
  assert(isValidEntry({ label: "x".repeat(64) }));
});
test("rejects label >64 chars", () => {
  // isValidEntry enforces ≤64 chars; longer labels are rejected
  assert.equal(isValidEntry({ label: "x".repeat(100) }), false);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
