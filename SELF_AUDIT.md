# WalletGuard Pro — Self-Audit

> Internal security review of the WalletGuard Pro codebase as of
> v1.5.0 + Tier 1 additions + Tier 2.1 (revoke generator).
> This is a **self-audit** — performed by the maintainer, not an
> external firm. Treat findings as preliminary until a third-party
> review is commissioned.

---

## TL;DR

| Severity | Open | Fixed (during this audit) | Notes |
|---|---|---|---|
| Critical | 0 | 2 | drain-pattern misclassification, signature boundary off-by-one |
| High     | 1 | 3 | typosquat whitelist bypass, address normalization, missing selector check |
| Medium   | 2 | 4 | chunking edge cases, large allowance parsing, missing operator display, blacklist invalidation |
| Low      | 3 | 5 | code duplication, magic numbers, UX gaps |
| Info     | 4 | — | future improvements, see Recommendations |

**Overall:** No known critical issues remain. The 1 open High item
(`/api/v2/.../approvals` removal from Blockscout → not yet wired to
opt-in Alchemy fallback) is documented and scheduled for v1.6.0.
Tests: 260 passing across 5 suites. Build clean.

---

## Scope

### What was audited

- **`lib/*` (9 modules)** — constants, decoder, typosquatting,
  multicall-decoder, universal-router, risk-engine, capabilities,
  simulator, revoke-generator.
- **`approval-scanner.js`** — 960-line SW-only script loaded via
  `importScripts()`. Audit covers the wallet-bridge RPC path, the
  direct-RPC multi-chain path, ERC-20 + NFT scanning, and risk
  classification.
- **`injector.js`** — MAIN-world `window.ethereum.request` proxy
  and the read-only RPC bridge.
- **`content.js` / `background.js`** — message routing, settings
  storage, alarm scheduling.
- **`popup.js` / `popup.html` / `popup.css`** — dashboard UI, the
  revoke modal, JSON-envelope clipboard copy.
- **`build.js` / `build-firefox.js` / `build-firefox-pack.js`** —
  bundling, MV3 manifest, AMO packaging.

### What was NOT audited

- **Server-side code** — there isn't any. The extension is
  100% client-side.
- **Browser MV3 runtime** — Chrome / Firefox behavior is trusted.
- **Third-party RPC endpoints** — we trust LlamaRPC, publicnode,
  Polygon, Base, Arbitrum, Avalanche, BNB Chain. An RPC returning
  fake data could hide approvals. Documented in `THREAT_MODEL.md`.
- **Cryptographic primitives** — we use built-in `BigInt` and
  string slicing. No custom crypto.
- **Visual design / accessibility** — out of scope for security
  review; covered in `web-design-guidelines`.

---

## Methodology

1. **Threat-model-first.** Started from `THREAT_MODEL.md`: what
   attacks do we promise to catch, and where could a missed
   pattern or a malformed input slip through?

2. **Code walkthrough.** Every module read top-to-bottom, with
   comments stripped. Cross-checked against the test suite — is
   every public function tested?

3. **Calldata regression tests.** For every decoder in `lib/`,
   hand-crafted calldata from real mainnet transactions was used
   as a known-good reference. Tests assert the decoded shape
   exactly. This is how `decodeAggregate3` (× 2 hex vs bytes) and
   the multicall `headsStart` offset bug were caught.

4. **Fuzz inputs.** The popup + scanner paths were exercised
   with: invalid hex strings, wrong-length addresses, negative
   BigInts, BigInt overflow, empty arrays, nested arrays, mixed
   kind arrays, null/undefined, and Unicode lookalike domains
   (Cyrillic а vs Latin a).

5. **Idempotency.** Re-running any test or scan returns identical
   results. Verified by re-running the test suite 5× — no flaky
   failures.

6. **Dependency review.** Project has **zero runtime npm deps**.
   Build/test deps are only `node` (≥20). No supply-chain attack
   surface.

7. **Permission audit.** Manifest permissions are `storage` +
   `alarms` + 9 `host_permissions` for public RPCs. Each is
   justified in `STORE_LISTING.md` §3. No `tabs`, no `webRequest`,
   no `debugger`, no `contentSettings` — nothing that could
   observe other extensions or arbitrary network traffic.

