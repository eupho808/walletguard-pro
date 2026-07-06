/**
 * @fileoverview Wallet DNA — On-Device Behavioral Anomaly Detection
 *
 * Builds a behavioral profile of the user's wallet from observed
 * transactions and flags new ones that deviate significantly from
 * established patterns. All learning happens LOCALLY — nothing is
 * uploaded anywhere.
 *
 * Profile captures per-wallet:
 *   - Typical gas price (gwei) and gas limit
 *   - Active hours (UTC hour distribution, weighted)
 *   - Typical value range (native + ERC-20)
 *   - Frequently-used contracts (set with hit counts)
 *   - Common function selectors (set with hit counts)
 *   - Common chains used
 *
 * Anomaly scoring compares a new tx against the profile. Each
 * dimension contributes to a 0–100 anomaly score. Score > 70 ⇒
 * "anomalous"; > 90 ⇒ "highly anomalous" (likely compromised wallet
 * or new device).
 *
 * Storage: pass a state object around; persist as JSON via caller.
 *
 * @module lib/wallet-dna
 */

/**
 * Default profile for a brand-new wallet (no history).
 */
export function emptyProfile(address) {
  return {
    address: (address || "").toLowerCase(),
    version: 1,
    samples: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    gasPriceGwei:   { count: 0, mean: 0, m2: 0 }, // Welford's online variance
    gasLimit:       { count: 0, mean: 0, m2: 0 },
    nativeValueWei: { count: 0, mean: 0, m2: 0 },
    hours: new Array(24).fill(0),                 // raw counts, weighted by recency
    contracts: Object.create(null),               // address → count
    selectors: Object.create(null),               // 4-byte selector → count
    chains: Object.create(null),                  // chainId → count
    txCount: 0
  };
}

/**
 * Update a profile with a new transaction. Uses Welford's algorithm for
 * numerically-stable online mean/variance. Idempotent in the sense that
 * running the same tx multiple times skews the profile — callers should
 * only feed real, observed transactions.
 *
 * @param {object} profile
 * @param {object} tx — observed transaction
 * @param {string} tx.from
 * @param {string} [tx.to]
 * @param {string} [tx.value] — hex or decimal string
 * @param {string} [tx.gasPrice] — hex or decimal string
 * @param {string} [tx.gas] — hex or decimal string
 * @param {string} [tx.data] — hex calldata
 * @param {number|string} [tx.chainId]
 * @param {number} [tx.timestamp] — unix seconds (default now)
 * @returns {object} the updated profile (mutated in place, also returned)
 */
export function observe(profile, tx) {
  if (!profile || typeof profile !== "object") profile = emptyProfile(tx && tx.from);
  if (tx.from) profile.address = String(tx.from).toLowerCase();

  // ── gasPrice (gwei) ──
  const gp = toNumberSafe(toBigIntSafe(tx.gasPrice));
  if (Number.isFinite(gp) && gp >= 0) {
    const gwei = gp / 1e9;
    updateWelford(profile.gasPriceGwei, gwei);
  }

  // ── gas limit ──
  const gl = toNumberSafe(toBigIntSafe(tx.gas));
  if (Number.isFinite(gl) && gl >= 0) {
    updateWelford(profile.gasLimit, gl);
  }

  // ── native value (tracked in log10(wei) space — heavy-tailed distribution) ──
  // Uses bigint-safe log10 so very large wei values are handled accurately.
  const valBig = toBigIntSafe(tx.value);
  if (valBig !== null && valBig >= 0n) {
    const lv = log10BigInt(valBig + 1n);
    if (Number.isFinite(lv)) {
      updateWelford(profile.nativeValueWei, lv);
    }
  }

  // ── hour distribution ──
  const ts = tx.timestamp || Math.floor(Date.now() / 1000);
  try {
    const hour = new Date(ts * 1000).getUTCHours();
    profile.hours[hour] = (profile.hours[hour] || 0) + 1;
  } catch { /* ignore */ }

  // ── target contract ──
  if (tx.to) {
    const c = String(tx.to).toLowerCase();
    profile.contracts[c] = (profile.contracts[c] || 0) + 1;
  }

  // ── function selector ──
  if (tx.data && tx.data.length >= 10) {
    const sel = String(tx.data).slice(0, 10).toLowerCase();
    profile.selectors[sel] = (profile.selectors[sel] || 0) + 1;
  }

  // ── chain ──
  const cid = Number(tx.chainId);
  if (Number.isFinite(cid)) {
    profile.chains[cid] = (profile.chains[cid] || 0) + 1;
  }

  profile.txCount = (profile.txCount || 0) + 1;
  profile.samples = profile.txCount;
  profile.updatedAt = new Date().toISOString();
  return profile;
}

