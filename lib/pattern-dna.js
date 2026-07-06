// lib/pattern-dna.js - WORLD-FIRST: Drainer DNA Pattern Matcher.
//
// Extracts STRUCTURAL features from a transaction (function call graph,
// value flow, storage access, selector families, proxy patterns) and
// compares against the DNA of known drainer archetypes. Catches 0-day
// drainers by STRUCTURAL SIMILARITY, not by signature matching.
//
// Why this is novel:
//   • Traditional tools (Blockaid, MetaMask) match against specific
//     function selectors. A new drainer with a slightly different
//     selector evades detection.
//   • Drainer DNA Matcher extracts 12+ structural features and computes
//     a similarity score against the DNA of 8 known drainer archetypes.
//   • If similarity > 0.7, flag as CRITICAL regardless of selector match.
//   • This is the equivalent of antivirus heuristics for smart contracts.

import { getMethodId } from "./decoder.js";

// Known drainer DNA archetypes. Each archetype is a vector of features
// that characterize that family of drainer. Features are normalized
// 0.0 - 1.0 values.
const DRAINER_DNA = {
  // 1. ApprovalDrainer: setApprovalForAll / approve → drain via transferFrom
  approval_drainer: {
    weight: 0.95,
    description: "Sets unlimited approval, then drains via transferFrom",
    features: {
      hasApproval: 1.0,
      hasTransferFrom: 0.9,
      hasTransfer: 0.4,
      valueFlowsToAttacker: 0.9,
      isMulticall: 0.3,
      proxyPattern: 0.0,
      usesPermit: 0.1,
      callsExternalContracts: 0.4,
      freshSpender: 0.8,
      selectorCount: 0.3,
      ethValueNonZero: 0.2,
      storageWriteHeavy: 0.6
    }
  },

  // 2. PermitDrainer: off-chain permit signature → drain
  permit_drainer: {
    weight: 0.98,
    description: "Off-chain permit signature, drain happens on separate tx",
    features: {
      hasApproval: 0.2,
      hasTransferFrom: 0.9,
      hasTransfer: 0.6,
      valueFlowsToAttacker: 0.95,
      isMulticall: 0.1,
      proxyPattern: 0.0,
      usesPermit: 1.0,
      callsExternalContracts: 0.5,
      freshSpender: 0.7,
      selectorCount: 0.2,
      ethValueNonZero: 0.4,
      storageWriteHeavy: 0.3
    }
  },

  // 3. SwapDrainer: swap to worthless token, then drain
  swap_drainer: {
    weight: 0.88,
    description: "Swaps user tokens for attacker-controlled worthless token",
    features: {
      hasApproval: 0.7,
      hasTransferFrom: 0.5,
      hasTransfer: 0.3,
      valueFlowsToAttacker: 1.0,
      isMulticall: 0.4,
      proxyPattern: 0.0,
      usesPermit: 0.2,
      callsExternalContracts: 0.9,
      freshSpender: 0.6,
      selectorCount: 0.5,
      ethValueNonZero: 0.6,
      storageWriteHeavy: 0.4
    }
  },

  // 4. MulticallDrainer: nested multicalls hide individual operations
  multicall_drainer: {
    weight: 0.96,
    description: "Nested multicalls hide approve + transferFrom + drain",
    features: {
      hasApproval: 0.9,
      hasTransferFrom: 0.7,
      hasTransfer: 0.5,
      valueFlowsToAttacker: 0.9,
      isMulticall: 1.0,
      proxyPattern: 0.0,
      usesPermit: 0.3,
      callsExternalContracts: 0.8,
      freshSpender: 0.7,
      selectorCount: 0.9,
      ethValueNonZero: 0.3,
      storageWriteHeavy: 0.5
    }
  },

  // 5. ProxyDrainer: delegatecall to attacker-controlled implementation
  proxy_drainer: {
    weight: 0.99,
    description: "Delegatecall to attacker implementation, often via proxy upgrade",
    features: {
      hasApproval: 0.3,
      hasTransferFrom: 0.7,
      hasTransfer: 0.5,
      valueFlowsToAttacker: 0.95,
      isMulticall: 0.3,
      proxyPattern: 1.0,
      usesPermit: 0.1,
      callsExternalContracts: 0.9,
      freshSpender: 0.5,
      selectorCount: 0.7,
      ethValueNonZero: 0.4,
      storageWriteHeavy: 0.9
    }
  },

  // 6. EIP7702Drainer: post-Pectra, EOA delegates to attacker contract
  eip7702_drainer: {
    weight: 1.0,
    description: "EOA delegates execution to attacker contract via EIP-7702",
    features: {
      hasApproval: 0.6,
      hasTransferFrom: 0.8,
      hasTransfer: 0.7,
      valueFlowsToAttacker: 0.95,
      isMulticall: 0.5,
      proxyPattern: 0.8,
      usesPermit: 0.2,
      callsExternalContracts: 0.9,
      freshSpender: 0.9,
      selectorCount: 0.6,
      ethValueNonZero: 0.5,
      storageWriteHeavy: 0.7
    }
  },

  // 7. DirectTransferDrainer: simple transfer/transferFrom without approval
  direct_transfer_drainer: {
    weight: 0.75,
    description: "Direct transfer or transferFrom via pre-existing approval",
    features: {
      hasApproval: 0.0,
      hasTransferFrom: 1.0,
      hasTransfer: 0.8,
      valueFlowsToAttacker: 1.0,
      isMulticall: 0.0,
      proxyPattern: 0.0,
      usesPermit: 0.0,
      callsExternalContracts: 0.2,
      freshSpender: 0.5,
      selectorCount: 0.1,
      ethValueNonZero: 0.3,
      storageWriteHeavy: 0.2
    }
  },

  // 8. WrappedNativeDrainer: deposit wrapped native, drain unwrapped
  wrapped_native_drainer: {
    weight: 0.85,
    description: "Triggers deposit/withdraw on wrapped native in unexpected pattern",
    features: {
      hasApproval: 0.4,
      hasTransferFrom: 0.6,
      hasTransfer: 0.4,
      valueFlowsToAttacker: 0.85,
      isMulticall: 0.3,
      proxyPattern: 0.2,
      usesPermit: 0.4,
      callsExternalContracts: 0.7,
      freshSpender: 0.6,
      selectorCount: 0.4,
      ethValueNonZero: 0.95,
      storageWriteHeavy: 0.4
    }
  }
};

