# How to submit WalletGuard Pro to the Chrome Web Store

This file walks you through the actual submission. **I (the AI) cannot
do this for you** — Chrome Web Store requires:

1. Your Google account
2. $5 one-time developer registration fee (Google charges this once
   per developer, lifetime)
3. Manual clicks in the dashboard at https://chrome.google.com/webstore/devconsole/

Everything else (code, tests, screenshots, promo tile, privacy policy,
store listing text, ZIP packages) is already prepared. This guide just
maps our repo to the dashboard fields.

---

## Step 0 — One-time: register as Chrome Web Store developer

If you have never published a Chrome extension before:

1. Open https://chrome.google.com/webstore/devconsole/
2. Sign in with the Google account you want to publish under
3. Pay the **$5 USD** registration fee (credit/debit card)
4. Accept the developer agreement
5. Wait ~5 minutes for account activation

If you have published before, skip to Step 1.

---

## Step 1 — Create the new item

1. In the dashboard, click **"New Item"** (top-right)
2. Click **"Choose file"** and select: `walletguard-pro-v3.7.0.zip`
   (in the project root — 2,172,850 bytes, built 2026-07-11)
3. Wait for the upload to finish (~30 seconds)
4. You'll see a warning if any manifest issue is found — there should
   be none. If there is one, **do not click "Continue"**, paste the
   error here and I'll fix it.

---

## Step 2 — Store listing tab

Fill the fields. The text in `STORE_LISTING.md` is the source of truth.
Copy from there, do not retype.

| Dashboard field | Source |
|---|---|
| **Name** | `WalletGuard Pro — Web3 Wallet Security` |
| **Short description** (max 132 chars) | `STORE_LISTING.md` → section 1 → "Short description" |
| **Detailed description** (max 16,000 chars) | `STORE_LISTING.md` → section 1 → "Detailed description" (the block between ``` fences) |
| **Category** | `Productivity` (primary) |
| **Language** | `English` |

**Graphic assets section:**

| Asset | File to upload |
|---|---|
| **Icon** (128×128, required) | `icons/icon128.png` |
| **Screenshots** (1280×800, max 5) | upload all 5 main: `screenshots/01-phishing-block.png`, `02-calldata-decoded.png`, `03-risk-factors-explained.png`, `04-approval-scanner.png`, `05-nft-access.png`. Use the descriptions from `STORE_LISTING.md` section 2 for each screenshot's caption |
| **Small promo tile** (440×280, required) | `screenshots/promo-tile.png` |
| **Marquee promo** (1400×560, optional) | skip for now — defer until after first user feedback |

---

## Step 3 — Privacy tab

Chrome Web Store has a separate "Privacy" tab where you answer
questions about data collection. The answers are in
`STORE_LISTING.md` → section 3.

### Single purpose

Paste the single-purpose description from `STORE_LISTING.md` section 3.
Do not modify it. Google's reviewers check this against the actual
behavior.

### Permission justifications

The dashboard will list each `permission` and `host_permission` from
your `manifest.json`. For each one, click "Explain why this permission
is necessary" and paste the matching justification from
`STORE_LISTING.md` section 3 → "Permission justifications" table.

Your manifest declares:

```
permissions:
  - storage
  - alarms
  - notifications

host_permissions:
  - https://openrouter.ai/*
  - https://eth.llamarpc.com/*
  - https://optimism.llamarpc.com/*
  - https://bsc-dataseed.bnbchain.org/*
  - https://polygon-rpc.com/*
  - https://fantom.publicnode.com/*
  - https://mainnet.base.org/*
  - https://arb1.arbitrum.io/*
  - https://api.avax.network/*
  - https://ethereum-sepolia-rpc.publicnode.com/*
```

For each one, paste the justification from `STORE_LISTING.md`.

### Host permission for remote code

Answer: **No**. The extension does not load or execute any remote
JavaScript. All code is bundled into the extension package at build
time. (We have zero external script tags, zero CDN dependencies.)

### Data usage

Paste the data-usage block from `STORE_LISTING.md` section 3 verbatim.
Do not soften or remove any line — the auditor (you, plus any future
external review) can compare this against `PRIVACY.md` and the actual
source code at any time.

---

## Step 4 — Distribution tab

| Field | Value |
|---|---|
| **Visibility** | `Public` |
| **Regions** | `All regions` (default; do not restrict) |
| **Pricing** | `Free` |

---

## Step 5 — Submit for review

1. Click **"Submit for review"** (bottom-right)
2. Google will show a summary — verify everything looks right
3. Confirm

**Review time:** typically 1-3 business days. Sometimes longer if the
reviewer has questions. You will get an email when the status changes.

---

## What happens after approval

When Google approves, you'll get an email with a public CWS URL like:

```
https://chromewebstore.google.com/detail/walletguard-pro-–/abcdefghijklmnop
```

Do these updates:

1. **`README.md`** — replace the `(#)` in the Chrome badge line with the
   real URL. Line 7:
   ```
   [![Chrome](...store/...#)](.#)
   ```
   →
   ```
   [![Chrome](...store/.../<real-id>)](<real-url>)
   ```

2. **`site/index.html`** — line 65-66:
   ```html
   <a href="#install" class="nav__cta">
     <span>Add to Chrome</span>
   ```
   change `#install` to the real CWS URL. Also update the install
   section button.

3. **`site/index.html`** — site/index.html lines for the install CTA
   in the hero (search for `#install` in that file).

4. **`PRIVACY.md`** — no change needed, the GitHub URL is permanent.

5. **`CHANGELOG.md`** — add a new entry under [3.7.0] noting the
   CWS publication date, e.g.:
   ```
   ### Distribution
   - Published to Chrome Web Store on YYYY-MM-DD: <real-url>
   ```

6. **`STORE_LISTING.md`** — mark the checklist as completed:
   change `[x]` next to "GitHub repo is public" to add a new line:
   ```
   - [x] Published to Chrome Web Store: <real-url>
   ```

7. **Commit and push:**
   ```powershell
   git add README.md site/index.html CHANGELOG.md STORE_LISTING.md
   git commit -m "docs: link to live Chrome Web Store URL after approval"
   git push origin main
   ```

---

## If review fails

Google will email you with a specific reason. Common issues:

- **"Single purpose unclear"** — your description says too many things.
  Trim to one core thing: "intercepts and analyzes Web3 wallet
  transactions." They don't want feature lists here.
- **"Permission unjustified"** — you forgot to fill in justification
  for one host. Go back, fill it from `STORE_LISTING.md`.
- **"Privacy policy URL unreachable"** — verify the URL works in a
  private browser window: `https://github.com/eupho808/walletguard-pro/blob/main/PRIVACY.md`
  (raw GitHub sometimes blocks bots, but the blob URL is public).
- **"Promo tile has marketing text"** — CWS doesn't allow price,
  ratings, or "Get it now" style language on the small promo tile.
  Our tile is clean text only. Should be fine.

If you get a rejection, paste the rejection reason here and I'll help
fix the specific field.

---

## What this guide does NOT cover

- Firefox AMO submission (separate process, separate fee waiver).
  `manifest.firefox.json` is in the repo. Defer until after CWS
  approval and at least one round of user feedback.
- Marketing, social media, press releases, Product Hunt, etc. —
  explicitly out of scope for this project.
- External security audit ($5-12k) — deferred until budget exists.
  Submission without audit is allowed; you just can't market it as
  "audited."
