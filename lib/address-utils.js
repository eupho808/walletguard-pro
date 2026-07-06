// lib/address-utils.js — pure helpers for address display.
//
// Loaded two ways:
//   * As a classic <script> in popup.html + settings.html (browser)
//   * Via importScripts("lib/address-utils.js") if needed by background.js
//   * Via vm.runInNewContext in test-bugfixes.js (Node tests)
//
// No `export` keyword — classic scripts can't parse it. Tests read the
// globalThis-attached object via Node's `vm` module.

(function () {
  "use strict";

  /** True for full 0x + 40 hex Ethereum addresses. */
  function isFullAddress(s) {
    return typeof s === "string" && /^0x[a-fA-F0-9]{40}$/.test(s);
  }

  /**
   * Shorten 0x + 40 hex to 0x + 4 + … + 4 form. Returns the input
   * unchanged if it's not a valid full address (so domains pass through).
   * @param {string} a
   * @returns {string}
   */
  function shortenAddr(a) {
    if (isFullAddress(a)) return a.slice(0, 6) + "\u2026" + a.slice(-4);
    return a || "";
  }

  /**
   * Clamp a string to `max` chars. Used for log messages, hostname
   * labels, and any other user-supplied text that could otherwise fill
   * storage.
   * @param {unknown} s
   * @param {number} max
   * @returns {string}
   */
  function clamp(s, max) {
    return String(s == null ? "" : s).slice(0, max);
  }

  const api = { isFullAddress, shortenAddr, clamp };

  // Browser + importScripts(): expose to globalThis so settings.js can
  // read `window.WGAddressUtils.isFullAddress(...)`.
  if (typeof globalThis !== "undefined") {
    globalThis.WGAddressUtils = api;
  }
  // CommonJS (Node): expose so test-bugfixes.js can import via vm.
  if (typeof module !== "undefined" && module && module.exports) {
    module.exports = api;
  }
})();
