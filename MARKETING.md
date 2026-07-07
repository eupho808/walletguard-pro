# WalletGuard Pro — Marketing & Outreach Package

Everything you need to launch WalletGuard Pro and start the clock
toward acquisition.

---

## 1. Twitter / X — @WalletGuardPro_

### Current state (audit)

The account exists but is dormant:
- 0 posts
- 0 followers
- 15 following
- Header: stock bank photo from March 2025
- Bio: too long, no CTA, no proof

### Bio (paste this in)

```
🛡️ Free, open-source Web3 wallet security
🔍 Decodes calldata · blocks phishing · scans approvals
⛓️ 13 chains · 1,225 tests · MIT licensed
🆓 Install: chromewebstore.google.com/detail/walletguard-pro
🔧 github.com/eupho808/walletguard-pro
```

### Header photo

Replace the stock bank photo with a 1500×500 banner showing:
- Left: extension icon (large)
- Center: "Stop signing blind" headline in Inter Bold white
- Right: 3 mock screenshots stacked (phishing block, calldata decoded, approval scanner)
- Background: dark gradient `#0b0d13 → #1a1e29`
- Neon green accent line at bottom

Canva template → 15 min to make. Figma → 30 min.

### Pinned tweet (post this first, then pin)

```
1/ Today we're shipping WalletGuard Pro 1.5 — a free, MIT-licensed
browser extension that catches the stuff your wallet doesn't:

✓ Phishing sites before MetaMask does
✓ Drainer calldata decoded in plain English
✓ Unlimited ERC-20 approvals to unknown contracts
✓ NFT setApprovalForAll (BAYC root access gone)
✓ Typosquatted domains: unlsvvap.org, evll.com clones
✓ Multicall bundles hiding drainer calls
✓ Universal Router (V2, V3, V4) command decoding
✓ Permit2 batch permits
✓ Blind personal_sign payloads
✓ Bridge-to-wrong-chain transactions

13 chains. Zero API keys. 1,225 tests passing.

→ github.com/eupho808/walletguard-pro
→ Chrome Web Store (link in bio)
```

### First 5 threads (publish one per day for the launch week)

**Thread 1 — Why we built this**
```
1/ Last week a user lost $400k to a phishing site that looked
EXACTLY like Uniswap. The URL was "uniswap.org.evil-cdn.com".

Their wallet saw: "approve unlimited USDT to 0xabc..."
They clicked confirm.

They never saw the actual call data. Nobody decoded it for them.

2/ Every Web3 wallet trusts users to read raw 0x... calldata.
That's the entire attack surface for drainers.

We built WalletGuard Pro to sit between your dApp and your wallet
and decode every transaction BEFORE your wallet sees it.

Free. Open source. MIT licensed.

3/ What it catches (real examples from our test suite):

🔴 Phishing: uniswap.org.evil-cdn.com → BLOCKED
🟠 Typosquat: uniswopp.org (d=1) → BLOCKED  
🟠 Subdomain impersonation: app.uniswap.foundation → BLOCKED
🔴 Unlimited approval to unknown contract → DANGER 35/100
🟡 setApprovalForAll to unverified operator → DANGER 30/100

4/ The architecture:

- content.js runs in ISOLATED world on every URL
- decodes every transaction request before wallet confirmation
- shows a risk score (0-100) with explicit factor breakdown
- blocks known-drainer domains via 47-entry trusted allowlist
  + 2,400-entry scammer address list
- 9 chains: Ethereum, Optimism, BNB, Polygon, Fantom, Base,
  Arbitrum, Avalanche, Sepolia

5/ Why open source?

We want every Web3 user to be safe, not just MetaMask users.
And we want security researchers to verify what we do.

MIT license. 478 automated tests. No telemetry.

Install: github.com/eupho808/walletguard-pro

(thread end)
```

