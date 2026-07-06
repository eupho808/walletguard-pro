// test-bulk-multicall.js - Tests for bulk multicall functionality in lib/revoke-generator.js
import assert from "node:assert/strict";
import {
  ERC20_APPROVE_SELECTOR,
  NFT_SET_APPROVAL_FOR_ALL_SELECTOR,
  padAddress,
  buildBulkRevokeMulticall,
  selectBulkRevokeCandidates
} from "./lib/revoke-generator.js";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

console.log("[padAddress]");
{
  const addr = "0x1234567890123456789012345678901234567890";
  const padded = padAddress(addr);
  truthy(padded.startsWith("0x") && padded.length === 66, "returns 32-byte hex");
  truthy(padded.endsWith("1234567890123456789012345678901234567890"), "address preserved at end");
  // Lowercase
  const upper = padAddress(addr.toUpperCase());
  eq(upper, padded, "uppercase normalized");
  // Bad input
  let threw = false;
  try { padAddress("0xshort"); } catch { threw = true; }
  ok(threw, "throws on short address");
  try { padAddress(null); } catch { threw = true; }
  ok(threw, "throws on null");
}

console.log("[ERC20_APPROVE_SELECTOR]");
{
  // keccak256("approve(address,uint256)") first 4 bytes
  eq(ERC20_APPROVE_SELECTOR, "0x095ea7b3", "approve selector correct");
}

console.log("[NFT_SET_APPROVAL_FOR_ALL_SELECTOR]");
{
  // keccak256("setApprovalForAll(address,bool)") first 4 bytes
  eq(NFT_SET_APPROVAL_FOR_ALL_SELECTOR, "0xa22cb465", "setApprovalForAll selector correct");
}

console.log("[selectBulkRevokeCandidates]");
{
  const approvals = [
    { tokenAddress: "0xa", spender: "0xs1", isStale: true, ageDays: 200, unlimited: false, whitelisted: false },
    { tokenAddress: "0xb", spender: "0xs2", isStale: false, ageDays: 30 },
    { tokenAddress: "0xc", spender: "0xs3", isStale: true, ageDays: 400, whitelisted: true }, // whitelisted
    { tokenAddress: "0xd", spender: "0xs4", isStale: true, unlimited: true }, // stale + unlimited
    { tokenAddress: "0xe", spender: "0xs5", isStale: true, ageDays: 500 },
    { tokenAddress: "0xf", spender: "0xs6", isStale: true, isAutoRevokeCandidate: true },
  ];
  const candidates = selectBulkRevokeCandidates(approvals);
  eq(candidates.length, 4, "4 candidates selected");
  // Verify exclusions
  truthy(!candidates.some(c => c.spender === "0xs2"), "non-stale excluded");
  truthy(!candidates.some(c => c.spender === "0xs3"), "whitelisted excluded");
  // Verify inclusions
  truthy(candidates.some(c => c.spender === "0xs1"), "stale + unused included");
  truthy(candidates.some(c => c.spender === "0xs4"), "stale + unlimited included");
  truthy(candidates.some(c => c.spender === "0xs5"), "stale included");
  truthy(candidates.some(c => c.spender === "0xs6"), "isAutoRevokeCandidate included");
}

console.log("[selectBulkRevokeCandidates — edge cases]");
{
  eq(selectBulkRevokeCandidates(null), [], "null → []");
  eq(selectBulkRevokeCandidates([]), [], "empty → []");
  eq(selectBulkRevokeCandidates("not-array"), [], "non-array → []");
}

console.log("[buildBulkRevokeMulticall — empty]");
{
  eq(buildBulkRevokeMulticall(null).batches.length, 0, "null → 0 batches");
  eq(buildBulkRevokeMulticall([]).batches.length, 0, "empty → 0 batches");
  eq(buildBulkRevokeMulticall([]).totalSaved, 0, "totalSaved = 0");
}

