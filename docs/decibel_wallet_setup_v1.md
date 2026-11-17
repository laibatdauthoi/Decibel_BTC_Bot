# Wallet setup (connect Petra, whitelist, sign-in)

Added 2026-11-17. No private key and no account address in `.env`: the connected Petra wallet is the identity.

## Pieces

| Piece | Where | Purpose |
| --- | --- | --- |
| Whitelist | `config/allowed_wallets.json` (gitignored; example in `config/allowed_wallets.example.json`) | Owner wallets allowed to run the bot. Missing or invalid file: nobody runs. |
| Subaccount workspace | `data/wallets/<owner>/<subaccount>/` | Session store (newest 30 sessions with PnL and volume), execution journal, settings, restart safety, logs, market data. Each subaccount has its own. |
| Wallet directory | `data/wallets/<owner>/` | Bot key and dashboard sign-in sessions, shared by the wallet's subaccounts. |
| Bot key | `data/wallets/<owner>/agent_key_v1.json` | Key the bot creates for itself (never the owner's key); can trade but not withdraw; encrypted (scrypt + AES-256-GCM) with `data/keystore_secret_v1.key`, or `DECIBEL_KEYSTORE_SECRET` on a server. |
| Authorization | on-chain, `dex_accounts_entry::delegate_trading_to_for_subaccount` | The owner lets the bot key trade one subaccount for 30 days. Signed in Petra. |
| Selected subaccount | `data/selected_subaccount_v1.json` | Subaccount the bot runs on, chosen in the wallet menu. |

The launcher runs on the selected subaccount, else `DECIBEL_SUBACCOUNT_ADDRESS` if still set, else the primary
subaccount of the first whitelisted wallet. The owner is read from the subaccount's on-chain `0x1::object::ObjectCore`.

## First run after the change

1. Stop the bot while flat. Start it with `npm run decibel:production`.
2. The launcher prints `DECIBEL_WALLET_WORKSPACE=READY OWNER=0x… MIGRATION=…`.
   - `MIGRATED`: the old files moved to `data/wallets/<owner>/`; small files were copied to `data/backups/legacy_<time>/` first.
   - `SKIPPED_ACTIVE_SESSION`: a session was still active, so this run keeps the old paths. The move is retried on the next start.
   - `SKIPPED_FAILED`: something was locked (for example an old process still running). Nothing moved.
3. History, settings and PnL totals on the dashboard must look the same as before.

## Connect and run

1. Top bar: CONNECT WALLET (next to MAINNET), approve in Petra. After a reload the connection is restored
   without a popup.
2. The menu lists the wallet's Decibel subaccounts. Pick one and press CONFIRM: Petra asks to authorize the bot
   (30 days) and, when the bot key has under 0.1 APT, a 0.5 APT gas transfer. Nothing else to set up.
3. If it is not the subaccount in use, the bot switches to it by itself (it restarts while idle; the page
   reloads when it is back). A running session must be ended first.
4. Sessions sign with the bot key (`DECIBEL_EXECUTOR_SIGNER=BOT_KEY` in the log). There is no private-key
   fallback: without an active authorization the session does not start.
5. REVOKE in the menu (or on Decibel) removes the bot's access at any time.

## Dashboard sign-in

`DECIBEL_DASHBOARD_AUTH=wallet` requires a Petra signature for every API route. The session is an HttpOnly,
SameSite=Strict cookie for 7 days. Set `DECIBEL_DASHBOARD_COOKIE_SECURE=true` when served over HTTPS. If Petra
is unavailable, set it back to `off` and restart; Ctrl+C in the terminal still ends a session.

## Several wallets

1. Each extra wallet: its owner in `config/allowed_wallets.json`, its subaccount and a free local port in
   `config/wallets.json` (gitignored; see `config/wallets.example.json`).
2. `npm run decibel:multi-wallet` builds the dashboard, starts one runtime per wallet (normal launcher, own
   workspace, journal, executor and agent key) and the gateway on `gateway.port`.
3. Open the gateway URL and sign in with Petra; each owner sees only its own runtime. Runtimes listen on
   127.0.0.1 only and keep their own sign-in off.
4. Only the first wallet (the subaccount named in the legacy canary manifest) takes over the old files and
   baseline. Every other wallet gets `activity_baseline_v1.json`: the bot owns its strategy fills from
   onboarding on, and the wallet's own market data (economic evidence, BBO recording) lives in its workspace.

For a domain: run the gateway behind a TLS reverse proxy that keeps the `Host` header, set
`gateway.publicHost` to the domain and `gateway.publicScheme` to `https` (Secure cookie).

## Not done yet

- Not run with a second real wallet or behind a real domain yet.
- Venue history is limited to 180 days. Since 2026-11-17 the read window rolls (orders 7 days further back than
  fills), so an old baseline no longer stops the bot; fills older than the window drop out of the live ledger.
- One shared `DECIBEL_NODE_API_KEY` serves every wallet; watch the venue rate limits as wallets are added.