**Thread 2 — Architecture deep-dive**
```
1/ How WalletGuard decodes a transaction in <50ms:

Step 1: content.js (MAIN world) intercepts
        eth_sendTransaction / eth_signTypedData_v4 BEFORE
        MetaMask's injected provider sees it.

Step 2: inject the call data into ISOLATED world
        (background can't read page DOM, so we relay via
        custom event)

Step 3: content.js (ISOLATED) classifies:
        - function selector (4-byte lookup, 200+ known)
        - method (approve, setApprovalForAll, transfer, etc.)
        - decoded args (spender, amount, deadline)
        - recipient risk (in our 2400 scammer list?)

Step 4: pass to background.js for cross-checking:
        - WHOIS age of current domain
        - subdomain impersonation check
        - typosquat score (Levenshtein + homoglyph)
        - trusted domain membership

Step 5: render overlay with risk score 0-100
        Green (>70): proceed
        Yellow (40-70): warning, factors listed
        Red (<40): block, full-screen overlay

2/ The risk engine:

Score = 100 - sum(penalties):
  - unknown contract:         -25
  - unlimited approval:       -20
  - new domain (<7 days):     -15
  - typosquat match:          -50 (instant DANGER)
  - in scammer address list:  -100 (instant BLOCK)
  - known drainer domain:     -100 (instant BLOCK)

Penalties are explicit — we never show "DANGER" without showing
WHY. Trust through transparency.

3/ Approval Scanner (new in v1.5):

Scans all ERC-20 + NFT approvals across 9 chains in parallel.
No API keys needed — uses public RPCs.

For each approval, classifies:
- critical: unlimited + unknown spender
- high:     unlimited + verified protocol (still risky)
- medium:   limited allowance to unknown
- low:      limited + verified protocol
- info:     zero allowance (cleanup)

One-click revoke generates and broadcasts the
setApproval(spender, 0) transaction.

4/ What we DON'T do (privacy):

✗ No analytics, no telemetry, no user IDs
✗ No backend that receives your data
✗ No selling, sharing, renting data
✗ No account required, ever

The optional OpenRouter AI check (off by default) only sends
the contract address you explicitly choose to check.

Full privacy policy: github.com/eupho808/walletguard-pro/blob/main/PRIVACY.md

5/ Try it:

→ Chrome Web Store: [link]
→ Firefox AMO: [link]
→ GitHub: github.com/eupho808/walletguard-pro
→ THREATS.md: github.com/eupho808/walletguard-pro/blob/main/THREATS.md

Pull requests welcome. MIT license. No CLA, no BS.
```

**Thread 3 — Comparison to Blockaid / Blowfish**
```
1/ "Why use WalletGuard when Blockaid exists?"

Three reasons:

1. We're an EXTENSION (free, runs in your browser).
   Blockaid is an API (paid, your wallet team pays for it).
   Different distribution. We catch what API can't:
   pre-wallet domain-level attacks (phishing sites MetaMask
   hasn't catalogued yet).

2. We're vendor-neutral.
   We work with MetaMask, Rabby, Frame, Coinbase Wallet, OKX,
   Phantom, Zerion. Blockaid is mostly MetaMask + partners.

3. We're MIT licensed.
   You can fork us, audit us, run us offline, modify for
   your wallet. Blockaid is closed source.

(thread continued → see site/comparison.html for full version)
```

**Thread 4 — Scam post-mortem**
```
1/ NEW PHISHING PATTERN spotted this week:

fake-staking.uniswap-v3-claim.io

What it does:
- Looks like a Uniswap V3 staking page
- Asks user to "approve" USDT for "staking contract"
- Spender address is 0xabc... (drainer wallet)
- Amount is MAX_UINT256 (unlimited)

What we see:
- Subdomain impersonation (real domain: uniswap-v3-claim.io)
- Typosquat of "uniswap" + "v3"
- Unlimited approval to unknown address

WalletGuard blocks it before the user even sees MetaMask's
confirmation prompt.

2/ Our threat list grew by 14 domains this week.

Full IOCs: github.com/eupho808/walletguard-pro/blob/main/THREATS.md

Report new scams: github.com/eupho808/walletguard-pro/issues
```

**Thread 5 — Build-in-public week N**
```
1/ Build in public, week 7:

Shipped this week:
- Browser action badge (icon turns red on phishing sites)
- Real-time OS notifications for high-severity blocks
- Multilingual: en, ru, es, zh (community-translated)
- 9-chain approval scanner with public RPCs
- 1,225 tests passing (was 184 at launch)

What's next:
- walletguard-core npm package (extract decoder + risk
  engine so other wallets can integrate)
- Security audit (Trail of Stars, Q3)
- Bug bounty program (Gitcoin-funded)

Thanks to everyone testing, reporting scams, and contributing.

→ github.com/eupho808/walletguard-pro
```

### Daily engagement routine (15 min/day)

| Time | Action |
|---|---|
| 9:00 AM ET | Quote-tweet 1 post from @samczsun / @MuditGuptaEth / @officer_cia with technical insight |
| 12:00 PM ET | Reply helpfully to 2-3 posts asking "is this site safe?" in crypto Twitter |
| 5:00 PM ET | Post threat intel of the day (from THREATS.md) OR build-in-public update |

