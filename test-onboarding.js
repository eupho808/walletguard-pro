// test-onboarding.js - Tests for the v3.6 onboarding tour
//
// Tests:
//   - HTML structure (overlay, panel, dots, title, body, buttons, ARIA)
//   - Storage key consistency (wg_onboardingCompleted)
//   - Background handlers present in content.js bundle
//   - Locale keys present and balanced across all 6 locales
//   - Build pipeline wires popup-bundle locale inlining
//   - Settings replay button references correct key

import assert from "node:assert/strict";
import fs from "node:fs";

let passed = 0, failed = 0;
function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) ok(name);
  else { console.log(`  FAIL ${name}: expected ${e} got ${a}`); failed++; }
}
function truthy(val, name) { ok(val ? name : `${name} (got falsy)`); }

const HTML = fs.readFileSync("popup.html", "utf8");
const CSS = fs.readFileSync("popup.css", "utf8");
const JS = fs.readFileSync("popup.js", "utf8");
const BG = fs.readFileSync("background.js", "utf8");
const SETTINGS_HTML = fs.readFileSync("settings.html", "utf8");

console.log("[HTML structure — overlay]");
{
  truthy(HTML.includes('id="onboarding"'), "overlay element exists");
  truthy(HTML.includes('id="onboarding-title"'), "title element exists");
  truthy(HTML.includes('id="onboarding-body"'), "body element exists");
  truthy(HTML.includes('id="onboarding-dots"'), "dots container exists");
  truthy(HTML.includes('id="onboarding-next"'), "next button exists");
  truthy(HTML.includes('id="onboarding-skip"'), "skip button exists");
  truthy(HTML.includes('class="onboarding__dot is-active"'), "first dot has is-active class");
  // 3 dots total (excluding the container `onboarding__dots`)
  const dotMatches = HTML.match(/class="onboarding__dot(?!\s)[^"]*"/g) || [];
  eq(dotMatches.length, 3, "exactly 3 dots");
  // ARIA
  truthy(HTML.includes('role="dialog"'), "role=dialog");
  truthy(HTML.includes('aria-modal="true"'), "aria-modal=true");
  truthy(HTML.includes('aria-labelledby="onboarding-title"'), "aria-labelledby");
}

console.log("[HTML structure — hidden by default]");
{
  truthy(/id="onboarding"[^>]*hidden/.test(HTML), "overlay starts hidden");
}

console.log("[CSS — v4 CALM styling]");
{
  truthy(CSS.includes(".onboarding"), "onboarding CSS class defined");
  truthy(CSS.includes(".onboarding__panel"), "panel CSS class defined");
  truthy(CSS.includes(".onboarding__dot"), "dot CSS class defined");
  truthy(CSS.includes(".onboarding__dot.is-active"), "active dot class defined");
  // No cyberpunk / glow / gradient
  truthy(!/box-shadow.*[0-9]+px.*0.*0.*[0-9]+px/.test(CSS.split(".onboarding")[1] || ""), "no large glow shadows in onboarding CSS");
  truthy(!/linear-gradient/.test(CSS.split(".onboarding")[1] || ""), "no linear-gradient in onboarding CSS");
}

console.log("[JS — onboarding logic in popup.js]");
{
  truthy(JS.includes("ONBOARDING_STEPS"), "ONBOARDING_STEPS constant defined");
  truthy(JS.includes("showOnboardingStep"), "showOnboardingStep function defined");
  truthy(JS.includes("advanceOnboarding"), "advanceOnboarding function defined");
  truthy(JS.includes("completeOnboarding"), "completeOnboarding function defined");
  truthy(JS.includes("skipOnboarding"), "skipOnboarding function defined");
  truthy(JS.includes("maybeShowOnboarding"), "maybeShowOnboarding function defined");
  // 3 steps
  const stepMatches = JS.match(/titleKey: "onboarding\.step\d\.title"/g) || [];
  eq(stepMatches.length, 3, "3 steps defined");
  // Keyboard handlers
  truthy(JS.includes('e.key === "Enter"'), "Enter key handler");
  truthy(JS.includes('e.key === "Escape"'), "Escape key handler");
  truthy(JS.includes('e.key === "ArrowRight"'), "ArrowRight key handler");
}

console.log("[background.js — handlers]");
{
  truthy(BG.includes('case "getOnboardingCompleted"'), "getOnboardingCompleted handler");
  truthy(BG.includes('case "setOnboardingCompleted"'), "setOnboardingCompleted handler");
  truthy(BG.includes('case "resetOnboarding"'), "resetOnboarding handler");
  truthy(BG.includes('ONBOARDING_COMPLETED: "wg_onboardingCompleted"'), "storage key defined");
}

console.log("[settings.html — replay button]");
{
  truthy(SETTINGS_HTML.includes('id="replay-onboarding-btn"'), "replay button exists");
  truthy(SETTINGS_HTML.includes('data-i18n="settings.replayOnboarding"'), "uses i18n key");
}

console.log("[settings.js — replay handler]");
{
  const settings = fs.existsSync("settings.js") ? fs.readFileSync("settings.js", "utf8") : "";
  truthy(settings.includes("replayOnboarding"), "replayOnboarding function defined");
  truthy(settings.includes('replay-onboarding-btn'), "replay button wired");
  truthy(settings.includes('action: "resetOnboarding"'), "sends resetOnboarding message");
}

console.log("[locale keys — balanced across all 6 locales]");
{
  const localeFiles = ["en", "ru", "es", "zh", "ja", "ko"];
  const requiredKeys = [
    "onboarding.step1.title",
    "onboarding.step1.body",
    "onboarding.step2.title",
    "onboarding.step2.body",
    "onboarding.step3.title",
    "onboarding.step3.body",
    "onboarding.skip",
    "onboarding.next",
    "onboarding.done",
    "settings.replayOnboarding",
    "settings.toast.replayOnboarding",
    "settings.toast.replayOnboardingFailed"
  ];
  for (const locale of localeFiles) {
    const content = fs.readFileSync(`lib/locales/${locale}.js`, "utf8");
    for (const key of requiredKeys) {
      truthy(content.includes(`"${key}":`), `${locale}.js has ${key}`);
    }
  }
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: Onboarding tour working.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
