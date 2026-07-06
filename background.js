// background.js - WalletGuard Pro Service Worker
// Handles: persistent state, OpenRouter AI checks, statistics, message routing,
// and periodic approval scans via Blockscout.

// Diagnostic: confirm SW actually loaded (visible in chrome://extensions → service worker → inspect)
console.log("[WalletGuard] background.js loaded, manifest version:", chrome.runtime.getManifest().version);

// Load scanner module. Wrapped so SW can still register even if scanner fails to load.
try {
  importScripts("approval-scanner.js");
  console.log("[WalletGuard] approval-scanner.js loaded");
} catch (e) {
  console.warn("[WalletGuard] approval-scanner.js failed to load:", e && e.message);
}

const STORAGE_KEYS = {
  API_KEY: "wg_apiKey",
  STATS: "wg_stats",
  LOGS: "wg_logs",
  WHITELIST: "wg_whitelist",
  CUSTOM_BLACKLIST: "wg_customBlacklist",
  ENABLED: "wg_enabled",
  MULTICHAIN: "wg_multiChain",               // opt-in: scan all chains via public RPCs
  AI_CACHE: "wg_aiCache",
  APPROVAL_SCAN: "wg_approvalScan",          // last scan result + summary
  LAST_WALLET: "wg_lastWalletAddress",       // most recent `from` we saw
  LAST_RECEIPT: "wg_lastReceipt",            // v2.0: last intercepted tx analysis (popup display)
  ADDRESS_BOOK: "wg_addressBook",            // v2.0: local address labels { addr: { label, trust, tags } }
  DNA_PROFILES: "wg_dnaProfiles",            // v2.1: per-wallet behavioral profiles
  THREAT_FEED: "wg_threatFeed",              // v2.1: cached threat feed manifest
  THREAT_FEED_ENABLED: "wg_threatFeedEnabled" // v2.1: user opt-in to community feed
};

const MAX_LOGS = 50;
const AI_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const APPROVAL_SCAN_TTL_MS = 1000 * 60 * 60 * 6; // 6h
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const APPROVAL_SCAN_ALARM = "wg_approvalScanAlarm";

// ---------- DEFAULT STATE ----------

const DEFAULT_STATS = {
  scannedSites: 0,
  interceptedTransactions: 0,
  blockedTransactions: 0,
  warningsShown: 0,
  permitsDetected: 0,
  phishingBlocked: 0
};

// ---------- HELPERS ----------

function nowIso() {
  return new Date().toISOString();
}

async function getStorage(key, fallback) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : fallback);
    });
  });
}

async function setStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

async function appendLog(message) {
  const logs = await getStorage(STORAGE_KEYS.LOGS, []);
  const entry = { time: nowIso(), message };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  await setStorage(STORAGE_KEYS.LOGS, logs);
}

async function bumpStat(name, delta = 1) {
  const stats = await getStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS });
  stats[name] = (stats[name] || 0) + delta;
  await setStorage(STORAGE_KEYS.STATS, stats);
  return stats;
}

async function getCachedAi(address) {
  const cache = await getStorage(STORAGE_KEYS.AI_CACHE, {});
  const entry = cache[address.toLowerCase()];
  if (!entry) return null;
  if (Date.now() - entry.ts > AI_CACHE_TTL_MS) return null;
  return entry.result;
}

async function setCachedAi(address, result) {
  const cache = await getStorage(STORAGE_KEYS.AI_CACHE, {});
  cache[address.toLowerCase()] = { ts: Date.now(), result };
  await setStorage(STORAGE_KEYS.AI_CACHE, cache);
}

// ---------- INIT ----------

try {
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      await setStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS });
      await setStorage(STORAGE_KEYS.LOGS, []);
      await setStorage(STORAGE_KEYS.WHITELIST, []);
      await setStorage(STORAGE_KEYS.CUSTOM_BLACKLIST, []);
      await setStorage(STORAGE_KEYS.ENABLED, true);
      await appendLog("WalletGuard Pro installed. Open settings to add your OpenRouter API key.");
    } else if (details.reason === "update") {
      await appendLog(`WalletGuard Pro updated to ${chrome.runtime.getManifest().version}.`);
    }
    // Periodic approval rescan (every 6h) — survives MV3 SW sleep.
    try { chrome.alarms.create(APPROVAL_SCAN_ALARM, { periodInMinutes: 360 }); } catch (e) { console.warn("[WalletGuard] alarm create failed:", e && e.message); }
  });
} catch (e) { console.error("[WalletGuard] onInstalled listener failed:", e && e.message); }