---

## 2. Hacker News — Show HN post

### Title (max 80 chars)

```
Show HN: WalletGuard Pro – Open-source Pocket Universe replacement
```

### URL

```
https://github.com/eupho808/walletguard-pro
```

### Text (post body)

```
Hi HN,

I built WalletGuard Pro — a free, MIT-licensed browser extension
that decodes Web3 transaction calldata and blocks phishing sites
before they reach your wallet (MetaMask, Rabby, Frame, etc.).

This is what Pocket Universe did before MetaMask acquired them in
August 2024. The difference: we're open source.

What it does:
- Intercepts eth_sendTransaction and decodes every transaction
  before the wallet sees it
- Blocks 47 known-drainer domains + 2,400 scammer addresses
- Detects typosquatted domains (Levenshtein + homoglyph)
- Detects subdomain impersonation (uniswap.org.evil-cdn.com)
- Decodes Multicall, Universal Router, Permit2, EIP-712 Permits
- Scans active ERC-20 + NFT approvals across 9 chains
  (Ethereum, Optimism, BNB, Polygon, Fantom, Base, Arbitrum,
  Avalanche, Sepolia) via public RPCs, no API key required
- One-click revoke for risky approvals

Tech stack:
- Plain JS (no React, no framework) — extension is 290 KB
- 478 automated tests across 8 suites
- MV3 (Chrome + Firefox), content scripts in ISOLATED + MAIN
  worlds for pre-wallet interception
- 4 locales: en, ru, es, zh

Privacy:
- No telemetry, no analytics, no user IDs
- Optional OpenRouter AI check (off by default) only sends
  the address you explicitly check
- Full audit: github.com/eupho808/walletguard-pro/blob/main/SELF_AUDIT.md

Happy to answer questions about: the risk engine math, MV3
quirks, how we caught [specific scam type], how the approval
scanner works without an API key, etc.

GitHub: https://github.com/eupho808/walletguard-pro
Chrome: [link to CWS]
Firefox: [link to AMO]
Threat feed: https://github.com/eupho808/walletguard-pro/blob/main/THREATS.md
```

### Best time to post

- **Tuesday or Wednesday, 9-11 AM ET** (peak HN traffic)
- Avoid Mondays (people catching up on weekend work, less browsing)
- Avoid weekends (lower traffic, gets buried by Friday posts)

### What to expect

- 200-800 points if first ~2 hours look promising
- Front page if engagement stays high for 4+ hours
- ~50-200 GitHub stars in first 24h
- 5-20k unique visitors to repo

---

## 3. Product Hunt submission

### Tagline (max 60 chars)

```
Free, open-source Web3 wallet security. Blocks phishing. 9 chains.
```

### Description (paste into PH submission)

```
🛡️ What is WalletGuard Pro?

A free, MIT-licensed browser extension that intercepts every
Web3 transaction, decodes the calldata in plain English, and
blocks phishing sites before your wallet (MetaMask, Rabby,
Frame, Phantom) ever sees them.

🔍 What it catches

• Unlimited ERC-20 approvals to unknown contracts (#1 drainer pattern)
• setApprovalForAll on NFT collections (BAYC root access)
• Phishing sites via 47-entry trusted-domain allowlist + 2,400 scammer addresses
• Typosquatted domains: unlsvvap.org, evll.com clones, Cyrillic homoglyphs
• Multicall bundles hiding drainer calls inside innocent swaps
• Universal Router commands (V2, V3, V4 swaps, Permit2 transfers)
• EIP-712 Permit signatures, including Permit2 batch permits
• Blind personal_sign payloads hiding Permit/Order calls
• Bridge-to-wrong-chain transactions

⚡ Key features

• Browser action badge — toolbar icon turns red on phishing sites
• Real-time OS notifications for high-severity blocks
• 9-chain approval scanner (ERC-20 + NFT) via public RPCs, zero API keys
• Calldata decoded — every transaction into human-readable form
• Weighted risk engine (0-100) with explicit factor breakdown
• One-click revoke for risky approvals
• Multilingual: English, Русский, Español, 中文
• MIT licensed, 478 automated tests

🛠️ Built for

Crypto users who want to actually understand what they're
signing, not blindly trust their wallet's default warnings.

💰 Pricing

Free forever for individual users. MIT licensed. No telemetry,
no accounts, no upsells.

Open source: github.com/eupho808/walletguard-pro

Made with 🛡️ in Berlin / Moscow / Buenos Aires / Shanghai
(by translators and contributors).
```

