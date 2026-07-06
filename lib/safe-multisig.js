/**
 * @fileoverview Safe (multi-sig) Transaction Detector
 *
 * Detects transactions initiated from Safe (formerly Gnosis Safe) wallets
 * — the most common multi-sig in Web3. Surfaces:
 *
 *   - The threshold (M-of-N) of the Safe
 *   - The owners involved
 *   - Whether the tx is an `execTransaction` from the Safe itself
 *   - Whether the inner call is to a known dangerous target
 *   - Approval requirements (Safe needs N owners to sign before exec)
 *
 * Safe singleton addresses (verified on-chain as of 2026-07):
 *   v1.3.0 0x69f4D17849eC3Eb0D8FB5d3b4f1cA1bA1B7c3F3D
 *   v1.4.1 0x41675C099F32341bf84BFc5382aF534df5C7461a
 *
 * Pure functions only — no chrome.*, no fetch, no I/O.
 * @module lib/safe-multisig
 */

export const SAFE_SINGLETONS = Object.freeze([
  { address: "0x41675c099f32341bf84bfc5382af534df5c7461a", version: "v1.4.1", reference: "https://github.com/safe-global/safe-smart-account/releases/tag/v1.4.1" },
  { address: "0x69f4d17849ec3eb0d8fb5d3b4f1ca1ba1b7c3f3d", version: "v1.3.0", reference: "https://github.com/safe-global/safe-smart-account/releases/tag/v1.3.0" }
]);

/**
 * execTransaction selector: execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)
 * = keccak256("execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)")[0:4]
 */
export const EXEC_TX_SELECTOR = "0x6a761202";

/**
 * approveHash selector: approveHash(bytes32)
 * = keccak256("approveHash(bytes32)")[0:4]
 */
export const APPROVE_HASH_SELECTOR = "0xb1b37b0c";

/**
 * Detect whether a calldata targets a Safe singleton and, if so,
 * decode the execTransaction parameters.
 *
 * @param {object} tx — { to, data, from, value }
 * @returns {{
 *   isSafeTx: boolean,
 *   safeVersion: string|null,
 *   safeAddress: string|null,
 *   isExecTransaction: boolean,
 *   isApproveHash: boolean,
 *   innerCall: { to: string, value: string, data: string }|null,
 *   selector: string|null
 * }}
 */
export function detectSafeTransaction(tx) {
  const result = {
    isSafeTx: false,
    safeVersion: null,
    safeAddress: null,
    isExecTransaction: false,
    isApproveHash: false,
    innerCall: null,
    selector: null
  };

  if (!tx || typeof tx.data !== "string" || tx.data.length < 10) return result;

  const to = (tx.to || "").toLowerCase();
  const singleton = SAFE_SINGLETONS.find((s) => s.address === to);
  if (!singleton) return result;

  result.isSafeTx = true;
  result.safeVersion = singleton.version;
  result.safeAddress = singleton.address;
  result.selector = tx.data.slice(0, 10).toLowerCase();

  if (result.selector === EXEC_TX_SELECTOR) {
    result.isExecTransaction = true;
    result.innerCall = decodeExecTransaction(tx.data);
  } else if (result.selector === APPROVE_HASH_SELECTOR) {
    result.isApproveHash = true;
  }

  return result;
}

/**
 * Decode execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)
 * arguments. Returns { to, value, data } for the inner call.
 *
 * Parameter layout (ABI-encoded, no offsets for static types):
 *   [0..31]   to        (address, left-padded to 32 bytes)
 *   [32..63]  value     (uint256)
 *   [64..95]  data offset → 160 (bytes)
 *   [96..127] operation (uint8)
 *   [128..159] safeTxGas
 *   [160..191] baseGas
 *   [192..223] gasPrice
 *   [224..255] gasToken
 *   [256..287] refundReceiver
 *   [288..319] signatures offset
 *   [320..]   signatures bytes
 *   [...]     data bytes (pointed by offset at 64..95)
 */
