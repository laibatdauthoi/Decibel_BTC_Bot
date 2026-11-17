# Wallet setup (agent wallet, whitelist, sign-in)

Added 2026-11-17. Replaces putting the owner's private key in `.env`.

## Pieces

| Piece | Where | Purpose |
| --- | --- | --- |
| Whitelist | `config/allowed_wallets.json` (gitignored; example in `config/allowed_wallets.example.json`) | Owner wallets allowed to run the bot. Missing or invalid file: nobody runs. |
| Wallet workspace | `data/wallets/<owner>/` | Session store (newest 30 sessions with PnL and volume), execution journal, settings, restart safety, logs, agent keystore, dashboard sessions. |
| Agent keystore | `data/wallets/<owner>/agent_key_v1.json` | Bot-only Ed25519 key, encrypted with `DECIBEL_KEYSTORE_SECRET` (scrypt + AES-256-GCM). |
| Delegation | on-chain, `dex_accounts_entry::delegate_trading_to_for_subaccount` | The owner lets the agent trade the subaccount for 30 days. Signed in Petra. |

The owner is read from the subaccount's on-chain `0x1::object::ObjectCore`, so the launcher needs only
`DECIBEL_SUBACCOUNT_ADDRESS`.

## First run after the change

1. Stop the bot while flat. Start it with `npm run decibel:production`.
2. The launcher prints `DECIBEL_WALLET_WORKSPACE=READY OWNER=0x… MIGRATION=…`.
   - `MIGRATED`: the old files moved to `data/wallets/<owner>/`; small files were copied to `data/backups/legacy_<time>/` first.
   - `SKIPPED_ACTIVE_SESSION`: a session was still active, so this run keeps the old paths. The move is retried on the next start.
   - `SKIPPED_FAILED`: something was locked (for example an old process still running). Nothing moved.
3. History, settings and PnL totals on the dashboard must look the same as before.

## Agent wallet

1. Add `DECIBEL_KEYSTORE_SECRET` (16+ characters, keep a copy safe) to `.env`; restart.
2. Top bar: CONNECT WALLET (next to MAINNET), approve in Petra with the owner wallet.
3. Pick the subaccount marked IN USE and press CONFIRM. The bot creates its key, then Petra asks for the
   authorization (30 days) and, when the bot key has under 0.1 APT, a 0.5 APT gas transfer.
4. The menu then shows "Bot authorized until …". Picking another subaccount and USE THIS SUBACCOUNT saves it
   for the next start (`data/selected_subaccount_v1.json`); restart, then CONFIRM it.
5. The next session signs with the agent (`DECIBEL_EXECUTOR_SIGNER=AGENT` in the log). If the delegation is
   missing or expired, the session does not start; it never falls back to `DECIBEL_PRIVATE_KEY`.
6. After one good session, `DECIBEL_PRIVATE_KEY` can be removed from `.env`.
7. Revoke any time in the wallet menu (REVOKE) or on Decibel.

Losing `DECIBEL_KEYSTORE_SECRET` only loses the agent: revoke it, delete `agent_key_v1.json`, create a new one.

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
