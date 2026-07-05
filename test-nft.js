// test-nft.js - Smoke test for approval-scanner.js NFT (ApprovalForAll) path.
//
// Run with:  node test-nft.js
//
// Same approach as test-multichain.js: we load approval-scanner.js inside
// a fresh `vm` context with a mocked `chrome.*` API and a mocked `fetch`.
// The mock is method-aware so we can craft different responses for
// eth_getLogs (event discovery), eth_blockNumber, eth_call (allowance
// + isApprovedForAll) per chain.
//
// Coverage:
//   1. Static surface: NFT constants and exported functions are exposed.
//   2. fetchNFTApprovalForAllEvents parses logs into (collection, operator).
//   3. fetchCurrentNFTApprovals filters revoked (isApprovedForAll = false)
//      and non-NFT (revert) responses.
//   4. scanNFTApprovals risk classification:
//      - unknown operator        -> critical
//      - verified operator       -> low
//      - whitelisted operator    -> info
//   5. scanChainApprovals runs ERC-20 and NFT scans in parallel; both
//      halves are present in the result.
//   6. scanApprovalsMultiChain aggregates NFT totals across chains.
//   7. Backwards compatibility: scanApprovals still throws on bad input.

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

const chromeStub = {
  tabs: {
    query: (_q, cb) => cb && cb([]),
    sendMessage: (_id, _msg, cb) => cb && cb(),
  },
  runtime: {
    onMessage: { addListener: () => {} },
    lastError: null,
  }
};

