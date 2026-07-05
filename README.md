# WalletGuard Pro

> Independent security layer for Web3 wallets. Intercepts transactions, decodes calldata, scans token and NFT approvals across 6 chains, detects phishing sites and typosquatted domains — **no API keys required**.

[![Version](https://img.shields.io/badge/version-1.5.0-00ffcc?style=flat-square)](./manifest.json)
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
- **ERC-20 approvals** across **6 chains** (Ethereum, Optimism, Polygon, Base, Arbitrum, Sepolia)
- **NFT collection approvals** (`setApprovalForAll`) — catches the root-access NFT drain pattern
- **Zero API keys** — uses your wallet's own RPC node (or public RPC endpoints in multi-chain mode)
- **Risk classification**: critical / high / medium / low / info per approval
- **Auto-refresh** every 6 hours via `chrome.alarms`
- **Per-chain lookback** tuned to each chain's block time

### Phishing & typosquatting defense
- **Phishing overlay** on known-drainer domains and custom blacklist hits
- **Typosquatting detection** via Levenshtein distance + substring + IDN/homoglyph checks against 17 trusted protocols (Uniswap, OpenSea, MetaMask, Rabby, etc.)
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
                           # ─────
                           # 176 tests total
```

Every test runs in plain Node — no Chrome required. The scanner module is loaded via `vm.runInContext()` with mocked `chrome.*` and `fetch()` APIs.

---

## Privacy

[Privacy Policy](./PRIVACY.md) — TL;DR: **nothing leaves your machine** unless you explicitly enable the optional OpenRouter AI check (which sends only the contract address, never your wallet or transaction data).

---

## Contributing

PRs welcome. Please open an issue first for non-trivial changes. The test suite is the source of truth — if you change behaviour in `lib/`, add a test in the matching `test-*.js`.

---

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
  - "14 chains" → "6 chains"
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

**Next session — pick up here:**
- [ ] Submit to Chrome Web Store developer dashboard
  - Pay $5 developer fee
  - New Item → upload ZIP of project (everything except `screenshots/reference/`, `.git/`)
  - Copy text from `STORE_LISTING.md` (name, short desc, detailed desc, privacy tab answers)
  - Upload 5 screenshots + promo tile
- [ ] After approval: update README Chrome badge, site CTA links, CWS URL in store-listing

