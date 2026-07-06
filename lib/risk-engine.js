// lib/risk-engine.js - Weighted risk scoring with factor explanations.
//
// The engine is data-driven: each rule adds a "factor" with a weight.
// The final trust score is 100 - sum(weights), clamped to [0, 100].
// The UI shows the user WHY the score is what it is.

import { KNOWN_SAFE_CONTRACTS, KNOWN_NFT_OPERATORS, SEED_BLACKLIST, SEED_BLACKLIST_DOMAINS, SEED_BLACKLIST_SELECTORS } from "./constants.js";
import { shortAddr, getMethodId } from "./decoder.js";
import { findTyposquatting } from "./typosquatting.js";

// ---------- Factor helpers ----------

const factor = (name, weight, severity, description) => ({
  name, weight, severity, description
});

// ---------- Rule: target & value ----------

function evaluateTarget(ctx) {
  const factors = [];
  const target = (ctx.target || "").toLowerCase();

  // Highest priority: known-bad address (drainer, phisher, sanctioned).
  // Check this FIRST so the factor weight can't be cancelled out by a
  // false whitelist match.
  if (target && SEED_BLACKLIST.has(target)) {
    factors.push(factor(
      "Known-Bad Address (drainer / phisher)",
      +80, "critical",
      `${shortAddr(ctx.target)} is in the WalletGuard blacklist. Funds sent here are unrecoverable.`
    ));
    // No further checks needed — a blacklisted target is always CRITICAL.
    return factors;
  }

  if (target && KNOWN_SAFE_CONTRACTS.has(target)) {
    factors.push(factor(
      "Verified Protocol Contract",
      -20, "positive",
      `${shortAddr(ctx.target)} is in the WalletGuard trust database.`
    ));
  } else if (target && ctx.data && ctx.data !== "0x") {
    factors.push(factor(
      "Unknown Contract",
      +10, "medium",
      `${shortAddr(ctx.target)} is not in the local verified contract registry.`
    ));
  } else if (target && (!ctx.data || ctx.data === "0x")) {
    // Plain ETH transfer - target is the recipient address.
    factors.push(factor(
      "Unknown Recipient",
      +10, "medium",
      `${shortAddr(ctx.target)} is not in the verified recipient list.`
    ));
  }

  if (ctx.from && target && ctx.from.toLowerCase() === target) {
    factors.push(factor(
      "Self-Send",
      +10, "medium",
      "Sender and recipient are the same address. Unusual, may indicate a setup call."
    ));
  }

  if (ctx.ethFloat >= 5) {
    factors.push(factor(
      `Large ETH Transfer (${ctx.ethValue} ETH)`,
      +30, "high",
      "Outflows of 5+ ETH are commonly targeted by drainers."
    ));
  } else if (ctx.ethFloat >= 1) {
    factors.push(factor(
      `Medium ETH Transfer (${ctx.ethValue} ETH)`,
      +15, "medium",
      "Outflows of 1+ ETH warrant attention."
    ));
  } else if (ctx.ethFloat > 0) {
    factors.push(factor(
      `Outbound ETH (${ctx.ethValue} ETH)`,
      +5, "low",
      "Small native ETH outflow."
    ));
  }

  return factors;
}

// ---------- Rule: methods & decoded args ----------