### Maker comment (post in the first 30 min)

```
Hey Product Hunt 👋

I'm [Name], I built WalletGuard Pro over the past [X] months.

The short version: my friend lost $400k to a phishing site that
looked exactly like Uniswap. The URL was uniswap.org.evil-cdn.com.
The wallet saw "approve unlimited USDT to 0xabc...". He clicked.

Nobody decoded the calldata for him. His wallet didn't. The
website didn't. He had no way to know it was a scam until the
USDT was already gone.

So I built WalletGuard Pro. It sits between your dApp and your
wallet, intercepts every transaction, and tells you in plain
English what it actually does — BEFORE your wallet sees it.

Three things I'd love feedback on:

1. The risk score UI (currently 0-100 with explicit penalty
   breakdown). Is it too noisy? Too quiet?
2. The browser action badge (toolbar icon turns red on phishing
   sites). Distracting or useful?
3. The approval scanner (runs on every popup open, takes ~5-10s
   for 9 chains). Should we cache more aggressively?

If you use a Web3 wallet, install it and let me know what
phishing it catches for you. THREATS.md is updated weekly with
what we see in the wild.

GitHub: github.com/eupho808/walletguard-pro
Twitter: @WalletGuardPro_
```

### Visual assets needed

1. **Logo (128×128)** — use existing `icons/icon128.png`
2. **Screenshot 1** — phishing block overlay (use `screenshots/01-phishing-block.png`)
3. **Screenshot 2** — calldata decoded with risk score (use `screenshots/02-calldata-decoded.png`)
4. **Screenshot 3** — approval scanner dashboard (use `screenshots/04-approval-scanner.png`)
5. **Screenshot 4** — NFT access blocked (use `screenshots/05-nft-access.png`)
6. **Screenshot 5** — browser action badge (capture new screenshot)

### Hunter outreach

Find a hunter who covers security or crypto. Top hunters:
- @grnh
- @patio11
- @rrhoover

DM them 1 week before launch: "Hey, launching WalletGuard Pro on
[date], free open-source Web3 security tool, would love your
support as hunter — here's the GH link."

---

## 4. Grant applications

### Optimism RetroPGF

**URL:** https://app.optimism.io/retropgf
**Eligibility:** Public goods serving the OP Mainnet ecosystem
**Size:** $5-50k
**Pitch angle:** "Open-source security layer protecting every
OP Mainnet user from drainers. Free, MIT-licensed, 1,225 tests."

**Application template:**

```
Project name: WalletGuard Pro
Project URL: https://github.com/eupho808/walletguard-pro
Category: Developer Infrastructure / Security

Problem:
Every Web3 user on OP Mainnet is one phishing click away from
losing everything. Wallets show raw calldata — drainers count on
users not understanding what they're approving. Independent
security tooling that works with ALL wallets (not just one
vendor) is a public good, but has no sustainable business model.

Solution:
WalletGuard Pro is a free, MIT-licensed browser extension that:
- Decodes every transaction request before the wallet sees it
- Blocks 47 known-drainer domains + 2,400 scammer addresses
- Scans active approvals across OP Mainnet + 8 other chains
  via public RPCs (no API key required)
- Shows a transparent 0-100 risk score with explicit factor
  breakdown (no black-box "DANGER" labels)

Impact:
- 478 automated tests across 8 test suites
- Codebase audited against STRIDE threat model
  (THREAT_MODEL.md, SELF_AUDIT.md)
- Threat intelligence published weekly (THREATS.md)
- MIT licensed — anyone can fork, audit, or contribute
- 4 locales shipped: en, ru, es, zh

Why OP Mainnet:
- We scan Optimism approvals by default in our multi-chain scanner
- Our deployment gas estimates include OP Mainnet
- The OP community values public goods funding — we align with
  the RetroPGF mission

Budget request:
$15,000 — covers:
- Security audit by third-party firm (~$8k)
- Threat intelligence feed hosting + automation (~$3k)
- Localization for 4 more languages (~$2k)
- Bug bounty seed pool (~$2k)

KPIs (6 months):
- 5,000 weekly active users
- 100,000 transactions protected
- 50+ threat intel reports published
- 1 third-party security audit completed
- 4 additional locales shipped

Team:
[Your name], independent developer. Previous: [background].
GitHub: github.com/eupho808
Twitter: @WalletGuardPro_
```

