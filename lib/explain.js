/**
 * @fileoverview Transaction Explainer
 *
 * Generates a short, natural-language explanation of an analyzed
 * transaction. Uses the existing risk / diff / capabilities output
 * to compose a human-readable summary.
 *
 * Output format: 1–3 sentences, plain English, suitable for the
 * overlay's "Explain this tx" button. No external API required —
 * the explanation is built from the structured data we already have.
 *
 * Pure functions only — no chrome.*, no fetch, no I/O.
 * @module lib/explain
 */

const VERB_BY_METHOD = {
  "transfer":            "transfer",
  "approve":             "approve spending of",
  "setApprovalForAll":   "grant an operator permission to manage all of your",
  "safeTransferFrom":    "transfer",
  "swap":                "swap",
  "multicall":           "execute a batch of",
  "exec":                "execute"
};

const TOKEN_KIND = {
  "ERC-20": "tokens",
  "ERC-721": "NFTs",
  "ERC-1155": "items"
};

/**
 * Generate an explanation of the analyzed tx.
 *
 * @param {object} analysis — output of analyze()
 * @param {object} [opts]
 * @param {string} [opts.addressBook] — optional lookup map (lowercase addr → label)
 * @returns {string} 1–3 sentences
 */
export function explainTransaction(analysis, opts = {}) {
  if (!analysis || typeof analysis !== "object") {
    return "Could not analyze this transaction.";
  }

  const sentences = [];
  const diff = analysis.diff || {};
  const lines = diff.lines || [];
  const risk = analysis.risk || {};
  const target = analysis.target || "";
  const targetLabelRaw = lookupLabel(target, opts.addressBook);
  const targetLabel = targetLabelRaw && typeof targetLabelRaw === "object"
    ? (targetLabelRaw.label || null)
    : targetLabelRaw;
  const method = analysis.method || analysis.methodInfo;

  // ── Sentence 1: what the tx does ──
  if (lines.length === 0) {
    if (target) {
      sentences.push(targetLabel
        ? `This transaction interacts with ${targetLabel} (${shorten(target)}).`
        : `This transaction targets ${shorten(target)}.`);
    } else {
      sentences.push("This transaction could not be analysed in detail.");
    }
  } else if (lines.length === 1) {
    const l = lines[0];
    const verb = inferVerb(l, method);
    sentences.push(targetLabel
      ? `This transaction will ${verb} ${formatLineAmount(l)} on ${targetLabel} (${shorten(target)}).`
      : `This transaction will ${verb} ${formatLineAmount(l)} (contract ${shorten(target)}).`);
  } else {
    const total = lines.length;
    sentences.push(targetLabel
      ? `This batch transaction affects ${total} asset type${total === 1 ? "" : "s"} on ${targetLabel} (${shorten(target)}).`
      : `This batch transaction affects ${total} asset types (contract ${shorten(target)}).`);
  }

  // ── Sentence 2: what the contract can do ──
  const caps = analysis.capabilities || [];
  if (caps.length > 0 && caps.length <= 2) {
    sentences.push(`The contract can ${caps.join(" and ")}.`);
  } else if (caps.length > 2) {
    sentences.push(`The contract can ${caps[0]}, ${caps[1]}, and ${caps.length - 2} other thing${caps.length - 2 === 1 ? "" : "s"}.`);
  }

  // ── Sentence 3: risk context (only if non-trivial) ──
  const trustScore = risk.trustScore;
  if (typeof trustScore === "number" && trustScore < 50) {
    sentences.push(`Our risk score is ${trustScore}/100 — review the risk factors below carefully before signing.`);
  } else if (typeof trustScore === "number" && trustScore < 75) {
    sentences.push(`Risk score ${trustScore}/100 — there are some concerns; review them below.`);
  }

  // ── Special-case sentences for EIP-7702 / session keys ──
  if (analysis.eip7702Result && analysis.eip7702Result.riskLevel === "critical") {
    sentences.push("⚠ EIP-7702 detected: this transaction delegates your wallet to a smart contract — once signed, an attacker can drain your wallet until you sign a new delegation.");
  }
  if (analysis.sessionKeyResult && analysis.sessionKeyResult.riskLevel === "critical") {
    sentences.push("⚠ Session key: this transaction grants a session key with effectively unlimited access to your wallet.");
  }

  return sentences.join(" ");
}

function inferVerb(line, method) {
  if (method && typeof method.name === "string") {
    const name = method.name.toLowerCase();
    if (name.includes("approve")) return "approve spending of";
    if (name.includes("transfer")) return "transfer";
    if (name.includes("swap")) return "swap";
  }
  // Infer from line shape
  const symbol = (line.symbol || "").toUpperCase();
  if (["NFT", "ERC-721", "ERC-1155"].includes(symbol) || symbol.startsWith("NFT")) {
    return "transfer";
  }
  if (line.received && line.received !== "0" && line.received !== "0.0") return "swap";
  if (line.sent && line.sent !== "0" && line.sent !== "0.0") return "transfer";
  return "interact with";
}

function formatLineAmount(l) {
  const out = [];
  if (l.sent && l.sent !== "0" && l.sent !== "0.0") out.push(`send ${l.sent} ${l.symbol || ""}`.trim());
  if (l.received && l.received !== "0" && l.received !== "0.0") out.push(`receive ${l.received} ${l.symbol || ""}`.trim());
  if (out.length === 0) return `${l.symbol || "tokens"}`;
  return out.join(" and ");
}

function shorten(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function lookupLabel(addr, addressBook) {
  if (!addressBook || typeof addressBook !== "object") return null;
  return addressBook[(addr || "").toLowerCase()] || null;
}
