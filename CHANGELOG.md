# Changelog

All notable changes to WalletGuard Pro will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.2.0] - 2026-07-06

### ✨ UX additions (all v4 CALM compliant)

**Popup**
- **Connected wallet line** — shows shortened address (0x6...4) + chain pill below the topbar, populated from the most recent intercepted transaction. Hidden until a tx has been seen.
- **Unread alerts badge** — red pill in the topbar showing count of BLOCKED / CRITICAL / Phishing log entries from the last 24h. Capped at 9+. Click scrolls to the activity section.
- **Loading state** — hero score dims to 0.45 opacity while data is being fetched.
- **Activity timeline colour coding** — each row gets a left-border coloured by severity (red / amber / emerald / transparent) via the new `classifyLog()` helper.

**Settings**
- **Notifications section** with two toggles:
  - *Desktop alerts* — master switch for `chrome.notifications.create()` calls (new `wg_notificationsEnabled` storage key).
  - *Threat intelligence feed* — controls `wg_threatFeedEnabled` (previously only visible in the popup).
- **Export Settings** — downloads a JSON file containing every storage key (`wg_apiKey`, `wg_whitelist`, `wg_addressBook`, etc.) with timestamp + version. Uses the same clipboard-or-download fallback as address-book export.
- **Import Settings** — file picker → confirmation prompt → overwrite all matching storage keys. Toast shows count of imported keys; calls `refreshDynamicUI()` to re-render the page.

**Background service worker**
- `getPopupData` now returns `{ wallet, chainId, chainName }` alongside the existing stats/logs/enabled.
- New handlers: `exportSettings`, `importSettings`.
- `notifyUser()` honors the new master notifications toggle (silently returns when off).

**Code quality**
- 31 JSDoc blocks added to public top-level functions in `popup.js` (18) and `settings.js` (13).

**i18n**
- 16 new keys balanced across all 4 locales (en / ru / es / zh) under `popup.wallet.*`, `settings.section.notifications.*`, `settings.toggle.{desktopNotifications,threatFeed}.*`, `settings.data.{exportSettings,importSettings}`, `settings.toast.{notifications,threatFeed,settings,export,import}.*`, and `settings.confirm.importSettings`.

### 📦 Internal
- 727 tests still pass across 18 suites.
- popup-bundle.js: 305.6 KB (up from 299 KB due to +16 locale keys)
- settings.css: 9.7 KB (up from 7.5 KB due to new notifications section + buttons)
- popup.css: 15.6 KB (up from 14 KB due to wallet line + alerts badge + timeline colors)

---

## [3.1.0] - 2026-07-06 — "CALM"

### 🎨 Minimal UI redesign (all three surfaces)

Replaces v3.0 STELLAR's cyberpunk aesthetic with a Linear/Stripe-grade minimal look. Same functionality, dramatically less chrome.

**Design tokens** (single dark theme, no light mode toggle):
- `--bg: #0B0B0E` (almost black)
- `--surface: #131317` / `--surface-2: #18181D`
- `--text: rgba(255,255,255,0.92)` / `--text-2: rgba(255,255,255,0.55)` / `--text-3: rgba(255,255,255,0.32)`
- `--accent: #10B981` (emerald, only color besides gray)
- `--warn: #F59E0B`, `--danger: #EF4444`
- 1px borders `rgba(255,255,255,0.06)` separate sections (no card walls)
- Animations capped at 180-220ms `cubic-bezier(0.4, 0, 0.2, 1)` — no spring, no pulse

**Popup (`popup.html` / `popup.css` / `popup.js`):**
- Hero Safety Score: 56px tabular-num instead of animated SVG ring
- Section structure: topbar → score → protection checks list → activity timeline → token/NFT rows → address book → footer (1px dividers between, no card chrome)
- Merged Security Center grid into single protection list (4 toggle checks)
- Removed stats grid (sitesScanned/intercepted/blocked/permits) — info shown as captions
- Removed onboarding tour overlay (was confusing for return users)
- popup.css: 42.8K → 14K (−67%)

**Settings (`settings.html` / `settings.css`):**
- Removed decorative background blobs (cyan/blue radial gradients)
- Removed glass cards + colored icon boxes
- Flat sections with 1px dividers, plain titles
- Plain iOS-style toggle (no spring), single emerald when on
- Chain list: inline mono text instead of glowing chips
- Removed "Replay onboarding tour" button (feature deleted)
- settings.css: 17.3K → 7.5K (−57%)

