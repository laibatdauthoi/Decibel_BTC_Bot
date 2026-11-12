# DCA Fill to Same-Price TP Quantity Recovery

## Read-only incident timeline

Production execution records were inspected with SQLite mode=ro. No production journal API capable of mutation was used.

| Bangkok time, 2026-10-28 | Evidence |
| --- | --- |
| Before TP placement | Initial authenticated BUY fill: 0.00071 BTC at 80598.4. |
| 20:04:06.480 | PLACE reduce-only SELL 0.00071 at 80661.5. Intent intent-d57b830e494f1b7401dd1b6c; order 170141604320468510752608799712549535744. |
| 20:04:46.536 | Additional BUY intent intent-24c7074b8552e6630175d796 submits 0.00018 at 80565.2. Venue order 170141591643962506505101216688642195456. |
| 20:20:11.839 | Authenticated maker fill for all 0.00018 BTC, trade ID 129213217313369347028932750737414, transaction version 7800675190. Persisted DCA intent is APPLIED. |
| 20:20:12.051 | Cycle 334615 first observes LONG 0.00089. Existing TP remains 0.00071. |
| 20:22:51.959 | Cycle 334700 has fresh account/capacity evidence and plans WOULD_REPLACE at the unchanged 80661.5 price. Final reason is KEEP:COVERAGE_TP_PROFIT_NOT_PROVEN. |
| 20:24:41.136 | Cycle 334760 still has the same blocker and coverage gap, over 4 minutes after the DCA fill. |

The original TP was initially correctly sized; the additional entry filled much later. Its new position was detected promptly. The stalled update is therefore not caused solely by a missing DCA fill or stale account data.

The current dashboard snapshot inspected during this task reports FLAT with no open orders and no active execution session. The journal already contains a later SESSION_UNWIND cancellation for the TP and marks it CANCELLED_EXTERNALLY. Those changes were not performed by this task. The incident replay uses the earlier persisted evidence.

## Exact blocker and code fix

`evaluateDecibelReplacementDecisionV1` recognized EXIT_COVERAGE_UPSIZE with zero price drift, but then called assessDecibelExitEconomicsV1 and required positive estimated net exit PnL. That is a price-selection profitability decision applied to a quantity-only coverage transition. The persisted cycles show this gate rejecting the planned update even with fresh capacity data. The planner had already selected the correct total reducing quantity, 0.00089 BTC, at the existing price.

The same-price branch now proceeds to the existing executable-evidence preflight without that PnL test. It still requires a verified reduce-only exit in the correct direction, increased quantity no greater than the authenticated position, aligned price ticks, and normal account/market/risk eligibility. Marketable TP orders still wait for reconciliation. The change does not authorize a price change or an overlapping extra reducing order.

A second gate in evaluateOnceInternal rejected the replacement PLACE because the durable journal treats an earlier EXIT_COVERAGE_UPSIZE cancellation as a TP replacement. This guard remains for historical/restarted and price-changing placements. Its narrow exception now requires the existing committed frozen EXIT_COVERAGE_UPSIZE action and an intent price equal to the frozen resting price in integer ticks. Normal cancel reconciliation, side ownership, no-flip preflight, freshness, venue bounds and quantity validation remain in force.

`evaluateDecibelTPPriceSuitabilityV1`, profitability formulas, reprice age/drift/sustained-improvement rules, and the journal schema are unchanged. A changed-price candidate remains subject to the existing positive-PnL rule, including when mislabeled as EXIT_COVERAGE_UPSIZE.

## Regression replay

The LONG replay uses 0.00071 at 80661.5, position 0.00089, the two authenticated fill prices, reconstructed weighted entry basis 80591.68539325842, and recorded economic inputs. The SHORT replay mirrors prices and direction and uses a BUY reduce-only TP. Both run through the real orchestrator with temporary journals and mocked venue transport/executor.

- A transient HTTP 500 before the first read produces no mutation. Recovery selects coverage repair.
- The old TP is canceled once. Another HTTP 500 after cancellation delays reconciliation; no duplicate cancellation or speculative replacement is submitted.
- Fresh authoritative cancellation evidence terminalizes the old TP before the fake executor receives the replacement PLACE.
- The replacement retains the exact TP price, is reduce-only, and uses total quantity 0.00089. One non-terminal PLACE owner remains.
- A late DCA fill between the initial plan and commit updates the required quantity to 0.00102.
- A partial TP fill between plan and commit changes position to 0.00079 and the old remaining order to 0.00061; replacement uses 0.00079, not the obsolete 0.00089 plan or original submitted quantity.
- Repeated authenticated increases and partial residuals are re-evaluated. Fully covered inventory produces no additional repair.
- Pending cancellation blocks another action; pending intents do not count as confirmed coverage.
- Stale evidence blocks repair. Changed-price loss-making candidates remain KEEP:TP_NET_PROFIT_NOT_PROVEN.

This task does not modify the existing conservative behavior if inventory changes after cancel commit: the frozen plan is invalidated and requires fresh planning. It does not claim to restore in-memory frozen state across a restart; historical replacement profit protection remains intact.

## Files and functions changed

- src/decibel_production_live_orchestrator_v1.ts: evaluateDecibelReplacementDecisionV1 removes the price-PnL gate from unchanged-price quantity repair; evaluateOnceInternal recognizes only the committed frozen same-price coverage replacement at its post-cancel placement gate.
- tests/decibel_production_live_orchestrator_v1.test.ts: LONG/SHORT cancel/reconcile/place replays, transient failures, late DCA fills, partial TP fills, repeated quantity updates, stale and pending-cancel gates, and unchanged price-profit regression coverage. Earlier tests expecting the erroneous same-price coverage-PnL rejection were updated to the requested behavior.

No DCA entry, position-sizing, leverage, Max Loss, Settings, volume target or strategy threshold was changed. No AI calls are introduced into trading decisions.

## Verification and deployment

Focused final replay/price-rule run: 11 passed. Authoritative reconciliation and HTTP recovery suites: 17 passed. Full npm test production-core run: 814 passed, two existing Chrome presentation tests failed because headless Chrome could not start in this environment. Four additional late-DCA/partial-fill parameter cases were added afterward and pass in the focused run. Typecheck and build pass. Changed-file formatting and lint pass. Required repository format/lint checks remain blocked by pre-existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts files, which were preserved.

Implemented locally on the existing non-main branch. Not committed or deployed. No mainnet orders were submitted/canceled, no live process was restarted, and no production journal or Settings were mutated. Test mutations occurred only through mocked executors and temporary test journals.