// Service worker startup (MV3) - also reschedule alarm in case it was wiped.
try {
  chrome.runtime.onStartup.addListener(() => {
    try { chrome.alarms.create(APPROVAL_SCAN_ALARM, { periodInMinutes: 360 }); } catch (e) { console.warn("[WalletGuard] alarm create failed:", e && e.message); }
  });
} catch (e) { console.error("[WalletGuard] onStartup listener failed:", e && e.message); }

// Background alarm handler: silently refresh the approval scan if we know a wallet.
try {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== APPROVAL_SCAN_ALARM) return;
    const wallet = await getStorage(STORAGE_KEYS.LAST_WALLET, "");
    const cached = await getStorage(STORAGE_KEYS.APPROVAL_SCAN, null);
    if (!wallet || !cached) return;
    // Skip if cache is fresh.
    if (Date.now() - new Date(cached.scannedAt).getTime() < APPROVAL_SCAN_TTL_MS) return;
    try {
      await runApprovalScan(wallet, /* force */ false);
    } catch (e) {
      // Silent - alarm handler should not throw.
    }
  });
} catch (e) { console.error("[WalletGuard] onAlarm listener failed:", e && e.message); }

// ---------- AI ADDRESS CHECK ----------

async function aiCheckAddress(address) {
  const apiKey = await getStorage(STORAGE_KEYS.API_KEY, "");
  if (!apiKey) {
    return { isSpam: false, source: "no-api-key", reason: "OpenRouter API key not configured" };
  }

  const cached = await getCachedAi(address);
  if (cached) return { ...cached, source: "cache" };

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://walletguard.pro",
        "X-Title": "WalletGuard Pro"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are a Web3 security expert. Analyze the given crypto wallet/contract address. If it is a known malicious phisher, drainer, scammer, or malicious smart contract, reply with JSON: {\"malicious\": true, \"reason\": \"<short reason>\"}. If it is unknown or appears safe, reply with JSON: {\"malicious\": false, \"reason\": \"no indicators\"}. Return ONLY valid JSON, no prose."
          },
          { role: "user", content: `Analyze this address: ${address}` }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      await appendLog(`OpenRouter HTTP ${response.status}: ${text.slice(0, 80)}`);
      return { isSpam: false, source: "http-error", reason: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { malicious: false, reason: "unparseable" };
    }

    const result = {
      isSpam: parsed.malicious === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : "no reason"
    };

    await setCachedAi(address, result);
    return { ...result, source: "openrouter" };
  } catch (err) {
    await appendLog(`AI check failed: ${err.message}`);
    return { isSpam: false, source: "network-error", reason: err.message };
  }
}

// ---------- MESSAGE ROUTER ----------

try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async response
  });
} catch (e) { console.error("[WalletGuard] onMessage listener failed:", e && e.message); }

