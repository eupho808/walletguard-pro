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

// =====================================================================
// BULK REVOKE via Multicall3
// =====================================================================
//
// Groups multiple approvals into a single multicall transaction per token
// per chain. Instead of signing 12 separate revoke transactions, the user
// signs 1.
//
// Multicall3 address (same on most chains): 0xcA11bde05977b3631167028862bE2a173976CA11
// multicall3.aggregate((address target, bytes callData)[] calls)
//
// Selector: 0x252dba42

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL_AGGREGATE_SELECTOR = "0x252dba42";
const ZERO_AMOUNT_WORD = "0".repeat(64);
const FALSE_WORD = "0".repeat(63) + "1"; // false in 32-byte word for setApprovalForAll

/**
 * Encode a multicall3.aggregate() call.
 * @param {Array<{to: string, data: string}>} calls
 * @returns {string} calldata
 */
function encodeMulticall(calls) {
  if (!Array.isArray(calls) || calls.length === 0) return null;
  // Aggregate signature: aggregate((address,bytes)[])
  // Layout:
  //   selector (4 bytes)
  //   offset to array (32 bytes) — usually 0x20 (32)
  //   array length (32 bytes)
  //   for each call:
  //     address (32 bytes, left-padded)
  //     offset to data (32 bytes) — relative to start of tuple
  //     data length (32 bytes)
  //     data (padded to 32-byte boundary)

  const callDataChunks = [];
  const tuples = [];

  for (const c of calls) {
    const data = c.data.startsWith("0x") ? c.data.slice(2) : c.data;
    const dataLen = data.length / 2;
    tuples.push({ to: c.to, data, dataLen });
  }

  // Encode each tuple as (address, offset, length, data)
  // All offsets are relative to the start of the tuples array.
  let dataOffset = tuples.length * 32 * 3; // 32 bytes each for address, offset, length
  const tupleHex = [];
  for (const t of tuples) {
    const addr = t.to.toLowerCase().replace("0x", "").padStart(64, "0");
    const off = (dataOffset).toString(16).padStart(64, "0");
    const len = t.dataLen.toString(16).padStart(64, "0");
    tupleHex.push(addr + off + len);
    // Pad data to 32-byte boundary.
    const paddedData = t.data.length % 64 === 0 ? t.data : t.data + "0".repeat(64 - t.data.length % 64);
    dataOffset += paddedData.length / 2 / 32 * 32; // bytes
    callDataChunks.push(paddedData);
  }

  const arrayOffset = "20".padStart(64, "0"); // 0x20
  const arrayLength = tuples.length.toString(16).padStart(64, "0");

  return MULTICALL_AGGREGATE_SELECTOR + arrayOffset + arrayLength + tupleHex.join("") + callDataChunks.join("");
}

/**
 * Group approvals by (chainId, tokenAddress) and build one multicall per group.
 * Saves N transactions → K transactions where K = unique (chain, token) pairs.
 *
 * @param {Array<Object>} approvals — array of approval objects
 * @param {Object} options — { multicallAddress?: string }
 * @returns {Object} — { batches: [...], totalSaved: N - K, plan: [...] }
 */