console.log("[buildBulkRevokeMulticall — single batch]");
{
  // 3 approvals of USDC on Ethereum (same chain, same token)
  const approvals = [
    { chainId: 1, tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", tokenSymbol: "USDC", spender: "0xspender1", spenderName: "Uniswap" },
    { chainId: 1, tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", tokenSymbol: "USDC", spender: "0xspender2" },
    { chainId: 1, tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", tokenSymbol: "USDC", spender: "0xspender3" },
  ];
  const result = buildBulkRevokeMulticall(approvals);
  eq(result.batches.length, 1, "1 batch (same chain+token)");
  eq(result.totalSaved, 2, "saves 2 transactions (3 → 1)");
  const batch = result.batches[0];
  eq(batch.chainId, 1, "chainId correct");
  eq(batch.tokenSymbol, "USDC", "tokenSymbol correct");
  eq(batch.to, MULTICALL3.toLowerCase(), "to = Multicall3 (lowercase)");
  eq(batch.value, "0x0", "value = 0");
  eq(batch.approvalCount, 3, "approvalCount = 3");
  eq(batch.planRefs.length, 3, "planRefs has 3 entries");
  truthy(batch.data.startsWith(ERC20_APPROVE_SELECTOR), "data starts with approve selector");
  truthy(batch.data.length > 200, "data is substantial");
  truthy(batch.gasEstimate > 0, "gasEstimate provided");
  truthy(batch.description.includes("Bulk revoke"), "description has prefix");
}

console.log("[buildBulkRevokeMulticall — multi-chain grouping]");
{
  const approvals = [
    { chainId: 1, tokenAddress: "0xUSDC", tokenSymbol: "USDC", spender: "0xs1" }, // Ethereum
    { chainId: 137, tokenAddress: "0xUSDC", tokenSymbol: "USDC", spender: "0xs2" }, // Polygon
    { chainId: 42161, tokenAddress: "0xUSDC", tokenSymbol: "USDC", spender: "0xs3" }, // Arbitrum
  ];
  const result = buildBulkRevokeMulticall(approvals);
  eq(result.batches.length, 3, "3 batches (different chains)");
  eq(result.totalSaved, 0, "no savings (each batch = 1 call)");
  truthy(result.batches[0].chainId === 1, "batch[0] = Ethereum");
  truthy(result.batches[1].chainId === 137, "batch[1] = Polygon");
  truthy(result.batches[2].chainId === 42161, "batch[2] = Arbitrum");
}

console.log("[buildBulkRevokeMulticall — multi-token grouping]");
{
  const approvals = [
    { chainId: 1, tokenAddress: "0xUSDC", tokenSymbol: "USDC", spender: "0xs1" },
    { chainId: 1, tokenAddress: "0xUSDT", tokenSymbol: "USDT", spender: "0xs2" },
    { chainId: 1, tokenAddress: "0xDAI", tokenSymbol: "DAI", spender: "0xs3" },
  ];
  const result = buildBulkRevokeMulticall(approvals);
  eq(result.batches.length, 3, "3 batches (different tokens)");
  eq(result.totalSaved, 0, "no savings");
}

console.log("[buildBulkRevokeMulticall — NFT approvals]");
{
  const approvals = [
    { chainId: 1, collection: "0xNFT1", collectionName: "BAYC", operator: "0xop1", operatorName: "OpenSea" },
    { chainId: 1, collection: "0xNFT1", collectionName: "BAYC", operator: "0xop2", operatorName: "Blur" },
  ];
  const result = buildBulkRevokeMulticall(approvals);
  eq(result.batches.length, 1, "1 batch for NFT collection");
  truthy(result.batches[0].data.startsWith(NFT_SET_APPROVAL_FOR_ALL_SELECTOR), "data starts with setApprovalForAll");
  eq(result.batches[0].approvalCount, 2, "2 NFT approvals");
  truthy(result.batches[0].description.includes("NFT"), "description mentions NFT");
}

console.log("[buildBulkRevokeMulticall — custom multicall address]");
{
  const customMC = "0x1234567890123456789012345678901234567890";
  const approvals = [
    { chainId: 1, tokenAddress: "0xUSDC", spender: "0xs1" },
  ];
  const result = buildBulkRevokeMulticall(approvals, { multicallAddress: customMC });
  eq(result.batches[0].to, customMC, "uses custom multicall address");
}

console.log("[buildBulkRevokeMulticall — mixed token types]");
{
  const approvals = [
    { chainId: 1, tokenAddress: "0xUSDC", spender: "0xs1" },  // ERC20
    { chainId: 1, tokenAddress: "0xNFT", spender: "0xs2" },  // ERC721 (treated as ERC20 since no collection field)
    { chainId: 1, collection: "0xNFT2", operator: "0xs3" },   // NFT via collection
  ];
  const result = buildBulkRevokeMulticall(approvals);
  eq(result.batches.length, 3, "3 batches (different token addresses)");
  // First two use approve, third uses setApprovalForAll
  truthy(result.batches[0].data.startsWith(ERC20_APPROVE_SELECTOR), "batch[0] is approve");
  truthy(result.batches[1].data.startsWith(ERC20_APPROVE_SELECTOR), "batch[1] is approve");
  truthy(result.batches[2].data.startsWith(NFT_SET_APPROVAL_FOR_ALL_SELECTOR), "batch[2] is setApprovalForAll");
}

console.log("[buildBulkRevokeMulticall — missing fields skipped]");
{
  // Approval without tokenAddress should be skipped
  const approvals = [
    { chainId: 1, spender: "0xs1" },  // no token
    { chainId: 1, tokenAddress: "0xUSDC", spender: "0xs2" },  // valid
  ];
  const result = buildBulkRevokeMulticall(approvals);
  eq(result.batches.length, 1, "only valid approval processed");
  eq(result.batches[0].approvalCount, 1, "1 approval in batch");
}

console.log("[buildBulkRevokeMulticall — summary message]");
{
  const approvals = [
    { chainId: 1, tokenAddress: "0xUSDC", spender: "0xs1" },
    { chainId: 1, tokenAddress: "0xUSDC", spender: "0xs2" },
    { chainId: 1, tokenAddress: "0xUSDC", spender: "0xs3" },
  ];
  const result = buildBulkRevokeMulticall(approvals);
  truthy(result.summary.includes("1 transaction"), "summary mentions 1 transaction");
  truthy(result.summary.includes("instead of 3"), "summary mentions 3 originals");
  truthy(result.summary.includes("saves 2"), "summary mentions savings");
}

console.log("[buildBulkRevokeMulticall — gas estimate scaling]");
{
  const approvals1 = [
    { chainId: 1, tokenAddress: "0xT", spender: "0xs1" },
  ];
  const approvals5 = [
    { chainId: 1, tokenAddress: "0xT", spender: "0xs1" },
    { chainId: 1, tokenAddress: "0xT", spender: "0xs2" },
    { chainId: 1, tokenAddress: "0xT", spender: "0xs3" },
    { chainId: 1, tokenAddress: "0xT", spender: "0xs4" },
    { chainId: 1, tokenAddress: "0xT", spender: "0xs5" },
  ];
  const r1 = buildBulkRevokeMulticall(approvals1);
  const r5 = buildBulkRevokeMulticall(approvals5);
  truthy(r5.batches[0].gasEstimate > r1.batches[0].gasEstimate, "more calls = more gas");
  // Formula: 30k base + 50k*N + 10k
  eq(r1.batches[0].gasEstimate, 90000, "1 call = 90k gas");
  eq(r5.batches[0].gasEstimate, 290000, "5 calls = 290k gas");
}

console.log("[buildBulkRevokeMulticall — calldata contains spender addresses]");
{
  const spender = "0x1234567890123456789012345678901234567890";
  const approvals = [
    { chainId: 1, tokenAddress: "0xUSDC", spender },
  ];
  const result = buildBulkRevokeMulticall(approvals);
  // The spender should appear in the calldata (left-padded to 32 bytes)
  const paddedSpender = "000000000000000000000000" + spender.slice(2).toLowerCase();
  truthy(result.batches[0].data.toLowerCase().includes(paddedSpender), "calldata contains padded spender address");
  // Should also contain zero amount
  truthy(result.batches[0].data.includes("0000000000000000000000000000000000000000000000000000000000000000"), "calldata contains zero amount");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Bulk multicall working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
