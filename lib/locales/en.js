// lib/locales/en.js - English translations (base locale).
// All other locales fall back to this when a key is missing.

export const MESSAGES = {
  // ---- Common ----
  "common.close": "Close",
  "common.cancel": "Cancel",
  "common.next": "Next",
  "common.back": "Back",
  "common.skip": "Skip",
  "common.done": "Done",
  "common.loading": "Loading...",
  "common.language": "Language",

  // ---- Popup: page title + header ----
  "popup.title": "WalletGuard Pro Dashboard",
  "popup.header.active": "ACTIVE",
  "popup.header.paused": "PAUSED",

  // ---- Popup: safety score ----
  "popup.score.label": "Wallet Safety Score",

  // ---- Popup: stats grid ----
  "popup.stats.sitesScanned": "Sites Scanned",
  "popup.stats.intercepted": "Intercepted",
  "popup.stats.blocked": "Blocked by You",
  "popup.stats.permits": "Permits Caught",

  // ---- Popup: phishing banner ----
  "popup.banner.title": "PHISHING BLOCKED",
  "popup.banner.subtitle": "Malicious sites stopped",

  // ---- Popup: approval scanner ----
  "popup.approvals.title": "Active Token Approvals",
  "popup.approvals.rescan": "Rescan",
  "popup.approvals.total": "Total",
  "popup.approvals.risky": "Risky",
  "popup.approvals.unlimited": "Unlimited",
  "popup.approvals.wallet.none": "no wallet yet",
  "popup.approvals.scanned": "scanned {time}",
  "popup.approvals.scannedNever": "never scanned",
  "popup.approvals.time.justNow": "just now",
  "popup.approvals.time.minutesAgo": "{n}m ago",
  "popup.approvals.time.hoursAgo": "{n}h ago",
  "popup.approvals.time.daysAgo": "{n}d ago",
  "popup.approvals.time.unknown": "unknown",
  "popup.approvals.chains": "({scanned}/{total} chains)",
  "popup.approvals.chain": "({name})",
  "popup.approvals.empty.noWallet": "No wallet detected yet. Make any transaction through WalletGuard and your active approvals will be scanned on the current chain.",
  "popup.approvals.empty.clean": "No active approvals found. Wallet looks clean!",
  "popup.approvals.empty.multiFailed": "No active approvals found, but {failed} chain(s) failed to respond. Try again later.",
  "popup.approvals.scanning": "Scanning",
  "popup.approvals.scanFailed": "Scan failed: {error}",
  "popup.approvals.revokeTitle": "Generate revoke calldata",

  // ---- Popup: NFT scanner ----
  "popup.nft.title": "NFT Collection Access",
  "popup.nft.total": "NFT Approvals",
  "popup.nft.risky": "Risky",
  "popup.nft.empty.scanned": "No active NFT collection approvals. Your NFTs are safe from custody-takeover.",
  "popup.nft.empty.never": "NFT approvals will appear here after your first scan.",

  // ---- Popup: v2.0 Simulation Receipt ----
  "popup.sim.title": "Last Simulation",
  "popup.sim.unknown": "No simulation data yet. Trigger a transaction to see results here.",

  // ---- Popup: v2.0 Address Book ----
  "popup.addrbook.title": "Address Book",
  "popup.addrbook.placeholder": "0x… address",
  "popup.addrbook.labelPlaceholder": "Label",
  "popup.addrbook.add": "Add",
  "popup.addrbook.export": "Export",
  "popup.addrbook.exported": "Copied!",
  "popup.addrbook.exportFailed": "Failed",
  "popup.addrbook.empty": "No entries yet. Label addresses you've interacted with so future transactions show a warning.",
  "popup.addrbook.trust.neutral": "Neutral",
  "popup.addrbook.trust.trusted": "Trusted",
  "popup.addrbook.trust.blocked": "Blocked",

  // ---- Popup: v2.2 Security Center ----
  "popup.sec.title": "Security Center",
  "popup.sec.enabled": "Protection",
  "popup.sec.approvals": "Approvals",
  "popup.sec.stale": "Stale",
  "popup.sec.dna": "DNA",
  "popup.sec.feed": "Threats",
  "popup.sec.autorevoke": "Auto-clean",
  "popup.sec.on": "ON",
  "popup.sec.off": "OFF",
  "popup.sec.feedOptIn": "Enable threat feed",
  "popup.sec.feedOptOut": "✓ Threat feed on",
  "popup.sec.autorevokeOptIn": "Enable auto-clean",
  "popup.sec.autorevokeOptOut": "✓ Auto-clean on",

  // ---- Popup: logs ----
  "popup.logs.title": "Recent Activity",
  "popup.logs.empty": "No activity yet. Browse a dApp to see logs.",

  // ---- Popup: actions ----
  "popup.actions.reset": "Reset stats",
  "popup.actions.settings": "Settings",
  "popup.confirm.reset": "Reset all WalletGuard statistics?",

  // ---- Popup: revoke modal ----
  "popup.revoke.title": "Revoke approval",
  "popup.revoke.leadFallback": "Revoke approval",
  "popup.revoke.transactionData": "Transaction data",
  "popup.revoke.chainLabel": "Chain",
  "popup.revoke.toLabel": "To (token / collection)",
  "popup.revoke.valueLabel": "Value",
  "popup.revoke.dataLabel": "Data",
  "popup.revoke.copy": "Copy calldata",
  "popup.revoke.copied": "Copied!",
  "popup.revoke.copyFailed": "Copy failed",
  "popup.revoke.error.noLib": "Revoke generator not loaded. Reload the popup or update WalletGuard Pro.",
  "popup.revoke.error.generate": "Could not generate revoke calldata: {error}",
  "popup.revoke.error.unknownKind": "Unknown approval kind \u2014 cannot generate a revoke plan.",
  "popup.revoke.note": "WalletGuard Pro does <strong>not</strong> sign transactions. Copy the calldata and broadcast it through your wallet or a tool like <a href=\"#\" id=\"revoke-modal-revoke-cash\" target=\"_blank\" rel=\"noopener noreferrer\">revoke.cash</a>.",
  "popup.revoke.allowanceUnlimited": "Unlimited",

  // ---- Settings: page title + sections ----
  "settings.title": "WalletGuard Pro \u2014 Settings",
  "settings.section.protection": "Protection Status",
  "settings.section.protection.desc": "Master switch for all WalletGuard security layers.",
  "settings.section.multichain": "Multi-Chain Approval Scanner",
  "settings.section.multichain.desc": "When enabled, the approval scanner checks all 9 supported networks in parallel using public RPC endpoints (Ethereum, Optimism, BNB Chain, Polygon, Fantom, Base, Arbitrum, Avalanche, Sepolia). No API key required.",
  "settings.section.ai": "AI Security Core",
  "settings.section.ai.desc": "WalletGuard uses OpenRouter to perform heuristic checks on unknown addresses. Get a free API key at openrouter.ai.",
  "settings.section.approvals": "Approval Scanner",
  "settings.section.approvals.desc": "Reads active token approvals on your wallet's currently-connected chain. No API key required - WalletGuard queries the same RPC node your wallet already uses (MetaMask, Rabby, etc.).",
  "settings.section.approvals.how": "<strong>How it works:</strong> When you click <em>Rescan</em> in the popup, WalletGuard reads historical <code>Approval</code> events from your address via <code>eth_getLogs</code>, then queries the current allowance for each (token, spender) pair via <code>eth_call</code>. Zero-allowance entries are filtered out (revoked approvals). The scan covers whichever chain your wallet is currently on.",
  "settings.section.whitelist": "Trusted Contracts (Whitelist)",
  "settings.section.whitelist.desc": "Addresses that you fully trust. WalletGuard will give them a higher trust score automatically.",
  "settings.section.blacklist": "Custom Blacklist",
  "settings.section.blacklist.desc": "Addresses or domains that you know are malicious. These will be blocked instantly without an AI check.",
  "settings.section.data": "Local Data",
  "settings.section.data.desc": "Statistics, logs, and the AI cache live in your browser. You can wipe them at any time.",
  "settings.footer": "WalletGuard Pro is an independent security layer. It never replaces your wallet, never holds your funds, and never has custody of your keys.",

  // ---- Settings: toggles ----
  "settings.toggle.protection": "Active Protection",
  "settings.toggle.protection.desc": "When off, transactions are not intercepted or analyzed.",
  "settings.toggle.multichain": "Scan All Chains",
  "settings.toggle.multichain.desc": "When off, only the wallet's currently-connected chain is scanned.",
  "settings.toggle.on": "ON",
  "settings.toggle.off": "OFF",

  // ---- Settings: API key ----
  "settings.api.keyLabel": "OpenRouter API Key",
  "settings.api.keyPlaceholder": "sk-or-v1-...",
  "settings.api.show": "Show",
  "settings.api.hide": "Hide",
  "settings.api.save": "Save Key",
  "settings.api.clear": "Clear",
  "settings.api.privacy": "<strong>Privacy:</strong> The API key is stored locally in your browser via <code>chrome.storage.local</code>. It is only sent to OpenRouter when checking addresses. Without a key, only the local blacklist is used.",

  // ---- Settings: whitelist/blacklist ----
  "settings.list.whitelistInput.label": "Add Address (0x... or domain.tld)",
  "settings.list.whitelistInput.placeholder": "0x...",
  "settings.list.blacklistInput.label": "Add Address or Domain",
  "settings.list.blacklistInput.placeholder": "0x... or malicious-site.com",
  "settings.list.add": "Add",
  "settings.list.whitelistEmpty": "No trusted addresses yet.",
  "settings.list.blacklistEmpty": "No custom blacklist entries.",
  "settings.list.remove": "Remove",

  // ---- Settings: data ----
  "settings.data.resetStats": "Reset Statistics",
  "settings.data.clearCache": "Clear AI Cache",

  // ---- Settings: locale + onboarding ----
  "settings.section.appearance": "Appearance & Language",
  "settings.section.appearance.desc": "Choose your language. WalletGuard Pro will use it for the popup, settings, and onboarding tour.",
  "settings.onboarding.replay": "Replay onboarding tour",

  // ---- Settings: toasts ----
  "settings.toast.loadFailed": "Failed to load settings",
  "settings.toast.protectionOn": "Protection enabled",
  "settings.toast.protectionOff": "Protection paused",
  "settings.toast.multichainOn": "Multi-chain scan enabled (all 9 chains)",
  "settings.toast.multichainOff": "Multi-chain scan disabled (current chain only)",
  "settings.toast.apiSaved": "API key saved",
  "settings.toast.apiSaveFailed": "Failed to save API key",
  "settings.toast.apiCleared": "API key cleared",
  "settings.toast.invalidInput": "Invalid format. Use 0x... address or domain.tld",
  "settings.toast.alreadyWhitelisted": "Already in whitelist",
  "settings.toast.addedWhitelist": "Added to whitelist",
  "settings.toast.alreadyBlacklisted": "Already in blacklist",
  "settings.toast.addedBlacklist": "Added to blacklist",
  "settings.toast.statsReset": "Statistics reset",
  "settings.toast.cacheCleared": "AI cache cleared",
  "settings.toast.removed": "Removed {addr}",
  "settings.toast.localeSaved": "Language updated to {name}",

  // ---- Settings: confirm dialogs ----
  "settings.confirm.clearApi": "Clear the OpenRouter API key? AI checks will be disabled.",
  "settings.confirm.resetStats": "Reset all WalletGuard statistics? This cannot be undone.",
  "settings.confirm.clearCache": "Clear the AI address check cache? Future checks will re-query OpenRouter.",

  // ---- Onboarding tour ----
  "onboarding.indicator": "Step {current} of {total}",
  "onboarding.skip": "Skip tour",
  "onboarding.step1.title": "Welcome to WalletGuard Pro",
  "onboarding.step1.body": "Your independent security layer against phishing, drainers, and risky token approvals. Everything runs locally \u2014 no accounts, no tracking.",
  "onboarding.step2.title": "Approval Scanner",
  "onboarding.step2.body": "See all your active ERC-20 and NFT approvals across 9 chains. Risks are auto-classified by severity \u2014 critical, high, medium, low.",
  "onboarding.step3.title": "One-Click Revoke",
  "onboarding.step3.body": "Generate revoke calldata for risky approvals with one click. You sign the transaction in your own wallet \u2014 WalletGuard never touches your keys.",
  "onboarding.step4.title": "You're All Set",
  "onboarding.step4.body": "Open Settings to customize chains, trusted domains, the AI security core, or replay this tour anytime."
};
