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
  "onboarding.step1.title": "Welcome",
  "onboarding.step1.body": "WalletGuard watches every transaction before it reaches your wallet. 29 protection layers run in your browser.",
  "onboarding.step2.title": "Approvals",
  "onboarding.step2.body": "Open the Token permissions section to scan every approval across 13 chains. Unlimited grants and unknown contracts surface as risks.",
  "onboarding.step3.title": "Cleanup",
  "onboarding.step3.body": "Use Bulk revoke to clear stale approvals in a single transaction per token. You sign, WalletGuard never holds keys.",
  "onboarding.skip": "Skip",
  "onboarding.next": "Next",
  "onboarding.done": "Got it",

  // ---- Popup: page title + header ----
  "popup.title": "WalletGuard Pro",
  "popup.status.protected": "Protected",
  "popup.status.paused": "Paused",
  "popup.header.active": "Active",
  "popup.header.paused": "Paused",

  // ---- Popup: hero state captions ----
  "popup.state.protected": "Everything looks good.",
  "popup.state.caution": "Some risky activity detected.",
  "popup.state.atRisk": "Multiple warnings — review activity.",
  "popup.state.danger": "Critical risks present — verify every transaction.",

  // ---- Popup: section titles ----
  "popup.section.protection": "Protection",
  "popup.section.activity": "Recent activity",
  "popup.section.tokenPermissions": "Token permissions",
  "popup.section.nftPermissions": "NFT permissions",
  "popup.section.addressBook": "Address book",
  "popup.section.portfolio": "Portfolio",
  "popup.section.bulkRevoke": "Quick cleanup",
  "popup.portfolio.atRisk": "At risk",
  "popup.portfolio.risky": "Risky / unlimited / stale",
  "popup.bulkRevoke.desc": "Revoke stale and risky approvals in one transaction per token.",
  "popup.bulkRevoke.button": "Generate bulk revoke",
  "popup.bulkRevoke.title": "Bulk revoke plan",
  "popup.bulkRevoke.note": "WalletGuard generates the multicall calldata. You broadcast each transaction yourself — we never hold keys.",
  "popup.bulkRevoke.copyAll": "Copy all",
  "popup.bulkRevoke.copied": "Plan copied to clipboard.",
  "popup.bulkRevoke.copyFailed": "Copy failed.",
  "popup.bulkRevoke.approvals": "approvals",
  "popup.bulkRevoke.transactions": "transactions",
  "popup.bulkRevoke.ready": "ready to revoke across",
  "popup.bulkRevoke.noCandidates": "No stale or risky approvals to bulk-revoke.",
  "popup.section.expiry": "Expired approvals",
  "popup.expiry.summary": "Tracked",
  "popup.expiry.expired": "expired",
  "popup.expiry.stale": "stale",

  // ---- Popup: protection checks ----
  "popup.check.protection": "Protection enabled",
  "popup.check.threats": "Threat intelligence",
  "popup.check.cleanup": "Auto cleanup",
  "popup.check.dna": "Behavioral DNA",

  "popup.value.enabled": "Enabled",
  "popup.value.disabled": "Disabled",

  // ---- Popup: permissions ----
  "popup.permissions.notScanned": "Not scanned yet",
  "popup.permissions.noApprovals": "No active approvals",
  "popup.permissions.scanning": "Scanning\u2026",
  "popup.permissions.scanDone": "Approval scan complete",
  "popup.permissions.scanFailed": "Scan failed: {error}",
  "popup.permissions.noNft": "No active approvals",
  "popup.permissions.allSafe": "All {total} look safe",
  "popup.permissions.riskyCount": "{risky} risky of {total}",

  // ---- Popup: activity ----
  "popup.activity.empty": "No activity yet.",

  // ---- Popup: address book ----
  "popup.addressBook.placeholder": "0x\u2026",
  "popup.addressBook.label": "Label",
  "popup.addressBook.add": "Add",
  "popup.addressBook.export": "Export",
  "popup.addressBook.trust.neutral": "Neutral",
  "popup.addressBook.trust.trusted": "Trusted",
  "popup.addressBook.trust.blocked": "Blocked",
  "popup.addressBook.empty": "No saved addresses.",

  // ---- Popup: connected wallet ----
  "popup.wallet.label": "Connected",
  "popup.wallet.notDetected": "No wallet detected yet \u2014 send a transaction to populate.",
  "popup.wallet.alerts": "{count, plural, =0{No new alerts} =1{1 new alert} other{# new alerts}}",

  // ---- Popup: footer ----
  "popup.footer.reset": "Reset statistics",
  "popup.footer.settings": "Settings",

  // ---- Popup: toasts ----
  "popup.toast.statsReset": "Stats reset",
  "popup.toast.added": "Added to address book",
  "popup.toast.removed": "Removed",
  "popup.toast.invalidAddress": "Invalid address",
  "popup.toast.addFailed": "Could not add address",
  "popup.toast.exported": "Copied to clipboard",
  "popup.toast.exportFailed": "Could not export",

  // ---- Popup: revoke modal ----
  "popup.revoke.title": "Revoke",
  "popup.revoke.chain": "Chain",
  "popup.revoke.to": "To",
  "popup.revoke.value": "Value",
  "popup.revoke.data": "Data",
  "popup.revoke.note": "WalletGuard never signs transactions. Copy the calldata and broadcast it yourself or via ",
  "popup.revoke.copy": "Copy",
  "popup.revoke.copied": "Copied",
  "popup.revoke.copyFailed": "Copy failed",

  // ---- Popup: safety score ----
  "popup.score.label": "Wallet Safety Score",
  "popup.score.titleProtected": "Protected",
  "popup.score.captionSafe": "All systems operational",
  "popup.score.titleCaution": "Caution",
  "popup.score.captionCaution": "Some risky activity detected",
  "popup.score.titleAtRisk": "At risk",
  "popup.score.captionAtRisk": "Multiple warnings — review activity",
  "popup.score.titleDanger": "Danger",
  "popup.score.captionDanger": "Critical risks present — verify every tx",

  // ---- Popup: toasts ----
  "popup.toast.statsReset": "Stats reset",
  "popup.toast.scanComplete": "Scan complete",
  "popup.toast.scanFailed": "Scan failed",
  "popup.toast.enabled": "Enabled",
  "popup.toast.disabled": "Disabled",
  "popup.toast.added": "Added to address book",
  "popup.toast.removed": "Removed from address book",
  "popup.toast.invalidAddress": "Invalid address",
  "popup.toast.addFailed": "Failed to add",

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

  // ---- Settings: notifications ----
  "settings.section.notifications": "Notifications",
  "settings.section.notifications.desc": "Choose when WalletGuard should interrupt you with a desktop notification.",
  "settings.toggle.desktopNotifications": "Desktop alerts",
  "settings.toggle.desktopNotifications.desc": "Show a Chrome notification when phishing is blocked or a critical risk is detected.",
  "settings.toggle.threatFeed": "Threat intelligence feed",
  "settings.toggle.threatFeed.desc": "Pull a community-maintained list of known-malicious addresses (signed, served from GitHub).",
  "settings.toggle.approvalExpiry": "Approval expiry reminders",
  "settings.toggle.approvalExpiry.desc": "Track how long you've held each approval. Surface ones older than your chosen window so you can revoke or renew them.",
  "settings.toggle.approvalExpiry.days": "Expiry window (days)",
  "settings.toast.expirySaved": "Expiry window saved.",
  "settings.toast.expiryFailed": "Failed to save expiry window.",

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
  "settings.data.exportSettings": "Export Settings",
  "settings.data.importSettings": "Import Settings",

  // ---- Settings: locale + onboarding ----
  "settings.section.appearance": "Appearance & Language",
  "settings.section.appearance.desc": "Choose your language. WalletGuard Pro will use it for the popup and settings.",
  "settings.replayOnboarding": "Replay onboarding tour",
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
  "settings.toast.replayOnboarding": "Onboarding will replay next time you open the popup.",
  "settings.toast.replayOnboardingFailed": "Failed to reset onboarding state.",
  "settings.toast.notificationsOn": "Desktop alerts enabled",
  "settings.toast.notificationsOff": "Desktop alerts muted",
  "settings.toast.threatFeedOn": "Threat feed enabled (refreshing manifest...)",
  "settings.toast.threatFeedOff": "Threat feed disabled",
  "settings.toast.settingsCopied": "Settings JSON copied to clipboard",
  "settings.toast.settingsExported": "Settings file downloaded",
  "settings.toast.settingsImported": "Imported {count} settings keys \u2014 reloading...",
  "settings.toast.exportFailed": "Export failed",
  "settings.toast.importFailed": "Import failed \u2014 invalid JSON?",
  "settings.toast.exportExcluded": "Excluded sensitive keys: {keys}",

  // ---- Settings: confirm dialogs ----
  "settings.confirm.clearApi": "Clear the OpenRouter API key? AI checks will be disabled.",
  "settings.confirm.resetStats": "Reset all WalletGuard statistics? This cannot be undone.",
  "settings.confirm.clearCache": "Clear the AI address check cache? Future checks will re-query OpenRouter.",
  "settings.confirm.importSettings": "Import will overwrite all your current settings. Continue?",

  // ---- Onboarding tour ----
  "onboarding.indicator": "Step {current} of {total}",
  "onboarding.skip": "Skip tour",
  "onboarding.step1.title": "Welcome to WalletGuard Pro",
  "onboarding.step1.body": "The most comprehensive Web3 wallet security extension ever built. 20 protection layers \u2014 phishing, drainers, MEV, EIP-7702, session keys, hardware wallets, and more. Everything runs locally. No accounts, no tracking.",
  "onboarding.step1.bullets": "Independent security layer|0 dependencies, 100% open source|MIT licensed",
  "onboarding.step2.title": "Real-Time Transaction Analysis",
  "onboarding.step2.body": "Every transaction is decoded, simulated, and scored before it reaches your wallet. We catch unlimited approvals, hidden multicalls, permit signatures, and unknown calldata.",
  "onboarding.step2.bullets": "eth_call simulation against your RPC|Uniswap V3 exact swap quotes|MEV sandwich detection|Live MEV bot blacklists",
  "onboarding.step3.title": "20 Attack Surfaces Covered",
  "onboarding.step3.body": "Typosquatting, drainer patterns, visual phishing clones, wallet DNA anomalies, hardware wallet rules, Safe multi-sig analysis \u2014 if it can drain your wallet, we detect it.",
  "onboarding.step3.bullets": "EIP-7702 delegation (NEW in Pectra)|Visual pHash DOM fingerprinting|Behavioral DNA learning|Stale approval auto-cleanup",
  "onboarding.step4.title": "You're All Set",
  "onboarding.step4.body": "Browse any dApp to see WalletGuard in action. Open Settings any time to customize chains, trusted domains, the threat feed, and replay this tour.",
  "onboarding.step4.bullets": "Replay tour from Settings|Help us improve: github.com/eupho808/walletguard-pro|Tweet @WalletGuardPro_ with feedback"
};