async function handleMessage(message, sender) {
  if (!message || typeof message.action !== "string") {
    return { error: "invalid message" };
  }

  switch (message.action) {

    // --- Site analytics ---
    case "siteAnalyzed": {
      if (message.host) {
        const stats = await getStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS });
        // Only count first visit per session per host (light dedupe)
        const sessionHosts = await getStorage("wg_sessionHosts", []);
        if (!sessionHosts.includes(message.host)) {
          sessionHosts.push(message.host);
          await setStorage("wg_sessionHosts", sessionHosts);
          stats.scannedSites = (stats.scannedSites || 0) + 1;
          await setStorage(STORAGE_KEYS.STATS, stats);
          await appendLog(`New domain analyzed: ${message.host}.`);
        }
        return { status: "ok" };
      }
      return { error: "missing host" };
    }

    // --- Transaction intercepted by content script ---
    case "txIntercepted": {
      const stats = await bumpStat("interceptedTransactions");
      // Auto-capture the wallet address that issued the tx (used by Approval Scanner).
      if (message.from && /^0x[a-fA-F0-9]{40}$/.test(message.from)) {
        await setStorage(STORAGE_KEYS.LAST_WALLET, message.from);
      }
      return { status: "ok", stats };
    }

    // --- User rejected (blocked) a transaction from our UI ---
    case "txBlocked": {
      const stats = await bumpStat("blockedTransactions");
      await appendLog(`Blocked transaction to ${message.target || "unknown"}. Reason: user rejected from WalletGuard UI.`);
      return { status: "ok", stats };
    }

    // --- Warning shown (not blocked) ---
    case "warningShown": {
      const stats = await bumpStat("warningsShown");
      return { status: "ok", stats };
    }

    // --- Permit detected ---
    case "permitDetected": {
      const stats = await bumpStat("permitsDetected");
      await appendLog(`Permit signature detected${message.spender ? ` for spender ${message.spender}` : ""}.`);
      return { status: "ok", stats };
    }

    // --- Phishing site blocked ---
    case "phishingBlocked": {
      const stats = await bumpStat("phishingBlocked");
      await appendLog(`Phishing site blocked: ${message.domain || "unknown"}.`);
      return { status: "ok", stats };
    }

    // --- Check address: local blacklist + AI ---
    case "checkAddress": {
      if (!message.address) return { isSpam: false, reason: "empty" };

      const customBl = await getStorage(STORAGE_KEYS.CUSTOM_BLACKLIST, []);
      const allBlack = [...customBl];
      const isLocalSpam = allBlack.some(
        (a) => typeof a === "string" && a.toLowerCase() === message.address.toLowerCase()
      );
      if (isLocalSpam) {
        await appendLog(`Address ${message.address.slice(0, 10)}... matched custom blacklist.`);
        return { isSpam: true, source: "custom-blacklist", reason: "in user blacklist" };
      }

      const ai = await aiCheckAddress(message.address);
      if (ai.isSpam) {
        await appendLog(`AI flagged ${message.address.slice(0, 10)}...: ${ai.reason}`);
      } else {
        await appendLog(`Address ${message.address.slice(0, 10)}... cleared (${ai.source}).`);
      }
      return ai;
    }

    // --- Popup: get all data in one round-trip ---
    case "getPopupData": {
      const [stats, logs, enabled] = await Promise.all([
        getStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS }),
        getStorage(STORAGE_KEYS.LOGS, []),
        getStorage(STORAGE_KEYS.ENABLED, true)
      ]);
      return { stats, logs, enabled, version: chrome.runtime.getManifest().version };
    }

    // --- Settings: get ---
    case "getSettings": {
      const [apiKey, whitelist, customBl, enabled, multiChain] = await Promise.all([
        getStorage(STORAGE_KEYS.API_KEY, ""),
        getStorage(STORAGE_KEYS.WHITELIST, []),
        getStorage(STORAGE_KEYS.CUSTOM_BLACKLIST, []),
        getStorage(STORAGE_KEYS.ENABLED, true),
        getStorage(STORAGE_KEYS.MULTICHAIN, false)
      ]);
      return { apiKey, whitelist, customBlacklist: customBl, enabled, multiChain };
    }

    // --- Settings: save ---
    case "saveSettings": {
      if (message.apiKey !== undefined) await setStorage(STORAGE_KEYS.API_KEY, message.apiKey);
      if (Array.isArray(message.whitelist)) await setStorage(STORAGE_KEYS.WHITELIST, message.whitelist);
      if (Array.isArray(message.customBlacklist)) await setStorage(STORAGE_KEYS.CUSTOM_BLACKLIST, message.customBlacklist);
      if (typeof message.enabled === "boolean") await setStorage(STORAGE_KEYS.ENABLED, message.enabled);
      if (typeof message.multiChain === "boolean") await setStorage(STORAGE_KEYS.MULTICHAIN, message.multiChain);
      await appendLog("Settings updated.");
      return { status: "ok" };
    }

    // --- Reset stats ---
    case "resetStats": {
      await setStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS });
      await appendLog("Statistics reset.");
      return { status: "ok", stats: { ...DEFAULT_STATS } };
    }

    // --- Toggle enabled state ---
    case "setEnabled": {
      const enabled = !!message.enabled;
      await setStorage(STORAGE_KEYS.ENABLED, enabled);
      await setBadgeState(enabled ? "clear" : "disabled", enabled ? "" : "OFF");
      await appendLog(`Protection ${enabled ? "enabled" : "disabled"}.`);
      return { status: "ok", enabled };
    }

    // --- Toggle multi-chain scanning ---
    case "setMultiChain": {
      await setStorage(STORAGE_KEYS.MULTICHAIN, !!message.enabled);
      await appendLog(`Multi-chain approval scan ${message.enabled ? "enabled" : "disabled"}.`);
      return { status: "ok", multiChain: !!message.enabled };
    }

    // --- Approval Scanner: get last cached scan ---
    case "getApprovalScan": {
      const [scan, wallet] = await Promise.all([
        getStorage(STORAGE_KEYS.APPROVAL_SCAN, null),
        getStorage(STORAGE_KEYS.LAST_WALLET, "")
      ]);
      return { scan, wallet };
    }

    // --- Approval Scanner: trigger a rescan ---
    case "rescanApprovals": {
      let wallet = (message.address || "").trim();
      if (!wallet) {
        wallet = await getStorage(STORAGE_KEYS.LAST_WALLET, "");
      }
      if (!wallet) {
        return { error: "No wallet address available. Connect a wallet or send a transaction first." };
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return { error: "Invalid wallet address." };
      }
      try {
        const result = await runApprovalScan(wallet, true);
        return { status: "ok", scan: result };
      } catch (e) {
        await appendLog(`Approval scan failed: ${e.message}`);
        return { error: e.message };
      }
    }

    // --- Approval Scanner: clear cache ---
    case "clearApprovalScan": {
      await setStorage(STORAGE_KEYS.APPROVAL_SCAN, null);
      await appendLog("Approval scan cache cleared.");
      return { status: "ok" };
    }

    // --- Set wallet address manually (e.g. from popup) ---
    case "setWalletAddress": {
      const addr = (message.address || "").trim();
      if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
        await setStorage(STORAGE_KEYS.LAST_WALLET, addr);
        return { status: "ok", wallet: addr };
      }
      return { error: "Invalid wallet address." };
    }

    // --- Site status update from content script (Tier 4: drives badge) ---
    case "siteStatus": {
      // message: { host, level: "clear"|"warn"|"danger", reason, notify }
      const level = ["clear", "warn", "danger"].includes(message.level) ? message.level : "clear";
      if (level === "danger") {
        await setBadgeState("danger", "!");
        if (message.notify) {
          await notifyUser({
            title: "⚠️ Phishing site blocked",
            message: `${message.host || "This site"} — ${message.reason || "known drainer domain"}`,
            level: "danger",
            host: message.host
          });
        }
        await bumpStat("phishingBlocked");
        await appendLog(`Phishing blocked via badge alert: ${message.host || "unknown"} — ${message.reason || ""}.`);
      } else if (level === "warn") {
        await setBadgeState("warn", message.text || "!");
      } else {
        await setBadgeState("clear", "");
      }
      return { status: "ok" };
    }

    // --- v2.0: Tx receipt from content script (last intercepted analysis) ---
    case "txReceipt": {
      // message: { receipt: { statusKind, statusIcon, statusHeadline, statusDetail,
      //                       assetLines, mevRisks, risks, target, method, chainId, chainName,
      //                       addressBookMatch, scannedAt } }
      if (!message.receipt) return { error: "missing receipt" };
      // Stamp time + cap size.
      const receipt = { ...message.receipt, scannedAt: message.receipt.scannedAt || nowIso() };
      await setStorage(STORAGE_KEYS.LAST_RECEIPT, receipt);
      // If there are MEV risks, also update badge.
      const mevCount = (receipt.mevRisks && receipt.mevRisks.length) || 0;
      if (mevCount > 0 && (receipt.statusKind === "warn" || receipt.statusKind === "bad")) {
        await setBadgeState(receipt.statusKind === "bad" ? "danger" : "warn",
          receipt.statusKind === "bad" ? "!" : String(mevCount));
      }
      return { status: "ok" };
    }

    // --- v2.0: popup fetches last receipt ---
    case "getLastReceipt": {
      const receipt = await getStorage(STORAGE_KEYS.LAST_RECEIPT, null);
      return { receipt };
    }

    // --- v2.0: popup fetches address book ---
    case "getAddressBook": {
      const book = await getStorage(STORAGE_KEYS.ADDRESS_BOOK, {});
      return { book };
    }

    // --- v2.0: popup adds entry to address book ---
    case "addAddress": {
      const addr = (message.address || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return { error: "Invalid address" };
      }
      const book = await getStorage(STORAGE_KEYS.ADDRESS_BOOK, {});
      const key = addr.toLowerCase();
      book[key] = {
        label: (message.label || "").trim().slice(0, 64),
        trust: ["trusted", "neutral", "blocked"].includes(message.trust) ? message.trust : "neutral",
        tags: Array.isArray(message.tags) ? message.tags.slice(0, 8) : [],
        note: (message.note || "").slice(0, 256),
        addedAt: nowIso()
      };
      await setStorage(STORAGE_KEYS.ADDRESS_BOOK, book);
      await appendLog(`Address book: added ${shorten(addr)} (${book[key].label || "unlabeled"}, ${book[key].trust}).`);
      return { status: "ok", book };
    }

    // --- v2.0: popup removes entry ---
    case "removeAddress": {
      const addr = (message.address || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        return { error: "Invalid address" };
      }
      const book = await getStorage(STORAGE_KEYS.ADDRESS_BOOK, {});
      const key = addr.toLowerCase();
      if (book[key]) {
        delete book[key];
        await setStorage(STORAGE_KEYS.ADDRESS_BOOK, book);
        await appendLog(`Address book: removed ${shorten(addr)}.`);
      }
      return { status: "ok", book };
    }

    // --- v2.0: content script looks up an address in the book ---
    case "lookupAddress": {
      const addr = (message.address || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return { entry: null };
      const book = await getStorage(STORAGE_KEYS.ADDRESS_BOOK, {});
      const key = addr.toLowerCase();
      return { entry: book[key] || null };
    }

    // --- v2.1: Wallet DNA — content script fetches profile for a wallet ---
    case "getDnaProfile": {
      const addr = (message.address || "").trim().toLowerCase();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return { profile: null };
      const profiles = await getStorage(STORAGE_KEYS.DNA_PROFILES, {});
      return { profile: profiles[addr] || null };
    }

    // --- v2.1: Wallet DNA — content script records a new observation ---
    case "observeDna": {
      const tx = message.tx || {};
      const addr = (tx.from || "").trim().toLowerCase();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return { ok: false };
      const profiles = await getStorage(STORAGE_KEYS.DNA_PROFILES, {});
      // Lazy-load the wallet-dna module via dynamic import (only when needed).
      // Falls back to a no-op if module fails to load.
      try {
        const mod = await import("./lib/wallet-dna.js");
        let profile = profiles[addr] || mod.emptyProfile(addr);
        mod.observe(profile, tx);
        profiles[addr] = profile;
        // Cap at 50 profiles to avoid storage bloat.
        const keys = Object.keys(profiles);
        if (keys.length > 50) {
          // Drop the oldest (by updatedAt).
          keys.sort((a, b) => (profiles[a].updatedAt || "").localeCompare(profiles[b].updatedAt || ""));
          delete profiles[keys[0]];
        }
        await setStorage(STORAGE_KEYS.DNA_PROFILES, profiles);
      } catch (e) {
        console.warn("[WalletGuard] DNA observe failed:", e && e.message);
      }
      return { ok: true };
    }

    // --- v2.1: Threat feed lookup ---
    case "threatFeedLookup": {
      const enabled = await getStorage(STORAGE_KEYS.THREAT_FEED_ENABLED, false);
      if (!enabled) return { hits: [], enabled: false };
      const cached = await getStorage(STORAGE_KEYS.THREAT_FEED, null);
      if (!cached || !cached.index) return { hits: [], enabled: true };
      const index = cached.index;
      const hits = [];
      const query = message.query || {};
      // Look up each kind separately so we can report all hits.
      if (query.domain) {
        const h = lookupOne(index, "domain", query.domain);
        if (h) hits.push(h);
      }
      if (query.address) {
        const h = lookupOne(index, "address", query.address);
        if (h) hits.push(h);
      }
      if (query.selector) {
        const h = lookupOne(index, "selector", query.selector);
        if (h) hits.push(h);
      }
      if (Array.isArray(query.delegate)) {
        for (const d of query.delegate) {
          const h = lookupOne(index, "delegate", d);
          if (h) hits.push(h);
        }
      }
      if (query.calldata) {
        const h = lookupOne(index, "pattern", null, query.calldata);
        if (h) hits.push(h);
      }
      // Sort by severity desc.
      const sevOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      hits.sort((a, b) => (sevOrder[b.severity] || 0) - (sevOrder[a.severity] || 0));
      return { hits, enabled: true };
    }

    // --- v2.1: Threat feed opt-in toggle ---
    case "setThreatFeedEnabled": {
      await setStorage(STORAGE_KEYS.THREAT_FEED_ENABLED, !!message.enabled);
      await appendLog(`Threat intelligence feed ${message.enabled ? "enabled" : "disabled"}.`);
      return { ok: true, enabled: !!message.enabled };
    }

    // --- v2.1: Threat feed status ---
    case "getThreatFeedStatus": {
      const enabled = await getStorage(STORAGE_KEYS.THREAT_FEED_ENABLED, false);
      const cached = await getStorage(STORAGE_KEYS.THREAT_FEED, null);
      return {
        enabled,
        loaded: !!cached,
        feedVersion: cached && cached.feedVersion,
        threatCount: cached && cached.index ? cached.index.all.length : 0,
        updatedAt: cached && cached.updatedAt
      };
    }

    default:
      return { error: `unknown action: ${message.action}` };
  }
}

