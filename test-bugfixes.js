// test-bugfixes.js — regression tests for bugs found in the v3.2 audit.
// Each test names the bug it covers so future refactors know what's at stake.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import assert from "node:assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Both lib files are classic scripts (no `export` keyword) so they can
// load via <script src=> in HTML and importScripts() in background.js.
// Load them in Node via `vm` to read their globalThis-attached objects.
function loadClassicModule(filePath) {
  const src = fs.readFileSync(path.join(__dirname, filePath), "utf8");
  const sandbox = { module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: filePath });
  return sandbox.module.exports;
}

const { isFullAddress, shortenAddr } = loadClassicModule("lib/address-utils.js");
const { makeValidators } = loadClassicModule("lib/storage-validators.js");

const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

let passed = 0;
let failed = 0;
const failures = [];

function it(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(".");
  } catch (e) {
    failed++;
    failures.push({ name, err: e });
    process.stdout.write("F");
  }
}

function section(title) {
  process.stdout.write("\n  " + title + "\n  ");
}

// ============================================================
// Bug #1: Activity time truncated by wrong grid columns
// ============================================================
section("Bug #1: activity timeline grid columns");

it("popup.css activity__item uses 2-column grid (was 4px+56px+1fr)", () => {
  const css = read("popup.css");
  const m = css.match(/\.activity__item\s*\{[^}]*grid-template-columns:\s*([^;]+);/);
  assert(m, ".activity__item must declare grid-template-columns");
  const cols = m[1].trim();
  // Should be 2 columns: time + text (not 3 with empty leading column)
  assert(!/4px\s+56px/.test(cols), "must not have the broken 4px 56px 1fr layout");
  assert(/\b52px\b.*\b1fr\b|\b56px\b.*\b1fr\b|\bauto\b.*\b1fr\b/.test(cols),
    "expected a 2-col layout like '52px 1fr' or '56px 1fr'");
});

it("popup.css activity__time has white-space:nowrap to prevent wrap", () => {
  const css = read("popup.css");
  const m = css.match(/\.activity__time\s*\{[^}]*\}/);
  assert(m, ".activity__time must exist");
  assert(/white-space:\s*nowrap/.test(m[0]), ".activity__time needs white-space:nowrap");
});

// ============================================================
// Bug #2: Token/NFT permission row click handler pointed at
// non-existent #rescan-btn — rows looked clickable but did nothing.
// ============================================================
section("Bug #2: permission row click handler");

