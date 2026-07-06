// build-firefox-pack.js - Package WalletGuard Pro for Firefox AMO submission.
//
// Run with:  node build-firefox-pack.js
//
// Produces:  walletguard-pro-firefox-v<VERSION>.zip in the project root,
//            ready to upload at https://addons.mozilla.org/developers/addon/submit/
//            (VERSION read from package.json)
//
// What it does:
//   1. Creates a staging dir (dist-firefox/) by copying the project.
//   2. Excludes dev cruft (.git/, node_modules/, screenshots/reference/,
//      screenshots/popup-mock.html, .github/, packages/, assets/, all *.zip).
//   3. In staging, renames manifest.firefox.json -> manifest.json
//      (Firefox requires manifest.json at root).
//   4. Creates a ZIP archive from the staged contents.
//   5. Cleans up staging.
//
// Verified separately by build-firefox.js (manifest fields + gecko.id).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;

// Read version from package.json so this stays in sync automatically.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version;

const STAGING = path.join(ROOT, "dist-firefox");
const ZIP_PATH = path.join(ROOT, `walletguard-pro-firefox-v${VERSION}.zip`);
const FIREFOX_MANIFEST = path.join(ROOT, "manifest.firefox.json");

const EXCLUDE_DIRS  = [
  ".git", "node_modules", ".github",
  "dist-firefox", "dist-chrome",
  "reference",   // screenshots/reference/ — test captures, not for store
  "site",        // GitHub Pages source, not part of extension
  "packages",    // npm monorepo packages (walletguard-core), separate from extension
  "assets"       // brand kit (banners), not part of extension runtime
];

// lib/ files that are inlined into content.js or popup-bundle.js by build.js.
// Listed explicitly so the 2 standalone modules (address-utils.js, storage-validators.js)
// still ship — they're loaded via <script src> and importScripts() respectively.
// Keep in sync with ORDER + POPUP_ORDER in build.js.
const BUNDLED_LIB_FILES = new Set([
  // content.js (ORDER in build.js)
  "lib/constants.js",
  "lib/decoder.js",
  "lib/typosquatting.js",
  "lib/multicall-decoder.js",
  "lib/universal-router.js",
  "lib/risk-engine.js",
  "lib/capabilities.js",
  "lib/simulator.js",
  "lib/mev-detector.js",
  "lib/revoke-generator.js",
  "lib/eip7702-detector.js",
  "lib/session-key-analyzer.js",
  "lib/threat-feed.js",
  "lib/wallet-dna.js",
  "lib/drainer-detector.js",
  "lib/visual-phish.js",
  "lib/hw-wallet.js",
  "lib/safe-multisig.js",
  "lib/explain.js",
  // popup-bundle.js (POPUP_ORDER additions)
  "lib/address-book.js",
  "lib/i18n.js",
  // Locales are inlined into popup-bundle.js
  "lib/locales/en.js",
  "lib/locales/ru.js",
  "lib/locales/es.js",
  "lib/locales/zh.js"
]);

const EXCLUDE_FILES = [
  // Dev tooling
  "build.js", "build-chrome-pack.js", "build-firefox.js", "build-firefox-pack.js",
  "test.js", "test.html",
  "generate-icons.ps1",
  "package-lock.json",
  // Dev documentation
  "CHECKPOINT.md", "PROJECT_STATE.md", "SELF_AUDIT.md",
  // Screenshots: dev reference
  "popup-mock.html",
  // Git metadata
  ".gitignore", ".gitattributes"
];

// Dynamically exclude all *.zip files in root to prevent stale version bundling.
function isExcludedFile(name) {
  if (EXCLUDE_FILES.includes(name)) return true;
  if (BUNDLED_LIB_FILES.has(name)) return true;
  // Any test-*.js file at root (regression suites live there)
  if (/^test-.*\.js$/.test(name)) return true;
  if (/\.zip$/i.test(name)) return true;
  return false;
}

function rimraf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDirFiltered(src, dst, relBase) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    // Match by relative path from ROOT (e.g. "screenshots/reference")
    // so subdirectory exclusions work correctly.
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (EXCLUDE_DIRS.includes(relPath) || EXCLUDE_DIRS.includes(entry.name)) continue;
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, dstPath, relPath);
    } else if (!isExcludedFile(relPath) && !isExcludedFile(entry.name)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function zipDirWindows(srcDir, zipPath) {
  // Use System.IO.Compression.ZipFile via PowerShell. Handles recursion
  // natively and produces a clean ZIP (no srcDir/ prefix).
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const ps = `
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory('${srcDir.replace(/\\/g, "\\\\")}', '${zipPath.replace(/\\/g, "\\\\")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)
  `.trim();
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    stdio: "inherit",
    shell: false,
  });
  return r.status === 0;
}

function zipDirUnix(srcDir, zipPath) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const r = spawnSync("zip", ["-r", "-9", zipPath, "."], {
    cwd: srcDir,
    stdio: "inherit",
    shell: false,
  });
  return r.status === 0;
}

console.log(`==> Packaging WalletGuard Pro v${VERSION} for Firefox AMO\n`);

// 1. Verify Firefox manifest exists.
if (!fs.existsSync(FIREFOX_MANIFEST)) {
  console.error("ERROR: manifest.firefox.json not found");
  process.exit(1);
}

// 2. Clean and recreate staging.
console.log(`Staging -> ${STAGING}`);
rimraf(STAGING);
copyDirFiltered(ROOT, STAGING, "");

// 3. In staging, rename manifest.firefox.json -> manifest.json.
const stagedFxManifest = path.join(STAGING, "manifest.firefox.json");
const stagedManifest  = path.join(STAGING, "manifest.json");
if (fs.existsSync(stagedFxManifest)) {
  fs.renameSync(stagedFxManifest, stagedManifest);
  console.log(`Renamed: manifest.firefox.json -> manifest.json (in staging)`);
} else {
  console.error("ERROR: manifest.firefox.json missing from staging");
  process.exit(1);
}

// 4. Sanity check on the staged manifest.
const staged = JSON.parse(fs.readFileSync(stagedManifest, "utf8"));
if (staged.manifest_version !== 3) {
  console.error("ERROR: staged manifest is not MV3");
  process.exit(1);
}
if (!staged.browser_specific_settings?.gecko?.id) {
  console.error("ERROR: staged manifest missing gecko.id");
  process.exit(1);
}
console.log(`OK: staged manifest is MV3, gecko.id = ${staged.browser_specific_settings.gecko.id}`);

// 5. Create ZIP.
console.log(`\nCreating ZIP -> ${ZIP_PATH}`);
const ok = os.platform() === "win32"
  ? zipDirWindows(STAGING, ZIP_PATH)
  : zipDirUnix(STAGING, ZIP_PATH);

if (!ok) {
  console.error("ERROR: zip failed");
  process.exit(1);
}

const sizeKb = (fs.statSync(ZIP_PATH).size / 1024).toFixed(1);
console.log(`\nDone: ${ZIP_PATH} (${sizeKb} KB)`);
console.log(`\nNext steps:`);
console.log(`  1. Go to https://addons.mozilla.org/developers/addon/submit/`);
console.log(`  2. Upload ${path.basename(ZIP_PATH)}`);
console.log(`  3. Source code: NO (no upload needed — AMO will fetch from GitHub)`);
console.log(`  4. Fill in the listing (similar fields to Chrome Web Store)`);
console.log(`  5. AMO review is human, ~1-7 days. Free, no fee.`);

// 6. Clean up staging.
console.log(`\nCleaning up staging...`);
rimraf(STAGING);
console.log("Done.");
