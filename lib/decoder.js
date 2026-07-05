// lib/decoder.js - Method signature dictionary + calldata parsers.

// Known method signatures: selector -> { category, name, risk, desc }
export const METHOD_DECODER = {
  // ERC-20
  "0xa9059cbb": { category: "ERC-20", name: "Token Transfer",             risk: "LOW",      desc: "Send tokens directly to another wallet." },
  "0x095ea7b3": { category: "ERC-20", name: "Token Approval (Approve)",   risk: "MEDIUM",   desc: "Allow a contract to spend your tokens. Unlimited approval lets it drain the balance later." },
  "0x23b872dd": { category: "ERC-20", name: "TransferFrom (Pull Tokens)", risk: "HIGH",     desc: "A third party pulls tokens out of your wallet. Common in marketplaces, but heavily abused by drainers." },
  "0x40c10f19": { category: "ERC-20", name: "Mint Tokens (Owner)",        risk: "INFO",     desc: "Contract mints new tokens. Only callable by authorized addresses." },
  "0x42966c68": { category: "ERC-20", name: "Burn Tokens",                risk: "LOW",      desc: "Destroy tokens from your balance." },
  "0xd0e30db0": { category: "ERC-20", name: "Deposit (Wrap ETH)",         risk: "LOW",      desc: "Wrap native ETH into WETH or deposit into a vault." },
  "0x2e1a7d4d": { category: "ERC-20", name: "Withdraw (Unwrap WETH)",     risk: "LOW",      desc: "Unwrap WETH back to native ETH." },

  // ERC-721 / ERC-1155
  "0x42842e0e": { category: "ERC-721", name: "NFT SafeTransferFrom",         risk: "HIGH",     desc: "Transfer a specific NFT out of your wallet." },
  "0xb88d4fde": { category: "ERC-721", name: "NFT SafeTransferFrom (data)",  risk: "HIGH",     desc: "Transfer a specific NFT out of your wallet with attached data." },
  "0x6352211e": { category: "ERC-721", name: "NFT Owner Of (View)",          risk: "INFO",     desc: "Read-only query - safe." },
  "0xa22cb465": { category: "ERC-721/1155", name: "Approval For All",       risk: "CRITICAL", desc: "Operator gets full control over EVERY NFT in this collection. Can withdraw all without further signatures." },
  "0xf242432a": { category: "ERC-1155", name: "ERC-1155 SafeTransferFrom",   risk: "HIGH",     desc: "Transfer an ERC-1155 token. Verify the recipient carefully." },
  "0x2eb2c2d6": { category: "ERC-1155", name: "ERC-1155 SafeBatchTransfer",  risk: "HIGH",     desc: "Batch transfer multiple ERC-1155 tokens in one call." },
  "0x6a627842": { category: "ERC-1155", name: "Mint ERC-1155 (Owner)",       risk: "INFO",     desc: "Mint new ERC-1155 tokens." },

  // DeFi / DEX
  "0x415565b0": { category: "DeFi", name: "Multi-Asset Swap",              risk: "LOW",      desc: "Swap through a DEX router." },
  "0x38ed1739": { category: "DeFi", name: "Swap Exact Tokens For Tokens",  risk: "LOW",      desc: "DEX swap: trade an exact amount of one token for another." },
  "0x8803dbee": { category: "DeFi", name: "Swap Tokens For Exact Tokens",  risk: "LOW",      desc: "DEX swap: buy an exact amount of one token by spending the other." },
  "0x7ff36ab5": { category: "DeFi", name: "Swap Exact ETH For Tokens",     risk: "LOW",      desc: "DEX swap: spend native ETH to buy tokens." },
  "0x4a25d94a": { category: "DeFi", name: "Swap Exact Tokens For ETH",     risk: "LOW",      desc: "DEX swap: sell tokens for native ETH." },
  "0xfb3bdb41": { category: "DeFi", name: "Swap ETH For Exact Tokens",     risk: "LOW",      desc: "DEX swap: spend native ETH for an exact token amount." },
  "0xe8e33700": { category: "DeFi", name: "Add Liquidity",                 risk: "LOW",      desc: "Add liquidity to a pool. You will receive LP tokens." },
  "0xbaa2abde": { category: "DeFi", name: "Remove Liquidity",              risk: "LOW",      desc: "Burn LP tokens to withdraw your share of the pool." },
  "0xa694fc3a": { category: "DeFi", name: "Stake / Deposit",               risk: "LOW",      desc: "Lock tokens inside a vault to earn yield." },
  "0x2e17de78": { category: "DeFi", name: "Unstake / Withdraw",            risk: "LOW",      desc: "Withdraw previously staked tokens." },
  "0x4e71d92d": { category: "DeFi", name: "Claim Rewards",                 risk: "LOW",      desc: "Claim accumulated staking/farming rewards." },
  "0xb6b55f25": { category: "DeFi", name: "Deposit (Vault)",               risk: "LOW",      desc: "Deposit funds into an ERC-4626 vault." },
  "0x2eee7903": { category: "DeFi", name: "Withdraw (Vault)",              risk: "LOW",      desc: "Withdraw funds from an ERC-4626 vault." },

  // NFT Marketplaces
  "0xfb0f3ee3": { category: "NFT", name: "Fulfill Order (Seaport)",         risk: "MEDIUM", desc: "Fulfill an OpenSea Seaport order. Verify the counterparty and asset being traded." },
  "0x87201b41": { category: "NFT", name: "Fulfill Advanced Order (Seaport)",risk: "MEDIUM", desc: "Fulfill a complex Seaport order with criteria-based matching." },
  "0x9a1fc3a7": { category: "NFT", name: "Cancel Order (Seaport)",          risk: "LOW",    desc: "Cancel an existing listing." },

  // Multicall
  "0xac9650d8": { category: "Multicall", name: "Multicall (bytes[])",     risk: "MEDIUM",   desc: "Bundling multiple calls into one transaction. Each subcall will be decoded." },
  "0x5ae401dc": { category: "Multicall", name: "Multicall2",               risk: "MEDIUM",   desc: "Multicall2 aggregator. Each subcall is executed in sequence." },
  "0x1745e9d0": { category: "Multicall", name: "Multicall3 aggregate3",    risk: "MEDIUM",   desc: "Multicall3 aggregator with per-call failure control. Each subcall is decoded." },
  "0xee8b7563": { category: "Multicall", name: "Multicall (uint256,bytes[])", risk: "MEDIUM", desc: "Multicall with block-number check." },

  // Uniswap Universal Router
  "0x3593564c": { category: "Universal Router", name: "Execute (commands, inputs, deadline)", risk: "HIGH", desc: "Uniswap Universal Router: a sequence of swap commands is decoded and executed in order." },
  "0x248cbc34": { category: "Universal Router", name: "Execute (commands, inputs)",            risk: "HIGH", desc: "Uniswap Universal Router: a sequence of swap commands is decoded and executed in order." },

  // Bridges
  "0x1f0464d1": { category: "Bridge", name: "Bridge Swap",                  risk: "MEDIUM",   desc: "Cross-chain bridge swap." },
  "0x8b7f1068": { category: "Bridge", name: "Across Bridge",                risk: "MEDIUM",   desc: "Across protocol bridge deposit." },
  "0x301a5c2c": { category: "Bridge", name: "Stargate Swap",                risk: "MEDIUM",   desc: "Stargate cross-chain swap." }
};