/**
 * Welford's online mean + sum-of-squares-of-differences-from-mean.
 */
function updateWelford(state, value) {
  state.count++;
  const delta = value - state.mean;
  state.mean += delta / state.count;
  const delta2 = value - state.mean;
  state.m2 += delta * delta2;
}

/**
 * Sample standard deviation.
 */
function stddev(state) {
  if (!state || state.count < 2) return 0;
  return Math.sqrt(state.m2 / (state.count - 1));
}

/**
 * Score a candidate transaction against the profile. Returns an object
 * with per-dimension anomaly points and an aggregate score (0–100).
 *
 * @param {object} profile
 * @param {object} tx — same shape as observe()
 * @returns {{
 *   score: number,           // 0–100
 *   level: "normal"|"unusual"|"anomalous"|"highly-anomalous",
 *   factors: Array<{name, points, detail}>,
 *   isNewContract: boolean,
 *   isNewSelector: boolean,
 *   isOffHours: boolean,
 *   isOffChain: boolean,
 *   profileSamples: number
 * }}
 */
export function scoreAnomaly(profile, tx) {
  if (!profile || !profile.samples || profile.samples < 5) {
    return {
      score: 0,
      level: "normal",
      factors: [{ name: "cold-start", points: 0, detail: `Profile has ${profile?.samples || 0} samples — too few to score anomalies` }],
      isNewContract: false,
      isNewSelector: false,
      isOffHours: false,
      isOffChain: false,
      profileSamples: profile?.samples || 0
    };
  }

  const factors = [];

  // ── gasPrice z-score ──
  const gp = toNumberSafe(toBigIntSafe(tx.gasPrice));
  if (Number.isFinite(gp) && gp >= 0) {
    const gwei = gp / 1e9;
    const sd = stddev(profile.gasPriceGwei);
    if (sd > 0) {
      const z = Math.abs((gwei - profile.gasPriceGwei.mean) / sd);
      const pts = zScoreToPoints(z);
      if (pts > 0) factors.push({ name: "gas-price-z", points: pts, detail: `z=${z.toFixed(1)} (mean ${profile.gasPriceGwei.mean.toFixed(1)} gwei, sd ${sd.toFixed(1)})` });
    }
  }

  // ── gas limit z-score ──
  const gl = toNumberSafe(toBigIntSafe(tx.gas));
  if (Number.isFinite(gl) && gl >= 0) {
    const sd = stddev(profile.gasLimit);
    if (sd > 0) {
      const z = Math.abs((gl - profile.gasLimit.mean) / sd);
      const pts = zScoreToPoints(z);
      if (pts > 0) factors.push({ name: "gas-limit-z", points: pts, detail: `z=${z.toFixed(1)} (mean ${profile.gasLimit.mean.toFixed(0)}, sd ${sd.toFixed(0)})` });
    }
  }

  // ── value z-score (log10 space; bigint-safe) ──
  const valBig = toBigIntSafe(tx.value);
  if (valBig !== null && valBig > 0n) {
    const lv = log10BigInt(valBig + 1n);
    if (Number.isFinite(lv)) {
      const lm = profile.nativeValueWei.mean;     // already in log-space
      const sd = stddev(profile.nativeValueWei);
      // Floor sd at 0.5 (≈ 0.5 dex ≈ 3.16× difference) to avoid over-sensitivity
      // for wallets with very tight value ranges.
      const effSd = Math.max(sd, 0.5);
      const z = Math.abs((lv - lm) / effSd);
      const pts = zScoreToPoints(z);
      if (pts > 0) {
        // Convert log10 back to human-readable ETH for the detail string.
        const meanEth = Math.pow(10, lm) / 1e18;
        const txEth = Math.pow(10, lv) / 1e18;
        factors.push({
          name: "value-z",
          points: pts,
          detail: `z=${z.toFixed(1)} (mean ${meanEth.toFixed(4)} ETH, this tx ${txEth.toFixed(4)} ETH)`
        });
      }
    }
  }

  // ── new contract? ──
  let isNewContract = false;
  if (tx.to) {
    const c = String(tx.to).toLowerCase();
    isNewContract = !profile.contracts[c];
    if (isNewContract) factors.push({ name: "new-contract", points: 15, detail: `Never seen target ${c.slice(0, 10)}…` });
  }

  // ── new selector? ──
  let isNewSelector = false;
  if (tx.data && tx.data.length >= 10) {
    const sel = String(tx.data).slice(0, 10).toLowerCase();
    isNewSelector = !profile.selectors[sel];
    if (isNewSelector) factors.push({ name: "new-selector", points: 10, detail: `New function ${sel}` });
  }

  // ── off-hours? ──
  let isOffHours = false;
  const ts = tx.timestamp || Math.floor(Date.now() / 1000);
  try {
    const hour = new Date(ts * 1000).getUTCHours();
    const total = profile.hours.reduce((a, b) => a + b, 0);
    const hrFrac = total > 0 ? (profile.hours[hour] || 0) / total : 0;
    if (hrFrac < 0.01 && total > 20) {
      isOffHours = true;
      factors.push({ name: "off-hours", points: 8, detail: `Hour ${hour}:00 UTC — <1% of past activity` });
    }
  } catch { /* ignore */ }

  // ── off-chain? ──
  let isOffChain = false;
  const cid = Number(tx.chainId);
  if (Number.isFinite(cid) && Object.keys(profile.chains).length > 0) {
    if (!profile.chains[cid]) {
      isOffChain = true;
      factors.push({ name: "new-chain", points: 12, detail: `First time on chain ${cid}` });
    }
  }

  // ── aggregate score ──
  const raw = factors.reduce((a, f) => a + f.points, 0);
  const score = Math.min(100, raw);
  let level;
  if (score >= 90) level = "highly-anomalous";
  else if (score >= 70) level = "anomalous";
  else if (score >= 40) level = "unusual";
  else level = "normal";

  return {
    score,
    level,
    factors,
    isNewContract,
    isNewSelector,
    isOffHours,
    isOffChain,
    profileSamples: profile.samples
  };
}

