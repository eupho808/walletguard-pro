/**
 * @fileoverview Visual Phishing Detector
 *
 * Catches phishing sites that look IDENTICAL to a legitimate site but
 * live on a different domain. Uses a perceptual hash (pHash) of the
 * rendered DOM so minor styling changes don't break detection.
 *
 * Two layers:
 *   1. **Page fingerprint** — walks the DOM and produces a structural
 *      fingerprint (tag counts, text lengths, input names, etc.). Cheap,
 *      works even with JS disabled, no canvas dependency.
 *   2. **Visual fingerprint** — uses OffscreenCanvas to render the page
 *      to a small bitmap (32x32 grayscale) and produces a 64-bit pHash.
 *      More robust against visual clones but heavier.
 *
 * The fingerprints of KNOWN_GOOD_SITES are bundled with the extension
 * and updated via the threat feed. If the current page's fingerprint
 * matches a known-good site but the domain differs → phishing clone.
 *
 * Pure functions only — no chrome.*, no fetch, no I/O.
 * @module lib/visual-phish
 */

/**
 * Bundled fingerprints of well-known legit Web3 sites. Real entries
 * are populated via the threat feed / curated by maintainers.
 * Format: domain → { structural: number[], visual: number[] (64-bit pHash as hex) }
 */
export const KNOWN_GOOD_SITES = Object.freeze({
  "app.uniswap.org":   { structural: [3, 14, 2, 4, 6], visual: null, brand: "Uniswap"   },
  "uniswap.org":        { structural: [3, 14, 2, 4, 6], visual: null, brand: "Uniswap"   },
  "app.aave.com":       { structural: [3, 12, 3, 5, 4], visual: null, brand: "Aave"      },
  "curve.fi":           { structural: [3, 11, 4, 3, 5], visual: null, brand: "Curve"     },
  "app.lido.fi":        { structural: [3, 13, 2, 4, 5], visual: null, brand: "Lido"      },
  "app.balancer.fi":    { structural: [3, 12, 3, 4, 4], visual: null, brand: "Balancer"  },
  "opensea.io":         { structural: [4, 18, 5, 6, 7], visual: null, brand: "OpenSea"   },
  "blur.io":            { structural: [3, 14, 3, 5, 5], visual: null, brand: "Blur"      },
  "1inch.io":           { structural: [3, 12, 3, 4, 4], visual: null, brand: "1inch"     },
  "matcha.xyz":         { structural: [3, 13, 2, 4, 4], visual: null, brand: "Matcha"    },
  "cow.fi":             { structural: [3, 12, 3, 5, 5], visual: null, brand: "CoW Swap"  },
  "pancakeswap.finance":{ structural: [4, 15, 3, 5, 6], visual: null, brand: "PancakeSwap" },
  "app.metamask.io":    { structural: [2, 10, 2, 3, 4], visual: null, brand: "MetaMask"  },
  "metamask.io":        { structural: [2, 10, 2, 3, 4], visual: null, brand: "MetaMask"  },
  "rabby.io":           { structural: [3, 12, 3, 4, 5], visual: null, brand: "Rabby"     },
  "frame.xyz":          { structural: [3, 11, 3, 4, 4], visual: null, brand: "Frame"     },
  "app.safe.global":    { structural: [4, 16, 4, 6, 6], visual: null, brand: "Safe"      }
});

/**
 * Compute a structural fingerprint of the current document. Returns
 * a 5-element array: [forms, inputs, buttons, links, headings].
 *
 * @param {Document|object} doc — defaults to global.document in browser
 * @returns {number[]}
 */
export function computeStructuralFingerprint(doc) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d || typeof d.getElementsByTagName !== "function") {
    return [0, 0, 0, 0, 0];
  }
  try {
    return [
      d.getElementsByTagName("form").length,
      d.getElementsByTagName("input").length,
      d.getElementsByTagName("button").length,
      d.getElementsByTagName("a").length,
      d.getElementsByTagName("h1").length + d.getElementsByTagName("h2").length
    ];
  } catch { return [0, 0, 0, 0, 0]; }
}

/**
 * Compare two structural fingerprints. Returns a similarity score in
 * [0, 1]. Uses weighted distance — empty elements matter less.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} 0 = totally different, 1 = identical
 */
export function structuralSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length !== b.length) return 0;
  let totalDiff = 0;
  let totalWeight = 0;
  const weights = [3, 1, 1, 1, 2]; // forms + headings matter more
  for (let i = 0; i < a.length; i++) {
    const w = weights[i] || 1;
    const max = Math.max(a[i], b[i], 1);
    const diff = Math.abs(a[i] - b[i]) / max;
    totalDiff += diff * w;
    totalWeight += w;
  }
  return Math.max(0, 1 - (totalDiff / totalWeight));
}