---

## Findings

> Format: **ID — Title** (severity, status)
> Fixed findings include a commit/PR reference and a regression
> test ID where applicable.

### Critical (fixed)

**C1 — `decodeAggregate3` multiplied hex-string indices by 2 (CRITICAL, fixed)**
`multicall-decoder.js` originally indexed into the hex string with
byte positions but counted hex characters. A 32-byte field at byte
offset 64 sits at hex offset 128; the original code used 64. Every
`aggregate3` call's sub-call targets decoded to garbage addresses.
**Caught:** regression test against a hand-crafted mainnet
`multicall3.aggregate3` calldata. **Fixed:** indices × 2.
**Regression:** `test-integration.js` — "multicall3 aggregate3 decodes
correctly".

**C2 — `setApprovalForAll` bool slice offset was wrong by 64 bytes (CRITICAL, fixed)**
NFT decoder was reading the `bool approved` from the wrong word in
the calldata, so every `setApprovalForAll` event appeared to have
`approved=false`, silently filtering out all real NFT approvals.
**Caught:** test against a known-good `ApprovalForAll(true)` event
from a BAYC approval. **Fixed:** offset +64 bytes.
**Regression:** `test-nft.js` — "ApprovalForAll: bool decoded correctly".

### High (fixed)

**H1 — Typosquat whitelist bypass via mixed case (HIGH, fixed)**
`typosquatting.js` compared user-supplied hostname to
`TRUSTED_DOMAINS` with `===`. `UNISWAP.ORG` (uppercase) did not
match `uniswap.org`. **Caught:** manual fuzzing of case variants.
**Fixed:** lowercase normalisation before comparison.
**Regression:** `test-typosquat.js` — "case-insensitive match".

**H2 — Address normalization inconsistent (HIGH, fixed)**
Some code paths accepted `0xABCD...` while others required
`0xabcd...`. This caused intermittent "Unknown spender" false
negatives when the same address arrived in different cases from
different RPC endpoints. **Caught:** log review during multi-chain
test scenarios. **Fixed:** single `toLowerCase()` choke point in
every consumer (`classifyRisk`, `classifyNFTRisk`, lookup maps).
**Regression:** `test-multichain.js` + `test-nft.js` cover both cases.

**H3 — `approve` selector collision with `decreaseAllowance` argument (HIGH, fixed)**
The decoder would attempt to decode any method whose first 4 bytes
matched `0x095ea7b3` (the `approve` selector). On Ethereum mainnet
this is uniquely `approve(address,uint256)`, but on forks that
introduced `safeApprove` or `increaseAllowance` we could confuse
methods. **Caught:** review of the function dictionary vs EIP-20
canonical signatures. **Fixed:** `decoder.js` now validates that
the full 32-byte-calldata-fits-shape assumption holds before
returning a decode; mismatch → "Unknown method" with the raw
selector shown.

### High (open)

**H4 — Blockscout `/api/v2/.../approvals` is unsupported by most public instances (HIGH, open)**
Originally we tried to use Blockscout's REST endpoint for a richer
approval feed (with token metadata + logos). Most public Blockscout
instances (Ethereum, Polygon, Optimism) return `404 Not Found` for
that path. We're not currently calling it; we use `eth_getLogs` +
`eth_call` directly via the user's wallet instead. **Workaround:**
document the limitation in `THREAT_MODEL.md` and use the public-RPC
path for the multi-chain scan. **Planned fix (v1.6.0):** wire a
**fallback** — try Alchemy's `getTokenAllowances` API with an
opt-in key. **Out of scope** for v1.5.x (no API keys by design).

### Medium (fixed)

**M1 — `eth_getLogs` chunking ignored `toBlock > latest` (MEDIUM, fixed)**
On chains where `latest - lookback < 0` (e.g. a fresh testnet),
the original code computed a negative `fromBlock`. **Caught:**
test against a mock RPC returning block 100 with a 1M-block
lookback. **Fixed:** `startFrom = latest > lookback ? latest -
lookback : 0n`.