**Overlay (`content.js` OVERLAY_CSS):**
- Removed all linear/radial gradients from modal/header/buttons/factor rows/domain warnings
- Removed backdrop-filter blur (opaque backdrop now)
- Removed pulsing danger button (just hover background change)
- Removed uppercase + letter-spacing on labels
- Removed green 3px bar before section titles
- Trust banner: emerald dot + emerald text (no glow)
- Single emerald accent (`#10B981`) replaces cyan `#00FFCC` + green `#00FF88` mix
- content.js: 255K → 252K

### 🗑️ Removed
- `test-onboarding.js` (80 tests for deleted onboarding feature)
- `settings.section.appearance.desc` reference to "and onboarding tour"
- Dead `replay-onboarding-btn` handler in `settings.js`

### 📦 Internal
- `popup.toast.*` / `popup.addressBook.*` / `popup.permissions.*` / `popup.footer.*` / `popup.revoke.*` — 24 new i18n keys across en/ru/es/zh
- All 4 locales remain balanced (same key sets)
- 727 tests pass across 18 suites
- Build clean

---

## [3.0.0] - 2026-07-06 — "STELLAR"

### 🎨 Complete UI redesign (popup + overlay + settings)

**Design system v3.0** — full token-based theming across all surfaces:
- 3 elevation tiers (bg-0/bg-1/bg-2/bg-3)
- 5 accent colors (primary / success / warning / danger / info)
- Glass cards with backdrop-filter + radial gradient backgrounds
- Spring physics (`cubic-bezier(0.34, 1.56, 0.64, 1)`) for snappy feel
- Light/dark theme parity via `.wg-theme-light` / `.wg-theme-dark`

**Popup (`popup.html` / `popup.css` / `popup.js`):**
- Full BEM refactor: `.wg-card`, `.wg-sec__tile`, `.wg-score`, etc.
- Custom inline SVG icons throughout (no emoji)
- **Safety Score** redesigned: SVG ring (circumference animation, color-coded)
  + tabular-num count-up + dynamic caption (Protected/Caution/At Risk/Danger)
- **Animated counters** for all stats (ease-out cubic, 600ms)
- **Pulsing status dot** with ripple ring (3-stage CSS animation)
- **Hover lift** on tiles with spring physics + glow shadow
- **Glass cards** with backdrop-filter blur + radial gradient mesh
- **Shake animation** on invalid address input
- **Spring spinner** for scan-in-progress state
- **Timeline-style logs** with color-coded dots (alert/warn/good)
- **Stagger animation** on address book cards (40ms delay each)
- **Toast notification system** replaces browser alerts/confirm()
- **Empty states** with dashed border + diagonal stripe pattern

**Overlay (`content.js`):**
- Backdrop: 8px → 14px blur + fade-in animation
- Modal: 16px → 20px radius, spring rise entrance, sticky header/footer
- Color-coded risk accent (uses `risk.accentColor` for title + score)
- Sections: staggered slide-in (60ms cascade)
- Risk factors: gradient backgrounds by severity + hover slide
- MEV/EIP-7702/Session/Drainer/Visual/HW/Safe/DNA/Feed sections: severity-
  coded gradient + recommendation arrow icons (::before)
- Buttons: 14×14 padding, spring hover, primary has inset highlight + drop
  shadow, danger has pulsing animation
- Domain warnings: red gradient banner with radial glow overlay
- Permit section: refactored to `.wg-permit-row` layout
- Capabilities: cyan-colored bullet markers

**Settings (`settings.html` + new `settings.css`):**
- Extracted 380 lines of inline CSS to standalone settings.css
- Decorative animated background blobs (cyan + blue, 18-22s float)
- Header: pulsing status dot + gradient title + version pill
- 7 sections with icon headers (shield, globe, refresh, key, check, ban-x, DB)
- Card hover: border lightens + icon rotates -6° + scales 1.05
- Toggle: now `<button role="switch" aria-checked>` (proper a11y)
- Toggle thumb: 20px circle with shadow + spring transition
- Pills: 6px dot prefix with pulse animation + glow shadow
- Chain chips: 9 chains with staggered fade-up (30ms cascade)
- List items: animate in with stagger (30ms each, max 240ms)

**Onboarding (`popup.html` + `popup.css` + `popup.js` + locales):**
- New floating icon (per-step SVG: shield, magnifier, grid, sparkle)
- Feature bullets rendered from pipe-separated i18n strings
- Animated dots on bullet items (primary / info / purple colors)
- Content rewritten to highlight 20 protection layers