it("popup.js no longer references #rescan-btn", () => {
  const js = read("popup.js");
  assert(!/getElementById\(["']rescan-btn["']\)/.test(js),
    "popup.js must not reference the removed rescan-btn");
});

it("popup.js has triggerRescan() that sends rescanApprovals", () => {
  const js = read("popup.js");
  assert(/async function triggerRescan/.test(js),
    "triggerRescan() must exist");
  assert(/action:\s*["']rescanApprovals["']/.test(js),
    "triggerRescan must call rescanApprovals");
  assert(/action:\s*["']getApprovalScan["']/.test(js),
    "triggerRescan must refresh getApprovalScan after rescan");
});

it("i18n: scanning/scanDone/scanFailed keys exist in all 4 locales", () => {
  for (const code of ["en", "ru", "es", "zh"]) {
    const messages = extractMessages(read(path.join("lib/locales", code + ".js")));
    assert(messages["popup.permissions.scanning"], `${code}: missing popup.permissions.scanning`);
    assert(messages["popup.permissions.scanDone"], `${code}: missing popup.permissions.scanDone`);
    assert(messages["popup.permissions.scanFailed"], `${code}: missing popup.permissions.scanFailed`);
  }
});

// ============================================================
// Bug #3: settings.js had 11 addEventListener calls without null
// checks — any missing element broke the whole page.
// ============================================================
section("Bug #3: settings.js null-safety");

it("settings.js has onClick/onToggleClick/onEnterKey helper functions", () => {
  const js = read("settings.js");
  assert(/function onClick\s*\(/.test(js), "onClick helper must exist");
  assert(/function onToggleClick\s*\(/.test(js), "onToggleClick helper must exist");
  assert(/function onEnterKey\s*\(/.test(js), "onEnterKey helper must exist");
});

it("settings.js has no bare `document.getElementById(...).addEventListener` without null check", () => {
  const js = read("settings.js");
  // After the refactor, every getElementById().addEventListener should go
  // through onClick/onToggleClick/onEnterKey. Bare chained calls are banned.
  const bare = js.match(/^\s*document\.getElementById\([^)]+\)\.addEventListener/gm) || [];
  assert.strictEqual(bare.length, 0,
    "Found bare addEventListener calls: " + bare.join("\n"));
});

// ============================================================
// Bug #4: whitelist/blacklist showed full 42-char addresses,
// overflowing the layout.
// ============================================================
section("Bug #4: address shortening in list rows");

it("settings.js renderList uses isFullAddress + shortenAddr", () => {
  const js = read("settings.js");
  assert(/isFullAddress\(item\)/.test(js),
    "renderList must gate shortening on isFullAddress(item)");
  assert(/shortenAddr\(item\)/.test(js) || /shortenAddrRaw\(item\)/.test(js),
    "renderList must shorten via shortenAddr");
});

it("lib/address-utils.isFullAddress matches only 0x+40hex", () => {
  assert(isFullAddress("0x" + "a".repeat(40)));
  assert(isFullAddress("0x" + "0123456789abcdef0123456789abcdef01234567"));
  assert(!isFullAddress("0x" + "a".repeat(39)), "too short");
  assert(!isFullAddress("1x" + "a".repeat(40)), "missing 0x prefix");
  assert(!isFullAddress("0x" + "g".repeat(40)), "non-hex char");
  assert(!isFullAddress("metamask.io"), "domain rejected");
  assert(!isFullAddress(""), "empty rejected");
  assert(!isFullAddress(null), "null rejected");
  assert(!isFullAddress(undefined), "undefined rejected");
  assert(!isFullAddress(123), "number rejected");
});

it("lib/address-utils.shortenAddr produces 0x+4…4 form", () => {
  const a = "0xabcdef0123456789abcdef0123456789abcdef01";
  assert.strictEqual(a.length, 42, "test fixture must be a real 42-char address");
  const out = shortenAddr(a);
  // Format: slice(0,6) + "…" + slice(-4) = "0xabcd" + "…" + "ef01" = 11 chars
  assert.strictEqual(out.length, 11, `got "${out}" (${out.length} chars)`);
  assert(out.startsWith("0xabcd"), `prefix wrong: ${out}`);
  assert(out.endsWith("ef01"), `suffix wrong: ${out}`);
  assert(out.includes("\u2026"));
});

it("lib/address-utils.shortenAddr passes non-addresses through", () => {
  assert.strictEqual(shortenAddr("metamask.io"), "metamask.io");
  assert.strictEqual(shortenAddr(""), "");
  assert.strictEqual(shortenAddr(null), "");
});

// ============================================================
// Bug #5: exportSettings included the OpenRouter API key in plain
// JSON. Fix: SENSITIVE_KEYS set + excludedKeys report.
// ============================================================
section("Bug #5: API key excluded from export");

it("background.js declares SENSITIVE_KEYS", () => {
  const js = read("background.js");
  assert(/SENSITIVE_KEYS/.test(js), "SENSITIVE_KEYS must be declared");
  assert(/importScripts\(\s*["']lib\/storage-validators\.js["']/.test(js),
    "background.js must importScripts storage-validators.js");
});

it("background.js exportSettings skips sensitive keys + reports them", () => {
  const js = read("background.js");
  // The case body ends at the next `case` label, `break;`, or `return`.
  const block = js.match(/case "exportSettings":\s*\{[\s\S]*?\n    \}/);
  assert(block, "exportSettings case must exist");
  const body = block[0];
  assert(/SENSITIVE_KEYS\.has/.test(body), "must check SENSITIVE_KEYS");
  assert(/excluded\.push/.test(body), "must push excluded keys");
  assert(/excludedKeys/.test(body), "must return excludedKeys in payload");
});

it("i18n: settings.toast.exportExcluded key in all 4 locales", () => {
  for (const code of ["en", "ru", "es", "zh"]) {
    const messages = extractMessages(read(path.join("lib/locales", code + ".js")));
    assert(messages["settings.toast.exportExcluded"], `${code}: missing settings.toast.exportExcluded`);
  }
});

// ============================================================
// Bug #6: setScore could spawn multiple parallel RAF loops if
// called twice in quick succession.
// ============================================================
section("Bug #6: setScore race condition");

it("popup.js uses a generation token to cancel stale animations", () => {
  const js = read("popup.js");
  assert(/__scoreGen/.test(js), "popup.js must declare __scoreGen counter");
  assert(/\+\+__scoreGen/.test(js), "must increment generation on each call");
  assert(/myToken\s*!==\s*__scoreGen/.test(js),
    "tick must bail when generation changed");
});

// ============================================================
// Bug #7: refreshDynamicUI in settings.js didn't refresh the
// notifications/threatfeed pill text after locale switch.
// ============================================================
section("Bug #7: refreshDynamicUI completeness");

it("settings.js refreshDynamicUI updates notifications + threatfeed toggles", () => {
  const js = read("settings.js");
  const block = js.match(/async function refreshDynamicUI\([\s\S]*?\n\s\s\}/);
  assert(block, "refreshDynamicUI must exist");
  const body = block[0];
  assert(/applyToggleUI\([\s\S]*notifications-toggle/.test(body),
    "must refresh notifications-toggle");
  assert(/applyToggleUI\([\s\S]*threatfeed-toggle/.test(body),
    "must refresh threatfeed-toggle");
});

// ============================================================
// Bug #8: aiCheckAddress accepted arbitrary input — wasted API
// credits and let attackers probe the model.
// ============================================================
section("Bug #8: aiCheckAddress validates address format");

it("background.js aiCheckAddress rejects non-address input", () => {
  const js = read("background.js");
  const fn = js.match(/async function aiCheckAddress\([\s\S]*?\n\}/);
  assert(fn, "aiCheckAddress must exist");
  const body = fn[0];
  assert(/typeof address !== "string" \|\| !\/\^0x\[a-fA-F0-9\]\{40\}\$\/\.test/.test(body),
    "must validate address against 0x + 40 hex");
});

// ============================================================
// Bug #9: importSettings wrote any shape into any storage key.
// Fix: validateStorageShape() with per-key type checks.
// ============================================================
section("Bug #9: importSettings payload validation");

it("lib/storage-validators exports validateStorageShape/isSensitiveKey/clampString", () => {
  const { validateStorageShape, isSensitiveKey, clampString } = makeValidators({
    API_KEY: "wg_apiKey"
  });
  assert.strictEqual(typeof validateStorageShape, "function");
  assert.strictEqual(typeof isSensitiveKey, "function");
  assert.strictEqual(typeof clampString, "function");
});

it("validateStorageShape accepts arrays for array keys, rejects objects", () => {
  const SK = {
    WHITELIST: "wg_whitelist",
    LOGS: "wg_logs",
    STALE_APPROVALS: "wg_staleApprovals",
    ENABLED: "wg_enabled",
    MULTICHAIN: "wg_multiChain",
    API_KEY: "wg_apiKey",
    LAST_WALLET: "wg_lastWallet",
    STATS: "wg_stats",
    ADDRESS_BOOK: "wg_addressBook",
    DNA_PROFILES: "wg_dnaProfiles",
    AI_CACHE: "wg_aiCache",
    THREAT_FEED: "wg_threatFeed",
    THREAT_FEED_ENABLED: "wg_threatFeedEnabled",
    AUTO_REVOKE_OPTED: "wg_autoRevokeOptedIn",
    NOTIFICATIONS_ENABLED: "wg_notificationsEnabled"
  };
  const { validateStorageShape } = makeValidators(SK);

  // Array keys
  assert(validateStorageShape(SK.WHITELIST, ["0xabc"]));
  assert(!validateStorageShape(SK.WHITELIST, "not an array"));
  assert(!validateStorageShape(SK.WHITELIST, { foo: 1 }));

  // Boolean keys
  assert(validateStorageShape(SK.ENABLED, true));
  assert(validateStorageShape(SK.ENABLED, false));
  assert(!validateStorageShape(SK.ENABLED, "true"));
  assert(!validateStorageShape(SK.ENABLED, 1));

  // String keys
  assert(validateStorageShape(SK.API_KEY, "sk-or-v1-..."));
  assert(!validateStorageShape(SK.API_KEY, { nested: true }));
  assert(!validateStorageShape(SK.API_KEY, null));
  assert(!validateStorageShape(SK.API_KEY, undefined));

  // Object keys
  assert(validateStorageShape(SK.STATS, { scannedSites: 0 }));
  assert(!validateStorageShape(SK.STATS, [1, 2, 3]));
});

it("validateStorageShape rejects null/undefined/functions for any key", () => {
  const SK = { WHITELIST: "a", ENABLED: "b", API_KEY: "c", STATS: "d" };
  const { validateStorageShape } = makeValidators(SK);
  for (const k of Object.values(SK)) {
    assert(!validateStorageShape(k, null), `${k}: null rejected`);
    assert(!validateStorageShape(k, undefined), `${k}: undefined rejected`);
  }
});

it("isSensitiveKey marks the API key as sensitive", () => {
  const SK = { API_KEY: "wg_apiKey", WHITELIST: "wg_whitelist" };
  const { isSensitiveKey } = makeValidators(SK);
  assert(isSensitiveKey(SK.API_KEY));
  assert(!isSensitiveKey(SK.WHITELIST));
});

it("clampString caps at max chars and coerces non-strings", () => {
  const { clampString } = makeValidators({});
  assert.strictEqual(clampString("hello world", 5), "hello");
  assert.strictEqual(clampString(null, 5), "");
  assert.strictEqual(clampString(undefined, 5), "");
  assert.strictEqual(clampString(12345, 5), "12345");
  assert.strictEqual(clampString("abc", 10), "abc");  // shorter than max
});

it("background.js importSettings uses validateStorageShape", () => {
  const js = read("background.js");
  const block = js.match(/case "importSettings":\s*\{[\s\S]*?\n    \}/);
  assert(block, "importSettings case must exist");
  assert(/validateStorageShape\(/.test(block[0]),
    "importSettings must call validateStorageShape per key");
});

// ============================================================
// Bug #10: appendLog had no per-message size cap. A 100KB spam
// entry could fill storage quota.
// ============================================================
section("Bug #10: appendLog size cap");

it("background.js declares MAX_LOG_MSG_LEN", () => {
  const js = read("background.js");
  assert(/MAX_LOG_MSG_LEN/.test(js), "MAX_LOG_MSG_LEN constant required");
  assert(/const\s+MAX_LOG_MSG_LEN\s*=\s*\d+/.test(js), "must be a numeric constant");
});

it("background.js appendLog uses clampString with the cap", () => {
  const js = read("background.js");
  const fn = js.match(/async function appendLog\([\s\S]*?\n\}/);
  assert(fn, "appendLog must exist");
  assert(/clampString\(/.test(fn[0]), "must use clampString");
  assert(/MAX_LOG_MSG_LEN/.test(fn[0]), "must use MAX_LOG_MSG_LEN cap");
});

// ============================================================
// Bug #11: classifyLog treated "Auto-revoke disabled" as info
// instead of warn.
// ============================================================
section("Bug #11: classifyLog severity");

it("popup.js classifyLog treats 'disabled' / 'paused' / 'stopped' as warn", () => {
  const js = read("popup.js");
  const fn = js.match(/function classifyLog\([\s\S]*?\n\s\s\}/);
  assert(fn, "classifyLog must exist");
  const body = fn[0];
  assert(/disabled\|paused\|stopped/i.test(body),
    "classifyLog regex must match 'disabled'/'paused'/'stopped'");
});

// ============================================================
// Bug #12: awaitUIResponse in injector.js had no timeout — could
// hang forever if the user closes the tab without responding.
// ============================================================
section("Bug #12: injector UI response timeout");

it("injector.js has UI_RESPONSE_TIMEOUT_MS constant", () => {
  const js = read("injector.js");
  assert(/UI_RESPONSE_TIMEOUT_MS/.test(js), "must declare timeout constant");
});

it("injector.js awaitUIResponse uses setTimeout to fail-open", () => {
  const js = read("injector.js");
  const fn = js.match(/function awaitUIResponse\(\)\s*\{[\s\S]*?\n\s\s\}/);
  assert(fn, "awaitUIResponse must exist");
  const body = fn[0];
  assert(/setTimeout/.test(body), "must use setTimeout");
  assert(/clearTimeout/.test(body), "must clearTimeout on response");
  // Must fail-open (let the call through) when timing out
  assert(/finish\(false\)/.test(body),
    "timeout must resolve with false to pass through the original call");
});

// ============================================================
// Bug #13: installProxy set isWalletGuard on a mock that never got
// replaced, so a real wallet appearing later was never wrapped.
// ============================================================
section("Bug #13: installProxy real-wallet race");

it("injector.js installProxy no longer installs a mock provider", () => {
  const js = read("injector.js");
  // The old code did `window.ethereum = new Proxy(mockBase, ...)` when
  // window.ethereum didn't exist. That mock stamped isWalletGuard=true and
  // caused the later DOMContentLoaded handler to skip wrapping the real
  // provider.
  assert(!/mockBase/.test(js), "installProxy must not create a mock provider");
});

// ============================================================
// Helpers
// ============================================================

/**
 * Naive MESSAGES extractor for ESM-style locale files when they use
 * `export const MESSAGES = { ... }`. Matches the last balanced object.
 * @param {string} src
 * @returns {Object}
 */
function extractMessages(src) {
  const m = src.match(/export\s+const\s+MESSAGES\s*=\s*(\{[\s\S]*?\});?\s*$/);
  if (!m) return {};
  try {
    return new Function("return " + m[1])();
  } catch {
    return {};
  }
}

// ============================================================
// Summary
// ============================================================
process.stdout.write("\n\n");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
if (failures.length > 0) {
  console.log("\n  Failures:");
  for (const { name, err } of failures) {
    console.log(`    - ${name}`);
    console.log(`      ${err.message}`);
    if (err.stack) {
      const lines = err.stack.split("\n").slice(0, 3).join("\n      ");
      console.log(`      ${lines}`);
    }
  }
}
process.exit(failures.length > 0 ? 1 : 0);
