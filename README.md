# Decibel BTC Bot

A strict TypeScript foundation for reading the Decibel BTC/USD perpetual market. The current client is deliberately read-only: it imports only `DecibelReadDex`, does not load private keys, and cannot submit or cancel orders.

## Offline risk engine

`npm run verify:risk-engine` verifies the deterministic BTC/USD perpetual risk policy against a USD 30 reference account. Every approved intent retains exactly 40x leverage; allocated margin and quantity vary with stop distance, fees, collateral, and risk limits. USD 1,200 is only the theoretical maximum notional for USD 30 equity before those constraints.

The engine is validation, sizing, persistence, and audit code only. It cannot trade and contains no wallet, signing, order-submission, modification, or cancellation integration. The USD 10,000 daily volume target is monitoring-only and never overrides risk. Liquidation and exchange margin-mode calculations remain unavailable pending verified Decibel semantics. See [the risk policy](docs/risk_policy.md).

`npm run verify:paper-account` exercises the isolated event-sourced USD 30 paper account, including exact 40x variable-margin fills, positions, fees, PnL, restart replay, and the uncapped USD 10,000 daily minimum-volume objective. Stop triggers create reduce-only intents but never assume execution. See [the paper-account documentation](docs/paper_account.md).

`npm run verify:order-manager` verifies the durable, exchange-agnostic order lifecycle against the paper adapter. Entries remain post-only, acknowledgements precede activation, cancellation uncertainty requires reconciliation, and V1 never reprices or falls back to taker execution. See [the order-manager documentation](docs/order_manager.md).

`npm run bot:paper` is the unified realtime paper runtime and replaces `npm run collect:data` while it is running. Its default `OBSERVE_ONLY` mode cannot create risk intents or paper orders. Stop standalone collectors first. Engineering execution is explicitly non-profitable testing, and supported-edge execution requires operator activation plus compatible persisted evidence. See [the paper-bot documentation](docs/paper_bot.md) and run `npm run verify:paper-bot` for isolated deterministic verification.

Set `PAPER_BOT_MODE=PAPER_SIMULATION` to allow the runtime to create deterministic paper-risk decisions, simulated order/fill records, and paper-account updates from valid completed-candle candidates. This remains strictly non-live: `LIVE` is rejected, `liveExecutionEnabled` remains false, and no wallet, key, signature, transaction, submission, or real cancellation path is available. `OBSERVE_ONLY` remains the default and creates zero paper fills.

The runtime installs health and completed-candle listeners before data startup, requires an uninterrupted configured health-stabilization period, and has a bounded readiness timeout. Warm-up start/deadline, completion duration, and cancelled attempts are transactionally audited; restart never shortens an unproven stabilization period. Live candles completed before readiness are journaled as skipped and never replayed; REST catch-up candles are not treated as live evaluations.

Completed-candle evaluation uses a durable chronological queue outside the WebSocket callback. Candle continuity is distinct from connection health: detected gaps degrade the paper bot, skip the triggering decision once, and invoke bounded single-flight REST reconciliation. Historical repairs never become retroactive paper trades, duplicates are idempotent, and the runtime never invents unsupported empty candles. `npm run diagnose:candle-gap -- --start=<ISO> --end=<ISO>` inspects an exact REST range without writing a database.

In composed mode, `bot:paper` exclusively owns SIGINT/SIGTERM. Its `STOPPED` state is emitted only after evaluation/reconciliation checkpointing, unified child shutdown, database closure, and lock release. Standalone collectors retain their own signal handling. Shutdown is bounded by `PAPER_BOT_SHUTDOWN_TIMEOUT_MS`; incomplete cleanup returns nonzero without falsely reporting `STOPPED`.

The paper database also contains durable session and evaluation ledgers. Each completed BTC/USD 5-minute candle close is globally idempotent across restarts and records its session, decisions, observe-only boundary, timestamps, and consistent account snapshots. Startup restores the evaluation high-water mark, skips completed candle closes, and marks crash-visible incomplete evaluations fail-closed rather than silently replaying them. `npm run verify:paper-bot` validates ledger uniqueness, restart recovery, observe-only safety, and clean resource release using temporary databases.

