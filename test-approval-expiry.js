// test-approval-expiry.js - Tests for lib/approval-expiry.js
//
// Approval expiry reminders: track when each approval was first seen,
// surface ones older than the user's chosen window, offer revoke calldata.

import assert from "node:assert/strict";
import {
  APPROVAL_EXPIRY_DEFAULT_DAYS,
  APPROVAL_EXPIRY_MIN_DAYS,
  APPROVAL_EXPIRY_MAX_DAYS,
  defaultExpiryState,
  normalizeExpiryState,
  clampExpiryDays,
  buildRecordKey,
  updateRecordsFromScan,
  classifyExpiry,
  computeExpiredApprovals,
  summarizeExpiry,
  pruneRecords
} from "./lib/approval-expiry.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }
function falsy(val, name) { ok(!val ? name : `${name} (got truthy)`); }

// ============================================================
// Constants & defaults
// ============================================================

console.log("[constants]");
{
  truthy(APPROVAL_EXPIRY_DEFAULT_DAYS === 90, "default is 90 days");
  truthy(APPROVAL_EXPIRY_MIN_DAYS === 7, "min is 7 days");
  truthy(APPROVAL_EXPIRY_MAX_DAYS === 365, "max is 365 days");
}

console.log("[defaultExpiryState]");
{
  const s = defaultExpiryState();
  eq(s.enabled, false, "disabled by default (opt-in)");
  eq(s.expiryDays, 90, "default 90 days");
  eq(Object.keys(s.records).length, 0, "empty records");
}

console.log("[normalizeExpiryState]");
{
  eq(normalizeExpiryState(null).enabled, false, "null → safe defaults");
  eq(normalizeExpiryState(undefined).expiryDays, 90, "undefined → safe defaults");
  eq(normalizeExpiryState({ enabled: true }).enabled, true, "preserves enabled=true");
  eq(normalizeExpiryState({ enabled: "yes" }).enabled, false, "string 'yes' → false");
  eq(normalizeExpiryState({ expiryDays: 30 }).expiryDays, 30, "preserves valid expiryDays");
  eq(normalizeExpiryState({ expiryDays: 1 }).expiryDays, 7, "clamps too-low expiryDays");
  eq(normalizeExpiryState({ expiryDays: 9999 }).expiryDays, 365, "clamps too-high expiryDays");
  eq(normalizeExpiryState({ expiryDays: "30" }).expiryDays, 30, "coerces string number");
  eq(normalizeExpiryState({ expiryDays: NaN }).expiryDays, 90, "NaN → 90");
  eq(normalizeExpiryState({ expiryDays: -50 }).expiryDays, 7, "negative → 7");
}

console.log("[clampExpiryDays]");
{
  eq(clampExpiryDays(7), 7, "7 → 7");
  eq(clampExpiryDays(90), 90, "90 → 90");
  eq(clampExpiryDays(365), 365, "365 → 365");
  eq(clampExpiryDays(6), 7, "6 → clamped to 7");
  eq(clampExpiryDays(366), 365, "366 → clamped to 365");
  eq(clampExpiryDays(0), 7, "0 → clamped to 7");
  eq(clampExpiryDays(-100), 7, "negative → clamped to 7");
  eq(clampExpiryDays(90.7), 90, "decimal truncated");
  eq(clampExpiryDays("30"), 30, "string number coerced");
  eq(clampExpiryDays("abc"), 90, "non-numeric → 90");
}

console.log("[buildRecordKey]");
{
  eq(buildRecordKey(1, "0xa0b8", "0xb0b"),
     "1:0xa0b8:0xb0b",
     "basic key shape");
  eq(buildRecordKey(1, "0xA0B8", "0xb0b"),
     "1:0xa0b8:0xb0b",
     "lowercases token");
  eq(buildRecordKey(1, "  0xa0b8  ", "0xb0b"),
     "1:0xa0b8:0xb0b",
     "trims whitespace");
  eq(buildRecordKey("", "0xa0b8", "0xb0b"),
     "0:0xa0b8:0xb0b",
     "empty chainId → '0'");
  eq(buildRecordKey(null, "", "0xb0b"),
     "0::0xb0b",
     "empty token → empty string (still a valid key)");
}

// ============================================================
// updateRecordsFromScan
// ============================================================

console.log("[updateRecordsFromScan — new approvals get timestamp]");
{
  const now = 1700000000000;
  const approvals = [
    { chainId: 1, tokenAddress: "0xa0b8", spender: "0xb0b" },
    { chainId: 1, tokenAddress: "0xc0c", spender: "0xd0d" }
  ];
  const next = updateRecordsFromScan(defaultExpiryState(), approvals, now);
  eq(Object.keys(next.records).length, 2, "2 records created");
  eq(next.records["1:0xa0b8:0xb0b"].firstSeen, now, "firstSeen = now");
  eq(next.records["1:0xc0c:0xd0d"].firstSeen, now, "second record too");
}