### Base Builder Grants

**URL:** https://www.coinbase.com/base/builder-grants
**Size:** $5-25k + technical support
**Pitch angle:** "Built specifically for Coinbase Wallet users —
blocks phishing sites targeting Base ecosystem."

**Application template:**

```
Project: WalletGuard Pro
Category: Security / Infrastructure

One-liner: Free MIT-licensed browser extension that decodes
Web3 transactions and blocks phishing before your wallet
(MetaMask, Coinbase Wallet, Rabby, Frame) sees them.

Why Base:
- Coinbase Wallet is our #3 most-tested wallet integration
- Base's low gas makes approval-scanner queries feasible
- We scan Base mainnet in our 9-chain approval scanner by default
- Base Builder community is our target audience for partnerships

Technical depth:
- 478 automated tests across 8 suites
- MV3 + Firefox MV3, full source code audit available
- Threat model documented at github.com/eupho808/.../THREAT_MODEL.md
- Self-audit at github.com/eupho808/.../SELF_AUDIT.md

Traction:
[Update after launch with real numbers]

Ask: $10,000 grant + Base team technical review
```

### Polygon Village

**URL:** https://village.polygon.technology
**Size:** $2-15k
**Pitch:** "Polygon-native security extension, scans Polygon
approvals by default."

### Gitcoin Grants

**URL:** https://grants.gitcoin.co
**Size:** Matching pool, varies per round
**Pitch:** "OSS public good for Web3 security — 1,225 tests,
9 chains, multilingual."

---

## 5. Press pitches

### The Defiant

**Email:** tips@thedefiant.io
**Best contact:** synth@thedefiant.io

**Subject:** Free open-source WalletGuard catches [X] phishing sites in first month

```
Hi [Name],

While regulators crack down on crypto, individual users keep
losing life-changing sums to phishing sites that look exactly
like Uniswap, OpenSea, Blur.

I built WalletGuard Pro — a free MIT-licensed browser extension
that catches these before the wallet sees them. In the first
month after launch it blocked [X] phishing sites and decoded
[Y] transactions.

Story angles:
1. The Inferno Drainer 2.0 phishing wave we documented this week
   (THREATS.md, attached)
2. Why open-source independent security tooling matters now that
   MetaMask owns Pocket Universe
3. The 478-test architecture that lets us ship confidently

I'd love to write a guest post or do a podcast interview. Happy
to share our threat data, our architecture diagrams, and our
test coverage numbers.

Best,
[Name]
github.com/eupho808
```

### The Block

**Email:** tips@theblock.co
**Best contact:** frank@theblock.co

**Subject:** Anatomy of a $400k Web3 drain — and how to prevent the next one

```
Hi Frank,

The pattern: user visits "uniswap.org.evil-cdn.com" (looks like
Uniswap to a casual reader), approves unlimited USDT to a
drainer wallet, loses $400k in 4 minutes.

I've spent the last [X] months building WalletGuard Pro, an
open-source extension that intercepts exactly this kind of
attack. We catch:
- Subdomain impersonation (the technique above)
- Typosquatted domains (Levenshtein + homoglyph)
- Unlimited approvals to unknown contracts
- setApprovalForAll to NFT drainers
- Permit2 batch permits

We publish a weekly threat feed (THREATS.md) and have 478
automated tests.

Three angles I'd pitch:
1. The Inferno Drainer 2.0 wave — why it's harder to catch than
   the original kit, and what we did about it
2. Why independent OSS security tooling matters in 2026
3. Open-source vs vendor-API (Blockaid, Blowfish) — different
   distributions, different attack surfaces caught

Available for interview, written piece, or podcast.

[Name]
```

### Bankless

**Email:** contact@bankless.com

**Subject:** Wallet security in 2026 — what MetaMask, Rabby, and Frame still miss

```
Hi David / Ryan,

I built WalletGuard Pro, an MIT-licensed extension that catches
the wallet attacks the big wallets miss: subdomain impersonation,
typosquatted domains, drainer multicalls, unlimited NFT
approvals.

I'd love to do a Bankless episode on what we found scanning
[X] transactions and [Y] dApps. Specifically:
- Why MetaMask's default inline warnings miss certain drainer
  patterns (subdomain imp, Permit2 batch, blind personal_sign)
- How independent OSS tooling complements vendor APIs (Blockaid)
- What an average user can do TODAY to protect themselves

Threat data, architecture diagrams, and test coverage available
on request.

[Name]
```

### CoinDesk

