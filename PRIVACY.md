# Privacy Policy — WalletGuard Pro

**Last updated:** 2026-07-05

WalletGuard Pro ("the Extension") is committed to protecting your privacy. This policy explains what data the Extension handles and why.

## Short version

**The Extension does not collect, transmit, or sell your data.** Everything happens locally in your browser. The optional OpenRouter AI feature (off by default) sends only the contract address you explicitly choose to check — never your wallet, transaction data, or browsing history.

---

## What the Extension accesses

### 1. Web3 wallet interactions
The Extension intercepts requests your dApp makes to `window.ethereum` (MetaMask, Rabby, Frame, etc.) for the **sole purpose of analyzing them before they reach the wallet**. This includes:
- Target contract address
- Function selector and calldata
- Value being sent
- Sender address

This data is processed in-memory and **never leaves your machine**.

### 2. Page hostname
The Extension reads `window.location.hostname` from the active tab to:
- Run typosquatting detection against the trusted-domains list
- Detect phishing sites
- Log new domains for your activity history (stored locally)

### 3. Browser storage (`chrome.storage.local`)
The Extension stores the following in your browser's local extension storage:
- Your whitelist and blacklist (contract addresses and domains)
- Approval scan results (token allowances, NFT approvals)
- Activity log (last 50 events)
- Optional: OpenRouter API key (if you choose to enable AI checks)
- Optional: `wg_enabled` and `wg_multiChain` preference flags

This data **never leaves your machine**. It is not synced, not uploaded, not transmitted.

### 4. Public RPC endpoints (multi-chain mode)
When you enable Multi-Chain Approval Scanning (an opt-in toggle, **off by default**), the Extension queries the following public JSON-RPC endpoints to scan your token and NFT approvals across networks:
- `https://eth.llamarpc.com`
- `https://optimism.llamarpc.com`
- `https://polygon-rpc.com`
- `https://mainnet.base.org`
- `https://arb1.arbitrum.io/rpc`
- `https://ethereum-sepolia-rpc.publicnode.com`

The Extension sends standard `eth_blockNumber`, `eth_getLogs`, and `eth_call` requests — these are read-only public chain queries. Your wallet address is included in log filters and call calldata. No other identifying information is sent.

### 5. OpenRouter AI (optional, off by default)
If you explicitly enable AI checks by adding an OpenRouter API key in Settings, the Extension may send a contract address you choose to check to `https://openrouter.ai/`. The full prompt is documented in our source code; it contains the address being checked and an instruction to classify it. OpenRouter's own privacy policy applies to that request.

---

## What the Extension does NOT do

- We do not collect analytics, telemetry, or usage statistics
- We do not use cookies, fingerprinting, or any tracking technology
- We do not transmit your wallet address, transaction history, or browsing history to any server we operate
- We do not sell, share, or rent any data to third parties
- We do not operate any backend server that receives your data
- We do not modify, redirect, or alter network requests

---

## Permissions justification

The Extension requests the following Chrome permissions:
- `storage` — to save your settings and scan results locally
- `alarms` — to periodically refresh the approval scan (every 6 hours)
- Host permissions for the public RPC endpoints listed above — to query them when multi-chain scanning is enabled
- Host permission for `https://openrouter.ai/*` — only used if you opt in to AI checks and explicitly trigger one

We request **no other permissions**. We do not request `tabs`, `webRequest`, `webRequestBlocking`, or any permission that would let us read the content of pages you visit.

---

## Your controls

You can:
- **Disable all protection** — toggle `wg_enabled` off in Settings
- **Clear all local data** — uninstalling the Extension removes all storage
- **Disable multi-chain scanning** — toggle `wg_multiChain` off in Settings
- **Disable AI checks** — leave the OpenRouter API key blank in Settings
- **Edit or delete your whitelist/blacklist** — anytime, in Settings

---

## Children's privacy

The Extension is not directed at children under 13. We do not knowingly collect data from children.

## Changes to this policy

If we change this policy, we will update the "Last updated" date at the top and post a changelog entry in our GitHub repository.

## Contact

For privacy questions or to report a concern, open an issue at:
**https://github.com/yourname/walletguard-pro/issues**

---

## License

The Extension is released under the MIT License. The source code is publicly available and you are free to audit it.

---

**Summary:** We built WalletGuard Pro because we don't trust centralized security vendors with our own wallets. So we wrote this extension to run entirely on your machine, with no telemetry, no account, and no server. If you find any code path that violates this policy, please file an issue — we will treat it as a security bug.
