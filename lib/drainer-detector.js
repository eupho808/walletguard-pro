/**
 * @fileoverview Drainer Pattern Detector
 *
 * Detects "drain everything" function patterns that characterise
 * wallet-drainer malware. Two detection layers:
 *
 *   1. **Function selector signatures** — patterns of standard
 *      transferFrom / setApprovalForAll / safeTransferFrom calls
 *      inside a single calldata that suggest a draining operation.
 *
 *   2. **Bytecode fingerprints** — runtime bytecode hashes for
 *      contracts identified by the community as drainers (e.g.
 *      Inferno Drainer, Rainbow Drainer, Pink Drainer variants).
 *
 * Pure functions only — no chrome.*, no fetch, no I/O.
 * @module lib/drainer-detector
 */

/**
 * Function-selector-level red flags. A selector matches when it appears
 * inside a calldata AND is followed by arguments that look like an
 * owner address (32 bytes left-padded with zeros) — the canonical
 * drainer pattern of "transferFrom(owner, attacker, balance)".
 */
export const DRAINER_SELECTORS = Object.freeze([
  // Standard ERC-20 + ERC-721 transfer primitives that drainers abuse.
  { selector: "0xa9059cbb", name: "transfer(address,uint256)",          category: "erc20-transfer"     },
  { selector: "0x23b872dd", name: "transferFrom(address,address,uint256)", category: "erc20-transferFrom" },
  { selector: "0x42842e0e", name: "safeTransferFrom(address,address,uint256)", category: "erc721-safeTransferFrom" },
  { selector: "0xb88d4fde", name: "safeTransferFrom(address,address,uint256,bytes)", category: "erc721-safeTransferFrom-data" },
  { selector: "0xa22cb465", name: "setApprovalForAll(address,bool)",   category: "erc721-setApprovalForAll" },
  { selector: "0x095ea7b3", name: "approve(address,uint256)",           category: "erc20-approve"     },
  // ERC-1155
  { selector: "0xf242432a", name: "safeTransferFrom(address,address,uint256,uint256,bytes)", category: "erc1155-safeTransferFrom" },
  { selector: "0x2eb2c2d6", name: "safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)", category: "erc1155-safeBatchTransferFrom" },
  // Permit variants used in phishing
  { selector: "0xd505accf", name: "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", category: "permit" },
  { selector: "0x7ac09bf7", name: "Permit2.permit(...)",               category: "permit2"           }
]);

/**
 * Runtime-bytecode fingerprints of confirmed drainer contracts.
 * Populated via the threat intelligence feed (lib/threat-feed.js).
 *
 * For the seed set we include a few publicly-verified drainer bytecode
 * hashes (the values here are placeholders documented in THREATS.md
 * — replace with verified hashes from on-chain forensics).
 */
export const KNOWN_DRAINER_BYTECODES = Object.freeze([
  // { hash: "0x...", name: "Inferno Drainer v3", reference: "https://..." },
  // { hash: "0x...", name: "Pink Drainer", reference: "https://..." },
  // { hash: "0x...", name: "MS Drainer", reference: "https://..." }
]);

/**
 * Universal-router and similar DeFi-router selectors that drainers wrap
 * around to look legit. Heuristic: calldata contains a nested call
 * to one of these selectors targeting an attacker-pattern address.
 */
export const KNOWN_ROUTER_TARGETS = Object.freeze([
  { selector: "0x414bf389", name: "execute(bytes,bytes[])",      router: "Universal Router 2", category: "swap" },
  { selector: "0x3593564c", name: "execute(address,uint256,bytes)", router: "Uniswap V3 Universal Router", category: "swap" },
  { selector: "0x5f575529", name: "swap((bytes32,uint256,uint256,bytes,bool))", router: "1inch swap", category: "swap" }
]);

// ─── Helpers ────────────────────────────────────────────────

function normalizeHex(input) {
  if (typeof input !== "string") return "";
  return input.startsWith("0x") ? input.toLowerCase() : "0x" + input.toLowerCase();
}

function pad32(addr) {
  if (!addr || typeof addr !== "string") return null;
  const clean = addr.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(clean)) return null;
  return "0x" + "0".repeat(24) + clean;
}

/**
 * Extract every 4-byte selector from a calldata.
 * @param {string} calldata
 * @returns {string[]} unique lowercase selectors (with 0x prefix)
 */
