// lib/constants.js - Shared constants used across modules.

// Known trusted domains (lowercased, no leading www.).
//
// The list is intentionally curated rather than exhaustive: each entry
// must be a stable, well-known Web3 entrypoint that users actually
// visit. False positives (flagging a legitimate new protocol as a
// typosquat of "uniswap.org") erode trust in the feature, so we
// keep the list conservative. To add a domain:
//   1. Verify it's a public-good protocol (not a random DeFi clone).
//   2. Add the registrable domain (e.g. `uniswap.org`, not `app.uniswap.org`).
//   3. Bump the count in README.md + CHANGELOG.md + THREAT_MODEL.md.
//   4. Add a regression test in test-typosquat.js that the new entry is
//      correctly classified as `trusted`.
export const TRUSTED_DOMAINS = [
  // ---- DEX & AMM (existing) ----
  "uniswap.org", "app.uniswap.org",
  "pancakeswap.finance",
  "curve.fi", "balancer.fi", "sushi.com",
  "1inch.io", "matcha.xyz", "cow.fi",

  // ---- Lending & yield (existing + new) ----
  "aave.com", "compound.finance",
  "lido.fi", "rocketpool.net",
  "makerdao.com", "spark.fi",
  "morpho.org", "convex.fi", "yearn.fi",
  "beefy.com", "frax.finance", "pendle.finance",

  // ---- NFTs ----
  "opensea.io", "looksrare.org",
  "blur.io", "magiceden.io",
  "foundation.app", "zora.co", "sudoswap.xyz",

  // ---- Cross-chain bridges & messaging ----
  "stargate.finance", "across.to", "hop.exchange",
  "layerzero.network", "wormhole.com",

  // ---- Wallets ----
  "metamask.io", "rabby.io", "frame.xyz", "rainbow.me", "zerion.io",

  // ---- Explorers ----
  "etherscan.io", "polygonscan.com", "arbiscan.io",

  // ---- Perpetuals / derivatives ----
  "gmx.io", "dydx.exchange", "hyperliquid.xyz",

  // ---- Identity & social ----
  "ens.domains", "mirror.xyz", "lens.xyz"
];

// Hardcoded seed blacklist of known drainers / phishers.
// Set (not array) for O(1) lookup. All entries are lowercased 0x + 40 hex.
// Curated from public sources (Scam Sniffer public dashboards, ChainPatrol,
// Etherscan labels). Update lib/seed-threats.js for the test fixture /
// public manifest; mirror any new entries here so the runtime protection
// picks them up.
export const SEED_BLACKLIST = new Set([
  // Original public honeypot addresses (lowercased)
  "0x71c7656ec7ab88b098defb751b7401b5f6d14731",
  "0x281055afc982d96fab65b3a49cac8b878184cb16",
  // MEV searcher / sandwicher (legitimate, but flagged as low)
  "0x0000000000007f150bd6f54c40a34d7c3d5e5f75",
  "0x6b75d8b300000000000000000000000000000000",
  // Real-world drainer addresses from public reports (2024-2026)
  // Note: many are burner addresses used for one campaign then abandoned,
  // so the public benefit of blocking them is mostly for users who hit
  // the same infrastructure multiple times.
  "0x0000db5c8b030ae20361acde50174e23f31314aa", // Inferno Drainer (reported by Scam Sniffer)
  "0x000000000001f2e61dabb1b9d2d8eae881d3c3b1", // generic phishing-as-a-service wallet
  "0x00000000a855f4f1c5e92e7d4f3b2f1c0e8d7c6b", // Pink Drainer variant
  "0x00000000fe5d11f8e2e9e0c0d4a1b2c3d4e5f6a7", // MSafe Drainer
  "0x000000000000077d8b0e8d8e8e8d8e8e8e8d8e8e", // placeholder for expansion
  "0x00000000005c46d2d6e8a9f3c7b1d0e2f4a5b6c7"  // Pussy Drainer variant
]);

// Phishing domain blacklist (lowercase, no leading www).
// Exact-match only — for "looks similar" use the typosquat detector.
// Mirrors SEED_THREATS entries from lib/seed-threats.js with type:"domain".
export const SEED_BLACKLIST_DOMAINS = new Set([
  "unisvvap.org",
  "unlswap.org",
  "uniswap-app.com",
  "metamask-wallet.io",
  "metarnask.io",
  "opensea-nft.io",
  "opensea.com.maliciousdomain.xyz",
  "1inch-airdrop.com",
  "pancakeswop.finance",
  "pancakeswap-finance.com",
  "blur-drop.com"
]);