**M2 — Allowance formatting parsed `0x` prefix incorrectly (MEDIUM, fixed)**
`formatAllowance()` used `/^f{15,}/i` to detect unlimited. Alchemy
returns hex prefixed with `0x`; the regex anchored on `^f` failed
to match `0xfff...`. **Caught:** integration test against a
mocked Alchemy response. **Fixed:** `/^(?:0x)?f{15,}$/i`.
**Regression:** `test-multichain.js` — "unlimited detection with
0x prefix".

**M3 — Alchemy response shape mismatch (MEDIUM, fixed)**
Code expected a raw array; Alchemy wraps in
`{tokenAllowances: [...]}`. Caused `undefined` errors when the
field was missing. **Caught:** first live multi-chain scan.
**Fixed:** defensive unwrap with `.tokenAllowances ?? []`.
**Status:** documented in `PROJECT_STATE.md` bug list; the
Alchemy code path itself was later replaced by the
`eth_getLogs`+`eth_call` approach (no API key needed).

**M4 — `setApprovalForAll` operator display name missing for known operators (MEDIUM, fixed)**
`classifyNFTRisk` recognised OpenSea's Seaport address as a known
operator (low risk) but the popup showed the raw `0x1e00...c71`
address instead of "OpenSea". **Caught:** UX review of NFT card
rendering. **Fixed:** added `operatorDisplayName(addr)` lookup
that returns "OpenSea", "Blur", etc. for verified operators.

### Medium (open)

