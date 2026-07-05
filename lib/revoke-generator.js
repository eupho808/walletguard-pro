// lib/revoke-generator.js — Generates calldata for revoking active approvals.
//
// The Approval Scanner tells you what's exposed. This module tells you
// exactly what transaction to send to revoke it.
//
// Two kinds of revokes are supported:
//   - ERC-20 approvals:  `approve(spender, 0)`            [selector 0x095ea7b3]
//   - NFT approvals:     `setApprovalForAll(operator, false)` [selector 0xa22cb465]
//
// Both ERC-721 and ERC-1155 use the same setApprovalForAll(address,bool)
// selector, so a single revoke works for both standards.
//
// Why not just sign and broadcast ourselves?
//   Chrome MV3 extensions cannot sign transactions directly. We generate
//   the calldata so the user can:
//     (a) copy it and broadcast via revoke.cash, Pocket Universe, or MEW,
//     (b) hand it to the wallet via EIP-681 / WalletConnect link, or
//     (c) queue it up in a multisend via their wallet's UI.
//
// Every returned "revoke plan" object is self-contained — caller doesn't
// need to know about selectors, padding, or chain-specific behavior.

// ---- Selectors (keccak256 of canonical signatures) ----

// approve(address,uint256)
export const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
// setApprovalForAll(address,bool)
export const NFT_SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465";

// 32 bytes of zeros — used for `uint256 amount = 0` and `bool = false`.
export const ZERO_WORD = "0x" + "0".repeat(64);

/**
 * Pad an address (0x...) to a 32-byte ABI word (left-padded with zeros).
 * @param {string} addr  0x-prefixed 20-byte address
 * @returns {string}     0x-prefixed 32-byte hex
 */
export function padAddress(addr) {
  if (typeof addr !== "string") throw new Error("padAddress: expected string");
  const clean = addr.toLowerCase().replace(/^0x/, "");
  if (clean.length !== 40) throw new Error("padAddress: invalid address length: " + addr);
  if (!/^[0-9a-f]{40}$/.test(clean)) throw new Error("padAddress: invalid hex chars: " + addr);
  return "0x" + clean.padStart(64, "0");
}

/**
 * Encode an ERC-20 `approve(spender, 0)` call.
 *
 * @param {string} spender  The address whose allowance should be revoked.
 * @returns {string}        0x-prefixed calldata (selector + 64-byte args)
 */
export function buildERC20RevokeCalldata(spender) {
  return ERC20_APPROVE_SELECTOR + padAddress(spender).slice(2) + ZERO_WORD.slice(2);
}

/**
 * Encode an ERC-721 / ERC-1155 `setApprovalForAll(operator, false)` call.
 *
 * @param {string} operator  The operator whose custody should be revoked.
 * @returns {string}         0x-prefixed calldata
 */
export function buildNFT721RevokeCalldata(operator) {
  return NFT_SET_APPROVAL_FOR_ALL_SELECTOR + padAddress(operator).slice(2) + ZERO_WORD.slice(2);
}

/**
 * Build a complete "revoke plan" for a single ERC-20 approval object.
 *
 * The `approval` shape matches what approval-scanner.js returns in its
 * `approvals[]` array (see scanERC20Approvals). Pass that object directly
 * — no field extraction needed.
 *
 * @param {object} approval  { token, tokenSymbol, spender, chainId, chainName, ... }
 * @returns {object}         { kind, chainId, chainName, to, data, value, description, ... }
 */
export function buildERC20RevokeTx(approval) {
  if (!approval || typeof approval !== "object") {
    throw new Error("buildERC20RevokeTx: approval object required");
  }
  const token = (approval.token || "").toLowerCase();
  const spender = (approval.spender || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(token)) {
    throw new Error("buildERC20RevokeTx: invalid token address: " + approval.token);
  }
  if (!/^0x[a-f0-9]{40}$/.test(spender)) {
    throw new Error("buildERC20RevokeTx: invalid spender address: " + approval.spender);
  }
  return {
    kind: "ERC-20",
    chainId: approval.chainId,
    chainName: approval.chainName || ("Chain " + approval.chainId),
    to: token,
    data: buildERC20RevokeCalldata(spender),
    value: "0x0",
    description: describeRevoke(approval, "ERC-20"),
    token: token,
    tokenSymbol: approval.tokenSymbol || shorten(token),
    spender: spender,
    spenderName: approval.spenderName || null,
    isUnlimited: !!approval.isUnlimited,
    allowanceFmt: approval.allowanceFmt || null
  };
}