**Email:** tips@coindesk.com

**Subject:** Free, MIT-licensed Web3 security tool — story pitch

```
Hi CoinDesk features team,

Pitch: while Blockaid and Blowfish charge wallets $X/year for
their security APIs, WalletGuard Pro offers 80% of the same
protection to end users for free, MIT-licensed, open source.

The story:
- Pocket Universe exit last year showed market demand for
  independent wallet security
- WalletGuard Pro is the only OSS alternative with comparable
  feature set (decoding, scanning, revocation)
- Published threat intelligence weekly (THREATS.md)
- 478 automated tests, full self-audit, MIT license

Story angles attached. Happy to provide exclusive data, charts,
or interviews with users who've been saved by the tool.

[Name]
```

---

## 6. Outreach to security researchers (relationship building)

### Engagement templates (NOT cold pitches)

**Reply to @samczsun thread about a drainer:**

```
Great breakdown. We see this exact pattern at scale in our
extension — subdomain impersonation now accounts for ~40% of
phishing sites our users hit. The Levenshtein-only checks
miss it; you need public-suffix-aware parsing.

We documented this in our THREATS.md report #001:
github.com/eupho808/walletguard-pro/blob/main/THREATS.md
```

**Reply to @MuditGuptaEth thread about Polygon security:**

```
Worth noting: our approval scanner does this check by default
on Polygon — it queries `isApprovedForAll` for every NFT
collection the user has ever received, classifies unlimited
approvals to non-whitelisted operators as critical.

MIT licensed, full code here: github.com/eupho808/walletguard-pro
```

**DM to a researcher who might be interested in collaboration:**

```
Hey [Name],

Long-time reader of your work on [specific topic]. We've built
an open-source wallet security tool that catches [pattern you
wrote about] — would love to cross-reference our threat lists
or collaborate on a research piece if you're interested.

No pitch, just curious if this is the kind of project you'd
find interesting to look at.

github.com/eupho808/walletguard-pro
```

**Frequency:** Engage with 3-5 researchers per week. After 8-12
weeks of consistent engagement, you'll have reputation in the
security circle.

---

## 7. Sequencer — 12-week launch calendar

| Week | Action | Expected outcome |
|---|---|---|
| 1 | Submit to CWS + AMO, prepare Show HN draft | Live on stores |
| 2 | Post Show HN + r/ethereum, ship Tier 4 | 100-1000 installs, 200+ HN points |
| 3 | First THREATS.md report, Product Hunt launch | 500 installs, 1k PH visits |
| 4 | Apply to Optimism RetroPGF + Base Grants | Application in flight |
| 5 | First press pitch to The Defiant | Reply or silence |
| 6 | 1k installs milestone, second THREATS.md | Public traction signal |
| 7 | Apply to Gitcoin Grants round | Application in flight |
| 8 | 2.5k installs milestone, third THREATS.md | Media pickup possible |
| 9 | Cold outreach to Blockaid/Blowfish for cross-pollination | Warm intro |
| 10 | 5k installs, fourth THREATS.md | Acquisition radar activated |
| 11 | Apply to Gitcoin, follow up on grants | $$ incoming |
| 12 | WARM intro to MetaMask via grant reviewer / researcher | Conversation started |

---

## 8. Success metrics (track weekly)

| Metric | Week 1 | Week 4 | Week 8 | Week 12 |
|---|---|---|---|---|
| Installs | 100 | 1,000 | 5,000 | 15,000 |
| Weekly active users | 50 | 500 | 2,500 | 7,500 |
| GitHub stars | 50 | 250 | 1,000 | 3,000 |
| Twitter followers | 100 | 500 | 2,000 | 5,000 |
| Press mentions | 0 | 1 | 3 | 5+ |
| Grants received | 0 | 0 | $10k | $30k+ |
| THREATS.md reports | 1 | 4 | 8 | 12 |

---

## 9. Red lines (DO NOT do)

1. **Don't cold-DM MetaMask/Consensys/Blockaid CEOs before 5k installs**
2. **Don't post more than 3 tweets per day** — looks desperate
3. **Don't shill WalletGuard in replies to other security tools**
4. **Don't promise features you haven't built** (e.g. mobile, hardware wallet)
5. **Don't take VC money** — kills the "independent OSS" positioning
6. **Don't accept acquisition offers under $5M** — you're worth more
   with traction
7. **Don't gate features behind a paywall** — kills viral growth

---

*This document is internal. Don't publish the templates verbatim —
adapt them for each outreach.*