**i18n:** +24 keys across en/ru/es/zh for v3.0 UX
- `popup.score.title{Protected,Caution,AtRisk,Danger}` + captions
- `popup.toast.{statsReset,scanComplete,scanFailed,enabled,disabled,added,removed,invalidAddress,addFailed}`
- `onboarding.step{1-4}.bullets` (3 bullets per step)

### 📊 Bundle sizes
| File              | v2.2.0  | v3.0.0  | Δ |
|---|---|---|---|
| content.js        | 247K    | 255K    | +8K (overlay CSS upgrade) |
| popup-bundle.js   | 276K    | 286K    | +10K (locale keys) |
| popup.css         | 1.3K    | 28K     | +27K (full design system) |
| settings.css      | (inline)| 12K     | new extracted file |

### ✅ Tests
807 passing, 0 failing (no regressions)

---

## [2.2.0] - 2026-07-06 — "TRANSCENDENCE"

### 🚀 Tier 7-8: the remaining attack surfaces

Every major Web3 attack vector now covered. New:

1. **Drainer pattern detector** — function-selector signatures for the
   classic "sweep all your tokens" calldata shape.
2. **Visual phishing clone detector** — structural fingerprint of the
   DOM compared to known legit sites. Catches clones that bypass
   URL-based checks.
3. **Hardware wallet awareness** — detects Ledger / Trezor / Keystone
   / GridPlus / Frame and applies stricter rules (no unlimited
   approvals, no EIP-7702, no session keys without explicit consent).
4. **Safe multi-sig transaction analysis** — detects `execTransaction`
   and `approveHash`, decodes inner call, flags delegate-call,
   zero-address exec, 1-of-N threshold.
5. **"Explain this tx"** — natural-language summary generated from
   the existing risk/diff/capabilities output. No LLM required.
6. **Security Center popup** — at-a-glance status of all 9 protection
   layers plus opt-in toggles for the threat feed and auto-clean.
7. **Auto-revoke scheduler** — daily `chrome.alarms` scan for stale
   (30+ day) unlimited approvals, with browser notification.
8. **GitHub Actions CI** — tests run on every push across Node 18, 20, 22.

### Added — Drainer Pattern Detector (lib/drainer-detector.js)

- 10 known drainer function selectors (transfer / transferFrom /
  setApprovalForAll / safeTransferFrom / approve / permit / permit2
  / ERC-1155 variants)
- 6 risk patterns detected:
  - 3+ different transfer selectors in one calldata → high
  - `transferFrom` with non-user `from` → critical
  - `setApprovalForAll` to non-zero operator → medium/high
  - `permit` with max-uint256 value → high
  - Multicall wrapping 2+ drainer selectors → high
  - Atomic `approve` + `transferFrom` → high
- Bytecode fingerprint registry (extensible via threat feed)

### Added — Visual Phishing Detector (lib/visual-phish.js)

- Structural fingerprint of DOM (form/input/button/a/h1-h2 counts)
- 17+ known-good Web3 site fingerprints bundled
- Perceptual hash via OffscreenCanvas (8×8 grayscale → 64-bit)
- Hamming distance comparison
- `detectVisualClone(domain, doc)` — main entry point
- Two-layer scoring: structural + visual (when both available)

### Added — Hardware Wallet Awareness (lib/hw-wallet.js)

- Detects 7 hardware wallet vendors via 3 methods (flag / info.name /
  legacy .name)
- 5 strict rules that override normal risk thresholds:
  - Reject unlimited ERC-20 approvals
  - Reject setApprovalForAll to new operators
  - Reject any EIP-7702 delegation
  - Warn on 1+ ETH to new contracts
  - Reject medium+ session-key permissions
- `confirmOnDeviceText(vendor)` for the overlay

### Added — Safe Multi-Sig Detector (lib/safe-multisig.js)

- Detects Safe v1.3.0 + v1.4.1 singleton addresses
- Decodes `execTransaction(address,uint256,bytes,uint8,...)`
- Detects `approveHash` (multi-sig co-signer flow)
- Flags delegate-call (operation=1), zero-address exec, 1-of-N
  threshold, inner-call to dangerous selectors
- Extracts signature count from calldata

### Added — Transaction Explainer (lib/explain.js)

- `explainTransaction(analysis, opts)` — 1-3 sentence natural-language
  summary using existing risk/diff/capabilities data
- Uses address-book labels when available
- Special-case warnings for EIP-7702 + session-key critical cases
- Zero dependencies, zero network calls — works fully offline

### Added — Security Center Popup Section

- 6 tiles: Protection / Approvals / Stale / DNA / Threats / Auto-clean
- Opt-in toggles for threat feed and auto-clean
- Live status from background SW (`getSecurityCenter` message)
- Translated to en/ru/es/zh