/**
 * Build a complete revoke plan for a single NFT approval object.
 *
 * @param {object} nftApproval  { collection, collectionName, operator, operatorName, chainId, chainName, ... }
 * @returns {object}            Same shape as buildERC20RevokeTx
 */
export function buildNFT721RevokeTx(nftApproval) {
  if (!nftApproval || typeof nftApproval !== "object") {
    throw new Error("buildNFT721RevokeTx: approval object required");
  }
  const collection = (nftApproval.collection || "").toLowerCase();
  const operator = (nftApproval.operator || "").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(collection)) {
    throw new Error("buildNFT721RevokeTx: invalid collection address: " + nftApproval.collection);
  }
  if (!/^0x[a-f0-9]{40}$/.test(operator)) {
    throw new Error("buildNFT721RevokeTx: invalid operator address: " + nftApproval.operator);
  }
  return {
    kind: "NFT",
    chainId: nftApproval.chainId,
    chainName: nftApproval.chainName || ("Chain " + nftApproval.chainId),
    to: collection,
    data: buildNFT721RevokeCalldata(operator),
    value: "0x0",
    description: describeRevoke(nftApproval, "NFT"),
    token: collection,
    tokenSymbol: nftApproval.collectionName || shorten(collection),
    spender: operator,
    spenderName: nftApproval.operatorName || null,
    isUnlimited: true,
    allowanceFmt: "Full custody"
  };
}

/**
 * Auto-detect approval type and build the appropriate revoke plan.
 * Returns null if the approval kind cannot be determined.
 *
 * @param {object} approval  Either an ERC-20 or NFT approval object
 * @returns {object|null}    Revoke plan from buildERC20RevokeTx / buildNFT721RevokeTx
 */
export function buildRevokeTx(approval) {
  if (!approval || typeof approval !== "object") return null;
  const type = (approval.tokenType || "").toUpperCase();
  if (type === "ERC-721" || type === "ERC-1155" || approval.collection) {
    return buildNFT721RevokeTx(approval);
  }
  // Default: ERC-20
  if (approval.token && approval.spender) {
    return buildERC20RevokeTx(approval);
  }
  return null;
}

/**
 * Build a batch of revoke plans for an array of approvals (mixed kinds).
 * Skips entries that fail validation but reports them in `errors[]`.
 *
 * @param {Array<object>} approvals
 * @returns {{ plans: object[], errors: Array<{approval, reason}> }}
 */
export function buildRevokeBatch(approvals) {
  const plans = [];
  const errors = [];
  if (!Array.isArray(approvals)) return { plans, errors };
  for (const a of approvals) {
    try {
      const plan = buildRevokeTx(a);
      if (plan) plans.push(plan);
      else errors.push({ approval: a, reason: "unknown approval kind" });
    } catch (e) {
      errors.push({ approval: a, reason: e.message || String(e) });
    }
  }
  return { plans, errors };
}

/**
 * Group a list of revoke plans by chainId so the UI can show a separate
 * "Sign N transactions on Ethereum, M on Polygon" summary.
 *
 * @param {Array<object>} plans
 * @returns {Array<{chainId, chainName, plans, count}>}
 */
export function groupPlansByChain(plans) {
  const byChain = new Map();
  for (const p of (plans || [])) {
    if (!byChain.has(p.chainId)) {
      byChain.set(p.chainId, { chainId: p.chainId, chainName: p.chainName || ("Chain " + p.chainId), plans: [], count: 0 });
    }
    const g = byChain.get(p.chainId);
    g.plans.push(p);
    g.count++;
  }
  return Array.from(byChain.values()).sort((a, b) => a.chainId - b.chainId);
}

// ---- Internal helpers ----

function shorten(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function describeRevoke(a, kind) {
  if (kind === "NFT") {
    const op = a.operatorName || shorten((a.operator || "").toLowerCase());
    const coll = a.collectionName || shorten((a.collection || "").toLowerCase());
    return `Revoke NFT custody: ${coll} → ${op}`;
  }
  const sym = a.tokenSymbol || "Token";
  const sp = a.spenderName || shorten((a.spender || "").toLowerCase());
  return `Revoke ${sym} approval → ${sp}`;
}