function evaluateMethods(ctx) {
  const factors = [];
  const methodId = getMethodId(ctx.data || "");

  if (!methodId) return factors;

  // Selector-level blacklist check first - some selectors are CRITICAL
  // regardless of the target contract (e.g. setApprovalForAll always
  // grants root access to a collection).
  if (SEED_BLACKLIST_SELECTORS.has(methodId)) {
    factors.push(factor(
      "Known-Bad Selector",
      +50, "critical",
      `Method ${methodId} is in the WalletGuard blacklist.`
    ));
  }

  switch (methodId) {
    case "0x095ea7b3": { // approve
      if (ctx.decoded && ctx.decoded.isUnlimited) {
        factors.push(factor(
          "Unlimited Token Approval",
          +30, "high",
          `${shortAddr(ctx.decoded.spender)} can withdraw ALL of this token from your wallet at any time.`
        ));
      } else if (ctx.decoded) {
        factors.push(factor(
          "Limited Token Approval",
          +8, "low",
          `Approval is capped to a specific amount; still exposes funds if the spender is malicious.`
        ));
      }
      break;
    }
    case "0xa22cb465": { // setApprovalForAll
      const operator = (ctx.decoded && ctx.decoded.operator || "").toLowerCase();
      // Known marketplace operators (OpenSea, Blur, LooksRare) legitimately
      // request this when listing NFTs. Don't punish legitimate flows.
      if (KNOWN_NFT_OPERATORS.has(operator)) {
        factors.push(factor(
          "NFT Listing Approval (Known Marketplace)",
          +5, "low",
          `${shortAddr(ctx.decoded?.operator)} is a verified NFT marketplace. Standard listing flow.`
        ));
      } else {
        factors.push(factor(
          "NFT Approval For All",
          +40, "critical",
          `${shortAddr(ctx.decoded?.operator)} gains root access to EVERY NFT in this collection.`
        ));
      }
      break;
    }
    case "0x23b872dd": { // transferFrom
      factors.push(factor(
        "TransferFrom (Pull Tokens)",
        +20, "high",
        "A third party is pulling tokens out of your wallet. Top method used by drainers."
      ));
      break;
    }
    case "0x42842e0e":
    case "0xb88d4fde": { // NFT safeTransferFrom
      factors.push(factor(
        "NFT Outflow",
        +15, "medium",
        `NFT #${ctx.decoded?.tokenId || "?"} will leave your wallet.`
      ));
      break;
    }
    case "0xac9650d8":
    case "0x5ae401dc":
    case "0x1745e9d0":
    case "0xee8b7563": { // multicall
      factors.push(factor(
        "Multicall Wrapper",
        +5, "low",
        `Bundles ${ctx.innerCalls?.length || "?"} subcall(s). Each is decoded below.`
      ));
      break;
    }
    case "0x3593564c":
    case "0x248cbc34": { // Universal Router execute
      factors.push(factor(
        "Universal Router (Uniswap)",
        0, "info",
        `Executes ${ctx.urCommands?.length || "?"} router command(s) in sequence.`
      ));
      break;
    }
    case "0x1f0464d1":
    case "0x8b7f1068":
    case "0x301a5c2c": { // Bridges
      factors.push(factor(
        "Bridge Transaction",
        +5, "low",
        "Cross-chain bridge. Verify the destination chain and asset carefully."
      ));
      break;
    }
  }

  if (ctx.unknownMethod) {
    factors.push(factor(
      "Unknown Method",
      +8, "low",
      `Method ${methodId} is not in the local signature library.`
    ));
  }

  // Recursive: each inner call contributes its own factors.
  if (ctx.innerFactors && ctx.innerFactors.length) {
    for (const inner of ctx.innerFactors) {
      factors.push(...inner.factors);
    }
  }

  return factors;
}

// ---------- Rule: signatures ----------

function evaluateSignature(ctx) {
  const factors = [];
  if (ctx.isEIP712 && ctx.permitDetails) {
    const unlimited = ctx.permitDetails.value === "Unlimited" ||
      /^f{15,}/i.test(ctx.permitDetails.value);
    factors.push(factor(
      unlimited ? "Unlimited Permit (off-chain)" : "Limited Permit (off-chain)",
      unlimited ? +40 : +20,
      unlimited ? "critical" : "high",
      unlimited
        ? `Off-chain signature granting UNLIMITED spending to ${ctx.permitDetails.spender}.`
        : `Off-chain signature allowing ${ctx.permitDetails.value} spend via ${ctx.permitDetails.spender}.`
    ));
  }
  if (ctx.isPersonalSign || ctx.isLegacySign) {
    factors.push(factor(
      "Blind Signature",
      +15, "medium",
      "Signing arbitrary data off-chain. Phishers encode Permit/Order payloads here."
    ));
  }
  return factors;
}

// ---------- Rule: whitelist bonus ----------

function evaluateWhitelist(ctx) {
  const factors = [];
  const target = (ctx.target || "").toLowerCase();
  // Whitelist never overrides a known-bad address. A user who has
  // whitelisted a drainer (perhaps via a tampered import or stale state)
  // should still see the CRITICAL warning.
  if (target && SEED_BLACKLIST.has(target)) return factors;
  if (target && ctx.trustedAddresses && ctx.trustedAddresses.has(target)) {
    factors.push(factor(
      "Whitelisted Address",
      -15, "positive",
      `${shortAddr(ctx.target)} is in your personal whitelist.`
    ));
  }
  return factors;
}

// ---------- Rule: domain impersonation (typosquatting) ----------

