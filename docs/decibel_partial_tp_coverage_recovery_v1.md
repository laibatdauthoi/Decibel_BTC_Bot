# Partial TP Coverage and Evidence Recovery

## Authenticated venue evidence

Authenticated SDK GET requests at 2026-10-28 19:19:24 Bangkok returned one position and one open order. No submission/cancellation API was used. The production execution journal was opened with SQLite mode=ro.

- BTC/USD LONG: 0.00128 BTC, entry price 81143.351563, leverage 40, cross margin.
- The sole open order: SELL, reduce-only true, price 81323, original and remaining quantity 0.00115 BTC.
- Order ID: 170141590376311909331936809890191769600; client ID: d1sd8a98c72e12577f3415f3124562af.
- Confirmed coverage: 0.00115 BTC. Uncovered: 0.00013 BTC (13 lots at 0.00001 BTC per lot). This is a real coverage gap, above the 0.00002 BTC market minimum.

The captured read-only responses are local evidence in data/partial_tp_readonly_venue.json. They are observations at the stated time, not a claim of unchanged future venue state.

## Why the gap arose

Persisted TP intent intent-d8a98c72e12577f3415f3124 was submitted for 0.00115 BTC when authenticated inventory was 0.00115 BTC. Its status is ACKNOWLEDGED. A later BUY intent, intent-eb823ed0a21a8fd3fd6b5251, submitted 0.00013 BTC and is APPLIED. Its venue order ID is 170141601785167310705994189899571396608. The existing TP was therefore correctly sized initially; the later entry increased inventory to 0.00128 without increasing working exit coverage. Pending intentions do not count as confirmed TP coverage.

The planner already has an EXIT_COVERAGE_UPSIZE path. The demonstrated blocker occurs before that path: smart ladder tier-one minimum admission can enlarge the increasing-side reservation while leaving the reducing-side reservation unchanged. Their sum exceeds the existing aggregate cap and throws DECIBEL_SMART_LADDER_COMMITMENT_EXCEEDED. Exact LONG and mirrored SHORT regressions reproduced that exception before the fix.

## Fixes

### Aggregate budget arithmetic

buildDecibelSmartLadderV1 now computes each side's existing budget separately. The increasing side can use only the aggregate budget left after the reducing side's existing reservation. This enforces the existing cap before lot rounding and level generation. The original final commitment assertion remains. No cap, tier-one minimum, allocation fraction, spread, leverage, sizing threshold or TP profitability threshold was increased or removed.

The reducing-side formula is unchanged. If the remaining increasing-side budget cannot fund the existing minimum order, that side produces no quote rather than throwing and preventing exit management.

### Capacity dependency refresh

refreshAccountRiskInputs previously renewed leverage/fee observations only after they were stale. Independently refreshed account/rules data could remain valid while these older dependencies expired, causing readNextSessionCapacityInputs to return null and SESSION_CAPACITY_EVIDENCE_REQUIRED. It now uses the existing half-TTL refresh timing already used for margin rules, through the same singleflight owner.

A transient refresh failure retains prior settings only with their original timestamps; normal consumption still enforces the unchanged TTL. After actual expiry, evidence is unavailable and blocks execution. Successful subsequent reads replace it and restore capacity publication. Background stages retain their existing source-owned deadline/shutdown lifetime; required refreshes remain linked to their parent cancellation signal.

This fixes a demonstrated avoidable evidence gap, not every network delay. The captured runtime had authenticated state age 7421 ms, beyond its freshness window, so that observation was genuinely stale. Missing fresh account/rule/fee evidence must continue to block TP replacement; zero entry allocation is not permission to bypass those controls.

## Legitimate entry restrictions

Captured session margin use was 4.92644265 USD, above its 4 USD aggregate entry allocation (8 USD Capital times the existing 0.5 fraction), giving strategyAllocationRemainingUsd=0. Coverage calculation also pauses new entries while 0.00013 BTC remains uncovered. These are legitimate no-new-entry conditions. The patch does not increase allocation or permit additional entry orders.

A reduce-only exit still requires fresh authenticated position/order/account data, the existing order limit, exact ownership, lot alignment and positive TP economics. Current captured missing-capacity projections show zero reduction/order bounds; the patch does not fabricate a fresh ceiling from that state or execute an order using stale evidence.

## Recovery replay

The deterministic replay uses LONG 0.00128, existing reduce-only TP 0.00115 at 81323, zero entry allocation and the observed entry basis. With complete fresh evidence and the recorded session scenario ceiling 116.556912 USD supplied explicitly to the test, the planner reaches EXIT_COVERAGE_UPSIZE for a same-price total quantity 0.00128. This ceiling is a replay input, not a newly asserted current venue limit or a production configuration change.

The same-price coverage review passes existing profit checks for the observed basis. A loss-making basis still returns KEEP:COVERAGE_TP_PROFIT_NOT_PROVEN. Stale account evidence blocks replacement and triggers persistent evidence STOP. Fresh publication clears the persistent evidence accumulator; ordinary WAIT remains possible for independent quote economics. Explicit repair preflight is executable with the required fresh evidence. Missing/zero execution bounds remain fail-closed.

A pending cancellation blocks another coverage action. The existing intent remains ACKNOWLEDGED throughout planning. Only a simulated freshly authenticated 0.00128 working TP changes confirmed coverage to complete; no intent alone does so. A partial TP fill that decreases position and remaining order together preserves the 0.00013 gap. Mutation count in the replay is zero.

## Files and functions

- src/decibel_smart_ladder_v1.ts: buildDecibelSmartLadderV1 and local getSideBudget.
- src/decibel_production_live_state_source_v1.ts: refreshAccountRiskInputs.
- tests/decibel_quote_engine_v1.test.ts: exact aggregate-commitment failure regression and mirrored SHORT.
- tests/decibel_production_live_orchestrator_v1.test.ts: partial coverage, zero allocation, ownership, pending cancel, profit, STOP/WAIT recovery, partial fills, dependency refresh failure/expiry/recovery.

## Verification and deployment

Quote-engine suite: 32 passed. Focused coverage and dependency recovery tests: 3 passed. Full npm test production-core stage: 810 passed, 2 failed due to Chrome headless GPU/access startup errors in existing presentation tests. The chained authoritative reconciliation and HTTP recovery suites were run separately: 17 passed. Typecheck and build pass. Changed-file formatting and lint pass. Required repository format/lint checks remain blocked by existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts files, which were preserved.

Implemented locally on the existing non-main branch. Not committed or deployed. No production journal, settings, live orders or running process were mutated. The observed live coverage gap has not been repaired by this task; production convergence is not claimed.