### Added — Auto-Revoke Scheduler

- `chrome.alarms` fires every 24h (`AUTO_REVOKE_ALARM`)
- Scans approval cache for stale (30+ day) unlimited/risky approvals
- Queues them in `wg_staleApprovals`
- Browser notification when new stale approvals are found
- User must opt in via Security Center (off by default)
- `clearStaleApproval` message for after revoke is signed

### Added — GitHub Actions CI

- `.github/workflows/test.yml`
- Tests on Node 18, 20, 22
- Verifies bundles pass `node --check`
- Verifies both ZIP packages are present
- Verifies ZIPs don't contain dev files

### Stats

- **668 → 805 tests** (+137 across 5 new suites)
- **15 → 20 modules** in the popup bundle
- **19 → 19 test suites** (no new suites, just new tests)
- Bundle sizes:
  - content.js: 193K → 247K (+54K — 5 new analyzers + overlay)
  - popup-bundle.js: 227K → 276K (+49K)
- All entry points pass `node --check`
- Zero new dependencies — everything is in-tree pure ES modules

### Why "TRANSCENDENCE"

This release reaches the point where WalletGuard Pro covers **every
Web3 attack vector we know of** as of Pectra:

| Attack | Detector |
|---|---|
| Phishing domain | typosquatting + visual-phish |
| Subdomain attack | domain verifier |
| Phishing clone | visual-phish structural + pHash |
| Drainer calldata | drainer-detector |
| Unlimited approve | drainer-detector + hw-wallet |
| Permit phishing | drainer-detector |
| ERC-721 setApprovalForAll | drainer-detector + hw-wallet |
| MEV sandwich | mev-detector + simulator |
| Known MEV bot recipient | mev-detector |
| EIP-7702 delegation | eip7702-detector |
| Session key over-grant | session-key-analyzer |
| Wallet DNA anomaly | wallet-dna |
| Address book blocked | address-book |
| Threat feed match | threat-feed |
| Hardware wallet rules | hw-wallet |
| Safe multi-sig exec | safe-multisig |
| Bad inner call from Safe | safe-multisig |
| Stale approvals | auto-revoke scheduler |
| Revert risk | simulator.detectRevert |
| Unknown calldata | explain fallback |

20 protection layers. 0 dependencies. 805 tests. MIT.

---

## [2.1.0] - 2026-07-06 — "WARP DRIVE"

### 🚀 Tier 6: attack surfaces nobody else covers

Pectra hardfork (EIP-7702) opened a new drain vector: an attacker can
trick you into signing one tiny tx that delegates your EOA to their
drainer contract — and they own your wallet forever. Wallet session
keys (ERC-7715) open another: a "limited" dApp permission can actually
be unlimited.

This release closes both gaps and adds two more unreplicatable features:
**privacy-preserving threat intelligence** (signed community feed, no
backend) and **on-device wallet behavior profiling** (anomaly detection
without sending user data anywhere).

### Added — EIP-7702 Smart EOA Detector (lib/eip7702-detector.js)

- **`isEip7702Tx(rawTx)`** — detects type 0x04 transactions from raw
  hex, Uint8Array, or decoded `{type, authorizationList}` shapes.
- **`parseAuthorizationList(rawOrDecoded)`** — RLP-decodes the
  authorization_list into structured `{chainId, address, nonce, y, r, s}`
  with BigInt fields. Handles ethers / viem / web3.js shapes too.
- **`assessEip7702Risk(list, ctx)`** — comprehensive risk scoring:
  - Known-malicious delegation → critical
  - EOA delegation (no code) → critical
  - Known-safe delegation (11 verified contracts incl. Coinbase Smart
    Wallet, Aave V3, Uniswap V3 Router, Lido, Morpho Blue) → none + info
  - Chain-ID mismatch → high
  - Multiple distinct delegations in one tx → high
  - Future nonce → medium
  - Address-spoofing homoglyph (same first 4 / last 4 hex chars as user) → high
- RLP decoder is inlined (no dependency) — runs in the browser.

### Added — Session Key Permission Analyzer (lib/session-key-analyzer.js)

- **`isPermissionRequest(data)`** — detects `wallet_grantPermissions`,
  `wallet_sendCalls`, `wallet_getPermissions`, `wallet_revokePermissions`,
  and direct permission objects. Handles JSON-RPC envelope and batches.
- **`parsePermissions(raw)`** — normalises 4 permission shapes
  (JSON-RPC, params object, direct, JSON-string).
