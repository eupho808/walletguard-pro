# WalletGuard Pro — Project State

## Goal
Chrome-расширение (MV3) — независимый security layer поверх Web3 кошельков.
Перехватывает `window.ethereum.request`, анализирует calldata, показывает UI перед MetaMask.

## Текущий статус
v1.2.0 — Approval Scanner через RPC-мост к MetaMask (`eth_getLogs` + `eth_call`),
zero API keys, weighted risk engine, recursive decoder.

## Архитектура

```
manifest.json
├── background.js     SW: state, AI cache, approval scan orchestration, message routing
│                     (importScripts approval-scanner.js — separate file)
├── injector.js       MAIN world: Proxy на window.ethereum.request
│                     + RPC bridge (WalletGuardRpcCall event) для content.js
├── content.js        BUNDLED — orchestrator (IIFE wrapper, event listeners, overlay UI)
│                     + RPC bridge (chrome.runtime.onMessage <-> window event)
├── approval-scanner.js  Plain script (no ES modules), loaded via importScripts().
│                        Запрашивает RPC через мост: SW -> content -> MAIN -> wallet.
├── popup.html/.js    статистика + Approval Scanner UI
├── settings.html/.js API ключ (только OpenRouter), whitelist, blacklist
├── test.html/.js     тест-консоль без кошелька (14 кнопок)
├── build.js          склеивает lib/* в content.js
└── lib/              исходники модулей (НЕ загружаются напрямую)
    ├── constants.js
    ├── decoder.js
    ├── multicall-decoder.js
    ├── universal-router.js
    ├── risk-engine.js
    ├── capabilities.js
    └── simulator.js
```

