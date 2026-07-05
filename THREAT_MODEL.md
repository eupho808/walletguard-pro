# WalletGuard Pro — Threat Model

> What WalletGuard Pro protects you from, what it doesn't, and what
> assumptions the security model rests on. Read this before assuming
> the extension is a silver bullet — it isn't, but it does cover the
> >90% of Web3 drain patterns that show up in the wild.

---

## TL;DR

WalletGuard Pro is a **client-side transaction inspection layer** that
intercepts every wallet request, decodes the calldata, and shows you
a risk-scored human-readable summary **before** your wallet signs.
It catches the patterns that drain wallets: phishing domains, typosquats,
unlimited approvals, NFT `setApprovalForAll`, drainer multicalls, and
hidden Permit/permit2 calls. It does **not** replace your wallet, your
hardware key, or your judgment — it augments them.

---

## What we protect against (in scope)

### 1. Phishing & typosquatting
- **Known-drainer domain list** — full-screen red overlay blocks the
  page before you can sign anything.
- **Typosquatted domains** — Levenshtein distance + eTLD+1 + IDN
  (Cyrillic/Latin homoglyph) checks against 17 trusted protocols
  (Uniswap, OpenSea, MetaMask, Rabby, Aave, Curve, etc.).
- **Subdomain impersonation** — `uniswap.org.evil.com` flagged
  even though it contains "uniswap".
- **User-supplied blacklist** — Settings → custom domains/contracts.

