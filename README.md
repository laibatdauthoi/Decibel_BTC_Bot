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

No wallet address, account, or private key is needed. Do not add private keys to `.env`.

## Usage

```powershell
npm start
```

The command fetches public BTC/USD perpetual metadata and the current mark, mid, and oracle prices. Output contains only the selected network and normalized public market data.

The reusable `decibel_client` exposes:

- `getBTCMarketMetadata()` for address, precision, sizing, leverage, open-interest limit, and market mode.
- `getBTCPrice()` for current mark, mid, and oracle prices plus the observation timestamp.

Market metadata uses human-readable units. The SDK's integer `tick_size` is divided by `10 ** priceDecimals`; integer `min_size` and `lot_size` are divided by `10 ** sizeDecimals`. Consequently, `tickSize` is denominated in USD per BTC while `minimumSize` and `lotSize` are denominated in BTC. Raw chain-unit values are not exposed. `maximumOpenInterest` is passed through from the SDK because this client does not reinterpret that API field.

## Development

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
