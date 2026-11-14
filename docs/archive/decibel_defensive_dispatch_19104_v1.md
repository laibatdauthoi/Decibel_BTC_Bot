# Defensive Exit Dispatch — PID 19104

## Evidence and limits

The supplied incident reports LONG 0.00128 BTC, basis 81170.170313,
SELL reduce-only TP 0.00128 at 81296.4, market near 79700, and canonical
`RISK_REDUCTION`. A read-only local dashboard observation during this work
also reported LONG 0.00128, that same TP, `RISK_REDUCTION`, and HOLD.
This is runtime telemetry, not an independent new venue query. A later
dashboard request was refused; no attempt was made to restart it.
The exact historical sequence of upstream HTTP responses and the original
canonical trigger cannot be reconstructed from those observations alone.

## Demonstrated dispatch defects

`coordinateDecibelInventoryExitV1` marks an existing `RISK_REDUCTION`
evaluation as `DEFENSIVE_EXIT_ELIGIBLE=true`, reason
`CANONICAL_RISK_REDUCTION`, final decision `DEFENSIVE_EXIT`.
`coordinateInventoryExit` does not manufacture eligibility; it preserves
the canonical evaluation. The strategy already builds an opposite-side
reduce-only maker plan for this operating state.

However, `evaluateDecibelAuthenticatedPassiveRecyclingV1` intercepted a
verified resting reduce-only exit before diffing the desired risk-reduction
plan. Both TP KEEP branches excluded `SESSION_UNWIND` but included
`RISK_REDUCTION`. Complete quantity coverage therefore selected
`KEEP:VALID_REDUCE_ONLY_EXIT` regardless of the canonical reduction price.
`selectMutation` discards NO_OP actions, producing HOLD.

Simply removing that interception was insufficient: replacement selection
then applied TP profitability/hysteresis to the risk-reduction replacement.
Using generic candidate preflight instead also applied entry spread economics
(`SPREAD_EDGE_INSUFFICIENT`) to the canonical reduction. The corrected path
uses the existing canonical evaluation in the normal executable-evidence
decision, with the old TP hypothetically removed for replacement admission.
Actual removal still requires cancellation and authoritative reconciliation.

## Changes

- `src/decibel_authenticated_passive_recycling_orchestrator_v1.ts`,
  `evaluateDecibelAuthenticatedPassiveRecyclingV1`: TP KEEP interception
  applies outside reduction mode. Canonical risk-reduction replacements are
  explicitly identified. Pending cancellation or pending exit quantity blocks
  another defensive mutation.
- `src/decibel_production_live_orchestrator_v1.ts`,
  `evaluateDecibelReplacementDecisionV1`, `selectMutation`,
  `evaluateOnceInternal`, and result construction: carry the existing canonical
  evaluation through selection, commit revalidation, and diagnostics. Use its
  executable reduction admission rather than TP/entry profitability admission.
  Reuse strategic cancel/replace ownership. Abort a frozen defensive plan if
  canonical risk reduction is no longer required after cancellation.
- `tests/decibel_production_live_orchestrator_v1.test.ts`: ten new deterministic
  LONG/SHORT cases, using temporary journals and a fake executor only.

Canonical triggers, loss budget, Max Loss, TP economics, DCA, quote sizing,
leverage, exposure limits, Settings, and freshness requirements are unchanged.
The existing canonical reduction remains a passive maker plan; this patch does
not introduce a market stop-loss or guarantee a fill.

## Before / after replay and ownership

LONG uses the supplied .00128 quantity, TP 81296.4 and basis 81170.170313;
SHORT is the symmetric BUY reduction. Entry notional allocation is zero in
both. Before: canonical reduction plus valid TP becomes NO_OP/KEEP and HOLD.
After: cancel exact owned TP, reconcile cancellation, then one reduce-only
replacement at the existing canonical reduction plan price.

No age, price-distance, loss-budget, or profitability threshold was changed.
Zero entry headroom does not block an executable reduction; no additional
headroom defect was demonstrated and no headroom rule was changed.

The new regressions exercise:

- Both signs: full TP coverage cannot suppress authorized reduction.
- Both signs: no canonical authorization retains TP KEEP; pending cancellation
  blocks; stale authenticated/market evidence cannot authorize replacement.
- Partial TP fill during cancellation: inventory falls to .00115. The old
  frozen .00128 plan aborts, fresh planning submits only .00115. An HTTP 500
  in LONG and worker timeout in SHORT defer placement until recovery.
- Both signs: replacement submission outcome unknown retains nonterminal
  ownership; additional cycles make no duplicate submission.
- Both signs: withdrawing canonical authorization after cancellation discards
  the frozen defensive replacement.

Existing lifecycle regressions additionally cover unknown cancellation,
partial fills, timeout reconciliation, and recovery without blind submission
retry. Existing same-price DCA coverage-repair regressions remain intact.

## Verification

- New defensive cases: 10 passed.
- Final targeted run: 376 passed across the live orchestrator, authoritative
  order reconciliation, HTTP recovery, and execution lifecycle recovery suites.
- Production typecheck and build: passed.
- Changed TypeScript files: Prettier and ESLint passed.
- Full `npm test` invocation: 827 passed, 2 failed in Chromium presentation
  tests because the GPU subprocess is unusable/access is denied. Its `&&`
  continuation was therefore run separately in the targeted regression suite.
- Global `format:check`: blocked by existing `.tmp_conflict_readonly.cjs`.
- Global `lint`: existing project-service parsing failures in
  `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`.
- An additional all-files `tsc -p tsconfig.json --noEmit` also reports existing
  test/dashboard type errors; the required production typecheck passes.

## Deployment

Local source and tests only. No mainnet order placement/cancellation, process
restart, or production journal mutation. Not deployed or live verified.