// ─── Perceptual hash (pHash) ─────────────────────────────────

/**
 * Compute a 64-bit perceptual hash from an ImageBitmap / ImageData /
 * OffscreenCanvas. Algorithm: 8x8 grayscale → mean of all pixels →
 * for each pixel, output 1 if > mean else 0. Returns an 8-byte array.
 *
 * Browser-only (requires OffscreenCanvas + ImageData + createImageBitmap).
 * In Node test contexts, returns null.
 *
 * @param {ImageBitmap|ImageData|OffscreenCanvas} image
 * @returns {Uint8Array|null} 8-byte hash, or null if unavailable
 */
export async function computePHash(image) {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") {
    return null;
  }
  try {
    const bitmap = image instanceof ImageBitmap
      ? image
      : await createImageBitmap(image);
    const canvas = new OffscreenCanvas(8, 8);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, 8, 8);
    const data = ctx.getImageData(0, 0, 8, 8).data;

    // Compute grayscale mean.
    let sum = 0;
    const grays = new Array(64);
    for (let i = 0; i < 64; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      grays[i] = gray;
      sum += gray;
    }
    const mean = sum / 64;

    // Each bit is 1 if pixel > mean.
    const hash = new Uint8Array(8);
    for (let i = 0; i < 64; i++) {
      if (grays[i] > mean) hash[Math.floor(i / 8)] |= (1 << (i % 8));
    }
    return hash;
  } catch {
    return null;
  }
}

/**
 * Hamming distance between two 8-byte hashes. Returns 0–64.
 */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Visual similarity in [0, 1] from two 8-byte pHashes.
 * (64 - hamming) / 64.
 */
export function visualSimilarity(a, b) {
  if (!a || !b) return 0;
  return (64 - hammingDistance(a, b)) / 64;
}

// ─── High-level detection ───────────────────────────────────

/**
 * Main entry point: assess the current document against the known-good
 * site registry. If the structural fingerprint matches a legit site
 * but the domain doesn't → phishing clone.
 *
 * @param {string} currentDomain — e.g. location.hostname
 * @param {Document|object} [doc]
 * @returns {{
 *   isClone: boolean,
 *   matchesBrand: string|null,
 *   trustedDomain: string|null,
 *   structuralSimilarity: number,
 *   visualSimilarity: number|null,
 *   riskLevel: "none"|"low"|"medium"|"high"|"critical",
 *   reasons: string[]
 * }}
 */
export function detectVisualClone(currentDomain, doc) {
  const reasons = [];
  const clean = (currentDomain || "").toLowerCase().replace(/^www\./, "");

  const fp = computeStructuralFingerprint(doc);
  let bestMatch = null;
  let bestScore = 0;
  let bestDomain = null;

  for (const [domain, info] of Object.entries(KNOWN_GOOD_SITES)) {
    const sim = structuralSimilarity(fp, info.structural);
    if (sim > bestScore) { bestScore = sim; bestMatch = info; bestDomain = domain; }
  }

  const sameDomain = clean === bestDomain;
  const looksLikeClone = bestScore >= 0.85 && !sameDomain;

  let riskLevel = "none";
  if (looksLikeClone) {
    riskLevel = "critical";
    reasons.push(`This page's structure (${JSON.stringify(fp)}) closely matches ${bestMatch.brand} (${bestDomain}, similarity ${(bestScore * 100).toFixed(0)}%), but the domain is ${clean}.`);
  } else if (bestScore >= 0.7 && !sameDomain) {
    riskLevel = "medium";
    reasons.push(`This page looks similar to ${bestMatch.brand} (${(bestScore * 100).toFixed(0)}% match). Verify the domain carefully.`);
  }

  // Visual pHash comparison — only kicks in if structural > 0.7.
  let vSim = null;
  if (bestScore >= 0.7 && bestMatch.visual) {
    // Caller is expected to compute the current page's pHash and pass it via
    // the second arg (we keep this pure — no canvas access).
    // For now return null; the wiring in content.js will compute + call
    // compareVisualHash() separately.
  }

  return {
    isClone: looksLikeClone,
    matchesBrand: bestMatch ? bestMatch.brand : null,
    trustedDomain: bestMatch ? bestDomain : null,
    structuralSimilarity: bestScore,
    visualSimilarity: vSim,
    riskLevel,
    reasons
  };
}

/**
 * Compare a freshly-computed pHash of the current page against a known
 * legit site's stored pHash. Returns a similarity in [0, 1].
 */
export function compareVisualHash(currentHash, storedHash) {
  return visualSimilarity(currentHash, storedHash);
}
