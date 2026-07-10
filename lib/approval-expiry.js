// lib/approval-expiry.js - Time-based approval expiry tracking (v3.7)
//
// World-first feature: track when each approval was first seen, surface
// ones older than the user's chosen expiry window, and offer revoke
// calldata. Defaults: 90 days, opt-in.
//
// Design:
//   - Pure helpers, no browser globals
//   - Storage shape: { enabled: bool, expiryDays: 90, records: { [key]: firstSeenTs } }
//   - Key: chainId + tokenAddress + spenderAddress (lowercased, concat)
//   - On every approval scan, check records; update firstSeen if new, compute age
//   - On age >= expiryDays, mark as "expired" — surfaces in popup + audit log
//
// This module does NOT sign or broadcast transactions. It only computes
// expiry status and generates revoke calldata via the existing
// lib/revoke-generator.js functions.

export const APPROVAL_EXPIRY_DEFAULT_DAYS = 90;
export const APPROVAL_EXPIRY_MIN_DAYS = 7;
export const APPROVAL_EXPIRY_MAX_DAYS = 365;

// ============================================================
// Storage helpers
// ============================================================

/**
 * Build the storage shape with sane defaults.
 * @returns {{ enabled: boolean, expiryDays: number, records: Object }}
 */
export function defaultExpiryState() {
  return {
    enabled: false,
    expiryDays: APPROVAL_EXPIRY_DEFAULT_DAYS,
    records: {}
  };
}

/**
 * Normalize a stored expiry state, filling in missing fields with defaults.
 * @param {Object} [state]
 * @returns {{ enabled: boolean, expiryDays: number, records: Object }}
 */
export function normalizeExpiryState(state) {
  const base = defaultExpiryState();
  if (!state || typeof state !== "object") return base;
  return {
    enabled: state.enabled === true,
    expiryDays: clampExpiryDays(state.expiryDays),
    records: (state.records && typeof state.records === "object") ? state.records : {}
  };
}

/**
 * Clamp expiryDays into [MIN_DAYS, MAX_DAYS].
 * @param {number} days
 * @returns {number}
 */
export function clampExpiryDays(days) {
  const n = Number(days);
  if (!Number.isFinite(n)) return APPROVAL_EXPIRY_DEFAULT_DAYS;
  if (n < APPROVAL_EXPIRY_MIN_DAYS) return APPROVAL_EXPIRY_MIN_DAYS;
  if (n > APPROVAL_EXPIRY_MAX_DAYS) return APPROVAL_EXPIRY_MAX_DAYS;
  return Math.floor(n);
}

// ============================================================
// Record key
// ============================================================

/**
 * Build a stable record key for a (chain, token, spender) triple.
 * Uses lowercase addresses. Whitespace-tolerant.
 * @param {number|string} chainId
 * @param {string} tokenAddress
 * @param {string} spenderAddress
 * @returns {string}
 */
export function buildRecordKey(chainId, tokenAddress, spenderAddress) {
  const chain = String(chainId || 0);
  const token = String(tokenAddress || "").toLowerCase().trim();
  const spender = String(spenderAddress || "").toLowerCase().trim();
  return `${chain}:${token}:${spender}`;
}

// ============================================================
// Scan integration
// ============================================================

/**
 * Update the records map with approvals from the latest scan.
 * Existing records keep their original firstSeen; new ones get Date.now().
 * Returns a new state object (does not mutate input).
 * @param {Object} state - Current expiry state
 * @param {Array} approvals - Array of approval objects { chainId, tokenAddress|token, spender|operator }
 * @param {number} [now=Date.now()]
 * @returns {Object} New state with updated records
 */
export function updateRecordsFromScan(state, approvals, now = Date.now()) {
  const base = normalizeExpiryState(state);
  if (!Array.isArray(approvals)) return base;
  const records = { ...base.records };
  for (const a of approvals) {
    const chain = a.chainId || a.chain || 0;
    const token = a.tokenAddress || a.token || a.contractAddress || "";
    const spender = a.spender || a.operator || "";
    if (!token || !spender) continue;
    const key = buildRecordKey(chain, token, spender);
    if (!records[key]) {
      records[key] = { firstSeen: now, chainId: chain, token: token.toLowerCase(), spender: spender.toLowerCase() };
    }
  }
  return { ...base, records };
}

// ============================================================
// Expiry classification
// ============================================================

/**
 * Classify an approval against the user's expiry window.
 * Returns one of: "fresh" (0-30%), "aging" (30-70%), "stale" (70-100%), "expired" (>100%).
 * @param {Object} record - { firstSeen: number }
 * @param {number} expiryDays
 * @param {number} [now=Date.now()]
 * @returns {{ status: string, ageDays: number, daysUntilExpiry: number, percent: number }}
 */
