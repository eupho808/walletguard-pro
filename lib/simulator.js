// lib/simulator.js - Asset Diff Engine.
//
// Produces a list of asset changes ("OUT: 0.5 ETH", "IN: 100 USDC") for display.
// Without an RPC connection we can only produce best-effort estimates from the
// decoded calldata; we surface that uncertainty to the user instead of guessing.

import { shortAddr, formatTokenAmount, getMethodId } from "./decoder.js";

const ETH = "ETH";
const UNKNOWN_TOKEN = "TOKEN";

// Internal representation of an asset change.
function diff(symbol, sent, received, note) {
  return { symbol, sent, received, note };
}

function empty() {
  return { lines: [], summary: "No balance changes detected.", totalOutEth: 0, totalInEth: 0 };
}

// ---------- Per-method diff ----------

function diffApprove(decoded) {
  if (!decoded) return empty();
  if (decoded.isUnlimited) {
    return {
      lines: [diff(UNKNOWN_TOKEN, "UNLIMITED", "0",
        `Full allowance to ${shortAddr(decoded.spender)}. Future calls can drain ALL.` )],
      summary: "No immediate balance change. Unlimited allowance granted.",
      totalOutEth: 0, totalInEth: 0,
      risk: "unlimited-allowance"
    };
  }
  return {
    lines: [diff(UNKNOWN_TOKEN, formatTokenAmount(decoded.amount), "0",
      `Capped allowance to ${shortAddr(decoded.spender)}.` )],
    summary: `No immediate balance change. ${formatTokenAmount(decoded.amount)} tokens approved.`,
    totalOutEth: 0, totalInEth: 0
  };
}

function diffSetApprovalForAll(decoded) {
  if (!decoded) return empty();
  return {
    lines: [diff("NFTs", "ALL", "0",
      `Full operator rights to ${shortAddr(decoded.operator)}.` )],
    summary: "No immediate balance change. Every NFT in this collection is exposed.",
    totalOutEth: 0, totalInEth: 0,
    risk: "unlimited-allowance"
  };
}

function diffTransfer(decoded, ethValue) {
  if (!decoded) return empty();
  const lines = [];
  const outEth = parseFloat(ethValue) || 0;
  if (outEth > 0) lines.push(diff(ETH, ethValue, "0", "Direct native transfer"));
  lines.push(diff(UNKNOWN_TOKEN, formatTokenAmount(decoded.amount), "0",
    `Sent to ${shortAddr(decoded.recipient)}.` ));
  return {
    lines,
    summary: outEth > 0
      ? `OUT ${ethValue} ETH + ${formatTokenAmount(decoded.amount)} tokens`
      : `OUT ${formatTokenAmount(decoded.amount)} tokens`,
    totalOutEth: outEth, totalInEth: 0
  };
}

function diffTransferFrom(decoded) {
  if (!decoded) return empty();
  return {
    lines: [diff(UNKNOWN_TOKEN, formatTokenAmount(decoded.amount), "0",
      `Pulled from your wallet to ${shortAddr(decoded.to)}.` )],
    summary: `OUT ${formatTokenAmount(decoded.amount)} tokens`,
    totalOutEth: 0, totalInEth: 0
  };
}

function diffSafeTransferFrom(decoded) {
  if (!decoded) return empty();
  return {
    lines: [diff("NFT", `#${decoded.tokenId || "?"}`, "0",
      `Sent to ${shortAddr(decoded.to)}.` )],
    summary: `OUT NFT #${decoded.tokenId || "?"}`,
    totalOutEth: 0, totalInEth: 0
  };
}

function diffSwap(decoded, ethValue) {
  const outEth = parseFloat(ethValue) || 0;
  return {
    lines: [
      diff(ETH, ethValue || "0", "0", "Spent via swap"),
      diff(UNKNOWN_TOKEN, "0", "~?", "Received amount depends on pool and slippage")
    ],
    summary: outEth > 0
      ? `OUT ${ethValue} ETH -> IN tokens (exact amount depends on pool)`
      : `Token swap (exact amounts depend on pool)`,
    totalOutEth: outEth, totalInEth: 0
  };
}

