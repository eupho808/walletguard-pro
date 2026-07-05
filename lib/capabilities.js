// lib/capabilities.js - Rich explanations of what a transaction/signature enables.
//
// Each capability is a short sentence that the UI shows under
// "What this lets the contract do" so the user understands the long-term
// consequences, not just the immediate action.

import { shortAddr, formatTokenAmount, getMethodId } from "./decoder.js";

// ---------- Per-method capabilities ----------

function approveCapabilities(decoded) {
  if (!decoded) return [];
  if (decoded.isUnlimited) {
    return [
      `${shortAddr(decoded.spender)} can transfer UNLIMITED of this token from your wallet at any time.`,
      `You can revoke the approval later via revoke.cash or directly through the contract.`,
      `If ${shortAddr(decoded.spender)} is hacked or malicious, ALL of this token can be drained.`
    ];
  }
  return [
    `${shortAddr(decoded.spender)} can transfer up to ${formatTokenAmount(decoded.amount)} tokens from your wallet.`,
    `The allowance expires only when you spend it or revoke it.`
  ];
}

function setApprovalForAllCapabilities(decoded) {
  if (!decoded) return [];
  return [
    `${shortAddr(decoded.operator)} can transfer EVERY NFT in this collection from your wallet without further signatures.`,
    `Includes NFTs you may receive later in the same collection.`,
    `Revoke via setApprovalForAll(operator, false) or revoke.cash.`
  ];
}

function transferFromCapabilities(decoded) {
  if (!decoded) return [];
  return [
    `A contract is pulling ${formatTokenAmount(decoded.amount)} tokens from your wallet on your behalf.`,
    `Requires prior approval or allowance to the caller.`
  ];
}

function safeTransferFromCapabilities(decoded) {
  if (!decoded) return [];
  return [
    `NFT #${decoded.tokenId || "?"} will be transferred to ${shortAddr(decoded.to)}.`,
    `This is irreversible once confirmed.`
  ];
}

function swapCapabilities(decoded, ethValue) {
  const lines = [
    `Exchanges one token for another through a DEX pool.`,
    `Slippage settings, MEV bots, and pool depth all affect the final amount.`
  ];
  if (ethValue && parseFloat(ethValue) > 0) {
    lines.push(`${ethValue} ETH will be spent from your balance.`);
  }
  return lines;
}

function multicallCapabilities(innerCount) {
  return [
    `Bundles ${innerCount} subcall(s) into one transaction.`,
    `If allowFailure=false on any subcall and that subcall fails, the whole transaction reverts.`,
    `Subcall breakdown is shown below.`
  ];
}

function universalRouterCapabilities(cmdCount) {
  return [
    `Uniswap Universal Router will execute ${cmdCount} command(s) in sequence.`,
    `Each command can transfer, swap, or grant allowances.`,
    `Commands are decoded below.`
  ];
}

function permitCapabilities(pd) {
  const unlimited = pd.value === "Unlimited" || /^f{15,}/i.test(pd.value);
  const lines = [
    `Off-chain signature - no gas is paid and no transaction appears on-chain.`,
    `${shortAddr(pd.spenderFull || pd.spender)} can call transferFrom on your ${pd.tokenName} until revoked or expired.`
  ];
  if (unlimited) {
    lines.push(`UNLIMITED allowance granted - the spender can drain ALL of this token.`);
  } else {
    lines.push(`Allowance: ${pd.value} tokens.`);
  }
  if (pd.deadline) {
    lines.push(`Valid until: ${pd.deadline}.`);
  }
  return lines;
}

function bridgeCapabilities() {
  return [
    `Tokens will be bridged to another chain.`,
    `Bridging is irreversible - wrong chain means lost funds.`,
    `Verify the destination chain in the dApp UI.`
  ];
}

function personalSignCapabilities() {
  return [
    `Signs an arbitrary off-chain message.`,
    `Legitimate dApps use this for logins, but phishers may encode Permit/Order payloads.`,
    `Never sign a hex blob you cannot decode.`
  ];
}

// ---------- Top-level entry ----------

// Returns an array of capability strings to display in the UI.
export function describeCapabilities(ctx) {
  const methodId = getMethodId(ctx.data || "");
  const caps = [];

  if (ctx.isEIP712 && ctx.permitDetails) {
    caps.push(...permitCapabilities(ctx.permitDetails));
    return caps;
  }
  if (ctx.isPersonalSign) {
    caps.push(...personalSignCapabilities());
    return caps;
  }
  if (ctx.isLegacySign) {
    caps.push(
      `Legacy eth_sign - signs an arbitrary hash with no readable payload.`,
      `Consider this dangerous unless you trust the dApp fully.`
    );
    return caps;
  }

  switch (methodId) {
    case "0x095ea7b3": caps.push(...approveCapabilities(ctx.decoded)); break;
    case "0xa22cb465": caps.push(...setApprovalForAllCapabilities(ctx.decoded)); break;
    case "0x23b872dd": caps.push(...transferFromCapabilities(ctx.decoded)); break;
    case "0x42842e0e":
    case "0xb88d4fde": caps.push(...safeTransferFromCapabilities(ctx.decoded)); break;
    case "0x38ed1739":
    case "0x8803dbee":
    case "0x7ff36ab5":
    case "0x4a25d94a":
    case "0xfb3bdb41":
    case "0x415565b0": caps.push(...swapCapabilities(ctx.decoded, ctx.ethValue)); break;
    case "0xac9650d8":
    case "0x5ae401dc":
    case "0x1745e9d0":
    case "0xee8b7563": caps.push(...multicallCapabilities(ctx.innerCalls?.length || 0)); break;
    case "0x3593564c":
    case "0x248cbc34": caps.push(...universalRouterCapabilities(ctx.urCommands?.length || 0)); break;
    case "0x1f0464d1":
    case "0x8b7f1068":
    case "0x301a5c2c": caps.push(...bridgeCapabilities()); break;
  }

  if (caps.length === 0) {
    caps.push(
      "No specific capabilities flagged for this call.",
      "Always verify the dApp URL and the recipient contract before confirming."
    );
  }

  return caps;
}
