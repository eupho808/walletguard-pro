// test-build.js - Build artifact integrity checks.
// Catches bundler output bugs that unit tests miss
// (unit tests import lib/* directly, never the bundles).

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import vm from "vm";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const CONTENT = path.join(ROOT, "content.js");
const POPUP = path.join(ROOT, "popup-bundle.js");

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  ok  ${name}`);
  passed++;
}

function fail(name, msg) {
  console.log(`  FAIL ${name}: ${msg}`);
  failed++;
}

// ---- 1. Both bundles must pass `node --check` (syntactic validity) ----
for (const [label, file] of [["content.js", CONTENT], ["popup-bundle.js", POPUP]]) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    ok(`${label} passes node --check`);
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split("\n").find(l => l.includes("SyntaxError")) || "unknown" : "unknown";
    fail(`${label} passes node --check`, msg);
  }
}

// ---- 2. popup-bundle.js must expose WG_POPUP_LIB with all 9 modules ----
{
  const src = fs.readFileSync(POPUP, "utf8");
  const sandbox = { window: undefined, globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const lib = sandbox.globalThis.WG_POPUP_LIB;

  if (!lib) {
    fail("WG_POPUP_LIB exposed", "undefined — bundle has no global.WG_POPUP_LIB assignment");
  } else {
    const expected = [
      "constants", "decoder", "typosquatting", "multicallDecoder",
      "universalRouter", "riskEngine", "capabilities", "simulator", "revokeGenerator"
    ];
    const actual = Object.keys(lib).sort();
    const expSorted = [...expected].sort();

    if (JSON.stringify(actual) === JSON.stringify(expSorted)) {
      ok(`WG_POPUP_LIB has all 9 modules: ${actual.join(", ")}`);
    } else {
      fail("WG_POPUP_LIB modules",
        `expected [${expSorted.join(",")}] got [${actual.join(",")}]`);
    }

    for (const name of expected) {
      if (lib[name] && typeof lib[name] === "object") {
        ok(`WG_POPUP_LIB.${name} is an object`);
      } else {
        fail(`WG_POPUP_LIB.${name} is an object`, `got ${typeof lib[name]}`);
      }
    }

    if (typeof lib.revokeGenerator?.buildRevokeTx === "function") {
      ok("WG_POPUP_LIB.revokeGenerator.buildRevokeTx is a function");
    } else {
      fail("WG_POPUP_LIB.revokeGenerator.buildRevokeTx",
        `got ${typeof lib.revokeGenerator?.buildRevokeTx}`);
    }

    if (typeof lib.typosquatting?.findTyposquatting === "function") {
      ok("WG_POPUP_LIB.typosquatting.findTyposquatting is a function");
    } else {
      fail("WG_POPUP_LIB.typosquatting.findTyposquatting",
        `got ${typeof lib.typosquatting?.findTyposquatting}`);
    }

    if (Array.isArray(lib.constants?.TRUSTED_DOMAINS) && lib.constants.TRUSTED_DOMAINS.length >= 47) {
      ok(`TRUSTED_DOMAINS has ${lib.constants.TRUSTED_DOMAINS.length} entries (>= 47)`);
    } else {
      fail("TRUSTED_DOMAINS count",
        `expected >= 47, got ${lib.constants?.TRUSTED_DOMAINS?.length}`);
    }

    // Functional smoke: buildRevokeTx returns a valid plan shape.
    const tx = lib.revokeGenerator.buildRevokeTx({
      token: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      spender: "0x1111111254eeb25477b68fb85ed929f73a960582",
      tokenSymbol: "USDC",
      chainId: 1,
      chainName: "Ethereum",
      allowanceFmt: "unlimited"
    });
    if (tx && tx.kind === "ERC-20" && tx.data && tx.data.startsWith("0x095ea7b3")) {
      ok("revokeGenerator.buildRevokeTx produces valid ERC-20 plan");
    } else {
      fail("revokeGenerator.buildRevokeTx smoke", JSON.stringify(tx));
    }
  }
}

// ---- 3. content.js must NOT expose WG_POPUP_LIB (popup-only) ----
{
  const src = fs.readFileSync(CONTENT, "utf8");
  if (!src.includes("WG_POPUP_LIB")) {
    ok("content.js does not pollute window.WG_POPUP_LIB");
  } else {
    fail("content.js scope",
      "content.js should not define WG_POPUP_LIB (popup-only artifact)");
  }
}

// ---- 4. Both bundles must carry the BUNDLED BUILD marker ----
for (const [label, file, marker] of [
  ["content.js", CONTENT, "// content.js - BUNDLED BUILD"],
  ["popup-bundle.js", POPUP, "// popup-bundle.js - BUNDLED BUILD"]
]) {
  const src = fs.readFileSync(file, "utf8");
  if (src.startsWith(marker)) {
    ok(`${label} starts with BUNDLED BUILD marker`);
  } else {
    fail(`${label} marker`, `expected start with "${marker}"`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