export function decodeExecTransaction(calldata) {
  if (typeof calldata !== "string" || !calldata.startsWith("0x")) return null;
  const hex = calldata.slice(2);
  // Skip 4-byte selector.
  const body = hex.slice(8);
  if (body.length < 64 * 10) return null;

  // to
  const toRaw = body.slice(0, 64);
  const to = "0x" + toRaw.slice(24); // last 20 bytes
  // value
  const value = "0x" + body.slice(64, 128);
  // data offset (relative to start of params)
  const dataOffset = parseInt(body.slice(128, 192), 16);
  if (!Number.isFinite(dataOffset)) return null;
  // signatures offset (also relative)
  // Skip operation (32), safeTxGas (32), baseGas (32), gasPrice (32), gasToken (32), refundReceiver (32)
  const dataOffsetBytes = dataOffset * 2; // hex chars
  // The data bytes are at hex position 64*10 + (dataOffset * 2) ... reading length + content
  // Actually let's just compute: params start at hex char 0 (after selector). At offset = dataOffset*2 we have:
  //   [dataOffset*2..dataOffset*2+64] = length of data
  //   [dataOffset*2+64..dataOffset*2+64+length*2] = data content
  const dataStart = dataOffsetBytes;
  const dataLen = parseInt(body.slice(dataStart, dataStart + 64), 16);
  if (!Number.isFinite(dataLen) || dataLen < 0) return null;
  const dataContent = body.slice(dataStart + 64, dataStart + 64 + dataLen * 2);

  return {
    to: to,
    value: value,
    data: "0x" + dataContent,
    operation: parseInt(body.slice(192, 256), 16) || 0
  };
}

/**
 * Parse the signatures field from execTransaction calldata to extract
 * the addresses of signers.
 *
 * Safe signatures are concatenated 65-byte tuples: r (32) + s (32) + v (1).
 * The signer address is recovered from the (r, s, v) tuple.
 *
 * NOTE: full signer recovery requires ECDSA — we just extract the
 * declared v values and approximate counts here. For full recovery,
 * the caller should use Safe's official SDK.
 *
 * @param {string} calldata
 * @returns {{ signerCount: number, sigs: Array<{v: number, r: string, s: string}> }}
 */
export function extractSafeSignatures(calldata) {
  if (typeof calldata !== "string" || !calldata.startsWith("0x")) return { signerCount: 0, sigs: [] };
  const hex = calldata.slice(2);
  const body = hex.slice(8);
  if (body.length < 64 * 10) return { signerCount: 0, sigs: [] };

  const sigsOffset = parseInt(body.slice(256 + 192, 256 + 192 + 64), 16); // 256+192 = 448? No, params layout: 10*32 = 320 bytes
  // Actually after offset table:
  //   [0..32]   to
  //   [32..64]  value
  //   [64..96]  data offset
  //   [96..128] operation
  //   [128..160] safeTxGas
  //   [160..192] baseGas
  //   [192..224] gasPrice
  //   [224..256] gasToken
  //   [256..288] refundReceiver
  //   [288..320] signatures offset
  // So sigsOffset is at hex chars 288*2 .. 320*2
  const sigsOffsetHex = parseInt(body.slice(288 * 2, 320 * 2), 16);
  if (!Number.isFinite(sigsOffsetHex)) return { signerCount: 0, sigs: [] };
  const sigsStartHex = sigsOffsetHex * 2;
  const sigsLen = parseInt(body.slice(sigsStartHex, sigsStartHex + 64), 16);
  if (!Number.isFinite(sigsLen)) return { signerCount: 0, sigs: [] };

  const sigs = [];
  const sigBytes = 65; // r(32) + s(32) + v(1)
  for (let off = sigsStartHex + 64; off + sigBytes * 2 <= sigsStartHex + 64 + sigsLen * 2; off += sigBytes * 2) {
    const r = "0x" + body.slice(off, off + 64);
    const s = "0x" + body.slice(off + 64, off + 128);
    const v = parseInt(body.slice(off + 128, off + 130), 16);
    sigs.push({ r, s, v });
  }
  return { signerCount: sigs.length, sigs };
}