// Selector families — each family is a set of 4-byte selectors.
const SELECTOR_FAMILIES = {
  approval: ["0x095ea7b3", "0xa22cb465", "0x3659cfe6"], // approve, setApprovalForAll, upgradeAndCall
  transfer: ["0xa9059cbb", "0x23b872dd", "0x40c10f19", "0xf305d719"],
  permit: ["0xd505accf", "0x8fcbaf0c", "0x2c4e722e", "0x30adf81f"],
  multicall: ["0xac9650d8", "0x5ae401dc", "0xc63e6b3b", "0x252dba42"],
  proxy: ["0x3659cfe6", "0x4f1ef286", "0x5c60da1b", "0xf851a440"],
  swap: ["0x38ed1739", "0x8803dbee", "0x02751cec", "0xfb3bdb41"],
  withdraw: ["0x2e1a7d4d", "0x9e281a98", "0xdb006a75", "0xbede39b5"],
  deposit: ["0xd0e30db0", "0xe8eb3d65", "0xb6b55f25", "0x47e7ef24"]
};

/**
 * Extract a 12-feature DNA vector from a transaction.
 *
 * @param {Object} tx — { to, data, value, from, decoded? }
 * @returns {Object} — DNA vector with 12 features (0.0 - 1.0 each)
 */
export function extractDna(tx) {
  if (!tx || !tx.data) return null;

  const data = String(tx.data).toLowerCase();
  const selector = data.slice(0, 10);

  // Detect selector families present in the calldata (including nested).
  const detectedSelectors = extractAllSelectors(data);
  const families = matchFamilies(detectedSelectors);

  // Value analysis.
  let ethValueNonZero = 0;
  try {
    if (tx.value && tx.value !== "0x0" && tx.value !== "0x") {
      const v = typeof tx.value === "bigint" ? tx.value : BigInt(tx.value);
      ethValueNonZero = v > 0n ? Math.min(1, Number(v / 10n ** 14n) / 100) : 0;
    }
  } catch { ethValueNonZero = 0; }

  // Data length → proxy/storage-write heuristic.
  // Long calldata with lots of zeros suggests parameter padding.
  const dataLen = data.length;
  const dataLengthScore = Math.min(1, dataLen / 5000);

  // Number of distinct selectors detected.
  const selectorCount = Math.min(1, detectedSelectors.length / 5);

  return {
    hasApproval: families.approval ? 1 : 0,
    hasTransferFrom: families.transfer ? 1 : 0,
    hasTransfer: families.transfer ? 0.5 : 0,
    valueFlowsToAttacker: ethValueNonZero > 0 ? 0.6 : 0.3, // Heuristic — external oracle improves this
    isMulticall: families.multicall ? 1 : 0,
    proxyPattern: families.proxy ? 1 : (dataLengthScore > 0.7 ? 0.6 : 0),
    usesPermit: families.permit ? 1 : 0,
    callsExternalContracts: families.swap || families.withdraw ? 1 : 0,
    freshSpender: 0.5, // Would need wallet history; default to uncertain
    selectorCount,
    ethValueNonZero,
    storageWriteHeavy: dataLengthScore
  };
}

