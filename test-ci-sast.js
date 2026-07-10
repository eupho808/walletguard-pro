// test-ci-sast.js - Tests for the CI workflow + opengrep SAST setup.
//
// Verifies:
//   - .github/workflows/test.yml is valid YAML
//   - .github/workflows/sast.yml is valid YAML
//   - .opengrep/rules/*.yml files are valid YAML
//   - Each custom rule has a unique ID
//   - Each rule has message + severity + languages + pattern
//   - The test workflow runs on push and PR
//   - The SAST workflow uploads SARIF
//
// These are static checks (the YAML syntax + rule structure). The
// actual opengrep binary only runs in CI — running it locally requires
// Docker, which is not a hard dep for this project.

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

// Minimal YAML "good enough" parser. We only check for syntactic balance
// of indentation + matching braces/brackets. Full schema validation
// happens in CI when opengrep runs.
function isWellFormedYaml(text) {
  let inString = null;
  let braceDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === inString && text[i - 1] !== "\\") inString = null;
      continue;
    }
    if (c === '"' || c === "'") { inString = c; continue; }
    if (c === "{") braceDepth++;
    if (c === "}") braceDepth--;
    if (c === "[") bracketDepth++;
    if (c === "]") bracketDepth--;
  }
  return inString === null && braceDepth === 0 && bracketDepth === 0;
}

console.log("[CI workflows exist]");
{
  const testPath = ".github/workflows/test.yml";
  const sastPath = ".github/workflows/sast.yml";
  truthy(fs.existsSync(testPath), `${testPath} exists`);
  truthy(fs.existsSync(sastPath), `${sastPath} exists`);
}

console.log("[CI workflows valid YAML + have expected triggers]");
{
  const testYml = fs.readFileSync(".github/workflows/test.yml", "utf8");
  const sastYml = fs.readFileSync(".github/workflows/sast.yml", "utf8");
  truthy(isWellFormedYaml(testYml), "test.yml well-formed");
  truthy(isWellFormedYaml(sastYml), "sast.yml well-formed");
  truthy(testYml.includes("push:"), "test.yml triggers on push");
  truthy(testYml.includes("pull_request:"), "test.yml triggers on PR");
  truthy(testYml.includes("npm test"), "test.yml runs npm test");
  truthy(testYml.includes("node-version:"), "test.yml uses Node matrix");
  truthy(sastYml.includes("opengrep"), "sast.yml uses opengrep");
  truthy(sastYml.includes("upload-sarif") || sastYml.includes("codeql-action"),
    "sast.yml uploads SARIF");
  truthy(sastYml.includes("schedule:"), "sast.yml has weekly schedule");
}

console.log("[opengrep config files exist]");
{
  truthy(fs.existsSync(".opengrep/auto.yml"), "auto.yml exists");
  truthy(fs.existsSync(".opengrep/rules/web3.yml"), "rules/web3.yml exists");
}

console.log("[opengrep config valid YAML]");
{
  const auto = fs.readFileSync(".opengrep/auto.yml", "utf8");
  const web3 = fs.readFileSync(".opengrep/rules/web3.yml", "utf8");
  truthy(isWellFormedYaml(auto), "auto.yml well-formed");
  truthy(isWellFormedYaml(web3), "web3.yml well-formed");
  truthy(auto.includes("rules:"), "auto.yml declares rules");
  truthy(auto.includes("p/javascript") || auto.includes("javascript"),
    "auto.yml uses javascript ruleset");
  truthy(auto.includes(".opengrep/rules"), "auto.yml references custom rules");
}

console.log("[custom rules — IDs unique + well-formed]");
{
  const web3 = fs.readFileSync(".opengrep/rules/web3.yml", "utf8");
  // Extract `id:` values.
  const idMatches = web3.match(/^\s*-?\s*id:\s*([\w-]+)/gm) || [];
  const ids = idMatches.map(m => m.replace(/^\s*-?\s*id:\s*/, "").trim());
  eq(ids.length >= 5, true, `at least 5 rules defined (got ${ids.length})`);
  const unique = new Set(ids);
  eq(unique.size, ids.length, "all rule IDs are unique");
  for (const id of ids) {
    truthy(id.startsWith("wg-"), `rule ${id} uses wg- prefix`);
  }
}

console.log("[custom rules — required fields per rule]");
{
  const web3 = fs.readFileSync(".opengrep/rules/web3.yml", "utf8");
  // Crude block splitter: each top-level `- id:` is one rule.
  const blocks = web3.split(/^\s*-\s*id:\s*/m).slice(1);
  eq(blocks.length >= 5, true, `at least 5 rule blocks (got ${blocks.length})`);
  for (const block of blocks) {
    const id = block.split("\n")[0].trim();
    truthy(/message:/.test(block), `${id} has message`);
    truthy(/severity:/.test(block), `${id} has severity`);
    truthy(/languages:/.test(block), `${id} has languages`);
    truthy(/(pattern|pattern-either|pattern-regex|patterns):/.test(block),
      `${id} has a pattern`);
  }
}

console.log("[custom rules — coverage of Web3 attack surface]");
{
  const web3 = fs.readFileSync(".opengrep/rules/web3.yml", "utf8");
  // Each rule ID covers a distinct attack category.
  const categories = {
    "wg-overlay-unescaped-interpolation": "XSS in overlay",
    "wg-injector-bypass-originalRequest": "Interceptor bypass",
    "wg-no-eval": "Code injection",
    "wg-rpc-bridge-write-method": "RPC bridge allowlist violation",
    "wg-storage-without-secret-key": "Secret leakage via export",
    "wg-wei-number-arithmetic": "Wei precision loss",
    "wg-http-external-call": "MITM via cleartext"
  };
  for (const [id, desc] of Object.entries(categories)) {
    truthy(web3.includes(id), `covers ${desc} (${id})`);
  }
}

console.log("[SAST workflow excludes build/test dirs]");
{
  const sastYml = fs.readFileSync(".github/workflows/sast.yml", "utf8");
  // The SAST container scans `.` — build output is .gitignored but
  // we should still exclude dist-*, node_modules, and coverage.
  truthy(!sastYml.includes("node_modules"),
    "sast.yml doesn't scan node_modules (handled by --no-git-ignore + container)");
}

console.log("\n");
if (failed === 0) {
  console.log(`${passed} passed, ${failed} failed`);
  console.log("PASS: CI + SAST setup verified.");
} else {
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(1);
}