export function extractSelectors(calldata) {
  if (!calldata || typeof calldata !== "string") return [];
  const hex = calldata.startsWith("0x") ? calldata.slice(2) : calldata;
  const out = new Set();
  // Skip first 4 bytes (the top-level selector) — we look at the whole hex.
  for (let i = 0; i + 8 <= hex.length; i += 2) {
    const sel = "0x" + hex.slice(i, i + 8).toLowerCase();
    out.add(sel);
  }
  return [...out];
}

/**
 * Count occurrences of a specific selector in a calldata.
 */
function countSelector(hex, sel) {
  if (!hex || !sel) return 0;
  const h = hex.toLowerCase();
  const s = sel.toLowerCase().replace(/^0x/, "");
  let count = 0;
  let idx = 0;
  while ((idx = h.indexOf(s, idx)) !== -1) { count++; idx += 8; }
  return count;
}

// ─── Detection logic ────────────────────────────────────────

/**
 * Detect drainer-style calldata. Returns a structured assessment.
 *
 * Detection rules (each contributes to `risks[]` and bumps `riskLevel`):
 *   1. 3+ different transfer selectors in one calldata → likely drainer
 *   2. transferFrom with `from` = attacker-controlled address → high
 *   3. setApprovalForAll to non-zero address → medium (depends on context)
 *   4. Permit with max-uint256 value → high
 *   5. Multicall wrapping 2+ draining selectors → high
 *   6. Approve + transferFrom combo → high (atomic approve-and-drain)
 *
 * @param {object} tx — { data, to, from, value? }
 * @param {object} [ctx]
 * @param {string} [ctx.userAddress] — for `from`-vs-user comparison
 * @returns {{
 *   riskLevel: "none"|"low"|"medium"|"high"|"critical",
 *   risks: Array,
 *   recommendations: string[],
 *   info: Array,
 *   selectors: string[]
 * }}
 */
