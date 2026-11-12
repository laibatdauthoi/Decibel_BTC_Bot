# Economic startup recovery

## Proven cause and comparison limits

The observed 0/30, 1/30, 2/30 counts are matured, non-overlapping 30-second
markouts, not websocket messages or fills. The unchanged estimator needs 30
such samples: at least 900 seconds of qualifying changed-price observations.
Sparse observations and regime changes can extend that time. GLOBAL fallback
already permits sufficient global evidence when the current regime is sparse.
A 75-second audit interval cannot create 30 independent 30-second samples.

The proven startup defect is classification and recovery scheduling: the refresh
labels expected insufficient evidence CANDIDATE_INVALID, and the web startup
counts it as a failed refresh with exponential backoff. It is finite warmup,
not an order/fill sample dependency. It was recoverable before this correction,
but its diagnostic incorrectly described missing maturity as invalid evidence.

The incident ID 767cc24bca34c50f is a source-content fingerprint, not a Git commit.
The economic refresh and web startup sources are untracked in the supplied tree
and absent from HEAD. No archived last-known-working source build was identified;
a version-to-version regression attribution cannot be established from this tree.
No strategy changes from earlier tasks were reverted or reintroduced here.

## Startup path and independence

Web startup hydrates the canonical raw BBO store and derived economic components,
then resolveDecibelProductionEconomicColdStartV1 applies LKG schema, component TTL
and provenance validation. Components retain their own timestamps. Lifecycle cost
is READY only when fee, gas, APT/USD and adverse evidence are all READY. Full
snapshot validation remains required before publication to the supervisor.

The supervisor schedules market-data refresh independently of execution. Its
refreshMarketDataComponents reads public market state and appends DECIBEL_WS_BBO
observations. There is no order/fill prerequisite; the periodic adverse job
hydrates canonical evidence without opening a second websocket collector. Once
30 qualifying samples mature, hydration publishes the estimate, the scheduled
refresh validates it, synchronizeEconomicSnapshot publishes it, and runtime
cycles recompute economic readiness without a restart or UI resume.

A read-only local inspection during this task found 85 fresh raw rows and 13
matured GLOBAL samples while economic readiness was unavailable. The existing
canonical economic snapshot failed validation with ADVERSE_SELECTION_EVIDENCE_STALE.
It was not promoted or rewritten. These are point-in-time observations, not a
claim of successful mainnet activation or completed production warmup.

## Targeted change

A typed recoverable WARMING result now carries actual sample progress and uses
the existing longest markout horizon (30 seconds) for retry. The web scheduler
logs WARMING separately, without increasing adverse/lifecycle failure counters;
the bootstrap result distinguishes WARMING from FAIL. Other published components
remain available. Malformed present adverse fields and other validation errors
remain failures. Sample thresholds, estimators, TTLs, provenance, snapshot
validation and trading gates are unchanged. No evidence values are synthesized
by the production fix.

## Actual order impact

The existing orchestrator economicWarming gate returns HOLD before normal
mutation selection. Thus it holds normal strategy PLACE/CANCEL, including DCA,
ordinary TP maintenance and ordinary risk-reduction mutation selection. It is
not merely a profitability veto on entries. Explicit cancel-all and canonical
session unwind bypass this particular gate; Max Loss uses the existing unwind
path. Those actions still require their ordinary market/account, risk, venue,
reconciliation and execution checks. No exception was added by this fix.

## Offline regression coverage

Six deterministic replays cover empty cold start, insufficient counts 0/1/2/29,
recovery at 30, warm restart from verified raw evidence, fresh verified LKG reuse
when refresh fails, stale LKG rejection, and malformed evidence. The observations
are isolated test fixtures in temporary stores, never production data. Existing
strategy and lifecycle tests retain DCA, TP, sizing, reduce-only, Max Loss,
coverage, duplicate-order and reconciliation checks.

Only economic refresh, web startup scheduling, regression tests and this document
were edited for this task. No mainnet PLACE/CANCEL, active-session restart,
production journal mutation or Settings changes were performed.

Verification: six new startup replays pass; production-core has 781 passing tests
and two Chrome presentation failures caused by GPU/access errors in this environment.
The 11 authoritative reconciliation tests pass separately. Typecheck, build and
focused ESLint/Prettier pass. Repository-wide formatting remains blocked by the
pre-existing .tmp_conflict_readonly.cjs; repository-wide lint is blocked by that
file and .tmp_exact_evidence.ts being outside the TypeScript project. Neither
temporary file was changed or excluded by this task.
