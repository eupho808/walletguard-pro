// test-multichain.js - Smoke test for approval-scanner.js multi-chain path.
//
// Run with:  node test-multichain.js
//
// approval-scanner.js is normally loaded via importScripts() in the
// service worker. It expects a global `self` and a `chrome.tabs` /
// `chrome.runtime` API. To test it from Node we execute it inside a
// fresh `vm` context with those globals stubbed out.
//
// What we verify:
//   1. WGApprovalScanner exposes the new public surface
//      (MULTICHAIN_RPCS, scanChainApprovals, scanApprovalsMultiChain).
//   2. CHAIN_INFO reverse-lookup matches CHAIN_NAMES (hex -> id).
//   3. Per-chain lookback cap is configured for all 6 supported chains.
//   4. scanApprovalsMultiChain aggregates summaries and isolates per-chain
//      failures when one of the RPC transports throws.
//   5. The legacy single-chain scanApprovals path still works (back-compat).

import fs from "fs";
import vm from "vm";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ---------- Mock environment ----------

// Stub for chrome.tabs / chrome.runtime used by the wallet-bridge path.
// We don't exercise that path in these tests, but the script still
// references these at module-init time so we provide safe no-ops.
const chromeStub = {
  tabs: {
    query: (_q, cb) => cb && cb([]),
    sendMessage: (_id, _msg, cb) => cb && cb(),
  },
  runtime: {
    onMessage: { addListener: () => {} },
    lastError: null,
  },
};

// We build a fresh vm context for each test scenario so we can swap
// the fetch mock independently.
function loadScanner(rpcResponses) {
  const src = fs.readFileSync(path.join(__dirname, "approval-scanner.js"), "utf8");
  const sandbox = {
    self: {},
    globalThis: {},
    chrome: chromeStub,
    fetch: (url, opts) => {
      // Match the rpcUrl against the registry. If found, return the
      // canned response. Otherwise simulate a network error so we can
      // verify graceful failure handling.
      const canned = rpcResponses[url];
      if (!canned) {
        return Promise.reject(new Error("Network error: " + url));
      }
      return Promise.resolve({
        ok: canned.ok !== false,
        status: canned.status || 200,
        json: () => Promise.resolve(canned.body)
      });
    },
    AbortController: class {
      constructor() { this.signal = {}; }
      abort() {}
    },
    setTimeout: (fn, _ms) => 0,
    clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "approval-scanner.js" });
  return sandbox.self.WGApprovalScanner;
}

// ---------- Static shape checks ----------

console.log("\n[static: WGApprovalScanner surface]");

const scanner = loadScanner({});
check("WGApprovalScanner exposed",          !!scanner);
check("MULTICHAIN_RPCS exported",           !!scanner.MULTICHAIN_RPCS);
check("CHAIN_INFO exported",                !!scanner.CHAIN_INFO);
check("CHAIN_LOOKBACK exported",            !!scanner.CHAIN_LOOKBACK);
check("scanApprovalsMultiChain exported",   typeof scanner.scanApprovalsMultiChain === "function");
check("scanChainApprovals exported",        typeof scanner.scanChainApprovals === "function");
check("rpcCallDirect exported",             typeof scanner.rpcCallDirect === "function");
check("rpcAdapter exported",                typeof scanner.rpcAdapter === "function");

console.log("\n[static: chain coverage]");

const chains = scanner.MULTICHAIN_RPCS;
check("6 chains configured",                Object.keys(chains).length === 6,
                                            "got " + Object.keys(chains).length);
check("Ethereum mainnet (1)",               typeof chains[1] === "string" && chains[1].startsWith("https://"));
check("Optimism (10)",                      typeof chains[10] === "string");
check("Polygon (137)",                      typeof chains[137] === "string");
check("Base (8453)",                        typeof chains[8453] === "string");
check("Arbitrum (42161)",                   typeof chains[42161] === "string");
check("Sepolia (11155111)",                 typeof chains[11155111] === "string");

const lookback = scanner.CHAIN_LOOKBACK;
check("Lookback cap for all chains",        Object.keys(lookback).length === 6);
check("Polygon lookback > Ethereum (faster blocks)",
                                            lookback[137] > lookback[1]);
check("Arbitrum lookback > Ethereum (very fast blocks)",
                                            lookback[42161] > lookback[1]);