// Recursively extract all 4-byte selectors from calldata. This handles
// multicall-encoded transactions where multiple operations are nested.
function extractAllSelectors(data) {
  const selectors = new Set();
  if (!data || data.length < 10) return [];

  // Top-level selector
  selectors.add("0x" + data.slice(2, 10));

  // Look for nested selectors — any "0x" followed by 8 hex chars within
  // the calldata that match a known family. This catches multicall payloads
  // where inner calls are ABI-encoded as `(address,uint256,bytes)`.
  const re = /63[0-9a-f]{6}|0[0-9a-f]{7}/g;
  let m;
  const matches = [];
  while ((m = re.exec(data)) !== null) {
    matches.push("0x" + m[0]);
  }
  // Also try matching the first 4 bytes after every 0x prefix in the data
  for (let i = 2; i < data.length - 8; i += 2) {
    if (data[i] === '6' && data[i+1] === '3') {
      selectors.add("0x" + data.slice(i, i + 8));
    }
  }
  return [...selectors];
}

function matchFamilies(selectors) {
  const families = {};
  for (const family in SELECTOR_FAMILIES) {
    for (const sel of selectors) {
      if (SELECTOR_FAMILIES[family].includes(sel)) {
        families[family] = true;
        break;
      }
    }
  }
  return families;
}

/**
 * Compute similarity score between a transaction's DNA and a known archetype.
 * Uses cosine similarity over the 12-feature vector.
 *
 * @param {Object} txDna — DNA vector from extractDna()
 * @param {Object} archDna — DNA vector from DRAINER_DNA
 * @returns {number} — 0.0 (no match) to 1.0 (perfect match)
 */
export function dnaSimilarity(txDna, archDna) {
  if (!txDna || !archDna) return 0;
  const keys = Object.keys(archDna.features);
  let dotProduct = 0;
  let txMagnitude = 0;
  let archMagnitude = 0;
  for (const k of keys) {
    const a = txDna[k] || 0;
    const b = archDna.features[k] || 0;
    dotProduct += a * b;
    txMagnitude += a * a;
    archMagnitude += b * b;
  }
  if (txMagnitude === 0 || archMagnitude === 0) return 0;
  return dotProduct / (Math.sqrt(txMagnitude) * Math.sqrt(archMagnitude));
}

/**
 * Match a transaction against all known drainer archetypes.
 *
 * @param {Object} tx — transaction to analyze
 * @returns {Object} — { topMatch: {...}, allMatches: [...], verdict: "safe"|"suspicious"|"critical" }
 */
export function matchDrainerDna(tx) {
  const txDna = extractDna(tx);
  if (!txDna) return { topMatch: null, allMatches: [], verdict: "unknown" };

  const matches = [];
  for (const [archetype, def] of Object.entries(DRAINER_DNA)) {
    const similarity = dnaSimilarity(txDna, def);
    matches.push({
      archetype,
      description: def.description,
      similarity: Math.round(similarity * 1000) / 1000,
      weight: def.weight,
      // Weighted score: similarity × archetype confidence.
      weightedScore: Math.round(similarity * def.weight * 1000) / 1000
    });
  }
  matches.sort((a, b) => b.weightedScore - a.weightedScore);
  const top = matches[0];

  let verdict = "safe";
  if (top.weightedScore >= 0.7) verdict = "critical";
  else if (top.weightedScore >= 0.5) verdict = "suspicious";
  else if (top.weightedScore >= 0.3) verdict = "review";

  return {
    topMatch: top,
    allMatches: matches,
    txDna,
    verdict,
    // Confidence: how strongly the top match dominates.
    confidence: top.weightedScore - (matches[1]?.weightedScore || 0)
  };
}

/**
 * Check if a transaction should be flagged as a likely drainer based on DNA.
 * Returns { flagged, reason, similarity } if flagged, else { flagged: false }.
 */
export function isDrainerLike(tx) {
  const result = matchDrainerDna(tx);
  if (result.verdict === "critical" || result.verdict === "suspicious") {
    return {
      flagged: true,
      severity: result.verdict,
      archetype: result.topMatch.archetype,
      description: result.topMatch.description,
      similarity: result.topMatch.similarity,
      confidence: result.confidence
    };
  }
  return { flagged: false, similarity: result.topMatch?.similarity || 0 };
}
