# BTC Entry Risk Admission Audit

Date: 2026-11-10. Source build: `a3730309aefb2fce`.

## RISK_CAPACITY_FORMULA

Production path inspected:

1. `run_decibel_production_web_v1.ts` uses the saved session configuration and current session accounting to call `deriveDecibelSessionTradingLimitsV1` in `decibel_operator_settings_v1.ts`.
2. `decibel_entry_size_v1.ts` prefers `max(10, Target Volume / 20)` USD for fixed targets. It raises quantity to venue minimum, caps by executable capacity and floors to the venue lot. Max Loss is not an input to this function.
3. `decibel_risk_capacity_v1.ts` calculates margin and stress capacity independently. Sizing policy V1 excludes STRESS_LOSS from the executable sizing caps, but retains the stress capacity for admission.
4. The web runtime copies that capacity and its diagnostics into `sessionConfiguration.exposureLimits`. `evaluateTradingDecision` checks ENTRY and DCA against it; the orchestrator repeats this check on the final proposed PLACE before execution.

Let all monetary terms below be USD:

```text
lossBps = adverseMoveBps + entryFeeBps + exitFeeBps
          + exitSlippageBps + adverseSelectionBps
lossRemaining = max(0, MaxLoss + min(0, netSessionPnlAfterFees)
                       - sessionGasPaid - fixedExitCost)
riskCapacity = lossRemaining / (lossBps / 10000)

allocatedCollateral = min(Capital * collateralFraction,
                          authenticatedFreeMargin + evidenceReservedCollateral)
marginCapacity = max(0, allocatedCollateral - collateralReserve
                        - liquidationReserve - marginTransactionReserve)
                 / (max(1 / leverage, evidenceInitialMarginRate)
                    + (entryFeeBps + exitFeeBps + exitSlippageBps) / 10000)
```

For observed-input sizing V1, marginTransactionReserve is the first applied transaction-cost observation, or zero. The fixed stress reserve remains independent. The observed-input path sets evidenceReservedCollateral to zero: it does not credit estimated reservations back to authenticated free margin. This can be conservative with existing exposure; it is not evidence that more collateral is available.

Exposure uses BTC quantities, multiplied by USD/BTC. The capacity calculator includes open and inflight opening orders, excludes verified position-bounded reduce-only reductions, and uses the worse of `abs(position + pendingBuys)` and `abs(position - pendingSells)`. Opposite orders are not netted away. Headroom subtracts this exposure once.

Final admission projects `abs(position + sideSign * (sameSidePending + candidateQuantity)) * candidatePrice`. For an explicit candidate, all same-side open orders remain reserved; quote reevaluation excludes the same-side order being replaced. Unresolved submissions are separately blocked by `EXECUTION_RECONCILIATION_REQUIRED`; execution lifecycle duplicate/finality checks remain in force. The final admission formula does not itself enumerate inflight intents. It also does not recompute an opposite-side pending subset; the aggregate capacity/headroom and lifecycle gates are separate protections.

## STRESS_LOSS_ASSUMPTIONS_AND_SOURCES

The observed production path constructs policy estimates even when an empirical certificate is supplied alongside observations. Policy constants in `DECIBEL_CAPACITY_POLICY_V1` are:

- Exit horizon: 30,000 ms, labeled `POLICY_ESTIMATE_NOT_CERTIFICATE`.
- Adverse move: `max(100 bps, 2 * recent midpoint range bps)`, source `POLICY_FLOOR_AND_RECENT_RANGE`. Range is `(max - min) / min` across midpoint history and the current book midpoint.
- Entry fee: max(10 bps, accepted fresh authenticated maker-fee observations).
- Exit fee: max(10 bps, accepted fresh authenticated taker-fee observations).
- Adverse selection: max(8 bps, accepted fresh observations).
- Exit slippage: 25 bps. Exit depth is bounded by both book sides within that band.
- Fixed exit cost: max(5% of Max Loss, accepted fresh transaction-cost observations).
- Collateral reserve: 10% of the smaller of allocated capital and authenticated free margin.

These floors and multipliers are policy choices. Source comments record prior approval, but this audit has not independently established their empirical calibration or an enforceable worst-case guarantee. Current fee observations below 10 bps do not lower the fee floor. A maker entry is paired with a modeled taker exit, not a promised maker TP fill.