console.log("[updateRecordsFromScan — existing records preserved]");
{
  const oldTs = 1600000000000;
  const newTs = 1700000000000;
  const initial = {
    enabled: true, expiryDays: 90,
    records: { "1:0xa0b8:0xb0b": { firstSeen: oldTs, chainId: 1, token: "0xa0b8", spender: "0xb0b" } }
  };
  const approvals = [{ chainId: 1, tokenAddress: "0xa0b8", spender: "0xb0b" }];
  const next = updateRecordsFromScan(initial, approvals, newTs);
  eq(next.records["1:0xa0b8:0xb0b"].firstSeen, oldTs,
     "existing firstSeen preserved (NOT updated to now)");
}

console.log("[updateRecordsFromScan — fallback field names]");
{
  const approvals = [
    { chain: 1, token: "0xa0b8", operator: "0xb0b" }, // legacy field names
    { chainId: 1, contractAddress: "0xc0c", spender: "0xd0d" }, // contractAddress
    { chainId: 1, tokenAddress: "0xe0e" } // no spender → skipped
  ];
  const next = updateRecordsFromScan(defaultExpiryState(), approvals, 1);
  eq(Object.keys(next.records).length, 2,
     "3rd approval skipped (missing spender)");
  truthy(next.records["1:0xa0b8:0xb0b"], "legacy fields accepted");
  truthy(next.records["1:0xc0c:0xd0d"], "contractAddress fallback accepted");
}

console.log("[updateRecordsFromScan — empty input]");
{
  const next = updateRecordsFromScan(defaultExpiryState(), [], 1);
  eq(Object.keys(next.records).length, 0, "empty approvals → no records");
  eq(updateRecordsFromScan(defaultExpiryState(), null, 1).records, {},
     "null approvals → empty records");
  eq(updateRecordsFromScan(null, [{ chainId: 1, tokenAddress: "0xa", spender: "0xb" }], 1).records["1:0xa:0xb"].firstSeen,
     1,
     "null state → returns new state with records");
}

// ============================================================
// classifyExpiry
// ============================================================

console.log("[classifyExpiry — threshold zones]");
{
  const day = 24 * 60 * 60 * 1000;
  // 90-day expiry window:
  //  fresh:    0–30% = 0–27 days
  //  aging:    30–70% = 27–63 days
  //  stale:    70–100% = 63–90 days
  //  expired:  >100% = >90 days
  const cases = [
    { days: 0, status: "fresh" },
    { days: 10, status: "fresh" },
    { days: 27, status: "aging" },   // exactly 30%
    { days: 50, status: "aging" },
    { days: 63, status: "stale" },   // exactly 70%
    { days: 89, status: "stale" },
    { days: 91, status: "expired" },
    { days: 365, status: "expired" }
  ];
  const now = 100 * day;
  for (const c of cases) {
    const r = classifyExpiry({ firstSeen: now - c.days * day }, 90, now);
    eq(r.status, c.status, `${c.days}d → ${c.status}`);
  }
}

console.log("[classifyExpiry — metadata]");
{
  const day = 24 * 60 * 60 * 1000;
  const now = 100 * day;
  const r = classifyExpiry({ firstSeen: now - 45 * day }, 90, now);
  eq(r.percent, 50, "45 days into 90-day window = 50%");
  eq(r.daysUntilExpiry, 45, "45 days until expiry");
  eq(r.ageDays, 45, "ageDays = 45");
}

console.log("[classifyExpiry — missing record]");
{
  const r = classifyExpiry(null, 90, 1);
  eq(r.status, "unknown", "null record → unknown");
  eq(r.percent, 0, "percent = 0");
}

console.log("[classifyExpiry — future firstSeen (clock skew)]");
{
  // If firstSeen is in the future (e.g., NTP sync), clamp to 0.
  const r = classifyExpiry({ firstSeen: Date.now() + 100000 }, 90);
  eq(r.status, "fresh", "future firstSeen treated as fresh");
}

// ============================================================
// computeExpiredApprovals
// ============================================================

console.log("[computeExpiredApprovals — disabled returns empty]");
{
  const state = defaultExpiryState();
  const approvals = [{ chainId: 1, tokenAddress: "0xa", spender: "0xb" }];
  eq(computeExpiredApprovals(state, approvals).length, 0,
     "disabled → no expired list");
}

console.log("[computeExpiredApprovals — only expired surface]");
{
  const day = 24 * 60 * 60 * 1000;
  const now = 200 * day;
  const state = {
    enabled: true, expiryDays: 90,
    records: {
      "1:0xa:0xb": { firstSeen: now - 100 * day }, // expired
      "1:0xc:0xd": { firstSeen: now - 30 * day },  // aging
      "1:0xe:0xf": { firstSeen: now - 5 * day }    // fresh
    }
  };
  const approvals = [
    { chainId: 1, tokenAddress: "0xa", spender: "0xb", tokenSymbol: "AAA" },
    { chainId: 1, tokenAddress: "0xc", spender: "0xd", tokenSymbol: "CCC" },
    { chainId: 1, tokenAddress: "0xe", spender: "0xf", tokenSymbol: "EEE" }
  ];
  const out = computeExpiredApprovals(state, approvals, now);
  eq(out.length, 1, "only 1 expired");
  eq(out[0].approval.tokenSymbol, "AAA", "expired one is AAA");
  eq(out[0].expiry.status, "expired", "status = expired");
}

