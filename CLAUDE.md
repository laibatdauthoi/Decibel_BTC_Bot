# Claude Code instructions

@AGENTS.md

## Start here

- Read `PROJECT_HANDOVER_2026_11_12.md` for the current state, formulas, risks and history.
  The older handover and `docs/archive/` were removed on 2026-11-17; they remain in git history.
- The user speaks Vietnamese. Reply in Vietnamese; code, commits and docs stay in English.

## Environment

- Windows only. Production runs on the pinned Node `v22.23.2` through
  `npm run decibel:production` (`src/run_decibel_production_bootstrap_v1.mjs`).
- `.env` is configured for **live mainnet trading** with small funds, and the user wants
  live trading kept on. Never read or print credential values. Never change the execution
  mode unless the user asks.
- Never write to `.env`, `config/production_state/`, `data/` (execution journal, session DB)
  or send venue orders without explicit user permission.
- Do not create scratch files in the repo root. Use a temporary directory outside the repo.

## Verification

Run all of these before declaring a change complete:

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

New test files must be added to the explicit list in the `package.json` `test:production-core`
script. CI (`.github/workflows/quality.yml`) runs the same gate on Ubuntu with Node 22.23.2.

## Git

- `main` on GitHub is the published code. Work on a branch, then fast-forward `main` when the
  user asks to publish. Never force-push.

## Open work (agreed with the user)

1. Phase 5: run the bot on a VPS with a domain and HTTPS. The user still has to choose a Windows
   or a Linux VPS; Linux needs the launcher made platform-neutral first.
2. Catastrophe stop (`decibel_catastrophe_stop_v1.ts`, since 2026-11-13): placement is verified
   on mainnet (22 `STOP_SUBMITTED` events, about 2% from the entry, by 2026-11-18). A trigger
   has never fired: the trigger reference price and the Stop Limit fill in a gap stay unobserved.

The 6 `BLOCKED / SESSION_UNWIND_COMPLETION_CONFLICT` sessions of the handover were reviewed on
2026-11-18: they lived in the pre-2026-11-13 session store, which no longer exists. `BLOCKED` is
terminal (not an active status, no ownership held), and the current store has none.
