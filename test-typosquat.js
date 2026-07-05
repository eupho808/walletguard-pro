// test-typosquat.js - Node smoke test for lib/typosquatting.js
//
// Run with:  node test-typosquat.js
// Exits 0 on success, 1 on first failure.
//
// This script does NOT get bundled into content.js. It imports the
// module directly via ESM and asserts known-good / known-bad cases
// against the Levenshtein / eTLD+1 / substring heuristics.
//
// Coverage:
//   - Exact trusted domains (full host and registrable form)
//   - Subdomain trust propagation (blog.uniswap.org -> trusted)
//   - Classic typosquats (extra char, missing char, keyboard slip)
//   - Substring / subdomain attacks (uniswap.org.evil.com)
//   - IDN / homoglyph (Cyrillic а in unicwap.org)
//   - Distance boundary cases (length-driven threshold)
//   - Legitimate random sites should NOT trigger

import { findTyposquatting, levenshtein, getRegistrableDomain } from "./lib/typosquatting.js";

// ---------- Tiny test harness ----------
let passed = 0;
let failed = 0;

function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ok  ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function type(label, result, expectedType) {
  const ok = result && result.type === expectedType;
  if (ok) {
    console.log(`  ok  ${label} -> ${expectedType}`);
    passed++;
  } else {
    console.log(`  FAIL ${label} -> expected type ${expectedType}, got ${JSON.stringify(result)}`);
    failed++;
  }
}

// ---------- Pure-function tests ----------

console.log("\n[levenshtein]");
eq("identical",                levenshtein("uniswap", "uniswap"), 0);
eq("empty a",                  levenshtein("",      "abc"),      3);
eq("empty b",                  levenshtein("abc",   ""),         3);
eq("one sub",                  levenshtein("cat",   "bat"),      1);
eq("one insert",               levenshtein("cat",   "cats"),     1);
eq("one delete",               levenshtein("cats",  "cat"),      1);
eq("classic typosquat",        levenshtein("uniswap","uniswapp"),1);
eq("keyboard slip",            levenshtein("uniswap","uniswop"), 1);
eq("double-char slip",         levenshtein("uniswap","unisvvap"),2);
eq("completely different",     levenshtein("abc",   "xyz"),      3);

console.log("\n[getRegistrableDomain]");
eq("two-label",      getRegistrableDomain("uniswap.org"),          "uniswap.org");
eq("three-label",    getRegistrableDomain("app.uniswap.org"),      "uniswap.org");
eq("deep subdomain", getRegistrableDomain("a.b.c.uniswap.org"),    "uniswap.org");
eq("single label",   getRegistrableDomain("localhost"),            "localhost");
eq("empty",          getRegistrableDomain(""),                     "");

// ---------- Detection tests ----------

console.log("\n[findTyposquatting - trusted]");

type("exact uniswap.org",       findTyposquatting("uniswap.org"),       "trusted");
type("exact app.uniswap.org",   findTyposquatting("app.uniswap.org"),   "trusted");
type("exact www.uniswap.org",   findTyposquatting("www.uniswap.org"),   "trusted");
type("subdomain blog.uniswap.org", findTyposquatting("blog.uniswap.org"), "trusted");
type("deep a.b.uniswap.org",    findTyposquatting("a.b.uniswap.org"),    "trusted");
type("exact opensea.io",        findTyposquatting("opensea.io"),        "trusted");
type("exact metamask.io",       findTyposquatting("metamask.io"),       "trusted");

console.log("\n[findTyposquatting - typosquat (distance 1)]");

type("uniswapp.org",            findTyposquatting("uniswapp.org"),      "typosquat");
type("uniswop.org",             findTyposquatting("uniswop.org"),       "typosquat");
type("uniswp.org (missing a)",  findTyposquatting("uniswp.org"),        "typosquat");
type("opensea.io sub",          findTyposquatting("opensea.li"),        "typosquat");
type("metamaskk.io",            findTyposquatting("metamaskk.io"),      "typosquat");
type("etherscam.io (i->a)",     findTyposquatting("etherscan.io".replace("n","m")), "typosquat");