// ---------- Hex helpers ----------

export function strip0x(h) { return h && h.startsWith("0x") ? h.slice(2) : h || ""; }

export function sliceAddress(hex) {
  // Address is the LAST 20 bytes of a 32-byte word.
  if (!hex || hex.length < 40) return null;
  return "0x" + hex.slice(-40);
}

export function sliceUint256(hex) {
  if (!hex || hex.length < 64) return "0";
  try { return BigInt("0x" + hex).toString(); } catch { return "0"; }
}

export function sliceBool(hex) {
  if (!hex || hex.length < 64) return false;
  try { return BigInt("0x" + hex) !== 0n; } catch { return false; }
}

export function shortAddr(a) {
  if (!a || typeof a !== "string" || a.length < 10) return a || "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

export function formatTokenAmount(raw, decimals = 18) {
  try {
    const big = BigInt(raw);
    const divisor = 10n ** BigInt(decimals);
    const whole = big / divisor;
    const frac = big % divisor;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole}.${fracStr}`.replace(/\.?0+$/, "") || "0";
  } catch { return "?"; }
}

export function weiToEth(weiHex) {
  if (!weiHex) return "0";
  try {
    const big = BigInt(weiHex);
    const whole = big / 10n ** 18n;
    const frac = big % 10n ** 18n;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 6);
    return `${whole}.${fracStr}`.replace(/\.?0+$/, "") || "0";
  } catch { return "?"; }
}

export function getMethodId(data) {
  if (!data || data.length < 10) return null;
  return data.slice(0, 10).toLowerCase();
}

// ---------- Per-method decoders ----------

function decodeApprove(data) {
  if (data.length < 138) return null;
  const spender = sliceAddress(data.slice(34, 74));
  const amount = sliceUint256(data.slice(74, 138));
  const isUnlimited = amount === "0" || amount.length >= 60 ||
    /^f{15,}/i.test(amount);
  return { spender, amount, isUnlimited };
}

function decodeTransfer(data) {
  if (data.length < 138) return null;
  const to = sliceAddress(data.slice(34, 74));
  const amount = sliceUint256(data.slice(74, 138));
  return { recipient: to, amount };
}

function decodeTransferFrom(data) {
  if (data.length < 202) return null;
  const from = sliceAddress(data.slice(34, 74));
  const to = sliceAddress(data.slice(98, 138));
  const amount = sliceUint256(data.slice(138, 202));
  return { from, to, amount };
}

function decodeSafeTransferFrom(data) {
  if (data.length < 202) return null;
  const from = sliceAddress(data.slice(34, 74));
  const to = sliceAddress(data.slice(98, 138));
  const tokenId = sliceUint256(data.slice(138, 202));
  return { from, to, tokenId };
}

function decodeSetApprovalForAll(data) {
  if (data.length < 138) return null;
  const operator = sliceAddress(data.slice(34, 74));
  const approved = sliceBool(data.slice(74, 138));
  return { operator, approved };
}

function decodeErc1155SafeTransferFrom(data) {
  if (data.length < 266) return null;
  // (address,address,uint256,uint256,uint256,bytes)
  const from = sliceAddress(data.slice(34, 74));
  const to = sliceAddress(data.slice(98, 138));
  const id = sliceUint256(data.slice(138, 202));
  const amount = sliceUint256(data.slice(202, 266));
  return { from, to, id, amount };
}

// Main decode dispatcher. Returns null if the method is unknown.
export function decodeCalldata(methodId, data) {
  if (!data || data.length < 10) return null;
  switch (methodId) {
    case "0xa9059cbb": return decodeTransfer(data);
    case "0x095ea7b3": return decodeApprove(data);
    case "0x23b872dd": return decodeTransferFrom(data);
    case "0xb88d4fde":
    case "0x42842e0e": return decodeSafeTransferFrom(data);
    case "0xa22cb465": return decodeSetApprovalForAll(data);
    case "0xf242432a": return decodeErc1155SafeTransferFrom(data);
    default: return null;
  }
}
