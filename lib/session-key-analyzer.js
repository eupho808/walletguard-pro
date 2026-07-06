/**
 * @fileoverview Session Key Permission Analyzer (ERC-7715 / WalletConnect)
 *
 * Web3 wallets increasingly expose "session keys" — limited-scope delegated
 * keys that let a dApp act on behalf of the user for a bounded period.
 * The WalletConnect / ERC-7715 permission object shape (simplified):
 *
 *   {
 *     "address": "0x...",          // session key signer address
 *     "chainId": 1,                // allowed chain (0 = any)
 *     "expiry": 1234567890,        // unix timestamp (0 = never expires)
 *     "permissions": {
 *       "contractAccess":  ["*"],  // allowed contracts ("*" = all)
 *       "nativeTokenLimit":"1000000000000000000", // 1 ETH in wei
 *       "erc20TokenLimit": { "0xUSDC": "0xffff..." },
 *       "interval": 3600           // rate-limit interval (0 = no rate limit)
 *     }
 *   }
 *
 * Real-world attacks exploit overly-broad permissions:
 *   - expiry = 0 (never expires)
 *   - contractAccess = ["*"]  (any contract)
 *   - erc20TokenLimit = max-int
 *   - interval = 0  (no rate limit)
 *
 * All functions are pure — no chrome.*, no fetch, no I/O.
 * @module lib/session-key-analyzer
 */

export const MAX_UINT256 = (1n << 256n) - 1n;
export const MAX_UINT256_HEX = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** JSON-RPC method names that carry permission payloads. */
export const PERMISSION_RPC_METHODS = Object.freeze([
  "wallet_grantPermissions",
  "wallet_sendCalls",
  "wallet_getPermissions",
  "wallet_revokePermissions"
]);

/**
 * Known-good session-key consumers. When a permission request originates
 * from one of these, the analyzer downgrades risk by one level (floor: low).
 */
export const KNOWN_SAFE_PROTOCOLS = Object.freeze([
  Object.freeze({ name: "Uniswap",       matcher: /uniswap/i }),
  Object.freeze({ name: "Aave",          matcher: /aave/i }),
  Object.freeze({ name: "1inch",         matcher: /1inch/i }),
  Object.freeze({ name: "CowSwap",       matcher: /cowfi|cow\.swap/i }),
  Object.freeze({ name: "OpenSea",       matcher: /opensea/i }),
  Object.freeze({ name: "Lido",          matcher: /lido/i }),
  Object.freeze({ name: "ENS",           matcher: /ens|ethereum-name-service/i })
]);

// ─── Internal helpers ────────────────────────────────────────

function toBigIntSafe(val) {
  if (val == null) return null;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(val);
  if (typeof val === 'string') {
    if (val === '') return null;
    try { return BigInt(val); } catch { return null; }
  }
  if (typeof val === 'object' && typeof val.toString === 'function') {
    try { return BigInt(val.toString()); } catch { return null; }
  }
  return null;
}

function isMaxUint256(value) {
  const b = toBigIntSafe(value);
  return b !== null && b >= MAX_UINT256;
}

function looksLikeZeroAddress(addr) {
  if (typeof addr !== 'string') return false;
  const lower = addr.toLowerCase().replace(/^0x/, '');
  return /^0+$/.test(lower);
}

function isKnownSafeProtocol(origin) {
  if (typeof origin !== 'string') return false;
  return KNOWN_SAFE_PROTOCOLS.some(p => p.matcher.test(origin));
}

const SECONDS_PER_DAY = 86400;
const FAR_FUTURE_SECONDS = 30 * SECONDS_PER_DAY;

// ─── Public API ──────────────────────────────────────────────

/**
 * Detect whether a JSON-RPC payload is a session-key permission request.
 * Handles both single calls and JSON-RPC batch arrays.
 * @param {object|string|null|undefined} data
 * @returns {boolean}
 */
export function isPermissionRequest(data) {
  if (data == null) return false;

  // JSON string → parse and recurse
  if (typeof data === 'string') {
    try { return isPermissionRequest(JSON.parse(data)); } catch { return false; }
  }

  if (Array.isArray(data)) {
    return data.some(d => isPermissionRequest(d));
  }

  if (typeof data !== 'object') return false;

  // JSON-RPC envelope
  if (typeof data.method === 'string' && PERMISSION_RPC_METHODS.includes(data.method)) return true;

  // Direct permission object (no envelope)
  if (data.permissions && typeof data.permissions === 'object') return true;
  if (data.capabilities || data.caip25) return true;

  return false;
}

