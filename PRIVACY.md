# Privacy Policy — WalletGuard Pro

**Last updated:** 2026-07-11 (v3.7.0)

WalletGuard Pro ("the Extension") is committed to protecting your privacy.
This policy explains what data the Extension handles, where it goes, and
what you can control.

---

## Short version

**The Extension does not collect, transmit, or sell your data.** Everything
runs locally in your browser. The Extension has no backend server, no
account system, and no analytics. The only network requests it makes are:

1. **Your wallet's own RPC** — via the standard Web3 provider interface
   (`window.ethereum.request`), used for read-only chain queries (single-
   chain mode, default).
2. **Public RPC endpoints** — 10 community-run JSON-RPC nodes, used only
   when you explicitly opt in to Multi-Chain Approval Scanning.
3. **OpenRouter AI** — only if you add your own API key and explicitly
   trigger an address check. Sends only the address string.

That's it. No telemetry, no ping, no install beacon, no update check, no
crash reporting.

---

## What the Extension accesses

### 1. Web3 wallet interactions

The Extension intercepts requests your dApp makes to `window.ethereum`
(MetaMask, Rabby, Frame, etc.) for the **sole purpose of analyzing them
before they reach the wallet**. This includes:

- Target contract address
- Function selector and calldata
- Value being sent (in wei)
- Sender address (`from`)

This data is processed in-memory and **never leaves your machine**.

### 2. Page hostname

The Extension reads `window.location.hostname` from the active tab to:

- Run typosquatting detection against the trusted-domains list
- Detect phishing sites
- Update your local activity counters (host count, blocked count, etc.)

The hostname is stored in two places, both local:
- `wg_sessionHosts` (in-memory list of hosts seen this session, for dedup)
- `wg_stats` counters (incremented locally, never uploaded)

The hostname is **never sent to any server** we operate or any third
party.

### 3. Browser storage (`chrome.storage.local`)

All persistent state lives in `chrome.storage.local`, which is sandboxed
per-extension and accessible only to the Extension on your device. The
full list of keys:

| Key | What it stores |
|---|---|
| `wg_enabled` | Boolean: is protection active? |
| `wg_multiChain` | Boolean: opt-in multi-chain scanning (default `false`) |
| `wg_stats` | Local counters: scanned sites, intercepted txs, blocked txs, warnings, permits detected, phishing blocked |
| `wg_logs` | Last 50 event log entries (timestamp + message, capped 240 chars each) |
| `wg_whitelist` | Contract addresses you trust |
| `wg_customBlacklist` | Contract addresses you block |
| `wg_aiCache` | Cached OpenRouter responses keyed by contract address (24h TTL) |
| `wg_approvalScan` | Last approval scan result + summary (6h TTL) |
| `wg_lastWalletAddress` | Most recent `from` address seen |
| `wg_lastReceipt` | Last transaction analysis receipt (for popup display) |
| `wg_addressBook` | Your address book: `{ addr: { label, trust, tags, note } }` |
| `wg_dnaProfiles` | Per-wallet behavioral profiles (capped at 50 wallets) |
| `wg_threatFeed` | Cached signed threat-feed manifest + lookup index (infrastructure present, no active feed subscription yet) |
| `wg_threatFeedEnabled` | Boolean: opt-in toggle for threat feed (default `false`) |
| `wg_autoRevokeOptedIn` | Boolean: opted in to stale-approval alerts |
| `wg_staleApprovals` | Detected stale approvals awaiting your action |
| `wg_lastAutoRevokeCheck` | ISO timestamp of last auto-revoke scan |
| `wg_notificationsEnabled` | Boolean: master toggle for desktop notifications |
| `wg_onboardingCompleted` | Boolean: 3-step onboarding tour flag |
| `wg_approvalExpiry` | Opt-in approval expiry state: `{ enabled, expiryDays, records }` |
| `wg_apiKey` | **Your OpenRouter API key** (only if you choose to add one) |

Implicit keys (written by the runtime, not declared in `STORAGE_KEYS`):

| Key | What it stores |
|---|---|
| `wg_sessionHosts` | Hostnames seen this session (ephemeral, for stat dedup) |
| `wg_locale` | Your language override (e.g. `"en"`, `"ko"`) |

**No data is ever uploaded, synced, or transmitted off your device.**
Settings export (`Export settings`) omits `wg_apiKey` and other
sensitive keys via the `SENSITIVE_KEYS` allowlist.

### 4. Tab-scoped session storage (`sessionStorage`)

The content script uses `sessionStorage` in the page's own origin for one
purpose only: deduplicating hostnames seen within a single tab session.
This data:

- Is scoped to the originating tab's origin
- Is cleared when the tab closes
- Contains only hostnames the page itself already knows
- Never leaves the tab

### 5. Public RPC endpoints (multi-chain mode)

When you enable Multi-Chain Approval Scanning (an opt-in toggle, **off
by default**), the Extension queries the following public JSON-RPC
endpoints to scan your token and NFT approvals across networks:

| Chain | RPC URL |
|---|---|
| Ethereum | `https://eth.llamarpc.com` |
| Optimism | `https://optimism.llamarpc.com` |
| BNB Chain | `https://bsc-dataseed.bnbchain.org` |
| Polygon | `https://polygon-rpc.com` |
| Fantom | `https://fantom.publicnode.com` |
| Base | `https://mainnet.base.org` |
| Arbitrum | `https://arb1.arbitrum.io/rpc` |
| Avalanche | `https://api.avax.network/ext/bc/C/rpc` |
| Sepolia (testnet) | `https://ethereum-sepolia-rpc.publicnode.com` |

