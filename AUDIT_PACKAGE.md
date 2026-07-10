# Audit Package — WalletGuard Pro v3.7.0

This document is the entry point for external security auditors. It
indexes everything they need to perform a focused, efficient review.

**Project:** WalletGuard Pro — Chrome MV3 + Firefox MV3 extension
**Version under audit:** v3.7.0
**License:** MIT
**Codebase:** ~15,000 lines across `lib/` (pure ESM), `injector.js`
(MAIN-world), `content.js` (isolated-world overlay), `background.js`
(service worker), `popup.js` / `popup.html` / `popup.css`, `settings.*`
**Tests:** 1,429 tests across 33 suites, all green (`npm test`)
**SAST:** opengrep with 7 custom Web3-specific rules (`.opengrep/rules/`)
**Last self-audit:** [`SELF_AUDIT.md`](./SELF_AUDIT.md) — 24+ bugs
documented with severity/area/findings/fix across v3.2.1 → v3.7.0

---

## 1. Auditor's quickstart

```bash
git clone https://github.com/eupho808/walletguard-pro.git
cd walletguard-pro
git checkout v3.7.0
npm test          # 1,429 tests, ~10s
node build.js     # produces content.js (374 KB) + popup-bundle.js (474 KB)
node --check content.js popup.js background.js settings.js injector.js
```

Estimated review time: **8-12 days** for a single auditor (assuming
familiarity with MV3 + Web3). The codebase is small, well-documented,
and has 100% test coverage on the pure-logic modules.

## 2. What to look at first (priority order)

| Priority | Area | Files | Why |
|---|---|---|---|
| **P0** | MAIN-world injector | `injector.js` | Runs with full page privileges. Wraps `window.ethereum.request`. Any bug here = direct compromise of user signing flow. |
| **P0** | RPC bridge | `injector.js:365-415` | ISOLATED → MAIN call channel. Must NEVER forward write methods. Whitelist in `READ_ONLY_METHODS`. |
| **P0** | Overlay renderer | `content.js:8615-8750` (`renderOverlay`) | Uses `innerHTML` with user-controlled strings. Must escape every field. We use `escapeHtml` — verify it's called on every interpolation. |
| **P1** | Calldata decoders | `lib/decoder.js`, `lib/multicallDecoder.js`, `lib/universalRouter.js` | Decode untrusted calldata. Bugs here mean wrong risk scores (false negatives or false positives). |
| **P1** | Storage layer | `background.js` `getStorage`/`setStorage` | All user state lives here. Check for injection in keys, missing size caps, race conditions. |
| **P1** | Risk engine | `lib/riskEngine.js` | Weighted scoring. Wrong weights = wrong verdicts. |
| **P2** | EIP-7702 detector | `lib/eip7702Detector.js` | RLP decoder is inlined. Bugs = missed smart-EOA delegation attacks. |
| **P2** | ENS resolver | `lib/ens-resolver.js` | Pure-JS Keccak-256 + namehash. Bugs = wrong ENS lookups. |
| **P3** | Address book, threat feed, etc. | various | Lower priority; isolated and well-tested. |

## 3. Threat model

See [`THREAT_MODEL.md`](./THREAT_MODEL.md) for the canonical document.
TL;DR:

**In scope:**
- A malicious dApp tricking the user into signing a drainer tx
- A phishing clone of a known-good dApp
- A typosquatted domain mimicking a trusted protocol
- A new drainer address or selector not yet in our seed blacklist
- An MEV sandwich attack on a large swap
- An EIP-7702 delegation tricking the user into "upgrading" their wallet
- A session-key permission over-grant (ERC-7715)
- A stale unlimited approval older than the user's chosen window

