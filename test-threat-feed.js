// test-threat-feed.js - Tests for lib/threat-feed.js (async-friendly)

import {
  sha256HexAsync,
  canonicalize,
  verifyManifestSignaturesAsync,
  validateManifest,
  buildIndex,
  lookup
} from "./lib/threat-feed.js";

import crypto from "node:crypto";

let passed = 0;
let failed = 0;

function ok(name) { console.log(`  ok  ${name}`); passed++; }
function eq(actual, expected, name) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name);
  else { console.log(`  FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}
function truthy(v, name) { if (v) ok(name); else { console.log(`  FAIL ${name}: expected truthy got ${v}`); failed++; } }
function falsy(v, name)  { if (!v) ok(name); else { console.log(`  FAIL ${name}: expected falsy got ${v}`); failed++; } }

// ---- canonicalize (sync) ----
const m = { b: 2, a: 1, c: { z: 26, y: 25 } };
const c = canonicalize(m);
eq(c, '{"a":1,"b":2,"c":{"y":25,"z":26}}', "canonical sorts keys");
const withSig = { threats: [], signatures: { foo: "bar" } };
const c2 = canonicalize(withSig);
falsy(c2.includes("signatures"), "canonical strips signatures");
falsy(c2.includes("foo"), "canonical does not include stripped-field values");

// ---- validateManifest ----
const goodManifest = {
  version: 1,
  feedVersion: "wg-test-1",
  generatedAt: new Date().toISOString(),
  maintainer: "ed25519:test",
  threats: [{
    id: "t-001",
    type: "domain",
    value: "evil.example",
    severity: "high",
    category: "phisher",
    name: "Test phishing domain",
    firstSeen: "2026-01-01T00:00:00Z"
  }],
  signatures: { "ed25519:test": "sigvalue" }
};

eq(validateManifest(goodManifest).ok, true, "good manifest validates");
eq(validateManifest(null).ok, false, "null manifest rejected");
eq(validateManifest({ ...goodManifest, version: 2 }).ok, false, "wrong version rejected");
eq(validateManifest({ ...goodManifest, signatures: {} }).ok, false, "empty signatures rejected");
eq(validateManifest({
  ...goodManifest,
  threats: [{ ...goodManifest.threats[0], type: "made-up-type" }]
}).ok, false, "invalid threat type rejected");
eq(validateManifest({
  ...goodManifest,
  threats: [goodManifest.threats[0], goodManifest.threats[0]]
}).ok, false, "duplicate threat id rejected");

// ---- buildIndex ----
const multiManifest = {
  ...goodManifest,
  threats: [
    { id: "t-1", type: "domain", value: "phisher.example", severity: "high", category: "phisher", name: "P1", firstSeen: "2026-01-01T00:00:00Z" },
    { id: "t-2", type: "domain", value: "drainer.example", severity: "critical", category: "drainer", name: "D1", firstSeen: "2026-01-02T00:00:00Z" },
    { id: "t-3", type: "address", value: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef", severity: "high", category: "drainer", name: "Drainer A", firstSeen: "2026-01-03T00:00:00Z" },
    { id: "t-4", type: "selector", value: "0xfb6a74f5", severity: "high", category: "honeypot", name: "Honey function", firstSeen: "2026-01-04T00:00:00Z" },
    { id: "t-5", type: "delegate", value: "0x1234567890123456789012345678901234567890", severity: "critical", category: "delegation", name: "Bad delegate", firstSeen: "2026-01-05T00:00:00Z" },
    { id: "t-6", type: "pattern", value: "0xfb6a74f5[0-9a-f]{64}$", severity: "medium", category: "honeypot-pattern", name: "Honey pattern", firstSeen: "2026-01-06T00:00:00Z" }
  ]
};

const idx = buildIndex(multiManifest);
eq(idx.byDomain.size, 2, "2 domain entries indexed");
eq(idx.byAddress.size, 1, "1 address entry indexed");
eq(idx.bySelector.size, 1, "1 selector entry indexed");
eq(idx.byDelegate.size, 1, "1 delegate entry indexed");
eq(idx.patterns.length, 1, "1 pattern entry compiled");
eq(idx.all.length, 6, "all threats listed");

const lp1 = lookup(idx, { domain: "phisher.example" });
truthy(lp1 && lp1.id === "t-1", "domain lookup finds t-1");
const lp2 = lookup(idx, { domain: "PHISHER.example" });
truthy(lp2 && lp2.id === "t-1", "domain lookup is case-insensitive");
const lp3 = lookup(idx, { address: "0xDEADBEEFdeadbeefdeadbeefdeadbeefdeadbeef" });
truthy(lp3 && lp3.id === "t-3", "address lookup is case-insensitive");
const lp4 = lookup(idx, { selector: "0xfb6a74f5" });
truthy(lp4 && lp4.id === "t-4", "selector lookup finds t-4");
const lp5 = lookup(idx, { delegate: "0x1234567890123456789012345678901234567890" });
truthy(lp5 && lp5.id === "t-5", "delegate lookup finds t-5");
const lp6 = lookup(idx, { calldata: "0xfb6a74f5" + "ab".repeat(32) });
truthy(lp6 && lp6.id === "t-6", "pattern lookup finds t-6");
eq(lookup(idx, { domain: "legit.example" }), null, "unknown domain returns null");
eq(lookup(null, { domain: "x" }), null, "null index returns null");

// ---- sha256HexAsync ----
sha256HexAsync("hello").then((hash) => {
  eq(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", "sha256HexAsync('hello') matches known digest");
  return sha256HexAsync("");
}).then((emptyHash) => {
  eq(emptyHash.length, 64, "sha256HexAsync('') returns 64 hex chars");

  // ---- verifyManifestSignaturesAsync (Web Crypto) ----
  // Generate an Ed25519 keypair using Node's crypto, then export as raw 32 bytes.
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  // SPKI wraps raw 32-byte key in 12-byte prefix; we need raw for Web Crypto.
  // Extract raw by stripping the 12-byte SPKI prefix (works for Ed25519 SPKI).
  const rawPub = Buffer.from(pubDer).slice(12);
  const pubB64 = rawPub.toString("base64");
  const seed = privateKey.export({ type: "pkcs8", format: "der" }).slice(-32);
  const privCryptoKey = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });

  const manifestToSign = { ...goodManifest, signatures: {} };
  const canonical = canonicalize(manifestToSign);
  const sigBuf = crypto.sign(null, Buffer.from(canonical, "utf8"), privCryptoKey);
  const sigB64 = sigBuf.toString("base64");

  const signedManifest = {
    ...manifestToSign,
    signatures: { ["ed25519:test-pub"]: sigB64 }
  };

  const trustKeys = { ["ed25519:test-pub"]: pubB64 };
  return verifyManifestSignaturesAsync(signedManifest, trustKeys).then((vs) => {
    eq(vs.ok, true, "valid Ed25519 signature accepted");
    truthy(vs.signedBy && vs.signedBy.length === 1, "signedBy lists 1 key");

    // Tampered manifest rejected
    return verifyManifestSignaturesAsync({ ...signedManifest, generatedAt: "tampered" }, trustKeys);
  }).then((vs2) => {
    eq(vs2.ok, false, "tampered manifest rejected");

    return verifyManifestSignaturesAsync(signedManifest, {});
  }).then((vs3) => {
    eq(vs3.ok, false, "no trust keys rejected");

    return verifyManifestSignaturesAsync({ ...signedManifest, signatures: { ["ed25519:test-pub"]: "AAAA" } }, trustKeys);
  }).then((vs4) => {
    eq(vs4.ok, false, "garbage signature rejected");

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
}).catch((err) => {
  console.log(`  FAIL async chain threw: ${err.message}`);
  console.log(err.stack);
  failed++;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
});

