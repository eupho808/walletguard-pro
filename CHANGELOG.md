# Changelog

All notable changes to WalletGuard Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