The alternative certificate path in `decibel_capacity_producers_v1.ts` uses measured stress, depth, authenticated fees, post-order margin and lifecycle gas. Its actual stress source is propagated. No historical certificate or live operand snapshot was reconstructed here.

## EXACT_BINDING_RISK_RULE

`RISK_BLOCKED:SESSION_PROJECTED_STRESS_LOSS`:
`projectedExposureUsd > riskCapacityUsd + 1e-9`.

Missing capacity is `SESSION_RISK_CAPACITY_MISSING`; nonfinite/negative capacity or nonfinite projected exposure is `SESSION_RISK_OPERAND_INVALID`. Other risk/readiness/DCA blockers retain their own rule identifiers.

## REPRODUCED_NUMERIC_CASE

This is a deterministic fixture, not a recovered historical account snapshot. Inputs: Target Volume $300, Capital $5, Max Loss $0.20, authenticated free margin $5.437, leverage 40, collateral fraction 0.5, flat position, no pending orders, net PnL zero. Fixture book $79,999/$80,001, midpoint $80,000, constant midpoint history; lot 0.00001 BTC, minimum 0.00002 BTC, no additional minimum notional, fresh evidence and ample depth. Safety ceiling is $160 and does not bind.

| Requested field | Value and unit |
| --- | --- |
| preferredEntrySizeUsd | $15 USD notional |
| actualCandidateNotionalUsd | $14.40 USD at the fixture midpoint after lot flooring |
| minimumExecutableNotionalUsd | $1.60 USD at the fixture midpoint |
| marginSupportedNotionalUsd | $76.27118644 USD before aggregate lot flooring |
| riskCapacityUsd | $12.41830065 USD notional |
| projectedExposureUsd | $14.40 USD notional, flat and no pending orders |
| remainingLossBudgetUsd | $0.19 USD after the $0.01 future exit reserve; $0.20 before it |
| stressMoveFraction | 0.01, dimensionless price movement fraction |
| projectedStressLossUsd | $0.23032 USD including the fixed future exit reserve |
| estimatedTradingFeesUsd | $0.0288 USD, two modeled 10 bps legs |
| riskCapacityBindingConstraint | STRESS_LOSS for admission; MARGIN for executable sizing |
| finalAdmissionDecision | REJECT: SESSION_PROJECTED_STRESS_LOSS |

Independent arithmetic: `(2.5 - 0.25) / (0.025 + 0.0045) = 76.27118644`; `(0.20 - 0.01) / 0.0153 = 12.41830065`; `14.4 * 0.0153 + 0.01 = 0.23032`. Exactly $15 consumes `$0.15 + $0.03 + $0.0375 + $0.012 + $0.01 = $0.2395`. The midpoint fixture isolates economics; final production projection uses the actual candidate price.

## ECONOMIC_CORRECTNESS_ASSESSMENT

The stress rejection is dimensionally and arithmetically correct under these assumptions. Leverage divides initial margin, not price-loss sensitivity of a given notional. USD divided by a loss fraction gives USD notional. The independent stress limit explains why ~$76 of margin capacity does not imply admission of a $15 entry.

Session PnL in `decibel_operator_settings_v1.ts` includes realized PnL, mark-to-market unrealized PnL and fill fees. Net losses reduce the budget once; positive PnL does not enlarge it. Observed-input sessionGasPaid is zero, while the certificate path supplies separately measured gas. Historical gas completeness is not established by this audit.

The model charges both future fee legs on aggregate projected exposure, even for already-open inventory whose entry fee is already in net PnL. That is a conservative additional reserve, not an exact incremental cash-flow forecast. Likewise the same collateral can be constrained by both margin and stress reserves: these are separate feasibility constraints, not two loss debits. No reserve or fee floor was removed to manufacture admission. No proven historical erroneous rejection was established.

LONG/SHORT share the same loss rate, adverse magnitude and symmetric book-depth bound. Liquidation evidence must be on the adverse side of the position. Lot flooring can change the candidate but does not silently resize it to the Max Loss ceiling.

Legacy `deriveDecibelMaximumPositionUsdV1` still contains `MaxLoss * leverage` for old compatibility paths. The current sizing V1 / target-semantics V2 path bypasses that calculation. Current capital-allocation, venue-tier, exit-depth and non-strategy safety ceilings remain intentional constraints.

## DEFECTS_FOUND