These are all **public, free, community-run endpoints**. The Extension
sends standard `eth_blockNumber`, `eth_getLogs`, and `eth_call` requests
— these are read-only public chain queries. Your wallet address is
included in log filters and call calldata (this is necessary to look up
your approvals). No other identifying information is sent.

**Note on additional chains:** The Extension defines 4 more chains
(zkSync Era, Linea, Blast, Mode) in its scanner registry but does not
yet declare their host permissions in `manifest.json`. In single-chain
mode (the default), this is irrelevant — your wallet's own RPC is used.
In multi-chain mode, these 4 chains are skipped because the service
worker cannot reach them without explicit host permission. This is a
known gap and will be addressed in a future release.

### 6. OpenRouter AI (optional, off by default)

If you explicitly enable AI checks by adding an OpenRouter API key in
Settings, the Extension may send a contract address you choose to check
to `https://openrouter.ai/`. The full request:

- **URL:** `https://openrouter.ai/api/v1/chat/completions`
- **Method:** POST
- **Headers:** `Authorization: Bearer <your key>`, `HTTP-Referer: https://walletguard.pro`,
  `X-Title: WalletGuard Pro`
- **Body:** Standard chat-completion prompt containing the address string
  and a classification instruction. **No wallet data, no transaction
  data, no browsing data.**
- **Model:** `google/gemini-2.5-flash` (hardcoded)
- **Caching:** Responses are cached locally in `wg_aiCache` for 24 hours
  per address.

OpenRouter's own [privacy policy](https://openrouter.ai/privacy) applies
to the request they receive. We do not see, log, or store the response
beyond the local cache.

---

## What the Extension does NOT do

- We do not collect analytics, telemetry, crash reports, or usage statistics
- We do not use cookies, fingerprinting, or any tracking technology
- We do not transmit your wallet address, transaction history, or browsing history to any server we operate
- We do not sell, share, or rent any data to third parties
- We do not operate any backend server that receives your data
- We do not modify, redirect, or alter network requests (we observe and intercept `window.ethereum.request`, we do not rewrite arbitrary HTTP traffic)
- We do not load or execute remote JavaScript at runtime — all code is bundled into the extension package at build time
- We do not ping home on install, update, or startup

---

## Permissions justification

The Extension requests the following Chrome permissions:

| Permission | Why |
|---|---|
| `storage` | Save your settings and scan results locally in `chrome.storage.local` |
| `alarms` | Schedule periodic approval rescans (every 6 hours) and auto-revoke checks (every 24 hours) |
| `notifications` | Show desktop notifications when phishing or dangerous sites are detected |

**Host permissions** (10 total, all opt-in or required for declared functionality):

| Host | When contacted |
|---|---|
| `https://openrouter.ai/*` | Only if you add an OpenRouter API key and trigger a check |
| `https://eth.llamarpc.com/*` | Multi-chain mode |
| `https://optimism.llamarpc.com/*` | Multi-chain mode |
| `https://bsc-dataseed.bnbchain.org/*` | Multi-chain mode |
| `https://polygon-rpc.com/*` | Multi-chain mode |
| `https://fantom.publicnode.com/*` | Multi-chain mode |
| `https://mainnet.base.org/*` | Multi-chain mode |
| `https://arb1.arbitrum.io/*` | Multi-chain mode |
| `https://api.avax.network/*` | Multi-chain mode |
| `https://ethereum-sepolia-rpc.publicnode.com/*` | Multi-chain mode (Sepolia testnet) |

We request **no other permissions**. We do not request `tabs`,
`webRequest`, `webRequestBlocking`, `cookies`, `history`, or any
permission that would let us read the content of pages you visit.

The Extension's content scripts run on `<all_urls>` at `document_start`
because the security interceptor must wrap `window.ethereum` before any
dApp script sees the unwrapped object. The injector (`injector.js`,
MAIN world) and the analyzer (`content.js`, ISOLATED world) only read
what `window.ethereum` exposes and `location.hostname` — nothing else.

---

## Your controls

You can:

- **Disable all protection** — toggle `wg_enabled` off in Settings
- **Clear all local data** — uninstalling the Extension removes all `chrome.storage.local` entries; there is nothing stored on any server
- **Disable multi-chain scanning** — toggle `wg_multiChain` off in Settings (default)
- **Disable AI checks** — leave the OpenRouter API key blank in Settings
- **Disable threat-feed lookups** — toggle `wg_threatFeedEnabled` off in Settings (default)
- **Disable desktop notifications** — toggle `wg_notificationsEnabled` off in Settings
- **Edit or delete your whitelist/blacklist/address book** — anytime, in Settings
- **Export settings** — Settings → Export downloads a JSON snapshot; sensitive keys (`wg_apiKey`) are excluded

---

## Children's privacy

The Extension is not directed at children under 13 (or under the age
defined by your local jurisdiction). We do not knowingly collect data
from children.

## Changes to this policy

If we change this policy in a way that affects what data is collected
or transmitted, we will:

1. Update the "Last updated" date at the top
2. Add an entry to `CHANGELOG.md`
3. Surface a one-time in-extension notice on next update

Trivial edits (typo fixes, clarifications) will not trigger the notice.

## Contact

For privacy questions or to report a concern:

- **GitHub issue:** https://github.com/eupho808/walletguard-pro/issues
- **Security disclosures:** `security@walletguard.pro` (see [SECURITY.md](./SECURITY.md))

---

## License

The Extension is released under the MIT License. The source code is
publicly available at https://github.com/eupho808/walletguard-pro and
you are free to audit it, fork it, or build on it.

---

**Summary:** WalletGuard Pro exists because we do not trust centralized
security vendors with our own wallets. So we wrote this extension to
run entirely on your machine, with no telemetry, no account, no server,
and no remote code. If you find any code path that violates this
policy, please file an issue — we will treat it as a security bug.