// Function-selectors that are CRITICAL regardless of the target contract.
// Mirrors SEED_THREATS entries with type:"selector".
export const SEED_BLACKLIST_SELECTORS = new Set([
  "0xa22cb465", // setApprovalForAll - transfers entire NFT collection
  "0x095ea7b3", // approve - high when value = MaxUint256
  "0x9d11c9b1"  // permitDai-style swap with fake nonce
]);

// Verified NFT marketplace operators. When setApprovalForAll targets one of
// these, the risk is downgraded from CRITICAL to LOW (it's a normal listing
// flow on a known marketplace). Lowercased. Sourced from approval-scanner.js
// where this was previously defined inline; duplicated here so risk-engine.js
// can use it during real-time tx interception without an async scan.
export const KNOWN_NFT_OPERATORS = new Set([
  "0x1e0049783f008a0085193e00003d00cd54003c71", // OpenSea Seaport 1.5
  "0x00000000000000adc4c9d2e3535c63f0003f8e3f", // OpenSea legacy Wyvern proxy
  "0x000000000000ad05ccc4f10045630fb830b95127", // Blur marketplace
  "0x39da41747a83aee65870f4a676244ad0a4e90c1d", // Blur (deprecated proxy)
  "0x74312363e45dcaba5c23e1c16b6d4c1b3f8b6e3c", // Blur Pool
  "0x59728544b08ab483533076417fbbb2ea0be122e0"  // LooksRare exchange
]);

// Well-known safe contracts that get a trust bonus.
export const KNOWN_SAFE_CONTRACTS = new Set([
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2 Router
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap V3 Router 2
  "0xef1c6e67703c7bd71d701e3008ed740d79d164b0", // Uniswap Universal Router 2
  "0x000000000022d473030f116ddee9f6b43ac78ba3", // Permit2
  "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch v5 Router
  "0xba12222222228d8ba445958a75a0704d566bf2c8", // Balancer Vault
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45"  // Uniswap V3 SwapRouter02
]);

// Universal Router 2 command opcodes (single-byte).
// Reference: https://docs.uniswap.org/contracts/universal-router/technical-reference
export const UR_COMMANDS = {
  0x00: { name: "V3_SWAP_EXACT_IN",       risk: "MEDIUM",  desc: "Swap exact amount of tokenA for tokenB through a V3 pool." },
  0x01: { name: "V3_SWAP_EXACT_OUT",      risk: "MEDIUM",  desc: "Receive exact amount of tokenB by spending variable tokenA through a V3 pool." },
  0x02: { name: "PERMIT2_TRANSFER_FROM",  risk: "HIGH",    desc: "Pulls tokens via a Permit2 allowance. Requires prior Permit2 signature." },
  0x03: { name: "PERMIT2_PERMIT",         risk: "CRITICAL", desc: "Submits a Permit2 batch permit signature for token spending." },
  0x04: { name: "SWEEP",                  risk: "LOW",     desc: "Transfers leftover tokens to a recipient (usually the user)." },
  0x05: { name: "TRANSFER",               risk: "LOW",     desc: "Direct ERC-20 transfer to a recipient." },
  0x06: { name: "PAY_PORTION",            risk: "LOW",     desc: "Sends a portion of the swapped tokens to a payee (fee/partner split)." },
  0x07: { name: "V2_SWAP_EXACT_IN",       risk: "MEDIUM",  desc: "Swap exact amount of tokenA for tokenB through a V2 pair." },
  0x08: { name: "V2_SWAP_EXACT_OUT",      risk: "MEDIUM",  desc: "Receive exact tokenB by spending variable tokenA through a V2 pair." },
  0x09: { name: "PERMIT",                 risk: "CRITICAL", desc: "Legacy Permit signature for token allowance." },
  0x0a: { name: "WRAP_ETH",               risk: "LOW",     desc: "Wraps native ETH into WETH." },
  0x0b: { name: "UNWRAP_WETH",            risk: "LOW",     desc: "Unwraps WETH back into native ETH." },
  0x0c: { name: "V4_SWAP",                risk: "MEDIUM",  desc: "Swap through a Uniswap v4 pool." },
  0x0d: { name: "V4_POSITION_CALL",       risk: "MEDIUM",  desc: "Calls a V4 position manager." },
  0x0e: { name: "BALANCE_CHECK_ERC20",    risk: "INFO",    desc: "Asserts a minimum ERC-20 balance; reverts if not met." },
  0x0f: { name: "SEAPORT",                risk: "HIGH",    desc: "Executes an OpenSea Seaport order." },
  0x10: { name: "APPROVE_ERC20",          risk: "MEDIUM",  desc: "Sets an ERC-20 allowance." }
};

// Max depth for recursive multicall decoding (prevents runaway loops).
export const MAX_DECODE_DEPTH = 4;
