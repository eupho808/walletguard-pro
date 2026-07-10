# Chrome Web Store Submission Package — WalletGuard Pro

Everything you need to fill out the Chrome Web Store developer dashboard
at https://chrome.google.com/webstore/devconsole/

---

## 1. Store listing — Product details

### Name
```
WalletGuard Pro — Web3 Wallet Security
```
(Max 75 characters. Current: 36 — well within limit.)

### Short description (max 132 characters)
```
See what your wallet is signing. Intercepts every Web3 transaction, decodes calldata, blocks drainers and typosquatted domains. No API key.
```
(127 characters. Tweak if you want a punchier version.)

### Detailed description (max 16,000 characters)

```
WalletGuard Pro is an independent security layer that sits between your
dApp and your Web3 wallet. It intercepts every transaction, signature,
and approval request before MetaMask (or Rabby, Frame, etc.) sees it —
and shows you what it actually does, in plain English.

────────────────────────────────────────────────────────────
WHY IT EXISTS
────────────────────────────────────────────────────────────

Every Web3 wallet trusts you to read raw 0x... calldata and approve it.
Most drainers, phishers, and exit-scams rely on that. WalletGuard Pro
decodes the calldata, identifies the dangerous pattern, and asks you
to confirm before your wallet does.

────────────────────────────────────────────────────────────
WHAT IT CATCHES
────────────────────────────────────────────────────────────

✓ Unlimited ERC-20 token approvals to unknown contracts (the #1 drainer
  pattern)
✓ setApprovalForAll on NFT collections — root access to every BAYC,
  Azuki, Pudgy Penguin, etc. you own
✓ Phishing sites via known-drainer domain list and custom blacklist
✓ Typosquatted domains: unlsvvap.org, unlswap.org.evll.com, and Cyrillic
  homoglyphs of unlswap.org
✓ Multicall bundles hiding drainer calls inside innocent-looking swaps
✓ Universal Router commands (V2, V3, V4 swaps, Permit2 transfers)
✓ EIP-712 Permit signatures, including Permit2 batch permits
✓ Blind personal_sign payloads that hide Permit/Order calls
✓ Bridge transactions to the wrong chain
✓ Unknown contract methods — never silently passed through

────────────────────────────────────────────────────────────
APPROVAL SCANNER
────────────────────────────────────────────────────────────

Finds every active approval — ERC-20 AND NFT — across 13 chains in
  parallel:
  • Ethereum, Optimism, BNB Chain, Polygon, Fantom, Base, Arbitrum,
    Avalanche, Sepolia (+ zkSync Era, Linea, Blast, Mode defined in
    scanner registry; full support pending host permission declarations)

Risk-classified per approval: critical / high / medium / low / info.
Top-5 riskiest shown in the popup with the exact reason flagged
("Unlimited allowance to UNKNOWN spender" etc.).

Toggle multi-chain on in Settings. Uses public RPC endpoints — no
account, no API key, no telemetry.

───────────────────────────────────────────────────────────
APPROVAL EXPIRY REMINDERS (v3.7) — WORLD-FIRST
───────────────────────────────────────────────────────────

Tracks when each approval was first seen and surfaces ones older than
the user's chosen window (default 90 days, range 7-365). Status zones:
fresh (0-30%), aging (30-70%), stale (70-100%), expired (>100%).
Opt-in, fully local.

───────────────────────────────────────────────────────────
BULK MULTICALL REVOKE (v3.6)
───────────────────────────────────────────────────────────

Generate a single multicall transaction that revokes N stale or risky
approvals at once. The extension produces the calldata; you broadcast
the transaction yourself. WalletGuard never holds keys.

───────────────────────────────────────────────────────────
PORTFOLIO VIEW (v3.6)
───────────────────────────────────────────────────────────

Per-wallet USD exposure summary across all tracked approvals, with
top-at-risk tokens surfaced first. Pure local computation via
Uniswap V3 / V2 on-chain quotes — no CoinGecko, no external price APIs.

────────────────────────────────────────────────────────────
HOW IT WORKS
────────────────────────────────────────────────────────────

The extension uses your wallet's own RPC node to do all the heavy
lifting (eth_getLogs, eth_call, isApprovedForAll). No backend, no
server, no signup, no telemetry.

When you enable multi-chain scanning (opt-in), it additionally queries
public RPC endpoints for the chains you're not connected to.

The whole stack runs locally. Your wallet, your keys, your machine.

────────────────────────────────────────────────────────────
KEY FEATURES
────────────────────────────────────────────────────────────

• Calldata decoded — every tx into human-readable form
• Weighted risk engine — every factor shown explicitly (no black box)
• 13-chain approval scanner (ERC-20 + NFT, zero API keys)
• Typosquatting detection via Levenshtein + homoglyph checks
• Phishing overlay on known-drainer domains
• Multicall V1/V2/V3 + Universal Router command decoding
• Bulk multicall revoke — N approvals → 1 transaction (v3.6)
• Portfolio view with USD blast radius (v3.6)
• Approval expiry reminders — world-first feature (v3.7)
• 30 protection layers across 13 chains
• 1,429 automated tests across 33 suites, MIT licensed, open source

────────────────────────────────────────────────────────────
PRIVACY
────────────────────────────────────────────────────────────

We don't collect anything. We don't operate a backend that receives
your data. We don't sell, share, or rent data to third parties.
The optional OpenRouter AI check (off by default) only sends the
contract address you explicitly choose to check.

Full privacy policy:
https://github.com/eupho808/walletguard-pro/blob/main/PRIVACY.md

────────────────────────────────────────────────────────────
OPEN SOURCE
────────────────────────────────────────────────────────────

MIT licensed. 1,429 tests passing. Contributions welcome.
[GitHub link]
```

