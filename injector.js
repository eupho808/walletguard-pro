// injector.js - WalletGuard Pro Core Security Engine
// Runs in MAIN world. Intercepts window.ethereum provider methods
// and forwards them to the ISOLATED-world content script for analysis.

(function() {
  "use strict";

  if (window.__walletGuardInjected) return;
  window.__walletGuardInjected = true;

  console.log("WalletGuard Pro: Injector active in MAIN world.");

  // Methods we want to intercept and show our own UI before they reach MetaMask.
  const INTERCEPTED = new Set([
    "eth_sendTransaction",
    "eth_signTypedData",
    "eth_signTypedData_v1",
    "eth_signTypedData_v3",
    "eth_signTypedData_v4",
    "personal_sign",
    "eth_sign"
  ]);

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  // Holds the original (un-wrapped) provider's `request` method.
  // Set inside installProxy(). Used by the RPC bridge to forward
  // read-only calls (eth_getLogs, eth_call, eth_chainId) from the
  // ISOLATED-world content script to the user's wallet node.
  let originalRequest = null;
  let providerAvailable = false;

  function hexToBigInt(hex) {
    if (!hex || typeof hex !== "string") return 0n;
    try {
      return BigInt(hex);
    } catch {
      return 0n;
    }
  }

  function weiToEth(wei) {
    try {
      const big = typeof wei === "bigint" ? wei : hexToBigInt(wei);
      const whole = big / 10n ** 18n;
      const frac = big % 10n ** 18n;
      const fracStr = frac.toString().padStart(18, "0").slice(0, 6);
      return `${whole}.${fracStr}`.replace(/\.?0+$/, "") || "0";
    } catch {
      return "?";
    }
  }

  function dispatchUI(payload) {
    window.dispatchEvent(new CustomEvent("WalletGuardShowUI", { detail: payload }));
  }

  // UI response timeout. If the user closes the tab or the content script
  // never responds, fail-open (let the original call through) so we never
  // lock the user's wallet.
  const UI_RESPONSE_TIMEOUT_MS = 90000;

  function awaitUIResponse() {
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (approved) => {
        if (resolved) return;
        resolved = true;
        window.removeEventListener("WalletGuardUIResponse", handler);
        clearTimeout(timer);
        resolve(!!approved);
      };
      const handler = (e) => {
        finish(e && e.detail && e.detail.approved);
      };
      window.addEventListener("WalletGuardUIResponse", handler);
      const timer = setTimeout(() => {
        // Fail-open: if the UI didn't answer in time, let the call through.
        console.warn("WalletGuard Pro: UI response timeout, passing through.");
        finish(false);
      }, UI_RESPONSE_TIMEOUT_MS);
    });
  }

  function shortAddr(a) {
    if (!a || a.length < 10) return a || "";
    return `${a.slice(0, 6)}...${a.slice(-4)}`;
  }

  // ------------------------------------------------------------
  // Permit / EIP-712 analysis
  // ------------------------------------------------------------

  function analyzeTypedData(raw) {
    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return { isPermit: false, isEIP712: false };
    }
    if (!parsed || typeof parsed !== "object") return { isPermit: false, isEIP712: false };

    const primaryType = (parsed.primaryType || "").toLowerCase();
    const message = parsed.message || {};
    const domain = parsed.domain || {};

    // Common permit-style signatures
    const permitTypes = ["permit", "permit2", "permitbatch", "delegation", "approve"];
    const looksLikePermit = permitTypes.includes(primaryType) ||
      (message.owner && message.spender && message.value !== undefined) ||
      (message.from && message.permit && message.permit.details) || // Permit2 batch
      (message.permit && message.transferDetails); // Permit2 single

    if (looksLikePermit) {
      const spender = message.spender || (message.permit && message.permit.spender) || "Unknown";
      const value = message.value || message.amount || (message.permit && message.permit.amount) || "Unlimited";
      const tokenName = domain.name || "Unknown Token";
      const deadline = message.deadline ? new Date(Number(message.deadline) * 1000).toLocaleString() : null;

      return {
        isPermit: true,
        isEIP712: true,
        payload: {
          to: typeof spender === "string" ? spender : "Unknown",
          from: "Your Wallet",
          value: "0x0",
          data: "0x",
          isEIP712: true,
          permitDetails: {
            primaryType,
            tokenName,
            spender: typeof spender === "string" ? shortAddr(spender) : "Unknown",
            spenderFull: typeof spender === "string" ? spender : "",
            value: String(value),
            deadline
          }
        }
      };
    }

    // Other EIP-712 messages (Seaport orders, etc.) - flag but don't always block
    return { isPermit: false, isEIP712: true, primaryType };
  }

  function analyzePersonalSign(args) {
    // personal_sign(from, data)
    const from = args[0] || "0x0000";
    const message = args[1] || "";
    let decoded = message;
    try {
      if (message.startsWith("0x")) {
        const hex = message.slice(2);
        let str = "";
        for (let i = 0; i < hex.length; i += 2) {
          const code = parseInt(hex.substr(i, 2), 16);
          if (code === 0) break;
          str += String.fromCharCode(code);
        }
        decoded = str || message;
      }
    } catch { /* keep raw */ }

    return {
      isPersonalSign: true,
      isEIP712: false,
      payload: {
        to: "Off-chain Signature",
        from,
        value: "0x0",
        data: "0x",
        isEIP712: false,
        isPersonalSign: true,
        messageText: decoded.length > 200 ? decoded.slice(0, 200) + "..." : decoded
      }
    };
  }

  // ------------------------------------------------------------
  // eth_sendTransaction analysis
  // ------------------------------------------------------------

  function analyzeSendTransaction(args) {
    const tx = (args && args[0]) || {};
    const value = tx.value || "0x0";
    const ethAmount = weiToEth(value);

    return {
      payload: {
        to: tx.to || null,
        from: tx.from || "Your Wallet",
        value,
        data: tx.data || "0x",
        gas: tx.gas || tx.gasLimit || null,
        isEIP712: false,
        ethAmount
      }
    };
  }

  // ------------------------------------------------------------
  // main interceptor
  // ------------------------------------------------------------

  // Cache protection state and keep it fresh via storage events.
  let protectionEnabled = true;
  try {
    chrome.storage.local.get(["wg_enabled"], (r) => {
      protectionEnabled = r.wg_enabled !== false;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.wg_enabled) {
        protectionEnabled = changes.wg_enabled.newValue !== false;
      }
    });
  } catch { /* storage may not be ready */ }

  const WalletGuardHandler = {
    get(target, prop, receiver) {
      if (prop === "request") {
        return async function(args) {
          const method = args && args.method;

          if (!method || !INTERCEPTED.has(method)) {
            return Reflect.apply(target[prop], target, [args]);
          }

          // If protection is disabled, pass through immediately.
          if (!protectionEnabled) {
            return Reflect.apply(target[prop], target, [args]);
          }

          // Always notify background that something was intercepted (stat only)
          try {
            chrome.runtime.sendMessage({ action: "txIntercepted", method });
          } catch { /* SW may be inactive - ignore */ }

          try {
            let analysis = null;

            if (method === "eth_sendTransaction") {
              analysis = analyzeSendTransaction(args.params);
            } else if (method.startsWith("eth_signTypedData")) {
              const typed = args.params[1];
              const result = analyzeTypedData(typed);
              if (!result.isEIP712 && !result.isPermit) {
                // Unknown EIP-712 - still show UI as warning
                return Reflect.apply(target[prop], target, [args]);
              }
              analysis = result;
            } else if (method === "personal_sign") {
              analysis = analyzePersonalSign(args.params);
            } else if (method === "eth_sign") {
              analysis = {
                payload: {
                  to: "Off-chain Signature",
                  from: args.params[0] || "Your Wallet",
                  value: "0x0",
                  data: "0x",
                  isEIP712: false,
                  isLegacySign: true,
                  messageText: typeof args.params[1] === "string" ? args.params[1].slice(0, 200) : ""
                }
              };
            }

            if (!analysis) {
              return Reflect.apply(target[prop], target, [args]);
            }

            dispatchUI({
              ...analysis.payload,
              method,
              timestamp: Date.now()
            });

            const approved = await awaitUIResponse();

            if (!approved) {
              try {
                chrome.runtime.sendMessage({
                  action: "txBlocked",
                  target: analysis.payload.to,
                  method
                });
              } catch { /* ignore */ }
              throw new Error(`WalletGuard Pro: ${method} rejected by user.`);
            }

            return Reflect.apply(target[prop], target, [args]);
          } catch (err) {
            if (err && err.message && err.message.startsWith("WalletGuard Pro:")) {
              throw err;
            }
            console.error("WalletGuard Pro interceptor error:", err);
            // On unexpected error, let the call through so we never lock the user out.
            return Reflect.apply(target[prop], target, [args]);
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  };

  // ------------------------------------------------------------
  // Install the proxy
  // ------------------------------------------------------------

  function installProxy() {
    if (!window.ethereum) {
      // No wallet at script load time. Don't install a mock (it would
      // short-circuit the real one when it appears later). Just wait for
      // DOMContentLoaded below.
      return;
    }

    if (window.ethereum.isWalletGuard) return;

    try {
      originalRequest = window.ethereum.request.bind(window.ethereum);
      window.ethereum.request = new Proxy(originalRequest, WalletGuardHandler);
      window.ethereum.isWalletGuard = true;
      providerAvailable = true;
      console.log("WalletGuard Pro: existing window.ethereum wrapped.");
    } catch (e) {
      console.warn("WalletGuard Pro: failed to wrap existing provider:", e);
    }
  }

  // Try immediately and on DOMContentLoaded (covers early/late injection).
  installProxy();
  document.addEventListener("DOMContentLoaded", installProxy);

  // ------------------------------------------------------------
  // RPC bridge: ISOLATED-world content script -> MAIN-world provider
  //
  // The content script can't call window.ethereum directly (different
  // realm). It dispatches a WalletGuardRpcCall event with {id, method,
  // params}; we forward to the un-wrapped request() and dispatch
  // WalletGuardRpcResponse with {id, result} or {id, error}.
  //
  // Only read-only methods are allowed through. Anything that would
  // require a signature or change state is rejected.
  // ------------------------------------------------------------

  const READ_ONLY_METHODS = new Set([
    "eth_chainId",
    "net_version",
    "eth_blockNumber",
    "eth_getBalance",
    "eth_call",
    "eth_getLogs",
    "eth_getTransactionReceipt",
    "eth_getTransactionByHash",
    "eth_estimateGas",
    "eth_gasPrice"
  ]);

  // Bridge: handle RPC calls from content script.
  window.addEventListener("WalletGuardRpcCall", async (e) => {
    const detail = e && e.detail;
    if (!detail || !detail.id) return;
    const { id, method, params } = detail;

    // Always reply (even on rejection) so the caller doesn't hang.
    const reply = (payload) => {
      window.dispatchEvent(new CustomEvent("WalletGuardRpcResponse", {
        detail: { id: id, ...payload }
      }));
    };

    if (!providerAvailable || !originalRequest) {
      reply({ error: "no wallet provider available" });
      return;
    }
    if (!READ_ONLY_METHODS.has(method)) {
      reply({ error: "method not allowed via bridge: " + method });
      return;
    }

    try {
      const result = await Reflect.apply(originalRequest, window.ethereum, [{
        method: method,
        params: params || []
      }]);
      reply({ result: result });
    } catch (err) {
      reply({ error: (err && err.message) || String(err) });
    }
  });

})();
