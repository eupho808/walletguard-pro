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
APPROVAL SCANNER (NEW IN v1.5)
────────────────────────────────────────────────────────────

Finds every active approval — ERC-20 AND NFT — across 13 chains in
  parallel:
  • Ethereum, Optimism, BNB Chain, Polygon, Fantom, Base, Arbitrum,
    Avalanche, Sepolia

Risk-classified per approval: critical / high / medium / low / info.
Top-5 riskiest shown in the popup with the exact reason flagged
("Unlimited allowance to UNKNOWN spender" etc.).

Toggle multi-chain on in Settings. Uses public RPC endpoints — no
account, no API key, no telemetry.

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
• 9-chain approval scanner (ERC-20 + NFT, zero API keys)
• Typosquatting detection via Levenshtein + homoglyph checks
• Phishing overlay on known-drainer domains
• Multicall V1/V2/V3 + Universal Router command decoding
• 1,429 automated tests across 33 suites, MIT licensed, open source

────────────────────────────────────────────────────────────
PRIVACY
────────────────────────────────────────────────────────────

We don't collect anything. We don't operate a backend that receives
your data. We don't sell, share, or rent data to third parties.
The optional OpenRouter AI check (off by default) only sends the
contract address you explicitly choose to check.

Full privacy policy: [GitHub link]

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
| 4 | `screenshots/04-approval-scanner.png` | "Approval scanner" | Dashboard mock (vitalik.eth, 18 approvals, 3 risky, PEPE critical, NFT section) |
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
Use the existing `icons/icon128.png` centered on a dark background with text:
```
WalletGuard Pro
Independent Web3 wallet security.
```

Or create via Canva / Figma — template:
- Background: linear gradient #0a0c12 → #12151d
- Logo: icon128.png centered-left
- Title text: white, Inter Bold, 28pt
- Subtitle: #8a92a3, Inter Regular, 14pt

### Marquee promo (1400×560) — optional
Reuse the landing-page hero design (see `index.html` for the exact CSS).
Render at 1400×560 in a browser, screenshot.

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
| `https://*.llamarpc.com/*`, `https://bsc-dataseed.bnbchain.org/*`, `https://polygon-rpc.com/*`, `https://fantom.publicnode.com/*`, `https://mainnet.base.org/*`, `https://arb1.arbitrum.io/*`, `https://api.avax.network/*`, `https://ethereum-sepolia-rpc.publicnode.com/*` | Multi-chain approval scanner (opt-in toggle). Read-only JSON-RPC calls (`eth_blockNumber`, `eth_getLogs`, `eth_call`). No other endpoints are contacted. |

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
     standard Web3 provider interface.
  2. To public RPC endpoints (LlamaRPC, publicnode, official chain
     RPCs from Base/Arbitrum/Polygon, Binance's BSC RPC, Avalanche's
     official RPC) when the user has opted into multi-chain scanning.
  3. To openrouter.ai (contract address only) when the user has
     explicitly configured an OpenRouter API key and triggered a
     check.
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

- [ ] All 1,429 tests pass: `npm test`
- [ ] `npm run build` produces a clean bundle
- [ ] Icons exist at `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] `PRIVACY.md` is hosted on a publicly accessible URL (GitHub Pages, raw GitHub, or your site)
- [ ] Screenshots captured at 1280×800 (or 640×400)
- [ ] Promo tile 440×280 created
- [ ] No "test" or "TODO" comments in the bundled `content.js`
- [ ] `manifest.json` version matches `README.md` badge (currently 1.5.1)
- [ ] GitHub repo is public with LICENSE, README, PRIVACY

---

## 6. After CWS approval

1. Update landing page `index.html` CTA href to the real CWS URL
2. Update README Chrome badge from `#` to the real CWS URL
3. Post on:
   - Twitter/X with a demo GIF
   - r/ethereum, r/ethdev, r/metamask
   - Hacker News (Show HN)
   - Product Hunt
   - Web3 security Discords (Wallet Guard community, SEAL, etc.)
4. Submit Firefox AMO in parallel — Firefox manifest already in repo
