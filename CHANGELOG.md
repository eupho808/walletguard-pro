# Changelog

All notable changes to WalletGuard Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **+3 chains**: BNB Chain (56), Avalanche C-Chain (43114), and Fantom Opera (250) added to the multi-chain approval scanner. Coverage expanded from 6 to 9 chains.
- Per-chain lookback caps tuned to block times: BNB 3M blocks (~1 year, 3s/block), Avalanche 5M (~4 months, ~2s/block), Fantom 5M (~3 months, ~1.5s/block).
- 8 new multi-chain tests: BNB (56), Fantom (250), Avalanche (43114) RPC + lookback + CHAIN_INFO coverage. Total now 184 across 4 suites.

### Changed
- `host_permissions` in `manifest.json` and `manifest.firefox.json` extended with three new public RPC endpoints: `bsc-dataseed.bnbchain.org`, `fantom.publicnode.com`, `api.avax.network`.
- UI: Settings chain chips updated from 6 to 9 entries (added BNB Chain, Fantom, Avalanche).
- Docs: README, STORE_LISTING, popup-mock, landing page all updated to mention 9 chains and 184 tests.

## [Unreleased — Tier 2]

### Added
- **Auto-revoke calldata generator**: `lib/revoke-generator.js` generates `approve(spender, 0)` (ERC-20) and `setApprovalForAll(operator, false)` (ERC-721 / ERC-1155) calldata for any risky approval. Functions: `buildERC20RevokeCalldata`, `buildNFT721RevokeCalldata`, `buildERC20RevokeTx`, `buildNFT721RevokeTx`, `buildRevokeTx` (auto-detect), `buildRevokeBatch`, `groupPlansByChain`.
- **Revoke UI in popup**: red Revoke button on every risky approval card (critical / high / medium). Click opens a modal with chain + to + value + calldata, a "Copy calldata" button (copies JSON envelope `{chainId, to, data, value}` to clipboard), and a deep link to revoke.cash.
- **`build.js` second bundle target**: `popup-bundle.js` — same lib modules wrapped as `window.WG_POPUP_LIB.<moduleName>` (camelCased: `WG_POPUP_LIB.revokeGenerator`). Lets the popup page (an isolated extension page that can't `import` from `lib/*`) share logic with content.js without duplication.
- **Self-audit document**: `SELF_AUDIT.md` documents the v1.5.x security review — methodology, 5 Critical/High bugs fixed (decodeAggregate3 hex-bytes mismatch, setApprovalForAll bool offset, typosquat case bypass, address normalization, approve selector collision), 4 Medium bugs fixed (eth_getLogs negative fromBlock, 0x-prefix allowance regex, Alchemy response shape, operator display name), 5 Low issues fixed, 9 Info / residual items scheduled for v1.6.0 or future.
- 76 new tests in `test-revoke.js` covering selectors, calldata byte-exact matches for real USDC/Uniswap-V3 and BAYC/OpenSea addresses, plan shape validation, batch + grouping logic, edge cases. Total now 260 across 5 suites.

### Changed
- `popup.html` loads `popup-bundle.js` before `popup.js`; new `#revoke-modal` element with backdrop / panel / tx-data details / Close + Copy buttons.
- `popup.js` gains event delegation on approval and NFT lists, modal show/hide, copy-to-clipboard with textarea fallback, Escape-key close.
- `popup.css` adds revoke button (red-tinted) + modal styles (panel, details/summary tx data, accent footer).
- README "Security" section now cross-references `SELF_AUDIT.md` alongside `THREAT_MODEL.md` and `SECURITY.md`.

---

## [1.5.0] - 2026-07-05

### Added
- Approval Scanner v1.5.0: NFT collection approvals across 6 chains (`isApprovedForAll` + `getApproved` per collection)
- Multi-chain approval scanner: parallel scanning across Ethereum, Optimism, Polygon, Base, Arbitrum, Sepolia
- Typosquatting detection via Levenshtein distance + eTLD+1 + IDN/homoglyph checks (17 trusted protocols)
- Compound risk rules: unlimited approval + unknown contract = CRITICAL combo (-25)
- Phishing overlay on known-drainer domains + custom blacklist
- Asset Diff Engine: estimated token balance changes per transaction
- Universal Router command decoder (all 17 opcodes 0x00-0x10)
- EIP-712 Permit / Permit2 detection including blind `personal_sign` payloads
- Recursive Multicall V1/V2/V3 decoder (up to 4 levels deep)
- Firefox MV3 manifest ready for AMO submission
- GitHub Pages landing page at eupho808.github.io/walletguard-pro/
- GitHub Actions CI: Node 20, runs `build.js` + 4 test suites on push/PR
- 176 tests across 4 suites (typosquat: 52, integration: 16, multichain: 47, nft: 61)
- Popup dashboard with risk-classified approval list + NFT section
- Settings page: OpenRouter API key (optional), whitelist, blacklist, multi-chain toggle

### Changed
- Bundle strategy: `lib/*` concatenated into single IIFE in `content.js` (Chrome CS cannot use ES modules)
- Risk engine uses weighted scoring with explicit per-factor weights and human-readable reasons

### Security
- MAIN-world RPC bridge restricts to read-only JSON-RPC methods (`READ_ONLY_METHODS` whitelist in `injector.js`)
- `chrome.storage.local` is the only persistent storage (no `localStorage`, cookies, or telemetry)
- Optional OpenRouter integration is **off by default** and only sends the contract address on explicit user action

---

## [1.0.0] - initial internal release

Initial proof-of-concept: basic `window.ethereum.request` interception + risk classification for `eth_sendTransaction` and `approve` calls.
