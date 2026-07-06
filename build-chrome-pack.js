// build-chrome-pack.js - Package WalletGuard Pro for Chrome Web Store submission.
//
// Run with:  node build-chrome-pack.js
//
// Produces:  walletguard-pro-v<VERSION>.zip in the project root,
//            ready to upload at https://chrome.google.com/webstore/devconsole/
//            (VERSION read from package.json)
//
// What it does:
//   1. Creates a staging dir (dist-chrome/) by copying the project.
//   2. Excludes dev cruft (.git/, node_modules/, screenshots/reference/,
//      screenshots/popup-mock.html, .github/, packages/, assets/, dist-*,
//      build artifacts, all *.zip files at any version).
//   3. Leaves manifest.json as-is (Chrome uses manifest.json at root).
//   4. Creates a ZIP archive from the staged contents.
//   5. Cleans up staging.
//
// Companion to build-firefox-pack.js (which renames manifest.firefox.json
// → manifest.json in staging; Chrome doesn't need that rename).

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

const STAGING = path.join(ROOT, "dist-chrome");
const ZIP_PATH = path.join(ROOT, `walletguard-pro-v${VERSION}.zip`);

const EXCLUDE_DIRS = [
  ".git", "node_modules", ".github",
  "dist-chrome", "dist-firefox",
  "reference",         // screenshots/reference/ — test captures, not for store
  "lib",               // bundled into content.js + popup-bundle.js
  "site",              // GitHub Pages source, not part of extension
  "packages",          // npm monorepo packages (walletguard-core), separate from extension
  "assets"             // brand kit (banners), not part of extension runtime
];

const EXCLUDE_FILES = [
  // Dev tooling
  "build.js", "build-chrome-pack.js", "build-firefox.js", "build-firefox-pack.js",
  "test.js", "test.html",
  "test-typosquat.js", "test-integration.js", "test-multichain.js",
  "test-nft.js", "test-revoke.js", "test-build.js", "test-i18n.js", "test-onboarding.js",
  "generate-icons.ps1",
  "package-lock.json",
  // Dev documentation
  "CHECKPOINT.md", "PROJECT_STATE.md", "SELF_AUDIT.md",
  // Screenshots: dev reference
  "popup-mock.html",
  // Git metadata
  ".gitignore", ".gitattributes",
  // All ZIPs at any version (handled dynamically below too)
  "walletguard-pro.zip", "walletguard-pro-firefox.zip"
];

// Dynamically exclude all *.zip files in root to prevent stale version bundling.
function isExcludedFile(name) {
  if (EXCLUDE_FILES.includes(name)) return true;
  // Any ZIP file in root (e.g. walletguard-pro-v1.5.0.zip, walletguard-pro-v1.5.2.zip, ...)
  if (/^walletguard-pro.*\.zip$/i.test(name)) return true;
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
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const ps = `
    Compress-Archive -Path "${srcDir}\\*" -DestinationPath "${zipPath}" -CompressionLevel Optimal -Force
  `.trim();
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    stdio: "inherit", shell: false,
  });
  return r.status === 0;
}

function zipDirUnix(srcDir, zipPath) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const r = spawnSync("zip", ["-r", "-9", zipPath, "."], {
    cwd: srcDir, stdio: "inherit", shell: false,
  });
  return r.status === 0;
}

console.log(`==> Packaging WalletGuard Pro v${VERSION} for Chrome Web Store\n`);

// 1. Clean and recreate staging.
console.log(`Staging -> ${STAGING}`);
rimraf(STAGING);
copyDirFiltered(ROOT, STAGING, "");

// 2. Sanity check on the staged manifest.
const stagedManifest = path.join(STAGING, "manifest.json");
const staged = JSON.parse(fs.readFileSync(stagedManifest, "utf8"));
if (staged.manifest_version !== 3) {
  console.error("ERROR: staged manifest is not MV3");
  process.exit(1);
}
if (!staged.name || !staged.version) {
  console.error("ERROR: staged manifest missing name/version");
  process.exit(1);
}
if (!staged.default_locale && fs.existsSync(path.join(STAGING, "_locales"))) {
  console.error("ERROR: _locales/ exists but default_locale missing in manifest");
  process.exit(1);
}
console.log(`OK: staged manifest is MV3, name=${staged.name}, version=${staged.version}, default_locale=${staged.default_locale || "(none)"}`);

// 3. Create ZIP.
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
console.log(`  1. Go to https://chrome.google.com/webstore/devconsole/`);
console.log(`  2. Pay the $5 developer fee (one-time, if not already paid)`);
console.log(`  3. Click "New Item" → upload ${path.basename(ZIP_PATH)}`);
console.log(`  4. Copy text from STORE_LISTING.md into the listing form`);
console.log(`  5. Upload 5 screenshots + 1 promo tile (440x280)`);
console.log(`  6. Set Privacy tab: single purpose, host permissions, data usage`);
console.log(`  7. Submit for review (1-3 business days for first submission)`);

// 4. Clean up staging.
console.log(`\nCleaning up staging...`);
rimraf(STAGING);
console.log("Done.");