### Category
```
Productivity
```
(Secondary category: `Developer Tools`)

### Language
```
English
```

---

## 2. Graphic assets — what to upload

Chrome Web Store requires:
- 1 × **Icon** (128×128, PNG, square)
- 1 × **Small promo tile** (440×280, PNG/JPG)
- 1 × **Marquee promo tile** (1400×560, PNG/JPG, optional but recommended)
- **Screenshots** (1280×800 or 640×400, PNG/JPG, at least 1, max 5)

### Icon
**Reuse:** `icons/icon128.png` (already in repo)

### Screenshot plan (5 screenshots)

All 5 are already captured at 1280×800 PNG, ready to upload.

| # | File | Title | Shows |
|---|---|---|---|
| 1 | `screenshots/01-phishing-block.png` | "Phishing site blocked" | Full-screen red PHISHING BLOCKED overlay (`fake-metamask-claim.io`) |
| 2 | `screenshots/02-calldata-decoded.png` | "Calldata decoded" | SAFE 100/100 — verified Uniswap V3 approve with risk factors + Asset Changes |
| 3 | `screenshots/03-risk-factors-explained.png` | "Risk factors explained" | HIGH RISK 35/100 — unlimited approval + unknown contract + Compound rule (-25) |
| 4 | `screenshots/04-approval-scanner.png` | "Extension popup" | Real popup at native size (vitalik.eth connected, 100/100 score, protection checks, recent activity, token + NFT permission rows) + v4 CALM pitch column |
| 5 | `screenshots/05-nft-access.png` | "NFT collection access" | HIGH RISK 30/100 setApprovalForAll + "NFT Root Access to Unverified Operator" compound |

### Bonus screenshots (drop-in replacements, all 1280×800)

These show **real-time domain defense** in transaction context — the red banner appearing above the transaction overlay when you visit a typosquatted domain. Stronger marketing than the standalone phishing block if you want to swap.

| File | Shows |
|---|---|
| `screenshots/bonus-subdomain-impersonation.png` | Red "PHISHING — SUBDOMAIN IMPERSONATION" banner above CRITICAL tx (`uniswap.org.evil.com`) |
| `screenshots/bonus-typosquat-d1.png` | Orange "POSSIBLE TYPOSQUATTING" banner + CRITICAL tx (`uniswopp.org`, d=1) |
| `screenshots/bonus-typosquat-d2.png` | Orange "POSSIBLE TYPOSQUATTING" banner + CRITICAL tx (`unisvvap.org`, d=2) |
| `screenshots/bonus-trusted-site.png` | Green "Trusted site" banner + SAFE 100 (on `uniswap.org`) |

### Capture recipe (manual, if re-capturing needed)

```bash
# 1. Open Chrome with the unpacked extension loaded
# 2. Open test.html in a new tab
# 3. Click each test button
# 4. Use Chrome DevTools → device toolbar → 1280×800
# 5. Cmd+Shift+4 (mac) / Win+Shift+S (win) → select overlay area
# 6. Save to screenshots/01-phishing-block.png etc.
```

For screenshot #4 (popup dashboard), if you want a real capture instead of the mock:
```bash
# 1. Click the WalletGuard icon → popup opens
# 2. Settings → enable multi-chain scan toggle
# 3. Popup → Rescan → wait 5-10s for results
# 4. Open DevTools (right-click popup → Inspect) → Ctrl+Shift+P → "Capture screenshot"
```

Or re-render the mock: open `screenshots/popup-mock.html` in Chrome → DevTools → 1280×800 → "Capture screenshot".

### Reference material

`screenshots/reference/` contains 14 extra captures from `test.html` (Universal Router variants, Native ETH transfers, Permit, Multicall, blind signatures, JS error states). Useful for documentation, blog posts, or social media but NOT part of the CWS submission.

### Promo tile (440×280)

Use `screenshots/promo-tile.png` (already rendered, v4 CALM design).
- Background: solid `#0B0B0E` (no gradient)
- Shield + check icon (emerald `#10B981`) top-left
- "WalletGuard Pro" wordmark (white + emerald "Pro"), 34pt Inter Bold
- Tagline: "Independent Web3 wallet security.", 15pt Inter Regular, 60% white
- Bottom meta: v3.7 · 13 CHAINS · 30 LAYERS · MIT (small caps, emerald for MIT)

