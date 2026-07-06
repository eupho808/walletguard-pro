// lib/i18n.js - Internationalization core for WalletGuard Pro.
//
// Lightweight custom i18n system (not Chrome's native chrome.i18n) so we
// can:
//   1. Switch locale at runtime (user preference in settings).
//   2. Use {placeholder} interpolation in translations.
//   3. Apply translations declaratively via data-i18n / data-i18n-attr.
//
// Chrome MV3 also requires `_locales/<lang>/messages.json` for store
// metadata (name, description) — that's separate from this runtime
// system and lives in `_locales/en/messages.json`.
//
// Locales are loaded from `window.__WG_LOCALES__` (injected by build.js
// at bundle time) or via the dynamic `setMessages()` API for tests.
// The bundled locale table MUST contain at least "en" — otherwise we
// fall back to an empty messages object (key strings pass through as
// t() returns, which is the design fallback).
//
// Fallback chain:
//   user override (chrome.storage.local "wg_locale")
//     → browser locale (chrome.i18n.getUILanguage() / navigator.language)
//       → "en"
//
// Usage:
//   const { t, applyTranslations, initI18n, setLocale } = window.WG_POPUP_LIB.i18n;
//   await initI18n();
//   alert(t("popup.alert.scanFailed", { error: msg }));

export const SUPPORTED_LOCALES = ["en", "ru", "es", "zh", "ja", "ko"];
export const DEFAULT_LOCALE = "en";

export const LOCALE_DISPLAY = {
  en: "English",
  ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
  es: "Espa\u00f1ol",
  zh: "\u4e2d\u6587",
  ja: "\u65e5\u672c\u8a9e",
  ko: "\ud55c\uad6d\uc5b4"
};

// In-memory locale tables. Populated by:
//   1. The bundle (popup-bundle.js injects window.__WG_LOCALES__ before
//      this module loads).
//   2. setMessages(locale, obj) for tests / dynamic loading.
let LOCALES = {};

/**
 * Replace the entire locale table. Used by the build pipeline and by
 * tests that want to inject custom messages.
 */
export function setMessages(table) {
  LOCALES = table || {};
  // Invalidate cached current locale so the next t() rebuilds.
  messages = null;
}

/**
 * Set messages for a single locale (merge with existing).
 */
export function setLocaleMessages(locale, messages) {
  if (!LOCALES[locale]) LOCALES[locale] = {};
  Object.assign(LOCALES[locale], messages || {});
}

/**
 * Normalize a raw locale string ("ru-RU", "en_US", "zh-Hans") to a
 * supported short code ("ru", "en", "zh"). Falls back to DEFAULT_LOCALE.
 */
export function normalizeLocale(raw) {
  if (!raw || typeof raw !== "string") return DEFAULT_LOCALE;
  const lower = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(lower) ? lower : DEFAULT_LOCALE;
}

/**
 * Detect browser locale. In extension context prefers
 * chrome.i18n.getUILanguage(); elsewhere falls back to navigator.language.
 */
export function detectLocale() {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getUILanguage === "function") {
      return normalizeLocale(chrome.i18n.getUILanguage());
    }
  } catch { /* sandbox may block chrome access */ }
  if (typeof navigator !== "undefined" && navigator.language) {
    return normalizeLocale(navigator.language);
  }
  return DEFAULT_LOCALE;
}

/**
 * Populate LOCALES from window.__WG_LOCALES__ if it hasn't been loaded yet.
 * Called lazily from setLocale/t/initI18n so direct setLocale() calls work
 * without needing initI18n() first.
 */
function ensureLocalesLoaded() {
  if (Object.keys(LOCALES).length > 0) return;
  try {
    const src = (typeof window !== "undefined" && window.__WG_LOCALES__)
      || (typeof globalThis !== "undefined" && globalThis.__WG_LOCALES__);
    if (src && typeof src === "object") LOCALES = src;
  } catch { /* ignore */ }
}

/**
 * Switch the active locale and rebuild the messages table.
 */
export function setLocale(locale) {
  ensureLocalesLoaded();
  const resolved = normalizeLocale(locale);
  currentLocale = resolved;
  messages = LOCALES[resolved] || LOCALES[DEFAULT_LOCALE] || {};
  return resolved;
}

/**
 * Return the currently active locale code.
 */
export function getLocale() {
  return currentLocale || DEFAULT_LOCALE;
}

let currentLocale = null;
let messages = null;
const STORAGE_KEY = "wg_locale";

/**
 * Load the user-chosen override from chrome.storage.local (if available)
 * and apply it. Safe to call multiple times; idempotent after first call.
 *
 * Also reads `window.__WG_LOCALES__` if LOCALES is empty (popup page
 * case where the bundle injected locales before this module ran).
 *
 * Returns a promise that resolves to the active locale code.
 */
export async function initI18n() {
  ensureLocalesLoaded();

  let override = null;
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      override = await new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          resolve(result && result[STORAGE_KEY] ? result[STORAGE_KEY] : null);
        });
      });
    }
  } catch { /* ignore */ }
  if (override) {
    setLocale(override);
  } else {
    setLocale(detectLocale());
  }
  return getLocale();
}

/**
 * Persist a locale override. Returns the resolved locale code.
 */
export async function saveLocale(locale) {
  const resolved = setLocale(locale);
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEY]: resolved }, resolve);
      });
    }
  } catch { /* non-extension context — override is in-memory only */ }
  return resolved;
}

/**
 * Translate a key. Falls back to English if the key is missing in the
 * active locale; falls back to the key itself if missing everywhere.
 * Supports {placeholder} interpolation.
 */
export function t(key, params) {
  if (!messages) {
    ensureLocalesLoaded();
    setLocale(detectLocale());
  }
  let str = messages[key];
  if (str === undefined && LOCALES[DEFAULT_LOCALE]) {
    str = LOCALES[DEFAULT_LOCALE][key];
  }
  if (str === undefined) return key;
  if (params && typeof str === "string") {
    for (const k of Object.keys(params)) {
      str = str.replace(new RegExp("\\{" + k + "\\}", "g"), String(params[k]));
    }
  }
  return str;
}

/**
 * Walk a DOM subtree and apply translations declaratively via
 * data-i18n (textContent) and data-i18n-attr (setAttribute, format:
 * "attr:key, attr:key").
 */
export function applyTranslations(root) {
  const el = root || (typeof document !== "undefined" ? document : null);
  if (!el || typeof el.querySelectorAll !== "function") return;

  el.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) node.textContent = t(key);
  });

  el.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    const mappings = (node.getAttribute("data-i18n-attr") || "").split(",");
    for (const mapping of mappings) {
      const parts = mapping.split(":");
      if (parts.length !== 2) continue;
      const attr = parts[0].trim();
      const key = parts[1].trim();
      if (attr && key) node.setAttribute(attr, t(key));
    }
  });

  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = getLocale();
  }
}

/**
 * Return a list of available locale codes (based on what's loaded).
 */
export function availableLocales() {
  return Object.keys(LOCALES).length > 0 ? Object.keys(LOCALES).sort() : SUPPORTED_LOCALES.slice();
}
