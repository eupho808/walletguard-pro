// packages/walletguard-core/src/index.js
// Public API for the walletguard-core library.
// Re-exports the same modules that power the WalletGuard Pro browser extension,
// but with a clean public API suitable for npm distribution.

export { decode as decodeCalldata, decodeMulticall, getMethodId, formatTokenAmount, shortAddr } from "./decoder.js";
export { score as scoreRisk, RISK_FACTORS } from "./risk-engine.js";
export { checkTyposquat, checkSubdomainImpersonation, TRUSTED_DOMAINS } from "./typosquatting.js";
export { decodeMulticallBundle, decodeMulticallV3 } from "./multicall-decoder.js";
export { decodeUniversalRouterCommand, UNIVERSAL_ROUTER_COMMANDS } from "./universal-router.js";
export { simulate, diffApprove, diffTransfer, diffSwap } from "./simulator.js";
export { generateRevoke, generateRevokeAll } from "./revoke-generator.js";

// High-level convenience: analyze a transaction end-to-end
export function analyzeTransaction(tx, context = {}) {
  // tx: { to, data, value, from, chainId }
  // context: { currentDomain?, trustedDomains?, scammerAddresses? }
  const decoded = decodeCalldata(tx);
  const risk = scoreRisk({
    decoded,
    tx,
    domain: context.currentDomain,
    spenderAddress: decoded?.spender || tx.to
  });
  const simulation = simulate(decoded);
  return { decoded, risk, simulation, timestamp: Date.now() };
}

// Version constant
export const VERSION = "1.0.0";
export const SUPPORTED_CHAINS = [1, 10, 56, 137, 250, 8453, 42161, 43114, 11155111];
