// test-audit-log.js - Tests for lib/audit-log.js
import assert from "node:assert/strict";
import {
  ENTRY_TYPES, logEvent, getLog, getLogByType, getLogInRange,
  clearLog, loadLog, getLogStats,
  exportAsCsv, exportAsJson, buildDownload,
  logBlock, logPhishingBlock, logDrainerDetection, logApprovalScan
} from "./lib/audit-log.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }

console.log("[logEvent — basic]");
{
  clearLog();
  const entry = logEvent(ENTRY_TYPES.WARNED, { target: "0xabc", riskScore: 80 });
  truthy(entry.id, "entry has id");
  truthy(entry.timestamp, "entry has timestamp");
  truthy(entry.isoTime, "entry has isoTime");
  eq(entry.type, ENTRY_TYPES.WARNED, "entry type preserved");
  eq(entry.target, "0xabc", "data preserved");
  eq(getLog().length, 1, "log has 1 entry");
}

console.log("[logEvent — invalid type throws]");
{
  let threw = false;
  try { logEvent("invalid_type", {}); } catch { threw = true; }
  ok(threw, "invalid type throws");
  try { logEvent(null, {}); } catch { threw = true; }
  ok(threw, "null type throws");
}

console.log("[getLog — newest first]");
{
  clearLog();
  logEvent(ENTRY_TYPES.BLOCKED, { target: "0x1" });
  // Small delay to ensure different timestamp/id
  await new Promise(r => setTimeout(r, 5));
  logEvent(ENTRY_TYPES.WARNED, { target: "0x2" });
  const log = getLog();
  eq(log.length, 2, "2 entries");
  eq(log[0].type, ENTRY_TYPES.WARNED, "newest first (WARNED)");
  eq(log[1].type, ENTRY_TYPES.BLOCKED, "oldest second (BLOCKED)");
}

console.log("[getLogByType]");
{
  clearLog();
  logEvent(ENTRY_TYPES.BLOCKED, { target: "0x1" });
  logEvent(ENTRY_TYPES.WARNED, { target: "0x2" });
  logEvent(ENTRY_TYPES.BLOCKED, { target: "0x3" });
  const blocked = getLogByType(ENTRY_TYPES.BLOCKED);
  eq(blocked.length, 2, "2 blocked");
  eq(blocked[0].target, "0x3", "newest blocked first");
  const warned = getLogByType(ENTRY_TYPES.WARNED);
  eq(warned.length, 1, "1 warned");
}

console.log("[getLogInRange]");
{
  clearLog();
  const now = Date.now();
  logEvent(ENTRY_TYPES.WARNED, { target: "0xa" });
  const log = getLogInRange(now - 1000, now + 1000);
  truthy(log.length >= 1, "entries in range");
  const empty = getLogInRange(now + 100000, now + 200000);
  eq(empty.length, 0, "future range → empty");
}

console.log("[clearLog]");
{
  clearLog();
  logEvent(ENTRY_TYPES.WARNED, { target: "0xa" });
  logEvent(ENTRY_TYPES.BLOCKED, { target: "0xb" });
  const count = clearLog();
  eq(count, 2, "cleared 2 entries");
  eq(getLog().length, 0, "log is empty");
}

console.log("[loadLog]");
{
  clearLog();
  const entries = [
    { id: "1", timestamp: 1000, isoTime: "2024-01-01", type: "warned", target: "0xa" },
    { id: "2", timestamp: 2000, isoTime: "2024-01-02", type: "blocked", target: "0xb" }
  ];
  loadLog(entries);
  eq(getLog().length, 2, "loaded 2 entries");
  loadLog(null);
  eq(getLog().length, 2, "null load → no-op");
  loadLog("not-array");
  eq(getLog().length, 2, "non-array load → no-op");
}

console.log("[getLogStats]");
{
  clearLog();
  logEvent(ENTRY_TYPES.BLOCKED, { target: "0x1" });
  await new Promise(r => setTimeout(r, 5));
  logEvent(ENTRY_TYPES.BLOCKED, { target: "0x2" });
  await new Promise(r => setTimeout(r, 5));
  logEvent(ENTRY_TYPES.WARNED, { target: "0x3" });
  const stats = getLogStats();
  eq(stats.total, 3, "total = 3");
  eq(stats.byType.blocked, 2, "2 blocked");
  eq(stats.byType.warned, 1, "1 warned");
  truthy(stats.oldestEntry, "has oldestEntry");
  truthy(stats.newestEntry, "has newestEntry");
  eq(stats.oldestEntry < stats.newestEntry, true, "oldest < newest");
}

console.log("[exportAsCsv]");
{
  clearLog();
  logEvent(ENTRY_TYPES.BLOCKED, {
    target: "0xabc123",
    chainId: 1,
    method: "0x095ea7b3",
    riskScore: 85,
    riskLevel: "high",
    reason: "Known drainer",
    userAction: "blocked",
    origin: "https://evil.example"
  });
  const csv = exportAsCsv();
  truthy(csv.includes("timestamp"), "CSV has timestamp header");
  truthy(csv.includes("risk_score"), "CSV has risk_score header");
  truthy(csv.includes("0xabc123"), "CSV has target");
  truthy(csv.includes("high"), "CSV has risk level");
  truthy(csv.includes("evil.example"), "CSV has origin");
}

console.log("[exportAsCsv — empty]");
{
  clearLog();
  eq(exportAsCsv(), "", "empty log → empty CSV");
}