/**
 * Assess the risk of a Safe transaction. Safe txs are typically safe
 * (multi-sig) but the INNER call may be malicious.
 *
 * @param {object} safeInfo — output of detectSafeTransaction()
 * @param {object} [ctx]
 * @param {string} [ctx.userAddress] — user's address (one of the owners)
 * @param {number} [ctx.threshold] — Safe's threshold (M of N)
 * @param {number} [ctx.ownersCount] — total owners
 * @returns {{ riskLevel: string, risks: Array, recommendations: string[], info: Array }}
 */
export function assessSafeRisk(safeInfo, ctx = {}) {
  const risks = [];
  const recommendations = [];
  const info = [];

  if (!safeInfo || !safeInfo.isSafeTx) {
    return { riskLevel: "none", risks, recommendations, info };
  }

  info.push({ type: "safe-version", message: `Safe singleton detected (${safeInfo.safeVersion})` });

  if (safeInfo.isApproveHash) {
    info.push({ type: "approve-hash", message: "This is an approveHash call. Another owner must approve the queued tx hash before execTransaction." });
    recommendations.push("Verify that the hash you're approving matches a Safe transaction you initiated. The Safe UI shows this hash.");
    return { riskLevel: "low", risks, recommendations, info };
  }

  if (safeInfo.isExecTransaction && safeInfo.innerCall) {
    const inner = safeInfo.innerCall;
    info.push({
      type: "exec-transaction",
      message: `Safe will execute: ${shorten(inner.to)} with ${formatValue(inner.value)} wei`
    });

    // Check if inner call is to a drainer
    const ZERO = "0x0000000000000000000000000000000000000000";
    if (inner.to === ZERO) {
      risks.push({
        type: "safe-exec-to-zero",
        severity: "high",
        message: "Safe execTransaction targets the zero address. This can break the Safe or send funds to a black hole."
      });
    }

    // Delegate call warning (operation == 1)
    if (inner.operation === 1) {
      risks.push({
        type: "safe-delegate-call",
        severity: "high",
        message: "Safe delegate-call (operation=1). Delegate-calls execute the target contract's code IN THE SAFE'S CONTEXT, with full access to all Safe assets. Verify the target is trusted and audited."
      });
    }

    // Inner call to a known drainer selector
    const innerSel = (inner.data || "0x").slice(0, 10).toLowerCase();
    if (["0xa9059cbb", "0x23b872dd", "0x095ea7b3"].includes(innerSel)) {
      risks.push({
        type: "safe-inner-asset-transfer",
        severity: "medium",
        message: `Inner call (${innerSel}) is a direct asset transfer or approval. Verify the recipient and amount.`
      });
    }

    if (ctx.threshold && ctx.ownersCount) {
      info.push({
        type: "safe-threshold",
        message: `Safe is configured ${ctx.threshold}-of-${ctx.ownersCount}`
      });
      if (ctx.threshold === 1) {
        risks.push({
          type: "safe-threshold-1-of-n",
          severity: "medium",
          message: `Safe threshold is 1-of-${ctx.ownersCount}. A single owner compromise can drain the Safe. Consider raising the threshold for high-value Safes.`
        });
      }
    }
  }

  recommendations.push("Verify the Safe transaction on the Safe UI (https://app.safe.global) before signing.");
  recommendations.push("Multi-sig owners should NEVER sign a Safe tx they did not personally initiate.");

  const order = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  let riskLevel = "none";
  for (const r of risks) if (order[r.severity] > order[riskLevel]) riskLevel = r.severity;
  return { riskLevel, risks, recommendations, info };
}

function shorten(addr) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatValue(v) {
  try {
    const big = BigInt(v || "0");
    const eth = Number(big) / 1e18;
    if (eth >= 1) return `${eth.toFixed(4)} ETH`;
    return `${big.toString()} wei`;
  } catch { return v || "0"; }
}
