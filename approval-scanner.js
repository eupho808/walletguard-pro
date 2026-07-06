// approval-scanner.js - Plain script loaded via importScripts() by background.js.
//
// Reads active token approvals for a wallet address via the user's own
// wallet provider (MetaMask, Rabby, etc.) through an RPC bridge that the
// content script's injector.js exposes. NO API KEY REQUIRED.
//
// Approach:
//   1. Query eth_chainId to know the current chain.
//   2. eth_getLogs for all Approval events where topic1 = owner.
//   3. Dedup to unique (token, spender) pairs.
//   4. eth_call(allowance(owner, spender)) per pair to filter stale.
//   5. Classify risk: unlimited+unknown = critical, verified protocol = low, etc.
//
// Limitations:
//   - Single chain only (the one the wallet is currently on).
//   - Depends on the user having a connected wallet with a working RPC node.
//   - eth_getLogs from block 0 can be slow on wallets with long history;
//     most public RPC nodes cap this at ~10k blocks, so we slice by chunks.
//
// Exposes a global `WGApprovalScanner` object.

(function (global) {
  "use strict";

  // ---- Verified-protocol addresses (mirrors constants.js) ----
  const KNOWN_SAFE_CONTRACTS = new Set([
    "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2 Router
    "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", // Uniswap V3 Router 2 / SwapRouter02
    "0xef1c6e67703c7bd71d701e3008ed740d79d164b0", // Uniswap Universal Router 2
    "0x000000000022d473030f116ddee9f6b43ac78ba3", // Permit2
    "0x1111111254eeb25477b68fb85ed929f73a960582", // 1inch v5 Router
    "0xba12222222228d8ba445958a75a0704d566bf2c8"  // Balancer Vault
  ]);

  // ---- Chain name lookup (only used for display) ----
  const CHAIN_NAMES = {
    "0x1":     { name: "Ethereum",  id: 1 },
    "0xa":     { name: "Optimism",  id: 10 },
    "0x38":    { name: "BNB Chain", id: 56 },
    "0x89":    { name: "Polygon",   id: 137 },
    "0xfa":    { name: "Fantom",    id: 250 },
    "0x2105":  { name: "Base",      id: 8453 },
    "0xa4b1":  { name: "Arbitrum",  id: 42161 },
    "0xa86a":  { name: "Avalanche", id: 43114 },
    "0xaa36a7":{ name: "Sepolia",   id: 11155111 },
    // ---- New L2s added in v3.3 ----
    "0x144":   { name: "zkSync Era", id: 324 },
    "0xe708":  { name: "Linea",      id: 59144 },
    "0x13e31": { name: "Blast",      id: 81457 },
    "0x868b":  { name: "Mode",       id: 34443 }
  };

  // Reverse lookup: chainId (number) -> display info.
  const CHAIN_INFO = (function () {
    const out = {};
    for (const k in CHAIN_NAMES) {
      const v = CHAIN_NAMES[k];
      out[v.id] = v;
    }
    return out;
  })();

  // ---- Multi-chain public RPC endpoints (no API key required) ----
  //
  // Used when the user opts in to multi-chain scanning. Each chain gets a
  // single public RPC endpoint. If the call fails (rate limit, network
  // issue, RPC going down) the chain is reported as `error` and the rest
  // of the scan continues. Users can keep adding more chains here without
  // any other code changes.
  //
  // Endpoints are kept conservative: LlamaRPC, publicnode, official
  // first-party RPCs (Base, Arbitrum, Polygon, Avalanche, BNB Chain), and
  // the Sepolia publicnode endpoint. They support `eth_getLogs` for the
  // last few million blocks which is enough for typical wallet history.
  const MULTICHAIN_RPCS = {
    1:        "https://eth.llamarpc.com",
    10:       "https://optimism.llamarpc.com",
    56:       "https://bsc-dataseed.bnbchain.org",
    137:      "https://polygon-rpc.com",
    250:      "https://fantom.publicnode.com",
    8453:     "https://mainnet.base.org",
    42161:    "https://arb1.arbitrum.io/rpc",
    43114:    "https://api.avax.network/ext/bc/C/rpc",
    11155111: "https://ethereum-sepolia-rpc.publicnode.com",
    // ---- New L2s added in v3.3 ----
    324:      "https://mainnet.era.zksync.io",
    59144:    "https://rpc.linea.build",
    81457:    "https://rpc.blast.io",
    34443:    "https://mainnet.mode.network"
  };

  // Per-chain lookback cap (in blocks). Different chains have very
  // different block times, so a fixed cap doesn't fit all. Values are
  // tuned to roughly correspond to "last few months to a year" of activity:
  //   - Ethereum/Optimism/Base/Sepolia:        12s blocks -> 1M blocks ~= 4 months
  //   - Avalanche:                            ~2s blocks -> 5M blocks ~= 4 months
  //   - Polygon:                              ~2s blocks -> 5M blocks ~= 4 months
  //   - Fantom:                              ~1.5s blocks -> 5M blocks ~= 3 months
  //   - BNB Chain:                            ~3s blocks -> 3M blocks ~= 1 year
  //   - Arbitrum:                           ~0.26s blocks -> 5M blocks ~= 2 weeks (max needed)
  //   - zkSync Era:                          ~1s blocks -> 3M blocks ~= 1 month
  //   - Linea:                              ~2s blocks -> 5M blocks ~= 4 months
  //   - Blast:                              ~2s blocks -> 5M blocks ~= 4 months
  //   - Mode:                               ~2s blocks -> 5M blocks ~= 4 months
  const CHAIN_LOOKBACK = {
    1:        1000000n,
    10:       1000000n,
    56:       3000000n,
    137:      5000000n,
    250:      5000000n,
    8453:     1000000n,
    42161:    5000000n,
    43114:    5000000n,
    11155111: 1000000n,
    // ---- New L2s added in v3.3 ----
    324:      3000000n,
    59144:    5000000n,
    81457:    5000000n,
    34443:    5000000n
  };

  // Approval(address,address,uint256) event signature topic
  const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
  // ApprovalForAll(address,address,bool) event signature topic (ERC-721 + ERC-1155)
  // Grants an operator full custody over every token in the collection.
  const APPROVAL_FOR_ALL_TOPIC = "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b01076980c8";
  // allowance(address,address) selector
  const ALLOWANCE_SELECTOR = "0xdd62ed3e";
  // isApprovedForAll(address,address) selector
  const IS_APPROVED_FOR_ALL_SELECTOR = "0xe985e9c5";
  // supportsInterface(bytes4) selector — used to detect ERC-721 / ERC-1155
  const SUPPORTS_INTERFACE_SELECTOR = "0x01ffc9a7";
  // ERC-721 interface ID (per EIP-721)
  const ERC721_INTERFACE_ID = "0x80ac58cd";
  // ERC-1155 interface ID (per EIP-1155)
  const ERC1155_INTERFACE_ID = "0xd9b67a26";

  const UNLIMITED_HEX = /^(?:0x)?f{15,}$/i;
  const RISK_COLORS = {
    critical: "#ff3333",
    high:     "#ff6b6b",
    medium:   "#ffb700",
    low:      "#00ff66",
    info:     "#00ffcc"
  };

  // ---- Encoding helpers ----

  function pad32(hex) {
    hex = (hex || "").replace(/^0x/, "");
    return hex.padStart(64, "0");
  }

  function encodeAllowanceCall(owner, spender) {
    return ALLOWANCE_SELECTOR + pad32(owner) + pad32(spender);
  }

  function encodeIsApprovedForAllCall(owner, operator) {
    return IS_APPROVED_FOR_ALL_SELECTOR + pad32(owner) + pad32(operator);
  }

  // Parse uint256 hex result (0x...) to BigInt, then format.
  function parseUint256(hex) {
    if (!hex || hex === "0x") return 0n;
    try { return BigInt(hex); } catch { return 0n; }
  }

  // ---- RPC bridge: send event to MAIN world, await response. ----
  //
  // The content script's injector.js listens for `WalletGuardRpcCall`
  // and dispatches `WalletGuardRpcResponse` with the same `id`.
  // But this scanner runs in the SERVICE WORKER, not content script.
  // The SW can't dispatch events to the page directly.
  //
  // Solution: the SW posts a message to the active tab via chrome.tabs,
  // which forwards to content.js, which dispatches the event.
  // See `rpcCall` below for the full pipeline.

  // Generate a unique id for each RPC call so we can match responses.
  let rpcIdCounter = 0;
  function nextRpcId() { return "wg-rpc-" + (++rpcIdCounter); }

  // Resolve a tab to query. Strategy: ask each tab to find one with a
  // connected wallet provider. For simplicity, we try all tabs and use
  // the first one that responds.
  async function findActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0].id : null);
      });
    });
  }

  // Perform an RPC call via the active tab's content script.
  // method: eth_* method name
  // params: array of params
  // timeoutMs: how long to wait for response (default 8s)
  async function rpcCall(method, params, timeoutMs) {
    const timeout = timeoutMs || 8000;
    const id = nextRpcId();
    const tabId = await findActiveTab();
    if (!tabId) throw new Error("No active tab to query");

    // Send message to content script in the active tab.
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("RPC timeout: " + method));
      }, timeout);

      // One-shot listener for the response from the content script.
      const listener = (msg, sender, sendResponse) => {
        if (msg && msg.action === "wgRpcResponse" && msg.id === id) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          if (msg.error) reject(new Error(msg.error));
          else resolve(msg.result);
          sendResponse({ ack: true });
          return true;
        }
      };
      chrome.runtime.onMessage.addListener(listener);

      // Kick off the actual call via content script.
      chrome.tabs.sendMessage(tabId, {
        action: "wgRpcCall",
        id: id,
        method: method,
        params: params || []
      }, () => {
        // If sendMessage fails (no content script), reject immediately.
        if (chrome.runtime.lastError && !done) {
          done = true;
          clearTimeout(timer);
          chrome.runtime.onMessage.removeListener(listener);
          reject(new Error(chrome.runtime.lastError.message || "tab unreachable"));
        }
      });
    });
  }

  // ---- Direct RPC (public endpoints, no wallet bridge) ----
  //
  // Used for multi-chain scanning where we hit a public RPC endpoint
  // directly via `fetch()` from the service worker. The service worker
  // has full network access (subject to manifest host_permissions), so
  // we don't need to round-trip through the content script.
  //
  // Returns the raw `result` field of the JSON-RPC response, or throws.
  async function rpcCallDirect(rpcUrl, method, params, timeoutMs) {
    if (!rpcUrl) throw new Error("rpcCallDirect: missing rpcUrl");
    const timeout = timeoutMs || 10000;
    const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: method,
          params: params || []
        }),
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) {
        throw new Error("HTTP " + response.status + " from " + rpcUrl);
      }
      const data = await response.json();
      if (data && data.error) {
        throw new Error(data.error.message || ("RPC error " + data.error.code));
      }
      return data ? data.result : null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Adapter that wraps rpcCallDirect into the same shape as rpcCall:
  //   (method, params) => Promise<result>
  // so the existing fetchApprovalEvents/fetchCurrentAllowances functions
  // can use either transport without code changes.
  function rpcAdapter(rpcUrl) {
    return function (method, params) {
      return rpcCallDirect(rpcUrl, method, params);
    };
  }

  // ---- Approval event discovery ----

  // Query eth_getLogs for all Approval events from `owner`.
  // We chunk the range to avoid RPC limits (10k blocks per request is typical).
  //
  // `rpcFn(method, params)` is an adapter for the transport — either the
  // wallet bridge (rpcCall) or a direct public RPC (rpcAdapter(url)).
  // `maxLookback` lets the caller cap how far back we go (different
  // chains have very different histories).
  async function fetchApprovalEvents(owner, rpcFn, maxLookback) {
    const rpc = rpcFn || rpcCall;
    const lookback = maxLookback != null ? BigInt(maxLookback) : 1000000n;
    const chunkSize = 5000n;
    const events = [];
    let fromBlock = 0n;

    // Try to get current block; if it fails, abort early.
    let latestHex;
    try {
      latestHex = await rpc("eth_blockNumber", []);
    } catch (e) {
      throw new Error("Cannot query current block: " + e.message);
    }
    const latest = BigInt(latestHex);

    // Iterate from latest back to (latest - lookback) in chunks. Going all
    // the way to block 0 is rarely useful and many public RPCs reject it.
    const startFrom = latest > lookback ? latest - lookback : 0n;
    fromBlock = startFrom;

    while (fromBlock <= latest) {
      const toBlock = fromBlock + chunkSize - 1n;
      const chunk = {
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock:   "0x" + (toBlock > latest ? latest : toBlock).toString(16),
        topics: [APPROVAL_TOPIC, pad32(owner), null]
      };
      let logs;
      try {
        logs = await rpc("eth_getLogs", [chunk]);
      } catch (e) {
        // Chunk too big or rate limited - skip and try smaller next time.
        // Just abort the loop to surface whatever we got.
        break;
      }
      if (Array.isArray(logs)) {
        for (const log of logs) {
          if (!log || !log.address || !log.topics || log.topics.length < 3) continue;
          events.push({
            token:   "0x" + log.address.slice(-40).toLowerCase(),
            spender: "0x" + log.topics[2].slice(-40).toLowerCase(),
            // We don't need the value here - we'll re-query current state below.
          });
        }
      }
      fromBlock = toBlock + 1n;
      if (fromBlock > latest) break;
      // Safety: don't loop forever on huge ranges
      if (events.length > 5000) break;
    }

    return events;
  }

  // ---- Query current allowance per (token, spender) ----

  async function fetchCurrentAllowances(pairs, rpcFn) {
    const rpc = rpcFn || rpcCall;
    // Dedup pairs first.
    const seen = new Set();
    const unique = [];
    for (const p of pairs) {
      const k = p.token + "|" + p.spender;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(p);
    }

    // Fetch allowances in parallel (but cap concurrency to avoid rate limits).
    const CONCURRENCY = 6;
    const results = [];
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
      const slice = unique.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(slice.map(async (p) => {
        const data = encodeAllowanceCall(p.owner, p.spender);
        const hex = await rpc("eth_call", [{ to: p.token, data: data }, "latest"]);
        return { token: p.token, spender: p.spender, allowanceHex: hex || "0x0" };
      }));
      for (const r of settled) {
        if (r.status === "fulfilled") results.push(r.value);
        // Failures (e.g. non-ERC20 contract, reverts) silently dropped.
      }
    }
    return results;
  }

  // ---- NFT ApprovalForAll event discovery ----
  //
  // Mirrors fetchApprovalEvents but filters on the ApprovalForAll topic.
  // Used to find operators that the wallet owner has granted full
  // collection custody to. Topics for ApprovalForAll are:
  //   topic[0]: event signature
  //   topic[1]: owner (indexed)
  //   topic[2]: operator (indexed)
  //   data:     bool (approved) - not indexed, ignored here

  async function fetchNFTApprovalForAllEvents(owner, rpcFn, maxLookback) {
    const rpc = rpcFn || rpcCall;
    const lookback = maxLookback != null ? BigInt(maxLookback) : 1000000n;
    const chunkSize = 5000n;
    const events = [];
    let fromBlock = 0n;

    let latestHex;
    try {
      latestHex = await rpc("eth_blockNumber", []);
    } catch (e) {
      throw new Error("Cannot query current block: " + e.message);
    }
    const latest = BigInt(latestHex);

    const startFrom = latest > lookback ? latest - lookback : 0n;
    fromBlock = startFrom;

    while (fromBlock <= latest) {
      const toBlock = fromBlock + chunkSize - 1n;
      const chunk = {
        fromBlock: "0x" + fromBlock.toString(16),
        toBlock:   "0x" + (toBlock > latest ? latest : toBlock).toString(16),
        topics: [APPROVAL_FOR_ALL_TOPIC, pad32(owner), null]
      };
      let logs;
      try {
        logs = await rpc("eth_getLogs", [chunk]);
      } catch (e) {
        break; // chunk too big or rate limited
      }
      if (Array.isArray(logs)) {
        for (const log of logs) {
          if (!log || !log.address || !log.topics || log.topics.length < 3) continue;
          events.push({
            collection: "0x" + log.address.slice(-40).toLowerCase(),
            operator:   "0x" + log.topics[2].slice(-40).toLowerCase()
          });
        }
      }
      fromBlock = toBlock + 1n;
      if (fromBlock > latest) break;
      if (events.length > 5000) break;
    }
    return events;
  }

  // ---- Query isApprovedForAll per (collection, operator) ----
  //
  // Returns only the pairs that are CURRENTLY approved (i.e.
  // isApprovedForAll returns true). Revoked or never-set approvals are
  // filtered out. Non-NFT contracts that don't implement
  // isApprovedForAll either revert (caught) or return false.

  async function fetchCurrentNFTApprovals(pairs, rpcFn) {
    const rpc = rpcFn || rpcCall;
    // Dedup pairs.
    const seen = new Set();
    const unique = [];
    for (const p of pairs) {
      const k = p.collection + "|" + p.operator;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(p);
    }

    const CONCURRENCY = 6;
    const results = [];
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
      const slice = unique.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(slice.map(async (p) => {
        const data = encodeIsApprovedForAllCall(p.owner, p.operator);
        const hex = await rpc("eth_call", [{ to: p.collection, data: data }, "latest"]);
        // isApprovedForAll returns bool (single word). True = 0x...00001,
        // false = 0x...00000 or revert.
        const isApproved = !!hex && /[^0]/.test(BigInt(hex || "0x0").toString(16));
        return {
          collection: p.collection,
          operator: p.operator,
          isApproved: isApproved
        };
      }));
      for (const r of settled) {
        if (r.status === "fulfilled" && r.value.isApproved) {
          results.push(r.value);
        }
        // Reverts (non-NFT contracts) silently dropped.
      }
    }
    return results;
  }

  // ---- Formatting ----

  function formatAllowance(rawHex, decimals) {
    if (!rawHex) return "0";
    if (UNLIMITED_HEX.test(rawHex)) return "Unlimited";
    try {
      const big = BigInt(rawHex);
      if (big === 0n) return "0";
      const denom = 10n ** BigInt(decimals || 18);
      const whole = big / denom;
      const frac = big % denom;
      if (frac === 0n) return whole.toString();
      let fracStr = frac.toString().padStart(decimals || 18, "0").slice(0, 4);
      fracStr = fracStr.replace(/0+$/, "");
      return fracStr ? whole + "." + fracStr : whole.toString();
    } catch (e) { return "?"; }
  }

  // Decimals lookup for common tokens on Ethereum mainnet.
  // Unknown tokens default to 18.
  const KNOWN_DECIMALS = {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": 6,  // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7": 6,  // USDT
    "0x6b175474e89094c44da98b954eedeac495271d0f": 18, // DAI
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": 18, // WETH
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": 18, // stETH
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 8,  // WBTC
    "0x514910771af9ca656af840dff83e8264ecf986ca": 18, // LINK
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": 18  // UNI
  };

  const KNOWN_SYMBOLS = {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
    "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH",
    "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "stETH",
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "WBTC",
    "0x514910771af9ca656af840dff83e8264ecf986ca": "LINK",
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "UNI"
  };

  // ---- Known NFT collections (display name + token standard) ----
  //
  // The scanner will surface `ApprovalForAll` events for ANY collection
  // (we don't gate on this list), but having a friendly name + a known
  // standard makes the popup card readable and lets us tune risk
  // classification. Keep this conservative: only well-known collections
  // that have been around long enough to be widely whitelisted by users.
  const KNOWN_NFT_COLLECTIONS = {
    "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d": { name: "BAYC",          type: "ERC-721" },
    "0x60e4d786628fea6478f785a6d7e704777c86a7c6": { name: "MAYC",          type: "ERC-721" },
    "0xed5af388653567aff25118525a23a8e78cf74c8f": { name: "Azuki",         type: "ERC-721" },
    "0x8a90cab2b38dba80c64b7734e58ee1db38b8992e": { name: "Doodles",       type: "ERC-721" },
    "0xbd3531da5cf5857e7cfaa92426877b022e612cf8": { name: "Pudgy Penguins",type: "ERC-721" },
    "0x23581767a106ae21c074b2276d25e5c3e136a68b": { name: "Moonbirds",     type: "ERC-721" },
    "0x49cf6f5d44e70224e2e23bdcd55720575b3df301": { name: "Wrapped Punks", type: "ERC-721" },
    "0x60f3680350e1b37859b281896b285e9b67e0e6da": { name: "DigiDaigaku",   type: "ERC-721" },
    "0x5af0d9827e0c53e4799bb226655a1de152a425a5": { name: "Milady",        type: "ERC-721" },
    "0x8a8909b8b5bcfb9c8c2e6f4e7f1a2b3c4d5e6f70": { name: "Pudgy Rods",    type: "ERC-721" }
  };

  // ---- Known NFT operators (legit marketplaces) ----
  //
  // Operators in this set get a LOW risk classification instead of
  // CRITICAL. We do NOT include random marketplace contracts here — only
  // addresses we can verify are widely-used, public-good marketplaces.
  //
  // These are the *operator* addresses (i.e. they appear in topic[2] of
  // ApprovalForAll events). They are distinct from the *collection*
  // addresses above.
  const KNOWN_NFT_OPERATORS = new Set([
    "0x1e0049783f008a0085193e00003d00cd54003c71", // OpenSea Seaport 1.5
    "0x00000000000000adc4c9d2e3535c63f0003f8e3f", // OpenSea legacy Wyvern proxy
    "0x000000000000ad05ccc4f10045630fb830b95127", // Blur marketplace
    "0x39da41747a83aee65870f4a676244ad0a4e90c1d", // Blur (deprecated proxy)
    "0x74312363e45dcaba5c23e1c16b6d4c1b3f8b6e3c", // Blur Pool
    "0x59728544b08ab483533076417fbbb2ea0be122e0"  // LooksRare exchange
  ]);

  // ---- Risk classification ----

  function classifyRisk(approval, whitelist) {
    const spender = (approval.spender || "").toLowerCase();
    const reasons = [];

    if (whitelist.has(spender)) {
      return { level: "info", reasons: ["Spender is in your personal whitelist."] };
    }

    const isVerified = KNOWN_SAFE_CONTRACTS.has(spender);

    if (approval.isUnlimited) {
      if (isVerified) {
        reasons.push("Unlimited allowance to verified protocol (" +
          (approval.spenderName || spender.slice(0, 8)) + ").");
        return { level: "medium", reasons };
      }
      if (!approval.spenderName) {
        reasons.push("Unlimited allowance to UNKNOWN spender (no public name).");
        return { level: "critical", reasons };
      }
      reasons.push("Unlimited allowance to " + approval.spenderName + ". Verify this contract.");
      return { level: "high", reasons };
    }

    if (isVerified) {
      return { level: "low", reasons: ["Limited allowance to verified protocol."] };
    }
    if (!approval.spenderName) {
      reasons.push("Limited approval to an unknown spender.");
      return { level: "medium", reasons };
    }
    reasons.push("Limited allowance to " + approval.spenderName + ".");
    return { level: "medium", reasons };
  }

  function annotateRisk(approvals, whitelist) {
    let critical = 0, high = 0, medium = 0, low = 0, info = 0, unlimited = 0;
    for (let i = 0; i < approvals.length; i++) {
      const a = approvals[i];
      const r = classifyRisk(a, whitelist);
      a.risk = r;
      a.riskColor = RISK_COLORS[r.level];
      if (r.level === "critical") critical++;
      else if (r.level === "high") high++;
      else if (r.level === "medium") medium++;
      else if (r.level === "low") low++;
      else info++;
      if (a.isUnlimited) unlimited++;
    }
    return {
      total: approvals.length,
      unlimited: unlimited,
      risky: critical + high,
      byRiskLevel: { critical: critical, high: high, medium: medium, low: low, info: info }
    };
  }

  // ---- NFT risk classification ----
  //
  // NFT approvals (ApprovalForAll) give an operator full custody over
  // every token in the collection. The dangerous case is when the
  // operator is unknown — a single drainer can list every BAYC, Azuki,
  // etc. for sale and the user has no recourse.

  function classifyNFTRisk(nft, whitelist) {
    const operator = (nft.operator || "").toLowerCase();
    const reasons = [];

    if (whitelist.has(operator)) {
      return { level: "info", reasons: ["Operator is in your personal whitelist."] };
    }

    if (KNOWN_NFT_OPERATORS.has(operator)) {
      reasons.push("Approval to a verified NFT marketplace.");
      return { level: "low", reasons };
    }

    // Operator is unknown — full NFT custody to a random address is the
    // single most common NFT drain pattern (Inferno, NFT Trader,
    // PRETEND, etc. all used ApprovalForAll).
    if (!nft.operatorName) {
      reasons.push("Full collection custody granted to UNKNOWN operator.");
      return { level: "critical", reasons };
    }

    reasons.push("Full collection custody granted to " + nft.operatorName + ".");
    return { level: "high", reasons };
  }

  function annotateNFTRisk(approvals, whitelist) {
    let critical = 0, high = 0, medium = 0, low = 0, info = 0;
    for (let i = 0; i < approvals.length; i++) {
      const a = approvals[i];
      const r = classifyNFTRisk(a, whitelist);
      a.risk = r;
      a.riskColor = RISK_COLORS[r.level];
      if (r.level === "critical") critical++;
      else if (r.level === "high") high++;
      else if (r.level === "medium") medium++;
      else if (r.level === "low") low++;
      else info++;
    }
    return {
      total: approvals.length,
      risky: critical + high,
      byRiskLevel: { critical: critical, high: high, medium: medium, low: low, info: info }
    };
  }

  // ---- Public API ----

  /**
   * Scan approvals for a single (chainId, rpcUrl) pair using an arbitrary
   * RPC transport. Used by both the wallet-bridge path (single-chain)
   * and the direct-RPC path (multi-chain).
   *
   * @param {string} address      Wallet address (0x...)
   * @param {number} chainId      Numeric chain ID
   * @param {function} rpcFn      (method, params) => Promise<result>
   * @param {Set<string>} [whitelist]  Lowercased spender addresses
   * @param {bigint} [maxLookback]    Block-range cap (per-chain default)
   * @returns {Promise<{chainId, chainName, approvals, summary, error?, scannedAt}>}
   */
  // ---- ERC-20 token approval scan (single chain) ----
  //
  // Internal helper that does only the ERC-20 half of the chain scan.
  // scanChainApprovals runs this in parallel with scanNFTApprovals so
  // the user doesn't pay the latency twice.

  async function scanERC20Approvals(address, chainId, rpcFn, whitelist, maxLookback) {
    const wl = whitelist || new Set();
    const rpc = rpcFn || rpcCall;
    const chainInfo = CHAIN_INFO[chainId] || { name: "Chain " + chainId, id: chainId };
    const lookback = maxLookback != null ? maxLookback : CHAIN_LOOKBACK[chainId];

    // 1. Find all historical Approval events from this owner.
    const events = await fetchApprovalEvents(address, rpc, lookback);

    // 2. Query current allowance for each unique (token, spender).
    const pairs = events.map((e) => ({ token: e.token, spender: e.spender, owner: address }));
    const currentAllowances = await fetchCurrentAllowances(pairs, rpc);

    // 3. Build canonical approval objects, filter zero-allowance (revoked).
    const approvals = [];
    for (const ca of currentAllowances) {
      const value = ca.allowanceHex || "0x0";
      const isUnlimited = UNLIMITED_HEX.test(value);
      if (!isUnlimited && (value === "0x0" || /^0x0*$/.test(value))) continue;

      const decimals = KNOWN_DECIMALS[ca.token] != null ? KNOWN_DECIMALS[ca.token] : 18;
      approvals.push({
        token: ca.token,
        tokenName: KNOWN_SYMBOLS[ca.token] || "Token",
        tokenSymbol: KNOWN_SYMBOLS[ca.token] || (ca.token.slice(0, 6) + "..."),
        tokenDecimals: decimals,
        tokenType: "ERC-20",
        tokenIcon: null,
        spender: ca.spender,
        spenderName: null,
        allowanceRaw: value,
        allowanceFmt: formatAllowance(value, decimals),
        isUnlimited: isUnlimited,
        chainId: chainInfo.id,
        chainName: chainInfo.name
      });
    }

    // 4. Classify risk.
    const summary = annotateRisk(approvals, wl);
    return { approvals, summary, chainId: chainInfo.id, chainName: chainInfo.name };
  }

  // ---- NFT collection approval scan (single chain) ----
  //
  // Discovers ApprovalForAll events (operator-level custody) and queries
  // isApprovedForAll on each (collection, operator) pair to filter out
  // revoked approvals and non-NFT contracts that don't implement the
  // interface. The returned objects are self-describing and include
  // `tokenType: "ERC-721" | "ERC-1155" | "Unknown"`, the collection
  // name (from KNOWN_NFT_COLLECTIONS or fallback to short address), and
  // a risk classification.

  async function scanNFTApprovals(address, chainId, rpcFn, whitelist, maxLookback) {
    const wl = whitelist || new Set();
    const rpc = rpcFn || rpcCall;
    const chainInfo = CHAIN_INFO[chainId] || { name: "Chain " + chainId, id: chainId };
    const lookback = maxLookback != null ? maxLookback : CHAIN_LOOKBACK[chainId];

    // 1. Find all historical ApprovalForAll events from this owner.
    const events = await fetchNFTApprovalForAllEvents(address, rpc, lookback);

    // 2. Query isApprovedForAll for each unique (collection, operator).
    const pairs = events.map((e) => ({ collection: e.collection, operator: e.operator, owner: address }));
    const currentNFTApprovals = await fetchCurrentNFTApprovals(pairs, rpc);

    // 3. Build canonical NFT approval objects.
    const approvals = [];
    for (const ca of currentNFTApprovals) {
      const meta = KNOWN_NFT_COLLECTIONS[ca.collection];
      const opLower = (ca.operator || "").toLowerCase();
      const isVerifiedOp = KNOWN_NFT_OPERATORS.has(opLower);
      approvals.push({
        collection: ca.collection,
        collectionName: meta ? meta.name : (ca.collection.slice(0, 6) + "..." + ca.collection.slice(-4)),
        tokenType: meta ? meta.type : "Unknown",
        operator: ca.operator,
        operatorName: isVerifiedOp ? operatorDisplayName(opLower) : null,
        chainId: chainInfo.id,
        chainName: chainInfo.name
      });
    }

    // 4. Classify risk.
    const summary = annotateNFTRisk(approvals, wl);
    return { approvals, summary, chainId: chainInfo.id, chainName: chainInfo.name };
  }

  // Friendly display names for verified NFT operators.
  function operatorDisplayName(addr) {
    const a = (addr || "").toLowerCase();
    if (a === "0x1e0049783f008a0085193e00003d00cd54003c71") return "OpenSea";
    if (a === "0x00000000000000adc4c9d2e3535c63f0003f8e3f") return "OpenSea (legacy)";
    if (a === "0x000000000000ad05ccc4f10045630fb830b95127") return "Blur";
    if (a === "0x39da41747a83aee65870f4a676244ad0a4e90c1d") return "Blur (deprecated)";
    if (a === "0x74312363e45dcaba5c23e1c16b6d4c1b3f8b6e3c") return "Blur Pool";
    if (a === "0x59728544b08ab483533076417fbbb2ea0be122e0") return "LooksRare";
    return null;
  }

  // ---- Top-level chain scan: ERC-20 + NFT in parallel ----
  //
  // Returns the same shape as before (approvals + summary) PLUS a new
  // `nftApprovals` / `nftSummary` pair. Either side can fail
  // independently — Promise.allSettled ensures one failure doesn't
  // blank the other.

  async function scanChainApprovals(address, chainId, rpcFn, whitelist, maxLookback) {
    const wl = whitelist || new Set();
    const chainInfo = CHAIN_INFO[chainId] || { name: "Chain " + chainId, id: chainId };
    const emptySummary = { total: 0, unlimited: 0, risky: 0, byRiskLevel: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } };
    const emptyNFTSummary = { total: 0, risky: 0, byRiskLevel: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } };

    // Run ERC-20 and NFT scans concurrently. allSettled so a failure
    // in one path doesn't poison the other.
    const [erc20Result, nftResult] = await Promise.allSettled([
      scanERC20Approvals(address, chainId, rpcFn, wl, maxLookback),
      scanNFTApprovals(address, chainId, rpcFn, wl, maxLookback)
    ]);

    const erc20 = erc20Result.status === "fulfilled" ? erc20Result.value : null;
    const nft = nftResult.status === "fulfilled" ? nftResult.value : null;

    if (!erc20) {
      return {
        chainId: chainInfo.id,
        chainName: chainInfo.name,
        approvals: [],
        summary: emptySummary,
        nftApprovals: nft ? nft.approvals : [],
        nftSummary: nft ? nft.summary : emptyNFTSummary,
        error: erc20Result.reason ? erc20Result.reason.message : "ERC-20 scan failed",
        scannedAt: new Date().toISOString()
      };
    }

    return {
      chainId: chainInfo.id,
      chainName: chainInfo.name,
      approvals: erc20.approvals,
      summary: erc20.summary,
      nftApprovals: nft ? nft.approvals : [],
      nftSummary: nft ? nft.summary : emptyNFTSummary,
      nftError: nftResult.status === "rejected" ? nftResult.reason.message : undefined,
      scannedAt: new Date().toISOString()
    };
  }

  /**
   * Single-chain scan via the user's wallet (current-chain default).
   * No API key required - uses the wallet's own RPC node.
   *
   * @param {string} address  Wallet address (0x...)
   * @param {Set<string>} [whitelist]
   * @returns {Promise<{approvals, summary, chainId, chainName, scannedAt}>}
   */
  async function scanApprovals(address, whitelist) {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error("Invalid wallet address");
    }

    // 1. Discover current chain via the wallet.
    const chainIdHex = await rpcCall("eth_chainId", []);
    const chainInfo = CHAIN_NAMES[chainIdHex] ||
      { name: "Chain " + chainIdHex, id: parseInt(chainIdHex, 16) };

    // 2. Run a single-chain scan using the wallet transport.
    const result = await scanChainApprovals(address, chainInfo.id, rpcCall, whitelist);

    return {
      approvals: result.approvals,
      summary: result.summary,
      nftApprovals: result.nftApprovals,
      nftSummary: result.nftSummary,
      chainId: result.chainId,
      chainName: result.chainName,
      scannedAt: result.scannedAt
    };
  }

  /**
   * Multi-chain scan via public RPC endpoints (opt-in).
   *
   * Scans `chainIds` (default: all 9 supported chains) in parallel using
   * direct `fetch()` calls to the public RPC endpoints in MULTICHAIN_RPCS.
   * Per-chain failures are captured in the per-chain `error` field and
   * do not abort the rest of the scan.
   *
   * @param {string} address      Wallet address (0x...)
   * @param {Set<string>} [whitelist]
   * @param {number[]} [chainIds] Subset of chain IDs to scan (default: all)
   * @returns {Promise<{
   *   multiChain: true,
   *   address: string,
   *   chains: Array<{chainId, chainName, approvals, summary, error?, scannedAt}>,
   *   summary: { total, unlimited, risky, byChain: Object<string, number>, chainsScanned: number, chainsFailed: number },
   *   scannedAt: string
   * }>}
   */
  async function scanApprovalsMultiChain(address, whitelist, chainIds) {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error("Invalid wallet address");
    }
    const wl = whitelist || new Set();

    // Default: all chains in MULTICHAIN_RPCS that have a known display name.
    const ids = (chainIds && chainIds.length)
      ? chainIds.filter((id) => MULTICHAIN_RPCS[id])
      : Object.keys(MULTICHAIN_RPCS).map((s) => parseInt(s, 10));

    // Run all chains in parallel; failures don't stop other chains.
    const chainResults = await Promise.all(ids.map(async (chainId) => {
      const rpcUrl = MULTICHAIN_RPCS[chainId];
      const rpcFn = rpcAdapter(rpcUrl);
      return scanChainApprovals(address, chainId, rpcFn, wl, CHAIN_LOOKBACK[chainId]);
    }));

    // Aggregate totals across all chains.
    let total = 0, unlimited = 0, risky = 0, scanned = 0, failed = 0;
    let nftTotal = 0, nftRisky = 0, nftScanned = 0;
    const byChain = {};
    const nftByChain = {};
    for (const c of chainResults) {
      if (c.error) { failed++; continue; }
      scanned++;
      total += c.summary.total;
      unlimited += c.summary.unlimited;
      risky += c.summary.risky;
      byChain[c.chainName] = c.summary.total;
      // NFT side: counts are aggregated even if just the NFT half failed.
      const ns = c.nftSummary || { total: 0, risky: 0 };
      nftTotal += ns.total;
      nftRisky += ns.risky;
      if (!c.nftError) nftScanned++;
      if (ns.total > 0) nftByChain[c.chainName] = ns.total;
    }

    return {
      multiChain: true,
      address: address,
      chains: chainResults,
      summary: {
        total: total,
        unlimited: unlimited,
        risky: risky,
        byChain: byChain,
        chainsScanned: scanned,
        chainsFailed: failed
      },
      nftSummary: {
        total: nftTotal,
        risky: nftRisky,
        byChain: nftByChain,
        chainsScanned: nftScanned
      },
      scannedAt: new Date().toISOString()
    };
  }

  function topRisky(approvals, n) {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const limit = n || 5;
    return approvals.slice().sort(function (a, b) {
      const ra = order[a.risk.level]; const rb = order[b.risk.level];
      const r = (ra === undefined ? 9 : ra) - (rb === undefined ? 9 : rb);
      if (r !== 0) return r;
      return (b.isUnlimited ? 1 : 0) - (a.isUnlimited ? 1 : 0);
    }).slice(0, limit);
  }

  global.WGApprovalScanner = {
    CHAIN_NAMES: CHAIN_NAMES,
    CHAIN_INFO: CHAIN_INFO,
    MULTICHAIN_RPCS: MULTICHAIN_RPCS,
    CHAIN_LOOKBACK: CHAIN_LOOKBACK,
    KNOWN_SAFE_CONTRACTS: KNOWN_SAFE_CONTRACTS,
    KNOWN_NFT_COLLECTIONS: KNOWN_NFT_COLLECTIONS,
    KNOWN_NFT_OPERATORS: KNOWN_NFT_OPERATORS,
    RISK_COLORS: RISK_COLORS,
    APPROVAL_FOR_ALL_TOPIC: APPROVAL_FOR_ALL_TOPIC,
    rpcCall: rpcCall,                  // exposed for testing / debugging
    rpcCallDirect: rpcCallDirect,      // direct fetch-based RPC
    rpcAdapter: rpcAdapter,            // adapter factory
    scanApprovals: scanApprovals,      // single-chain via wallet
    scanChainApprovals: scanChainApprovals, // single-chain with arbitrary transport (ERC-20 + NFT)
    scanERC20Approvals: scanERC20Approvals, // ERC-20 only
    scanNFTApprovals: scanNFTApprovals,     // NFT only
    scanApprovalsMultiChain: scanApprovalsMultiChain, // multi-chain via public RPCs
    classifyNFTRisk: classifyNFTRisk,   // exposed for testing
    operatorDisplayName: operatorDisplayName,
    topRisky: topRisky
  };
})(typeof self !== "undefined" ? self : globalThis);