/**
 * Parse a permission payload into a normalized shape:
 *   {
 *     address, chainId, expiry, permissions: {
 *       contractAccess, nativeTokenLimit, erc20TokenLimit, interval
 *     }
 *   }
 * Tolerates missing fields (uses safe defaults).
 * @param {object|string|null|undefined} raw
 * @returns {object|null}
 */
export function parsePermissions(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (typeof raw !== 'object') return null;

  // Reject non-permission objects — must have a permission-grant shape.
  const isJsonRpc = typeof raw.method === 'string' && PERMISSION_RPC_METHODS.includes(raw.method);
  const isDirect  = raw.permissions && typeof raw.permissions === 'object';
  const hasAddressOrExpiry = 'address' in raw || 'expiry' in raw || 'chainId' in raw;
  if (!isJsonRpc && !isDirect && !hasAddressOrExpiry) return null;

  // Unwrap JSON-RPC if present
  const params = Array.isArray(raw.params) ? raw.params[0] : raw.params || raw;
  if (params == null || typeof params !== 'object') return null;

  const out = {
    address: typeof params.address === 'string' ? params.address : "",
    chainId: typeof params.chainId === 'number' ? params.chainId
           : typeof params.chain_id === 'number' ? params.chain_id
           : null,
    expiry:  toBigIntSafe(params.expiry),
    permissions: {
      contractAccess:   Array.isArray(params.permissions?.contractAccess) ? params.permissions.contractAccess
                       : (params.contractAccess || []),
      nativeTokenLimit: params.permissions?.nativeTokenLimit ?? params.nativeTokenLimit ?? "0",
      erc20TokenLimit:  (params.permissions?.erc20TokenLimit && typeof params.permissions.erc20TokenLimit === 'object')
                       ? params.permissions.erc20TokenLimit
                       : (params.erc20TokenLimit || {}),
      interval:         Number(params.permissions?.interval ?? params.interval ?? 0) || 0
    }
  };

  return out;
}

/**
 * Analyze a parsed session-key permission object for red flags.
 * @param {object} permissions — output of parsePermissions()
 * @param {object} [ctx]
 * @param {string} [ctx.origin] — dApp origin (used for KNOWN_SAFE_PROTOCOLS matching)
 * @returns {{riskLevel: string, risks: Array, recommendations: string[], info: Array, parsed: object|null, summary: string}}
 */
