# Session Checkpoint — 2026-07-05

> Snapshot before closing the session. Read this in the next session
> to pick up exactly where we left off.

---

## TL;DR

8 коммитов поверх launch baseline `61aefbd` (Tier 1 = 4 коммита,
Tier 2 = 4 коммита). Working tree clean. **311 тестов passing**.
Build clean.

```bash
git log --oneline -10
87397c2 docs: Sprint Log entry for Tier 2
9c02586 feat(typosquat): expand TRUSTED_DOMAINS from 17 to 47 entries
59433a3 docs: SELF_AUDIT.md — internal security review of v1.5.x
a163a40 feat(revoke): auto-revoke calldata generator for risky approvals
6ad7750 docs: Sprint Log entry for Tier 1
73e11ae feat(site): comparison table on landing page
10b2df2 docs: THREAT_MODEL.md — security scope and trust assumptions
bd32b42 feat(chains): add BNB Chain, Avalanche, Fantom — 9 chains total
61aefbd docs: packaging + community files for launch   ← baseline
735883d docs: CWS submission assets
```

---

## Что сделано в этой сессии

### Tier 1 (4 коммита, +8 chains docs etc.) — `bd32b42`, `10b2df2`, `73e11ae`, `6ad7750`

1. **+3 chains** (BNB 56, Avalanche 43114, Fantom 250) → 9 chains total.
   - `approval-scanner.js`: `CHAIN_NAMES` + `MULTICHAIN_RPCS` + `CHAIN_LOOKBACK` updated
   - `manifest.json` + `manifest.firefox.json`: 3 new `host_permissions`
   - `settings.html`: 3 new `chain-chip` элементов
   - `settings.js`, `popup.html`, `package.json`, `background.js`: текстовые упоминания 6→9
   - `test-multichain.js`: 8 новых assertions (55 passed, было 47)
   - Docs: README, STORE_LISTING, popup-mock, site/index.html (включая
     баг в hero stats: `<div class="hero__stat-value">6</div>` → `9`)
   - Manifest descriptions: "across 6 chains" → "across 9 chains"

2. **THREAT_MODEL.md** (~220 строк, новый файл):
   - In scope / Out of scope / Trust assumptions / Known limitations /
     Adversary model / "What you should still do" (7-point checklist)
   - Cross-linked from README `## Security`, SECURITY.md, PROJECT_STATE.md
   - `STORE_LISTING.md` Privacy tab RPC list updated (3 new endpoints)

3. **Comparison table** на лендинге (`site/index.html` + `site/style.css`):
   - 11-строчная матрица vs Pocket Universe / Stelo / Fire
   - Accent-колонка для WG Pro, ✅/⚠️/❌ маркеры через inline SVG
   - Stelo / Fire помечены как shut down / discontinued
   - Nav link "Compare" добавлен (desktop + mobile)
   - Footer links расширены: Threat Model + Security

4. **Sprint Log entry** в README.

### Tier 2 (4 коммита) — `a163a40`, `59433a3`, `9c02586`, `87397c2`

1. **Auto-revoke calldata generator**:
   - `lib/revoke-generator.js` (~210 строк, new ES module):
     - `ERC20_APPROVE_SELECTOR = 0x095ea7b3`, `NFT_SET_APPROVAL_FOR_ALL_SELECTOR = 0xa22cb465`
     - `padAddress`, `buildERC20RevokeCalldata`, `buildNFT721RevokeCalldata`
     - `buildERC20RevokeTx`, `buildNFT721RevokeTx`, `buildRevokeTx` (auto-detect)
     - `buildRevokeBatch`, `groupPlansByChain`
   - `build.js` дополнен: генерирует **второй** bundle — `popup-bundle.js`
     (те же lib модули, exposed как `window.WG_POPUP_LIB.<moduleName>`,
     dash → camelCase: `revoke-generator.js` → `revokeGenerator`)
   - `test-revoke.js` (~270 строк, 76 тестов): byte-exact calldata match
     для USDC/Uniswap-V3 и BAYC/OpenSea, plan shape, batch, grouping
   - `popup.html`: подключает `<script src="popup-bundle.js">` перед
     popup.js; новый `#revoke-modal` (backdrop / panel / tx-data
     details / Close + Copy)
   - `popup.js`: Revoke button на risky approval cards (level ≥ medium),
     event delegation, modal show/hide, copy-to-clipboard с textarea
     fallback, Escape-key close, revoke.cash deep link
   - `popup.css`: revoke button (red-tinted) + modal panel styles
   - `package.json` `test` script: добавлен test-revoke.js