function evaluateDomain(ctx) {
  if (!ctx.hostname) return [];

  // Direct blacklist match takes priority over fuzzy typosquat detection.
  // A hostname that exactly matches a known-bad domain gets the highest
  // weight — this is the "real" phisher, not a squatter.
  // Strip an optional "www." prefix so "www.unisvvap.org" is caught too.
  const host = ctx.hostname.toLowerCase();
  const hostNoWww = host.startsWith("www.") ? host.slice(4) : host;
  if (SEED_BLACKLIST_DOMAINS.has(host) || SEED_BLACKLIST_DOMAINS.has(hostNoWww)) {
    return [factor(
      "Known-Bad Domain (drainer / phisher)",
      +80, "critical",
      `${ctx.hostname} is in the WalletGuard blacklist. Do not connect your wallet.`
    )];
  }

  const verdict = findTyposquatting(ctx.hostname);
  if (!verdict) return [];

  if (verdict.type === "trusted") {
    return [factor(
      "Trusted Site",
      -15, "positive",
      `${ctx.hostname} matches a known-good protocol (${verdict.match}).`
    )];
  }

  if (verdict.type === "typosquat") {
    return [factor(
      "Possible Typosquatting",
      +40, "critical",
      `${ctx.hostname} is ${verdict.distance} character(s) away from ${verdict.match}. ` +
      `This is a common phishing tactic — verify the URL before approving.`
    )];
  }

  if (verdict.type === "subdomain-attack") {
    return [factor(
      "Subdomain Impersonation",
      +45, "critical",
      `${ctx.hostname} contains "${verdict.match}" but its real domain is different. ` +
      `Classic phishing pattern — the trusted name is a subdomain, not the real site.`
    )];
  }

  if (verdict.type === "homoglyph") {
    const target = verdict.match
      ? `looks identical to ${verdict.match}`
      : "uses non-ASCII characters that may mimic a trusted site";
    return [factor(
      "IDN / Homoglyph Attack",
      +45, "critical",
      `${ctx.hostname} ${target}. Internationalized domain names are a known phishing vector.`
    )];
  }

  return [];
}

// ---------- Score derivation ----------

function levelFromScore(score) {
  if (score < 30) return { level: "CRITICAL RISK", color: "#ff3333" };
  if (score < 55) return { level: "HIGH RISK",    color: "#ff4d4d" };
  if (score < 75) return { level: "WARNING",      color: "#ffb700" };
  if (score < 90) return { level: "LOW RISK",     color: "#00ff66" };
  return           { level: "SAFE",          color: "#00ffcc" };
}

// ---------- Public API ----------

// ctx = {
//   target, from, value, data, ethValue, ethFloat,
//   decoded, unknownMethod,
//   innerCalls, innerFactors,
//   urCommands,
//   isEIP712, isPersonalSign, isLegacySign, permitDetails,
//   trustedAddresses,
//   hostname             // window.location.hostname (without leading www.)
// }
//
// Returns { trustScore, riskLevel, accentColor, factors, domainVerdict }
export function computeRisk(ctx) {
  const domainVerdict = ctx.hostname ? findTyposquatting(ctx.hostname) : null;

  const factors = [
    ...evaluateTarget(ctx),
    ...evaluateMethods(ctx),
    ...evaluateSignature(ctx),
    ...evaluateWhitelist(ctx),
    ...evaluateDomain(ctx)
  ];

  // Compound rules — combinations of factors that amplify risk.
  const has = (name) => factors.some((f) => f.name === name);
  const target = (ctx.target || "").toLowerCase();
  const isVerified = KNOWN_SAFE_CONTRACTS.has(target);
  const isWhitelisted = ctx.trustedAddresses && ctx.trustedAddresses.has(target);

  if (has("Unlimited Token Approval") && !isVerified && !isWhitelisted) {
    factors.push(factor(
      "Compound: Unlimited Approval to Unverified Contract",
      +25, "critical",
      "This is the exact pattern used by drainer sites."
    ));
  }

  if (has("NFT Approval For All") && !isVerified && !isWhitelisted) {
    factors.push(factor(
      "Compound: NFT Root Access to Unverified Contract",
      +20, "critical",
      "Full NFT custody to an unverified operator is a top drainer tactic."
    ));
  }

  if (has("TransferFrom (Pull Tokens)") && has("Unknown Contract")) {
    factors.push(factor(
      "Compound: Pull Tokens from Unverified Source",
      +15, "high",
      "Pulling tokens from an unverified contract — common drainer pattern."
    ));
  }

  if (has("Unknown Recipient") && ctx.ethFloat >= 1) {
    factors.push(factor(
      "Compound: Native ETH to Unverified Address",
      +20, "high",
      "Sending native ETH to an unverified recipient. Double-check the address."
    ));
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const rawScore = 100 - totalWeight;
  const trustScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  const { level, color } = levelFromScore(trustScore);

  return {
    trustScore,
    riskLevel: level,
    accentColor: color,
    factors,
    domainVerdict
  };
}
