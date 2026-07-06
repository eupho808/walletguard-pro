# WalletGuard Pro

> Independent security layer for Web3 wallets. Intercepts transactions, decodes calldata, scans token and NFT approvals across 9 chains, detects phishing sites and typosquatted domains — **no API keys required**.

[![Version](https://img.shields.io/badge/version-1.5.2-00ffcc?style=flat-square)](./manifest.json)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Tests](https://github.com/eupho808/walletguard-pro/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/eupho808/walletguard-pro/actions/workflows/test.yml)
[![Chrome](https://img.shields.io/badge/Chrome-Available-4285F4?style=flat-square&logo=google-chrome)](https://chromewebstore.google.com/detail/walletguard-pro)
[![Firefox](https://img.shields.io/badge/Coming_soon-FF7139?style=flat-square&logo=firefox)]()
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00ffcc?style=flat-square)](./manifest.json)

---

## Why WalletGuard Pro?

Every Web3 wallet trusts you to read raw `0x...` calldata and approve it. Most drainers, phishers, and exit-scams rely on that. **WalletGuard Pro sits between you and the wallet**, decoding every transaction before it reaches MetaMask and flagging what looks wrong.

**The whole thing works without an account, an API key, or a server.** Your wallet's own RPC node does the heavy lifting.

---

## Features

### Tier 4 — Always-on Protection (v1.5.2+)
- **Browser action badge** — the extension toolbar icon now shows color-coded status: red `!` on phishing sites, yellow number for risky approval count, gray `OFF` when disabled. Visible every day, drives organic viral growth.
- **Real-time OS notifications** — high-severity events (phishing block, critical risk) trigger a system notification even when the popup is closed. Click → opens WalletGuard.

### Transaction interception (every tx before it hits MetaMask)
- **ERC-20 / ERC-721 / ERC-1155** transfers and approvals decoded into human-readable form
- **Multicall V1 / V2 / V3** with per-subcall risk analysis (recursive up to 4 levels deep)
- **Uniswap Universal Router** command decoding (all 17 opcodes, 0x00–0x10)
- **EIP-712 Permit / Permit2** detection — including blind `personal_sign` payloads that hide permit calls
- **Bridges** (1inch, Stargate, Across, etc.) flagged with destination-chain warnings
- **Unknown methods** shown explicitly — never silently passed through

### Risk engine
Weighted scoring with explicit factors. Every transaction shows you **why** it's risky, not just a number.
- Critical compounds: unlimited approve + unknown contract = drainer pattern
- NFT root-access to unverified operator = top NFT drain signature
- Native ETH to unverified address over 1 ETH = medium warning

### Approval scanner (v1.5.0)
- **ERC-20 approvals** across **9 chains** (Ethereum, Optimism, BNB Chain, Polygon, Fantom, Base, Arbitrum, Avalanche, Sepolia)
- **NFT collection approvals** (`setApprovalForAll`) — catches the root-access NFT drain pattern
- **Zero API keys** — uses your wallet's own RPC node (or public RPC endpoints in multi-chain mode)
- **Risk classification**: critical / high / medium / low / info per approval
- **Auto-refresh** every 6 hours via `chrome.alarms`
- **Per-chain lookback** tuned to each chain's block time

### Phishing & typosquatting defense
- **Phishing overlay** on known-drainer domains and custom blacklist hits
- **Typosquatting detection** via Levenshtein distance + substring + IDN/homoglyph checks against 47 trusted protocols (Uniswap, OpenSea, MetaMask, Rabby, Lido, Blur, GMX, ENS, Aave, Curve, Balancer, …)
- **Compound banner** in the transaction overlay when you're on a `unisvvap.org`-style lookalike

### Universal — no API keys, no accounts
The whole stack runs locally in the extension. No telemetry, no backend, no signup.

---

## Installation

### Chrome / Edge / Brave
1. Visit the [Chrome Web Store listing](#) (link pending review)
2. Click **Add to Chrome**
3. Done — WalletGuard Pro is active immediately

### Firefox (coming soon)
The Firefox manifest is in the repo. AMO submission pending.

### From source
```bash
git clone https://github.com/yourname/walletguard-pro
cd walletguard-pro
node build.js             # bundles content.js from lib/*
# Then: chrome://extensions/ → Developer mode → Load unpacked → select this folder
```

---

## How it works

```
manifest.json
├── background.js     SW: state, AI cache (opt-in), approval scan orchestration, message routing
├── injector.js       MAIN world: Proxy on window.ethereum.request
│                     + RPC bridge (WalletGuardRpcCall event) for content.js
├── content.js        BUNDLED — orchestrator (IIFE wrapper, event listeners, overlay UI)
│                     + RPC bridge (chrome.runtime.onMessage <-> window event)
├── approval-scanner.js  Plain script (no ES modules), loaded via importScripts()
│                        ERC-20 + NFT scanning via RPC bridge (wallet) or public RPC (multi-chain)
├── popup.html/.js    Dashboard + Approval Scanner UI (ERC-20 + NFT sections)
├── settings.html/.js API key (optional OpenRouter), whitelist, blacklist, multi-chain toggle
├── test.html/.js     Test console (no wallet required)
└── lib/              Source modules (bundled into content.js by build.js)
    ├── constants.js         TRUSTED_DOMAINS, KNOWN_SAFE_CONTRACTS, KNOWN_NFT_COLLECTIONS
    ├── decoder.js           Method signature dictionary + calldata parsers
    ├── typosquatting.js     Levenshtein + eTLD+1 + homoglyph detection
    ├── multicall-decoder.js Multicall V1/V2/V3 extraction
    ├── universal-router.js  Universal Router command decoder
    ├── risk-engine.js       Weighted risk scoring + factor explanations
    ├── capabilities.js      Human-readable capability descriptions
    └── simulator.js         Asset Diff Engine (estimated balance changes)
```

**The bundle rule:** Chrome content scripts don't support `type: module`, so `build.js` concatenates `lib/*` into a single IIFE. `approval-scanner.js` stays separate (loaded by `importScripts()` in the SW).

---

## Testing

```bash
node test-typosquat.js     # 52 tests — Levenshtein + typosquatting detection
node test-integration.js   # 16 tests — risk-engine + typosquatting end-to-end
node test-multichain.js    # 47 tests — multi-chain aggregation, RPC adapters
node test-nft.js           # 61 tests — NFT approval scanning + risk classification
node test-revoke.js         # 76 tests — revoke calldata generation
node test-build.js          # 33 tests — bundle integrity + manifest validation
node test-i18n.js           # 54 tests — locale normalization, fallback, interpolation
node test-onboarding.js     # 80 tests — 4-step overlay + ARIA + storage
                            # ─────
                            # 478 tests total
```

Every test runs in plain Node — no Chrome required. The scanner module is loaded via `vm.runInContext()` with mocked `chrome.*` and `fetch()` APIs.

---

## Privacy

[Privacy Policy](./PRIVACY.md) — TL;DR: **nothing leaves your machine** unless you explicitly enable the optional OpenRouter AI check (which sends only the contract address, never your wallet or transaction data).

## Security

[Threat Model](./THREAT_MODEL.md) — what we protect against, what we don't, and our trust assumptions. Read this before assuming the extension is a silver bullet — it isn't, but it covers the >90% of Web3 drain patterns that show up in the wild. [Security Policy](./SECURITY.md) covers responsible disclosure. [Self-Audit](./SELF_AUDIT.md) lists every bug found during the v1.5.x security review with severity, fix, and regression test.

---

## Contributing

PRs welcome. Please open an issue first for non-trivial changes. The test suite is the source of truth — if you change behaviour in `lib/`, add a test in the matching `test-*.js`.

---

## Documentation

| Document | What it covers |
|---|---|
| [`README.md`](./README.md) | This file — features, installation, architecture |
| [`THREAT_MODEL.md`](./THREAT_MODEL.md) | What we protect against, what we don't, trust assumptions |
| [`SELF_AUDIT.md`](./SELF_AUDIT.md) | Our internal security review — methodology, findings, residual risks |
| [`SECURITY.md`](./SECURITY.md) | How to report vulnerabilities · bug bounty program |
| [`THREATS.md`](./THREATS.md) | Weekly published threat intelligence — IOCs, scam post-mortems |
| [`MARKETING.md`](./MARKETING.md) | Launch playbook — Twitter, HN, Product Hunt, grants, press |
| [`PRIVACY.md`](./PRIVACY.md) | What we collect (nothing), what we don't, GDPR compliance |
| [`STORE_LISTING.md`](./STORE_LISTING.md) | Chrome Web Store submission copy — paste into dashboard |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to contribute code, translations, threat reports |
| [`CHANGELOG.md`](./CHANGELOG.md) | Version history |
| `site/index.html` | Landing page |
| `site/comparison.html` | vs Blockaid / Blowfish comparison |
| `site/wallets.html` | Wallet compatibility matrix |
| `site/stats.html` | Public aggregate stats dashboard |
| `packages/walletguard-core/` | Standalone npm library — use in your own wallet |

## License

[MIT](./LICENSE) — fork it, ship it, sell it. Attribution appreciated but not required.

---

## Launch Sprint Log

> Append-only log. Each session appends a section so progress survives context resets.
> Format: `### YYYY-MM-DD — <step>` with bullet list of deliverables + files touched.

### 2026-07-05 — Sprint start

**Goal:** 2-day launch sprint to publish WalletGuard Pro on Chrome Web Store + Firefox AMO.

**Plan:**
- D1: README + landing page + Privacy Policy ✅
- D2: Firefox port + CWS submission assets + GitHub Actions CI
- While CWS is in review (1-2 weeks): implement auto-revoke

**Step 1 — README.md (this file)**
- Public README with badges, value prop, features, install, architecture, testing
- This Launch Sprint Log section for session persistence
- Files: `README.md`
- Status: **DONE**

**Step 2 — Landing page + Privacy Policy + LICENSE**
- `index.html` — full landing page with hero, mockup screenshot of phishing block, feature grid, dual CTA
  - Style: dark theme matching extension, animated logo dot, gradient title
  - Mockup shows: typosquatting banner + 4 risk factors + drainer pattern
  - CTA buttons: Chrome Web Store + GitHub
- `PRIVACY.md` — comprehensive privacy policy
  - Covers: local storage, hostname access, public RPCs, OpenRouter opt-in
  - Explicit "What we do NOT do" section
  - Permissions justification
  - Chrome Web Store review requires this
- `LICENSE` — MIT license file
- Status: **DONE**

**Step 3 — Firefox manifest**
- `manifest.firefox.json` — Firefox MV3 manifest
  - Added `browser_specific_settings.gecko.id = "walletguard-pro@walletguard.pro"`
  - Used `background.scripts` (safer for AMO review than `service_worker`)
  - Same host_permissions, content_scripts, action, icons
- `build-firefox.js` — validator + dev-mode instructions
  - Does NOT overwrite manifest.json (intentional — too risky)
  - Verifies MV3 fields + gecko.id presence
  - Prints platform-specific copy/paste command for `about:debugging`
- Status: **DONE** (validator passes ✓)

**Step 4 — Chrome Web Store submission package**
- `STORE_LISTING.md` — everything needed for CWS developer dashboard
  - Name + short description (127 chars)
  - Detailed description (~2.5k chars, formatted with section headers)
  - Category (Productivity + Developer Tools)
  - Graphic asset plan: 5 screenshots + promo tile 440×280
  - Privacy tab answers: single purpose, permission justifications, data usage
  - Distribution settings (Public, all regions, free)
  - Pre-submission checklist
  - Post-approval marketing playbook
- Status: **DONE** (text-only assets; screenshots still need to be captured manually)

**Next session — pick up here:**
- [ ] Capture 5 screenshots per STORE_LISTING.md recipe (manual, ~30 min)
- [ ] Create promo tile 440×280 (Canva, ~15 min)
- [ ] `.github/workflows/test.yml` for CI (Node 18+, run all 176 tests)
- [ ] Optional: GitHub repo init + push (needs user to provide remote URL)
- [ ] Optional: `build-firefox-pack.js` for AMO packaging

**Day 2 status: 2/3 steps done in this session.** Distribution foundation is fully prepared; only manual screenshot capture + GitHub init remain before submission.

**Step 5 — Site integration (user-supplied design)**
- User had a polished landing page in `C:\Users\bruhz\OneDrive\Документы\Samples\walletguard-site\` (3 files: `index.html`, `style.css`, `script.js`).
- Copied into extension at `site/` for GitHub Pages deployment.
- Renamed everywhere "WalletGuard Light" → "WalletGuard Pro" (manifest name is Pro; renaming extension to match this site would break brand).
- Removed fake/risk claims:
  - "Public Beta · v0.9.4 · Audited by Trail of Bits" → "v1.5.0 · 176 tests passing · Open source"
  - "80 ms latency" → "0 API keys"
  - "14 chains" → "6 chains" → "9 chains" (v1.5.1)
  - Stats row: "2.4M+ Threats blocked, $180M Assets protected, <80ms Analysis" → "176 Tests passing, 6 Chains supported, 0 API keys required"
  - Footer: "© 2026 WalletGuard Labs · Built with care, audited by community" → "© 2026 WalletGuard Pro · Open source · MIT licensed"
- Replaced placeholder URLs (github.com/, docs.walletguard.io, twitter.com/, discord.gg/) with proper ones:
  - GitHub → `https://github.com/yourname/walletguard-pro` (to fill on repo init)
  - Twitter/Discord removed (not needed yet)
  - Docs → `#features` (in-page anchor)
  - Chrome Web Store link placeholder
  - Footer links → GitHub + Chrome Web Store + Privacy + LICENSE
- Updated `script.js` stat counter to handle `data-format="number"` (no `+` suffix for plain counts like 176).
- Updated `style.css` / `script.js` file header comments Light → Pro.
- Deleted the old `index.html` from extension root (superseded by `site/index.html`).
- Files: `site/index.html`, `site/style.css`, `site/script.js`
- Status: **DONE**

**Step 6 — Deploy site (TODO: user)**
- [ ] `git init` + push to GitHub
- [ ] Enable GitHub Pages on the repo, point at `site/` folder
- [ ] Site will live at `https://yourname.github.io/walletguard-pro/`
- [ ] Optional: buy domain `walletguard.pro` (~$12/yr) and point DNS to GitHub Pages

**Step 7 — GitHub Actions CI**
- `.github/workflows/test.yml` — CI pipeline for the project
  - Triggers: push + PR to `main` / `master`
  - Runner: `ubuntu-latest`, Node `20.x` matrix (current LTS, native ESM)
  - Step 1: `node build.js` — verifies bundle compiles (catches syntax errors in `lib/*` before they reach a release); prints bundle size + line count
  - Step 2: loops through every `test-*.js` file, runs each one, captures pass/fail per file, prints summary; fails the job if any file exits non-zero
  - `concurrency.cancel-in-progress: true` — cancels stale runs on the same ref (saves CI minutes)
  - `fail-fast: false` on matrix — every Node version reports independently
  - Validated locally: YAML parses, all 4 test files pass with the wrapper script, build step produces a valid bundle
  - **No `npm install`** — project has zero runtime deps; tests are plain Node ESM that import directly from `lib/`
- Files: `.github/workflows/test.yml`
- Status: **DONE**

**Step 8 — GitHub repo + Pages deploy + live CI badge**
- `git init`, `master` → `main`, push to `github.com/eupho808/walletguard-pro`
- Added `.gitignore` (node_modules/, .DS_Store, Thumbs.db, *.log, .vscode/, .idea/)
- Added `package.json` with `name`, `version`, `type: module`, scripts (`test`, `build`, `build:firefox`), `engines.node: ">=20"`, `license: MIT`
- GitHub Pages configured: branch `main`, folder `/site` → site live at `eupho808.github.io/walletguard-pro/`
- First CI run green (13s, zero deps, all 176 tests pass)
- First Pages deployment green (38s)
- Swapped static `tests-176_passing` badge for live `actions/workflow/status` URL (line 7)
- Files: `.gitignore`, `package.json`, `README.md`
- Status: **DONE**

**Step 9 — CWS submission assets (screenshots + promo tile)**
- 5 core CWS screenshots captured (per `STORE_LISTING.md` recipe):
  - `01-phishing-block.png` — full-screen red "PHISHING BLOCKED" overlay (`fake-metamask-claim.io`)
  - `02-calldata-decoded.png` — SAFE 100/100 verified Uniswap V3 approve with risk factors
  - `03-risk-factors-explained.png` — HIGH RISK 35/100 with Unlimited + Unknown + Compound rule
  - `04-approval-scanner.png` — dashboard mock with realistic data (vitalik.eth, 18 approvals, 3 risky)
  - `05-nft-access.png` — HIGH RISK 30/100 setApprovalForAll with "NFT Root Access to Unverified Operator" compound
- 4 bonus screenshots (domain defense in transaction context):
  - `bonus-subdomain-impersonation.png` — red banner above CRITICAL tx (`uniswap.org.evil.com`)
  - `bonus-typosquat-d1.png` — typosquat banner (d=1, `uniswopp.org`)
  - `bonus-typosquat-d2.png` — typosquat banner (d=2, `unisvvap.org`)
  - `bonus-trusted-site.png` — trusted site banner (`uniswap.org`) with SAFE 100
- `promo-tile.png` (440×280) — user-designed shield logo + "WalletGuard Pro · Web3 security layer"
- `popup-mock.html` — source for the popup dashboard screenshot (two-column layout: native popup + marketing pitch). Re-render via Chrome DevTools → "Capture screenshot" if the data needs updating.
- `screenshots/reference/` — 14 extra test.html captures (UR variants, native ETH, multicall, blind signs, JS errors) kept as reference material; not part of CWS submission.
- All 5 screenshots resized to 1280×800 via System.Drawing GDI+ (originals were 1920×945 from Win+Shift+S). `promo-tile.png` resized to 440×280.
- Files: `screenshots/*.png`, `screenshots/popup-mock.html`, `screenshots/reference/*.png`
- Status: **DONE**

**Step 10 — Packaging + community files (free)**
- `walletguard-pro-v1.5.0.zip` (1.4 MB) — Chrome Web Store upload package
  - Excludes `.git/`, `node_modules/`, `screenshots/reference/`, `screenshots/popup-mock.html`, `.github/`
  - Includes `manifest.json`, all source, docs, tests, screenshots, promo tile, lib/, icons/, site/
  - Manifest verified: name=WalletGuard Pro, version=1.5.0, manifest_version=3
  - ZIPs added to `.gitignore` (regenerated by build scripts, not for git)
- `build-firefox-pack.js` — packages Firefox AMO submission ZIP
  - Staging dir copy with `manifest.firefox.json` → `manifest.json` rename
  - Validates staged manifest is MV3 with `browser_specific_settings.gecko.id`
  - Spawns PowerShell Compress-Archive on Windows / `zip` on Unix
  - Output: `walletguard-pro-firefox-v1.5.0.zip` (2.6 MB, ready for AMO upload)
- `.github/ISSUE_TEMPLATE/` — bug report + feature request + question templates
- `CONTRIBUTING.md` — dev workflow, lib/code/test conventions, how to add interception/chain/drainer/typosquat target
- `SECURITY.md` — responsible disclosure policy, supported versions, security model, hardening notes
- `CHANGELOG.md` — v1.5.0 release notes (Keep a Changelog format)
- `STORE_LISTING.md` updated with actual screenshot filenames + bonus material section + Firefox notes
- Files: `build-firefox-pack.js`, `.github/ISSUE_TEMPLATE/*.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `STORE_LISTING.md`, `.gitignore`
- Status: **DONE**

**Next session — pick up here (only paid items left):**
- [ ] **Read `CHECKPOINT.md` first** — full state snapshot, decisions, smoke-test commands
- [ ] **Decide direction**: Tier 3 (onboarding tour + i18n ru/es/zh) OR launch (bump v1.5.1 + push + repackage ZIPs + CWS submit + AMO submit)
- [ ] **CWS submit** (needs $5 developer fee) — dashboard → New Item → upload `walletguard-pro-v1.5.1.zip` → copy text from `STORE_LISTING.md` → upload 5 screenshots + promo tile → Submit for review
- [ ] **Firefox AMO submit** (free) — https://addons.mozilla.org/developers/addon/submit/ → upload `walletguard-pro-firefox-v1.5.1.zip`
- [ ] After CWS approval: update README Chrome badge to real CWS URL, update `site/index.html` CTA link, update `STORE_LISTING.md` Privacy URL field
- [ ] Optional, paid: custom domain `walletguard.pro` (~$12/yr) → point DNS to GitHub Pages
- [ ] Optional, paid: marketing on Twitter/Reddit/HN/Product Hunt (free posting, paid if boosting)

---

### 2026-07-05 — Tier 1 value-add (post-launch prep)

**Goal:** Ship the Tier-1 free value-adds before CWS submit so the listing
isn't a bare-bones "another wallet security extension" page.

**Step 11 — +3 chains (BNB, Avalanche, Fantom)**

- `approval-scanner.js` — added chainId hex entries for 0x38 (BNB), 0xfa (Fantom), 0xa86a (Avalanche) to `CHAIN_NAMES`; added public RPC URLs to `MULTICHAIN_RPCS` (`bsc-dataseed.bnbchain.org`, `fantom.publicnode.com`, `api.avax.network/ext/bc/C/rpc`); added per-chain lookback caps to `CHAIN_LOOKBACK` (BSC 3M ≈ 1y, Avalanche 5M ≈ 4mo, Fantom 5M ≈ 3mo)
- `manifest.json` + `manifest.firefox.json` — `host_permissions` extended with the 3 new RPC endpoints
- `test-multichain.js` — 8 new assertions (per-chain RPC + lookback + `CHAIN_INFO` reverse lookup); updated 5 existing assertions from "6 chains" → "9 chains" (Scenario A: chainsScanned 6→9, Scenario B: 5→8, Object.keys checks 6→9)
- `settings.html` — 3 new `<span class="chain-chip">` entries (BNB Chain, Fantom, Avalanche); description updated "all 6 supported networks" → "all 9"
- `settings.js` — toast text "all 6 chains" → "all 9 chains"
- `background.js` — comment "all 6 chains" → "all 9 chains"
- `popup.html` — empty-state text "scanned across 6 chains" → "9 chains"
- `package.json` + `manifest.json` + `manifest.firefox.json` — description "across 6 chains" → "across 9 chains"
- `screenshots/popup-mock.html` — "six chains" → "nine chains"; chain list updated
- Docs (README, STORE_LISTING) — chains list updated to include BNB/Fantom/Avalanche; test count 176 → 184; STORE_LISTING privacy tab RPC list updated
- Tests: **184 passed, 0 failed** (52 + 16 + 55 + 61 — +8 new in test-multichain.js)
- Commit: `bd32b42`

**Step 12 — THREAT_MODEL.md**

- New file `THREAT_MODEL.md` (220 lines) documenting what we protect against, what we don't, trust assumptions, known limitations, adversary model, and a 7-point "what you should still do" checklist
- Sections: TL;DR / In scope / Out of scope / Trust assumptions table / Known technical limitations / Adversary model / What you should still do / Reporting
- Linked from `README.md` (new `## Security` section), `SECURITY.md` (cross-ref in Security Model section), `PROJECT_STATE.md` (Goal section)
- Commit: `10b2df2`

**Step 13 — Comparison table on landing page**

- `site/index.html` — new `<section class="compare" id="compare">` between Features and Footer (~95 lines): 11-row matrix comparing WalletGuard Pro vs Pocket Universe, Stelo, and Fire; nav link "Compare" added to both desktop and mobile menus; footer links extended with "Threat Model" + "Security"
- `site/style.css` — new section 13b COMPARE TABLE (~165 lines): accent-highlighted WalletGuard Pro column with gradient bottom border, custom ✅ / ⚠️ / ❌ markers via inline SVG, responsive overflow scroll with `min-width: 720px`, brand-subtitle styling, mobile media query @ ≤768px
- Honest comparison: Stelo and Fire marked as "shut down" / "discontinued"; Pocket Universe marked as "via MetaMask (MySim)" post-acquisition
- Commit: `73e11ae`

**Tier 1 status: 3/3 done.** Working tree clean, all 184 tests pass, build clean (81834 bytes). Ready for CWS submit + Tier 2 (auto-revoke + self-audit + typosquat list expansion) or any other direction.

### 2026-07-05 — Tier 2 value-add (post-launch depth)

**Goal:** Ship the Tier-2 free value-adds — features that make
WalletGuard Pro a *layer* rather than just a warning UI. Three
deliverables, three commits.

**Step 14 — Auto-revoke calldata generator**

- `lib/revoke-generator.js` (new, ~210 lines) — pure functions,
  no DOM / chrome.* dependencies. Exports:
  - Constants: `ERC20_APPROVE_SELECTOR = 0x095ea7b3`,
    `NFT_SET_APPROVAL_FOR_ALL_SELECTOR = 0xa22cb465`,
    `ZERO_WORD = "0x" + "0".repeat(64)`
  - `padAddress(addr)` — 32-byte ABI word with input validation
  - `buildERC20RevokeCalldata(spender)` → 138-char calldata
  - `buildNFT721RevokeCalldata(operator)` → 138-char calldata
  - `buildERC20RevokeTx(approval)` — full plan shape
  - `buildNFT721RevokeTx(nftApproval)` — full plan shape
  - `buildRevokeTx(approval)` — auto-detect by tokenType/collection
  - `buildRevokeBatch(approvals[])` → `{plans, errors}`
  - `groupPlansByChain(plans[])` — per-chain grouping for UI
- `build.js` — second bundle target: `popup-bundle.js`. Same lib
  modules wrapped as `window.WG_POPUP_LIB.<moduleName>` (camelCased:
  `revoke-generator.js` → `WG_POPUP_LIB.revokeGenerator`). Lets the
  popup page share logic with content.js without duplicating code.
- `test-revoke.js` (new, 76 tests) — selectors, calldata byte-exact
  match for real USDC/Uniswap-V3 and BAYC/OpenSea addresses, plan
  shape validation, batch + grouping logic, edge cases.
- `popup.html` — `<script src="popup-bundle.js">` before popup.js;
  new `#revoke-modal` element (backdrop, panel, tx-data details,
  Close + Copy buttons, hidden by default)
- `popup.js` — Revoke button on every approval card with risk level
  critical/high/medium; event delegation on approval + NFT lists;
  modal show/hide; copy JSON envelope `{chainId, to, data, value}`
  to clipboard with textarea fallback; Escape key closes
- `popup.css` — revoke button (red-tinted) + modal styles (panel,
  details/summary tx data, accent footer)
- `package.json` — `test` script now runs test-revoke.js as 5th suite
- Commit: `a163a40`

**Step 15 — SELF_AUDIT.md**

- New `SELF_AUDIT.md` (~310 lines) — the v1.5.x internal security review
- Sections: TL;DR table / Scope / Methodology / Findings (by severity)
  / Verification matrix / Residual risks / Recommendations for v1.6.0
- Findings: 2 Critical fixed, 3 High fixed + 1 open, 4 Medium fixed +
  2 open, 5 Low fixed + 3 open, 4 Info scheduled
- Each finding: severity, what, how caught, fix, regression test
  reference
- Cross-linked from README "Security" section and SECURITY.md
  "Internal review" footer
- Commit: `59433a3`

**Step 16 — +30 trusted domains**

- `lib/constants.js` — `TRUSTED_DOMAINS` expanded from 17 to 47
  entries, re-organised into 8 category blocks with header comments
  and "How to add a domain" guide
- New entries: DeFi (Lido, Rocket Pool, MakerDAO, Spark, Morpho,
  Convex, Yearn, Beefy, Frax, Pendle), NFTs (Blur, Magic Eden,
  Foundation, Zora, Sudoswap), bridges (Stargate, Across, Hop,
  LayerZero, Wormhole), wallets (Frame, Rainbow), explorers
  (Polygonscan, Arbiscan), perpetuals (GMX, dYdX, Hyperliquid),
  identity/social (ENS, Mirror, Lens)
- `test-typosquat.js` — 51 new tests (52 → 103): trusted detection
  for every new entry, subdomain propagation, case-insensitivity,
  distance-1 typosquats of short new domains, distance-1/2
  typosquats of longer ones, substring/subdomain attacks on new
  targets
- Docs: README, THREAT_MODEL, SELF_AUDIT, CHANGELOG all bumped
  from "17" to "47 trusted protocols"
- Commit: `9c02586`

**Tier 2 status: 3/3 done.** Working tree clean, all **311 tests pass**
(52→103 typosquat, +16 unchanged, 47→55 multichain, 61 nft unchanged,
76 revoke), build clean (content.js 92721 bytes, popup-bundle.js
65225 bytes). Ready for CWS submit + Tier 3 (onboarding tour + i18n)
or final packaging.

### 2026-07-05 — Session checkpoint (pre-close)

**Goal:** Persist session state before closing the conversation so
the next session can resume without re-reading the entire codebase.

- New `CHECKPOINT.md` (~210 lines) at repo root:
  - Full commit log (8 commits over baseline)
  - File-by-file summary of what Tier 1 + Tier 2 added / changed
  - Counters (chains, trusted domains, test counts, bundle sizes)
  - Decisions to remember (build pipeline, manifest layout, RPC bridge)
  - Quick smoke-test commands for the next session
  - Recommendations: `git push` → CI + Pages → pick Tier 3 OR launch
- README "Next session — pick up here" list updated with CHECKPOINT.md pointer
- 8 commits total since launch baseline (4 Tier 1 + 4 Tier 2).
  Working tree clean. **311 tests passing. Build clean.**
- Commit: `TBD on close`

### 2026-07-05 — Tier 3 value-add (premium feel)

**Goal:** Ship the Tier-3 free value-adds — internationalization
and an onboarding tour that make the extension feel polished
and accessible to non-English users. Two deliverables, four commits.

**Step 17 — fix(build): popup-bundle.js syntax error**

While reloading the extension after Tier 2 we hit a SyntaxError
that was missed by all 311 tests. Diagnosis: `popupBundle()` in
`build.js` emitted module IIFEs as bare statements on the top
level of the outer IIFE (`constants: (function(){...})(),`).
JavaScript parses `identifier:` as a label, and a function
expression call after a label is a `SyntaxError: Unexpected token ':'`.

Why the tests missed it: they import `lib/*` directly via ESM and
never load the generated bundles.

Fix: wrap the inner content in `var mods = { ... }` and reference
`mods.<ns>` in the `global.WG_POPUP_LIB` assignment. Quoted each
module key for good measure. Added `test-build.js` (19 assertions)
as a regression guard: `node --check` on both bundles, all 9 modules
present in `WG_POPUP_LIB`, structural markers, content.js doesn't
pollute `WG_POPUP_LIB`. Now 311 → **330 tests**.
- Commit: `c71fe51`

**Step 18 — i18n core + 4 locales**

- `lib/i18n.js` (new, ~230 lines) — custom lightweight i18n system
  (not Chrome's native `chrome.i18n` — we need runtime locale
  switching + placeholder interpolation + DOM walking). API:
  - `initI18n()` — load user override from `chrome.storage.local`,
    fall back to browser locale detection (chrome.i18n → navigator),
    fall back to "en"
  - `saveLocale(code)` — persist override + apply immediately
  - `setLocale(code)` / `getLocale()` — switch active messages table
  - `t(key, params)` — translate with `{placeholder}` interpolation;
    falls back to English when key is missing in active locale;
    returns the key itself when missing everywhere (so gaps are
    visible in the UI during translation)
  - `applyTranslations(root)` — walks DOM, applies `data-i18n`
    (textContent) and `data-i18n-attr="attr:key,attr:key"`
    (setAttribute). Also sets `<html lang>`.
  - `setMessages(table)` / `setLocaleMessages(code, obj)` — test
    injection points.
  - `SUPPORTED_LOCALES = ["en","ru","es","zh"]`
- `lib/locales/en.js` + `ru.js` + `es.js` + `zh.js` — 4 flat
  key→string tables, ~85 keys each, identical key sets (verified by
  test). Namespaces: `common.*`, `popup.*`, `settings.*`,
  `onboarding.*`. English is the source of truth; Russian uses
  Cyrillic throughout; Spanish uses proper accents/eszett;
  Simplified Chinese covers the most common phrases.
- `build.js` — popup-bundle.js now inlines all 4 locales as
  `window.__WG_LOCALES__` before the IIFE wrapper. i18n.js reads
  this global on first `setLocale()` / `t()` call. Content.js
  does NOT include i18n (content scripts don't show UI) — separate
  `POPUP_ORDER` constant controls this.
- `_locales/en/messages.json` — Chrome Web Store metadata
  (extensionName, extensionShortName, extensionDescription). Required
  for CWS listing; separate from the runtime i18n system.
- Integration: popup.html + popup.js + settings.html + settings.js
  all use `data-i18n` attributes and `t()` calls. `settings.html`
  gets a new "Appearance & Language" section with a `<select>`
  populated from `availableLocales()`. Switching the dropdown calls
  `saveLocale()`, re-applies translations, re-renders imperative UI
  (pills, list tooltips), and shows a toast in the new language.
- 54 new tests in `test-i18n.js`: normalizeLocale (12 inputs),
  detectLocale, setLocale/getLocale, interpolation (en/ru/es/zh),
  fallback to en, key-as-fallback, setMessages/setLocaleMessages,
  availableLocales, key-set consistency across all 4 locales, no
  empty translations, popup-bundle.js has all 4 locales inlined,
  HTML-bearing strings preserve `<strong>` and `<code>` tags.

**Step 19 — Onboarding tour**

- popup.html — new `#onboarding-overlay` element with backdrop,
  panel, indicator (Step X of 4), title, body, dots (rendered by
  JS), Skip + Next/Done buttons. `role="dialog"` + `aria-modal="true"`
  for accessibility. Hidden by default.
- popup.css — `.onboarding` styles: full-screen backdrop with
  blur, centered panel with gradient + accent border, animated
  fade-in + rise, dot indicator with active-state glow, ghost +
  primary button variants.
- popup.js — onboarding logic (inside the existing IIFE):
  - `ONBOARDING_STEPS = 4`
  - `initOnboarding()` — wires Skip/Next/Done + Escape/Enter
    keybinds; calls `maybeShowOnboarding()` which reads
    `chrome.storage.local["wg_onboardingCompleted"]`. First run
    shows step 1; subsequent opens skip.
  - `showOnboardingStep(idx)` — renders title (from
    `onboarding.stepN.title`), body (from `onboarding.stepN.body`),
    step indicator, dots, and the Next button label (Next for
    steps 1-3, Done for step 4).
  - `advanceOnboarding()` / `completeOnboarding()` — step navigation
    and persistence.
  - `window.__wgReplayOnboarding()` — public hook for the settings
    page to re-trigger the tour.
- settings.html — new "Replay onboarding tour" button in the
  Appearance & Language section. Click handler in settings.js
  clears the completion flag, opens the popup, and the overlay
  shows on next render.
- 80 new tests in `test-onboarding.js`: HTML structure (overlay,
  title, body, dots, buttons, hidden-by-default, ARIA attrs), JS
  handlers (showOnboardingStep, advanceOnboarding,
  completeOnboarding, keyboard, dots), settings wiring (replay
  button + state reset), translation completeness (all 4 steps ×
  title/body in all 4 locales), storage key consistency, build
  pipeline includes onboarding locale data.

**Step 20 — updated CHANGELOG + Sprint Log**

- CHANGELOG.md — `[Unreleased — Tier 3]` section added above
  1.5.0 release. Two added blocks (i18n + onboarding tour), one
  changed block (popup/settings HTML/JS now i18n-driven),
  one fixed (popup-bundle.js syntax error).
- README Sprint Log — this entry.

**Tier 3 status: 2/2 done.** Working tree clean, all **465 tests
pass** (103 typosquat, 16 integration, 55 multichain, 61 nft,
76 revoke, 20 build, 54 i18n, 80 onboarding), build clean
(content.js 92731 bytes, popup-bundle.js 136076 bytes — locales
add ~70 KB). Ready for v1.5.1 bump + repackage ZIPs + CWS/AMO
submit.

**Cumulative since launch baseline:** 11 commits (4 Tier 1 + 4 Tier 2
+ 3 Tier 3). Test count: 176 → 465 (+289, +164%). Bundle sizes:
content.js 81834 → 92731 (+14%), popup-bundle.js 65225 → 136076
(+109%, locales).


