// test-stale-tracker.js - Tests for lib/stale-tracker.js
import assert from "node:assert/strict";
import {
  STALE_LEVELS, ageInDays, staleLevel, ageDescription,
  annotateStale, isAutoRevokeCandidate, annotateStaleAll,
  staleSummary, profileUsage, generateSpendProfile
} from "./lib/stale-tracker.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  // Use deep equality for arrays/objects, === for primitives.
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }

const NOW = Math.floor(Date.now() / 1000);
const ONE_DAY = 86400;
const days = (n) => NOW - n * ONE_DAY;

console.log("[ageInDays]");
{
  eq(ageInDays(NOW), 0, "just granted → 0 days");
  eq(ageInDays(days(30)), 30, "30 days ago → 30 days");
  eq(ageInDays(days(180)), 180, "180 days ago → 180 days");
  eq(ageInDays(days(365)), 365, "365 days ago → 365 days");
  eq(ageInDays(null), null, "null → null");
  eq(ageInDays(undefined), null, "undefined → null");
  eq(ageInDays("not-a-number"), null, "non-number → null");
}

console.log("[staleLevel]");
{
  eq(staleLevel(days(10)), STALE_LEVELS.fresh, "10 days → fresh");
  eq(staleLevel(days(60)), STALE_LEVELS.recent, "60 days → recent");
  eq(staleLevel(days(120)), STALE_LEVELS.aging, "120 days → aging");
  eq(staleLevel(days(200)), STALE_LEVELS.stale, "200 days → stale");
  eq(staleLevel(days(500)), STALE_LEVELS.ancient, "500 days → ancient");
  // Custom thresholds (only affect stale/ancient boundaries, not fresh/recent)
  // With staleThreshold=30, deeplyStale=60: 100 days is past both, so ancient.
  eq(staleLevel(days(100), { staleThresholdDays: 30, deeplyStaleDays: 60 }), STALE_LEVELS.ancient, "100 days with very-low thresholds → ancient");
  // With staleThreshold=30, deeplyStale=200: 100 days is between, so stale.
  eq(staleLevel(days(100), { staleThresholdDays: 30, deeplyStaleDays: 200 }), STALE_LEVELS.stale, "100 days with staleThreshold=30 → stale");
  eq(staleLevel(null), STALE_LEVELS.fresh, "null → fresh");
}

console.log("[ageDescription]");
{
  eq(ageDescription(0), "today", "0 days → today");
  eq(ageDescription(1), "1 day ago", "1 day → 1 day ago");
  eq(ageDescription(15), "15 days ago", "15 days → 15 days ago");
  eq(ageDescription(45), "1 month ago", "45 days → 1 month ago");
  eq(ageDescription(100), "3 months ago", "100 days → 3 months ago");
  eq(ageDescription(400), "1 year ago", "400 days → 1 year ago");
  eq(ageDescription(800), "2 years ago", "800 days → 2 years ago");
  eq(ageDescription(null), "unknown age", "null → unknown age");
}

