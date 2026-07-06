/**
 * @fileoverview Privacy-Preserving Threat Intelligence Feed
 *
 * Loads, verifies, and applies a community-curated threat feed distributed
 * via GitHub (or any HTTPS source). The feed is a JSON manifest containing
 * SIGNED threat fingerprints — never any user data.
 *
 * Design principles:
 *   - NO user data is sent or stored centrally
 *   - Threats are fingerprints (domains, addresses, selectors, hashes) — not PII
 *   - Signatures are verified LOCALLY before any threat is applied
 *   - Feed is content-addressed and version-pinned
 *   - Sources: official WalletGuard feed + community contributions
 *
 * Pure functions only — no chrome.*, no fetch. The caller fetches the
 * manifest, then passes the JSON string here for verification + lookup.
 *
 * @module lib/threat-feed
 */

/**
 * Threat entry shape:
 *   {
 *     id: string,                  // ULID/UUID, unique within feed
 *     type: "domain"|"address"|"selector"|"bytecode"|"pattern"|"delegate",
 *     value: string,               // the fingerprint (lowercased)
 *     severity: "low"|"medium"|"high"|"critical",
 *     category: string,            // "drainer"|"phisher"|"mev-bot"|"honeypot"|...
 *     name: string,                // human-readable identifier
 *     reference?: string,          // URL to public source/analysis
 *     firstSeen: string,           // ISO date
 *     notes?: string               // free text
 *   }
 *
 * Manifest shape:
 *   {
 *     version: 1,                  // schema version
 *     feedVersion: string,         // feed identifier (e.g. "wg-2026-07-06")
 *     generatedAt: string,         // ISO timestamp
 *     maintainer: string,          // public key fingerprint of maintainer
 *     threats: [...],              // array of ThreatEntry
 *     signatures: {                // Ed25519 signatures
 *       "ed25519:<base64-pub>": "<base64-sig>"
 *     }
 *   }
 */

// ─── Hashing & integrity ─────────────────────────────────────

/**
 * Deterministic SHA-256 of a string, hex-encoded. Uses Web Crypto when
 * available (browser + Node 16+); falls back to Node's `crypto` if not.
 *
 * Returns a Promise<hex> in browser, hex in Node. To keep this module
 * purely synchronous and testable, we expose two flavours:
 *
 *   - sha256Sync(text)    — synchronous (uses crypto.subtle synchronously?)
 *                            Actually, subtle is async, so this returns a Promise.
 *
 * For testing in Node we expose a sync fallback via the `node:crypto` module
 * when the dynamic `require` succeeds.
 */
let __nodeCrypto = null;
// Lazy-load Node's crypto so the module stays browser-friendly.
// Uses the indirect-eval trick to get a working `require` in pure ESM.
try {
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    // eslint-disable-next-line no-eval
    const _require = (0, eval)('require');
    __nodeCrypto = _require("node:crypto");
  }
} catch { /* not Node */ }

/**
 * Synchronous SHA-256 → hex. Only available in Node. In browser contexts
 * the caller must use verifySignatureAsync() instead.
 * @param {string} text
 * @returns {string} hex digest (lowercase, no prefix)
 */
export function sha256Hex(text) {
  if (!__nodeCrypto) {
    throw new Error("sha256Hex is Node-only. Use sha256HexAsync in the browser.");
  }
  return __nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Async SHA-256 → hex. Works in both Node (>=16) and browser via Web Crypto.
 * @param {string} text
 * @returns {Promise<string>} hex digest (lowercase, no prefix)
 */
export async function sha256HexAsync(text) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  if (__nodeCrypto) {
    return __nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex");
  }
  throw new Error("No SHA-256 implementation available");
}

// ─── Manifest serialization (canonical form) ────────────────

/**
 * Canonicalize a manifest for signing. Keys are sorted, whitespace removed,
 * no trailing fields. Returns the string that should be signed.
 * @param {object} manifest
 * @returns {string}
 */
export function canonicalize(manifest) {
  // Strip the `signatures` field itself — it's metadata about the rest.
  const m = { ...manifest };
  delete m.signatures;
  return stableStringify(m);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
}

// ─── Ed25519 signature verification ─────────────────────────

/**
 * Verify an Ed25519 signature. Accepts base64 or hex encoded key + sig.
 * Synchronous in Node; async in browser.
 * @param {object} args
 * @param {string} args.message — canonical message bytes (utf-8)
 * @param {string} args.signature — base64 (or hex with prefix 0x) signature
 * @param {string} args.publicKey — base64 (or hex with prefix 0x) public key
 * @param {"base64"|"hex"} [args.encoding="base64"]
 * @returns {boolean}
 */
