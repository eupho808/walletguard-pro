// test-wallet-dna.js - Tests for lib/wallet-dna.js

import {
  emptyProfile,
  observe,
  scoreAnomaly,
  serializeProfile,
  deserializeProfile
} from "./lib/wallet-dna.js";

let passed = 0;
let failed = 0;

function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(v, name) { if (v) ok(name); else { console.log(`  FAIL ${name}: expected truthy got ${v}`); failed++; } }
function falsy(v, name)  { if (!v) ok(name); else { console.log(`  FAIL ${name}: expected falsy got ${v}`); failed++; } }

// ---- emptyProfile ----
const p0 = emptyProfile("0xAbCd" + "00".repeat(18));
eq(p0.address, "0xabcd" + "00".repeat(18), "emptyProfile lowercases address");
eq(p0.samples, 0, "emptyProfile samples = 0");
eq(p0.hours.length, 24, "emptyProfile has 24-hour array");
eq(p0.gasPriceGwei.count, 0, "emptyProfile gasPriceGwei count = 0");

// ---- observe ----
const p = emptyProfile("0xuser");
observe(p, {
  from: "0xuser",
  to: "0xuniswap",
  value: "1000000000000000000",  // 1 ETH
  gas: "200000",
  gasPrice: "50000000000",        // 50 gwei
  data: "0xfb6a74f50000000000000000000000000000000000000000000000000000000000000001",
  chainId: 1,
  timestamp: Math.floor(new Date("2026-07-06T14:00:00Z").getTime() / 1000)
});
eq(p.txCount, 1, "txCount increments to 1");
eq(p.gasPriceGwei.count, 1, "gasPriceGwei count = 1");
eq(p.gasPriceGwei.mean, 50, "gasPriceGwei mean = 50 gwei");
eq(p.gasLimit.mean, 200000, "gasLimit mean = 200000");
truthy(p.contracts["0xuniswap"] === 1, "uniswap recorded in contracts");
truthy(p.selectors["0xfb6a74f5"] === 1, "selector recorded");
eq(p.chains[1], 1, "chain 1 recorded");
eq(p.hours[14], 1, "hour 14 incremented");

// ---- Build a typical Uniswap user profile ----
// Use tightly-clustered hour distribution (hours 12-14 UTC) so we can test
// off-hours detection by querying a timestamp outside that range.
const profile = emptyProfile("0xuser");
const baseHour = 12;  // 12:00 UTC
for (let i = 0; i < 30; i++) {
  const hourOffset = Math.floor(i / 10);  // 0,0,0,...,1,1,1,...,2,2,2,..
  // Use a fixed local-time hour per observation by pinning to baseHour + offset.
  const ts = Math.floor(new Date(`2026-07-0${1 + hourOffset}T${String(baseHour).padStart(2, "0")}:00:00Z`).getTime() / 1000) + (i % 10) * 600;
  observe(profile, {
    from: "0xuser",
    to: "0xuniswap",
    value: String(Math.floor(0.5e18 + Math.random() * 0.5e18)),  // 0.5-1.0 ETH
    gas: String(200000 + Math.floor(Math.random() * 50000)),
    gasPrice: String(Math.floor(30e9 + Math.random() * 40e9)),    // 30-70 gwei
    data: "0xfb6a74f5" + "ab".repeat(32),
    chainId: 1,
    timestamp: ts
  });
}
eq(profile.samples, 30, "30 observations recorded");
// Verify the profile actually has a tight hour distribution
const totalHours = profile.hours.reduce((a, b) => a + b, 0);
const peakHourCount = Math.max(...profile.hours);
truthy(peakHourCount >= 15, `profile has concentrated hour distribution (peak=${peakHourCount}/${totalHours})`);

// ---- scoreAnomaly: normal tx ----
const normalScore = scoreAnomaly(profile, {
  from: "0xuser",
  to: "0xuniswap",
  value: "800000000000000000",  // 0.8 ETH
  gas: "210000",
  gasPrice: "50000000000",        // 50 gwei
  data: "0xfb6a74f5" + "ab".repeat(32),
  chainId: 1,
  timestamp: Math.floor(new Date("2026-07-06T15:00:00Z").getTime() / 1000)
});
eq(normalScore.profileSamples, 30, "samples reported in result");
falsy(normalScore.level === "highly-anomalous", "normal Uniswap tx not highly-anomalous");
falsy(normalScore.isNewContract, "known contract not flagged as new");
falsy(normalScore.isNewSelector, "known selector not flagged as new");

// ---- scoreAnomaly: anomalous value ----
const hugeValue = scoreAnomaly(profile, {
  from: "0xuser",
  to: "0xuniswap",
  value: "100000000000000000000000", // 100,000 ETH
  gas: "210000",
  gasPrice: "50000000000",
  data: "0xfb6a74f5" + "ab".repeat(32),
  chainId: 1,
  timestamp: Math.floor(new Date("2026-07-06T15:00:00Z").getTime() / 1000)
});
truthy(hugeValue.score > 0, "huge value adds anomaly points");
truthy(hugeValue.factors.some(f => f.name === "value-z"), "value-z factor present");

// ---- scoreAnomaly: new contract + new selector + new chain ----
const newEverything = scoreAnomaly(profile, {
  from: "0xuser",
  to: "0xdrainer",
  value: "1000000000000000000",
  gas: "210000",
  gasPrice: "50000000000",
  data: "0xdeadbeef" + "00".repeat(32),
  chainId: 56,  // BSC
  timestamp: Math.floor(new Date("2026-07-06T03:00:00Z").getTime() / 1000) // off-hours (hour 3, profile peaks at 12-14)
});
truthy(newEverything.isNewContract, "new contract flagged");
truthy(newEverything.isNewSelector, "new selector flagged");
truthy(newEverything.isOffChain, "new chain flagged");
truthy(newEverything.isOffHours, "off-hours flagged (hour 3, profile concentrated at 12-14)");
truthy(newEverything.score >= 40, `many anomalies → score >= 40 (got ${newEverything.score})`);

// ---- scoreAnomaly: cold start ----
const cold = scoreAnomaly(emptyProfile("0xnewuser"), {
  from: "0xnewuser",
  to: "0xdrainer",
  value: "1000000000000000000",
  chainId: 1
});
eq(cold.score, 0, "cold-start returns score 0");
truthy(cold.factors[0].name === "cold-start", "cold-start factor present");

// ---- serializeProfile / deserializeProfile ----
const json = serializeProfile(profile);
truthy(typeof json === "string" && json.length > 0, "serializeProfile returns string");
const parsed = deserializeProfile(json);
truthy(parsed !== null, "deserializeProfile returns object");
eq(parsed.samples, profile.samples, "samples preserved through round-trip");
eq(parsed.txCount, profile.txCount, "txCount preserved");
eq(parsed.hours.length, 24, "hours preserved");

// Tolerant of bad input
eq(deserializeProfile(null), null, "deserializeProfile(null) returns null");
eq(deserializeProfile("not json"), null, "deserializeProfile(bad json) returns null");
// Repair missing fields
const repaired = deserializeProfile({ samples: 5 });
truthy(repaired.hours.length === 24, "missing hours repaired to length 24");
truthy(repaired.contracts && typeof repaired.contracts === "object", "missing contracts repaired");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