console.log("\n[static: CHAIN_INFO reverse lookup]");

const info = scanner.CHAIN_INFO;
check("CHAIN_INFO[1] is Ethereum",          info[1] && info[1].name === "Ethereum");
check("CHAIN_INFO[137] is Polygon",         info[137] && info[137].name === "Polygon");
check("CHAIN_INFO[42161] is Arbitrum",      info[42161] && info[42161].name === "Arbitrum");

// ---------- Aggregation logic ----------

console.log("\n[multi-chain: aggregation with mocked RPC]");

// A canned response with one Approval event: an unlimited USDC
// approval to an unknown spender on Ethereum mainnet.
const ethBlockHex = "0x" + (21000000n).toString(16);
const ethLog = {
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  topics: [
    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
    "0x" + "0".repeat(24) + "d8da6045b8c4e3a8e3a4e3a8e3a4e3a8e3a4e3a8", // owner (placeholder)
    "0x" + "0".repeat(24) + "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"  // spender (unknown)
  ],
  data: "0x" + "f".repeat(64)
};

// Build a response object that the mocked fetch will return for a
// given (url, method, params) combo. The scanner calls eth_blockNumber,
// then eth_getLogs (possibly multiple times if chunked), then eth_call.
function makeResponsesFor(chainRpcUrl, opts) {
  const responses = {};
  responses[chainRpcUrl] = {
    body: { jsonrpc: "2.0", id: 1, result: ethBlockHex }
  };
  // The scanner calls eth_blockNumber first. After that it calls
  // eth_getLogs. If opts.failLogs is true, throw on eth_getLogs.
  // We use URL-based dispatch: if the response body for the URL
  // doesn't match the method, our mock is too dumb to handle that.
  // Instead, we control behaviour via per-URL state.
  return responses;
}

// We need a smarter mock that responds based on the JSON-RPC method.
// Replace the simple url-based mock with a method-aware one.
function makeMethodAwareScanner(behaviourByRpc) {
  const src = fs.readFileSync(path.join(__dirname, "approval-scanner.js"), "utf8");
  const sandbox = {
    self: {},
    globalThis: {},
    chrome: chromeStub,
    fetch: (url, opts) => {
      const cfg = behaviourByRpc[url];
      if (!cfg) return Promise.reject(new Error("Unknown RPC: " + url));
      const body = JSON.parse(opts.body);
      const method = body.method;
      const handler = cfg[method] || cfg.__default;
      if (handler === "throw") {
        return Promise.reject(new Error("RPC " + method + " failed for " + url));
      }
      if (typeof handler === "function") {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(handler(body.params))
        });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(handler)
      });
    },
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout: () => 0, clearTimeout: () => {},
    console: { log: () => {}, warn: () => {}, error: () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "approval-scanner.js" });
  return sandbox.self.WGApprovalScanner;
}

// A wallet address we pretend to scan. The scanner doesn't actually
// require it to exist on-chain; it just uses it as the topic filter
// and the address argument to eth_call. Mocked RPC doesn't care.
const TEST_ADDR = "0xd8da6045b8c4e3a8e3a4e3a8e3a4e3a8e3a4e3a8";

const unlimitedHex = "0x" + "f".repeat(64);

function defaultHandlerForChain(unlimitedSpender) {
  return {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: ethBlockHex },
    eth_getLogs: { jsonrpc: "2.0", id: 1, result: [ethLog] },
    eth_call: { jsonrpc: "2.0", id: 1, result: unlimitedHex }
  };
}

// Scenario A: all 6 chains succeed, each reports one unlimited approval.
{
  const behaviour = {};
  for (const [id, url] of Object.entries(scanner.MULTICHAIN_RPCS)) {
    behaviour[url] = defaultHandlerForChain();
  }
  const s = makeMethodAwareScanner(behaviour);
  const result = await s.scanApprovalsMultiChain(TEST_ADDR, new Set());
  check("multiChain flag set",                  result.multiChain === true);
  check("6 chain results returned",             result.chains.length === 6);
  check("chainsScanned == 6 (no failures)",     result.summary.chainsScanned === 6);
  check("chainsFailed == 0",                    result.summary.chainsFailed === 0);
  check("summary.total > 0",                    result.summary.total > 0);
  check("summary.unlimited > 0",                result.summary.unlimited > 0);
  check("every chain has chainName",            result.chains.every((c) => typeof c.chainName === "string"));
  check("every approval carries chainName",     result.chains
                                                  .flatMap((c) => c.approvals)
                                                  .every((a) => typeof a.chainName === "string"));
  check("byChain indexed by chain name",        Object.keys(result.summary.byChain).length > 0);
}