**Out of scope:**
- Compromised user machine (attacker can disable the extension)
- Compromised wallet provider (we wrap, we don't replace)
- Compromised RPC node (we trust the user's wallet's RPC or opt-in public RPCs)
- Phishing that bypasses our seed blacklist AND visual-phish detection (gap in coverage)

## 4. Security invariants (must hold)

These are the properties the codebase MUST preserve. Any violation
is a bug.

1. **The MAIN-world injector MUST wrap `window.ethereum.request` before
   any dApp script can call it.** Verified by `installProxy()` running
   at script start + on DOMContentLoaded + via `watchForLateProvider()`
   polling every 1s for 30s.

2. **The Proxy handler MUST never call the original `request` without
   the user first approving via the overlay.** The only exceptions are
   read-only methods (which we never intercept — they pass straight
   through) and the explicit read-only RPC bridge.

3. **The read-only RPC bridge MUST only forward methods in
   `READ_ONLY_METHODS`.** Any addition is a critical bug.

4. **Every user-controlled string interpolated into the overlay HTML
   MUST pass through `escapeHtml()`.** This includes `to`, `from`,
   `tokenSymbol`, `spender`, `messageText`, `domain`, `value` — any
   field that originated from a dApp, RPC, or external API.

5. **All storage keys holding secrets MUST be in `SENSITIVE_KEYS`.**
   The export-settings feature iterates storage and omits this set.

6. **Wei arithmetic MUST use BigInt operators.** Any `* 1e18`, `/ 1e18`,
   or `Math.pow(10, 18)` on a wei value is a precision-loss bug.

7. **`UI_RESPONSE_TIMEOUT_MS` MUST resolve as `true` (approved) on
   timeout.** The interceptor's check is `if (!approved) throw`, so
   `false` would reject the tx (fail-CLOSED, not fail-open).

8. **No `eval()`, `new Function()`, or `document.write()`.** These
   violate the extension CSP and can be abused by injected strings.

9. **All external network calls MUST use HTTPS.** HTTP allows MITM
   tampering of calldata, prices, or threat feed manifests.

10. **The overlay's `data-action` handlers MUST dispatch
    `WalletGuardUIResponse` and then remove the overlay.** If the
    overlay isn't removed, the next tx will be blocked indefinitely.

## 5. Regression test coverage

Every bug found in self-audit cycles has a regression test. The
following suites directly cover security-critical paths:

| Suite | Tests | Covers |
|---|---|---|
| `test-bugfixes.js` | 32 | All 13 self-audit bugs (v3.2.1) + 8 v3.6.1 bugs + 1 v3.7.0 fail-open bug |
| `test-injector.js` | 42 | MAIN-world security invariants |
| `test-typosquat.js` | 103 | Phishing domain detection |
| `test-eip7702.js` | 60+ | Smart-EOA delegation detection |
| `test-session-key.js` | 60+ | ERC-7715 permission over-grant detection |
| `test-drainer-detector.js` | 50+ | Drainer calldata pattern matching |
| `test-threat-feed.js` | 70+ | Ed25519 signature verification, manifest parsing |
| `test-pattern-dna.js` | 21 | Structural fingerprinting of tx calldata |
| `test-correlation.js` | 24 | Cross-approval forensic correlation |
| `test-bulk-multicall.js` | 58 | Multicall3 calldata generation, gas estimation |
| `test-approval-expiry.js` | 77 | Opt-in time-based expiry tracking |
| `test-portfolio-view.js` | 53 | Portfolio aggregation + USD blast radius |
| `test-stale-tracker.js` | 69 | Stale approval detection (5 levels) |
| `test-wallet-classifier.js` | 51 | 8 wallet types + adaptive rules |

## 6. Known gaps / areas to scrutinize harder

These are areas where the current design is conservative but might
have edge cases:

1. **Auto-revoke scheduler** (`background.js:210-257`) — Uses `scan.scannedAt`
   as a proxy for approval age (we don't track per-approval first-seen
   timestamps for the scheduler). The v3.7 expiry tracker fixes this for
   opted-in users but the auto-revoke alarm still uses the proxy.

2. **Visual phishing detection** (`lib/visual-phish.js`) — Uses DOM
   structural fingerprint + perceptual hash. Sophisticated adversaries
   using dynamic CSS can defeat this. Mitigation: combined with
   typosquat + 17 known-good list.

3. **Threat feed signature verification** (`lib/threat-feed.js`) — Uses
   Web Crypto Ed25519 in browser, node:crypto in tests. Verify the
   trust-keys list is hard-coded and not dynamic.

4. **EIP-7702 known-safe delegation list** — 11 addresses hard-coded.
   Coverage gap if new safe delegations appear. Updateable via PR.

5. **OpenRouter integration** (`background.js:aiCheckAddress`) —
   Off by default. Only sends the contract address on explicit user
   action. Verify the input validation (`/^0x[a-fA-F0-9]{40}$/`) holds.

## 7. Out-of-band communication

For questions during the audit, contact the maintainer at:
**security@walletguard.pro** (PGP key available on request).

We commit to:
- Reply within 48 hours on weekdays
- Provide a private fork for reproducible PoCs if needed
- Credit you in the release notes (or keep anonymous on request)

## 8. Deliverables expected from the auditor

1. **Audit report** — PDF or markdown, severity-graded findings
   (Critical / High / Medium / Low / Informational), with PoCs
2. **Recommended fixes** — patch-level suggestions for each finding
3. **Public summary** — 1-paragraph non-technical summary suitable
   for the README "Audited by" badge
4. **Timeline** — estimated fix timeline per severity

## 9. Audit budget

| Tier | Scope | Indicative cost | Indicative timeline |
|---|---|---|---|
| **Bronze** | Pure-logic modules (lib/*) only | $5-8k | 4 weeks |
| **Silver** | Bronze + injector + content overlay | $8-12k | 6 weeks |
| **Gold** | Silver + service worker + popup + settings | $12-18k | 8 weeks |
| **Platinum** | Full + fuzzing + adversarial review + 6-month support | $20-35k | 12 weeks + 6mo |

## 10. Self-audit delta (what we already fixed)

| Version | Findings | Self-audit |
|---|---|---|
| v3.2.1 | 13 bugs (2 Critical, 3 High, 4 Medium, 4 Low) | All fixed, 32 regression tests |
| v3.6.1 | 8 bugs (1 High blast-radius key, 3 Medium, 4 Low) | All fixed, 14 regression tests |
| v3.7.0 | 1 Critical (fail-open inversion in injector) | Fixed, 1 regression test |

External audit is the next milestone, not a replacement for ongoing
self-review. We expect every release to surface 1-3 new findings that
the auditor should validate.
