// lib/storage-validators.js — type-shape validators for chrome.storage
// writes. Loaded by background.js via importScripts(); also unit-tested
// from test-bugfixes.js via Node's `vm` module.
//
// No `export` keyword — importScripts() runs in classic-script context and
// can't parse ES module syntax. The factory attaches itself to globalThis
// (browser / service-worker) and module.exports (Node CJS).

(function () {
  "use strict";

  /**
   * Factory: build validators for a given STORAGE_KEYS map.
   * @param {Record<string, string>} STORAGE_KEYS - background.js storage key map.
   * @returns {{ validateStorageShape: Function, isSensitiveKey: Function, clampString: Function }}
   */
  function makeValidators(STORAGE_KEYS) {
    if (!STORAGE_KEYS) throw new Error("STORAGE_KEYS required");

    const ARRAY_KEYS = new Set([
      STORAGE_KEYS.WHITELIST,
      STORAGE_KEYS.CUSTOM_BLACKLIST,
      STORAGE_KEYS.STALE_APPROVALS,
      STORAGE_KEYS.LOGS
    ]);
    const BOOLEAN_KEYS = new Set([
      STORAGE_KEYS.ENABLED,
      STORAGE_KEYS.MULTICHAIN,
      STORAGE_KEYS.THREAT_FEED_ENABLED,
      STORAGE_KEYS.AUTO_REVOKE_OPTED,
      STORAGE_KEYS.NOTIFICATIONS_ENABLED
    ]);
    const STRING_KEYS = new Set([
      STORAGE_KEYS.API_KEY,
      STORAGE_KEYS.LAST_WALLET
    ]);

    /**
     * Validate that `value` matches the expected shape for `key`.
     * Returns true if the value is safe to write, false otherwise.
     * @param {string} key
     * @param {unknown} value
     * @returns {boolean}
     */
    function validateStorageShape(key, value) {
      if (value === null || value === undefined) return false;
      if (typeof value === "function") return false;
      if (ARRAY_KEYS.has(key)) return Array.isArray(value);
      if (BOOLEAN_KEYS.has(key)) return typeof value === "boolean";
      if (STRING_KEYS.has(key)) return typeof value === "string" && value.length < 1024;
      if (key === STORAGE_KEYS.STATS) {
        return typeof value === "object" && !Array.isArray(value);
      }
      if (key === STORAGE_KEYS.ADDRESS_BOOK || key === STORAGE_KEYS.DNA_PROFILES) {
        return typeof value === "object" && !Array.isArray(value);
      }
      if (key === STORAGE_KEYS.AI_CACHE || key === STORAGE_KEYS.THREAT_FEED) {
        return typeof value === "object" && !Array.isArray(value);
      }
      return true;
    }

    /** True for any storage key that should never leave the device. */
    function isSensitiveKey(key) {
      return key === STORAGE_KEYS.API_KEY;
    }

    /** Cap a string at `max` chars; non-strings are coerced then capped. */
    function clampString(s, max) {
      return String(s == null ? "" : s).slice(0, max);
    }

    return { validateStorageShape, isSensitiveKey, clampString };
  }

  const api = { makeValidators };

  // Browser + importScripts() (Chrome service worker): expose to globalThis.
  if (typeof globalThis !== "undefined") {
    globalThis.WGStorageValidators = api;
  }
  // CommonJS (Node): expose so test-bugfixes.js can import via vm.
  if (typeof module !== "undefined" && module && module.exports) {
    module.exports = api;
  }
})();