function loadScannerWith(rpcBehaviour) {
  const src = fs.readFileSync(path.join(__dirname, "approval-scanner.js"), "utf8");
  const sandbox = {
    self: {},
    globalThis: {},
    chrome: chromeStub,
    fetch: (url, opts) => {
      const cfg = rpcBehaviour[url];
      if (!cfg) return Promise.reject(new Error("Unknown RPC: " + url));
      const body = JSON.parse(opts.body);
      const handler = cfg[body.method];
      if (handler === "throw") {
        return Promise.reject(new Error(body.method + " failed for " + url));
      }
      if (typeof handler === "function") {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve(handler(body.params))
        });
      }
      return Promise.resolve({
        ok: true, status: 200,
        json: () => Promise.resolve(handler || { jsonrpc: "2.0", id: 1, result: null })
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

// ---------- Fixtures ----------

const BLOCK_HEX = "0x" + (21000000n).toString(16);

// An ApprovalForAll log emitted by BAYC for (owner, OpenSea operator).
function makeApprovalForAllLog(collection, owner, operator) {
  return {
    address: collection,
    topics: [
      "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b01076980c8",
      "0x" + owner.replace(/^0x/, "").padStart(64, "0"),
      "0x" + operator.replace(/^0x/, "").padStart(64, "0")
    ],
    data: "0x" + "0".repeat(64) // approved = true
  };
}

const TEST_ADDR = "0xd8da6045b8c4e3a8e3a4e3a8e3a4e3a8e3a4e3a8";
const BAYC = "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d";
const AZUKI = "0xed5af388653567aff25118525a23a8e78cf74c8f";
const OPENSEA_SEAPORT = "0x1e0049783f008a0085193e00003d00cd54003c71";
const BLUR = "0x000000000000ad05ccc4f10045630fb830b95127";
const UNKNOWN_OP = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const ETH_RPC = "https://eth.llamarpc.com";
const POLY_RPC = "https://polygon-rpc.com";

// ---------- 1. Static surface ----------

console.log("\n[static: NFT surface]");

// Use empty behaviour for surface checks.
const surfaceScanner = loadScannerWith({});
check("APPROVAL_FOR_ALL_TOPIC exported",
      surfaceScanner.APPROVAL_FOR_ALL_TOPIC === "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b01076980c8");
check("KNOWN_NFT_COLLECTIONS exported",
      surfaceScanner.KNOWN_NFT_COLLECTIONS && surfaceScanner.KNOWN_NFT_COLLECTIONS[BAYC]);
check("BAYC entry -> ERC-721",
      surfaceScanner.KNOWN_NFT_COLLECTIONS[BAYC].type === "ERC-721");
check("KNOWN_NFT_OPERATORS exported",
      surfaceScanner.KNOWN_NFT_OPERATORS && surfaceScanner.KNOWN_NFT_OPERATORS.has);
check("KNOWN_NFT_OPERATORS is Set-like (has .has)",
      typeof surfaceScanner.KNOWN_NFT_OPERATORS.has === "function");
check("OpenSea in KNOWN_NFT_OPERATORS",
      surfaceScanner.KNOWN_NFT_OPERATORS.has(OPENSEA_SEAPORT));
check("Blur in KNOWN_NFT_OPERATORS",
      surfaceScanner.KNOWN_NFT_OPERATORS.has(BLUR));
check("scanNFTApprovals exported",
      typeof surfaceScanner.scanNFTApprovals === "function");
check("scanERC20Approvals exported",
      typeof surfaceScanner.scanERC20Approvals === "function");
check("classifyNFTRisk exported",
      typeof surfaceScanner.classifyNFTRisk === "function");
check("operatorDisplayName exported",
      typeof surfaceScanner.operatorDisplayName === "function");

// ---------- 2. Risk classification ----------

console.log("\n[risk classification]");

const wl = new Set();
check("unknown operator -> critical",
      surfaceScanner.classifyNFTRisk({ operator: UNKNOWN_OP }, wl).level === "critical");
check("unknown operator with name -> high",
      surfaceScanner.classifyNFTRisk({ operator: UNKNOWN_OP, operatorName: "FakeMarket" }, wl).level === "high");
check("OpenSea -> low",
      surfaceScanner.classifyNFTRisk({ operator: OPENSEA_SEAPORT }, wl).level === "low");
check("Blur -> low",
      surfaceScanner.classifyNFTRisk({ operator: BLUR }, wl).level === "low");
check("whitelisted -> info",
      surfaceScanner.classifyNFTRisk({ operator: UNKNOWN_OP }, new Set([UNKNOWN_OP])).level === "info");
check("operatorDisplayName(OpenSea)",
      surfaceScanner.operatorDisplayName(OPENSEA_SEAPORT) === "OpenSea");
check("operatorDisplayName(Blur)",
      surfaceScanner.operatorDisplayName(BLUR) === "Blur");
check("operatorDisplayName(unknown) returns null",
      surfaceScanner.operatorDisplayName(UNKNOWN_OP) === null);

// ---------- 3. scanNFTApprovals with mocked RPC ----------

console.log("\n[scanNFTApprovals: mocked]");

// Scenario: owner has approved OpenSea for BAYC (verified -> low),
// and an unknown operator for Azuki (critical). The Azuki approval is
// then revoked by setting isApprovedForAll = false (should be filtered).
{
  const ethBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: { jsonrpc: "2.0", id: 1, result: [
      makeApprovalForAllLog(BAYC, TEST_ADDR, OPENSEA_SEAPORT),
      makeApprovalForAllLog(AZUKI, TEST_ADDR, UNKNOWN_OP)
    ] },
    eth_call: (params) => {
      const data = params[0].data;
      const target = (params[0].to || "").toLowerCase();
      // isApprovedForAll selector 0xe985e9c5
      // Calldata layout (with "0x" prefix): 0x | 4-byte selector | 32-byte owner | 32-byte operator
      // In chars: 0x | 8 selector | 64 owner | 64 operator (last 40 of each 64-byte word is the address)
      if (data.startsWith("0xe985e9c5")) {
        // Skip "0x" (2) + selector (8) + owner (64) + operator's left-pad (24) = 98.
        const op = "0x" + data.slice(98, 138).toLowerCase();
        if (op === UNKNOWN_OP) {
          // Revoked
          return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(64) };
        }
        // OpenSea -> approved
        return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(63) + "1" };
      }
      return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(64) };
    }
  };
  const scanner = loadScannerWith({ [ETH_RPC]: ethBehaviour });
  const result = await scanner.scanNFTApprovals(TEST_ADDR, 1, scanner.rpcAdapter(ETH_RPC), new Set());

  check("scanNFTApprovals: chainId set",    result.chainId === 1);
  check("scanNFTApprovals: chainName set",  result.chainName === "Ethereum");
  check("scanNFTApprovals: 1 NFT (Azuki revoked filtered out)",
        result.approvals.length === 1,
        "got " + result.approvals.length);
  check("scanNFTApprovals: BAYC kept",
        result.approvals[0].collection === BAYC);
  check("scanNFTApprovals: collectionName",
        result.approvals[0].collectionName === "BAYC");
  check("scanNFTApprovals: tokenType",
        result.approvals[0].tokenType === "ERC-721");
  check("scanNFTApprovals: operatorName (OpenSea)",
        result.approvals[0].operatorName === "OpenSea");
  check("scanNFTApprovals: risk = low (verified operator)",
        result.approvals[0].risk.level === "low");
  check("scanNFTApprovals: summary.total = 1",
        result.summary.total === 1);
  check("scanNFTApprovals: summary.risky = 0",
        result.summary.risky === 0);
}

