// test-revoke.js - Smoke test for lib/revoke-generator.js
//
// Run with:  node test-revoke.js
//
// lib/revoke-generator.js is a pure module (no chrome.*, no DOM, no fetch).
// We can import it directly via Node ESM. Tests cover:
//
//   1. Constants: known selectors + zero word.
//   2. padAddress: valid + invalid inputs.
//   3. buildERC20RevokeCalldata: selector + 64-byte args + checksum.
//   4. buildNFT721RevokeCalldata: selector + 64-byte args + checksum.
//   5. buildERC20RevokeTx: full plan shape for an approval object.
//   6. buildNFT721RevokeTx: full plan shape for an NFT approval.
//   7. buildRevokeTx: auto-detection of ERC-20 vs NFT.
//   8. buildRevokeBatch: mixed array handling.
//   9. groupPlansByChain: grouping logic.
//  10. Edge cases: empty arrays, invalid addresses, missing fields.

import {
  ERC20_APPROVE_SELECTOR,
  NFT_SET_APPROVAL_FOR_ALL_SELECTOR,
  ZERO_WORD,
  padAddress,
  buildERC20RevokeCalldata,
  buildNFT721RevokeCalldata,
  buildERC20RevokeTx,
  buildNFT721RevokeTx,
  buildRevokeTx,
  buildRevokeBatch,
  groupPlansByChain
} from "./lib/revoke-generator.js";

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

// ---------- Constants ----------

console.log("\n[static: constants]");

check("ERC20_APPROVE_SELECTOR = 0x095ea7b3",
                                      ERC20_APPROVE_SELECTOR === "0x095ea7b3");
check("NFT_SET_APPROVAL_FOR_ALL_SELECTOR = 0xa22cb465",
                                      NFT_SET_APPROVAL_FOR_ALL_SELECTOR === "0xa22cb465");
check("ZERO_WORD is 64 hex zeros",  ZERO_WORD === "0x" + "0".repeat(64));
check("ZERO_WORD length",            ZERO_WORD.length === 66); // 0x + 64

// ---------- padAddress ----------

console.log("\n[padAddress]");

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const padded = padAddress(USDC);
check("pads lowercase 0x address",   padded === "0x" + "0".repeat(24) + USDC.slice(2));
check("padded result is 66 chars",   padded.length === 66);

const mixedCase = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
check("normalises to lowercase",     padAddress(mixedCase) === padAddress(USDC));
check("strips 0x prefix if present", padAddress(USDC.slice(2)) === padded);

{
  let threw = false;
  try { padAddress("0x123"); } catch { threw = true; }
  check("rejects too-short address",  threw);
}
{
  let threw = false;
  try { padAddress("not-an-address"); } catch { threw = true; }
  check("rejects non-hex string",     threw);
}
{
  let threw = false;
  try { padAddress(123); } catch { threw = true; }
  check("rejects non-string input",   threw);
}
{
  let threw = false;
  try { padAddress("0x" + "z".repeat(40)); } catch { threw = true; }
  check("rejects non-hex chars",      threw);
}

// ---------- ERC-20 calldata ----------

console.log("\n[buildERC20RevokeCalldata]");

const SPENDER = "0x71c7656ec7ab88b098defb751b7401b5f6d14731";
const erc20Data = buildERC20RevokeCalldata(SPENDER);
check("starts with ERC-20 selector", erc20Data.startsWith(ERC20_APPROVE_SELECTOR));
check("selector is 10 chars",        ERC20_APPROVE_SELECTOR.length === 10);
check("total calldata is 138 chars", erc20Data.length === 138); // 10 + 64 + 64
check("args part has 128 hex chars", erc20Data.slice(10).length === 128);
check("spender is left-padded",      erc20Data.includes("0".repeat(24) + SPENDER.slice(2).toLowerCase()));
check("amount arg is 64 zeros",      erc20Data.endsWith("0".repeat(64)));

// ---------- NFT calldata ----------

console.log("\n[buildNFT721RevokeCalldata]");

