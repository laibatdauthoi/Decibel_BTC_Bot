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

No wallet address, account, or private key is needed. Do not add private keys to `.env`.

## Usage

```powershell
npm start
```

The command fetches public BTC/USD perpetual metadata, current mark/mid/oracle prices, and a 24-hour candlestick backfill using the configured interval. The default strategy uses completed five-minute candles. Requests are split into bounded, non-overlapping time pages. On later runs, synchronization resumes after the latest stored candle; if an earlier gap exists in the backfill window, it resumes from the first gap instead. Completed candles are transactionally upserted into `data/btc_usd_candlesticks.sqlite`.

Startup output reports accurate `inserted`, `updated`, `unchanged`, and `total` counts. It also reports the number and bounds of missing intervals, plus a verification summary containing `candleCount`, `firstCandleTime`, `lastCandleTime`, and only the latest three completed candles. It does not print or store the API key, credentials, or full fetched history.

The reusable `decibel_client` exposes:

- `getBTCMarketMetadata()` for address, precision, sizing, leverage, open-interest limit, and market mode.
- `getBTCPrice()` for current mark, mid, and oracle prices plus the observation timestamp.
- `getBTCCandlesticks(interval, startTime, endTime)` for completed historical candles at a supported Decibel interval.

Market metadata uses human-readable units. The SDK's integer `tick_size` is divided by `10 ** priceDecimals`; integer `min_size` and `lot_size` are divided by `10 ** sizeDecimals`. Consequently, `tickSize` is denominated in USD per BTC while `minimumSize` and `lotSize` are denominated in BTC. Raw chain-unit values are not exposed. `maximumOpenInterest` is passed through from the SDK because this client does not reinterpret that API field.

Historical retrieval first resolves the concrete BTC perpetual market address from Decibel market metadata. Each candle contains a UTC `Date` timestamp, USD-per-BTC OHLC values, and BTC volume. Results are validated, sorted from oldest to newest, checked for duplicate timestamps, and omit any unfinished candle. Five-minute timestamps must be exact multiples of 300,000 milliseconds from the Unix epoch, which keeps them aligned to UTC five-minute boundaries.

SQLite schema migrations are applied automatically and tracked by version. The candlestick table uses `(market_address, interval, timestamp_ms)` as its primary key, enables WAL mode for file-backed databases, and uses one transaction per batch so repeated startup runs update existing candles without introducing duplicates. Runtime database files under `data/` are ignored by Git.

## Development

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