- Final stress admission omitted an explicit finite check on projected exposure. A NaN comparison does not reject by itself. Earlier validation may also stop malformed data, but this gate now fails closed independently.
- Missing and invalid capacity shared the generic stress-loss rule, obscuring the rejecting operand.
- Existing structured diagnostics omitted the separate stress assumption/source, modeled fees and evidence validity. Final runtime blockers remained generic and identical rejections were logged each cycle.

## FIXES_IMPLEMENTED

- Reject nonfinite projection and negative/nonfinite capacity; distinguish missing evidence.
- Carry stress fraction/source, fee legs and evidence validity in the capacity loss model for both evidence paths.
- Emit exact blocker code, net remaining budget, projected loss including fixed reserve, modeled fees, missing model/capacity evidence and stress freshness. Preserve legacy detailed decision reasons for compatibility.
- Surface the specific code in the final orchestrator blocker and suppress unchanged diagnostic records, ignoring advancing timestamps/ages and rounding signature operands to six significant digits. Reset suppression after successful final admission.
- No sizing formula, stress rate, Max Loss, leverage, TP, DCA, execution or accounting policy was changed.

## MAX_LOSS_INDEPENDENCE_VERIFICATION

Tests preserve $300 -> $15 preferred size and identical executable size across different Max Loss values, while admission capacity changes. No risk-derived smaller entry is substituted. Canonical session Max Loss termination remains unchanged.

## ENTRY_ADMISSION_BEFORE_AFTER

The $14.40 fixture and exact $15 proposal are rejected both before and after. Sufficient-budget fixtures continue to pass. Invalid or absent risk operands now identify their actual rule. A valid rejection is explained, not bypassed.

## FILES_CHANGED

Only this task's edits:

- `src/decibel_risk_capacity_v1.ts`: diagnostic loss-model evidence.
- `src/decibel_trading_decision_v1.ts`: fail-closed operands and structured diagnostics.
- `src/decibel_production_live_orchestrator_v1.ts`: exact final blocker and diagnostic deduplication.
- `tests/decibel_entry_size_v1.test.ts`: independent reference arithmetic, losses/leverage and pending/position symmetry.
- `tests/decibel_production_live_orchestrator_v1.test.ts`: invalid operands and economic diagnostic assertions for BUY/SELL.
- This report.

The branch was already `chore/production-cleanup-v1` with extensive uncommitted work. No commit, live operation, START/STOP, settings change or production journal modification was performed.

## TEST_RESULTS

- Focused entry sizing, practical capacity and orchestrator suites: 577 passed. After final edits, targeted rerun: 44 passed, 533 skipped. Enriched BUY/SELL diagnostic tests: 2 passed.
- Separate authoritative reconciliation, HTTP recovery and session/START suites: 86 passed.
- `npm test`: 1,356 passed, 3 failed in production-core. The chained reconciliation stage did not execute because core returned failure; it was run separately above.
- The three unrelated Chromium failures: status color and Settings spacing GPU startup failures; overview PNG export timeout (20 seconds). No Chromium workarounds or test suppression applied.
- `npm run typecheck`, `npm run build`, `npm run build:web-dashboard`: passed.
- `npm run format:check`: failed on pre-existing `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`, and two existing JSON fixtures (`entry_cost_19884_v1.json`, `entry_simplification_36080_v1.json`). Changed files were formatted separately.
- `npm run lint`: failed on existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts` outside the TypeScript project service. Changed-file lint passed.
- PowerShell blocks the npm/npx `.ps1` launchers; commands used their `.cmd` equivalents without changing execution policy.

Existing regression suites exercise DCA, Max Loss, reduce-only TP, execution finality, maker policy, account freshness, margin/venue boundaries and START/UI reconciliation. No live replay or order-churn measurement was performed; no PLACE/CANCEL policy was edited.

## BUILD_FINGERPRINT

`a3730309aefb2fce`, calculated with the repository source fingerprint function (138 covered files). This identifies the full current working source, including pre-existing changes; it is not evidence of deployment.

## REMAINING_BLOCKERS

The fixture entry exceeds the existing stress budget. Repository-wide formatting/lint and the three Chromium checks remain red for the reasons above. No risk limits were increased.

## UNVERIFIED

Historical production operands for `feabe4529820bf80`, current saved/live account configuration, empirical adequacy of the 30-second stress policy, actual venue fees/gas for that historical session, runtime deployment, and live order behavior were not verified. This report deliberately uses labeled fixture inputs and makes no claim that the historical rejection was incorrect. The worst-case modeled loss is an estimate, not a market-loss guarantee.
