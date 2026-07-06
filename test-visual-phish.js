// test-visual-phish.js

import {
  KNOWN_GOOD_SITES,
  computeStructuralFingerprint,
  structuralSimilarity,
  hammingDistance,
  visualSimilarity,
  detectVisualClone,
  compareVisualHash
} from "./lib/visual-phish.js";

let passed = 0, failed = 0;
function ok(n) { console.log(`  ok  ${n}`); passed++; }
function eq(a, e, n) { if (JSON.stringify(a) === JSON.stringify(e)) ok(n); else { console.log(`  FAIL ${n}: expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`); failed++; } }
function truthy(v, n) { if (v) ok(n); else { console.log(`  FAIL ${n}: expected truthy got ${v}`); failed++; } }
function falsy(v, n)  { if (!v) ok(n); else { console.log(`  FAIL ${n}: expected falsy got ${v}`); failed++; } }

// ---- Constants ----
truthy(Object.keys(KNOWN_GOOD_SITES).length >= 15, `KNOWN_GOOD_SITES has ${Object.keys(KNOWN_GOOD_SITES).length} entries`);
truthy(KNOWN_GOOD_SITES["app.uniswap.org"], "Uniswap in registry");
truthy(KNOWN_GOOD_SITES["opensea.io"], "OpenSea in registry");

// ---- computeStructuralFingerprint ----
const fakeDoc = {
  getElementsByTagName: (tag) => {
    const counts = { form: 2, input: 5, button: 3, a: 10, h1: 1, h2: 2 };
    const n = counts[tag] || 0;
    return { length: n };
  }
};
const fp = computeStructuralFingerprint(fakeDoc);
eq(fp.length, 5, "structural fingerprint has 5 dims");
eq(fp[0], 2, "forms counted");
eq(fp[1], 5, "inputs counted");
eq(fp[2], 3, "buttons counted");

// Empty doc
const fpEmpty = computeStructuralFingerprint(null);
eq(fpEmpty, [0, 0, 0, 0, 0], "null doc → zeros");

// ---- structuralSimilarity ----
eq(structuralSimilarity([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]), 1, "identical fingerprints → 1.0");
eq(structuralSimilarity([0, 0, 0, 0, 0], [0, 0, 0, 0, 0]), 1, "two empty fingerprints → 1.0");
const sim1 = structuralSimilarity([3, 14, 2, 4, 6], [3, 14, 2, 4, 6]);
truthy(sim1 > 0.99, "Uniswap vs Uniswap ≈ 1.0");
const sim2 = structuralSimilarity([3, 14, 2, 4, 6], [5, 25, 8, 12, 10]);
truthy(sim2 < 0.7, `very different fingerprints → low-ish similarity (got ${sim2})`);
eq(structuralSimilarity(null, [1, 2, 3, 4, 5]), 0, "null fingerprint → 0");
eq(structuralSimilarity([1, 2, 3], [1, 2, 3, 4, 5]), 0, "different lengths → 0");

// ---- hammingDistance ----
const a = new Uint8Array([0b10101010, 0b01010101]);
const b = new Uint8Array([0b10101010, 0b01010101]);
eq(hammingDistance(a, b), 0, "identical hashes → 0 distance");
// 0b10101010 XOR 0b11111111 = 0b01010101 (4 bits)
// 0b01010101 XOR 0b00000000 = 0b01010101 (4 bits)
// Total = 8 bits
const c = new Uint8Array([0b11111111, 0b00000000]);
eq(hammingDistance(a, c), 8, "half-different hashes → 8 bits");
eq(hammingDistance(null, a), 64, "null hash → 64");
eq(hammingDistance(a, null), 64, "null hash (other side) → 64");

// ---- visualSimilarity ----
eq(visualSimilarity(a, b), 1, "identical visual hashes → 1.0");
eq(visualSimilarity(a, c), (64 - 8) / 64, "half-different → 0.875");
eq(visualSimilarity(null, a), 0, "null → 0");

// ---- compareVisualHash ----
eq(compareVisualHash(a, b), 1, "compareVisualHash: identical");
eq(compareVisualHash(a, c), (64 - 8) / 64, "compareVisualHash: half-different");

// ---- detectVisualClone ----
// Use a fakeDoc that closely matches Uniswap's known structural fingerprint.
const uniswapDoc = {
  getElementsByTagName: (tag) => {
    const counts = { form: 3, input: 14, button: 2, a: 4, h1: 4, h2: 2 };
    return { length: counts[tag] || 0 };
  }
};
const matchResult = detectVisualClone("app.uniswap.org", uniswapDoc);
falsy(matchResult.isClone, "matching domain + matching fp → not clone");
eq(matchResult.matchesBrand, "Uniswap", "matches brand detected");
eq(matchResult.trustedDomain, "app.uniswap.org", "trusted domain detected");

// Clone: different domain but same structure as Uniswap
const cloneResult = detectVisualClone("uniswapp-app.com", uniswapDoc);
truthy(cloneResult.structuralSimilarity > 0.95, `clone matches Uniswap structure (got ${cloneResult.structuralSimilarity})`);

// Unknown domain, weird structure
const unknownResult = detectVisualClone("random-blog.com", {
  getElementsByTagName: () => ({ length: 0 })
});
eq(unknownResult.riskLevel, "none", "empty structure → none");
eq(unknownResult.matchesBrand, null, "no brand match");

// ---- detectVisualClone: handles missing doc ----
const nullDoc = detectVisualClone("app.uniswap.org", null);
eq(nullDoc.riskLevel, "none", "null doc handled");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