export function classifyExpiry(record, expiryDays, now = Date.now()) {
  const days = clampExpiryDays(expiryDays);
  if (!record || typeof record.firstSeen !== "number") {
    return { status: "unknown", ageDays: 0, daysUntilExpiry: days, percent: 0 };
  }
  const ageMs = Math.max(0, now - record.firstSeen);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const ratio = ageDays / days;
  const percent = Math.min(100, Math.round(ratio * 100));
  let status;
  if (ratio < 0.30) status = "fresh";
  else if (ratio < 0.70) status = "aging";
  else if (ratio < 1.0) status = "stale";
  else status = "expired";
  const daysUntilExpiry = Math.max(0, Math.round(days - ageDays));
  return { status, ageDays: Math.round(ageDays * 10) / 10, daysUntilExpiry, percent };
}

// ============================================================
// Compute expired list
// ============================================================

/**
 * Given an expiry state and an approvals array, produce the list of expired
 * approvals that need user attention. Each entry includes the original
 * approval fields plus expiry metadata.
 * @param {Object} state - Expiry state (with records)
 * @param {Array} approvals - Latest scan approvals
 * @param {number} [now=Date.now()]
 * @returns {Array<{ approval: Object, expiry: Object, key: string }>}
 */
export function computeExpiredApprovals(state, approvals, now = Date.now()) {
  const base = normalizeExpiryState(state);
  if (!base.enabled || !Array.isArray(approvals)) return [];
  const out = [];
  for (const a of approvals) {
    const chain = a.chainId || a.chain || 0;
    const token = a.tokenAddress || a.token || a.contractAddress || "";
    const spender = a.spender || a.operator || "";
    if (!token || !spender) continue;
    const key = buildRecordKey(chain, token, spender);
    const record = base.records[key];
    const expiry = classifyExpiry(record, base.expiryDays, now);
    if (expiry.status === "expired") {
      out.push({ approval: a, expiry, key });
    }
  }
  return out;
}

/**
 * Compute summary stats for the UI: counts by status across all approvals.
 * @param {Object} state
 * @param {Array} approvals
 * @param {number} [now]
 * @returns {{ total: number, fresh: number, aging: number, stale: number, expired: number, enabled: boolean }}
 */
export function summarizeExpiry(state, approvals, now = Date.now()) {
  const base = normalizeExpiryState(state);
  const summary = { total: 0, fresh: 0, aging: 0, stale: 0, expired: 0, enabled: base.enabled };
  if (!base.enabled || !Array.isArray(approvals)) return summary;
  for (const a of approvals) {
    const chain = a.chainId || a.chain || 0;
    const token = a.tokenAddress || a.token || a.contractAddress || "";
    const spender = a.spender || a.operator || "";
    if (!token || !spender) continue;
    const record = base.records[buildRecordKey(chain, token, spender)];
    const expiry = classifyExpiry(record, base.expiryDays, now);
    summary.total++;
    summary[expiry.status] = (summary[expiry.status] || 0) + 1;
  }
  return summary;
}

// ============================================================
// Records maintenance
// ============================================================

/**
 * Garbage-collect records for approvals that no longer exist in the latest
 * scan. Keeps records under a hard cap so storage doesn't grow unbounded.
 * @param {Object} state
 * @param {Array} approvals
 * @param {number} [maxRecords=10000]
 * @returns {Object} New state with pruned records
 */
export function pruneRecords(state, approvals, maxRecords = 10000) {
  const base = normalizeExpiryState(state);
  if (!Array.isArray(approvals)) return base;
  const activeKeys = new Set();
  for (const a of approvals) {
    const chain = a.chainId || a.chain || 0;
    const token = a.tokenAddress || a.token || a.contractAddress || "";
    const spender = a.spender || a.operator || "";
    if (!token || !spender) continue;
    activeKeys.add(buildRecordKey(chain, token, spender));
  }
  // Keep all records that match an active approval; drop everything else.
  const kept = {};
  for (const k of Object.keys(base.records)) {
    if (activeKeys.has(k)) kept[k] = base.records[k];
  }
  // If still over cap (unlikely), drop oldest entries by firstSeen.
  const keptKeys = Object.keys(kept);
  if (keptKeys.length > maxRecords) {
    keptKeys.sort((a, b) => (kept[a].firstSeen || 0) - (kept[b].firstSeen || 0));
    const overflow = keptKeys.length - maxRecords;
    for (let i = 0; i < overflow; i++) delete kept[keptKeys[i]];
  }
  return { ...base, records: kept };
}