console.log("[computeExpiredApprovals — unrecorded approvals skipped]");
{
  const state = { enabled: true, expiryDays: 90, records: {} };
  const approvals = [{ chainId: 1, tokenAddress: "0xa", spender: "0xb" }];
  eq(computeExpiredApprovals(state, approvals).length, 0,
     "no records → none expired");
}

// ============================================================
// summarizeExpiry
// ============================================================

console.log("[summarizeExpiry]");
{
  const day = 24 * 60 * 60 * 1000;
  const now = 200 * day;
  const state = {
    enabled: true, expiryDays: 90,
    records: {
      "1:0xa:0xb": { firstSeen: now - 100 * day },  // expired
      "1:0xc:0xd": { firstSeen: now - 70 * day },   // stale (77%)
      "1:0xe:0xf": { firstSeen: now - 40 * day },   // aging
      "1:0xg:0xh": { firstSeen: now - 5 * day }     // fresh
    }
  };
  const approvals = [
    { chainId: 1, tokenAddress: "0xa", spender: "0xb" },
    { chainId: 1, tokenAddress: "0xc", spender: "0xd" },
    { chainId: 1, tokenAddress: "0xe", spender: "0xf" },
    { chainId: 1, tokenAddress: "0xg", spender: "0xh" }
  ];
  const s = summarizeExpiry(state, approvals, now);
  eq(s.total, 4, "total = 4");
  eq(s.expired, 1, "1 expired");
  eq(s.stale, 1, "1 stale");
  eq(s.aging, 1, "1 aging");
  eq(s.fresh, 1, "1 fresh");
  eq(s.enabled, true, "enabled flag included");
}

console.log("[summarizeExpiry — disabled returns zeros]");
{
  const s = summarizeExpiry(defaultExpiryState(), [
    { chainId: 1, tokenAddress: "0xa", spender: "0xb" }
  ]);
  eq(s.total, 0, "disabled → total = 0");
  eq(s.enabled, false, "enabled flag = false");
}

// ============================================================
// pruneRecords
// ============================================================

console.log("[pruneRecords — drops records not in current scan]");
{
  const state = {
    enabled: true, expiryDays: 90,
    records: {
      "1:0xa:0xb": { firstSeen: 1 },
      "1:0xc:0xd": { firstSeen: 2 },
      "1:0xe:0xf": { firstSeen: 3 }
    }
  };
  const approvals = [{ chainId: 1, tokenAddress: "0xa", spender: "0xb" }];
  const next = pruneRecords(state, approvals);
  eq(Object.keys(next.records).length, 1, "2 dropped, 1 kept");
  truthy(next.records["1:0xa:0xb"], "active approval kept");
  falsy(next.records["1:0xc:0xd"], "stale record dropped");
  falsy(next.records["1:0xe:0xf"], "stale record dropped");
}

console.log("[pruneRecords — respects maxRecords cap]");
{
  const records = {};
  for (let i = 0; i < 100; i++) {
    records[`1:0x${i.toString(16).padStart(2, "0")}:0xb`] = { firstSeen: i };
  }
  const state = { enabled: true, expiryDays: 90, records };
  const approvals = [];
  // No active approvals, so prune should drop everything.
  const next = pruneRecords(state, approvals);
  eq(Object.keys(next.records).length, 0, "all dropped when no active approvals");
}

console.log("[pruneRecords — keeps active even over cap]");
{
  const records = {};
  for (let i = 0; i < 50; i++) {
    records[`1:0x${i.toString(16).padStart(2, "0")}:0xb`] = { firstSeen: i };
  }
  const state = { enabled: true, expiryDays: 90, records };
  const approvals = Object.keys(records).map((k) => {
    const [_, token, spender] = k.split(":");
    return { chainId: 1, tokenAddress: token, spender };
  });
  const next = pruneRecords(state, approvals, 100);
  eq(Object.keys(next.records).length, 50, "all 50 kept (under cap)");
  const next2 = pruneRecords(state, approvals, 30);
  eq(Object.keys(next2.records).length, 30, "capped to 30");
  // Should keep the 30 newest (highest firstSeen)
  const kept = Object.values(next2.records).map(r => r.firstSeen).sort((a, b) => a - b);
  eq(kept[0], 20, "oldest kept is firstSeen=20 (50-30)");
  eq(kept[29], 49, "newest kept is firstSeen=49");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Approval expiry tracking working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
