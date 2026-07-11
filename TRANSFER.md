# WalletGuard Pro — Transfer

This is a one-page summary for teams evaluating whether to take over
the project. If you got here from a DM or a GitHub link, this answers
the basic questions without you having to read the full README.

---

## What it is

WalletGuard Pro is a **browser-level EVM wallet security layer**. It
sits between your dApp and your wallet, intercepts every transaction
and signature, decodes the calldata, and shows the user the risk
before the wallet processes anything.

Production-ready Chrome and Firefox extension (Manifest V3), built by
a single engineer over multiple self-audit cycles. Released as
**v3.7.0 "EXPIRY"**.

---

## What it includes

**Detection (browser-side, before wallet confirmation):**

- Transaction and signature interception (MAIN-world `window.ethereum` Proxy)
- ERC-20 approval risk analysis
- NFT approval detection (`setApprovalForAll`)
- Permit / Permit2 / Multicall / Universal Router decoding
- Phishing domain detection (known-drainer list + custom blacklist)
- Drainer pattern fingerprinting (function-selector + structural signatures)
- Risk correlation between related actions
- Approval expiry tracking with user-chosen window (default 90 days)
- Bulk revoke transaction generation (multicall calldata)

**Engineering foundation:**

- 1,429 automated tests across 33 suites — all green, plain Node ESM
- 30 protection layers
- 31 security-focused pure-ES modules
- 22+ security issues found and fixed across three internal self-audit cycles
- Zero npm dependencies
- Zero telemetry, zero analytics, zero remote code, zero cookies
- 6 localized languages (en, ru, es, zh, ja, ko)
- Chrome + Firefox compatible architecture
- GitHub Actions CI + opengrep SAST with 7 custom Web3 rules

**Documentation:**

- `README.md` — features, install, architecture
- `THREAT_MODEL.md` — what we protect against and what we don't
- `SELF_AUDIT.md` — every bug found in three review cycles with fixes
- `AUDIT_PACKAGE.md` — 300-line auditor's quickstart with priority review targets and 10 security invariants
- `SECURITY.md` — responsible disclosure policy
- `PRIVACY.md` — what we collect (nothing), what we don't
- `STORE_LISTING.md` — Chrome Web Store submission copy
- `THREATS.md` — published threat intelligence feed

---

## What you'd actually be getting

The repo is MIT — anyone can fork it today. **The transfer fee is not
for the license.** It's for the engineering context behind the code:

- The architecture decisions and tradeoffs in 30 protection layers
  (what we tried, what didn't work, what got rewritten)
- The bug history: 22+ vulnerabilities found across three self-audit
  cycles, the attack vectors, the regression tests, the false-positive
  traps we built defenses against
- The "why" behind MAIN-world vs ISOLATED-world split, content-script
  bundle order, RPC bridge design, security invariants in the injector
- Direct Q&A with the original author on integration into your stack

If you fork the public repo and read every line, you can replicate
this in 2-3 months. **The transfer saves you 2-3 months of context
work** and gives you the regression test base.

---

## Transfer terms

**Price:** $2,000 USD

**Includes:**

- Repository handoff (you become the maintainer of your fork)
- Architecture walkthrough (60-90 min, screen-share)
- Code Q&A (10 hours, used within 30 days)
- Integration guidance for your wallet / security stack
- 22+ bug history writeup (which patterns we catch, why, how)

**Payment:**

- 50% on agreement
- 50% on handoff completion

**Methods:** Wire transfer (USD/EUR) or USDC on Ethereum mainnet.

**License:** The repo stays MIT. You take ownership of your fork and
your downstream distribution. The original repo continues to exist
under the same MIT terms.

---

## Current status (honest)

**What's there:**

- Production-ready Chrome + Firefox extension
- 30 protection layers, all working
- Self-audited (3 cycles, 22+ bugs found and fixed)
- Audit package prepared for external review

**What's not there:**

- External audit (deferred — budget gap)
- Bug bounty pool beyond a $10k Gitcoin pilot
- Trademark registration ("WalletGuard" / "WalletGuard Pro")
- Custom domain (walletguard.pro available, not yet registered)
- Established user base

This is honest infrastructure, not a growth-stage product.

---

## Contact

If you want to explore a transfer:

- **Email:** goddof1995@gmail.com
- **Telegram:** https://t.me/myprofiletelegram
- **GitHub:** https://github.com/eupho808/walletguard-pro/issues

For a 15-20 minute call to walk through the architecture and answer
questions, send a short note with:

1. What you're building (one paragraph)
2. What wallet / security stack you have today
3. Timeline for the integration

I'll reply within 24 hours.

---

**Note on the deal:** I'm exploring options for the project and
looking for a team with the distribution and security resources to
continue its development. The transfer is a clean exit that leaves
the project in good hands and lets you take it the last mile.
