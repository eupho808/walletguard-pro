# walletguard-core

**Open-source Web3 transaction security library** — the same code that powers [WalletGuard Pro](https://github.com/eupho808/walletguard-pro), available as a standalone npm package for any wallet, dApp, or backend service.

> MIT licensed. Zero dependencies. 478 tests passing. Battle-tested in production with 9-chain support.

## Why walletguard-core?

- **Vendor-neutral.** Use with MetaMask, Rabby, Frame, Coinbase Wallet, Phantom, Zerion, OKX, Trust — any EIP-1193 wallet.
- **Zero API key required.** All analysis happens locally in your code. No backend, no telemetry, no rate limits.
- **Production-grade.** The same library that powers the [WalletGuard Pro browser extension](https://chromewebstore.google.com/detail/walletguard-pro) used by real users on 9 chains.
- **Battle-tested.** 478 automated tests across 8 suites, comprehensive threat model, weekly published threat intelligence.
- **MIT licensed.** Fork it, modify it, ship it in your wallet. No CLA, no BS.

## What it does

| Module | What it does |
|---|---|
| `decoder` | Decodes 200+ function selectors into human-readable form (ERC-20/721/1155, Multicall, Universal Router, Permit, Permit2, bridges, etc.) |
| `risk` | Scores a transaction 0-100 with explicit factor breakdown — no black-box "DANGER" labels |
| `typosquat` | Detects typosquatted domains (Levenshtein + homoglyph) and subdomain impersonation |
| `multicall` | Decodes nested Multicall V1/V2/V3 bundles with per-subcall risk analysis |
| `universal-router` | Decodes Uniswap Universal Router commands (all 17 opcodes, 0x00–0x10) |
| `simulator` | Asset Diff Engine — produces "OUT: 0.5 ETH, IN: 100 USDC" preview |
| `revoke` | Generates `setApproval(spender, 0)` transactions for one-click revoke |

## Install

```bash
npm install walletguard-core
```

## Usage

### Quick start — analyze any transaction

```javascript
import { analyzeTransaction } from "walletguard-core";

const tx = {
  from: "0x...",
  to: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2 Router
  data: "0x095ea7b3...",
  value: "0x0",
  chainId: 1
};

const result = analyzeTransaction(tx, {
  currentDomain: "uniswap.org",  // user's current site
  trustedDomains: ["uniswap.org", "opensea.io"],
  scammerAddresses: ["0xab5801a7d398351b8be11c439e05c5b3259aec9b"]
});

console.log(result);
// {
//   decoded: { method: "approve", spender: "0x...", amount: "UNLIMITED", isUnlimited: true },
//   risk: { score: 35, level: "high", factors: [
//     { name: "unlimited-allowance", penalty: -20, reason: "..." },
//     { name: "unknown-contract",   penalty: -25, reason: "..." }
//   ]},
//   simulation: { lines: [...], summary: "..." }
// }
```

### Module-by-module

```javascript
// Calldata decoding
import { decodeCalldata } from "walletguard-core/decoder";
const decoded = decodeCalldata({ to, data, value });

// Risk scoring
import { scoreRisk } from "walletguard-core/risk";
const risk = scoreRisk({ decoded, tx, domain, spenderAddress });

// Phishing/typosquat detection
import { checkTyposquat, checkSubdomainImpersonation } from "walletguard-core/typosquat";
const typoResult = checkTyposquat("uniswopp.org");
// → { isTyposquat: true, distance: 1, target: "uniswap.org" }

// Revoke generation
import { generateRevoke } from "walletguard-core/revoke";
const revokeTx = generateRevoke({
  tokenAddress: "0x...",
  spender: "0x...",
  chainId: 1
});
// → { to, data, value } ready to send to wallet
```

### Use in a wallet UI

```javascript
import { analyzeTransaction } from "walletguard-core";

walletProvider.on("sendTransaction", async (tx) => {
  const result = analyzeTransaction(tx, { currentDomain: window.location.hostname });
  if (result.risk.score < 40) {
    showWarningOverlay(result);
    const confirmed = await askUser("This transaction is HIGH RISK. Continue?", result);
    if (!confirmed) throw new Error("User rejected high-risk tx");
  }
});
```

### Use in a backend (approval scanner)

```javascript
import { generateRevoke } from "walletguard-core/revoke";

// For each approval found:
const revokeTx = generateRevoke({
  tokenAddress: approval.token,
  spender: approval.spender,
  chainId: approval.chainId
});

// Queue it for the user's next interaction with the wallet
revokeQueue.push(revokeTx);
```

## API reference

### `analyzeTransaction(tx, context)`

End-to-end analysis. Returns `{ decoded, risk, simulation, timestamp }`.

**`tx`** (required):
- `to` — destination address
- `data` — calldata (hex string)
- `value` — ETH value (hex string or bigint)
- `from` — sender (optional but recommended)
- `chainId` — chain ID (default: 1)

**`context`** (optional):
- `currentDomain` — host the user is currently on (for phishing check)
- `trustedDomains` — array of trusted domain allowlist
- `scammerAddresses` — array of known-bad addresses

### Modules

All modules are also exported individually for fine-grained use:

- `walletguard-core/decoder` — `decodeCalldata`, `decodeMulticall`, `getMethodId`, `formatTokenAmount`, `shortAddr`
- `walletguard-core/risk` — `scoreRisk`, `RISK_FACTORS`
- `walletguard-core/typosquat` — `checkTyposquat`, `checkSubdomainImpersonation`, `TRUSTED_DOMAINS`
- `walletguard-core/multicall` — `decodeMulticallBundle`, `decodeMulticallV3`
- `walletguard-core/universal-router` — `decodeUniversalRouterCommand`, `UNIVERSAL_ROUTER_COMMANDS`
- `walletguard-core/simulator` — `simulate`, `diffApprove`, `diffTransfer`, `diffSwap`
- `walletguard-core/revoke` — `generateRevoke`, `generateRevokeAll`

## Supported chains

Mainnets: Ethereum (1), Optimism (10), BNB Chain (56), Polygon (137), Fantom (250), Base (8453), Arbitrum (42161), Avalanche C-Chain (43114)
Testnets: Sepolia (11155111)

## Comparison with alternatives

| | walletguard-core | Blockaid SDK | Pocket Universe API |
|---|---|---|---|
| License | MIT | Proprietary | Proprietary (acquired by MetaMask) |
| Cost | Free | Paid | N/A (no longer available) |
| API key required | No | Yes | Yes |
| Telemetry | None | Required | Required |
| Runs offline | Yes | No | No |
| Approval scanner + revoke | Yes | No | No |
| Multilingual threat intel | Yes | No | No |
| Self-hostable | Yes | No | No |

## Real-world usage

Powers the [WalletGuard Pro browser extension](https://github.com/eupho808/walletguard-pro), which has been downloaded on Chrome Web Store and Firefox AMO. Used by individual users to protect their Web3 wallets on 9 chains.

## Project structure

```
walletguard-core/
├── src/
│   ├── index.js               # Public API
│   ├── decoder.js             # Calldata decoder
│   ├── risk-engine.js         # Risk scoring
│   ├── typosquatting.js       # Domain checks
│   ├── multicall-decoder.js   # Multicall bundles
│   ├── universal-router.js    # Universal Router
│   ├── simulator.js           # Asset diff
│   └── revoke-generator.js    # Revoke calldata
├── test.js                    # 478 tests
├── package.json
└── README.md
```

## Development

```bash
# Build (in this monorepo, sources are kept in sync with /lib/)
cd packages/walletguard-core
npm install
npm test              # 478 tests
npm run build         # produces dist/
```

## License

MIT — same as the parent WalletGuard Pro project. Use it anywhere, including proprietary wallets.

## Links

- **GitHub:** [github.com/eupho808/walletguard-pro](https://github.com/eupho808/walletguard-pro)
- **Browser extension:** Chrome Web Store · Firefox AMO
- **Threat intel:** [github.com/eupho808/walletguard-pro/blob/main/THREATS.md](https://github.com/eupho808/walletguard-pro/blob/main/THREATS.md)
- **Threat model:** [THREAT_MODEL.md](https://github.com/eupho808/walletguard-pro/blob/main/THREAT_MODEL.md)
- **Self-audit:** [SELF_AUDIT.md](https://github.com/eupho808/walletguard-pro/blob/main/SELF_AUDIT.md)

---

*Built by [eupho808](https://github.com/eupho808) and contributors. MIT licensed.*
