// test-i18n.js - Tests for lib/i18n.js and locale files.
//
// Verifies:
//   1. Locale normalization (raw strings -> supported codes).
//   2. Locale detection.
//   3. setLocale / getLocale / t() with interpolation.
//   4. Fallback to English when a key is missing in the active locale.
//   5. Key-as-fallback when missing everywhere.
//   6. setMessages / setLocaleMessages for test injection.
//   7. All 4 locale files load and have matching key sets.
//   8. Popup bundle injects all 4 locales via __WG_LOCALES__.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  normalizeLocale,
  detectLocale,
  setLocale,
  getLocale,
  t,
  setMessages,
  setLocaleMessages,
  availableLocales,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_DISPLAY
} from "./lib/i18n.js";

import { MESSAGES as EN } from "./lib/locales/en.js";
import { MESSAGES as RU } from "./lib/locales/ru.js";
import { MESSAGES as ES } from "./lib/locales/es.js";
import { MESSAGES as ZH } from "./lib/locales/zh.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  ok  ${name}`);
  passed++;
}

function eq(actual, expected, name) {
  if (actual === expected) {
    ok(name);
  } else {
    console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function ne(actual, bad, name) {
  if (actual !== bad) {
    ok(name);
  } else {
    console.log(`  FAIL ${name}: unexpected ${JSON.stringify(bad)}`);
    failed++;
  }
}

// ---- 1. normalizeLocale ----
eq(normalizeLocale("en"), "en", "normalize en");
eq(normalizeLocale("EN"), "en", "normalize EN -> en");
eq(normalizeLocale("en-US"), "en", "normalize en-US");
eq(normalizeLocale("en_US"), "en", "normalize en_US");
eq(normalizeLocale("ru-RU"), "ru", "normalize ru-RU");
eq(normalizeLocale("zh-Hans"), "zh", "normalize zh-Hans");
eq(normalizeLocale("zh-Hant"), "zh", "normalize zh-Hant -> zh (best effort)");
eq(normalizeLocale("fr-FR"), DEFAULT_LOCALE, "normalize fr-FR -> default");
eq(normalizeLocale(""), DEFAULT_LOCALE, "normalize empty -> default");
eq(normalizeLocale(null), DEFAULT_LOCALE, "normalize null -> default");
eq(normalizeLocale(undefined), DEFAULT_LOCALE, "normalize undefined -> default");
eq(normalizeLocale("xyz"), DEFAULT_LOCALE, "normalize unknown -> default");

// ---- 2. detectLocale ----
const detected = detectLocale();
if (SUPPORTED_LOCALES.includes(detected)) {
  ok(`detectLocale returns supported code (got "${detected}")`);
} else {
  console.log(`  FAIL detectLocale returned unsupported "${detected}"`);
  failed++;
}

// ---- 3. setLocale / getLocale ----
eq(setLocale("ru"), "ru", "setLocale(ru) returns ru");
eq(getLocale(), "ru", "getLocale reflects setLocale");
eq(setLocale("es"), "es", "setLocale(es) returns es");
eq(setLocale("FR"), "en", "setLocale(FR) normalizes to en");
eq(setLocale("zh-CN"), "zh", "setLocale(zh-CN) returns zh");

// ---- 4. t() with interpolation ----
// Use the bundled locale data via setMessages.
setMessages({ en: EN, ru: RU, es: ES, zh: ZH });

setLocale("en");
eq(t("popup.approvals.time.minutesAgo", { n: 5 }), "5m ago", "en minutesAgo");
eq(t("popup.approvals.time.hoursAgo", { n: 3 }), "3h ago", "en hoursAgo");
eq(t("popup.approvals.time.daysAgo", { n: 7 }), "7d ago", "en daysAgo");
eq(t("popup.approvals.chains", { scanned: 7, total: 9 }), "(7/9 chains)", "en chains format");
eq(t("popup.approvals.scanFailed", { error: "timeout" }), "Scan failed: timeout", "en scanFailed interpolation");
eq(t("onboarding.step1.title"), "Welcome to WalletGuard Pro", "en onboarding step1 title");
eq(t("onboarding.indicator", { current: 2, total: 4 }), "Step 2 of 4", "en onboarding indicator");

setLocale("ru");
eq(t("popup.approvals.time.minutesAgo", { n: 5 }), "5 \u043c\u0438\u043d \u043d\u0430\u0437\u0430\u0434", "ru minutesAgo (cyrillic)");
eq(t("popup.approvals.scanFailed", { error: "timeout" }), "\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f: timeout", "ru scanFailed (cyrillic)");
eq(t("onboarding.step1.title"), "\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u0432 WalletGuard Pro", "ru onboarding step1 title (cyrillic)");

setLocale("es");
eq(t("popup.approvals.time.minutesAgo", { n: 5 }), "hace 5m", "es minutesAgo");
eq(t("onboarding.step1.title"), "Bienvenido a WalletGuard Pro", "es onboarding step1 title");

setLocale("zh");
eq(t("onboarding.step1.title"), "\u6b22\u8fce\u4f7f\u7528 WalletGuard Pro", "zh onboarding step1 title");
eq(t("popup.approvals.time.minutesAgo", { n: 5 }), "5 \u5206\u949f\u524d", "zh minutesAgo");

// ---- 5. Fallback: missing key in active locale falls back to en ----
setMessages({
  en: { "only.en": "English only" },
  ru: { "russian.only": "Russian only" }
});
setLocale("ru");
eq(t("only.en"), "English only", "missing key in ru falls back to en");
eq(t("russian.only"), "Russian only", "key present in ru is used directly");

// ---- 6. Missing everywhere returns key ----
eq(t("nonexistent.key.zzz"), "nonexistent.key.zzz", "missing everywhere returns key");

// ---- 7. setLocaleMessages merges ----
setMessages({ en: { a: "A-en" } });
setLocale("es"); // no es in table
eq(t("a"), "A-en", "es missing falls back to en after setMessages");
setLocaleMessages("es", { a: "A-es" });
setLocale("es"); // re-resolve messages after adding es
eq(t("a"), "A-es", "es after setLocaleMessages(es) + setLocale(es) returns A-es");

// ---- 8. availableLocales ----
setMessages({ en: EN, ru: RU, es: ES, zh: ZH });
const avail = availableLocales();
if (avail.includes("en") && avail.includes("ru") && avail.includes("es") && avail.includes("zh")) {
  ok(`availableLocales includes all 4 (got ${avail.length})`);
} else {
  console.log(`  FAIL availableLocales missing one: ${avail.join(",")}`);
  failed++;
}

// ---- 9. SUPPORTED_LOCALES / DEFAULT_LOCALE / LOCALE_DISPLAY ----
eq(SUPPORTED_LOCALES.length, 4, "SUPPORTED_LOCALES has 4 entries");
eq(DEFAULT_LOCALE, "en", "DEFAULT_LOCALE is en");
if (LOCALE_DISPLAY.ru && /[\u0400-\u04ff]/.test(LOCALE_DISPLAY.ru)) {
  ok("LOCALE_DISPLAY.ru contains Cyrillic");
} else {
  console.log(`  FAIL LOCALE_DISPLAY.ru: ${JSON.stringify(LOCALE_DISPLAY.ru)}`);
  failed++;
}

// ---- 10. All locale files have the same key set (consistency) ----
const enKeys = new Set(Object.keys(EN));
const ruKeys = new Set(Object.keys(RU));
const esKeys = new Set(Object.keys(ES));
const zhKeys = new Set(Object.keys(ZH));

function missingKeys(haveSet, refSet) {
  return [...refSet].filter((k) => !haveSet.has(k));
}
function extraKeys(haveSet, refSet) {
  return [...haveSet].filter((k) => !refSet.has(k));
}

const ruMissing = missingKeys(ruKeys, enKeys);
const ruExtra = extraKeys(ruKeys, enKeys);
const esMissing = missingKeys(esKeys, enKeys);
const esExtra = extraKeys(esKeys, enKeys);
const zhMissing = missingKeys(zhKeys, enKeys);
const zhExtra = extraKeys(zhKeys, enKeys);

if (ruMissing.length === 0 && ruExtra.length === 0) {
  ok("ru.js has same key set as en.js");
} else {
  console.log(`  FAIL ru.js keys differ: missing=${ruMissing.length} extra=${ruExtra.length}`);
  if (ruMissing.length) console.log(`    missing: ${ruMissing.slice(0, 5).join(", ")}`);
  if (ruExtra.length) console.log(`    extra:   ${ruExtra.slice(0, 5).join(", ")}`);
  failed++;
}

if (esMissing.length === 0 && esExtra.length === 0) {
  ok("es.js has same key set as en.js");
} else {
  console.log(`  FAIL es.js keys differ: missing=${esMissing.length} extra=${esExtra.length}`);
  if (esMissing.length) console.log(`    missing: ${esMissing.slice(0, 5).join(", ")}`);
  if (esExtra.length) console.log(`    extra:   ${esExtra.slice(0, 5).join(", ")}`);
  failed++;
}

if (zhMissing.length === 0 && zhExtra.length === 0) {
  ok("zh.js has same key set as en.js");
} else {
  console.log(`  FAIL zh.js keys differ: missing=${zhMissing.length} extra=${zhExtra.length}`);
  if (zhMissing.length) console.log(`    missing: ${zhMissing.slice(0, 5).join(", ")}`);
  if (zhExtra.length) console.log(`    extra:   ${zhExtra.slice(0, 5).join(", ")}`);
  failed++;
}

// ---- 11. No empty translations ----
let emptyCount = 0;
for (const [code, msgs] of [["en", EN], ["ru", RU], ["es", ES], ["zh", ZH]]) {
  for (const k of Object.keys(msgs)) {
    if (typeof msgs[k] !== "string" || msgs[k].trim() === "") {
      emptyCount++;
    }
  }
}
eq(emptyCount, 0, "no empty/non-string translations across all locales");

// ---- 12. Popup bundle injects all 4 locales via __WG_LOCALES__ ----
const popupSrc = fs.readFileSync(path.join(__dirname, "popup-bundle.js"), "utf8");
if (popupSrc.includes("__WG_LOCALES__")) {
  ok("popup-bundle.js declares __WG_LOCALES__");
} else {
  console.log(`  FAIL popup-bundle.js missing __WG_LOCALES__`);
  failed++;
}
for (const code of ["en", "ru", "es", "zh"]) {
  if (popupSrc.includes(`"${code}":`)) {
    ok(`popup-bundle.js contains locale "${code}"`);
  } else {
    console.log(`  FAIL popup-bundle.js missing locale "${code}"`);
    failed++;
  }
}

// ---- 13. Special characters preserved ----
// Make sure HTML-bearing strings like <strong> and <code> are not escaped.
if (/<strong>/.test(EN["settings.api.privacy"])) {
  ok("en settings.api.privacy preserves <strong> tag");
} else {
  console.log(`  FAIL settings.api.privacy lost HTML tags`);
  failed++;
}
if (/<code>/.test(EN["settings.api.privacy"])) {
  ok("en settings.api.privacy preserves <code> tag");
} else {
  console.log(`  FAIL settings.api.privacy lost <code>`);
  failed++;
}

// ---- 14. Many interpolation calls don't leak state ----
setMessages({ en: { x: "{a}-{b}-{c}" } });
setLocale("en");
eq(t("x", { a: 1, b: 2, c: 3 }), "1-2-3", "interpolation multiple placeholders");
eq(t("x", { a: 9, b: 8, c: 7 }), "9-8-7", "interpolation doesn't leak state between calls");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