2. **SELF_AUDIT.md** (~310 строк, new):
   - TL;DR table (severity × status)
   - Scope (что было / не было в аудите)
   - Methodology (threat-model-first + calldata regression + fuzz +
     idempotency + zero deps + permission audit)
   - 18 findings с severity, ID, описание, fix, regression test reference
     - C1/C2 Critical: decodeAggregate3 hex/bytes × 2, setApprovalForAll
       bool offset −64 bytes
     - H1-H4 High: typosquat case bypass, address normalization,
       approve selector collision, Blockscout `/api/v2/.../approvals`
       unsupported (open, scheduled for v1.6.0)
     - M1-M6 Medium: eth_getLogs negative fromBlock, 0x-prefix regex,
       Alchemy shape, operator display, chunk size adaptivity (open),
       seed blacklist size (open)
     - L1-L9 Low: content.js deletion risk, magic numbers, legacy scan
       compat, Escape key, button overflow + 4 open
     - I1-I4 Info: scheduled for v1.6.0
   - Verification matrix (finding → test file → test name)
   - Residual risks (cross-ref THREAT_MODEL.md)
   - Recommendations for v1.6.0
   - Cross-linked из README `## Security` и SECURITY.md

3. **+30 trusted domains** (17 → 47):
   - `lib/constants.js` — TRUSTED_DOMAINS реорганизован в 8 категорий:
     - DeFi/liquid-staking/yield (10 new): lido.fi, rocketpool.net,
       makerdao.com, spark.fi, morpho.org, convex.fi, yearn.fi,
       beefy.com, frax.finance, pendle.finance
     - NFTs (5 new): blur.io, magiceden.io, foundation.app, zora.co,
       sudoswap.xyz
     - Bridges (5 new): stargate.finance, across.to, hop.exchange,
       layerzero.network, wormhole.com
     - Wallets (2 new): frame.xyz, rainbow.me
     - Explorers (2 new): polygonscan.com, arbiscan.io
     - Perps (3 new): gmx.io, dydx.exchange, hyperliquid.xyz
     - Identity/social (3 new): ens.domains, mirror.xyz, lens.xyz
   - `test-typosquat.js` — 51 новых тестов (52 → 103 total):
     trusted detection × 30, subdomain propagation × 5, case-insens × 3,
     distance-1 typosquats × 8, distance-1/2 × 2, substring attacks × 3
   - Docs: README line 48 "17 trusted protocols" → "47",
     THREAT_MODEL.md line 28, SELF_AUDIT.md line 335, CHANGELOG

4. **Sprint Log entry** в README для Tier 2.

---

## Состояние артефактов

### Файлы (новые в этой сессии)

- `THREAT_MODEL.md` — 222 строки
- `SELF_AUDIT.md` — 309 строк
- `lib/revoke-generator.js` — 209 строк
- `test-revoke.js` — 268 строк
- `popup-bundle.js` — 65225 bytes (build artifact, коммитится)

### Файлы (изменённые)

- `approval-scanner.js`, `manifest.json`, `manifest.firefox.json`
- `lib/constants.js` (TRUSTED_DOMAINS)
- `build.js` (теперь генерит 2 бандла)
- `test-multichain.js`, `test-typosquat.js`
- `popup.html`, `popup.js`, `popup.css`
- `settings.html`, `settings.js`, `background.js`, `content.js`
- `site/index.html`, `site/style.css`
- `README.md`, `CHANGELOG.md`, `STORE_LISTING.md`
- `SECURITY.md`, `PROJECT_STATE.md`, `package.json`
- `screenshots/popup-mock.html`

### Счётчики

- TRUSTED_DOMAINS: 17 → **47**
- CHAIN_INFO: 6 → **9** (Ethereum, Optimism, BNB Chain, Polygon,
  Fantom, Base, Arbitrum, Avalanche, Sepolia)
- Тестов: 176 → **311** (52+16+55+61+76 → 103+16+55+61+76)
- content.js: 81834 → **92721** bytes
- popup-bundle.js: new, **65225** bytes

### ZIPs в корне (gitignored, устарели)

- `walletguard-pro-v1.5.0.zip` — **НЕ содержит** Tier 1+2 changes
- `walletguard-pro-firefox-v1.5.0.zip` — **НЕ содержит** Tier 1+2 changes