// Scenario B: one chain (Arbitrum) RPC throws on eth_blockNumber.
// The scanner should report that chain as failed but complete the rest.
{
  const behaviour = {};
  for (const [id, url] of Object.entries(scanner.MULTICHAIN_RPCS)) {
    if (parseInt(id, 10) === 42161) {
      behaviour[url] = { eth_blockNumber: "throw" };
    } else {
      behaviour[url] = defaultHandlerForChain();
    }
  }
  const s = makeMethodAwareScanner(behaviour);
  const result = await s.scanApprovalsMultiChain(TEST_ADDR, new Set());
  check("chainsScanned == 5 (Arbitrum failed)", result.summary.chainsScanned === 5);
  check("chainsFailed == 1",                    result.summary.chainsFailed === 1);
  const arb = result.chains.find((c) => c.chainId === 42161);
  check("Arbitrum result has error",            !!arb && typeof arb.error === "string");
  check("Arbitrum result has empty approvals",  !!arb && Array.isArray(arb.approvals) && arb.approvals.length === 0);
  check("Other 5 chains have approvals",        result.chains
                                                  .filter((c) => c.chainId !== 42161)
                                                  .every((c) => Array.isArray(c.approvals) && c.approvals.length > 0));
}

// Scenario C: subset of chains (only Ethereum + Polygon).
{
  const behaviour = {};
  behaviour[scanner.MULTICHAIN_RPCS[1]] = defaultHandlerForChain();
  behaviour[scanner.MULTICHAIN_RPCS[137]] = defaultHandlerForChain();
  const s = makeMethodAwareScanner(behaviour);
  const result = await s.scanApprovalsMultiChain(TEST_ADDR, new Set(), [1, 137]);
  check("Subset: only 2 chain results",         result.chains.length === 2);
  check("Subset: chainsScanned == 2",           result.summary.chainsScanned === 2);
  const ids = result.chains.map((c) => c.chainId).sort();
  check("Subset: ids are 1 and 137",            JSON.stringify(ids) === JSON.stringify([1, 137]));
}

// Scenario D: invalid address rejected.
{
  const behaviour = {};
  for (const url of Object.values(scanner.MULTICHAIN_RPCS)) {
    behaviour[url] = defaultHandlerForChain();
  }
  const s = makeMethodAwareScanner(behaviour);
  let threw = false;
  try { await s.scanApprovalsMultiChain("not-an-address", new Set()); }
  catch (e) { threw = true; }
  check("Invalid address throws",               threw);
}

// Scenario E: scanChainApprovals works with a custom rpcFn.
{
  let calls = 0;
  const customRpc = (method, params) => {
    calls++;
    if (method === "eth_blockNumber") return Promise.resolve(ethBlockHex);
    if (method === "eth_getLogs") return Promise.resolve([ethLog]);
    if (method === "eth_call") return Promise.resolve(unlimitedHex);
    return Promise.reject(new Error("Unexpected: " + method));
  };
  const result = await scanner.scanChainApprovals(TEST_ADDR, 1, customRpc, new Set());
  check("scanChainApprovals: chainId set",      result.chainId === 1);
  check("scanChainApprovals: chainName set",    result.chainName === "Ethereum");
  check("scanChainApprovals: rpcFn called",     calls > 0);
  check("scanChainApprovals: 1 approval",       result.approvals.length === 1);
  check("scanChainApprovals: critical risk",    result.approvals[0].risk.level === "critical");
}

console.log("\n[back-compat: single-chain scanApprovals]");

// The single-chain path requires a real wallet bridge, which we can't
// exercise from Node. Verify the function exists and validates input.
{
  let threw = false;
  try { await scanner.scanApprovals("not-an-address", new Set()); }
  catch (e) {
    threw = true;
    check("scanApprovals: error message",        /invalid/i.test(e.message), e.message);
  }
  check("scanApprovals: invalid input throws",  threw);
}
check("scanApprovals still exported",           typeof scanner.scanApprovals === "function");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
