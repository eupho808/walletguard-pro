// background.js - WalletGuard Pro Service Worker
// Handles: persistent state, OpenRouter AI checks, statistics, message routing,
// and periodic approval scans via Blockscout.

try { importScripts("approval-scanner.js"); } catch (e) { /* will surface in scanner calls */ }

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
  LAST_WALLET: "wg_lastWalletAddress"        // most recent `from` we saw
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
  chrome.alarms.create(APPROVAL_SCAN_ALARM, { periodInMinutes: 360 });
});

// Service worker startup (MV3) - also reschedule alarm in case it was wiped.
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(APPROVAL_SCAN_ALARM, { periodInMinutes: 360 });
});

// Background alarm handler: silently refresh the approval scan if we know a wallet.
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

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
      await setStorage(STORAGE_KEYS.ENABLED, !!message.enabled);
      await appendLog(`Protection ${message.enabled ? "enabled" : "disabled"}.`);
      return { status: "ok", enabled: !!message.enabled };
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

    default:
      return { error: `unknown action: ${message.action}` };
  }
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
    if (forceLog) {
      await appendLog(
        `Approval scan on ${result.chainName}: ${result.summary.total} total, ` +
        `${result.summary.risky} risky, ${result.summary.unlimited} unlimited.`
      );
    }
  }
  return result;
}