console.log("\n[findTyposquatting - typosquat (distance 2-3, longer domains)]");

type("unisvvap.org d=3",        findTyposquatting("unisvvap.org"),      "typosquat");
type("unisvvap.org case insensitive", findTyposquatting("UNISVVAP.ORG"), "typosquat");

console.log("\n[findTyposquatting - substring / subdomain attack]");

type("uniswap.org.evil.com",    findTyposquatting("uniswap.org.evil.com"), "subdomain-attack");
type("opensea.io.evil.com",     findTyposquatting("opensea.io.evil.com"),  "subdomain-attack");
type("metamask.io.phishing.ru", findTyposquatting("metamask.io.phishing.ru"), "subdomain-attack");

console.log("\n[findTyposquatting - homoglyph]");

// Cyrillic 'а' (U+0430) instead of Latin 'a' in 'uniswap'
const cyrillicHost = "unisw" + "\u0430" + "p.org";
type("Cyrillic a in uniswap",   findTyposquatting(cyrillicHost),        "homoglyph");
// Pure non-ASCII with no trusted substring: still flagged as homoglyph
type("random Cyrillic domain",  findTyposquatting("\u0444\u0443\u0442\u0431\u043e\u043b.\u0440\u0444"), "homoglyph");

// ---------- Expanded TRUSTED_DOMAINS (v1.5.1 — +30 domains across DeFi, NFTs,
//          bridges, wallets, explorers, perps, identity, social). -----------

console.log("\n[findTyposquatting - new trusted domains (v1.5.1 batch)]");

// DeFi / liquid staking / yield.
type("lido.fi",                 findTyposquatting("lido.fi"),           "trusted");
type("rocketpool.net",          findTyposquatting("rocketpool.net"),    "trusted");
type("makerdao.com",            findTyposquatting("makerdao.com"),      "trusted");
type("spark.fi",                findTyposquatting("spark.fi"),          "trusted");
type("morpho.org",              findTyposquatting("morpho.org"),        "trusted");
type("convex.fi",               findTyposquatting("convex.fi"),         "trusted");
type("yearn.fi",                findTyposquatting("yearn.fi"),          "trusted");
type("beefy.com",               findTyposquatting("beefy.com"),         "trusted");
type("frax.finance",            findTyposquatting("frax.finance"),      "trusted");
type("pendle.finance",          findTyposquatting("pendle.finance"),    "trusted");

// NFTs.
type("blur.io",                 findTyposquatting("blur.io"),           "trusted");
type("magiceden.io",            findTyposquatting("magiceden.io"),      "trusted");
type("foundation.app",          findTyposquatting("foundation.app"),    "trusted");
type("zora.co",                 findTyposquatting("zora.co"),           "trusted");
type("sudoswap.xyz",            findTyposquatting("sudoswap.xyz"),      "trusted");

// Bridges & cross-chain messaging.
type("stargate.finance",        findTyposquatting("stargate.finance"),  "trusted");
type("across.to",               findTyposquatting("across.to"),         "trusted");
type("hop.exchange",            findTyposquatting("hop.exchange"),      "trusted");
type("layerzero.network",       findTyposquatting("layerzero.network"), "trusted");
type("wormhole.com",            findTyposquatting("wormhole.com"),      "trusted");

// Wallets.
type("frame.xyz",               findTyposquatting("frame.xyz"),         "trusted");
type("rainbow.me",              findTyposquatting("rainbow.me"),        "trusted");

// Explorers.
type("polygonscan.com",         findTyposquatting("polygonscan.com"),   "trusted");
type("arbiscan.io",             findTyposquatting("arbiscan.io"),       "trusted");

