# Security Policy

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 1.5.x   | :white_check_mark: |
| < 1.5   | :x:                |
| 1.4.x   | :white_check_mark: (critical fixes only) |

Only the latest minor release receives security updates. Please upgrade before reporting.

---

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Email security concerns to: **security@walletguard.pro** (PGP key below).

Include:
1. Description of the vulnerability
2. Steps to reproduce (or a proof-of-concept if you have one)
3. Affected version(s)
4. Potential impact (data leak, RCE, privilege escalation, etc.)

We will:
- Acknowledge within **48 hours**
- Provide a timeline for a fix within **7 days**
- Credit you in the release notes (unless you prefer anonymity)
- Coordinate disclosure timing with you

---

## What counts as a security issue

In scope:
- Bypass of the risk engine (a high-risk transaction being shown as safe)
- Bypass of the phishing / typosquatting detection
- Bypass of the approval scanner (revoked approval reported as active, or vice versa)
- RPC bridge issues (read-only whitelist bypass, injection into `window.ethereum.request`)
- Injection of attacker-controlled content into the WalletGuard overlay
- Privacy leaks (extension sending data to a third-party server we don't document)
- Storage tampering (chrome.storage.local integrity issues)

Out of scope:
- UX bugs (cosmetic issues, layout problems)
- Performance issues (extension is slow)
- Missing features (please use the feature request template)
- Phishing sites themselves (we maintain a seed list, not an exhaustive catalogue)

---

## PGP key

We do not yet publish a PGP key. If you need to encrypt your report, ask in your initial email and we will send a key fingerprint out-of-band.

---

## Security model

WalletGuard Pro is a **defense-in-depth layer**, not a primary security boundary. The user is still the final signer. Our job is to surface the obvious and subtle risks before they reach MetaMask.

For the full breakdown of what we protect against, what we don't, and our trust assumptions, see [`THREAT_MODEL.md`](./THREAT_MODEL.md).

We assume:
- The user's machine is not compromised (an attacker with code execution can disable the extension trivially via `chrome://extensions`)
- The wallet provider behaves correctly (we wrap, we don't replace)
- The RPC node returns honest responses (we trust the user's wallet's RPC or opt-in public RPCs)

We do NOT assume:
- That the user will read everything (the UI is designed for at-a-glance comprehension)
- That the dApp is well-intentioned (we analyse every transaction regardless of source)
- That the contract is verified (we explicitly flag unverified contracts)

---

## Hardening notes for the curious

- The extension runs at `document_start` so it can wrap `window.ethereum` before any dApp script sees the unwrapped object.
- The MAIN-world RPC bridge accepts only methods in the `READ_ONLY_METHODS` whitelist in `injector.js`. Adding a new method there requires a security review.
- `chrome.storage.local` is sandboxed per-extension. We never use `localStorage`, `sessionStorage`, or cookies.
- The optional OpenRouter integration is **off by default** and only sends the contract address you explicitly choose to check — never your wallet, transaction, or any other data.

---

## Internal review

For our own security review of v1.5.x — methodology, findings by
severity (Critical / High / Medium / Low / Info), fixes applied,
regression tests, residual risks, and recommendations for v1.6.0 —
see [`SELF_AUDIT.md`](./SELF_AUDIT.md). This is a **self-audit**;
a third-party audit is on the roadmap but not yet commissioned.

---

## Bug bounty program

We run a **community-funded bug bounty** via Gitcoin Grants. Bounties
are paid in USDC on Ethereum mainnet.

| Severity | Example | Bounty |
|---|---|---|
| **Critical** | Bypass of risk engine (high-risk tx shown as safe) | $5,000 |
| **High** | Bypass of phishing detection | $2,000 |
| **Medium** | Storage tampering, cache poisoning | $500 |
| **Low** | UX information disclosure | $100 |
| **Info** | Code quality, defense-in-depth suggestions | $25 + credit |

**Eligibility:** Anyone (except current WalletGuard Pro team members
and their immediate family). Reports must follow the disclosure
process above. Duplicates paid to first reporter only.

**Payment:** Within 14 days of fix deployment, on-chain via USDC
on Ethereum mainnet to a wallet you provide.

**Status:** Pilot program. Funded by Gitcoin Grants matching pool.
Bounty pool currently: $10,000 (rolling).

To apply to expand the bounty pool or sponsor a specific bounty
category, contact security@walletguard.pro.

---

## Audit roadmap

| Q3 2026 | Self-audit (DONE) — [SELF_AUDIT.md](./SELF_AUDIT.md) |
| Q4 2026 | Third-party audit by [Trail of Bits / OpenZeppelin / Code4rena] (TBD) |
| Q1 2027 | Bug bounty tier-1 launch with $50k pool |
| Q2 2027 | Continuous audit relationship (re-review every major release) |

Until the third-party audit is complete, treat WalletGuard Pro as
**defense-in-depth, not primary security**. Always verify critical
transactions through multiple sources.

---

## Hall of fame

Security researchers who have reported valid issues (current as of v1.5.2):

*None yet — be the first.*

If you report a valid issue, you'll be listed here (or kept anonymous
on request). We acknowledge every report within 48 hours.
