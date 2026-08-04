# Decibel BTC Bot

A strict TypeScript foundation for reading the Decibel BTC/USD perpetual market. The current client is deliberately read-only: it imports only `DecibelReadDex`, does not load private keys, and cannot submit or cancel orders.

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
