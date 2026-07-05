# Contributing to WalletGuard Pro

Thanks for wanting to help. The project follows a simple rule:

> **The test suite is the source of truth.**

If you change behaviour in `lib/`, add or update a test in the matching `test-*.js`. PRs without passing tests won't be merged.

---

## Quick start

```bash
git clone https://github.com/eupho808/walletguard-pro.git
cd walletguard-pro
npm test                # runs all 176 tests across 4 suites
node build.js           # regenerates content.js from lib/*
```

Then load the folder as an unpacked extension in Chrome (`chrome://extensions/` → Developer mode → Load unpacked).

---

## Repository layout

```
manifest.json           Chrome WebExtension manifest (MV3)
manifest.firefox.json   Firefox variant — kept separately to avoid clobbering
background.js           Service worker: state, approval scan orchestration, message routing
injector.js             MAIN world: Proxy on window.ethereum.request + RPC bridge
content.js              BUNDLED — orchestrator + RPC bridge (do not edit directly; edit lib/)
approval-scanner.js     Plain script loaded via importScripts() in the service worker
popup.html/.js/.css     Dashboard with Approval Scanner
settings.html/.js       OpenRouter API key (optional), whitelist, blacklist, multi-chain toggle
test.html/.js           Test console — click buttons to trigger every interception path
build.js                Concatenates lib/* into content.js (Chrome can't use ES modules in CS)
build-firefox.js        Validates manifest.firefox.json + prints dev-mode command
build-firefox-pack.js   Packages ZIP for AMO submission
lib/                    Source modules — bundled into content.js by build.js
  constants.js          TRUSTED_DOMAINS, KNOWN_SAFE_CONTRACTS, KNOWN_NFT_COLLECTIONS
  decoder.js            Method signature dictionary + calldata parsers
  typosquatting.js      Levenshtein + eTLD+1 + homoglyph detection
  multicall-decoder.js  Multicall V1/V2/V3 extraction
  universal-router.js   Universal Router command decoder
  risk-engine.js        Weighted risk scoring + factor explanations
  capabilities.js       Human-readable capability descriptions
  simulator.js          Asset Diff Engine (estimated balance changes)
test-*.js               Node-only smoke tests (176 total across 4 files)
```

---

## How the bundle works

Chrome content scripts cannot use `import`/`export` (no `type: module`). So `build.js`:

1. Reads each file in `lib/` in order (`constants.js` first, `simulator.js` last)
2. Strips top-level `import`/`export` syntax
3. Wraps each module body in an IIFE that exposes the exported symbols
4. Concatenates the IIFEs and prepends them to `content.js`'s orchestrator

When you change any file in `lib/`, you **must** run `node build.js` and reload the extension in `chrome://extensions/` for changes to take effect. CI runs `build.js` automatically to verify the bundle compiles.

---

## Development workflow

1. Create a feature branch: `git checkout -b feature/my-change`
2. Edit `lib/*` (source of truth) — never edit `content.js` directly; it gets clobbered
3. Add or update tests in `test-*.js`
4. Run `npm test` — all must pass
5. Run `node build.js` — verify the bundle regenerates without errors
6. Manually test in Chrome:
   - Load unpacked → click buttons in `test.html` → verify overlays look right
   - For approval scanner: needs a connected wallet to populate data
7. Commit: `git add lib/ content.js test-*.js && git commit -m "feat: <description>"`
8. Push and open a PR

---

## Coding conventions

- **No runtime dependencies.** The extension and tests run with zero `npm install`. If you need a new module, vendor it.
- **Plain ESM in `lib/`.** Chrome will strip imports during bundling, so write ESM-style code.
- **Plain Node ESM in `test-*.js`.** Use `import { foo } from "./lib/foo.js"` — no test framework, just plain `eq()` helpers and exit codes.
- **Functions return, don't mutate.** Risk engine, decoder, etc. take context objects and return structured results.
- **Risk weights in `lib/risk-engine.js`.** Each factor has a weight (`+30` unlimited approval, `-20` verified contract). When adding a new factor, justify the weight in the factor's `reason` field.
- **Compound rules are explicit.** If two factors together are worse than their sum, document the combo in `risk-engine.js`.

---

## Adding a new interception

1. Add the method signature (4-byte selector + decoded name) to `lib/decoder.js`
2. Add a parser that takes raw calldata and returns `{ method, params, summary }`
3. Add the parser call to `lib/risk-engine.js`'s context builder
4. Add risk factors (weights + reasons) for the new method
5. Add tests in `test-integration.js` (mock the context, assert factors appear)
6. Add a button to `test.html` to manually trigger the new path
7. Run `node build.js` and verify the bundle

---

## Adding a new chain

Edit `lib/constants.js`:
- Add chain ID + RPC URL to `MULTICHAIN_RPCS`
- Add chain ID + display name to `CHAIN_INFO`
- Add chain ID + block lookback cap to `CHAIN_LOOKBACK`

Then add the host_permission in both `manifest.json` and `manifest.firefox.json`.

Tests: extend `test-multichain.js` with the new chain (chain coverage section).

---

## Adding a known drainer

Edit `lib/constants.js`:
- Add to `KNOWN_SAFE_CONTRACTS` only if verified safe (not drainer)
- Add to a new blacklist array or extend existing seed list in `lib/constants.js`
- Update the phishing detection in `content.js`

---

## Adding a new typosquat target

Edit `lib/constants.js`:
- Add the registrable domain (e.g. `uniswap.org`) to `TRUSTED_DOMAINS`
- The Levenshtein + eTLD+1 + homoglyph checks will automatically cover it

Tests: extend `test-typosquat.js` with the trusted domain + a typosquat case.

---

## Reporting security issues

**Do not open a public GitHub issue for security vulnerabilities.** See [SECURITY.md](./SECURITY.md) for the responsible disclosure policy.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