function diffPermit(pd) {
  const unlimited = pd.value === "Unlimited" || /^f{15,}/i.test(pd.value);
  return {
    lines: [diff(pd.tokenName || UNKNOWN_TOKEN, unlimited ? "UNLIMITED" : pd.value, "0",
      `Off-chain signature. No on-chain effect until exploited.`)],
    summary: "No on-chain balance change. Off-chain signature.",
    totalOutEth: 0, totalInEth: 0,
    risk: unlimited ? "unlimited-allowance" : "limited-allowance"
  };
}

function diffBridge() {
  return {
    lines: [diff(UNKNOWN_TOKEN, "Bridged amount", "0", "Tokens will move to another chain.")],
    summary: "Bridge transfer - destination chain must be verified.",
    totalOutEth: 0, totalInEth: 0
  };
}

function diffMulticall(innerDiffs) {
  // innerDiffs: array of { lines, summary, totalOutEth, totalInEth }
  const lines = [];
  let totalOutEth = 0, totalInEth = 0;
  let anyUnlimited = false;
  innerDiffs.forEach((d, i) => {
    if (d.risk === "unlimited-allowance") anyUnlimited = true;
    totalOutEth += d.totalOutEth || 0;
    totalInEth += d.totalInEth || 0;
    d.lines.forEach((l) => lines.push(l));
  });
  return {
    lines,
    summary: `Multicall (${innerDiffs.length} subcalls)`,
    totalOutEth, totalInEth,
    risk: anyUnlimited ? "unlimited-allowance" : undefined
  };
}

// ---------- Top-level entry ----------

// ctx = {
//   to, value, data, ethValue,
//   decoded,
//   isEIP712, isPersonalSign, isLegacySign, permitDetails,
//   innerDiffs: array of diff objects from recursive multicall
// }
export function diffTransaction(ctx) {
  const methodId = getMethodId(ctx.data || "");

  if (ctx.isEIP712 && ctx.permitDetails) return diffPermit(ctx.permitDetails);
  if (ctx.isPersonalSign || ctx.isLegacySign) {
    return {
      lines: [diff("Signature", "1", "0", "Off-chain signature. No balance impact until used.")],
      summary: "Off-chain signature. No balance change.",
      totalOutEth: 0, totalInEth: 0
    };
  }

  switch (methodId) {
    case "0x095ea7b3": return diffApprove(ctx.decoded);
    case "0xa22cb465": return diffSetApprovalForAll(ctx.decoded);
    case "0xa9059cbb": return diffTransfer(ctx.decoded, ctx.ethValue);
    case "0x23b872dd": return diffTransferFrom(ctx.decoded);
    case "0x42842e0e":
    case "0xb88d4fde": return diffSafeTransferFrom(ctx.decoded);
    case "0x38ed1739":
    case "0x8803dbee":
    case "0x7ff36ab5":
    case "0x4a25d94a":
    case "0xfb3bdb41":
    case "0x415565b0": return diffSwap(ctx.decoded, ctx.ethValue);
    case "0xac9650d8":
    case "0x5ae401dc":
    case "0x1745e9d0":
    case "0xee8b7563":
      return diffMulticall(ctx.innerDiffs || []);
    case "0x1f0464d1":
    case "0x8b7f1068":
    case "0x301a5c2c": return diffBridge();
  }

  // Unknown method - just surface the ETH value if any.
  const outEth = parseFloat(ctx.ethValue) || 0;
  if (outEth > 0) {
    return {
      lines: [diff(ETH, ctx.ethValue, "0", "Unknown method, native ETH outflow")],
      summary: `OUT ${ctx.ethValue} ETH (unknown method)`,
      totalOutEth: outEth, totalInEth: 0
    };
  }

  return empty();
}
