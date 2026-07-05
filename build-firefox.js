// build-firefox.js - Firefox manifest helper.
//
// Run with:  node build-firefox.js
//
// Strategy: keep BOTH manifests checked in (manifest.json for Chrome,
// manifest.firefox.json for Firefox) and use this script as a guide +
// checker rather than a clobberer. Overwriting manifest.json is risky
// because you might forget to revert it before building for Chrome.
//
// Two usage modes:
//
//   1. DEV MODE (load unpacked in Firefox via about:debugging):
//
//      On Windows:
//        copy manifest.firefox.json manifest.json
//        :: ... test in Firefox ...
//        git checkout manifest.json
//
//      On macOS/Linux:
//        cp manifest.firefox.json manifest.json
//        # ... test in Firefox ...
//        git checkout manifest.json
//
//   2. AMO SUBMISSION (zip and upload to addons.mozilla.org):
//
//      Use build-firefox-pack.js (separate script) which copies the
//      Firefox manifest into dist-firefox/ without touching the source.
//
// This script's job is just to (a) verify the Firefox manifest is valid,
// (b) print the dev-mode copy/paste command for the current platform.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FX = path.join(__dirname, "manifest.firefox.json");

function fail(msg) {
  console.error("ERROR: " + msg);
  process.exit(1);
}

// 1. Verify the Firefox manifest exists and parses as JSON.
if (!fs.existsSync(FX)) fail("manifest.firefox.json not found");
let fx;
try {
  fx = JSON.parse(fs.readFileSync(FX, "utf8"));
} catch (e) {
  fail("manifest.firefox.json is not valid JSON: " + e.message);
}

// 2. Spot-check required fields.
const required = ["manifest_version", "name", "version", "description",
                  "permissions", "host_permissions", "content_scripts",
                  "browser_specific_settings"];
for (const k of required) {
  if (!(k in fx)) fail(`Firefox manifest missing required field: ${k}`);
}
if (fx.manifest_version !== 3) fail("Firefox manifest must be MV3 (got " + fx.manifest_version + ")");
if (!fx.browser_specific_settings.gecko || !fx.browser_specific_settings.gecko.id) {
  fail("Firefox manifest missing browser_specific_settings.gecko.id");
}

console.log("OK: manifest.firefox.json is valid MV3 with gecko.id " + fx.browser_specific_settings.gecko.id);
console.log("");

// 3. Print platform-specific copy/paste command for dev mode.
const isWin = os.platform() === "win32";
console.log("To test in Firefox (dev mode):");
if (isWin) {
  console.log("  copy manifest.firefox.json manifest.json");
  console.log("  :: load the folder in Firefox via about:debugging");
  console.log("  git checkout manifest.json");
} else {
  console.log("  cp manifest.firefox.json manifest.json");
  console.log("  # load the folder in Firefox via about:debugging");
  console.log("  git checkout manifest.json");
}
console.log("");
console.log("To package for AMO submission, run build-firefox-pack.js (TODO).");
