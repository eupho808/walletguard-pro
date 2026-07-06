// test-integration.js - End-to-end smoke test for the risk-engine + typosquatting wiring.
//
// Run with:  node test-integration.js
//
// Builds an ESM-free version of computeRisk + findTyposquatting by importing
// from the lib modules directly, then asserts that the resulting risk factors
// include the expected typosquatting/trusted signals.
//
// This is a lightweight test that does NOT touch content.js (the bundle).
// It tests the source modules in isolation to catch integration regressions
// before running the full Chrome extension.

import { computeRisk } from "./lib/risk-engine.js";
import { findTyposquatting } from "./lib/typosquatting.js";

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

function hasFactor(risk, name) {
  return (risk.factors || []).some((f) => f.name === name);
}

// ---------- End-to-end: typo attacks must produce critical factors ----------

console.log("\n[integration: typosquat attacks]");

const typoAttackCtx = {
  target: "0xScammer0000000000000000000000000000000001",
  from: "0xUser0000000000000000000000000000000000001",
  value: "0x0",
  data: "0x" + "00".repeat(32),
  ethValue: "0",
  ethFloat: 0,
  decoded: null,
  unknownMethod: true,
  innerCalls: [],
  innerFactors: [],
  urCommands: null,
  isEIP712: false,
  isPersonalSign: false,
  isLegacySign: false,
  permitDetails: null,
  trustedAddresses: new Set(),
  hostname: "unisvap.org"
};

const typoRisk = computeRisk(typoAttackCtx);
check("typosquat -> Possible Typosquatting factor",  hasFactor(typoRisk, "Possible Typosquatting"));
check("typosquat -> domainVerdict present",          typoRisk.domainVerdict && typoRisk.domainVerdict.type === "typosquat");
  check("typosquat -> distance reported",              typoRisk.domainVerdict && typoRisk.domainVerdict.distance === 1);
check("typosquat -> risk is CRITICAL/HIGH",          ["CRITICAL RISK", "HIGH RISK"].includes(typoRisk.riskLevel));

// ---------- End-to-end: subdomain attack ----------

console.log("\n[integration: subdomain impersonation]");

const subAttackCtx = { ...typoAttackCtx, hostname: "uniswap.org.evil.com" };
const subRisk = computeRisk(subAttackCtx);
check("subdomain -> Subdomain Impersonation factor", hasFactor(subRisk, "Subdomain Impersonation"));
check("subdomain -> domainVerdict type",             subRisk.domainVerdict && subRisk.domainVerdict.type === "subdomain-attack");

// ---------- End-to-end: homoglyph ----------

console.log("\n[integration: homoglyph attack]");

const homoCtx = {
  ...typoAttackCtx,
  hostname: "unisw" + "\u0430" + "p.org" // Cyrillic 'a'
};
const homoRisk = computeRisk(homoCtx);
check("homoglyph -> IDN / Homoglyph Attack factor", hasFactor(homoRisk, "IDN / Homoglyph Attack"));
check("homoglyph -> domainVerdict type",            homoRisk.domainVerdict && homoRisk.domainVerdict.type === "homoglyph");

// ---------- End-to-end: trusted site gives boost ----------

console.log("\n[integration: trusted site boost]");

const trustedCtx = {
  target: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2
  from: "0xUser0000000000000000000000000000000000001",
  value: "0x0",
  data: "0x" + "00".repeat(32),
  ethValue: "0",
  ethFloat: 0,
  decoded: null,
  unknownMethod: true,
  innerCalls: [],
  innerFactors: [],
  urCommands: null,
  isEIP712: false,
  isPersonalSign: false,
  isLegacySign: false,
  permitDetails: null,
  trustedAddresses: new Set(),
  hostname: "app.uniswap.org"
};

const trustedRisk = computeRisk(trustedCtx);
check("trusted -> Trusted Site factor",       hasFactor(trustedRisk, "Trusted Site"));
check("trusted -> domainVerdict type",        trustedRisk.domainVerdict && trustedRisk.domainVerdict.type === "trusted");
check("trusted -> score above baseline",      trustedRisk.trustScore >= 90);

// ---------- End-to-end: legitimate unknown site has no domain factor ----------

console.log("\n[integration: legitimate unknown site]");

const legitCtx = { ...typoAttackCtx, hostname: "google.com" };
const legitRisk = computeRisk(legitCtx);
check("legit -> no domain factor",            !hasFactor(legitRisk, "Possible Typosquatting")
                                              && !hasFactor(legitRisk, "Subdomain Impersonation")
                                              && !hasFactor(legitRisk, "Trusted Site"));
check("legit -> domainVerdict is null",       legitRisk.domainVerdict === null);

// ---------- End-to-end: hostname must not break analysis when missing ----------

console.log("\n[integration: backward compat - no hostname]");

const noHostCtx = { ...typoAttackCtx };
delete noHostCtx.hostname;
const noHostRisk = computeRisk(noHostCtx);
check("no hostname -> no crash",              noHostRisk && Array.isArray(noHostRisk.factors));
check("no hostname -> domainVerdict null",    noHostRisk.domainVerdict === null);
check("no hostname -> no domain factor",      !hasFactor(noHostRisk, "Possible Typosquatting"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
