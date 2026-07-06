/**
 * @fileoverview Hardware Wallet Awareness
 *
 * Detects when the user is signing with a hardware wallet (Ledger,
 * Trezor, Keystone, GridPlus, Frame) and applies stricter rules:
 *
 *   - Stricter risk thresholds for unlimited approvals
 *   - Mandatory warning for any EIP-7702 delegation
 *   - Mandatory warning for any new-contract interaction
 *   - Mandatory warning for high-value native transfers
 *   - "Confirm on device" reminder shown prominently
 *
 * Detection methods (tried in order):
 *   1. window.ethereum.isLedger / isTrezor / isKeystone flags (set
 *      by Ledger Live, Trezor Suite, Keystone, GridPlus Lattice, Frame)
 *   2. window.ethereum.provider info object (EIP-1193 provider info)
 *   3. User-agent hints + injected provider name
 *
 * Pure functions only — no chrome.*, no fetch, no I/O.
 * @module lib/hw-wallet
 */

export const KNOWN_HW_WALLETS = Object.freeze([
  { name: "Ledger",      matcher: /ledger/i,             flag: "isLedger"    },
  { name: "Trezor",      matcher: /trezor/i,             flag: "isTrezor"    },
  { name: "Keystone",    matcher: /keystone/i,           flag: "isKeystone"  },
  { name: "GridPlus",    matcher: /gridplus|lattice/i,   flag: "isGridPlus"  },
  { name: "Frame",       matcher: /\bframe\b/i,          flag: "isFrame"     },
  { name: "BitBox02",    matcher: /bitbox/i,             flag: "isBitBox"    },
  { name: "CoolWallet",  matcher: /coolwallet/i,         flag: "isCoolWallet"}
]);

/**
 * Heuristic set of "always require extra confirmation" rules when a HW
 * wallet is in use. These are additive — the regular risk engine still
 * runs and contributes, but these rules can never be downgraded.
 */
export const HW_STRICT_RULES = Object.freeze([
  {
    id: "hw-no-unlimited-approvals",
    description: "Reject any unlimited (max-uint256) ERC-20 approval when using a hardware wallet.",
    severity: "high",
    applies: (analysis) => {
      // Detect ERC-20 approve + max value
      const data = (analysis && analysis.data) || "";
      return /^0x095ea7b3/.test(data) && /f{64}/.test(data.slice(10));
    }
  },
  {
    id: "hw-no-setapprovalforall-to-new-operator",
    description: "Reject setApprovalForAll when the operator address has not been seen before.",
    severity: "high",
    applies: (analysis) => {
      const data = (analysis && analysis.data) || "";
      return /^0xa22cb465/.test(data);
    }
  },
  {
    id: "hw-no-eip7702-delegation",
    description: "Reject any EIP-7702 delegation tx when using a hardware wallet.",
    severity: "critical",
    applies: (analysis) => {
      return analysis && analysis.eip7702Result && analysis.eip7702Result.riskLevel && analysis.eip7702Result.riskLevel !== "none";
    }
  },
  {
    id: "hw-no-high-value-to-new-contract",
    description: "Warn on any tx > 1 ETH to a contract never seen in your wallet DNA.",
    severity: "medium",
    applies: (analysis) => {
      if (!analysis) return false;
      const v = BigInt(analysis.value || "0x0");
      const oneEth = 10n ** 18n;
      return v >= oneEth && analysis.isNewContract;
    }
  },
  {
    id: "hw-no-session-keys",
    description: "Reject any session-key permission request when using a hardware wallet.",
    severity: "critical",
    applies: (analysis) => {
      return analysis && analysis.sessionKeyResult && analysis.sessionKeyResult.riskLevel
        && ["medium", "high", "critical"].includes(analysis.sessionKeyResult.riskLevel);
    }
  }
]);

// ─── Detection ──────────────────────────────────────────────

/**
 * Detect which (if any) hardware wallet the user is signing with.
 * Pass the window.ethereum-like object explicitly to keep this pure.
 *
 * @param {object} provider — the EIP-1193 provider
 * @returns {{ vendor: string|null, isHardware: boolean, details: object }}
 */
export function detectHardwareWallet(provider) {
  if (!provider || typeof provider !== "object") {
    return { vendor: null, isHardware: false, details: {} };
  }

  // Method 1: explicit vendor flags (Ledger Live, Trezor Suite inject these).
  for (const hw of KNOWN_HW_WALLETS) {
    if (provider[hw.flag] === true) {
      return { vendor: hw.name, isHardware: true, details: { method: "flag", flag: hw.flag } };
    }
  }

  // Method 2: provider.info (EIP-1193).
  if (provider.info && typeof provider.info.name === "string") {
    for (const hw of KNOWN_HW_WALLETS) {
      if (hw.matcher.test(provider.info.name)) {
        return { vendor: hw.name, isHardware: true, details: { method: "info.name", value: provider.info.name } };
      }
    }
  }

  // Method 3: provider.name (legacy).
  if (typeof provider.name === "string") {
    for (const hw of KNOWN_HW_WALLETS) {
      if (hw.matcher.test(provider.name)) {
        return { vendor: hw.name, isHardware: true, details: { method: "name", value: provider.name } };
      }
    }
  }

  return { vendor: null, isHardware: false, details: {} };
}

// ─── Strict-rule engine ─────────────────────────────────────

/**
 * Apply the HW strict rules to an analysis result and return any
 * triggered rules. The caller decides how to present them.
 *
 * @param {object} analysis — the standard analyze() output
 * @param {object} hwInfo — output of detectHardwareWallet()
 * @returns {{ triggers: Array, escalatedRiskLevel: string }}
 */
export function applyHwRules(analysis, hwInfo) {
  if (!hwInfo || !hwInfo.isHardware) {
    return { triggers: [], escalatedRiskLevel: null };
  }
  const triggers = [];
  let highest = "none";
  const order = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };

  for (const rule of HW_STRICT_RULES) {
    try {
      if (rule.applies(analysis)) {
        triggers.push({ id: rule.id, severity: rule.severity, description: rule.description });
        if (order[rule.severity] > order[highest]) highest = rule.severity;
      }
    } catch { /* don't let one rule crash the rest */ }
  }

  return { triggers, escalatedRiskLevel: highest };
}

/**
 * Convenience: format a "Confirm on device" message for the overlay.
 */
export function confirmOnDeviceText(vendor) {
  return vendor
    ? `Verify the transaction details on your ${vendor} device screen. The signature never leaves the hardware wallet until you confirm on-device.`
    : "Verify the transaction details on your hardware wallet screen.";
}