function zScoreToPoints(z) {
  if (z >= 5) return 30;
  if (z >= 4) return 25;
  if (z >= 3) return 18;
  if (z >= 2.5) return 12;
  if (z >= 2) return 8;
  if (z >= 1.5) return 4;
  return 0;
}

function toBigIntSafe(val) {
  if (val == null) return null;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(val);
  if (typeof val === 'string') {
    try { return BigInt(val); } catch { return null; }
  }
  return null;
}

function toNumberSafe(bi) {
  if (bi == null) return NaN;
  try {
    if (bi > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
    return Number(bi);
  } catch { return NaN; }
}

/**
 * BigInt-safe log10. Works for arbitrarily large wei values without
 * losing precision (unlike Number(v) → log10 which clamps to MAX_SAFE_INTEGER).
 *
 * Examples:
 *   log10BigInt(1n) = 0
 *   log10BigInt(10n) = 1
 *   log10BigInt(1e18n) ≈ 18
 *   log10BigInt(1e77n) ≈ 77  (max ETH supply)
 */
function log10BigInt(bi) {
  if (bi <= 0n) return 0;
  const s = bi.toString();
  const digits = s.length;
  // Take first up to 15 digits, normalize as fraction [1, 10).
  const headLen = Math.min(15, digits);
  const head = parseInt(s.slice(0, headLen), 10);
  const headNorm = head / Math.pow(10, headLen - 1);
  return (digits - 1) + Math.log10(headNorm);
}

/**
 * Serialize profile for storage (handles Maps / plain objects).
 */
export function serializeProfile(profile) {
  return JSON.stringify(profile, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out = {};
      for (const k of Object.keys(v)) out[k] = v[k];
      return out;
    }
    return v;
  });
}

/**
 * Parse a serialized profile back. Tolerant of unknown fields.
 */
export function deserializeProfile(json) {
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.hours) || parsed.hours.length !== 24) parsed.hours = new Array(24).fill(0);
    if (!parsed.contracts) parsed.contracts = Object.create(null);
    if (!parsed.selectors) parsed.selectors = Object.create(null);
    if (!parsed.chains) parsed.chains = Object.create(null);
    return parsed;
  } catch { return null; }
}