const OPERATOR = "0x1e0049783f008a0085193e00003d00cd54003c71";
const nftData = buildNFT721RevokeCalldata(OPERATOR);
check("starts with NFT selector",    nftData.startsWith(NFT_SET_APPROVAL_FOR_ALL_SELECTOR));
check("NFT selector is 10 chars",    NFT_SET_APPROVAL_FOR_ALL_SELECTOR.length === 10);
check("total calldata is 138 chars", nftData.length === 138);
check("operator is left-padded",     nftData.includes("0".repeat(24) + OPERATOR.slice(2).toLowerCase()));
check("approved arg is 64 zeros",    nftData.endsWith("0".repeat(64)));

// ERC-20 and NFT calldata must differ for same address (different selectors).
check("ERC-20 != NFT calldata",
      buildERC20RevokeCalldata(SPENDER) !== buildNFT721RevokeCalldata(SPENDER));

// ---------- buildERC20RevokeTx ----------

console.log("\n[buildERC20RevokeTx]");

const sampleERC20 = {
  token: USDC,
  tokenName: "USD Coin",
  tokenSymbol: "USDC",
  tokenDecimals: 6,
  tokenType: "ERC-20",
  spender: SPENDER,
  spenderName: null,
  allowanceRaw: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  allowanceFmt: "Unlimited",
  isUnlimited: true,
  chainId: 1,
  chainName: "Ethereum"
};

{
  const plan = buildERC20RevokeTx(sampleERC20);
  check("kind = ERC-20",                plan.kind === "ERC-20");
  check("chainId preserved",            plan.chainId === 1);
  check("chainName preserved",          plan.chainName === "Ethereum");
  check("to = token address",           plan.to === USDC);
  check("value = 0x0",                  plan.value === "0x0");
  check("data = 138 chars",             plan.data.length === 138);
  check("data has ERC-20 selector",     plan.data.startsWith(ERC20_APPROVE_SELECTOR));
  check("description present",          typeof plan.description === "string" && plan.description.length > 0);
  check("description mentions symbol",  plan.description.includes("USDC"));
  check("description mentions spender", plan.description.includes("71c7") || plan.description.includes(SPENDER.slice(2, 6)));
  check("isUnlimited preserved",        plan.isUnlimited === true);
  check("allowanceFmt preserved",       plan.allowanceFmt === "Unlimited");
  check("tokenSymbol preserved",        plan.tokenSymbol === "USDC");
}

// Uppercase / mixed-case inputs should normalise.
{
  const upper = { ...sampleERC20, token: USDC.toUpperCase(), spender: SPENDER.toUpperCase() };
  const plan = buildERC20RevokeTx(upper);
  check("uppercase token normalised",   plan.to === USDC);
  check("uppercase spender normalised", plan.spender === SPENDER);
}

// Invalid token.
{
  let threw = false;
  try { buildERC20RevokeTx({ ...sampleERC20, token: "0xnope" }); }
  catch { threw = true; }
  check("rejects invalid token address", threw);
}
{
  let threw = false;
  try { buildERC20RevokeTx({ ...sampleERC20, spender: "" }); }
  catch { threw = true; }
  check("rejects empty spender",         threw);
}
{
  let threw = false;
  try { buildERC20RevokeTx(null); }
  catch { threw = true; }
  check("rejects null approval",         threw);
}

// ---------- buildNFT721RevokeTx ----------

console.log("\n[buildNFT721RevokeTx]");

const sampleNFT = {
  collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
  collectionName: "BAYC",
  tokenType: "ERC-721",
  operator: OPERATOR,
  operatorName: "OpenSea",
  chainId: 1,
  chainName: "Ethereum"
};

{
  const plan = buildNFT721RevokeTx(sampleNFT);
  check("kind = NFT",                   plan.kind === "NFT");
  check("chainId preserved",            plan.chainId === 1);
  check("to = collection address",      plan.to === sampleNFT.collection);
  check("data = 138 chars",             plan.data.length === 138);
  check("data has NFT selector",        plan.data.startsWith(NFT_SET_APPROVAL_FOR_ALL_SELECTOR));
  check("value = 0x0",                  plan.value === "0x0");
  check("spender = operator",           plan.spender === OPERATOR);
  check("spenderName = operatorName",   plan.spenderName === "OpenSea");
  check("tokenSymbol = collectionName", plan.tokenSymbol === "BAYC");
  check("allowanceFmt = Full custody",  plan.allowanceFmt === "Full custody");
  check("isUnlimited = true",           plan.isUnlimited === true);
}