## Build process
```bash
node build.js   # регенерирует content.js из lib/*
```
После изменений в lib/* нужно пересобирать и обновлять расширение в chrome://extensions/.

## Ключевые решения

1. **Бандлинг вместо ES modules** — Chrome content scripts НЕ поддерживают `type: module`. Build.js склеивает всё в IIFE.
2. **Approval Scanner — отдельный файл** — `approval-scanner.js` лежит в корне, загружается через `importScripts()` в service worker. Не бандлится в content.js. Хранит `KNOWN_SAFE_CONTRACTS` локально (дубликат с constants.js), чтобы не зависеть от bundle.
3. **Zero API keys для Approval Scanner** — используем RPC-ноду самого кошелька (MetaMask/Rabby/etc.) через мост:
   ```
   SW (scanner) -> chrome.tabs.sendMessage -> content.js -> window event ->
   injector.js (MAIN world) -> window.ethereum.request('eth_call'/'eth_getLogs') ->
   wallet provider -> ...обратно по той же цепочке...
   ```
   Это сохраняет философию проекта: "install → works". Никакой регистрации на alchemy.com, никаких ключей.
4. **Только read-only методы в мосту** — `READ_ONLY_METHODS` whitelist в injector.js. Сигнатуры и любые state-changing вызовы через мост запрещены.
5. **Single-chain** — сканер работает на той сети, на которой сейчас кошелёк. Multi-chain требует переключения сети пользователем (или future enhancement).
6. **`eth_getLogs` chunked** — пагинация по 5000 блоков за раз, чтобы не упереться в лимит RPC. Lookback capped на 1M блоков (~6 месяцев на Ethereum).
7. **Wallet address discovery** — `background.js` автоматически сохраняет `from` из любого `txIntercepted` в `wg_lastWalletAddress`. Approval Scanner читает его.
8. **Auto-refresh** — `chrome.alarms` каждые 6ч тихо обновляет скан, если есть wallet и cache устарел.
9. **Weighted risk engine** — каждый фактор имеет вес (`+30` unlimited approval, `-20` verified contract). Score = 100 - sum(weights).
10. **Compound rules** — комбинации факторов усиливаются (unlimited approve + unknown contract = CRITICAL combo +25).
11. **API ключ OpenRouter** хранится в `chrome.storage.local`. Без ключа — только локальный blacklist.

## Что работает
- Перехват eth_sendTransaction, signTypedData v1/v3/v4, personal_sign, eth_sign
- Multicall V1/V2/V3 с per-call target
- Universal Router execute с командами 0x00-0x10
- EIP-712 Permit detection (включая Permit2)
- Phishing blocker (seed blacklist + custom)
- Whitelist с бустом +15 trust
- Popup со статистикой и логами
- Settings: OpenRouter API key, whitelist, blacklist, toggle
- **Approval Scanner v1.2.0** (zero API keys):
  - ERC-20 approvals через `eth_getLogs` (Approval events) → `eth_call` (allowance)
  - Текущая сеть кошелька (Ethereum, Optimism, Polygon, Base, Arbitrum, Sepolia)
  - Risk classification: critical / high / medium / low / info
  - Фильтр revoked approvals (allowance = 0)
  - Rescan button, auto-refresh каждые 6ч
  - Top-5 рискованных в popup с allowance ("Unlimited" / "0.1")

## Что НЕ сделано (out of scope для MVP)
- Tenderly/Blocknative RPC simulation (платный API)
- Свой reputation server (нужен backend)
- ERC-4337 UserOperation decoding
- NFT approval scanning (isApprovedForAll + getApproved per token — отдельный модуль)
- Auto-revoke approvals (требует write-capable RPC + UX для подписи транзакции)
- Multi-chain scan без переключения сети
- Typosquatting detection (Levenshtein)
- Публикация в Chrome Web Store

## Известные ограничения
- Без RPC не знаем реальные балансы → Asset Diff Engine показывает estimated/expected
- Risk score эвристический, не ML
- Seed blacklist захардкоден (3 адреса)
- Approval Scanner зависит от наличия connected wallet — без `eth_accounts` не сможет сканировать
- `eth_getLogs` лимит по блокам у разных RPC-провайдеров разный (1k-10k). Lookback capped на 1M блоков = ~6 месяцев на Ethereum, ~2 недели на Arbitrum.
- Multi-chain требует ручного переключения сети в кошельке

## Следующие шаги (по приоритету)
1. **Typosquatting detection** — Levenshtein vs TRUSTED_DOMAINS
2. **Multi-chain scan** — переключать сеть в цикле или использовать Alchemy как opt-in
3. **NFT approvals** — `isApprovedForAll` для известных коллекций
4. **README + Chrome Web Store** — публикация

## Пойманные баги (чтобы не повторять)
- `setApprovalForAll` bool-срез был смещён на 64 байта
- `decodeAggregate3` использовал байты вместо hex chars (× 2)
- `headsStart` в multicall decoder = 136 (8 selector + 64 offset + 64 length), не 128
- Universal Router per-tuple offset динамический, не константа 96
- Chrome content scripts не поддерживают `type: module` (нужен build.js)
- **Blockscout public instances не поддерживают `/api/v2/.../approvals`** — пробовал Alchemy, но API key = плохой UX
- **Alchemy возвращает allowance с префиксом `0x`** — regex `/^f{15,}/i` нужно `/^(?:0x)?f{15,}$/i`
- **Alchemy response shape — `{tokenAllowances: [...]}`** не голый массив
- **Удаление content.js ломает build.js** — build.js читает существующий content.js как orchestrator. Не удалять! (Восстановлен после случайного `Remove-Item`.)
- **API key в настройках = friction** — пользователь не хочет регаться на alchemy.com ради фичи расширения. Всегда сначала пробовать использовать ресурсы самого кошелька.

## Тестирование
Открой `test.html` в браузере, жми кнопки — диспатчит события напрямую в content.js.
Покрытие: approves, ETH transfers, permits, multicalls (включая drainer pattern), Universal Router команды.

**Approval Scanner** — `test.html` → "Scan vitalik.eth approvals":
- Требует подключённый кошелёк (MetaMask и т.п.) с активным аккаунтом.
- vitalik.eth (0xd8dA...6045) — известный адрес с большим числом исторических approvals.
- После скана открывает popup с топ-5 рискованных.