// Scenario: both approvals still active — one to verified, one to unknown.
{
  const ethBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: { jsonrpc: "2.0", id: 1, result: [
      makeApprovalForAllLog(BAYC, TEST_ADDR, OPENSEA_SEAPORT),
      makeApprovalForAllLog(AZUKI, TEST_ADDR, UNKNOWN_OP)
    ] },
    eth_call: (params) => {
      const data = params[0].data;
      if (data.startsWith("0xe985e9c5")) {
        // Both approved.
        return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(63) + "1" };
      }
      return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(64) };
    }
  };
  const scanner = loadScannerWith({ [ETH_RPC]: ethBehaviour });
  const result = await scanner.scanNFTApprovals(TEST_ADDR, 1, scanner.rpcAdapter(ETH_RPC), new Set());
  check("both-approved: 2 NFTs",        result.approvals.length === 2);
  check("both-approved: 1 risky",       result.summary.risky === 1);
  check("both-approved: 1 critical",    result.summary.byRiskLevel.critical === 1);
  check("both-approved: 1 low",         result.summary.byRiskLevel.low === 1);
  const azuki = result.approvals.find((a) => a.collection === AZUKI);
  check("both-approved: Azuki -> critical",
        azuki && azuki.risk.level === "critical");
  check("both-approved: Azuki operatorName = null (unknown)",
        azuki && azuki.operatorName === null);
}

// Scenario: collection is non-NFT (isApprovedForAll reverts) -> filtered out.
{
  const ethBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: { jsonrpc: "2.0", id: 1, result: [
      makeApprovalForAllLog(BAYC, TEST_ADDR, OPENSEA_SEAPORT),
      makeApprovalForAllLog("0x1111111111111111111111111111111111111111", TEST_ADDR, UNKNOWN_OP)
    ] },
    eth_call: (params) => {
      const data = params[0].data;
      const target = (params[0].to || "").toLowerCase();
      if (data.startsWith("0xe985e9c5")) {
        if (target === "0x1111111111111111111111111111111111111111") {
          // Non-NFT: revert (eth_call throws).
          return "throw";
        }
        return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(63) + "1" };
      }
      return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(64) };
    }
  };
  const scanner = loadScannerWith({ [ETH_RPC]: ethBehaviour });
  const result = await scanner.scanNFTApprovals(TEST_ADDR, 1, scanner.rpcAdapter(ETH_RPC), new Set());
  check("non-NFT reverted: 1 NFT kept", result.approvals.length === 1);
  check("non-NFT reverted: BAYC kept",   result.approvals[0].collection === BAYC);
}

// Scenario: unknown collection (not in KNOWN_NFT_COLLECTIONS).
{
  const ethBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: { jsonrpc: "2.0", id: 1, result: [
      makeApprovalForAllLog("0xfeedfacefeedfacefeedfacefeedfacefeedface", TEST_ADDR, OPENSEA_SEAPORT)
    ] },
    eth_call: { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(63) + "1" }
  };
  const scanner = loadScannerWith({ [ETH_RPC]: ethBehaviour });
  const result = await scanner.scanNFTApprovals(TEST_ADDR, 1, scanner.rpcAdapter(ETH_RPC), new Set());
  check("unknown collection: kept",      result.approvals.length === 1);
  check("unknown collection: tokenType Unknown",
        result.approvals[0].tokenType === "Unknown");
  check("unknown collection: collectionName uses short addr",
        /feed/.test(result.approvals[0].collectionName));
  check("unknown collection: risk = low (verified operator)",
        result.approvals[0].risk.level === "low");
}

// ---------- 4. scanChainApprovals runs ERC-20 + NFT in parallel ----------

console.log("\n[scanChainApprovals: parallel ERC-20 + NFT]");

{
  const ethBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: (params) => {
      const topics = params[0].topics || [];
      // ApprovalForAll vs ERC-20 Approval
      if (topics[0] === "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b01076980c8") {
        return { jsonrpc: "2.0", id: 1, result: [
          makeApprovalForAllLog(BAYC, TEST_ADDR, UNKNOWN_OP)
        ] };
      }
      return { jsonrpc: "2.0", id: 1, result: [] };
    },
    eth_call: (params) => {
      const data = params[0].data;
      // isApprovedForAll -> approved
      if (data.startsWith("0xe985e9c5")) {
        return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(63) + "1" };
      }
      // allowance -> 0
      return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(64) };
    }
  };
  const scanner = loadScannerWith({ [ETH_RPC]: ethBehaviour });
  const result = await scanner.scanChainApprovals(TEST_ADDR, 1, scanner.rpcAdapter(ETH_RPC), new Set());
  check("scanChainApprovals: returns ERC-20 approvals field",
        Array.isArray(result.approvals));
  check("scanChainApprovals: returns NFT approvals field",
        Array.isArray(result.nftApprovals));
  check("scanChainApprovals: 0 ERC-20 (no events)",
        result.approvals.length === 0);
  check("scanChainApprovals: 1 NFT (BAYC -> unknown)",
        result.nftApprovals.length === 1);
  check("scanChainApprovals: NFT is critical",
        result.nftApprovals[0].risk.level === "critical");
  check("scanChainApprovals: nftSummary present",
        result.nftSummary && result.nftSummary.total === 1);
  check("scanChainApprovals: nftSummary.risky === 1",
        result.nftSummary && result.nftSummary.risky === 1);
}

