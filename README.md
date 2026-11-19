# Decibel BTC Bot

Automated, deterministic market-making bot for the BTC/USD perpetual on
[Decibel](https://decibel.trade) (Aptos). It quotes post-only entries, protects inventory with
reduce-only take-profit orders, and stops each session at a configured Max Loss. A local web
dashboard starts and ends sessions, edits settings and shows PnL, volume and history.

The bot never calls an AI model while trading. Every order passes the decision layer and the
risk engine.

## How it trades

- **Entries:** post-only limit orders near the best bid/ask, sized from the session capital,
  paused in high volatility. DCA additions follow fixed rules.
- **Exits:** a reduce-only TP rests against every open position and is repriced as the market
  moves. No tight per-position stop-losses: they would realize noise as taker losses.
- **Session limits:** each session has a volume target and a Max Loss. Reaching the Max Loss
  triggers a reduce-only unwind and ends the session.
- **Safety gates:** no order on stale or incomplete market or account data; balance, orders and
  positions are reconciled after startup and reconnect; new entries pause when the gas wallet
  falls below its reserve, while exits stay allowed.

The full specification is [docs/decibel_strategy_v1.md](docs/decibel_strategy_v1.md). Every
parameter lives in `src/decibel_strategy_policy_v1.ts`.

## Wallet model

No private key is stored in `.env`. The owner connects **Petra** in the dashboard:

1. **CONNECT WALLET** in the top bar. Only wallets listed in `config/allowed_wallets.json` may use
   the bot.
2. Pick a Decibel subaccount and **CONFIRM**. Petra signs one on-chain authorization that lets
   the bot's own key trade that subaccount for 30 days. The bot key can trade but cannot
   withdraw funds.
3. The bot key pays its own gas (Petra offers a small APT top-up when it runs low), unless a
   Geomi Gas Station key sponsors it.
4. **RENEW** extends the authorization; **REVOKE** withdraws it on-chain. Switching or revoking
   the running subaccount waits until no session is active and no order is open.
5. **WITHDRAW GAS** sends the bot key's spare APT back to the owner wallet (only while no session
   runs and no order is open). Type an amount or press MAX for everything. The bot key signs this
   transfer; the destination is always the connected owner.

Each wallet has its own data set in `data/wallets/<owner>/`. The wallet's subaccounts share it.
Details: [docs/decibel_wallet_setup_v1.md](docs/decibel_wallet_setup_v1.md).

## Requirements

- Windows. The launcher runs a pinned Node `v22.23.2` from
  `%LOCALAPPDATA%\DecibelTools\node-v22.23.2-win-x64\` (override with
  `DECIBEL_NODE22_EXECUTABLE`).
- A Decibel / Aptos node API key.
- The Petra browser extension for the owner wallet.

## Setup

```powershell
npm run install:production
Copy-Item .env.example .env
Copy-Item config/allowed_wallets.example.json config/allowed_wallets.json
```

1. Fill `DECIBEL_NODE_API_KEY` in `.env`. Leave the other values at their safe defaults until
   you intend to trade.
2. List your owner wallet address in `config/allowed_wallets.json`.
3. Start the bot and open the dashboard at http://127.0.0.1:4173:

   ```powershell
   npm run decibel:production
   ```

4. Connect Petra, pick the subaccount, CONFIRM, then start a session from the dashboard.

### Live trading

Live trading is disabled by default. Mainnet orders need both `TRADING_MODE=mainnet` and
`LIVE_TRADING_ENABLED=true`, plus the executor settings described in `.env.example`. Start with
small funds.

### Configuration

| Variable                                                            | Required | Purpose                                                           |
| ------------------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `DECIBEL_NODE_API_KEY`                                              | yes      | Decibel / Aptos read API key                                      |
| `TRADING_MODE`, `LIVE_TRADING_ENABLED`                              | yes      | Both must allow mainnet before any live order                     |
| `DECIBEL_EXECUTION_MODE`, `DECIBEL_EXECUTION_RELEASE_STAGE`, `DECIBEL_EXECUTOR_*` | yes | Execution stage; defaults submit nothing                |
| `DECIBEL_GAS_STATION_API_KEY`                                       | no       | Geomi Gas Station key; the bot key then needs no APT              |
| `DECIBEL_DASHBOARD_AUTH`                                            | no       | `wallet` requires signing in with the owner wallet                |
| `DECIBEL_KEYSTORE_SECRET`                                           | no       | Bot-key encryption secret; on a server, set it here instead of a file |
| `DECIBEL_TERMINAL_VERBOSE`                                          | no       | `true` prints raw runtime lines instead of the compact view       |

Never commit `.env`. The bot redacts known secrets from its logs.

## Data layout

| Path                                    | Content                                                             |
| --------------------------------------- | ------------------------------------------------------------------- |
| `data/wallets/<owner>/`                 | Execution journal, session store, settings, restart safety, bot key |
| `data/wallets/<owner>/production_runtime/` | Full runtime logs (`stdout.log`) and process forensics           |
| `data/selected_subaccount_v1.json`      | Subaccount chosen in the wallet menu                                |
| `data/keystore_secret_v1.key`           | Local bot-key encryption secret (created automatically)             |
| `config/allowed_wallets.json`           | Whitelisted owner wallets                                           |

`data/` and the local config files are gitignored.

## Commands

| Command                         | What it does                                                        |
| ------------------------------- | ------------------------------------------------------------------- |
| `npm run decibel:production`    | Build the dashboard and run the bot (restarts itself on a subaccount switch) |
| `npm run decibel:multi-wallet`  | Gateway that runs one bot per wallet in `config/wallets.json`        |
| `npm run decibel:backtest`      | Offline backtest: replays recorded BBO rows over parameter variants  |
| `npm run decibel:probe:venue-v1` | Venue capability probe                                              |
| `npm run decibel:data-retention-v1` | Dry-run plan to prune old diagnostics (`-- --apply` with the bot stopped) |

## Development

The code is strict TypeScript. Market data, strategy, risk and execution stay in separate
modules, and every behaviour change comes with tests. Naming rules and trading-safety rules are
in [AGENTS.md](AGENTS.md).

Run all of these before a change is complete (CI runs the same on every push):

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

New test files must be added to the explicit list in the `package.json` `test:production-core`
script.

## Project status

Current state, formulas, known risks and history:
[PROJECT_HANDOVER_2026_11_12.md](PROJECT_HANDOVER_2026_11_12.md).

## Disclaimer

Trading perpetual futures can lose money quickly. This software comes with no warranty; run it
only with funds you can afford to lose.
