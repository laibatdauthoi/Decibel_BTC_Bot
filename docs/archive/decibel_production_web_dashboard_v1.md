# Decibel Production Web Dashboard V1

## Architecture

The dashboard is a local-only React and TypeScript application built with Vite. A lightweight Node HTTP server serves the static frontend and a Server-Sent Events stream. The server binds exclusively to `127.0.0.1` by schema validation.

The backend reads current state through `decibel_production_live_state_source_v1` and opens the execution lifecycle SQLite journal in read-only mode. Strategy ladder display calls the existing pure authenticated strategy evaluator. It does not duplicate quote or execution logic.

## Start

```powershell
npm run decibel:production:web-v1
```

Default local URL:

```text
http://127.0.0.1:4173
```

The command builds the Vite frontend and starts the telemetry server. It does not start the production executor or submit venue mutations.

## Views

The default `MARKET` view is deliberately limited to immediate operator decisions:

- One dominant BTC/USD price with best bid, best ask, and spread
- One highly visible runtime state
- Compact symmetric desired and active quote ladder
- Position, unrealized PnL, session volume, and progress strip
- One current operational message or blocker
- Restrained in-memory runtime price trace

The `EXECUTION` view contains active-order count, mutation budget, known fees and gas, current blockers, recent intents, venue order identity, transaction hashes, and reconciliation state.

The `HISTORY` view contains authenticated fills, realized PnL windows, maker volume, and a filterable runtime event record.

The visual system uses warm off-white and near-black surfaces, thin hard divisions, square geometry, condensed display typography, monospace operational data, ice-blue live emphasis, and signal-red abnormal-state emphasis. It does not use conventional dashboard cards or expose browser mutation controls.

Unavailable evidence is displayed as `UNKNOWN`. A failed authenticated refresh sets the dashboard to `DEGRADED` or `READ_FAILURE` while retaining the last successful snapshot with an explicit timestamp. SSE loss displays `DISCONNECTED`.

## Telemetry and history

The SSE endpoint is `/api/events`. The current snapshot endpoint is `/api/telemetry`. Journal history is bounded to at most 100 recent records per category and does not write or migrate the database.

The browser DTO includes sanitized runtime, market, account, inventory, ladder, order, intent, fill, PnL, volume, risk, blocker, and event data.

## Security boundary

The server rejects any bind address other than `127.0.0.1`. Browser telemetry is whitelist-based and checked for secret-bearing field names before serialization. It excludes private keys, mnemonics, API keys, API tokens, authorization headers, cookies, signer objects, and raw SDK responses.

Dashboard controls are disabled and labeled `Execution control not exposed through dashboard V1`. There are no browser PLACE, CANCEL, wallet, signing, profile mutation, or live activation endpoints.

## Known limitations

- The dashboard is a separate read-only observer. It does not replace or control the production runner process.
- Runtime charts begin when the dashboard server starts and are kept only in browser memory.
- Transaction gas is shown as `UNKNOWN` unless it becomes available through sanitized retained journal evidence.
- Ladder volatility currently displays the safe evaluation input available to the observer, not private orchestrator in-memory history.
- Active order age is `UNKNOWN` when no durable authoritative activation timestamp is available.