console.log("[isAutoRevokeCandidate]");
{
  // Stale + unused → candidate
  const staleUnused = { grantedAt: days(200), spendCount: 0, unlimited: false };
  eq(isAutoRevokeCandidate(staleUnused), true, "stale + unused → candidate");
  // Stale + used → not candidate
  const staleUsed = { grantedAt: days(200), spendCount: 5 };
  eq(isAutoRevokeCandidate(staleUsed), false, "stale + used → not candidate");
  // Fresh + unlimited → not candidate (not stale yet)
  const freshUnlimited = { grantedAt: days(30), spendCount: 0, unlimited: true };
  eq(isAutoRevokeCandidate(freshUnlimited), false, "fresh → not candidate");
  // Stale + unlimited → candidate
  const staleUnlimited = { grantedAt: days(200), spendCount: 0, unlimited: true };
  eq(isAutoRevokeCandidate(staleUnlimited), true, "stale + unlimited → candidate");
  // Whitelisted → never candidate
  const whitelisted = { grantedAt: days(500), spendCount: 0, whitelisted: true };
  eq(isAutoRevokeCandidate(whitelisted), false, "whitelisted → not candidate");
  // null → false
  eq(isAutoRevokeCandidate(null), false, "null → false");
  // Allowance with all-f hex → unlimited
  const hexUnlimited = { grantedAt: days(200), spendCount: 0, allowance: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  eq(isAutoRevokeCandidate(hexUnlimited), true, "all-f hex allowance → unlimited → candidate");
}

console.log("[annotateStale]");
{
  const approval = { tokenAddress: "0xabc", spender: "0xdef", grantedAt: days(200) };
  const annotated = annotateStale(approval);
  truthy(annotated, "returns annotation");
  eq(annotated.ageDays, 200, "ageDays correct");
  eq(annotated.staleLabel, "stale", "staleLabel correct");
  eq(annotated.isStale, true, "isStale true");
  truthy(annotated.ageDescription, "has ageDescription");
  eq(annotateStale(null), null, "null → null");
}

console.log("[annotateStaleAll]");
{
  const list = [
    { grantedAt: days(10) },
    { grantedAt: days(60) },
    { grantedAt: days(200) },
    { grantedAt: days(500) }
  ];
  const annotated = annotateStaleAll(list);
  eq(annotated.length, 4, "preserves length");
  eq(annotated[0].staleLabel, "fresh", "first → fresh");
  eq(annotated[1].staleLabel, "recent", "second → recent");
  eq(annotated[2].staleLabel, "stale", "third → stale");
  eq(annotated[3].staleLabel, "ancient", "fourth → ancient");
  eq(annotateStaleAll(null), [], "null → []");
  eq(annotateStaleAll([]), [], "empty → []");
}

console.log("[staleSummary]");
{
  const annotated = [
    annotateStale({ grantedAt: days(10), atRiskUsd: 100 }),
    annotateStale({ grantedAt: days(200), atRiskUsd: 500, spendCount: 5 }), // used → not auto-revoke
    annotateStale({ grantedAt: days(500), atRiskUsd: 1000, spendCount: 0 }),
  ];
  const summary = staleSummary(annotated);
  truthy(summary, "returns summary");
  eq(summary.total, 3, "total = 3");
  eq(summary.staleCount, 2, "2 stale");
  eq(summary.autoRevokeCount, 1, "1 auto-revoke candidate");
  eq(summary.totalStaleUsd, 1500, "totalStaleUsd = 1500");
  eq(summary.totalAutoRevokeUsd, 1000, "totalAutoRevokeUsd = 1000");
  truthy(summary.message.includes("stale"), "message mentions stale");
  eq(staleSummary(null), null, "null → null");
}

console.log("[profileUsage]");
{
  eq(profileUsage(null).totalSpends, 0, "null → 0 spends");
  eq(profileUsage(null).isUnused, true, "null → unused");
  const used = profileUsage({ transferFromCount: 3, transferCount: 1, lastUsedAt: days(5) });
  eq(used.totalSpends, 4, "transferFrom + transfer counted");
  eq(used.isUnused, false, "used → not unused");
  truthy(used.lastUsedDescription.includes("day"), "lastUsedDescription present");
  const neverUsed = profileUsage({ transferFromCount: 0, transferCount: 0 });
  eq(neverUsed.isUnused, true, "0 spends → unused");
  eq(neverUsed.lastUsedDescription, "never used", "no lastUsedAt → never used");
}

console.log("[generateSpendProfile]");
{
  const approval = { grantedAt: days(200), unlimited: false };
  const profile = generateSpendProfile(approval, { transferFromCount: 0 });
  truthy(profile, "returns profile");
  eq(profile.wasteScore >= 50, true, "unused 200d → wasteScore >= 50");
  eq(profile.recommendation, "revoke-recommended", "unused 200d → revoke-recommended");
  // Unlimited + unused → very high waste
  const unlimited = generateSpendProfile({ grantedAt: days(500), unlimited: true }, { transferFromCount: 0 });
  eq(unlimited.wasteScore >= 80, true, "unused unlimited 500d → wasteScore >= 80");
  eq(unlimited.recommendation, "revoke-immediately", "→ revoke-immediately");
  // Actively used → low waste
  const active = generateSpendProfile({ grantedAt: days(200) }, { transferFromCount: 5, lastUsedAt: days(5) });
  eq(active.wasteScore <= 20, true, "recently used → low wasteScore");
  eq(active.recommendation, "active", "→ active");
  // null → null
  eq(generateSpendProfile(null, null), null, "null → null");
}

console.log("[STALE_LEVELS constant]");
{
  truthy(typeof STALE_LEVELS === "object", "STALE_LEVELS is object");
  eq(STALE_LEVELS.fresh, 0, "fresh = 0");
  eq(STALE_LEVELS.ancient, 4, "ancient = 4");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Stale tracker working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
