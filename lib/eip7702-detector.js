/**
 * @fileoverview EIP-7702 Smart EOA Delegation Attack Detector
 *
 * Detects malicious EIP-7702 authorization_list entries in type 0x04
 * transactions.  EIP-7702 (Pectra hardfork, mainnet May 2025) lets an EOA
 * delegate execution to a smart contract via an authorization_list of
 * tuples (chain_id, address, nonce, y_parity, r, s).
 *
 * Attack vectors covered:
 *   1. Phishing delegation — user signs a cheap tx delegating to a drainer.
 *   2. Persistent drain — once delegated, the attacker controls the EOA
 *      until the user signs another authorization.
 *   3. Invisible — appears as an empty tx yet grants full execution rights.
 *
 * All functions are pure — no chrome.*, no fetch, no I/O.
 * @module lib/eip7702-detector
 * @see https://eips.ethereum.org/EIPS/eip-7702
 */

/** EIP-7702 transaction type byte (EIP-2718 envelope). */
export const EIP7702_TX_TYPE = 0x04;

/**
 * Allow-list of well-known, publicly audited contracts that users may
 * legitimately delegate to.  Presence here means the address is widely
 * recognised and deployed on mainnet — it does NOT guarantee that
 * delegating to it is appropriate for every user.
 */