### 2. Approval abuse
- **Unlimited ERC-20 approvals** to unknown spenders flagged as
  **CRITICAL**. This is the #1 drain pattern: a single `approve(spender,
  uint256.max)` lets the attacker drain that token later, with no
  further user interaction.
- **`setApprovalForAll`** on NFT collections to unknown operators —
  flagged as **CRITICAL** because it grants root access to every
  token in the collection. This is the Inferno / NFT Trader / PRETEND
  pattern.
- **Cross-chain approval scanning** via public RPC (opt-in) — finds
  old unlimited approvals on chains you forgot about.

### 3. Drainer patterns hidden in innocent-looking txs
- **Multicall V1/V2/V3** decoded recursively (up to 4 levels deep) —
  each sub-call analyzed independently for risk. A safe "claim
  rewards" wrapped around `setApprovalForAll(operator, true)` is
  surfaced as CRITICAL.
- **Universal Router** command-level decoding — flags `PERMIT2_PERMIT`
  (0x03) and `SEAPORT` (0x0f) as high/critical risk because they're
  commonly used in marketplace drainer flows.
- **Native ETH transfers** to unverified EOAs above 1 ETH flagged
  as MEDIUM.

### 4. Hidden signature patterns
- **EIP-712 Permit / Permit2** detection — flags Permit messages that
  grant token allowances without an on-chain `approve` call.
- **Blind `personal_sign`** payloads that hide Permit/Order calls —
  the request is flagged as MEDIUM because legitimate `personal_sign`
  rarely asks for token allowances.

### 5. Unknown / unrecognized methods
- **Any method signature not in our dictionary is shown explicitly**
  with the raw calldata. Never silently passed through. The user
  always sees what they're signing.

---

## What we do NOT protect against (out of scope)

### Compromises outside the extension
- **Malicious wallet extension** that disables or bypasses WalletGuard
  Pro. (If the attacker has code execution in your browser, you're
  already owned.) Mitigation: review extensions, run regular
  malware scans.
- **Compromised MetaMask / Rabby / Frame** itself. We can show you
  what the wallet is being asked to sign, but if the wallet's
  internals are replaced, it may sign something different.
- **Hardware wallet compromise** — Ledger/Trezor firmware bugs are
  out of our model. Mitigation: keep firmware updated, verify the
  address shown on the device screen.
- **OS-level malware** that reads clipboard, keylogs, or steals
  seed phrases. MV3 extensions have no clipboard access.
- **Physical access attacks** — someone with your unlocked laptop
  can disable the extension.

### Protocol-level risks
- **Smart contract vulnerabilities** — even an audited protocol
  (e.g. Cream, Badger, Wintermute) can have logic bugs. We surface
  unknown-method risk; we don't do formal verification.
- **Rug pulls** — a team that builds a legitimate protocol and
  then drains it. There's no on-chain signal before withdrawal.
  Mitigation: check team reputation, vesting, audit reports.
- **51% chain attacks / reorgs** — out of scope for any extension.
- **Cross-chain replay** — different chainIds prevent this; wallet
  responsibility.

### Social engineering (out of band)
- **Discord/Twitter/Telegram impersonation** — "click here to claim
  your airdrop" links sent by compromised friends or fake admins.
  We can't see your chat apps.
- **DNS hijacking of a legitimate domain** — if `uniswap.org` is
  hijacked to serve a drainer, the URL is genuine but the content
  isn't. We flag unknown contracts, but a hijacked DNS could still
  point users to a clone of the legitimate UI.
- **Malicious browser bookmarks** or saved passwords that auto-fill
  phishing sites.

### Operational limitations
- **Single-chain scan via wallet bridge** — without opting into
  multi-chain, the scanner only covers the chain your wallet is
  currently connected to.
- **Approval scan depends on a connected wallet** — without
  `eth_accounts` access, the scanner cannot read your address.
- **Asset Diff Engine is heuristic** — it does not call Tenderly /
  Blocknative simulation. Balance changes are estimated from the
  decoded method + token transfer events.
- **Risk engine is weighted scoring, not ML** — false positives and
  false negatives are both possible. We show every factor so you
  can judge.

---

## Trust assumptions

We rely on the following being honest:

| Component | Why we trust it | What happens if it's not |
|---|---|---|
| **Wallet provider** (`window.ethereum`) | Returns the chainId, address, and signatures the user expects | A compromised wallet could sign different data than what we displayed. Always verify the device screen on a hardware wallet. |
| **Public RPC endpoints** (LlamaRPC, publicnode, official chain RPCs) | Maintained by reputable infrastructure providers (Ankr, publicnode, Base, Arbitrum, Polygon, BNB, Avalanche) | An RPC returning fake data could hide approvals. We do not deduplicate across multiple RPCs per chain; one source of truth per chain. |
| **Domain reputation lists** (PhishTank-style seeds, our hardcoded `SEED_BLACKLIST`) | Maintained as part of the extension's source code; reviewed in PRs | A brand-new drainer domain is not in the list until the next extension update. **Updates are not automatic** — install updates promptly. |
| **`content_scripts` not blocked by the page** | MV3 content scripts inject at `document_start`, before page scripts run | A page could try to race the extension by injecting before `document_start` (impossible with MV3) or by blocking the WebExtension API namespace. |
| **User reads the warning** | The overlay blocks the page until acknowledged | A user who clicks "Sign anyway" anyway has been warned. We don't second-guess; we inform. |
| **DNS resolves correctly** | OS-level resolver returns honest answers | IDN homograph protection covers visual confusion but cannot catch a domain registered on a different TLD that you mistype. |

---

## Known limitations (technical)

- **`eth_getLogs` lookback is capped** at 1M–5M blocks per chain
  (~1–4 months on Ethereum-tier chains, ~2 weeks on Arbitrum).
  Approvals older than that won't appear in the scan. Tune
  `CHAIN_LOOKBACK` in `approval-scanner.js` if you want more.
- **Approval scan requires `eth_accounts`** — if the wallet is
  locked or doesn't expose accounts, the scan fails with a clear
  error message. Not a bug; a requirement.
- **Public RPCs rate-limit or go down** — chains that fail are
  reported as `error` in the scan result; other chains continue.
  No automatic retry across alternate endpoints yet.
- **Seed blacklist is hardcoded (3 addresses)** — kept small on
  purpose to avoid shipping stale or unverified addresses. Add
  custom addresses via Settings.
- **Typosquat dictionary is 17 protocols** — false positives on
  new legitimate protocols are possible. Report them and we'll
  whitelist.
- **No automatic background updates** of the blacklist /
  typosquat dictionary. Extension update cadence is the
  authoritative refresh path.
- **No RPC simulation** — we don't run `eth_call` against
  `tenderly.co` or `blocknative.com`. The Asset Diff Engine is
  estimated from calldata, not simulated state.

---

## Adversary model

An attacker can:

- Register any domain and deploy any contract.
- Build convincing phishing UI that mimics a legitimate dApp.
- Craft calldata that decodes to a safe-looking string but
  contains a drainer sub-call (Multicall / Universal Router).
- Submit Permit2 batch permits that look like routine signatures.
- Publish a "legitimate" protocol, get traction, then rug-pull.
- Spam the user with Discord/Twitter impersonation messages.

An attacker **cannot**:

- Bypass the extension by tampering with it from a webpage
  (no in-page API access to `chrome.runtime`).
- Cause the extension to silently sign anything (we never sign —
  we only display).
- Cause the extension to hide a warning by manipulating the
  DOM after injection (overlay is re-rendered on every
  transaction interception).
- Trick the extension via HTTPS on a blacklisted domain (the
  overlay fires on URL match, not on content).

---

## What you should still do

WalletGuard Pro augments your security; it does not replace these
practices:

1. **Read every warning.** The overlay shows you *why* something is
   risky. If the reason doesn't make sense to you, don't sign.
2. **Verify the URL bar** before signing anything. We catch most
   phishing patterns, but a perfect visual clone of `uniswap.org`
   on a different TLD is theoretically possible.
3. **Use a hardware wallet** for balances you can't afford to lose.
   The extension shows the same data the wallet sees; the device
   is your last line of defense.
4. **Revoke unused approvals** periodically via
   [revoke.cash](https://revoke.cash). The scanner tells you
   *what's exposed*; revoking requires a separate transaction.
5. **Keep your wallet, browser, and OS updated.** Browser-level
   zero-days are out of scope; updates are the primary mitigation.
6. **Don't sign blind signatures you didn't initiate.** A legitimate
   dApp rarely asks you to `personal_sign` raw hex.
7. **Keep this extension updated.** New drain patterns ship in
   extension updates; running an old version means missing the
   latest heuristics.

---

## Reporting security issues

See [`SECURITY.md`](./SECURITY.md) for responsible-disclosure
contact info. We treat threat-model disagreements as bugs — if you
find a drain pattern that bypasses our detection, that's a P1.