export function verifySignature({ message, signature, publicKey, encoding = "base64" }) {
  if (!__nodeCrypto) {
    throw new Error("Synchronous verifySignature is Node-only. Use verifySignatureAsync in the browser.");
  }
  const msgBuf = Buffer.from(message, "utf8");
  const sigBuf = decodeBuf(signature, encoding);
  const keyBuf = decodeBuf(publicKey, encoding);
  try {
    return __nodeCrypto.verify(null, msgBuf, { key: keyBuf, format: "der", type: "spki" }, sigBuf);
  } catch {
    // Some Node versions accept raw keys with "raw" format
    try {
      return __nodeCrypto.verify(null, msgBuf, { key: keyBuf, format: "raw", type: "spki" }, sigBuf);
    } catch {
      return false;
    }
  }
}

/**
 * Async Ed25519 verification via Web Crypto. Works in browsers.
 * @param {object} args
 * @param {string} args.message — utf-8 text
 * @param {string} args.signature — base64 (or hex) signature
 * @param {string} args.publicKey — base64 (or hex) public key (raw 32 bytes)
 * @param {"base64"|"hex"} [args.encoding="base64"]
 * @returns {Promise<boolean>}
 */
export async function verifySignatureAsync({ message, signature, publicKey, encoding = "base64" }) {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Web Crypto not available in this context");
  }
  const msgBuf = new TextEncoder().encode(message);
  const sigBytes = decodeToBytes(signature, encoding);
  const keyBytes = decodeToBytes(publicKey, encoding);

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "Ed25519" }, false, ["verify"]
    );
    return await crypto.subtle.verify({ name: "Ed25519" }, cryptoKey, sigBytes, msgBuf);
  } catch {
    return false;
  }
}

function decodeBuf(s, encoding) {
  if (encoding === "hex") {
    const hex = s.startsWith("0x") ? s.slice(2) : s;
    return Buffer.from(hex, "hex");
  }
  return Buffer.from(s, "base64");
}

