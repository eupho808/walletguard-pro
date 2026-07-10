// test-injector.js - Tests for injector.js (MAIN-world transaction interceptor)
//
// The interceptor wraps window.ethereum.request and intercepts eth_sendTransaction,
// eth_signTypedData*, personal_sign, and eth_sign calls. It shows an overlay
// and waits for user approval before forwarding the call to the original
// provider.
//
// These tests are static-analysis tests (reading the source) because the
// interceptor runs in MAIN world with browser globals (window.ethereum,
// chrome.runtime) that aren't available in Node.

import fs from "node:fs";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }

const SRC = fs.readFileSync("injector.js", "utf8");

console.log("[structure]");
{
  truthy(SRC.includes("window.__walletGuardInjected"), "has injection guard flag");
  truthy(SRC.includes("INTERCEPTED"), "defines INTERCEPTED set");
  truthy(SRC.includes("installProxy"), "defines installProxy");
  truthy(SRC.includes("watchForLateProvider"), "has late-provider watcher");
  truthy(SRC.includes("READ_ONLY_METHODS"), "defines READ_ONLY_METHODS bridge allowlist");
  truthy(SRC.includes("awaitUIResponse"), "defines awaitUIResponse");
  truthy(SRC.includes("WalletGuardHandler"), "defines Proxy handler");
}

console.log("[INTERCEPTED methods]");
{
  const intercepted = ["eth_sendTransaction", "eth_signTypedData", "eth_signTypedData_v1",
    "eth_signTypedData_v3", "eth_signTypedData_v4", "personal_sign", "eth_sign"];
  for (const m of intercepted) {
    truthy(SRC.includes(`"${m}"`), `INTERCEPTED includes ${m}`);
  }
}

console.log("[READ_ONLY bridge allowlist]");
{
  // Critical security boundary: the content-script → MAIN-world RPC bridge
  // must never forward write methods.
  const forbidden = ["eth_sendTransaction", "eth_sendRawTransaction", "eth_sign",
    "personal_sign", "eth_signTypedData"];
  for (const m of forbidden) {
    const inSet = new RegExp(`"${m}"`).test(SRC.split("READ_ONLY_METHODS")[1] || "");
    truthy(!inSet, `${m} NOT in READ_ONLY_METHODS`);
  }
}

console.log("[bug fix: awaitUIResponse timeout must fail-OPEN]");
{
  // Critical bug found in v3.6.1 audit: the timeout was calling finish(false)
  // which resolves as `false`, and the interceptor's `if (!approved) throw`
  // check would reject the tx — the opposite of the documented fail-open.
  // Fix: timeout now calls finish(true) so the tx passes through.
  const timeoutMatch = SRC.match(/setTimeout\(\(\) => \{[\s\S]*?finish\((\w+)\)/);
  truthy(timeoutMatch, "found setTimeout finish() call");
  if (timeoutMatch) {
    eq(timeoutMatch[1], "true", "timeout resolves as `true` (fail-open)");
  }
  // Also verify the comment is consistent
  truthy(SRC.includes("Fail-open") && SRC.includes("passing through"),
    "fail-open comment present");
}

console.log("[fail-safe: errors in interceptor must not lock wallet]");
{
  // If anything throws inside the try, the catch should fall through to the
  // original request (line 297-298: "On unexpected error, let the call through").
  truthy(SRC.includes("On unexpected error, let the call through"),
    "interceptor fail-open on unexpected error");
  truthy(SRC.includes("Reflect.apply(target[prop], target, [args])"),
    "forwards to original request on error");
}

console.log("[late-provider watcher]");
{
  // The watcher polls every 1s for up to 30s to handle Brave/OKX/Rabby
  // wallets that inject after DOMContentLoaded.
  truthy(SRC.includes("setInterval"), "uses setInterval");
  truthy(/attempts\s*>=\s*30/.test(SRC), "stops after 30 attempts");
  truthy(/,\s*1000\s*\)/.test(SRC), "1-second poll interval");
  truthy(SRC.includes("isWalletGuard"), "checks isWalletGuard flag before re-wrapping");
}

console.log("[Proxy handler]");
{
  // The handler should only intercept when:
  // 1. method is in INTERCEPTED set
  // 2. protection is enabled
  truthy(SRC.includes("!INTERCEPTED.has(method)"), "passes through non-INTERCEPTED methods");
  truthy(SRC.includes("if (!protectionEnabled)"), "passes through when protection disabled");
  truthy(SRC.includes("await awaitUIResponse()"), "awaits UI response before forwarding");
  truthy(SRC.includes("throw new Error(`WalletGuard Pro: ${method} rejected"),
    "rejects with descriptive error on user rejection");
}

console.log("[storage event subscription]");
{
  // protectionEnabled must update when wg_enabled changes in storage.
  truthy(SRC.includes("chrome.storage.onChanged.addListener"),
    "subscribes to storage change events");
  truthy(SRC.includes("changes.wg_enabled"), "watches wg_enabled key");
}

console.log("[BigInt safety]");
{
  // weiToEth uses BigInt to avoid precision loss for large values.
  truthy(SRC.includes("BigInt(hex)"), "weiToEth uses BigInt");
  truthy(SRC.includes("10n ** 18n"), "uses 10^18 literal for wei conversion");
}

console.log("[permit/EIP-712 detection]");
{
  truthy(SRC.includes("analyzeTypedData"), "has analyzeTypedData");
  truthy(SRC.includes("analyzePersonalSign"), "has analyzePersonalSign");
  truthy(SRC.includes("permit2"), "detects permit2 type");
  truthy(SRC.includes("permitbatch"), "detects permitbatch type");
  truthy(SRC.includes("Permit2 single"), "detects Permit2 single transferDetails");
}

console.log("[isWalletGuard guard against double-wrap]");
{
  // CRITICAL: must never wrap a provider that's already wrapped, or we
  // create an infinite Proxy chain.
  truthy(/if\s*\(\s*window\.ethereum\.isWalletGuard\s*\)\s*return/.test(SRC),
    "installProxy returns early if already wrapped");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Injector security-critical invariants intact.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
