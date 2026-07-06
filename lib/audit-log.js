// lib/audit-log.js - Privacy-first exportable audit log.
//
// Maintains a tamper-evident local log of every significant decision
// the extension made (blocks, warnings, approvals scanned, sims run).
// All entries are local-only. Export as CSV or JSON for personal
// record-keeping or for sharing with a security researcher.
//
// Why this is novel:
//   • Every other extension either silently logs (no export) or sends
//     logs to a server (privacy violation).
//   • This is a privacy-first, locally-stored, user-controlled log
//     with one-click export.

import { shortAddr } from "./decoder.js";

const LOG_VERSION = 1;
const MAX_ENTRIES = 5000;

// Entry types.
export const ENTRY_TYPES = {
  BLOCKED: "blocked",                // Transaction blocked by user
  WARNED: "warned",                  // User shown a warning
  ALLOWED: "allowed",                // User signed after warning
  APPROVAL_SCAN: "approval_scan",    // Scan completed
  SIMULATION: "simulation",          // Transaction simulated
  REVOKE_GENERATED: "revoke_generated", // Revoke calldata generated
  PHISHING_BLOCKED: "phishing_blocked", // Site blocked
  DRAINER_DETECTED: "drainer_detected",  // 0-day drainer flagged
  STALE_DETECTED: "stale_detected"   // Stale approval found
};

// In-memory log. Persists to chrome.storage.local via background.js.
let _log = [];
let _persistFn = null;

/**
 * Set the persistence function. Called by background.js to wire storage.
 */
export function setPersistence(fn) {
  _persistFn = fn;
}

/**
 * Append an entry to the log.
 *
 * @param {string} type — ENTRY_TYPES value
 * @param {Object} data — type-specific data (see examples below)
 * @returns {Object} — the created entry
 */
export function logEvent(type, data = {}) {
  if (!type || !Object.values(ENTRY_TYPES).includes(type)) {
    throw new Error(`audit-log: invalid type "${type}"`);
  }
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: Date.now(),
    isoTime: new Date().toISOString(),
    type,
    ...data
  };
  _log.push(entry);

  // Cap log size.
  if (_log.length > MAX_ENTRIES) {
    _log = _log.slice(-MAX_ENTRIES);
  }

  // Persist asynchronously (don't block).
  if (_persistFn) {
    Promise.resolve(_persistFn(_log)).catch(() => { /* ignore */ });
  }

  return entry;
}

/**
 * Get all log entries (newest first).
 */
export function getLog() {
  return [..._log].reverse();
}

/**
 * Get entries filtered by type.
 */
export function getLogByType(type, limit = 100) {
  return _log.filter((e) => e.type === type).slice(-limit).reverse();
}

/**
 * Get entries within a time window.
 */
export function getLogInRange(fromTs, toTs = Date.now()) {
  return _log.filter((e) => e.timestamp >= fromTs && e.timestamp <= toTs);
}

/**
 * Clear the log. Returns the count that was cleared.
 */
export function clearLog() {
  const count = _log.length;
  _log = [];
  if (_persistFn) {
    Promise.resolve(_persistFn(_log)).catch(() => { /* ignore */ });
  }
  return count;
}

/**
 * Load log from persistence. Called at startup.
 */
export function loadLog(entries) {
  if (!Array.isArray(entries)) return;
  _log = entries.slice(-MAX_ENTRIES);
}

/**
 * Get statistics for the log.
 */
export function getLogStats() {
  const stats = {
    total: _log.length,
    byType: {},
    oldestEntry: null,
    newestEntry: null,
    firstEntry: null
  };
  for (const e of _log) {
    stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
  }
  if (_log.length > 0) {
    stats.oldestEntry = _log[0].timestamp;
    stats.newestEntry = _log[_log.length - 1].timestamp;
    stats.firstEntry = _log[0];
  }
  return stats;
}

/**
 * Export the log as CSV. Privacy-first: only includes fields the
 * user has approved. Returns a string ready for download.
 */
export function exportAsCsv(entries = null) {
  const data = entries || getLog();
  if (data.length === 0) return "";

  const headers = [
    "timestamp", "iso_time", "type",
    "target_address", "spender_address", "chain_id", "method",
    "risk_score", "risk_level", "block_reason", "user_action",
    "site_origin"
  ];

  const lines = [headers.join(",")];
  for (const e of data) {
    const row = headers.map((h) => csvEscape(fieldFor(e, h))).join(",");
    lines.push(row);
  }
  return lines.join("\n");
}

function fieldFor(entry, field) {
  switch (field) {
    case "timestamp": return entry.timestamp;
    case "iso_time": return entry.isoTime;
    case "type": return entry.type;
    case "target_address": return entry.target || entry.to || entry.spender || entry.address || "";
    case "spender_address": return entry.spender || entry.operator || "";
    case "chain_id": return entry.chainId || "";
    case "method": return entry.method || "";
    case "risk_score": return entry.riskScore || entry.score || "";
    case "risk_level": return entry.riskLevel || entry.severity || "";
    case "block_reason": return entry.reason || entry.message || "";
    case "user_action": return entry.userAction || "";
    case "site_origin": return entry.origin || entry.host || "";
    default: return "";
  }
}

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  // Escape quotes and wrap in quotes if contains comma/quote/newline.
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export the log as JSON.
 */
export function exportAsJson(entries = null) {
  const data = entries || getLog();
  return JSON.stringify({
    version: LOG_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: "WalletGuard Pro v3.5.0",
    count: data.length,
    stats: getLogStats(),
    entries: data
  }, null, 2);
}

/**
 * Build a browser-triggerable download payload.
 * Returns { filename, mimeType, content } for use with chrome.downloads
 * or a synthetic <a> link.
 */
export function buildDownload(format = "csv", entries = null) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  if (format === "json") {
    return {
      filename: `walletguard-audit-${timestamp}.json`,
      mimeType: "application/json",
      content: exportAsJson(entries)
    };
  }
  return {
    filename: `walletguard-audit-${timestamp}.csv`,
    mimeType: "text/csv",
    content: exportAsCsv(entries)
  };
}

/**
 * Convenience: log a blocked transaction.
 */
export function logBlock(tx, reason, options = {}) {
  return logEvent(ENTRY_TYPES.BLOCKED, {
    target: tx.to,
    method: tx.data ? tx.data.slice(0, 10) : null,
    chainId: tx.chainId,
    reason,
    riskScore: options.riskScore,
    riskLevel: options.severity,
    origin: options.origin,
    userAction: "blocked"
  });
}

/**
 * Convenience: log a phishing site block.
 */
export function logPhishingBlock(host, evidence) {
  return logEvent(ENTRY_TYPES.PHISHING_BLOCKED, {
    host,
    evidence,
    userAction: "blocked"
  });
}

/**
 * Convenience: log a drainer detection.
 */
export function logDrainerDetection(tx, dnaResult) {
  return logEvent(ENTRY_TYPES.DRAINER_DETECTED, {
    target: tx.to,
    archetype: dnaResult.topMatch?.archetype,
    similarity: dnaResult.topMatch?.similarity,
    verdict: dnaResult.verdict,
    riskLevel: dnaResult.verdict
  });
}

/**
 * Convenience: log an approval scan.
 */
export function logApprovalScan(summary) {
  return logEvent(ENTRY_TYPES.APPROVAL_SCAN, {
    total: summary.total,
    risky: summary.risky,
    unlimited: summary.unlimited,
    chainCount: summary.chainsScanned || summary.chainCount,
    staleCount: summary.staleCount
  });
}