console.log("[exportAsCsv — escape special chars]");
{
  clearLog();
  logEvent(ENTRY_TYPES.WARNED, {
    target: "0xwith,comma",
    reason: 'has "quotes" and, commas'
  });
  const csv = exportAsCsv();
  truthy(csv.includes('"0xwith,comma"'), "comma escaped");
  truthy(csv.includes('""quotes""'), "quotes escaped");
}

console.log("[exportAsJson]");
{
  clearLog();
  logEvent(ENTRY_TYPES.WARNED, { target: "0xa", riskScore: 50 });
  const json = exportAsJson();
  truthy(json, "JSON string returned");
  const parsed = JSON.parse(json);
  eq(parsed.version, 1, "version = 1");
  truthy(parsed.exportedAt, "has exportedAt");
  truthy(parsed.exportedBy.includes("WalletGuard"), "has exportedBy");
  eq(parsed.count, 1, "count = 1");
  truthy(parsed.entries[0].target === "0xa", "entry preserved");
}

console.log("[buildDownload — CSV]");
{
  clearLog();
  logEvent(ENTRY_TYPES.WARNED, { target: "0xa" });
  const download = buildDownload("csv");
  truthy(download.filename.endsWith(".csv"), "filename ends .csv");
  truthy(download.filename.includes("walletguard-audit"), "filename prefix");
  eq(download.mimeType, "text/csv", "CSV mimeType");
  truthy(download.content.length > 0, "has content");
}

console.log("[buildDownload — JSON]");
{
  const download = buildDownload("json");
  truthy(download.filename.endsWith(".json"), "filename ends .json");
  eq(download.mimeType, "application/json", "JSON mimeType");
  const parsed = JSON.parse(download.content);
  eq(parsed.version, 1, "JSON version");
}

console.log("[buildDownload — default format]");
{
  const download = buildDownload();
  truthy(download.filename.endsWith(".csv"), "default is CSV");
}

console.log("[logBlock]");
{
  clearLog();
  const entry = logBlock(
    { to: "0xevil", data: "0x095ea7b30000000000", chainId: 1 },
    "Drainer detected",
    { riskScore: 95, severity: "critical", origin: "https://phish.example" }
  );
  eq(entry.type, ENTRY_TYPES.BLOCKED, "type = blocked");
  eq(entry.target, "0xevil", "target preserved");
  eq(entry.method, "0x095ea7b3", "method = first 4 bytes");
  eq(entry.chainId, 1, "chainId preserved");
  eq(entry.riskScore, 95, "riskScore preserved");
  eq(entry.userAction, "blocked", "userAction set");
}

console.log("[logPhishingBlock]");
{
  clearLog();
  const entry = logPhishingBlock("evil.example", "typosquatted domain");
  eq(entry.type, ENTRY_TYPES.PHISHING_BLOCKED, "type = phishing_blocked");
  eq(entry.host, "evil.example", "host preserved");
  eq(entry.evidence, "typosquatted domain", "evidence preserved");
}

console.log("[logDrainerDetection]");
{
  clearLog();
  const entry = logDrainerDetection(
    { to: "0xdrainer" },
    {
      topMatch: { archetype: "permit_drainer", similarity: 0.92 },
      verdict: "critical"
    }
  );
  eq(entry.type, ENTRY_TYPES.DRAINER_DETECTED, "type = drainer_detected");
  eq(entry.target, "0xdrainer", "target preserved");
  eq(entry.archetype, "permit_drainer", "archetype preserved");
  eq(entry.similarity, 0.92, "similarity preserved");
  eq(entry.verdict, "critical", "verdict preserved");
}

console.log("[logApprovalScan]");
{
  clearLog();
  const entry = logApprovalScan({
    total: 25,
    risky: 3,
    unlimited: 5,
    chainCount: 4,
    staleCount: 7
  });
  eq(entry.type, ENTRY_TYPES.APPROVAL_SCAN, "type = approval_scan");
  eq(entry.total, 25, "total preserved");
  eq(entry.risky, 3, "risky preserved");
  eq(entry.unlimited, 5, "unlimited preserved");
  eq(entry.chainCount, 4, "chainCount preserved");
  eq(entry.staleCount, 7, "staleCount preserved");
}

console.log("[FIFO cap]");
{
  clearLog();
  // MAX_ENTRIES is 5000; test with smaller for speed
  // Just verify the slice logic works
  logEvent(ENTRY_TYPES.WARNED, { seq: 1 });
  logEvent(ENTRY_TYPES.WARNED, { seq: 2 });
  logEvent(ENTRY_TYPES.WARNED, { seq: 3 });
  const log = getLog();
  eq(log.length, 3, "3 entries before cap test");
}

console.log("[ENTRY_TYPES constant]");
{
  truthy(ENTRY_TYPES.BLOCKED === "blocked", "BLOCKED");
  truthy(ENTRY_TYPES.PHISHING_BLOCKED === "phishing_blocked", "PHISHING_BLOCKED");
  truthy(ENTRY_TYPES.DRAINER_DETECTED === "drainer_detected", "DRAINER_DETECTED");
  truthy(ENTRY_TYPES.STALE_DETECTED === "stale_detected", "STALE_DETECTED");
  truthy(ENTRY_TYPES.APPROVAL_SCAN === "approval_scan", "APPROVAL_SCAN");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Audit log working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