export function analyzeSession(permissions, ctx = {}) {
  const risks = [];
  const recommendations = [];
  const info = [];
  // Try to parse if we got a non-parsed payload (or a non-permission object).
  let parsed = permissions;
  if (parsed && (parsed.permissions || parsed.method || parsed.params)) {
    parsed = parsePermissions(parsed);
  }

  if (parsed == null) {
    return { riskLevel: "none", risks, recommendations, info, parsed: null, summary: "Not a permission request" };
  }

  const perms = parsed.permissions || {};
  const origin = ctx.origin || "";

  // ── Zero address signer ──────────────────────────────────────
  if (!parsed.address || looksLikeZeroAddress(parsed.address)) {
    risks.push({ type: "zero-address-signer", severity: "critical",
      message: "Session key signer address is missing or zero. The session key is not properly initialized.",
      fixable: false });
  }

  // ── expiry ────────────────────────────────────────────────────
  const expiryBig = parsed.expiry;
  if (expiryBig === null || expiryBig === 0n) {
    risks.push({ type: "no-expiry", severity: "high",
      message: "Session key never expires. It will be valid forever unless manually revoked.",
      fixable: true });
  } else {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const lifetime = expiryBig - now;
    if (lifetime > BigInt(FAR_FUTURE_SECONDS)) {
      const days = Number(lifetime) / SECONDS_PER_DAY;
      risks.push({ type: "far-future-expiry", severity: "high",
        message: `Session key expires in ${Math.round(days)} days (>30 days). Long-lived keys amplify risk.`,
        fixable: true });
    } else if (lifetime < 0n) {
      info.push({ type: "already-expired", message: "Session key is already expired." });
    }
  }

  // ── contractAccess ────────────────────────────────────────────
  const ca = Array.isArray(perms.contractAccess) ? perms.contractAccess : [];
  if (ca.length === 0) {
    risks.push({ type: "empty-contract-access", severity: "high",
      message: "No contracts in access list. Either intentionally broad or malformed payload.",
      fixable: false });
  } else if (ca.some(c => c === "*" || c === "wildcard" || c === "any")) {
    risks.push({ type: "wildcard-contract-access", severity: "critical",
      message: "Session key can call ANY contract on the allowed chain(s). Full wallet exposure.",
      fixable: true });
  } else if (ca.length > 5) {
    risks.push({ type: "broad-contract-access", severity: "medium",
      message: `Session key can call ${ca.length} contracts. Verify each one.`,
      fixable: true });
  }

  // ── nativeTokenLimit ──────────────────────────────────────────
  const ntl = perms.nativeTokenLimit;
  if (isMaxUint256(ntl)) {
    risks.push({ type: "unlimited-native-limit", severity: "critical",
      message: "Native token spending limit is max-uint256 (effectively unlimited).",
      fixable: true });
  }

  // ── erc20TokenLimit ───────────────────────────────────────────
  const erc20s = perms.erc20TokenLimit || {};
  const erc20Keys = Object.keys(erc20s);
  for (const tok of erc20Keys) {
    if (isMaxUint256(erc20s[tok])) {
      risks.push({ type: "unlimited-erc20-limit", severity: "critical",
        message: `Spending limit for token ${tok} is max-uint256 (effectively unlimited).`,
        fixable: true, details: { token: tok } });
    }
  }

  // ── interval (rate limit) ─────────────────────────────────────
  if (!perms.interval || perms.interval === 0) {
    risks.push({ type: "no-rate-limit", severity: "medium",
      message: "No rate-limit interval. Session key can call repeatedly without throttling.",
      fixable: true });
  }

  // ── chainId ───────────────────────────────────────────────────
  if (parsed.chainId == null || parsed.chainId === 0) {
    risks.push({ type: "any-chain", severity: "medium",
      message: "Session key is valid on ANY chain (chainId 0). Cross-chain exposure.",
      fixable: true });
  }

  // ── Known-safe protocol ───────────────────────────────────────
  if (isKnownSafeProtocol(origin)) {
    info.push({ type: "known-safe-protocol", message: `Origin matches a known-safe protocol: ${origin}` });
    // Downgrade risk by one level (floor: "low") for known-safe origins
    if (risks.length > 0) {
      const downgrade = { critical: "high", high: "medium", medium: "low", low: "low" };
      for (const r of risks) {
        if (downgrade[r.severity]) r.severity = downgrade[r.severity];
      }
    }
  }

  // ── Build recommendations ─────────────────────────────────────
  const seenRec = new Set();
  function rec(text) { if (!seenRec.has(text)) { recommendations.push(text); seenRec.add(text); } }

  if (risks.some(r => r.severity === "critical")) {
    rec("CRITICAL risk: this session key effectively gives away your wallet. Reject unless you fully understand and trust the dApp.");
    rec("If you must proceed, set a tight expiry (<1 hour) and limit contract access to exactly the dApp's contract.");
  }
  if (risks.some(r => r.type === "no-expiry")) rec("Always set an explicit expiry. Recommended: the shortest window you need.");
  if (risks.some(r => r.type === "wildcard-contract-access")) rec("Restrict contractAccess to the exact contract the dApp will call.");
  if (risks.some(r => r.type === "unlimited-native-limit")) rec("Set nativeTokenLimit to the maximum you expect to spend, not unlimited.");
  if (risks.some(r => r.type === "unlimited-erc20-limit")) rec("Set per-token erc20TokenLimit to the exact amount you intend to authorize.");
  if (risks.some(r => r.type === "no-rate-limit")) rec("Set an interval (e.g. 60s) so the session key cannot be drained in one burst.");
  if (risks.length === 0) rec("Session key looks well-scoped. You can still revoke it at any time from your wallet settings.");

  // ── Overall risk level (max severity) ────────────────────────
  const order = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  let riskLevel = "none";
  for (const r of risks) if (order[r.severity] > order[riskLevel]) riskLevel = r.severity;

  // ── Summary line ──────────────────────────────────────────────
  let summary;
  if (riskLevel === "none") summary = "Session key permissions look safe.";
  else if (riskLevel === "low") summary = "Session key is mostly safe — minor issues.";
  else if (riskLevel === "medium") summary = "Session key has medium-risk issues. Review before signing.";
  else if (riskLevel === "high") summary = "Session key has high-risk issues. Likely overly permissive.";
  else summary = "Session key is effectively wallet-equivalent. Almost certainly an attack.";

  return { riskLevel, risks, recommendations, info, parsed, summary };
}