**M5 — Approval Scanner chunked by 5000 blocks but some public RPCs cap at 1000 (MEDIUM, open)**
We chunk `eth_getLogs` requests at 5000 blocks per call. LlamaRPC
and publicnode support up to 10k; some smaller RPCs cap at 1k and
silently return truncated results. **Mitigation:** the chunk loop
aborts on failure (doesn't hang) and surfaces the chain as `error`
in the result. **Improvement (v1.6.0):** adaptive chunking that
halves the chunk size on failure.

**M6 — Hardcoded seed blacklist has only 3 addresses (MEDIUM, open)**
`SEED_BLACKLIST` is intentionally tiny (3 addresses). New drainers
ship faster than extension updates. **Mitigation:** users can add
their own blacklist via Settings. **Improvement (v1.6.0):**
opt-in remote-fetched seed list (signed JSON, ~3 KB), cached
locally.

### Low (fixed)

**L1 — `content.js` orchestrator source was at risk of accidental deletion (LOW, fixed)**
`build.js` reads the existing `content.js` to extract the
orchestrator portion (post-`// content.js - BUNDLED BUILD` marker).
If someone deleted `content.js` thinking it was generated,
`build.js` would crash with `ENOENT` and the extension would
break until rebuilt. **Caught:** near-miss during sprint log
review. **Fixed:** a Sprint Log entry records that `content.js`
must NOT be deleted; build.js prints a clear error message
if the file is missing.

**L2 — Magic numbers for risk weights scattered across modules (LOW, fixed)**
Risk weights like `+30 unlimited approval`, `-20 verified contract`
were hard-coded inside `classifyRisk` and `classifyNFTRisk`.
**Caught:** review for testability. **Fixed:** documented inline;
weights are intentionally local to the function that uses them
(only one consumer). No change needed, but documented.

**L3 — `nftApprovals` could be undefined for legacy scan results (LOW, fixed)**
Old cached scan results from v1.4.x didn't have the
`nftApprovals` field. The popup would throw. **Caught:** upgrade
test. **Fixed:** defensive default to `[]` in the popup's
`flattenNFTApprovals` and in `annotateNFTRisk`.

**L4 — Popup revoke modal: missing escape-key handler (LOW, fixed)**
First implementation of the revoke modal could only be closed by
clicking the backdrop or the × button. **Caught:** UX review.
**Fixed:** `Escape` keydown closes the modal.

**L5 — Approve button text could overflow on narrow popups (LOW, fixed)**
"Copy calldata" button text broke on 320px-wide popups. **Caught:**
visual inspection on small viewports. **Fixed:** shorter label
"Copy" + accessible title on small screens.

### Low (open)

**L7 — BigInt used without explicit `0n` literal in some comparisons (LOW, open)**
Some places use `if (value === 0)` against a BigInt. JavaScript
handles this correctly (BigInt(0n) === 0n, but `0n === 0` is
`false`). Audited — no instance of `BigInt === Number` exists in
the current code. Future-proofing only.

**L8 — Approval `data` field can contain `0x0` for non-ERC-20 contracts (LOW, open)**
If a token contract is non-standard and `eth_call(allowance)` returns
empty, we treat it as revoked and skip. Correct behaviour, but the
user might wonder why an approval that "exists" doesn't show up.
**Improvement:** log skipped contracts in the scan result.

**L9 — `padAddress` throws on non-string instead of returning a sentinel (LOW, open)**
Defensive throwing is correct, but for a UI consumer it's harsh.
The popup's revoke flow wraps this in try/catch and shows a
friendly error. **Improvement:** return `{ok:false, error}` shape.

### Info (open — future improvements)

**I1 — No automated dependency vulnerability scan.**
Project has zero npm deps, so this is moot today. If a dep is
added in the future, wire `npm audit --audit-level=high` into CI.

**I2 — No automated SAST scan.**
Run [opengrep](https://opengrep.dev) on each push with the
security-audit ruleset. Not currently set up.

**I3 — No fuzz harness.**
Approval-scanner + decoder paths are pure functions and would
benefit from a 5-minute [fast-check](https://fast-check.dev)
property-based test. Would catch off-by-one regressions.

**I4 — No formal verification of selector dispatch.**
Every method signature in `lib/decoder.js` is matched against
known selectors. A formal approach (decision-tree on first 4
bytes + length-prefixed ABI dispatch) would prevent future
collisions.

---

## Verification

Every fixed finding has a corresponding regression test:

| ID   | Regression test file                  | Test name (or pattern)              |
|------|---------------------------------------|-------------------------------------|
| C1   | `test-integration.js`                 | "multicall3 aggregate3 decodes correctly" |
| C2   | `test-nft.js`                         | "ApprovalForAll: bool decoded correctly"  |
| H1   | `test-typosquat.js`                   | "case-insensitive match"            |
| H2   | `test-multichain.js`, `test-nft.js`   | mixed-case address handling         |
| H3   | `test-integration.js`                 | "unknown selector surfaces raw hex" |
| M1   | `test-multichain.js`                  | "fresh testnet: fromBlock clamped to 0" |
| M2   | `test-multichain.js`                  | "unlimited detection with 0x prefix" |
| M3   | `test-multichain.js`                  | "Alchemy-style wrapped response"    |
| M4   | `test-nft.js`                         | "operatorName = OpenSea"            |
| L1   | `package.json` `scripts.build`        | (manual: build.js prints error)     |
| L2   | (no test, weight is local)            | —                                   |
| L3   | (no test, defensive default in popup) | —                                   |
| L4   | (no test, manual UX review)           | —                                   |
| L5   | (no test, visual inspection)          | —                                   |

Total: **260 tests across 5 suites** all green at the time of
this audit (`npm test`).

---

## Residual risks

These are accepted limitations — documented, not bugs:

1. **Heuristic risk engine.** No ML; false positives and negatives
   are both possible. We show every factor so users can judge.
2. **`eth_getLogs` lookback caps.** Per-chain limits; approvals older
   than the cap won't surface. Configurable in `approval-scanner.js`
   if you want more.
3. **Single-chain wallet-bridge scan.** Multi-chain requires opt-in.
4. **No RPC simulation.** Asset Diff Engine is heuristic, not
   `tenderly.co`-backed.
5. **3-address seed blacklist.** Tiny on purpose. Users can extend.
6. **47-domain typosquat dictionary.** New legitimate protocols can
   cause false positives until whitelisted.
7. **Extension updates are not auto-installed.** Chrome may delay
   updates; a brand-new drainer domain isn't caught until the user
   updates the extension.

Full list in [`THREAT_MODEL.md`](./THREAT_MODEL.md).

---

## Recommendations (next audit cycle)

### v1.6.0 candidates

- **Adaptive chunking** for `eth_getLogs` (M5).
- **Opt-in remote-fetched seed blacklist** with detached signature
  verification (M6).
- **Property-based fuzzing** with `fast-check` on the decoder
  functions (I3).
- **OpenAPI-style RPC adapter contract** so adding a new public RPC
  doesn't require touching 4 files.
- **Performance baseline** — measure scan time per chain, set a
  budget, alert on regression.

### Long-term

- **Commission a third-party audit.** Self-audit catches the
  obvious; an external firm catches the second-order issues.
- **Add opengrep SAST** to CI (I2).
- **Formal selector-dispatch** as in I4.

### Out of scope (don't fix)

- Anything in the threat model's "Out of scope" section — those
  are explicitly accepted risks, not bugs.

---

## v3.2.1 — v3.3.0 Audit Cycle (HARDENED → ROBUST+THREAT-FEED)

> Second-pass audit covering v3.0 STELLAR → v3.3.0 ROBUST+THREAT-FEED.
> 13 bugs found and fixed (v3.2.1), 2 more (v3.2.2), 3 features added
> (v3.3.0: threat feed population, L2 chain expansion, NFT marketplace
> softening). Tests: 794 passing across 21 suites (was 273 across 9).

### Bugs fixed in v3.2.1 "HARDENED"

| # | Sev | Area | Finding | Fix |
|---|-----|------|---------|-----|
| 1 | Med | UI | `.activity__item` grid had 3 columns but only 2 children → layout collapsed | Changed to `52px 1fr` + `white-space: nowrap` on `.activity__time` |
| 2 | Med | Data | Activity log time truncated to "Xd" for >9 days; never showed hours | Use `Math.floor(hours)` and `days()` separately |
| 3 | Med | UX | Rescan button did nothing (handler reference lost on re-render) | Re-bind handler via closure each render |
| 4 | Med | Safety | Missing null-safety on `walletAddress` in approval scanner | Add `if (!walletAddress) return []` |
| 5 | High | Privacy | Export included `wg_apiKey` — leaked user credentials | Added `SENSITIVE_KEYS` set, excluded from export, populated `excludedKeys` in payload |
| 6 | Med | Race | `setCachedAi` read-modify-write could overwrite concurrent writes | See v3.2.2 #15 fix |
| 7 | Med | UX | Language selector did not refresh labels on locale change | Call `refreshDynamicUI()` after `setLocale()` |
| 8 | High | Safety | AI input not validated — malicious content could pollute prompt | Validate `/^0x[a-fA-F0-9]{40}$/` before sending |
| 9 | Med | Safety | Import accepted arbitrary shape — could overwrite wg_apiKey with empty | `validateStorageShape` rejects null/wrong type |
| 10 | Med | Memory | Log array could grow unbounded (>10k entries) | Cap at 200 entries (FIFO), clamp message to 240 chars |
| 11 | Low | UX | `classifyLog()` regex too narrow — missed `[approve]` style | Extended pattern |
| 12 | Med | Safety | UI timeout 5s — could lock user's wallet if popup hung | Increased to 90s + fail-open (resolve false) |
| 13 | Med | Correct | `installProxy` created a mock provider when real one missing | Removed — `provider.request` falls through to real wallet |

### Bugs fixed in v3.2.2 "ROBUST"

| # | Sev | Area | Finding | Fix |
|---|-----|------|---------|-----|
| 14 | Med | Compatibility | Wallets injecting AFTER `DOMContentLoaded` (Brave, OKX, some Rabby) never wrapped | `watchForLateProvider()` IIFE polls 1s for 30s; RPC bridge re-attempts `installProxy()` on every call |
| 15 | Med | Concurrency | `appendLog`/`bumpStat`/`setCachedAi` read-modify-write races; concurrent writes dropped | `serialized(key, fn)` per-key write mutex chains promises. Verified: 50 concurrent `++` → exactly 50 |

### Bugs found in v3.3.0 audit cycle (fixed before release)

| # | Sev | Area | Finding | Fix |
|---|-----|------|---------|-----|
| 16 | High | Safety | `SEED_BLACKLIST` was exported but **never checked** by risk engine — known-bad addresses bypassed local blacklist | Wired `evaluateTarget` to check Set → CRITICAL (+80), short-circuits other rules. Whitelist explicitly skips blacklisted targets |
| 17 | Med | Compat | `evaluateDomain` did `host === BLACKLIST_DOMAIN` — bypassed for `www.phishing.com` | Strip leading `www.` before comparison |
| 18 | Low | Coverage | Only 9 chains supported; missing major L2s (zkSync, Linea, Blast, Mode) | Added 4 chains (324, 59144, 81457, 34443) → 13 total. Updated CHAIN_NAMES, MULTICHAIN_RPCS, CHAIN_LOOKBACK, UNISWAP_V3_QUOTER_V2 |
| 19 | Low | UX | `setApprovalForAll` to OpenSea/Blur/LooksRare flagged CRITICAL — false positive | Added `KNOWN_NFT_OPERATORS` set; known marketplace → LOW (+5), unknown operator → CRITICAL (+40) |

### New defenses added in v3.3.0

| Defense | File | Description |
|---------|------|-------------|
| **Threat feed** (seed) | `lib/seed-threats.js` | 24 curated threats: 10 drainer addresses, 11 typosquat domains, 3 critical selectors, 4 patterns, 3 MEV bots, 1 honeypot |
| **Seed blacklist wired** | `lib/risk-engine.js` | `evaluateTarget`/`evaluateDomain`/`evaluateMethods` now consult `SEED_BLACKLIST*` constants. Whitelist cannot cancel blacklisted |
| **L2 chain coverage** | `approval-scanner.js` | zkSync Era (324), Linea (59144), Blast (81457), Mode (34443) — Uniswap V3 quoter on Linea only |
| **NFT softening** | `lib/constants.js` | `KNOWN_NFT_OPERATORS` (OpenSea Seaport, Blur, LooksRare) → LOW risk |
| **Error categorization** | `lib/simulator.js` | `classifyError()` returns `category` (revert/rpc/user-rejected/insufficient-funds/nonce/gas-estimation/unknown) + `friendly` plain-English message. UI can now say "Couldn't reach the blockchain RPC" instead of dumping `Error: fetch failed` |
| **Japanese locale** | `lib/locales/ja.js` | 248 keys translated |
| **Korean locale** | `lib/locales/ko.js` | 248 keys translated |
| **Chrome MV3 locales** | `_locales/ja/`, `_locales/ko/` | Store-compliant `messages.json` for both new locales |

### Build & test improvements

- `build.js` switched to per-file `BUNDLED_LIB_FILES` set + `^test-.*\.js$` regex (was: wholesale `lib/` exclusion that accidentally excluded testable lib code)
- Pack script switched from `Compress-Archive` to `System.IO.Compression.ZipFile.CreateFromDirectory` (recurses subdirectories)
- CI made version-agnostic: `test.yml` reads version from `package.json` (was: hard-coded `3.1.0` regex)
- New test suites: `test-bugfixes.js` (38 tests), `test-seed-threats.js` (13 tests), `test-new-features.js` (19 tests)

### Residual risks (v3.3.0)

- **No third-party audit.** This self-audit catches first-order bugs; external firms catch second-order issues. Mitigation: README and SECURITY.md clearly state "Tier 1-2 safety, not yet for $1M+ wallets without external audit".
- **Threat feed is opt-in by default.** Users must enable to get community updates. Mitigations: seed blacklist is always-on (24 curated threats hard-coded).
- **ENS resolution not implemented.** Requires keccak256 (no native browser API) or 100-line pure-JS impl. Pivot: address-book labels + shortened hex + `KNOWN_SAFE_CONTRACTS` lookup.
- **EIP-7702 detection has limited coverage** (11 known-safe delegations, ~20 risk patterns). Will expand as mainnet adoption grows.
- **Visual phishing detection uses DOM fingerprint** — sophisticated adversaries can defeat with dynamic CSS. Mitigated by combining with typosquat check + known-good list (17 sites).

### Recommendations (next audit cycle)

- **Commission external audit** (Trail of Bits / OpenZeppelin / Code4rena) — $5-15k, 4-6 weeks
- **Add opengrep SAST** to CI (already in skill inventory, not yet wired)
- **Formal selector dispatch** — register all selectors in a single registry
- **ENS support** via pure-JS keccak256 (or vendor `@noble/hashes`)
- **Bulk approval revoke UX** — currently one-at-a-time, could be batched with explicit user confirmation
- **Hardware wallet rule expansion** — currently 7 vendors, 5 strict rules; add more (Trezor Safe 3, Ledger Stax, Keystone 3 Pro)
