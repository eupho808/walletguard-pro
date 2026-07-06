# Threat Intelligence — How WalletGuard Pro Uses It

WalletGuard Pro uses a **privacy-preserving threat intelligence feed** that
gets smarter the more people use it, without ever sending user data
anywhere. This document explains how it works, what we collect, and
what we never collect.

## TL;DR

- **No backend.** Threats are signed JSON manifests distributed via
  GitHub raw content (`raw.githubusercontent.com`). The browser fetches
  the manifest and verifies Ed25519 signatures **locally** via Web Crypto.
- **No user data leaves the device.** Not a single piece of information
  about you, your wallet, your transactions, your browsing, or your
  IP address is sent to anyone.
- **Community contributions are welcome.** Open a PR with a new signed
  manifest. The maintainer publishes it; users get it on next refresh.

## What is in a threat entry?

Threats are *fingerprints*, not user data:

| Field | Example |
|---|---|
| `type` | `domain`, `address`, `selector`, `bytecode`, `pattern`, `delegate` |
| `value` | `phisher.example` / `0xdeadbeef...` / `0xfb6a74f5` / regex |
| `severity` | `low` / `medium` / `high` / `critical` |
| `category` | `drainer`, `phisher`, `mev-bot`, `honeypot`, `delegation` |
| `name` | human-readable identifier (e.g. "Inferno Drainer 2.0") |
| `reference` | URL to public source / analysis / Etherscan |
| `firstSeen` | ISO 8601 date |
| `notes` | free text |

## What is NEVER in a threat feed?

- Wallet addresses (yours or anyone else's)
- IP addresses
- Transaction hashes
- Signatures
- Personal information of any kind

## Threat feed architecture

```
┌─────────────────────────────────────┐
│ Threat Intelligence Maintainers      │
│ (signed manifest + Ed25519 keys)    │
└─────────────────────────────────────┘
                  │
                  │ publish
                  ▼
┌─────────────────────────────────────┐
│ GitHub: WalletGuard-Pro/feed         │
│  ├── feed-v1.json                    │
│  ├── feed-v2.json                    │
│  └── feed-v3.json                    │
└─────────────────────────────────────┘
                  │
                  │ fetch (HTTPS, public, no auth)
                  ▼
┌─────────────────────────────────────┐
│ WalletGuard Pro Extension (browser)  │
│  1. GET feed-v3.json                 │
│  2. Verify Ed25519 signature locally │
│  3. Build in-memory index            │
│  4. Apply to every intercepted tx    │
└─────────────────────────────────────┘
```

The browser **never** posts to anything. It only GETs a signed, public
manifest. This is the same architecture as Pi-hole, uBlock Origin's
filter lists, and other privacy-respecting tools.

## How to contribute a new threat

Anyone can submit a PR to `WalletGuard-Pro/feed-contrib`. Each entry is
reviewed by a maintainer and signed before publication.

Example submission:

```json
{
  "id": "t-2026-07-06-001",
  "type": "address",
  "value": "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  "severity": "high",
  "category": "drainer",
  "name": "Example Drainer 2026-07",
  "reference": "https://x.com/scam-alert/123",
  "firstSeen": "2026-07-06T00:00:00Z",
  "notes": "Observed drainer operation against Uniswap LP positions"
}
```

## Why we chose this architecture

| Approach | Pros | Cons |
|---|---|---|
| **Backend SaaS (Blockaid, Blowfish)** | Real-time updates, ML models | User data sent to cloud, subscription fees, single point of failure, can't be audited |
| **P2P gossip (libp2p)** | No central server | Heavy browser overhead, IP leak, complex UX |
| **Signed GitHub feed (us)** | No backend, no user data, auditable, MIT-OSS | Update latency (1 refresh cycle), manual review |

We chose the third option because it's the only one that gives us:

1. **Provable privacy** — anyone can read the source code and see that
   no user data is transmitted.
2. **Auditability** — every threat entry has a reference and a
   maintainer signature.
3. **Decentralization** — no single company (us included) controls the
   threat feed. Anyone can fork the feed repo and run their own.
4. **Composability** — other extensions can read the same feed.

## Key rotation

When we rotate the maintainer key, we publish BOTH the old and new
signed manifests for a transition period (30 days). The extension
accepts signatures from EITHER key during the transition window.
After 30 days, the old key is removed from `TRUST_KEYS`.

Trust keys are hard-coded in the extension's `background.js`:

```js
const TRUST_KEYS = {
  "ed25519:<fingerprint>": "<base64-pub-key>",
  // Add new keys here during rotation.
};
```

## Update mechanism

The extension fetches the feed once per browser session (on startup)
and caches it locally. Users can force a refresh via the popup's
"Refresh Threat Feed" button. The cache TTL is 24 hours.

If the user has **opted out**, no fetch happens at all, and no threat
data is loaded into memory.

## Related modules

- `lib/threat-feed.js` — manifest validation, signature verification, lookup
- `lib/eip7702-detector.js` — EIP-7702 delegation safety (feed can
  contribute `delegate` entries)
- `lib/mev-detector.js` — MEV bot tracking (feed can contribute
  `address` entries with category `mev-bot`)
- `lib/session-key-analyzer.js` — session key permissions (feed not yet
  integrated but planned)

## See also

- [SECURITY.md](./SECURITY.md) — bug bounty program
- [PRIVACY.md](./PRIVACY.md) — what we collect (nothing)
- [THREAT_MODEL.md](./THREAT_MODEL.md) — what this extension does and
  does not protect against