function decodeToBytes(s, encoding) {
  if (encoding === "hex") {
    const hex = s.startsWith("0x") ? s.slice(2) : s;
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── Manifest validation ────────────────────────────────────

/**
 * Validate a manifest's basic structure. Does NOT verify signatures.
 * @param {unknown} manifest
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateManifest(manifest) {
  if (manifest == null || typeof manifest !== "object") {
    return { ok: false, error: "Manifest must be an object" };
  }
  if (manifest.version !== 1) {
    return { ok: false, error: `Unsupported manifest version: ${manifest.version}` };
  }
  if (typeof manifest.feedVersion !== "string" || !manifest.feedVersion) {
    return { ok: false, error: "Missing feedVersion" };
  }
  if (typeof manifest.generatedAt !== "string") {
    return { ok: false, error: "Missing generatedAt" };
  }
  if (typeof manifest.maintainer !== "string") {
    return { ok: false, error: "Missing maintainer key fingerprint" };
  }
  if (!Array.isArray(manifest.threats)) {
    return { ok: false, error: "threats must be an array" };
  }
  if (manifest.signatures == null || typeof manifest.signatures !== "object") {
    return { ok: false, error: "Missing signatures object" };
  }
  const sigKeys = Object.keys(manifest.signatures);
  if (sigKeys.length === 0) {
    return { ok: false, error: "No signatures present" };
  }
  // Validate each threat entry
  const validTypes = new Set(["domain", "address", "selector", "bytecode", "pattern", "delegate"]);
  const validSeverities = new Set(["low", "medium", "high", "critical"]);
  const seen = new Set();
  for (let i = 0; i < manifest.threats.length; i++) {
    const t = manifest.threats[i];
    if (t == null || typeof t !== "object") return { ok: false, error: `Threat #${i} is not an object` };
    if (typeof t.id !== "string" || !t.id) return { ok: false, error: `Threat #${i} missing id` };
    if (seen.has(t.id)) return { ok: false, error: `Duplicate threat id: ${t.id}` };
    seen.add(t.id);
    if (!validTypes.has(t.type)) return { ok: false, error: `Threat #${i} has invalid type: ${t.type}` };
    if (typeof t.value !== "string" || !t.value) return { ok: false, error: `Threat #${i} missing value` };
    if (!validSeverities.has(t.severity)) return { ok: false, error: `Threat #${i} invalid severity: ${t.severity}` };
    if (typeof t.name !== "string") return { ok: false, error: `Threat #${i} missing name` };
    if (typeof t.firstSeen !== "string") return { ok: false, error: `Threat #${i} missing firstSeen` };
  }
  return { ok: true };
}

/**
 * Verify all signatures on a manifest.
 * @param {object} manifest
 * @param {object} [trustKeys] — map of "ed25519:<base64>" → trusted public key
 * @returns {{ok: true, signedBy: string[]} | {ok: false, error: string}}
 */
export function verifyManifestSignatures(manifest, trustKeys = {}) {
  const canonical = canonicalize(manifest);
  const signedBy = [];
  for (const [keyId, sig] of Object.entries(manifest.signatures || {})) {
    const pub = trustKeys[keyId];
    if (!pub) {
      return { ok: false, error: `Unknown signing key: ${keyId}` };
    }
    let ok;
    try {
      ok = verifySignature({ message: canonical, signature: sig, publicKey: pub, encoding: "base64" });
    } catch (e) {
      return { ok: false, error: `Signature verification failed: ${e.message}` };
    }
    if (!ok) return { ok: false, error: `Invalid signature from ${keyId}` };
    signedBy.push(keyId);
  }
  if (signedBy.length === 0) return { ok: false, error: "No valid signatures" };
  return { ok: true, signedBy };
}

/**
 * Async version of verifyManifestSignatures — uses Web Crypto in browser.
 */
export async function verifyManifestSignaturesAsync(manifest, trustKeys = {}) {
  const canonical = canonicalize(manifest);
  const signedBy = [];
  for (const [keyId, sig] of Object.entries(manifest.signatures || {})) {
    const pub = trustKeys[keyId];
    if (!pub) return { ok: false, error: `Unknown signing key: ${keyId}` };
    const ok = await verifySignatureAsync({ message: canonical, signature: sig, publicKey: pub, encoding: "base64" });
    if (!ok) return { ok: false, error: `Invalid signature from ${keyId}` };
    signedBy.push(keyId);
  }
  if (signedBy.length === 0) return { ok: false, error: "No valid signatures" };
  return { ok: true, signedBy };
}

// ─── Lookup interface ────────────────────────────────────────

/**
 * Build an in-memory lookup index from a verified manifest.
 * @param {object} manifest — already validated + signed
 * @returns {{
 *   byDomain: Map<string, ThreatEntry>,
 *   byAddress: Map<string, ThreatEntry>,
 *   bySelector: Map<string, ThreatEntry>,
 *   byDelegate: Map<string, ThreatEntry>,
 *   patterns: Array<{re: RegExp, entry: ThreatEntry}>,
 *   all: ThreatEntry[]
 * }}
 */
export function buildIndex(manifest) {
  const byDomain = new Map();
  const byAddress = new Map();
  const bySelector = new Map();
  const byDelegate = new Map();
  const patterns = [];
  const all = [];

  for (const t of manifest.threats || []) {
    all.push(t);
    const value = (t.value || "").toLowerCase();
    if (t.type === "domain") byDomain.set(value, t);
    else if (t.type === "address") byAddress.set(value, t);
    else if (t.type === "selector") bySelector.set(value, t);
    else if (t.type === "delegate") byDelegate.set(value, t);
    else if (t.type === "pattern") {
      try {
        patterns.push({ re: new RegExp(value, "i"), entry: t });
      } catch { /* invalid regex — skip */ }
    }
    // bytecode type is verified on-demand via eth_getCode, not pre-indexed
  }

  return { byDomain, byAddress, bySelector, byDelegate, patterns, all };
}

/**
 * Look up a threat by query type.
 * @param {object} index — from buildIndex()
 * @param {object} query — one of { domain, address, selector, delegate, calldata }
 * @returns {ThreatEntry | null}
 */
export function lookup(index, query) {
  if (!query || !index) return null;
  if (query.domain) {
    const d = (query.domain || "").toLowerCase();
    const hit = index.byDomain.get(d);
    if (hit) return hit;
  }
  if (query.address) {
    const a = (query.address || "").toLowerCase();
    const hit = index.byAddress.get(a);
    if (hit) return hit;
  }
  if (query.selector) {
    const s = (query.selector || "").toLowerCase();
    const hit = index.bySelector.get(s);
    if (hit) return hit;
  }
  if (query.delegate) {
    const a = (query.delegate || "").toLowerCase();
    const hit = index.byDelegate.get(a);
    if (hit) return hit;
  }
  if (query.calldata && index.patterns.length > 0) {
    const c = String(query.calldata);
    for (const p of index.patterns) {
      if (p.re.test(c)) return p.entry;
    }
  }
  return null;
}

/**
 * Compute the feed hash for a manifest (used for pinning / update checks).
 * @param {object} manifest
 * @returns {string} hex sha256 of canonical manifest
 */
export function feedHash(manifest) {
  return sha256Hex(canonicalize(manifest));
}
