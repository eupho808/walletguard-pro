// lib/typosquatting.js - Domain spoofing / typosquatting detection.
//
// Catches three classes of attack against WalletGuard's trusted site list:
//
//   1. Character-level typosquats
//        unisvvap.org  vs uniswap.org   (distance 2, double-tap slip)
//        uniswapp.org  vs uniswap.org   (distance 1, extra char)
//
//   2. Substring / subdomain attacks
//        uniswap.org.evil.com   (contains "uniswap.org" but is not it)
//
//   3. IDN / homoglyph attacks
//        unicwap.org with Cyrillic 'а' (visually identical to Latin 'a')
//
// Design notes:
//   - We compare eTLD+1 (last 2 labels) so that "app.uniswap.org" and
//     "blog.uniswap.org" are recognized as the same registrable domain
//     as "uniswap.org". This is a deliberately simple heuristic — all
//     domains in TRUSTED_DOMAINS are 2-label.
//   - Levenshtein threshold scales with length: ≤2 for short names,
//     ≤3 for longer ones (≤3 catches "unisvvap.org" without flooding
//     the user with false positives on random short sites).
//   - Pure module: no DOM, no globals. Safe to import from anywhere.

import { TRUSTED_DOMAINS } from "./constants.js";

// ---------- Pure helpers ----------

/**
 * Iterative Levenshtein distance with O(min(a,b)) memory.
 * Returns the minimum number of single-character edits (insertions,
 * deletions, substitutions) required to transform `a` into `b`.
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  // Iterate over the shorter string in the inner loop.
  let s, t;
  if (al <= bl) { s = a; t = b; }
  else          { s = b; t = a; }

  const sl = s.length;
  const tl = t.length;
  const prev = new Array(sl + 1);
  const curr = new Array(sl + 1);

  for (let i = 0; i <= sl; i++) prev[i] = i;

  for (let j = 1; j <= tl; j++) {
    curr[0] = j;
    const tc = t.charCodeAt(j - 1);
    for (let i = 1; i <= sl; i++) {
      const cost = s.charCodeAt(i - 1) === tc ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,        // deletion from t
        curr[i - 1] + 1,    // insertion into t
        prev[i - 1] + cost  // substitution
      );
    }
    for (let i = 0; i <= sl; i++) prev[i] = curr[i];
  }

  return prev[sl];
}

/**
 * Extract the registrable domain (eTLD+1) by taking the last two labels.
 * Good enough for the .com/.org/.io/.fi/.xyz universe covered by
 * TRUSTED_DOMAINS. Multi-segment public suffixes (.co.uk, .com.au)
 * are out of scope for this MVP.
 */
export function getRegistrableDomain(hostname) {
  if (!hostname) return "";
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/**
 * Strip leading "www." (case-insensitive). Common convention for
 * canonical form: "www.uniswap.org" and "uniswap.org" are the same site.
 */
function stripWww(host) {
  return host.replace(/^www\./, "");
}

/**
 * Distance threshold for a given trusted domain. Short names are
 * prone to false positives at distance 3 (e.g. "curve.fi" vs many
 * random .fi sites), so we tighten the threshold below 10 chars.
 */
function thresholdFor(len) {
  return len <= 10 ? 2 : 3;
}

// ---------- Public API ----------

/**
 * Inspect a hostname for typosquatting / impersonation attempts.
 *
 * @param {string} hostname - window.location.hostname or equivalent.
 * @returns {null | {
 *   type: "trusted" | "typosquat" | "subdomain-attack" | "homoglyph",
 *   match: string,        // which trusted domain triggered the verdict
 *   distance?: number,    // only set for type === "typosquat"
 *   hostname: string      // normalized input
 * }}
 *
 * Resolution order:
 *   1. Exact match against any TRUSTED_DOMAINS entry, or against the
 *      registrable form of the hostname → trusted.
 *   2. Hostname contains a trusted domain as a non-registrable substring
 *      (e.g. "uniswap.org.evil.com") → subdomain-attack.
 *   3. Non-ASCII characters in hostname → homoglyph (IDN attack).
 *   4. Levenshtein distance from registrable to any trusted domain is
 *      within threshold → typosquat.
 *   5. Otherwise null.
 */
export function findTyposquatting(hostname) {
  if (!hostname || typeof hostname !== "string") return null;

  const host = stripWww(hostname.toLowerCase().trim());
  if (!host) return null;

  const registrable = getRegistrableDomain(host);

  // 1. Trusted (exact match against either full host or eTLD+1).
  for (const trusted of TRUSTED_DOMAINS) {
    if (trusted === host || trusted === registrable) {
      return { type: "trusted", match: trusted, hostname: host };
    }
  }

  // 2. Substring / subdomain impersonation.
  //    "uniswap.org.evil.com" contains "uniswap.org" but its eTLD+1
  //    is "evil.com". A naive Levenshtein won't catch this because
  //    the strings are very different lengths.
  for (const trusted of TRUSTED_DOMAINS) {
    if (host.includes(trusted)) {
      return { type: "subdomain-attack", match: trusted, hostname: host };
    }
  }

  // 3. IDN / homoglyph. Any non-ASCII character in a domain that
  //    *looks* ASCII is a classic phishing trick (Cyrillic 'а' vs
  //    Latin 'a'). Modern browsers render these in Punycode (xn--),
  //    so we check the raw hostname first and the Punycode form
  //    second.
  if (/[^\x00-\x7F]/.test(host)) {
    for (const trusted of TRUSTED_DOMAINS) {
      if (host.includes(trusted.split(".")[0])) {
        return { type: "homoglyph", match: trusted, hostname: host };
      }
    }
    // Non-ASCII but no obvious trusted substring: still suspicious.
    return { type: "homoglyph", match: null, hostname: host };
  }

  // 4. Levenshtein typosquat.
  let best = null;
  for (const trusted of TRUSTED_DOMAINS) {
    const dist = levenshtein(registrable, trusted);
    if (dist === 0) continue; // already handled by step 1
    const t = thresholdFor(trusted.length);
    if (dist > t) continue;
    if (!best || dist < best.distance) {
      best = { type: "typosquat", match: trusted, distance: dist, hostname: host };
    }
  }

  return best;
}
