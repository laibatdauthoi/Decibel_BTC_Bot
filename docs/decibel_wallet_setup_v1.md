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
2. Settings > Wallet: Connect Petra with the owner wallet, then Create agent wallet.
3. Send 0.5 APT gas to the agent (Petra transaction).
4. Authorize 30 days (Petra transaction). Delegation shows AUTHORIZED.
5. The next session signs with the agent (`DECIBEL_EXECUTOR_SIGNER=AGENT` in the log). If the delegation is
   missing or expired, the session does not start; it never falls back to `DECIBEL_PRIVATE_KEY`.
6. After one good session, `DECIBEL_PRIVATE_KEY` can be removed from `.env`.
7. Revoke any time in Settings > Wallet or on Decibel.

Losing `DECIBEL_KEYSTORE_SECRET` only loses the agent: revoke it, delete `agent_key_v1.json`, create a new one.

## Dashboard sign-in

`DECIBEL_DASHBOARD_AUTH=wallet` requires a Petra signature for every API route. The session is an HttpOnly,
SameSite=Strict cookie for 7 days. Set `DECIBEL_DASHBOARD_COOKIE_SECURE=true` when served over HTTPS. If Petra
is unavailable, set it back to `off` and restart; Ctrl+C in the terminal still ends a session.

## Not done yet

- Several wallets at once (one runtime process per wallet behind a gateway) and hosting on a domain.
- New wallets start without the legacy activity baseline in `config/production_state/`; that baseline is
  specific to the first wallet and must become optional before a second wallet can run.