export function detectDrainerCalldata(tx, ctx = {}) {
  const risks = [];
  const recommendations = [];
  const info = [];

  if (!tx || typeof tx.data !== "string" || tx.data === "0x" || tx.data.length < 10) {
    return { riskLevel: "none", risks, recommendations, info, selectors: [] };
  }

  const data = tx.data.toLowerCase();
  const selectors = extractSelectors(data);
  const selSet = new Set(selectors);

  // ── 1. Selector variety ──
  const transferSels = DRAINER_SELECTORS.filter((d) => selSet.has(d.selector));
  if (transferSels.length >= 3) {
    risks.push({
      type: "many-transfer-selectors",
      severity: "high",
      message: `Calldata uses ${transferSels.length} different transfer-style function calls. This pattern is characteristic of drainer malware that sweeps multiple token standards in one tx.`,
      details: { selectors: transferSels.map((s) => s.selector) }
    });
  }

  // ── 2. transferFrom with mismatched `from` ──
  const tfSel = "0x23b872dd";
  const stfSel721 = "0x42842e0e";
  const stfSel721Data = "0xb88d4fde";
  const tfSelectors = [tfSel, stfSel721, stfSel721Data];
  if (ctx.userAddress && transferSels.some((s) => tfSelectors.includes(s.selector))) {
    const padded = pad32(ctx.userAddress);
    if (padded) {
      // Look at the FIRST arg of the FIRST transferFrom call
      const idx = data.indexOf(tfSel.slice(2));
      if (idx >= 0) {
        // Selector is 4 bytes; first arg starts at offset 4 (8 hex chars)
        const firstArg = "0x" + data.slice(idx + 8, idx + 8 + 64);
        if (firstArg !== padded) {
          risks.push({
            type: "transferfrom-with-foreign-owner",
            severity: "critical",
            message: `transferFrom(address,...) called with a 'from' address (${firstArg}) that is NOT your wallet (${padded}). This pattern transfers tokens owned by a third party — almost always a drainer.`,
            details: { fromInCall: firstArg, userAddress: padded }
          });
        }
      }
    }
  }

  // ── 3. setApprovalForAll to non-zero address ──
  const sa4Sel = "0xa22cb465";
  if (selSet.has(sa4Sel)) {
    const idx = data.indexOf(sa4Sel.slice(2));
    if (idx >= 0) {
      // Arg1 = address (32 bytes), Arg2 = bool
      const arg1 = "0x" + data.slice(idx + 8, idx + 8 + 64);
      const arg2End = idx + 8 + 128;
      const arg2 = data.slice(arg2End - 64, arg2End);
      // bool is non-zero if last byte != 0
      const boolTrue = arg2.slice(-1) !== "0".repeat(1) && !/^0+$/.test(arg2);
      const isNonZero = !/^0+$/.test(arg1.slice(2));
      if (boolTrue && isNonZero) {
        const severity = ctx.userAddress && arg1 !== pad32(ctx.userAddress) ? "high" : "medium";
        risks.push({
          type: "setApprovalForAll-true",
          severity,
          message: `setApprovalForAll(address=${arg1}, bool=true) — grants operator access to ALL your NFTs of this collection.`,
          details: { operator: arg1 }
        });
      }
    }
  }

  // ── 4. Permit with max-uint256 value ──
  const permitSel = "0xd505accf";
  if (selSet.has(permitSel)) {
    const idx = data.indexOf(permitSel.slice(2));
    if (idx >= 0) {
      // args: owner, spender, value, deadline, v, r, s
      // value is at offset 3*32 = byte 192 of params (after selector)
      const valueHex = data.slice(idx + 8 + 2 * 64, idx + 8 + 3 * 64);
      if (valueHex === "f".repeat(64)) {
        risks.push({
          type: "permit-unlimited",
          severity: "high",
          message: "Permit signature grants max-uint256 spending allowance. This is the canonical unlimited-permit pattern used by phishing sites.",
          details: { value: "0x" + valueHex }
        });
      }
    }
  }

  // ── 5. Multicall wrapping multiple draining selectors ──
  // Multicall3 selector: 0xac9650d8 (multicall(bytes[]))
  // Multicall2 selector: 0x70133858 (tryAggregate(bool,tuple[]))
  const multi3 = "0xac9650d8";
  const multi2 = "0x70133858";
  const isMulticall = selSet.has(multi3) || selSet.has(multi2);
  if (isMulticall && transferSels.length >= 2) {
    risks.push({
      type: "multicall-drain",
      severity: "high",
      message: `Multicall wrapping ${transferSels.length} drainer-style transfer calls. Multi-asset sweepers use this exact pattern.`
    });
  }

  // ── 6. Atomic approve + transferFrom (very common drainer shape) ──
  const approveSel = "0x095ea7b3";
  const hasApprove = selSet.has(approveSel);
  const hasTransferFrom = transferSels.some((s) => s.selector === tfSel || s.selector === stfSel721);
  if (hasApprove && hasTransferFrom && (countSelector(data, approveSel) + countSelector(data, tfSel) >= 2)) {
    risks.push({
      type: "approve-and-drain",
      severity: "high",
      message: "Calldata contains both approve() and transferFrom() — the classic 'grant unlimited, then sweep' drainer shape."
    });
  }

  // ── Bytecode fingerprint check ──
  if (tx.bytecodeHash && typeof tx.bytecodeHash === "string") {
    const bc = normalizeHex(tx.bytecodeHash);
    const match = KNOWN_DRAINER_BYTECODES.find((b) => normalizeHex(b.hash) === bc);
    if (match) {
      risks.push({
        type: "known-drainer-bytecode",
        severity: "critical",
        message: `Target contract runtime bytecode matches known drainer: ${match.name}`,
        details: { hash: bc, reference: match.reference }
      });
    }
  }

  // ── Recommendations ──
  const seen = new Set();
  function rec(text) { if (!seen.has(text)) { recommendations.push(text); seen.add(text); } }
  if (risks.some((r) => r.severity === "critical")) {
    rec("CRITICAL drainer pattern detected. Do NOT sign. The transaction tries to move assets you don't expect to lose.");
  }
  if (risks.length > 0) {
    rec("If you don't fully understand why every function call in this tx is necessary, reject it.");
    rec("Use a hardware wallet for any tx that grants new approvals or sends from your main wallet.");
  }

  // ── Aggregate risk ──
  const order = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  let riskLevel = "none";
  for (const r of risks) if (order[r.severity] > order[riskLevel]) riskLevel = r.severity;

  return { riskLevel, risks, recommendations, info, selectors };
}

/**
 * Match a contract's runtime bytecode hash against the drainer registry.
 * Pure lookup; the actual eth_getCode call happens in the caller.
 * @param {string} bytecodeHash
 * @returns {{ match: boolean, entry: object|null }}
 */
export function matchDrainerBytecode(bytecodeHash) {
  if (!bytecodeHash) return { match: false, entry: null };
  const bc = normalizeHex(bytecodeHash);
  const entry = KNOWN_DRAINER_BYTECODES.find((b) => normalizeHex(b.hash) === bc) || null;
  return { match: !!entry, entry };
}
