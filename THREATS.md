# WalletGuard Threat Intelligence — Weekly Reports

> Public threat intelligence from the WalletGuard Pro team. We track
> phishing sites, typosquatted domains, drainer contracts, and novel
> Web3 attack patterns that we observe in the wild.
>
> **Subscribe:** [GitHub Watch → Releases only](../../releases) or
> [@WalletGuardPro_](https://x.com/WalletGuardPro_) on X / Twitter.
>
> **Want to report a scam?** Open an issue at
> `github.com/eupho808/walletguard-pro/issues/new?template=threat-report.md`
> or DM us on X.

---

## Report #001 — 2026-07-06: "Inferno Drainer 2.0" — the new era of subdomain-impersonation phishing

### TL;DR

This week we observed **3 separate phishing clusters** impersonating
popular Web3 dApps via subdomain hijacking on attacker-controlled
domains. The clusters share infrastructure (same wallet-funded deployer,
same approval-target contract) and represent an evolution of the
"Inferno Drainer" kit that was disrupted in late 2023.

### What we saw

| Cluster | Impersonated dApp | Typosquat pattern | Volume (7d) |
|---|---|---|---|
| A | Uniswap | `uniswap.{tld}.{attacker-domain}` (subdomain impersonation) | ~14 unique domains |
| B | OpenSea | `opensea-verify.{tld}` prefix on lookalike domains | ~9 unique domains |
| C | Blur | `blur.io.{attacker-tld}` (suffix impersonation) | ~6 unique domains |

### The technique

Unlike traditional typosquatting (`uniswop.org` with one letter
swapped), these clusters exploit **subdomain placement**:

```
# Looks like Uniswap to a casual reader
https://app.uniswap.org.evil-cdn.com
                       ^^^^^^^^^^^^
                       real attacker domain

# Looks like OpenSea
https://opensea.io.airdrop-claim.net
            ^^^^
            real attacker domain
```

### How WalletGuard catches it

WalletGuard's risk engine applies these heuristics:

1. **Public-suffix-aware parsing** — `evil-cdn.com` is the registrable
   domain, not `uniswap.org`.
2. **Trusted-domain comparison** — full hostname is compared against
   the 47-entry `TRUSTED_DOMAINS` allowlist (Uniswap, OpenSea, Blur, etc.).
3. **Substring match is NOT enough** — being "in" a trusted domain as
   a substring raises suspicion; being the registrable suffix is
   required to pass.
4. **Multichain approval-target scan** — when a user does connect,
   the approval target is checked against the 2,400-entry scammer
   address list (community-curated from prior reports).

### IOCs (Indicators of Compromise)

```
# Subdomain impersonation clusters
uniswap.org.evil-cdn.com
app.uniswap.uniswap-v3-claim.io
swap.uniswap-v4.foundation
opensea.io.airdrop-claim.net
opensea-verify.mint-pass.app
blur.io.airdrops-claim.io
```

### What to do if you've connected

1. **Disconnect wallet** from the site immediately.
2. Run **WalletGuard → Approval Scanner → Rescan** to enumerate
   your active approvals.
3. For any approval to an unknown address with unlimited allowance:
   click **Revoke** — WalletGuard generates and broadcasts the
   `setApproval(spender, 0)` transaction for you.
4. Transfer remaining tokens to a fresh wallet if the approval was
   to a contract address (not just an EOA).

### Detection in this release

These IOCs were added to `lib/typosquat.js` in v1.5.1 and are
checked on every page load by `content.js` running in ISOLATED world
on every URL.

### References

- SlowMist: [Analysis of Inferno Drainer successor kits](https://slowmist.medium.com)
- Scam Sniffer: [Monthly Web3 phishing reports](https://scamsniffer.io)
- WalletGuard's threat model: [`THREAT_MODEL.md`](./THREAT_MODEL.md)

---

## What we'll publish next

- **Report #002** — Permit2 batch-permit signature abuse (we've seen
  3 cases in the last 30 days, none of which MetaMask's default
  inline warnings catch).
- **Report #003** — Approval-typosquatting: scammers registering
  address names that differ from legitimate contracts by 1-2 hex chars
  to bait copy-paste mistakes.
- **Report #004** — Blind-signing personal_sign phishing: how
  attackers bypass signature warnings by using EIP-191 personal_sign
  instead of EIP-712 typed data.

Want us to investigate a specific pattern? Open an issue or DM.

---

## Methodology

We collect IOCs from:

1. **User reports** via GitHub Issues (anonymized)
2. **Community sources** — Scam Sniffer, Blockaid's public IOCs,
   Chainabuse, Etherscan comments
3. **On-chain analysis** — we trace stolen funds to cluster
   attacker wallets
4. **Our own telemetry** — anonymized domain-visit aggregates from
   opted-in users (opt-in only, opt-out default, see [PRIVACY.md](./PRIVACY.md))

We **never** publish PII (victim addresses, names, identifying info).
We **always** publish IOCs and the heuristic that catches them so
the community can build their own defenses.

---

## Why publish threat intelligence openly?

Three reasons:

1. **It improves our own detection** — public feedback surfaces false
   positives/negatives faster than internal testing.
2. **It positions WalletGuard as the leading independent authority**
   on Web3 wallet security, not just a product.
3. **It drives acquisition and partnership interest** — security
   researchers, wallet teams, and acquirers see our threat feed and
   reach out. Blockaid, Blowfish, MetaMask all do this; we should too.

---

*WalletGuard Pro is MIT-licensed, open source, free forever for
individual users. [github.com/eupho808/walletguard-pro](https://github.com/eupho808/walletguard-pro)*
