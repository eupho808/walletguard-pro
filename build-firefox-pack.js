// build-firefox-pack.js - Package WalletGuard Pro for Firefox AMO submission.
//
// Run with:  node build-firefox-pack.js
//
// Produces:  walletguard-pro-firefox-v1.5.0.zip in the project root,
//            ready to upload at https://addons.mozilla.org/developers/addon/submit/
//
// What it does:
//   1. Creates a staging dir (dist-firefox/) by copying the project.
//   2. Excludes dev cruft (.git/, node_modules/, screenshots/reference/,
//      screenshots/popup-mock.html, .github/).
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
const STAGING = path.join(ROOT, "dist-firefox");
const ZIP_PATH = path.join(ROOT, `walletguard-pro-firefox-v1.5.0.zip`);
const FIREFOX_MANIFEST = path.join(ROOT, "manifest.firefox.json");

const EXCLUDE_DIRS  = [".git", "node_modules", ".github", "dist-firefox", "screenshots/reference"];
const EXCLUDE_FILES = ["screenshots/popup-mock.html", "walletguard-pro-v1.5.0.zip", "walletguard-pro-firefox-v1.5.0.zip"];

function rimraf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDirFiltered(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (EXCLUDE_DIRS.includes(entry.name)) continue;
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, dstPath);
    } else if (!EXCLUDE_FILES.includes(entry.name)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function zipDirWindows(srcDir, zipPath) {
  // PowerShell Compress-Archive works on Windows and produces standard ZIPs
  // that Firefox AMO accepts. Path separators in ZIP entries are OS-native
  // (backslash) but Firefox's validator handles both.
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const ps = `
    Compress-Archive -Path "${srcDir}\\*" -DestinationPath "${zipPath}" -CompressionLevel Optimal -Force
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

console.log("==> Packaging WalletGuard Pro for Firefox AMO\n");

// 1. Verify Firefox manifest exists.
if (!fs.existsSync(FIREFOX_MANIFEST)) {
  console.error("ERROR: manifest.firefox.json not found");
  process.exit(1);
}

// 2. Clean and recreate staging.
console.log(`Staging -> ${STAGING}`);
rimraf(STAGING);
copyDirFiltered(ROOT, STAGING);

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
