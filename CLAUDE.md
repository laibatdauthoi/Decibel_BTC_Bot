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

New test files must be added to the explicit list in the `package.json` `test` script.

## Open work (agreed with the user)

1. Run the full verification above on Windows. The 2026-11-12 changes (settings Max Loss
   warning, `decibel_capacity_policy_v1.ts` extraction) were typechecked and linted, but the
   tests have not run yet.
2. Implement the wide venue-side catastrophe stop described in `AGENTS.md`. First verify
   whether the Decibel SDK/venue supports a resting reduce-only stop alongside the TP, and how
   it interacts with exclusivity, TP coverage and reconciliation. Propose the design before coding.
3. Review the 6 sessions persisted as `BLOCKED / SESSION_UNWIND_COMPLETION_CONFLICT`.
4. Push the branch `chore/production-cleanup-v1` to the remote (no upstream is set yet).
