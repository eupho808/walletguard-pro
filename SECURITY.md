# Security Policy

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 1.5.x   | :white_check_mark: |
| < 1.5   | :x:                |

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