export function buildBulkRevokeMulticall(approvals, options = {}) {
  if (!Array.isArray(approvals) || approvals.length === 0) {
    return { batches: [], totalSaved: 0, plan: [] };
  }

  const multicallAddress = (options.multicallAddress || MULTICALL3_ADDRESS).toLowerCase();

  // Group by (chainId, tokenAddress).
  const groups = new Map();
  for (const a of approvals) {
    const token = (a.tokenAddress || a.collection || "").toLowerCase();
    const chain = a.chainId || 0;
    if (!token) continue;
    const key = `${chain}-${token}`;
    if (!groups.has(key)) {
      groups.set(key, {
        chainId: chain,
        chainName: a.chainName || ("Chain " + chain),
        tokenAddress: token,
        tokenSymbol: a.tokenSymbol || a.collectionName || token.slice(0, 8),
        calls: [],
        approvalCount: 0
      });
    }
    const group = groups.get(key);
    group.approvalCount++;
  }

  const batches = [];
  for (const group of groups.values()) {
    // Build one call per approval in this group.
    const calls = [];
    const planRefs = [];
    for (const a of approvals) {
      const token = (a.tokenAddress || a.collection || "").toLowerCase();
      const chain = a.chainId || 0;
      if (chain !== group.chainId || token !== group.tokenAddress) continue;

      // ERC-20: approve(spender, 0)
      // NFT: setApprovalForAll(operator, false)
      const isNft = !!(a.collection || a.tokenType === "ERC-721" || a.tokenType === "ERC-1155");
      const target = a.tokenAddress || a.collection;
      const spender = a.spender || a.operator;
      if (!target || !spender) continue;

      let calldata;
      if (isNft) {
        calldata = NFT_SET_APPROVAL_FOR_ALL_SELECTOR +
          spender.toLowerCase().replace("0x", "").padStart(64, "0") +
          FALSE_WORD;
      } else {
        calldata = ERC20_APPROVE_SELECTOR +
          spender.toLowerCase().replace("0x", "").padStart(64, "0") +
          ZERO_AMOUNT_WORD;
      }

      calls.push({ to: target, data: calldata });
      planRefs.push({
        tokenSymbol: group.tokenSymbol,
        spender: spender,
        spenderName: a.spenderName || a.operatorName || null,
        isNft
      });
    }

    if (calls.length === 0) continue;

    const data = encodeMulticall(calls);
    batches.push({
      chainId: group.chainId,
      chainName: group.chainName,
      tokenAddress: group.tokenAddress,
      tokenSymbol: group.tokenSymbol,
      to: multicallAddress,
      value: "0x0",
      data,
      approvalCount: group.approvalCount,
      planRefs,
      description: `Bulk revoke ${group.approvalCount} ${isNftToken(approvals, group.tokenAddress) ? "NFT" : "ERC-20"} approval${group.approvalCount > 1 ? "s" : ""} on ${group.tokenSymbol}`,
      gasEstimate: estimateMulticallGas(calls.length)
    });
  }

  const totalApprovals = approvals.length;
  const totalSaved = totalApprovals - batches.length;
  return {
    batches,
    totalSaved,
    summary: batches.length === 0
      ? "No approvals to batch."
      : `${batches.length} transaction${batches.length > 1 ? "s" : ""} instead of ${totalApprovals} (saves ${totalSaved} signatures).`,
    plan: batches
  };
}

function isNftToken(approvals, tokenAddress) {
  for (const a of approvals) {
    if ((a.tokenAddress || a.collection || "").toLowerCase() === tokenAddress) {
      return !!(a.collection || a.tokenType === "ERC-721" || a.tokenType === "ERC-1155");
    }
  }
  return false;
}

// Rough gas estimate for multicall3.aggregate():
//   Base: 30k gas
//   Per call: ~50k gas (cold storage write for each approval)
//   Multicall overhead: ~10k
function estimateMulticallGas(callCount) {
  return 30000 + 50000 * callCount + 10000;
}

/**
 * Filter approvals to find the optimal bulk revoke set.
 * Strategy: include all stale approvals, exclude whitelisted ones,
 * exclude already-zeroed approvals.
 */
export function selectBulkRevokeCandidates(approvals, options = {}) {
  if (!Array.isArray(approvals)) return [];
  const thresholdDays = options.staleThresholdDays || 180;
  const now = Math.floor(Date.now() / 1000);

  return approvals.filter((a) => {
    if (a.whitelisted) return false;
    if (a.isStale === false) return false;
    // Include if: age > threshold, or unlimited, or explicitly flagged
    if (a.ageDays && a.ageDays > thresholdDays) return true;
    if (a.unlimited === true) return true;
    if (a.isAutoRevokeCandidate === true) return true;
    return false;
  });
}

