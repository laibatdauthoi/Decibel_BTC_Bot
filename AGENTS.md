# Repository instructions

## Project

`Decibel_BTC_Bot` is an automated BTC/USD trading bot for Decibel.

The production bot is deterministic and must not call an AI model while
making trading decisions.

## Naming conventions

- Proper names capitalize the first letter of each word.
- Acronyms preserve uppercase letters, such as `BTC`, `USD`, `API` and `PnL`.
- Class names use common nouns or adjectives in lowercase snake_case.
  - Examples: `market_data_client`, `risk_engine`, `order_executor`
- Instance names use proper or specific names in PascalCase.
  - Examples: `DecibelClient`, `BTCRiskEngine`, `MainnetExecutor`
- Function names begin with a lowercase verb and use camelCase.
  - Examples: `getBTCPrice`, `calculatePositionSize`, `validateOrder`
- Do not replace these rules with conventional TypeScript class naming.
- File and directory names use lowercase snake_case unless an external tool
  requires another format.

## Trading safety

- Live trading must be disabled by default.
- Never commit, print or log credentials and private keys.
- Never put a real credential in tests, fixtures or documentation.
- Every order must pass through the risk engine.
- Every new position must have a stop-loss.
- Position-closing orders must use reduce-only where supported.
- Never retry order submission unless duplicate execution is impossible.
- Never open a position using stale or incomplete market/account data.
- Reconcile balance, orders and positions after startup and reconnect.
- Stop trading after the configured daily loss limit is reached.
- Mainnet order submission requires both:
  - `TRADING_MODE=mainnet`
  - `LIVE_TRADING_ENABLED=true`
- Do not increase risk limits or leverage without explicit user approval.

## Engineering requirements

- Use strict TypeScript.
- Validate environment variables and external API data.
- Keep market data, strategy, risk and execution modules independent.
- Avoid `any`; explain and isolate it when unavoidable.
- Add or update tests whenever behavior changes.
- Do not suppress errors with `--force`, `--legacy-peer-deps`,
  `@ts-ignore` or disabled lint rules without explicit approval.
- Keep dependencies pinned when compatibility matters.

## Required verification

Before declaring a task complete, run:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

Report any command that could not be run.

## Git workflow

- Do not develop directly on `main`.
- Keep each branch and commit focused on one change.
- Never commit `.env`, credentials, generated logs or local trading data.
- Review the diff before committing.
