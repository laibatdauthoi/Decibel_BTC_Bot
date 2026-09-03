# Decibel Production Live Orchestrator V1

This module is a deterministic orchestration boundary around the existing authenticated passive-recycling evaluator, execution intent builder, lifecycle journal, release gate, and production executor contract.

It does not contain signing or transaction construction. Authenticated reads and reconciliation are supplied through `DecibelProductionLiveStateSourceV1`; the external mutator is supplied through `DecibelProductionExecutionExecutorV1`.

The command is disabled by default. It requires production mode, an explicit release stage, the exact executor enable switch, an executor plugin, a state-source plugin, and a lifecycle journal path. Dry-run prepares journal evidence but invokes no external mutation. CANARY inherits the existing one-outcome halt. AUTONOMOUS inherits exact canary-evidence hash validation.

Every cycle recovers nonterminal intents before considering a new decision, reads authenticated state, evaluates the existing strategy, applies `BEHIND_5_TICKS`, re-reads state before intent construction, and uses the existing lifecycle. Unknown executor outcomes remain reconciliation-only and are never retried.

The command adds these bounded loop settings:

- `DECIBEL_PRODUCTION_LIVE_SOURCE_MODULE`
- `DECIBEL_PRODUCTION_LIVE_POLL_INTERVAL_MS`
- `DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS`
- `DECIBEL_PRODUCTION_LIVE_MAX_CONSECUTIVE_READ_FAILURES`
- `DECIBEL_PRODUCTION_LIVE_SHUTDOWN_TIMEOUT_MS`
- `DECIBEL_PRODUCTION_LIVE_MAX_CYCLES`

The built-in source is `src/decibel_production_live_state_source_v1.ts` and exports `createDecibelProductionLiveStateSourceV1()`. It uses authenticated read-only Decibel APIs and never constructs a writer. `DECIBEL_PRODUCTION_LIVE_SOURCE_MODULE` remains an optional injection seam for deterministic tests or a contract-compatible read implementation. The source owns authenticated read parsing and reconciliation only; it must not mutate venue state. Secrets remain confined to existing read/executor infrastructure and must never be logged.

The V2 readiness manifest still states that live canary and autonomous mainnet trading are not validated. This runner does not override that evidence or authorize execution by itself.