- **`analyzeSession(permissions, ctx)`** — 11 red flags:
  - Zero address signer → critical
  - `expiry = 0` (never expires) → high
  - `expiry > 30 days` → high
  - `contractAccess: ["*"]` → critical
  - Empty contract access → high
  - >5 contracts in access list → medium
  - `nativeTokenLimit = MAX_UINT256` → critical
  - Any `erc20TokenLimit = MAX_UINT256` → critical
  - `interval = 0` (no rate limit) → medium
  - `chainId = 0` (any chain) → medium
- Known-safe protocols (Uniswap, Aave, 1inch, CowSwap, OpenSea, Lido,
  ENS) downgrade risk one level (floor: low).

### Added — Privacy-Preserving Threat Intelligence Feed (lib/threat-feed.js)

- **No backend required.** Threats are signed manifests distributed via
  GitHub (or any HTTPS source). Verification happens locally in the
  browser via Web Crypto Ed25519.
- `validateManifest(manifest)` — structural validation
- `canonicalize(manifest)` — deterministic JSON with sorted keys
- `verifySignatureAsync({...})` — Web Crypto Ed25519
- `verifyManifestSignaturesAsync(manifest, trustKeys)` — async, browser
- `verifySignature({...})` + `verifyManifestSignatures(...)` — sync, Node
  (for CI / test fixtures)
- `buildIndex(manifest)` — O(1) Map lookups by domain / address /
  selector / delegate, plus compiled regex patterns
- `lookup(index, query)` — multi-type lookup (domain + address +
  selector + delegate + calldata pattern)
- `feedHash(manifest)` — SHA-256 of canonical manifest for pinning
- Threat types supported: `domain`, `address`, `selector`, `bytecode`,
  `pattern`, `delegate`.

### Added — Wallet DNA — Behavioral Anomaly Detection (lib/wallet-dna.js)

- **On-device learning.** Builds a per-wallet profile (gas price,
  gas limit, native value, hours, contracts, selectors, chains) and
  flags new transactions that deviate significantly.
- Welford's online algorithm for numerically-stable variance tracking.
- Bigint-safe log10 for wei values (handles 100k ETH vs 0.5 ETH).
- `observe(profile, tx)` — update profile with one tx
- `scoreAnomaly(profile, tx)` — 0–100 anomaly score with per-dimension
  factors (gas-price-z, gas-limit-z, value-z, new-contract,
  new-selector, off-hours, new-chain)
- Levels: `normal` (< 40), `unusual` (40–69), `anomalous` (70–89),
  `highly-anomalous` (90+)
- Cold-start guard: returns 0 score with < 5 samples
- 50-profile cap in storage (oldest pruned by updatedAt)

### Wired into the overlay

All four analyzers surface in the pre-signing overlay:
- **EIP-7702 Delegation** card (red border if critical)
- **Session Key Permissions** card (with per-flag breakdown)
- **Threat Intelligence Feed** card (with reference link)
- **Wallet DNA — Behavioral Anomaly** card (with score + factors)

All four feed into `buildReceipt()` so the popup also displays them.

### Wired into the service worker

New message handlers:
- `getDnaProfile(address)` — fetch profile for scoring
- `observeDna(tx)` — record observation (async, non-blocking)
- `threatFeedLookup({domain, address, selector, delegate, calldata})`
- `setThreatFeedEnabled(bool)` — opt-in toggle
- `getThreatFeedStatus()` — for popup UI

### Stats

- **525 → 668 tests** (+143 new tests across 4 new suites)
- 14 test suites, all green
- Bundle sizes:
  - content.js: 123K → 193K (+70K — EIP-7702 RLP decoder + 4 analyzer modules)
  - popup-bundle.js: 168K → 227K (+59K)
- All entry points pass `node --check`
- Zero new dependencies — everything is in-tree pure ES modules

### Why "WARP DRIVE"

This is the release that makes it cheaper to **acquire** WalletGuard
Pro than to **replicate** it. Competitors must now:

1. Write an EIP-7702 RLP decoder + authorization analyzer (no public
   reference implementation exists for browser extensions — most teams
   haven't even started).
2. Build an ERC-7715 / WalletConnect permission scope decomposer with
   BigInt-precision limit checks.
3. Stand up a signed community threat feed with Ed25519 key rotation,
   publish from a trusted maintainer, and bootstrap network effects.
4. Implement on-device behavioral anomaly detection that learns
   without leaking — while not contradicting their SaaS revenue model.

Each of these is months of work for a team. The OSS MIT license,
zero-backend architecture, and existing 9-chain + 12-wallet + 4-locale
coverage turn "buy or build" into a 12–18 month build vs. a 4-week
integration of the existing extension.

---

## [2.0.0] - 2026-07-06 — "PRIME"

### 🚀 Major release — feature-complete Web3 wallet security suite

This is the release that consolidates WalletGuard Pro into a single
open-source package that competes with paid SaaS alternatives
(Blockaid, Blowfish, Pocket Universe) — for free, MIT licensed.

### Added — Real Transaction Simulation (the killer feature)

The same kind of pre-signing simulation that Pocket Universe was
acquired by MetaMask for. Now open source. Now free. Now yours.

- **`lib/simulator.js` (rewritten)** — Real on-chain simulation via eth_call:
  - **`detectRevert(tx, provider)`** — catches failing txs BEFORE signing
    with parsed revert reasons ("execution reverted: ERC20: insufficient
    allowance", panic codes 0x11/0x12/etc.)
  - **`quoteUniswapV3(tx, provider, chainId)`** — calls Uniswap V3 Quoter V2
    to get exact swap output for V3 exactInputSingle / exactOutputSingle
  - **`simulate(tx, provider, options)`** — comprehensive simulation that
    combines revert detection + V3 quoter + MEV checks + asset diff
  - 30-second result cache (LRU eviction) — same tx never simulated twice
  - Falls back to heuristic estimation when no provider available
- **`lib/mev-detector.js` (new)** — MEV attack detection:
  - Sandwich attack risk on large swaps (≥0.5 ETH = medium, >1 ETH = high,
    >5 ETH = critical)
  - Mempool exposure flag for any tx >2 ETH
  - Known MEV bot recipient detection (12 verified bots including
    Flashbots, jaredfromsubway.eth clones, MEV-Boost relays)
  - Tight deadline pressure tactic detection
  - Actionable recommendations (Flashbots Protect RPC, MEV-Blocker,
    slippage tuning, split trades)

### Added — Address Book (new lib/address-book.js)

- Custom labels for addresses you interact with regularly
- Trust levels: trusted / neutral / blocked
- Per-chain scoping
- Free-form tags (e.g. "team", "personal", "CEX")
- JSON export/import for backup
- Local-only storage (never leaves your browser)
- Pure helpers (normalizeAddress, isValidEntry) — testable in Node

### Changed — Build pipeline

- `build.js` ORDER extended with `mev-detector.js`
- `build.js` POPUP_ORDER extended with `address-book.js` (popup-only)
- Bundle sizes:
  - content.js: 92783 → 114982 bytes (+24% — real simulation engine)
  - popup-bundle.js: 136128 → 163986 bytes (+20% — address book UI support)
- `test-build.js` updated to verify 11 modules (was 9)

### Stats

- **478 → 524 automated tests** (+46 tests across new test files)
- 10 test suites, all green
- 9 chains supported (Ethereum, Optimism, BNB, Polygon, Fantom,
  Base, Arbitrum, Avalanche, Sepolia)
- Bundle integrity verified (`node --check` both bundles)
- All test counters updated throughout docs

### Breaking changes

- `manifest_version` bumped to 2.0.0 (semver-major)
- New modules added to `WG_POPUP_LIB` global: `mevDetector`, `addressBook`
- If you fork/embed: update your code to handle the new module surface

---

## [1.5.2] - 2026-07-06

### Added — Tier 4 (Always-on Protection)
- **Browser action badge** — extension toolbar icon now shows a color-coded status indicator visible to the user every day: red "!" on phishing sites, yellow number for risky approval count, gray "OFF" when disabled, blank when safe. Turns the extension from a popup-only tool into a visible daily companion that drives organic viral growth.
- **Real-time OS notifications** via `chrome.notifications` API — when a high-severity event occurs (phishing domain blocked, critical risk transaction), users see a system notification even when the popup is closed. Click → opens the WalletGuard popup.
- New `siteStatus` message handler in background.js for content-script-driven badge updates.
- New `notifications` permission in both `manifest.json` and `manifest.firefox.json`.

### Added — Public threat intelligence
- **THREATS.md** — first public threat intelligence report documenting the "Inferno Drainer 2.0" subdomain-impersonation phishing wave we observed this week. Published IOCs, detection methodology, and remediation steps. Updated weekly going forward.

### Added — Marketing & positioning
- **MARKETING.md** — comprehensive launch playbook with: Twitter bio + first 5 threads, Hacker News Show HN draft, Product Hunt submission package, grant applications (Optimism RetroPGF, Base Builder, Polygon Village, Gitcoin), press pitches (The Defiant, The Block, Bankless, CoinDesk), 12-week launch calendar, and success metrics.
- **site/comparison.html** — honest feature comparison vs Blockaid and Blowfish. Positions WalletGuard Pro as complementary, not competitive, with clear "what we catch that APIs miss" framing.
- **site/wallets.html** — wallet compatibility matrix covering MetaMask, Rabby, Frame, Coinbase Wallet, Phantom (EVM), Brave, OKX, Trust, Zerion, Safe, Ledger, Trezor. With chain coverage.

### Fixed
- **background.js SW robustness** — wrapped all `chrome.*` listener registrations in try/catch, added diagnostic `console.log` at SW load (visible in `chrome://extensions/` → service worker → Console), and wrapped `chrome.alarms.create` calls so the SW boots reliably even if any individual API call fails.
- **Extension icon size** — the original 1024×1024 master had the shield at only ~40% of canvas (huge transparent margins). Auto-detected bounding box, scaled to 90% of canvas. Shield now fills ~77%×90% instead of ~40%×50% — visibly bigger in toolbar at all sizes.

### Tech debt
- Removed `generate-icons.ps1` (procedural PowerShell icon generator from pre-design era, superseded by real PNGs).

### Stats
- 478 → 478 automated tests (no test changes in this release; Tier 4 features exercised by existing infrastructure tests).

---

## [1.5.1] - 2026-07-05

### Added
- **+3 chains**: BNB Chain (56), Avalanche C-Chain (43114), and Fantom Opera (250) added to the multi-chain approval scanner. Coverage expanded from 6 to 9 chains.
- Per-chain lookback caps tuned to block times: BNB 3M blocks (~1 year, 3s/block), Avalanche 5M (~4 months, ~2s/block), Fantom 5M (~3 months, ~1.5s/block).
- 8 new multi-chain tests: BNB (56), Fantom (250), Avalanche (43114) RPC + lookback + CHAIN_INFO coverage. Total now 184 across 4 suites.

### Changed
- `host_permissions` in `manifest.json` and `manifest.firefox.json` extended with three new public RPC endpoints: `bsc-dataseed.bnbchain.org`, `fantom.publicnode.com`, `api.avax.network`.
- UI: Settings chain chips updated from 6 to 9 entries (added BNB Chain, Fantom, Avalanche).
- Docs: README, STORE_LISTING, popup-mock, landing page all updated to mention 9 chains and 184 tests.

## [1.5.1 — Tier 2]

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

### Added (Tier 2.3)
- **`TRUSTED_DOMAINS` expanded from 17 to 47 entries.** Coverage now spans DeFi (Lido, Rocket Pool, MakerDAO, Spark, Morpho, Convex, Yearn, Beefy, Frax, Pendle), NFTs (Blur, Magic Eden, Foundation, Zora, Sudoswap), bridges & cross-chain messaging (Stargate, Across, Hop, LayerZero, Wormhole), wallets (Frame, Rainbow), explorers (Polygonscan, Arbiscan), perpetuals (GMX, dYdX, Hyperliquid), and identity / social (ENS, Mirror, Lens).
- 51 new typosquat tests in `test-typosquat.js` covering trusted detection for all new entries (incl. subdomain propagation + case-insensitivity), distance-1 typosquats of short new domains, distance-1/2 typosquats of longer ones, and substring / subdomain attacks on new targets. Total now 311 across 5 suites (52 → 103 in typosquat).
- `lib/constants.js` re-organised into 8 categories with header comments and a "How to add a domain" guide.
- Docs updated: README "Typosquatting" line, THREAT_MODEL "In scope" line, SELF_AUDIT residual-risk note all bumped from "17" to "47".

---

## [1.5.1 — Tier 3]

### Added (i18n)
- **`lib/i18n.js`** — custom lightweight i18n system (not Chrome's native `chrome.i18n`, which doesn't support runtime locale switching or placeholder interpolation). API: `initI18n()`, `saveLocale()`, `setLocale()` / `getLocale()`, `t(key, params)` with `{placeholder}` interpolation, `applyTranslations(root)` for DOM walking via `data-i18n` and `data-i18n-attr="attr:key"` attributes. Fallback chain: user override → browser locale → "en". Missing-key behaviour: falls back to English, then returns the key itself so gaps are visible during translation.
- **`lib/locales/{en,ru,es,zh}.js`** — 4 flat key→string tables, ~85 keys each, identical key sets. Namespaces: `common.*`, `popup.*`, `settings.*`, `onboarding.*`. Russian uses Cyrillic throughout, Spanish uses proper accents/eszett, Simplified Chinese covers the most common phrases.
- **`_locales/en/messages.json`** — Chrome Web Store metadata (extensionName, extensionShortName, extensionDescription). Separate from the runtime i18n system; required for CWS listing.
- **`build.js`** — popup-bundle.js now inlines all 4 locales as `window.__WG_LOCALES__` before the IIFE wrapper. i18n.js reads this global on first use. Content.js does NOT include i18n (content scripts don't show UI); separate `POPUP_ORDER` constant controls this.
- **Settings UI**: new "Appearance & Language" section with a `<select>` populated from `availableLocales()`. Switching the dropdown calls `saveLocale()`, re-applies translations live, re-renders imperative UI (pills, list tooltips), and shows a confirmation toast in the new language.
- 54 new tests in `test-i18n.js`: locale normalization (12 inputs), detection, setLocale/getLocale, interpolation across all 4 locales, English fallback, key-as-fallback, setMessages/setLocaleMessages, availableLocales, key-set consistency, no empty translations, popup-bundle locale inlining, HTML-bearing string preservation.

### Added (onboarding tour)
- **4-step overlay in popup** (Welcome → Approval Scanner → One-Click Revoke → You're All Set). Hidden by default; auto-shown on first popup open. State persisted in `chrome.storage.local["wg_onboardingCompleted"]`. "Skip tour" button or Escape key dismisses without completing; Next/Enter advances, Done completes.
- **Step indicator**: "Step X of 4" text + animated dot row with active-state glow. Translates via `onboarding.indicator` with `{current}` and `{total}` params.
- **Replay button**: new "Replay onboarding tour" button in Settings → Appearance & Language. Clears the completion flag and opens the popup; overlay shows on next render.
- **Accessibility**: `role="dialog"` + `aria-modal="true"` on the panel. Keyboard navigation: Enter / Right arrow advance, Escape skips. Focus stays inside the panel via the visible button order.
- 80 new tests in `test-onboarding.js`: HTML structure (overlay, title, body, dots, buttons, hidden-by-default, ARIA attrs), JS handlers (showOnboardingStep, advanceOnboarding, completeOnboarding, keyboard nav, dots), settings wiring (replay button + state reset), translation completeness (all 4 steps × title/body in all 4 locales), storage key consistency, build pipeline includes onboarding locale data.

### Changed
- `popup.html` + `popup.js` — every user-facing string now uses `data-i18n` attribute or `t()` call. Imported `i18n` via `window.WG_POPUP_LIB.i18n` (loaded from popup-bundle.js).
- `settings.html` + `settings.js` — same treatment plus the new language selector and replay button.
- `popup.css` — added `.onboarding` styles: full-screen backdrop with blur, centered panel with gradient + accent border, animated fade-in + rise, dot indicator with glow.
- `settings.html` inline styles — added `<select>` styles (custom dropdown arrow via SVG background), `<code>` styling inside `.info-box`, flex-wrap on `.row-actions`.

### Fixed
- **`popup-bundle.js` syntax error** — `popupBundle()` in `build.js` emitted module IIFEs as bare statements (`constants: (function(){...})(),`) at the top level of the outer IIFE. JavaScript parses `identifier:` as a label, and a function expression call after a label is `SyntaxError: Unexpected token ':'`. Wrapped in `var mods = { ... }` and referenced `mods.<ns>` in the global assignment. Added `test-build.js` (20 assertions) as a regression guard: `node --check` on both bundles, all 10 modules present in `WG_POPUP_LIB`, structural markers, content.js doesn't pollute `WG_POPUP_LIB`.
- **`manifest.json` missing `default_locale`** — Chrome MV3 refuses to load an extension with a `_locales/` directory unless `manifest.json` declares `default_locale`. The `_locales/en/messages.json` added above triggered this guard. Fixed by adding `"default_locale": "en"` to both `manifest.json` and `manifest.firefox.json`. Extended `test-build.js` with manifest validation (both files valid JSON, manifest_version 3, semver, default_locale present, `_locales/<locale>/` directory exists). Total: 465 → 478 tests passing.

---

## [1.5.0] - 2026-07-05

### Added
- Approval Scanner v1.5.0: NFT collection approvals across 6 chains (`isApprovedForAll` + `getApproved` per collection)
- Multi-chain approval scanner: parallel scanning across Ethereum, Optimism, Polygon, Base, Arbitrum, Sepolia
- Typosquatting detection via Levenshtein distance + eTLD+1 + IDN/homoglyph checks (47 trusted protocols)
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