// ERC-1155 same selector, should work too.
{
  const plan = buildNFT721RevokeTx({ ...sampleNFT, tokenType: "ERC-1155" });
  check("ERC-1155 works identically",   plan.kind === "NFT" && plan.data.startsWith(NFT_SET_APPROVAL_FOR_ALL_SELECTOR));
}

// ---------- buildRevokeTx (auto-detect) ----------

console.log("\n[buildRevokeTx: auto-detect]");

check("detects ERC-20 by token+spender",
      buildRevokeTx(sampleERC20).kind === "ERC-20");
check("detects NFT by collection field",
      buildRevokeTx(sampleNFT).kind === "NFT");
check("detects ERC-721 by tokenType",
      buildRevokeTx({ ...sampleNFT, tokenType: "ERC-721" }).kind === "NFT");
check("detects ERC-1155 by tokenType",
      buildRevokeTx({ ...sampleNFT, tokenType: "ERC-1155" }).kind === "NFT");
check("returns null for empty object", buildRevokeTx({}) === null);
check("returns null for null input",   buildRevokeTx(null) === null);

// ---------- buildRevokeBatch ----------

console.log("\n[buildRevokeBatch]");

{
  const result = buildRevokeBatch([sampleERC20, sampleNFT]);
  check("batch: plans.length = 2",     result.plans.length === 2);
  check("batch: errors empty",         result.errors.length === 0);
  check("batch: first plan is ERC-20", result.plans[0].kind === "ERC-20");
  check("batch: second plan is NFT",   result.plans[1].kind === "NFT");
}

{
  const result = buildRevokeBatch([]);
  check("empty batch: no plans",       result.plans.length === 0);
  check("empty batch: no errors",      result.errors.length === 0);
}

{
  const result = buildRevokeBatch([sampleERC20, { foo: "bar" }, sampleNFT, null]);
  check("batch with garbage: 2 plans",  result.plans.length === 2);
  check("batch with garbage: 2 errors", result.errors.length === 2);
}

// ---------- groupPlansByChain ----------

console.log("\n[groupPlansByChain]");

{
  const plans = [
    buildERC20RevokeTx({ ...sampleERC20, chainId: 1, chainName: "Ethereum" }),
    buildERC20RevokeTx({ ...sampleERC20, token: "0x6b175474e89094c44da98b954eedeac495271d0f", tokenSymbol: "DAI", chainId: 1, chainName: "Ethereum" }),
    buildNFT721RevokeTx({ ...sampleNFT, chainId: 137, chainName: "Polygon" })
  ];
  const groups = groupPlansByChain(plans);
  check("group: 2 chains",            groups.length === 2);
  check("group: sorted by chainId",   groups[0].chainId === 1 && groups[1].chainId === 137);
  check("group: Ethereum count = 2",  groups[0].count === 2);
  check("group: Polygon count = 1",   groups[1].count === 1);
  check("group: Ethereum has plans",  Array.isArray(groups[0].plans) && groups[0].plans.length === 2);
}

{
  const groups = groupPlansByChain([]);
  check("group: empty input",         Array.isArray(groups) && groups.length === 0);
}

// ---------- end-to-end calldata sanity ----------

console.log("\n[e2e: calldata sanity for real-world addresses]");

// A real USDC + Uniswap V3 approval should produce:
//   0x095ea7b3
//     + 24 zeros + 68b3465833fb72a70ecdf485e0e4c7bd8665fc45 (Uniswap V3 Router)
//     + 64 zeros (amount = 0)
{
  const data = buildERC20RevokeCalldata("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45");
  const expected = "0x095ea7b3" + "0".repeat(24) + "68b3465833fb72a70ecdf485e0e4c7bd8665fc45" + "0".repeat(64);
  check("USDC revoke matches expected hex", data === expected);
}

// A real BAYC + OpenSea setApprovalForAll revoke should produce:
//   0xa22cb465
//     + 24 zeros + 1e0049783f008a0085193e00003d00cd54003c71 (OpenSea Seaport 1.5)
//     + 64 zeros (approved = false)
{
  const data = buildNFT721RevokeCalldata("0x1e0049783f008a0085193e00003d00cd54003c71");
  const expected = "0xa22cb465" + "0".repeat(24) + "1e0049783f008a0085193e00003d00cd54003c71" + "0".repeat(64);
  check("BAYC revoke matches expected hex", data === expected);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