Paper accounting uses exact 8-decimal fixed-point values for cash, equity, available balance, BTC position size, average entry, realized/unrealized PnL, fees, slippage, and marks. Simulated executions are idempotent and linked to evaluations; their account mutation commits atomically with evaluation completion and restores from SQLite after restart. This accounting layer has no wallet, signing, transaction-building, submission, cancellation, or live-execution capability, and `OBSERVE_ONLY` cannot create simulated fills.

Paper-enabled strategy actions must pass the durable deterministic paper-risk policy before any simulated fill. The policy enforces position/notional/trade caps, daily loss, drawdown, cash reserve, fees, slippage, cooldown, and reversal/increase/reduce permissions. Valid oversized requests are resized; all other failures persist stable rejection reasons without changing the position. Decision, simulated order events, fill, account update, and evaluation completion are atomic and idempotent across restart. Configuration is listed in `.env.example`.

## Setup

Requires Node.js and npm. Install the pinned dependencies and copy the example environment file:

```powershell
npm install
Copy-Item .env.example .env
```

Configuration:

- `DECIBEL_NETWORK`: `testnet` (default) or `mainnet`.
- `DECIBEL_NODE_API_KEY`: optional node API key. It is passed directly to the SDK and is never logged.
- `MARKET_SYMBOL`: optional and restricted to `BTC/USD`.
- `CANDLE_INTERVAL`: a Decibel-supported interval, defaulting to `5m` for the trading strategy. Supported values are `1m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `8h`, `12h`, `1d`, `3d`, `1w`, and `1mo`.
- `CANDLE_HISTORY_DAYS`: dedicated five-minute backfill depth from 1 through 365 days; defaults to `90`.
- `LIVE_TRADING_ENABLED`: explicit informational trading authorization flag, defaulting to `false`. The current application has no order execution and setting this flag does not submit or enable orders.
- `LOG_FORMAT`: `pretty` (default for local development) or `json`. JSON mode emits newline-delimited structured Pino records for log aggregation.
- `MICROSTRUCTURE_SAMPLE_INTERVAL_MS`: changed-book sampling period, default `250` ms.
- `MICROSTRUCTURE_STARTUP_GRACE_MS`: grace after each subscription before silence can be stale; default `15000` ms.
- `MICROSTRUCTURE_DEPTH_STALE_AFTER_MS`: maximum depth silence after grace; default `10000` ms.
- `MICROSTRUCTURE_TRADES_STALE_AFTER_MS`: quiet-market trade threshold; default `120000` ms.
- `MICROSTRUCTURE_MARKET_PRICE_STALE_AFTER_MS`: maximum market-price silence after grace; default `30000` ms.
- `MICROSTRUCTURE_BATCH_SIZE`: maximum rows in one SQLite transaction, default `500`.
- `MICROSTRUCTURE_BOOTSTRAP_TRADE_LIMIT`: recent REST trades loaded before WebSocket subscription, from `0` through `10000`; defaults to `10000`.
- `DATA_RUNTIME_SHUTDOWN_TIMEOUT_MS`: bounded unified-runtime shutdown timeout, default `10000` ms.
- `EMA_FAST_PERIOD`, `EMA_SLOW_PERIOD`, and `EMA_TREND_PERIOD`: EMA backtest periods, defaulting to `9`, `21`, and `50`. They must be positive integers satisfying fast < slow < trend.
- `EMA_MAXIMUM_HOLDING_BARS`: maximum open-position lifetime in completed five-minute bars, defaulting to `48`.
- `BACKTEST_VERBOSE`: print each simulated trade when `true`; defaults to `false`.

No wallet address, account, or private key is needed. Do not add private keys to `.env`.

## Usage

```powershell
npm start
```

`npm start` runs a continuous BTC/USD five-minute market-data service. It performs one 24-hour REST catch-up, resolves the concrete BTC perpetual market, and then subscribes through the Decibel SDK to `market_candlestick:<market-address>:5m`. The active candle remains in memory and is persisted only after an event for a newer interval arrives, so completion does not depend solely on the local clock.

The service runs REST reconciliation every 15 minutes to repair missed intervals. Heartbeat checks mark data stale when WebSocket updates stop, and socket errors or stale data trigger reconnects with exponential delays capped at 60 seconds. `strategyEvaluationAllowed` reports whether candle data is healthy enough for deterministic strategy evaluation; it is false during startup, stale periods, and reconnects. `liveTradingEnabled` is reported separately and defaults to false. These statuses do not create an execution path, and this project still cannot submit orders. Replayed events after reconnect are safely upserted and do not duplicate candles.

`SIGINT` and `SIGTERM` unsubscribe and close the WebSocket, stop heartbeat/reconciliation/reconnect timers, and close SQLite cleanly. Logs contain concise health and catch-up metadata only; API keys and credentials are never emitted.

Pretty logging presents concise multiline records for startup, health transitions, completed-candle persistence, stale data, reconnect scheduling, reconciliation errors, and graceful shutdown. JSON mode preserves the same events as structured fields. Neither mode prints credentials or repeatedly dumps the 90-day history; candle logs contain only the completed candle timestamp and persistence counts.

## Unified data collection

```powershell
npm run collect:data
```

This is the recommended long-running development and eventual VPS entry point. It composes the existing candle service and microstructure collector inside one Node.js process; it does not launch nested npm or shell processes. Configuration is validated before either database is opened. Both SQLite databases are then migrated safely, candle REST catch-up completes, microstructure REST trade bootstrap completes, and only then are the candle, depth, trade, and market-price WebSocket subscriptions opened. The standalone `npm start` and `npm run collect:microstructure` commands remain available and use the same service modules.

The unified runtime reports candle, depth, trade, market-price, and one-second aggregate-persistence health separately, plus a transition-only `STARTING`, `HEALTHY`, `DEGRADED`, `FAILED`, `STOPPING`, or `STOPPED` status. Health includes last receipt times, reconnect/malformed/regression counters, the latest completed candle, and latest aggregate second. `SIGINT` and `SIGTERM` have one idempotent bounded shutdown path that stops new work, unsubscribes sockets, flushes completed data, closes the collector session and databases, and releases the writer locks.

Before starting `collect:data`, stop any running standalone candle or microstructure collector. All three writer commands participate in OS-held per-database locks, which are released automatically when a process terminates and therefore do not depend on deleting stale lock files. A conflict fails with the database path and an actionable stop-the-other-collector message. Offline research and quality commands use read-only/WAL access and may run while `collect:data` is active; research dataset building and maker simulation are never triggered by realtime events.

For a VPS, run one supervised `npm run collect:data` process with automatic restart and graceful `SIGTERM`, persistent `data/` storage, a protected environment file, and `LOG_FORMAT=json` for log collection. Do not run the standalone writer commands alongside it.

## Microstructure collection

```powershell
npm run collect:microstructure
```

This separate, read-only service supports mainnet and testnet, resolves Decibel's concrete BTC perpetual address, and subscribes through `DecibelReadDex` to `depth:<market-address>:1`, `trades:<market-address>`, and `market_price:<market-address>`. It validates every message and records both the exchange timestamp and local `receivedAt` time. It never imports a wallet, private key, account, trading module, or order API.

Before opening those realtime subscriptions, the collector bootstraps up to `MICROSTRUCTURE_BOOTSTRAP_TRADE_LIMIT` recent perpetual trade rows from REST. Decibel's 200-row page maximum is enforced, with bounded offsets through the 10,000-row target. Every page is validated and committed before the next request, so an interrupted startup resumes safely. Set the limit to `0` only when explicitly disabling bootstrap.

Decibel can return multiple participant rows with the same `trade_id`. The collector preserves each unique raw participant row under a SHA-256 row key derived only from stable exchange fields, while retaining `trade_id` as the economic-fill identifier. Exact row replays are skipped, including pagination overlap. Participant rows grouped under one `trade_id` must agree on market, price, size, exchange timestamp, and transaction version. Conflicting groups are stored as ambiguous and excluded from flow aggregates instead of stopping collection. Volume and trade count are applied once per non-ambiguous economic trade. Buy/sell flow is recorded only when an explicit taker/liquidity-role field determines aggressor direction; participant `action` alone remains `UNKNOWN` and is excluded from directional metrics. REST and WebSocket rows use the same normalizer and persistence path. Bootstrap logs report `rawRows`, `economicTrades`, `duplicateRows`, `participantRows`, `ambiguousTrades`, and oldest/newest timestamps without accounts or raw payloads.

Normalized trades retain side, price, and size. Order-book snapshots contain best bid/ask, spread, mid-price, size-weighted microprice, top-level sizes, and top-five depth imbalance. Identical books are suppressed and changed books are sampled every 250 ms by default. Price snapshots contain mark, mid, oracle, decimal funding rate, and open interest. During each active WebSocket segment, exactly one record is persisted for every completed UTC second, including zero-trade seconds. Records contain buy/sell/unknown-direction volume, economic trade count, VWAP, spread, depth imbalance, market-price features, and directional order-flow imbalance. Features carry forward only observations received by that second's close. `MICROSTRUCTURE_MAX_BOOK_AGE_MS` and `MICROSTRUCTURE_MAX_PRICE_AGE_MS` default to 2,000 and 5,000 ms; stale or missing features remain null while their measured ages remain stored. Disconnect and stopped periods are never backfilled, and aggregate upserts remain idempotent.

Data is stored in `data/btc_usd_microstructure.sqlite` with WAL, versioned migrations, replay-safe primary keys, and bounded transactions. Replayed trades, books, and price events do not create duplicate rows. Every participant trade records `REST_BOOTSTRAP`, `WEBSOCKET`, or migration-safe `UNKNOWN` ingestion source, plus distinct exchange, local receipt, and SQLite persistence timestamps. Economic trades store `BUY`, `SELL`, or `UNKNOWN` aggressor classification together with source, reason, confidence, matched-book timestamp, and matched-book age. Explicit taker flags and taker liquidity roles are exchange semantics with highest confidence. When those fields are absent on a WebSocket fill, a conservative `ESTIMATED_QUOTE_TEST` may use only the latest valid, non-stale book received no later than the trade: at/above ask is buy, at/below bid is sell, otherwise price above/below mid selects buy/sell, and exact mid remains unknown. REST and legacy trades are never retroactively estimated. Conflicting participants remain ambiguous; ambiguous and unknown fills contribute once to unknown volume and never to directional volume.

Collector sessions and their start, disconnect, reconnect, stop, and graceful-shutdown boundaries are persisted. Cumulative malformed-message, timestamp-regression, reconnect, per-stream received-event, and REST bootstrap counters are also persisted. Crossed or inconsistent books, malformed data, market mismatches, and timestamp regressions are rejected and counted. Depth, trade, and market-price health are tracked separately. A newly subscribed stream remains `waiting` until its first event, and startup grace prevents immediate stale decisions. Depth and price use their own thresholds. Trades use a much longer quiet-market threshold and remain waiting/healthy while other stream traffic proves WebSocket liveness. Genuine depth/price staleness or a socket heartbeat/error callback reconnects all address-bound subscriptions with exponential backoff capped at 60 seconds. Health is logged only on transitions. `SIGINT` and `SIGTERM` stop timers, unsubscribe, close the socket, flush completed aggregates, and close SQLite. Logs contain only public market identity, stream health, and concise persistence/error counters.

## Microstructure data-quality analysis

```powershell
npm run analyze:microstructure-quality
```

This command opens `data/btc_usd_microstructure.sqlite` in SQLite read-only mode and analyzes the most recent `MICROSTRUCTURE_QUALITY_HOURS` (default `24`, valid range `1`–`720`). It reports window bounds; counts, first/last timestamps, and coverage for economic trades, sampled books, market prices, and one-second aggregates; active-session missing ranges; exchange-to-receipt latency percentiles; spread, top-of-book depth, and imbalance distributions; and participant/economic-trade quality ratios. Participant rows are deduplicated by their stable row key and economic trades by trade identifier, so replays neither create a new trade nor double-count volume.

The report keeps the complete requested range under `historicalWindow` for transparency. Its `researchSufficiency` compares completed active-session duration with the requested duration and may remain `NOT_ENOUGH_DATA` when less than 80% of the requested range exists. Historical legacy data does not determine the current collector statuses.

`latestCollectorSession` selects the newest session with feature version `V5_CONTINUOUS_AGGREGATES`. Sessions created before feature-version tracking migrate to `LEGACY_UNKNOWN` and are never guessed to be compatible. Latest-session trades, books, prices, and latency samples are scoped by local `receivedAt` between that session's start and stop/current time. Aggregates are scoped to its completed active segments, excluding reconnect and intentional shutdown gaps. The section reports session identity and duration, expected/actual/missing seconds, stale/missing feature ratios, WebSocket economic trades, `EXPLICIT`/`ESTIMATED_QUOTE_TEST`/`UNKNOWN` counts and ratios, unknown/failure reasons, matched-book ages, clock-skew-aware latency, and exact per-session malformed, regression, and reconnect counters when available.

Collection quality and directional-order-flow readiness use only this latest compatible session. Aggregate missing ratios above 1%/10% and WebSocket p99 latency above 1,000/5,000 ms produce `WARN`/`FAIL` collection status. Ambiguous-trade ratios above 1%/5% and unknown-aggressor ratios above 20%/50% produce `WARN`/`FAIL` directional status; 100% unknown always fails. The overall status is the worse independent status, while requested-window research sufficiency remains separate. The command emits one concise structured event in the configured `LOG_FORMAT`, does not read API-key or wallet configuration, and never writes to SQLite.

## Historical backfill

```powershell
npm run backfill
```

The dedicated command always backfills BTC/USD five-minute candles from `CANDLE_HISTORY_DAYS` ago through the latest completed UTC bucket. It extends backward when recent candles already exist, starts at the earliest missing timestamp after interruption, and requests bounded non-overlapping pages. Identical stored candles are skipped. HTTP `429` and temporary `5xx` responses use at most three retries with exponential backoff; authentication, authorization, and response-validation failures are not retried.

Progress is emitted as compact public-data-only JSON per completed page and retry, followed by final inserted, updated, unchanged, total, and missing-interval counts. `npm run backfill` remains a separate one-time command and is never launched by the continuous service.

## Backtesting

```powershell
npm run backtest
```

The offline backtest command requires `DECIBEL_NETWORK=mainnet` and reads the single persisted BTC/USD `5m` market identity from SQLite in chronological order. This deliberately uses the concrete address returned by Decibel metadata during collection instead of independently deriving a potentially different address from an SDK deployment constant. If the dataset is missing or ambiguous, the failure log includes the absolute database path and public candle counts grouped by market address and interval; it never includes credentials. The command runs the deterministic `ema_trend_strategy` through the reusable `backtesting_engine`; it does not connect to a wallet or expose any live-order functionality.

The strategy requires at least 50 completed warm-up candles (or the configured trend period when it is larger). It returns `LONG` when the fast EMA crosses above the slow EMA and the current close is above the trend EMA. It returns `SHORT` for the inverse conditions. An opposite fast/slow cross exits an existing position, as does `EMA_MAXIMUM_HOLDING_BARS`. Defaults are EMA 9/21/50 with a 48-bar holding cap. Every evaluation receives only the candle prefix completed at that point.

Strategies implement `backtest_strategy.evaluate(context)` and return `LONG`, `SHORT`, `EXIT`, or `HOLD`. The context contains only candles available through the current timestamp, current equity, and at most one position. Signals are queued and executed at the next candle open to prevent look-ahead bias. Any position left open is force-closed at the final candle close.

Engine configuration covers starting equity, maker/taker fee rates, adverse slippage, leverage, equity-at-risk per position, stop-loss distance, and take-profit distance. Position size is risk-based and capped by leverage. Stop-losses use conservative taker fills, take-profits use maker fills, and equity is marked to market for drawdown. Results include every trade plus net return, total fees, win rate, profit factor, maximum drawdown, and ending equity. Missing, duplicate, unordered, misaligned, or malformed candles are rejected before simulation.

By default, the command logs strategy and engine parameters plus aggregate metrics only. Set `BACKTEST_VERBOSE=true` to emit individual simulated trades. No credentials are loaded or printed by the strategy, and the command never submits orders.

The diagnostic report separates gross return before execution costs, trading fees, and slippage. It breaks performance down by long/short direction and exit reason, reports holding duration, average win/loss, expectancy, UTC monthly return and drawdown, and compares the strategy with an unleveraged BTC buy-and-hold benchmark over the same candles. Cost sensitivity is shown for zero, configured, and doubled fee/slippage settings. These are fixed diagnostic scenarios; the command does not optimize EMA or risk parameters.

## Timeframe verification

```powershell
npm run verify:timeframes
```

This read-only command loads completed BTC/USD `5m` candles from the shared SQLite database and deterministically aggregates fully covered UTC buckets into `15m` and `1h` candles. It validates source alignment, chronological order, continuity, uniqueness, and OHLCV data. Leading or trailing boundary fragments and candles unfinished at the verification cutoff are not aggregated. The command does not persist derived timeframes; it prints only each timeframe's count, first/last timestamps, and latest completed candle.

## Market-structure verification

```powershell
npm run verify:market-structure
```

The deterministic detector consumes only completed in-memory `1h` aggregates. `SWING_LEFT_BARS` and `SWING_RIGHT_BARS` configure strict pivot windows and both default to `2`. Equal highs or lows are not pivots. Each swing records its original `pivotTime` and the close boundary `confirmedAtTime` of its final right-side bar, so it cannot appear early. Two rising confirmed swing highs and lows produce `TREND_UP`; two falling highs and lows produce `TREND_DOWN`; mixed structure produces `RANGE`; insufficient swings produce `UNKNOWN`. The command prints the current regime and latest two confirmed highs and lows without persisting anything or using EMA data.

## Breakout-setup verification

```powershell
npm run verify:breakout-setups
```

The deterministic detector consumes only completed in-memory `15m` aggregates and does not combine setups with the hourly regime. A bullish setup closes strictly above the previous `BREAKOUT_RANGE_WINDOW` highs; a bearish setup closes strictly below the previous range lows. The breakout candle is excluded from range, ATR, and median-volume inputs. Prior compression requires the short/long ATR ratio to be at most `BREAKOUT_COMPRESSION_RATIO`, while breakout volume must strictly exceed `BREAKOUT_VOLUME_MULTIPLE` times prior median volume. Defaults are range `20`, ATR `5/14`, compression `0.75`, and volume `1.5`. Gapped, malformed, incomplete, or insufficient data produces no setup.

Each setup exposes `breakoutCandleTime` as the interval start and `confirmedAtTime` as exactly 15 minutes later. A setup is never returned before `confirmedAtTime`, so a `22:00` breakout candle remains unavailable throughout `22:00–22:15`. The command prints the total count and latest three confirmed setups without executing or persisting anything.

## Opportunity analysis

```powershell
npm run analyze:opportunities
```

The research-only scanner evaluates every completed BTC/USD `5m` candle for short-range breakouts, trend pullback continuations, confirmed hourly swing-level retests/rejections, and volatility expansions. Completed `15m` momentum and confirmed `1h` market structure are sliced at each five-minute close, so future higher-timeframe candles cannot enter the score. `TREND_UP`, `TREND_DOWN`, `RANGE`, and `UNKNOWN` contribute deterministic score points but never hard-reject a pattern. Each candidate includes its five-minute interval start as `detectedAtTime`, its close as `availableAtTime`, direction, type, 0–100 score, regime, volatility/volume ratios, and reasons.

Environment variables prefixed with `OPPORTUNITY_` configure each pattern's range, movement, retest, volatility, volume, and fixed minimum research-score thresholds. The per-type minimum scores default to `85`; they are static quality gates, not adaptive daily quotas. Same-candle/same-direction overlaps collapse to the highest-scoring candidate. The report includes candidates by UTC day, average candidates per active day, type/direction/regime distributions, score percentiles, and only the latest five candidate details. Threshold defaults express general pattern definitions and are not optimized to force a requested daily count. The scanner does not submit orders or connect candidates to live execution.

## Opportunity outcome analysis

```powershell
npm run analyze:outcomes
```

This offline command evaluates every historical research candidate that has a complete twelve-bar forward window. Its hypothetical entry is the next completed `5m` candle open; direction-adjusted returns use the closes after 1, 3, 6, and 12 bars. Twelve-bar high/low paths provide MFE and MAE. Candidates near the dataset end without enough future candles are counted as excluded rather than evaluated with future or incomplete data.

Reports compare gross/zero-cost returns with maker and taker-plus-slippage estimates. Defaults use Decibel tier-0 maker `0.00011` and taker `0.00034` rates; `OUTCOME_MAKER_FEE_RATE`, `OUTCOME_TAKER_FEE_RATE`, and `OUTCOME_SLIPPAGE_RATE` are configurable decimal rates. Costs are estimated as round-trip fees, with adverse slippage on both taker legs. Results are grouped by candidate type, direction, point-in-time regime, score band, and holding horizon. The report includes sample count, hit rate, average/median return, expectancy, MFE, MAE, overlapping clusters, and fixed 5/10/15-minute cooldown variants. It does not select, optimize, trade, or submit orders.

## Point-in-time research dataset

```powershell
npm run build:research-dataset
```

This offline command regenerates the existing deterministic 5-minute opportunity candidates and joins each candidate at its `availableAtTime` with v5-compatible microstructure observations only. One-second aggregates are eligible only after their second-close boundary; books and WebSocket trade classifications must have local receipt timestamps at or before the decision. Legacy sessions, reconnect gaps, future observations, REST bootstrap direction, and unfinished candles are excluded.

The builder captures one fixed research cutoff before reading. Candle bounds and rows are read in one WAL-compatible SQLite snapshot, and all related microstructure session, event, aggregate, book, and trade reads use a separate consistent snapshot constrained by the same cutoff. Concurrent newest-candle commits therefore appear wholly in the current build or the next build, never partially. Only candles completed by the cutoff are eligible. Genuine internal five-minute gaps still fail with previous, next, expected, and missing-count diagnostics; the builder does not retry or hide them.

Trailing 15, 60, and 300-second feature windows report aggregate and stale-feature coverage, spread, imbalance, depth, directional and unknown volume, trade intensity, VWAP, OFI, microprice deviation, feature ages, and explicit/estimated/unknown direction counts. Missing observations remain null; only genuine zero-trade quantities are zero. Each window is independently `VALID` or `INVALID` using fixed coverage and feature-availability gates.

Research-only outcomes use completed five-minute candles after the decision and report 5/15/30/60-minute returns, direction-adjusted returns, and 60-minute favorable/adverse excursions with all reference, target, and excursion timestamps and prices. They are not fills or simulated orders. Missing future candles produce null outcomes.

Derived rows are stored in `data/btc_usd_research.sqlite` under feature version `BTC_5M_MICROSTRUCTURE_V1`, keyed by market, stable candidate identity, and feature version. Rebuilds deterministically update changed rows and skip identical rows. A concise summary is logged and formatted JSON is written to ignored `data/microstructure_research_report.json`. Fewer than 100 valid outcome-complete samples is reported as `NOT_ENOUGH_DATA`; no thresholds or strategy parameters are optimized.

## Offline maker-execution research

```bash
npm run simulate:maker-execution
```

This command reads only candidates whose 15-second, 60-second, and 300-second microstructure windows are valid. It uses the versioned normalized BTC/USD market-metadata snapshot written to the research database by `npm run build:research-dataset`, compatible current-version collector sessions, and WebSocket economic trades observed after the configured placement latency. The snapshot includes the concrete market address, tick and lot constraints, decimal precision, maximum leverage, observation time, and a deterministic content version. The simulator makes no network request and fails actionably if the snapshot is absent or disagrees with research or microstructure market addresses. The command does not load a wallet, sign transactions, submit orders, or turn an unfilled maker order into a taker order.

`STRICT_TRADE_THROUGH` requires an eligible opposite-aggressor economic trade strictly through the limit. `TOUCH_WITH_FLOW` consumes eligible opposite-aggressor volume at the limit or better. Both exclude REST bootstrap, ambiguous, unknown-direction, replayed, and out-of-session evidence, and both count each economic trade once. Level-1 observations cannot establish queue position, so `TOUCH_WITH_FLOW` is explicitly reported as a flow proxy rather than a queue-accurate fill. Unfilled remainders expire; fills before cancellation effectiveness remain valid and equal-time events use deterministic conservative ordering.

Configuration defaults are `MAKER_SIMULATOR_ENTRY_OFFSET_TICKS=0`, `MAKER_SIMULATOR_TTL_SECONDS=30`, `MAKER_SIMULATOR_PLACEMENT_LATENCY_MS=250`, `MAKER_SIMULATOR_CANCEL_LATENCY_MS=250`, `MAKER_SIMULATOR_FEE_RATE=0.00011`, `MAKER_SIMULATOR_STARTING_EQUITY=10000`, `MAKER_SIMULATOR_RISK_PER_CANDIDATE=0.0025`, and `MAKER_SIMULATOR_LEVERAGE_CAP=2`. The simulator records lifecycle events, partial fills, maker fees, and 5/15/30/60-second mid-price markouts, but intentionally does not simulate exits or profitability. Results are versioned and idempotently persisted in `data/btc_usd_research.sqlite`; a formatted ignored report is written to `data/maker_execution_report.json`. Fewer than 100 eligible candidates is `NOT_ENOUGH_DATA`.

## Research-edge analysis

```powershell
npm run analyze:research-edge
```

This fully offline command joins valid, outcome-complete research candidates to the matching versioned maker simulations. A candidate is one statistical unit even though `STRICT_TRADE_THROUGH` and `TOUCH_WITH_FLOW` execution views are reported separately. It evaluates only the predefined directional-volume, top-book imbalance, imbalance-change, spread, depth, intensity, and combined-confirmation hypotheses using the fixed 60-second hypothesis window; all 15/60/300-second windows must be valid. It never searches candidate, feature, or execution thresholds.

Evaluation uses chronological expanding training windows, 25-candidate test blocks, a default minimum of 100 training candidates, a 60-minute forward-outcome purge, and `RESEARCH_EDGE_EMBARGO_MINUTES=60`. `RESEARCH_EDGE_MINIMUM_TRAINING_SAMPLES` and `RESEARCH_EDGE_TEST_BLOCK_SIZE` configure the first two bounds. Spread, depth, and intensity medians are fitted only on earlier training observations. Chronological overlap clusters drive a deterministic seeded block bootstrap; reports include 95% confidence intervals, effect sizes versus the unfiltered baseline, and Benjamini-Hochberg false-discovery rates. Evidence remains exploratory unless both corrected significance and a positive expectancy interval support it, and no profitability claim is made when an interval includes zero.

The concise terminal event reports eligibility, exclusions, and `NOT_ENOUGH_DATA`, `EXPLORATORY`, `SUPPORTED`, or `REJECTED`. Full versioned metrics and separate maker-assumption results are written deterministically to ignored `data/research_edge_report.json`. Fewer than 100 eligible candidates produces `NOT_ENOUGH_DATA` and no recommendation. This is research only and never emits an automatic live-trading recommendation.

The reusable `decibel_client` exposes:

- `getBTCMarketMetadata()` for address, precision, sizing, leverage, open-interest limit, and market mode.
- `getBTCPrice()` for current mark, mid, and oracle prices plus the observation timestamp.
- `getBTCCandlesticks(interval, startTime, endTime)` for completed historical candles at a supported Decibel interval.

Market metadata uses human-readable units. The SDK's integer `tick_size` is divided by `10 ** priceDecimals`; integer `min_size` and `lot_size` are divided by `10 ** sizeDecimals`. Consequently, `tickSize` is denominated in USD per BTC while `minimumSize` and `lotSize` are denominated in BTC. Raw chain-unit values are not exposed. `maximumOpenInterest` is passed through from the SDK because this client does not reinterpret that API field.

Historical retrieval first resolves the concrete BTC perpetual market address from Decibel market metadata. Each candle contains a UTC `Date` timestamp, USD-per-BTC OHLC values, and BTC volume. Results are validated, sorted from oldest to newest, checked for duplicate timestamps, and omit any unfinished candle. Five-minute timestamps must be exact multiples of 300,000 milliseconds from the Unix epoch, which keeps them aligned to UTC five-minute boundaries.

SQLite schema migrations are applied automatically and tracked by version. The candlestick table uses `(market_address, interval, timestamp_ms)` as its primary key, enables WAL mode for file-backed databases, and uses one transaction per batch so repeated startup runs update existing candles without introducing duplicates. Startup, backfill, and backtest all use the same module-relative absolute path resolver for `data/btc_usd_candlesticks.sqlite`, so their database selection does not depend on the shell's working directory. Runtime database files under `data/` are ignored by Git.

## Development

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