// Perpetuals.
type("gmx.io",                  findTyposquatting("gmx.io"),            "trusted");
type("dydx.exchange",           findTyposquatting("dydx.exchange"),     "trusted");
type("hyperliquid.xyz",         findTyposquatting("hyperliquid.xyz"),   "trusted");

// Identity / social.
type("ens.domains",             findTyposquatting("ens.domains"),       "trusted");
type("mirror.xyz",              findTyposquatting("mirror.xyz"),        "trusted");
type("lens.xyz",                findTyposquatting("lens.xyz"),          "trusted");

// Subdomain trust propagation for new entries.
type("app.lido.fi",             findTyposquatting("app.lido.fi"),       "trusted");
type("stake.lido.fi",           findTyposquatting("stake.lido.fi"),     "trusted");
type("app.blur.io",             findTyposquatting("app.blur.io"),       "trusted");
type("app.ens.domains",         findTyposquatting("app.ens.domains"),   "trusted");
type("trade.dydx.exchange",     findTyposquatting("trade.dydx.exchange"), "trusted");

// Case-insensitive on new entries.
type("LIDO.FI",                 findTyposquatting("LIDO.FI"),           "trusted");
type("Blur.IO",                 findTyposquatting("Blur.IO"),           "trusted");
type("ENS.DOMAINS",             findTyposquatting("ENS.DOMAINS"),       "trusted");

console.log("\n[findTyposquatting - typosquats of new entries]");

// Distance-1 typosquats of short new domains (threshold = 2 for <=10 chars).
type("lidoo.fi",                findTyposquatting("lidoo.fi"),          "typosquat");
type("blurr.io",                findTyposquatting("blurr.io"),          "typosquat");
type("gmx.io  d=1",             findTyposquatting("gmxx.io"),           "typosquat");
type("lenss.xyz",               findTyposquatting("lenss.xyz"),         "typosquat");
type("framee.xyz",              findTyposquatting("framee.xyz"),        "typosquat");
type("beefyy.com",              findTyposquatting("beefyy.com"),        "typosquat");
type("yearnn.fi",               findTyposquatting("yearnn.fi"),         "typosquat");
type("zoraa.co",                findTyposquatting("zoraa.co"),          "typosquat");

// Substring / subdomain attack on new entries.
type("blur.io.evil.com",        findTyposquatting("blur.io.evil.com"),  "subdomain-attack");
type("ens.domains.phishing.ru", findTyposquatting("ens.domains.phishing.ru"), "subdomain-attack");
type("gmx.io.scam.xyz",         findTyposquatting("gmx.io.scam.xyz"),   "subdomain-attack");

// Keyboard-slip distance-2 typosquats on longer new domains.
type("unisvvap.org",            findTyposquatting("unisvvap.org"),      "typosquat"); // sanity: legacy
type("layerzeroo.network",      findTyposquatting("layerzeroo.network"), "typosquat");

console.log("\n[findTyposquatting - legit sites should be null]");

const legitSites = [
  "google.com",
  "github.com",
  "stackoverflow.com",
  "reddit.com",
  "wikipedia.org",
  "coingecko.com",
  "coinmarketcap.com",
  "binance.com",
  "kraken.com",
  "ledger.com",
  "trezor.io",
  "firefox.com"
];

for (const site of legitSites) {
  const result = findTyposquatting(site);
  if (result === null) {
    console.log(`  ok  ${site} -> null`);
    passed++;
  } else {
    console.log(`  FAIL ${site} -> ${JSON.stringify(result)}`);
    failed++;
  }
}

console.log("\n[findTyposquatting - edge cases]");

eq("empty hostname",   findTyposquatting(""),    null);
eq("null hostname",    findTyposquatting(null),  null);
eq("undefined input",  findTyposquatting(undefined), null);
eq("numeric hostname", findTyposquatting(127),   null);
eq("uppercase trusted", findTyposquatting("UNISWAP.ORG"), { type: "trusted", match: "uniswap.org", hostname: "uniswap.org" });

// ---------- Summary ----------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