function shorten(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// Threat feed lookup helper. Uses the same lookup convention as lib/threat-feed.js.
function lookupOne(index, type, value, calldata) {
  if (!index) return null;
  if (type === "domain" && value && index.byDomain) {
    const hit = index.byDomain.get(String(value).toLowerCase());
    if (hit) return hit;
  }
  if (type === "address" && value && index.byAddress) {
    const hit = index.byAddress.get(String(value).toLowerCase());
    if (hit) return hit;
  }
  if (type === "selector" && value && index.bySelector) {
    const hit = index.bySelector.get(String(value).toLowerCase());
    if (hit) return hit;
  }
  if (type === "delegate" && value && index.byDelegate) {
    const hit = index.byDelegate.get(String(value).toLowerCase());
    if (hit) return hit;
  }
  if (type === "pattern" && calldata && Array.isArray(index.patterns)) {
    const c = String(calldata);
    for (const p of index.patterns) {
      if (p.re && p.re.test(c)) return p.entry;
    }
  }
  return null;
}

// ---------- APPROVAL SCANNER HELPERS ----------

async function buildWhitelistSet() {
  const wl = await getStorage(STORAGE_KEYS.WHITELIST, []);
  const set = new Set();
  for (const item of wl) {
    if (typeof item === "string" && /^0x[a-fA-F0-9]{40}$/.test(item)) {
      set.add(item.toLowerCase());
    }
  }
  return set;
}

async function runApprovalScan(address, forceLog) {
  if (typeof self.WGApprovalScanner === "undefined") {
    throw new Error("Approval Scanner module failed to load");
  }
  const wl = await buildWhitelistSet();
  const multiChain = await getStorage(STORAGE_KEYS.MULTICHAIN, false);

  let result;
  if (multiChain) {
    // Opt-in multi-chain: scan all 9 chains via public RPCs in parallel.
    result = await self.WGApprovalScanner.scanApprovalsMultiChain(address, wl);
    result.address = address;
    await setStorage(STORAGE_KEYS.APPROVAL_SCAN, result);
    // Tier 4: update browser action badge with risky count
    const risky = (result.summary && result.summary.risky) || 0;
    await setBadgeState(risky > 0 ? "warn" : "clear", risky > 0 ? String(risky) : "");
    if (forceLog) {
      const s = result.summary || {};
      await appendLog(
        `Multi-chain approval scan: ${s.chainsScanned || 0}/${(s.chainsScanned || 0) + (s.chainsFailed || 0)} chains OK, ` +
        `${s.total || 0} total, ${s.risky || 0} risky, ${s.unlimited || 0} unlimited.`
      );
    }
  } else {
    // Default: single-chain via the wallet's own RPC.
    result = await self.WGApprovalScanner.scanApprovals(address, wl);
    result.address = address;
    await setStorage(STORAGE_KEYS.APPROVAL_SCAN, result);
    // Tier 4: update browser action badge with risky count
    const risky = (result.summary && result.summary.risky) || 0;
    await setBadgeState(risky > 0 ? "warn" : "clear", risky > 0 ? String(risky) : "");
    if (forceLog) {
      await appendLog(
        `Approval scan on ${result.chainName}: ${result.summary.total} total, ` +
        `${result.summary.risky} risky, ${result.summary.unlimited} unlimited.`
      );
    }
  }
  return result;
}

// ---------- TIER 4: BROWSER ACTION BADGE + NOTIFICATIONS ----------
// Visible status indicator on the extension icon itself — the user
// sees it every day in their toolbar, so it doubles as a viral
// "always-on" reminder that the extension is protecting them.
// Risk states:
//   • clear (no badge)
//   • risky approvals (yellow badge with count)
//   • active phishing block (red badge with "!")
//   • protection disabled (gray badge with "OFF")

const BADGE_COLORS = {
  clear:    "#3a3f4b", // dim gray (no badge shown)
  warn:     "#ffb700", // yellow — risky approvals or warnings
  danger:   "#ff3333", // red — phishing/active block
  disabled: "#5a606e"  // gray — extension turned off
};

let lastBadgeState = { text: "", color: BADGE_COLORS.clear };

async function setBadgeState(level, text) {
  // level: "clear" | "warn" | "danger" | "disabled"
  const safeText = String(text || "").slice(0, 4); // Chrome badge is max 4 chars
  try {
    if (level === "clear" || !safeText) {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS.clear });
    } else {
      await chrome.action.setBadgeText({ text: safeText });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS[level] || BADGE_COLORS.warn });
    }
    lastBadgeState = { text: safeText, color: BADGE_COLORS[level] || BADGE_COLORS.warn };
  } catch (e) {
    console.warn("[WalletGuard] setBadgeState failed:", e && e.message);
  }
}