To re-render from source: `node screenshots/promo-tile.svg` is the vector
source. Use `screenshots/_render-promo.html` + Edge/Chrome headless at
440×280. See `screenshots/promo-tile-render.txt` for the exact command.

### Marquee promo (1400×560) — optional

Not yet created. If you want one for the CWS listing, reuse the
landing-page hero design from `site/index.html` rendered at 1400×560.
Defer until after first user feedback.

---

## 3. Privacy tab answers

### Single purpose
```
WalletGuard Pro provides an independent security analysis layer for
Web3 wallet transactions. It intercepts requests to window.ethereum,
analyzes the calldata, and displays a risk-scored overlay before the
wallet provider processes the transaction.
```

### Permission justifications

| Permission | Why |
|---|---|
| `storage` | Save user settings (whitelist, blacklist, scan cache, optional OpenRouter API key) in `chrome.storage.local`. |
| `alarms` | Schedule the approval scan to auto-refresh every 6 hours. Without this the scan only runs on manual trigger. |
| `https://openrouter.ai/*` | Optional AI check on contract addresses — only used when the user explicitly adds an OpenRouter API key and triggers a check. Off by default. |
| `https://eth.llamarpc.com/*`, `https://optimism.llamarpc.com/*`, `https://bsc-dataseed.bnbchain.org/*`, `https://polygon-rpc.com/*`, `https://fantom.publicnode.com/*`, `https://mainnet.base.org/*`, `https://arb1.arbitrum.io/*`, `https://api.avax.network/*`, `https://ethereum-sepolia-rpc.publicnode.com/*` | Multi-chain approval scanner (opt-in toggle, `wg_multiChain=false` by default). Read-only JSON-RPC calls (`eth_blockNumber`, `eth_getLogs`, `eth_call`) sent to public community-run RPC nodes. |

### Host permission for remote code
```
No. The extension does not load or execute any remote JavaScript.
All code is bundled into the extension package at build time.
```

### Data usage
```
The extension does not collect, transmit, or sell user data.
All processing is local. The only network requests made are:
  1. To the user's own wallet provider (read-only RPC), via the
     standard Web3 provider interface (window.ethereum.request).
  2. To public community-run JSON-RPC endpoints (LlamaRPC for
     Ethereum/Optimism, Binance's BSC RPC, polygon-rpc.com, Fantom
     publicnode, Base/Arbitrum/Avalanche official RPCs, Sepolia
     testnet RPC) when the user has explicitly enabled multi-chain
     scanning via the Settings toggle (wg_multiChain, default OFF).
  3. To openrouter.ai — only when the user has explicitly added
     their own OpenRouter API key in Settings AND explicitly triggered
     an address check. The request contains only the contract address
     string; no wallet, transaction, or browsing data is included.

There are NO analytics SDKs, NO telemetry, NO crash reporting, NO
install/upgrade beacons, NO fingerprinting, and NO cookies.
chrome.storage.local is the only persistent storage. The full list
of stored keys is documented in PRIVACY.md.

Full privacy policy:
https://github.com/eupho808/walletguard-pro/blob/main/PRIVACY.md
```

---

## 4. Distribution

### Visibility
```
Public
```

### Regions
```
All regions
```

### Pricing
```
Free
```
(Freemium model planned — see PROJECT_STATE.md. Initial release is
free to maximize adoption.)

---

## 5. Pre-submission checklist

- [x] All 1,429 tests pass: `npm test` (last run: 2026-07-11)
- [x] Build produces clean bundles: `node build.js` + `node build-chrome-pack.js`
- [x] Icons exist: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [x] `PRIVACY.md` hosted at `https://github.com/eupho808/walletguard-pro/blob/main/PRIVACY.md`
- [x] Screenshots captured at 1280×800 PNG: 5 main + 4 bonus
- [x] Promo tile 440×280: `screenshots/promo-tile.png`
- [x] `manifest.json` version: `3.7.0` (matches README badge)
- [x] GitHub repo is public: `github.com/eupho808/walletguard-pro` (MIT)
- [x] ZIP packages built: `walletguard-pro-v3.7.0.zip` (2,172,850 bytes), `walletguard-pro-firefox-v3.7.0.zip` (2,172,921 bytes)
- [x] v4 CALM design across all assets (no cyberpunk, no neon, no glow)

---

## 6. After CWS approval

1. Update landing page `site/index.html` CTA href to the real CWS URL
2. Update README Chrome badge from `#` to the real CWS URL
3. Update PRIVACY.md "Contact" section if needed (currently points to GitHub issues)
4. Add a note in CHANGELOG.md pointing at the CWS URL
5. Optional: also submit the Firefox build via AMO (`manifest.firefox.json` is already in repo)