Требуется пересборка перед submit.

---

## Что НЕ сделано (открыто для следующей сессии)

### Tier 3 (premium-feel, ещё не начат)

7. **Onboarding tour** — 4-шаговый overlay в popup при первом запуске
   (Welcome → Approval Scanner → Revoke → Done). State в
   `chrome.storage.local`.
8. **i18n** (ru, es, zh) — core translate function, locale detection,
   translations для всех UI strings (popup, settings, onboarding).
   ~250 строк core + ~60 strings × 3 языка.

### Launch prep (свободные деньги / действия)

- **Bump version → v1.5.1**: manifest.json, manifest.firefox.json,
  package.json, README badge, popup-mock badge, site/index.html
  badge. CHANGELOG `[Unreleased]` → `[1.5.1]`.
- **Push**: 8 локальных коммитов, `git push` запустит CI + Pages.
- **Repackage ZIPs**:
  - `walletguard-pro-v1.5.1.zip` (CWS)
  - `walletguard-pro-firefox-v1.5.1.zip` (AMO)
- **CWS submit**: $5 fee, dashboard → New Item → upload ZIP →
  copy text из STORE_LISTING.md → upload 5 screenshots + promo tile.
- **Firefox AMO submit**: free, https://addons.mozilla.org/developers/addon/submit/
- **Post-approval cleanup**: update README Chrome badge, site CTA,
  STORE_LISTING Privacy URL field.

---

## Решения, которые нужно помнить

1. **`manifest.firefox.json` хранится отдельно, НЕ перезаписывать
   `manifest.json`** — это сознательное решение для AMO review.
2. **`build.js` склеивает `lib/*` в IIFE** потому что Chrome content
   scripts не поддерживают `type: module`. После изменений в `lib/*`
   нужно `node build.js` и reload extension.
3. **`approval-scanner.js` НЕ бандлится** в content.js — загружается
   через `importScripts()` в background SW. Хранит локальный
   `KNOWN_SAFE_CONTRACTS` (дубликат `constants.js`).
4. **Approval Scanner через RPC-мост SW→content→MAIN→window.ethereum**
   — zero API keys, использует wallet's own RPC. Multi-chain через
   opt-in public RPCs.
5. **`build.js` теперь генерит 2 файла**: `content.js` (full bundle
   с orchestrator) + `popup-bundle.js` (lib modules as
   `window.WG_POPUP_LIB.<moduleName>`).
6. **`popup-bundle.js` exposed globals**: dash → camelCase.
   `WG_POPUP_LIB.revokeGenerator.buildRevokeTx(approval)`.
7. **Auto-revoke UX**: WalletGuard Pro НЕ подписывает транзакции —
   генерирует calldata + deep link на revoke.cash.
8. **TRUSTED_DOMAINS — curated, не exhaustive**: false positives
   erode trust. Add only well-known public-good protocols.

---

## Quick verification (smoke-test в начале следующей сессии)

```bash
cd "C:\Users\bruhz\OneDrive\Документы\Samples\WalletGuard Light"
git status --short      # должно быть пусто
git log --oneline -5    # должен показать 87397c2 наверху
npm run build           # должен выдать оба бандла без ошибок
npm test                # должен показать 311 passed, 0 failed
```

Ожидаемый output `npm test`:
```
52 passed, 0 failed   ← test-typosquat.js  (старый, до tier 2.3)
  ...
103 passed, 0 failed  ← test-typosquat.js  (после tier 2.3)
16 passed, 0 failed   ← test-integration.js
55 passed, 0 failed   ← test-multichain.js  (после tier 1.1)
61 passed, 0 failed   ← test-nft.js
76 passed, 0 failed   ← test-revoke.js  (tier 2.1)
```

Если что-то не совпадает — `git pull` (если push был сделан) или
сверить коммиты через `git log`.

---

## Следующие шаги — рекомендация

**Немедленно** (1 команда):
```bash
git push
```
Это прогонит CI (`.github/workflows/test.yml`) и обновит
GitHub Pages (`site/` → `eupho808.github.io/walletguard-pro/`).
CI badge в README станет live.

**Затем** — выбрать одно из:
- (Tier 3.1) Onboarding tour
- (Tier 3.2) i18n ru/es/zh
- (Launch) Bump version → v1.5.1 + repackage ZIPs + CWS submit