// Scenario: NFT scan fails (RPC throws on eth_getLogs for ApprovalForAll
// topic) but ERC-20 scan succeeds — Promise.allSettled must keep ERC-20
// alive and the NFT path should swallow the error gracefully.
{
  let ethCallCount = 0;
  const ethBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: (params) => {
      const topics = params[0].topics || [];
      if (topics[0] === "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b01076980c8") {
        return "throw"; // NFT side throws on every chunk
      }
      return { jsonrpc: "2.0", id: 1, result: [] };
    },
    eth_call: () => {
      ethCallCount++;
      return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(64) };
    }
  };
  const scanner = loadScannerWith({ [ETH_RPC]: ethBehaviour });
  const result = await scanner.scanChainApprovals(TEST_ADDR, 1, scanner.rpcAdapter(ETH_RPC), new Set());
  check("ERC-20 survives NFT failure: approvals empty array",
        Array.isArray(result.approvals) && result.approvals.length === 0);
  check("NFT failure: nftApprovals empty array",
        Array.isArray(result.nftApprovals) && result.nftApprovals.length === 0);
  check("NFT failure: nftSummary empty",
        result.nftSummary && result.nftSummary.total === 0);
  check("NFT failure: result has no top-level error",
        !result.error);
  check("NFT failure: result.scannedAt set",
        typeof result.scannedAt === "string" && result.scannedAt.length > 0);
}

// ---------- 5. Multi-chain NFT aggregation ----------

console.log("\n[multi-chain: NFT aggregation]");

{
  const ethBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: (params) => {
      const topics = params[0].topics || [];
      if (topics[0] === "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b01076980c8") {
        return { jsonrpc: "2.0", id: 1, result: [
          makeApprovalForAllLog(BAYC, TEST_ADDR, OPENSEA_SEAPORT),
          makeApprovalForAllLog(AZUKI, TEST_ADDR, UNKNOWN_OP)
        ] };
      }
      return { jsonrpc: "2.0", id: 1, result: [] };
    },
    eth_call: (params) => {
      const data = params[0].data;
      if (data.startsWith("0xe985e9c5")) {
        return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(63) + "1" };
      }
      return { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(64) };
    }
  };
  const polyBehaviour = {
    eth_blockNumber: { jsonrpc: "2.0", id: 1, result: BLOCK_HEX },
    eth_getLogs: (params) => {
      const topics = params[0].topics || [];
      if (topics[0] === "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b01076980c8") {
        return { jsonrpc: "2.0", id: 1, result: [
          makeApprovalForAllLog(AZUKI, TEST_ADDR, BLUR)
        ] };
      }
      return { jsonrpc: "2.0", id: 1, result: [] };
    },
    eth_call: { jsonrpc: "2.0", id: 1, result: "0x" + "0".repeat(63) + "1" }
  };
  const scanner = loadScannerWith({
    [ETH_RPC]: ethBehaviour,
    [POLY_RPC]: polyBehaviour
  });
  const result = await scanner.scanApprovalsMultiChain(TEST_ADDR, new Set(), [1, 137]);
  check("multi-chain: chains array has 2",  result.chains.length === 2);
  check("multi-chain: nftSummary.total = 3 (2+1)",
        result.nftSummary.total === 3);
  check("multi-chain: nftSummary.risky = 1 (only Azuki -> unknown on Ethereum)",
        result.nftSummary.risky === 1);
  check("multi-chain: nftSummary.byChain has Ethereum",
        result.nftSummary.byChain.Ethereum === 2);
  check("multi-chain: nftSummary.byChain has Polygon",
        result.nftSummary.byChain.Polygon === 1);
}

// ---------- 6. Back-compat: scanApprovals still works ----------

console.log("\n[back-compat: scanApprovals]");

{
  let threw = false;
  try {
    await surfaceScanner.scanApprovals("not-an-address");
  } catch (e) {
    threw = true;
    check("scanApprovals rejects bad addr", /invalid/i.test(e.message), e.message);
  }
  check("scanApprovals: threw on bad input", threw);
}
check("scanApprovals still exported", typeof surfaceScanner.scanApprovals === "function");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
