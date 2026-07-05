// lib/constants.js - Shared constants used across modules.

// Known trusted domains (lowercased, no leading www.)
export const TRUSTED_DOMAINS = [
  "uniswap.org", "app.uniswap.org",
  "pancakeswap.finance",
  "opensea.io", "looksrare.org",
  "metamask.io", "rabby.io",
  "etherscan.io",
  "1inch.io", "matcha.xyz",
  "cow.fi", "zerion.io",
  "curve.fi", "aave.com", "compound.finance",
  "balancer.fi", "sushi.com"
];

// Hardcoded seed blacklist of known drainers / phishers.
export const SEED_BLACKLIST = [
  "0x71C7656EC7ab88b098defB751B7401B5f6d14731",
  "0x281055afc982d96fab65b3a49cac8b878184cb16",
  "HN7c7ZES4CfX6NLF3gqas9mE28tBg7cZ4j5Xv7gK7FAE"
];

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