async function notifyUser(opts) {
  // opts: { title, message, level: "warn"|"danger", id?, host? }
  if (!opts || !opts.title) return;
  try {
    const id = opts.id || ("wg-" + Date.now());
    await chrome.notifications.create(id, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: opts.title,
      message: (opts.message || "").slice(0, 200),
      priority: opts.level === "danger" ? 2 : 1
    });
    if (opts.host) await bumpStat(opts.level === "danger" ? "phishingBlocked" : "warningsShown");
  } catch (e) {
    console.warn("[WalletGuard] notifyUser failed:", e && e.message);
  }
}

// Click handler: open popup when notification clicked.
if (chrome.notifications && chrome.notifications.onClicked) {
  try {
    chrome.notifications.onClicked.addListener((notifId) => {
      chrome.notifications.clear(notifId);
      chrome.action.openPopup ? chrome.action.openPopup() : null;
    });
  } catch (e) { console.warn("[WalletGuard] notif click handler failed:", e && e.message); }
}

// Initialize badge from persisted state on SW startup.
(async () => {
  try {
    const enabled = await getStorage(STORAGE_KEYS.ENABLED, true);
    if (!enabled) {
      await setBadgeState("disabled", "OFF");
    } else {
      // Refresh approval scan summary if available
      const scan = await getStorage(STORAGE_KEYS.APPROVAL_SCAN, null);
      if (scan && scan.summary && scan.summary.risky > 0) {
        await setBadgeState("warn", String(scan.summary.risky));
      } else {
        await setBadgeState("clear", "");
      }
    }
  } catch (e) {
    console.warn("[WalletGuard] badge init failed:", e && e.message);
  }
})();

// Update badge whenever enabled state changes (from setEnabled handler below)
// and whenever approval scan updates.
