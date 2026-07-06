// test-explain.js

import { explainTransaction } from "./lib/explain.js";

let passed = 0, failed = 0;
function ok(n) { console.log(`  ok  ${n}`); passed++; }
function eq(a, e, n) { if (JSON.stringify(a) === JSON.stringify(e)) ok(n); else { console.log(`  FAIL ${n}: expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`); failed++; } }
function truthy(v, n) { if (v) ok(n); else { console.log(`  FAIL ${n}: expected truthy got ${v}`); failed++; } }

// ---- explainTransaction: empty / invalid ----
eq(explainTransaction(null), "Could not analyze this transaction.", "null → fallback");
eq(explainTransaction({}), "This transaction could not be analysed in detail.", "empty analysis → generic sentence");

// ---- explainTransaction: simple ERC-20 transfer ----
const t1 = explainTransaction({
  target: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  diff: { lines: [{ symbol: "USDC", sent: "100", received: "0" }] },
  risk: { trustScore: 92 }
});
truthy(t1.includes("transfer"), "transfer action inferred");
truthy(t1.includes("USDC"), "USDC mentioned");
truthy(t1.includes("100"), "amount mentioned");
truthy(t1.includes("0xa0b8…eb48") || t1.includes("a0b869"), "target shortened");

// ---- explainTransaction: swap ----
const t2 = explainTransaction({
  target: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
  diff: { lines: [{ symbol: "USDC", sent: "100", received: "0.05" }] },
  methodInfo: { name: "swap" },
  risk: { trustScore: 88 }
});
truthy(t2.includes("swap"), "swap method mentioned");
truthy(t2.includes("USDC"), "USDC mentioned");

// ---- explainTransaction: address book label ----
const t3 = explainTransaction({
  target: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  diff: { lines: [{ symbol: "USDC", sent: "100", received: "0" }] },
  risk: { trustScore: 80 }
}, { addressBook: { "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { label: "USDC Contract" } } });
truthy(t3.includes("USDC Contract"), "address book label used");

// ---- explainTransaction: EIP-7702 critical ----
const t4 = explainTransaction({
  target: "0xdrainer",
  diff: { lines: [] },
  risk: { trustScore: 10 },
  eip7702Result: { riskLevel: "critical" }
});
truthy(t4.includes("EIP-7702"), `EIP-7702 critical called out (got: ${t4.slice(0, 200)})`);
truthy(t4.includes("delegate") || t4.includes("drain"), "explains the consequence");

// ---- explainTransaction: session key critical ----
const t5 = explainTransaction({
  target: "0xapp",
  diff: { lines: [] },
  risk: { trustScore: 15 },
  sessionKeyResult: { riskLevel: "critical" }
});
truthy(t5.includes("session key") || t5.includes("Session key"), "session key risk mentioned");

// ---- explainTransaction: multi-asset batch ----
const t6 = explainTransaction({
  target: "0xuniswap",
  diff: { lines: [
    { symbol: "USDC", sent: "100", received: "0" },
    { symbol: "DAI", sent: "100", received: "0" },
    { symbol: "WETH", sent: "0", received: "0.05" }
  ]},
  risk: { trustScore: 70 }
});
truthy(t6.includes("batch") || t6.includes("3 asset"), "batch mentioned");

// ---- explainTransaction: high risk score includes warning ----
const t7 = explainTransaction({
  target: "0xevil",
  diff: { lines: [{ symbol: "ETH", sent: "5", received: "0" }] },
  risk: { trustScore: 25 }
});
truthy(t7.includes("risk score") || t7.includes("score"), "low score generates warning");
truthy(t7.includes("25") || t7.includes("/100"), "score number shown");

// ---- explainTransaction: capabilities ----
const t8 = explainTransaction({
  target: "0xevil",
  diff: { lines: [] },
  capabilities: ["transfer all your NFTs", "transfer all your tokens", "set approvals"],
  risk: { trustScore: 5 }
});
truthy(t8.includes("transfer all your NFTs"), "first capability mentioned");
truthy(t8.includes("set approvals") || t8.includes("other"), "additional capabilities summarized");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