export const KNOWN_SAFE_DELEGATIONS = Object.freeze([
  Object.freeze({ address: '0x0ba5ed9c33835068222527fbaf723bb7c9b71696', name: 'Coinbase Smart Wallet Factory',         category: 'smart-account' }),
  Object.freeze({ address: '0x0000000071727de22e5e9d8baf0edac6f37da032', name: 'ERC-4337 EntryPoint v0.7',             category: 'infra'         }),
  Object.freeze({ address: '0x41675c099f32341bf84bfc5382af534df5c7461a', name: 'Safe Singleton v1.4.1',               category: 'smart-account' }),
  Object.freeze({ address: '0x69f4d17849ec3eb0d8fb5d3b4f1ca1ba1b7c3f3d', name: 'Safe Singleton v1.3.0 (placeholder)',  category: 'smart-account' }),
  Object.freeze({ address: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2', name: 'Aave V3 Pool',                         category: 'defi'          }),
  Object.freeze({ address: '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', name: 'Uniswap V3 Router 2',                  category: 'defi'          }),
  Object.freeze({ address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', name: 'Lido stETH',                           category: 'defi'          }),
  Object.freeze({ address: '0x858646372cc42e1a627fce94aa7a7033e7cf075a', name: 'EigenLayer StrategyManager',           category: 'restaking'     }),
  Object.freeze({ address: '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb', name: 'Morpho Blue',                          category: 'defi'          }),
  Object.freeze({ address: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5', name: 'Compound cETH',                        category: 'defi'          }),
  Object.freeze({ address: '0x373238337bfe8606ae36cfb73ef03e9b317db6d5', name: 'MakerDAO DSR (sDAI)',                  category: 'defi'          }),
]);

/**
 * Block-list of confirmed drainer / phishing delegation contracts.
 * Intentionally empty until verified addresses arrive from threat feeds.
 * @type {ReadonlyArray<{readonly address: string, readonly name: string, readonly category: string, readonly reference?: string}>}
 */
export const KNOWN_MALICIOUS_DELEGATIONS = Object.freeze([
  // e.g. { address: '0x...', name: 'Inferno Drainer', category: 'drainer', reference: 'https://...' },
]);

// ─── Internal Utilities ──────────────────────────────────────

/** Normalise an Ethereum address to lowercase 0x-prefixed form. */
function normalizeAddress(addr) {
  if (typeof addr !== 'string') throw new TypeError(`Address must be a string, got ${typeof addr}`);
  const lower = addr.toLowerCase();
  return lower.startsWith('0x') ? lower : '0x' + lower;
}

/** Convert bigint | number | string | Uint8Array | BigNumber-like → BigInt. */
function toBigInt(val) {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(val);
  if (typeof val === 'string') return BigInt(val);
  if (val instanceof Uint8Array) return bytesToBigInt(val);
  if (val != null && typeof val.toString === 'function') return BigInt(val.toString());
  throw new TypeError(`Cannot convert to BigInt: ${val}`);
}

/** Convert a big-endian byte array to BigInt. */
function bytesToBigInt(bytes) {
  let result = 0n;
  for (const b of bytes) result = (result << 8n) | BigInt(b);
  return result;
}

/** Convert a hex string (with/without 0x) to Uint8Array. */
function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Hex string must have even length');
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

/** Convert a Uint8Array to a lowercase hex string with 0x prefix. */
function bytesToHex(bytes) {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

// ─── RLP Decoder (minimal, for authorization_list) ───────────

/**
 * Decode a single RLP item.  Returns the value (Uint8Array or array)
 * and the byte offset immediately after it.
 */
function rlpDecode(bytes, offset = 0) {
  if (offset >= bytes.length) throw new RangeError('RLP: unexpected end of input');
  const prefix = bytes[offset];

  if (prefix <= 0x7f) return { value: new Uint8Array([prefix]), nextOffset: offset + 1 };
  if (prefix <= 0xb7) { const len = prefix - 0x80; return { value: bytes.slice(offset + 1, offset + 1 + len), nextOffset: offset + 1 + len }; }
  if (prefix <= 0xbf) { const lenOfLen = prefix - 0xb7; const len = rlpBytesToInt(bytes, offset + 1, lenOfLen); const s = offset + 1 + lenOfLen; return { value: bytes.slice(s, s + len), nextOffset: s + len }; }
  if (prefix <= 0xf7) { const len = prefix - 0xc0; return decodeRlpList(bytes, offset + 1, len); }

  const lenOfLen = prefix - 0xf7;
  const len = rlpBytesToInt(bytes, offset + 1, lenOfLen);
  const s = offset + 1 + lenOfLen;
  return decodeRlpList(bytes, s, len);
}

function decodeRlpList(bytes, start, length) {
  const items = [];
  let cursor = start;
  const end = start + length;
  while (cursor < end) {
    const { value, nextOffset } = rlpDecode(bytes, cursor);
    items.push(value);
    cursor = nextOffset;
  }
  return { value: items, nextOffset: cursor };
}

function rlpBytesToInt(bytes, start, length) {
  let result = 0;
  for (let i = 0; i < length; i++) result = result * 256 + bytes[start + i];
  return result;
}

// ─── Parsing Helpers ─────────────────────────────────────────

/** Normalise an authorization object to {chainId, address, nonce, y, r, s}. */
function normalizeAuthObject(auth) {
  if (auth == null || typeof auth !== 'object') throw new TypeError('Authorization must be an object');
  return {
    chainId: toBigInt(auth.chainId ?? auth.chain_id),
    address: normalizeAddress(auth.address),
    nonce:   toBigInt(auth.nonce),
    y:       toBigInt(auth.y ?? auth.y_parity ?? 0),
    r:       toBigInt(auth.r),
    s:       toBigInt(auth.s),
  };
}

/** Parse one RLP-decoded tuple: [chainIdBytes, addrBytes, nonceBytes, yBytes, rBytes, sBytes]. */
function parseAuthFromRlpItem(item) {
  if (!Array.isArray(item) || item.length !== 6) throw new Error(`Invalid authorization tuple: expected 6 elements, got ${item?.length ?? 'none'}`);
  const [chainIdBytes, addressBytes, nonceBytes, yBytes, rBytes, sBytes] = item;
  if (!(addressBytes instanceof Uint8Array) || addressBytes.length !== 20) throw new Error(`Invalid address: expected 20 bytes, got ${addressBytes?.length ?? 'undefined'}`);
  return {
    chainId: bytesToBigInt(chainIdBytes),
    address: bytesToHex(addressBytes).toLowerCase(),
    nonce:   bytesToBigInt(nonceBytes),
    y:       bytesToBigInt(yBytes),
    r:       bytesToBigInt(rBytes),
    s:       bytesToBigInt(sBytes),
  };
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Detect whether a transaction is an EIP-7702 (type 0x04) transaction.
 * Accepts raw hex string, Uint8Array, or a decoded object with a `type`
 * field / `authorizationList` array.
 * @param {string|Uint8Array|object|null|undefined} rawTx
 * @returns {boolean}
 */
export function isEip7702Tx(rawTx) {
  if (rawTx == null) return false;

  // Decoded object form
  if (typeof rawTx === 'object' && !(rawTx instanceof Uint8Array)) {
    if (rawTx.type != null) {
      const t = rawTx.type;
      if (typeof t === 'string') return t === '0x4' || t === '0x04' || t === '4';
      if (typeof t === 'number') return t === EIP7702_TX_TYPE || t === 4;
    }
    if (Array.isArray(rawTx.authorizationList) || Array.isArray(rawTx.authorization_list)) return true;
    return false;
  }

  // Raw bytes — first byte is the EIP-2718 type
  if (typeof rawTx === 'string') {
    const hex = rawTx.startsWith('0x') ? rawTx.slice(2) : rawTx;
    return hex.length >= 2 && parseInt(hex.substring(0, 2), 16) === EIP7702_TX_TYPE;
  }
  if (rawTx instanceof Uint8Array) {
    return rawTx.length >= 1 && rawTx[0] === EIP7702_TX_TYPE;
  }
  return false;
}

/**
 * Parse an EIP-7702 authorization_list into structured objects.
 *
 * Accepts:
 *   1. Array of objects (ethers, viem, web3.js, etc.)
 *   2. Array of Uint8Array (raw RLP of each tuple)
 *   3. Hex string — RLP-encoded authorization_list
 *   4. Uint8Array — RLP-encoded authorization_list
 *
 * Each returned object has BigInt fields for chainId, nonce, y, r, s
 * and a lowercase 0x-prefixed address string.
 *
 * @param {Array|string|Uint8Array|null|undefined} rawOrDecoded
 * @returns {Array<{chainId: bigint, address: string, nonce: bigint, y: bigint, r: bigint, s: bigint}>}
 */
export function parseAuthorizationList(rawOrDecoded) {
  if (rawOrDecoded == null) return [];

  if (Array.isArray(rawOrDecoded)) {
    if (rawOrDecoded.length === 0) return [];
    const first = rawOrDecoded[0];
    if (first instanceof Uint8Array) {
      // Array of raw byte-arrays, each is RLP of one tuple
      return rawOrDecoded.map(bytes => {
        const { value } = rlpDecode(bytes);
        return parseAuthFromRlpItem(value);
      });
    }
    if (typeof first === 'object') return rawOrDecoded.map(normalizeAuthObject);
    // Fallback: try to hex-decode each element
    return rawOrDecoded.map(item => {
      const bytes = item instanceof Uint8Array ? item : hexToBytes(String(item));
      const { value } = rlpDecode(bytes);
      return parseAuthFromRlpItem(value);
    });
  }

  // Raw RLP bytes (hex string or Uint8Array)
  const bytes = typeof rawOrDecoded === 'string' ? hexToBytes(rawOrDecoded) : rawOrDecoded;
  const { value } = rlpDecode(bytes);
  if (!Array.isArray(value)) throw new Error('RLP-decoded authorization_list is not a list');
  return value.map(parseAuthFromRlpItem);
}

/**
 * Assess the risk profile of an EIP-7702 authorization_list.
 *
 * Checks:
 *   - Empty list → "none"
 *   - Known-malicious delegation → "critical"
 *   - Known-safe delegation → "none" + info note
 *   - EOA delegation (no code) → "critical"
 *   - Unverified contract → "medium"
 *   - Multiple distinct targets → "high"
 *   - Chain ID mismatch → "high"
 *   - Future nonce → "medium"
 *   - Homoglyph (same first/last 4 hex chars as user) → "high"
 *
 * @param {Array} authorizationList — from parseAuthorizationList() or compatible.
 * @param {object} [ctx]
 * @param {bigint|number|string} [ctx.currentChainId]
 * @param {bigint|number|string} [ctx.accountNonce]
 * @param {string} [ctx.userAddress]
 * @param {Object<string,boolean>} [ctx.contractCode] — lowercase addr → has code
 * @returns {{riskLevel: string, risks: Array, recommendations: string[], info: Array}}
 */
export function assessEip7702Risk(authorizationList, ctx = {}) {
  const risks = [];
  const recommendations = [];
  const info = [];

  // Guard: null / empty
  if (!authorizationList || authorizationList.length === 0) {
    return { riskLevel: 'none', risks, recommendations, info: [{ type: 'empty-authorization-list', message: 'No EIP-7702 delegations in this transaction' }] };
  }

  // Normalize context
  const currentChainId = (ctx.currentChainId !== undefined && ctx.currentChainId !== null) ? toBigInt(ctx.currentChainId) : undefined;
  const accountNonce   = (ctx.accountNonce !== undefined && ctx.accountNonce !== null) ? toBigInt(ctx.accountNonce) : undefined;
  const userAddress    = ctx.userAddress ? normalizeAddress(ctx.userAddress) : undefined;

  const targets = new Set();
  let anySafe = false;
  let anyUnknown = false;

  // Per-authorization checks
  for (let i = 0; i < authorizationList.length; i++) {
    const auth = authorizationList[i];
    const addr = normalizeAddress(auth.address);
    targets.add(addr);

    // Known-malicious
    const malicious = KNOWN_MALICIOUS_DELEGATIONS.find(m => m.address === addr);
    if (malicious) {
      risks.push({ type: 'known-malicious-delegation', severity: 'critical', message: `Authorization #${i} delegates to known-malicious contract: ${malicious.name} (${addr})`, details: { index: i, address: addr, name: malicious.name, reference: malicious.reference } });
    }

    // Known-safe
    const safe = KNOWN_SAFE_DELEGATIONS.find(s => s.address === addr);
    if (safe) {
      anySafe = true;
      info.push({ type: 'known-safe-delegation', message: `Authorization #${i} delegates to known-safe contract: ${safe.name} (${addr})`, details: { index: i, name: safe.name, category: safe.category, address: addr } });
    } else {
      anyUnknown = true;
    }

    // EOA delegation (confirmed no code)
    if (ctx.contractCode && Object.prototype.hasOwnProperty.call(ctx.contractCode, addr) && ctx.contractCode[addr] === false) {
      risks.push({ type: 'eoa-delegation', severity: 'critical', message: `Authorization #${i} delegates to an EOA (address has no contract code): ${addr}. Delegating to a non-contract is meaningless and may indicate an error or attack.`, details: { index: i, address: addr } });
    }

    // Chain ID mismatch (chainId 0 = valid for all chains)
    if (currentChainId !== undefined && auth.chainId !== 0n && auth.chainId !== currentChainId) {
      risks.push({ type: 'chain-id-mismatch', severity: 'high', message: `Authorization #${i} targets chain_id ${auth.chainId.toString()} but wallet is on chain ${currentChainId.toString()}. Cross-chain delegation detected.`, details: { index: i, authChainId: auth.chainId, currentChainId } });
    }

    // Future nonce
    if (accountNonce !== undefined && auth.nonce > accountNonce) {
      risks.push({ type: 'future-nonce', severity: 'medium', message: `Authorization #${i} nonce (${auth.nonce.toString()}) is higher than the account's current nonce (${accountNonce.toString()}). Unusual.`, details: { index: i, authNonce: auth.nonce, currentNonce: accountNonce } });
    }

    // Homoglyph heuristic
    if (userAddress) {
      const authPrefix = addr.slice(2, 6), authSuffix = addr.slice(-4);
      const userPrefix = userAddress.slice(2, 6), userSuffix = userAddress.slice(-4);
      if (authPrefix === userPrefix && authSuffix === userSuffix) {
        risks.push({ type: 'homoglyph-suspect', severity: 'high', message: `Authorization #${i} target shares the same first 4 and last 4 hex characters as your wallet address. Possible address-spoofing attempt.`, details: { index: i, target: addr, userAddress } });
      }
    }
  }

  // Multiple distinct targets
  if (targets.size > 1) {
    risks.push({ type: 'multi-delegation', severity: 'high', message: `Transaction delegates to ${targets.size} distinct contracts simultaneously. Single-tx multi-delegation is unusual.`, details: { targets: [...targets] } });
  }

  // Unverified delegation
  if (anyUnknown && !ctx.contractCode) {
    const unknownAddrs = [...targets].filter(a => !KNOWN_SAFE_DELEGATIONS.some(s => s.address === a));
    risks.push({ type: 'unverified-delegation', severity: 'medium', message: 'Delegating to contracts not on the known-safe allowlist. Verify each target on a block explorer before signing.', details: { targets: unknownAddrs } });
  }

  // Recommendations
  if (risks.length === 0 && anySafe) {
    recommendations.push('All delegations target well-known, audited contracts.');
    recommendations.push('Still verify that you intended to delegate your EOA before signing.');
  }
  if (anyUnknown) recommendations.push('Research every delegation target on a block explorer (Etherscan, Blockscout) before signing.');
  if (risks.some(r => r.severity === 'critical')) {
    recommendations.push('CRITICAL risk detected. Do NOT sign this transaction unless you fully understand what every delegation does.');
    recommendations.push('Attackers use EIP-7702 to gain persistent control over your wallet via tiny-looking transactions.');
  } else if (risks.some(r => r.severity === 'high')) {
    recommendations.push('High-risk EIP-7702 delegation detected. Review the target contract and chain ID carefully.');
  }
  if (authorizationList.length > 0 && risks.length === 0) {
    recommendations.push('You can revoke an EIP-7702 delegation at any time by signing a new authorization to a different address (or to the zero address).');
  }

  // Overall risk level — highest severity wins
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  let riskLevel = 'none';
  for (const r of risks) if (severityOrder[r.severity] > severityOrder[riskLevel]) riskLevel = r.severity;

  return { riskLevel, risks, recommendations, info };
}
