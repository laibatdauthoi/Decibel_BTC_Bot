# Patient TP / Adverse Progress Repair

**ROOT_CAUSE:** Source confirms `assessDecibelAdaptiveTPV1` used RMS of adjacent midpoint changes, while `constructDecibelAdaptiveTPPriceV1` returned best maker directly. `evaluateDecibelTPPriceSuitabilityV1` then allowed CANCEL for price improvement beyond that short-update band. No consumed adverse-price anchor was persisted. Consequently, an existing TP could lose queue priority again during the same displacement. The historical PID 36848 fixture records prices/costs, but not its original volatility window, full fill sequence or session budget; those omissions are not evidence of a measured production cancel frequency.

**OLD_TP_TRIGGER:** `adverse > max(tick, spread, RMS Δmid)` and negative conditional payoff at best maker. Candidate = best maker; comparison to the last TP price replaced a true position-progress checkpoint. Existing finality/reconciliation controls were present and remain in use.

**NEW_SIGNIFICANT_ADVERSE_TRIGGER:** Use the existing 60s book history with timestamps. Require a continuous observed span covering the existing 30s modeled exit horizon, no gaps exceeding the existing market-freshness allowance, and a recent final observation. Exclude the current evaluation book from its preceding regime. Missing, sparse, stale or zero-range evidence means KEEP strategic TP; missing coverage can still be repaired, and hard risk remains independent. This is evidence coverage, not an order age, cooldown or delay after repricing.

In tick units, let:

- `R` = full observed midpoint range in that preceding window.
- `C` = authenticated basis-to-original-resting-TP recovery distance, retained in the position checkpoint.
- `S` = current spread; `G = ceil(R/tick) + round(C/tick) + S` (at least one tick).
- `D0` = adverse movement from authenticated basis; `Dn` = adverse movement from the last consumed market anchor, or basis for the first step. Both are directional: rising prices for SHORT, falling prices for LONG.

Require `D0 > G` and enough **new** adverse excess to produce a meaningful partial step. A quiet short tape cannot alone turn a few ticks into a reason to abandon the position's original recovery objective. The formula uses measured price geometry, not Max Loss as its starting trigger, a gas hurdle, a fitted multiplier, a percentile or a fabricated adverse-cost floor. These are explicit policy choices, not a claim of optimal calibration.

**FIRST_VS_SUBSEQUENT_REPRICE:** First step uses authenticated basis. Subsequent steps use the last authorized market anchor and require a new adverse excursion. The CANCEL intent durably stores opening-fill epoch key, anchor, target, previous TP, residual quantity, evidence timestamp, recovery corridor and trigger band. It is written by the existing prepare-before-submit lifecycle. Restart/reconciliation read this intent; they do not reset the anchor. The epoch key uses network/account/market/authenticated opening fill, not transient session ID or quantity. Reductions preserve it; flat/flip/new opening fills retire it. This witness does not prove order finality and never bypasses the existing duplicate/finality controls.

**PARTIAL_TP_STEP_RULE:** In ticks, `step = min(Dn - G, distance(TP, maker) - G)`. Require a step larger than tick/spread noise and at least the smaller of the observed normal excursion and original recovery corridor (use the excursion when that corridor is zero). Move SHORT BUY TP upward or LONG SELL TP downward by that step. Retain at least `G` of recovery distance from maker. If the full step exceeds the remaining session loss budget, search only this bounded, meaningful partial-step interval for the largest valid tick-aligned candidate. No meaningful budget-safe step means KEEP. A committed cancellation retains its exact approved target through repair; it cannot be silently recalculated toward a new BBO. Recovery does not reverse-reprice an existing valid TP.

**PID_36848_BEFORE_AFTER:**

| Evidence / assumption | New result |
| --- | --- |
| Recorded basis 75713.4, SHORT 0.00047, TP 75681.4, BBO 75780.2 / 75780.3; no original regime supplied | KEEP TP 75681.4 when regime evidence is unavailable |
| Same numeric facts, aggregate authenticated fill reconstruction, explicit **synthetic** 35s regime with range 4, fixture Max Loss 2 | `C=32`, `G=36.1`, adverse 66.8; partial step 30.7 → TP **75712.1** |
| Distance after that reconstructed step | **68.1** below best maker; old policy joined 75780.2 |
| Projected full-position/session closing payoff, with recorded costs and reconstructed accounting | approximately **−0.014403 USD**, versus old maker candidate approximately **−0.046418 USD** |
| Sensitivity: synthetic regime range 28 instead of 4 | KEEP; the 6.7 excess is smaller than the required meaningful step |

The regime range and fixture loss budget are not historical PID observations. Neither candidate is asserted optimal. Original authenticated fill timing and actual session headroom cannot be reconstructed from this frame alone.

**TP_CANCEL_COUNT_BEFORE_AFTER:** Same synthetic four-review quote-policy tape, mirrored LONG/SHORT, with an initial adverse displacement, two continuing 35-price moves and a final larger move. Both policies receive identical timestamped market frames; their resting prices evolve independently. Baseline reproduces the preceding trigger/maker-price predicate for these fresh, admitted, budget-safe fixtures. It does not simulate actual transaction finality or fills.

| Metric, per direction | Before | After |
| --- | ---: | ---: |
| Strategic CANCEL / replacement PLACE decisions | 4 / 4 | 2 / 2 |
| Replacements pulled to best maker | 4 | 0 |
| New adverse increments between subsequent adjustments | 35, 35, 150 | 220 |
| SHORT TP steps | 99.6, 35, 35, 150 | 31.5, 76.8 |
| Distance to maker after first / final adjustment | 0 / 0 | 68.1 / 211.3 |
| SHORT projected session payoff at first / final candidate | −0.046930 / −0.150356 | −0.014915 / −0.051020 |
| Deliberately constructed final recovery book crossing | 1 | 1 |
| Separate constructed shallow-rebound book crossing | 1 | 0 |
| Projected Max Loss violations | 0 | 0 |
| Actual position-open duration / missed executable fills | unknown | unknown |

Machine-readable measurements: `.tmp_patient_replay_metrics.log`. The recovery crossing was deliberately constructed and is a quote-price opportunity, not an authenticated fill. The 10000-frame oscillation soaks retain one step for both tested spreads, then KEEP without reverse/tick churn.

**EXIT_OPPORTUNITY_TRADEOFF:** Patient TP waits for a larger recovery and can remain open longer or miss a shallow rebound that an earlier market-adjacent quote might catch. A separate synthetic SHORT rebound to executable ask 75740 crosses the old 75781 TP but not the patient 75712.9 TP; the LONG case is mirrored. This is one missed **book-price opportunity**, not a proven missed fill. The second meaningful adverse leg still permits adjustment; no time-based lock prevents it. This replay establishes less chasing and preserved conditional recovery opportunities, not improved fill rate, shorter holding time, realized PnL or production execution quality.

**MAX_LOSS_PROTECTION:** Existing conservative whole-residual payoff validation is retained: session realized PnL after paid fees + projected residual gross payoff − future exit fee/gas/safety reserves. Marked loss and paid entry fees are not charged twice. Budget clipping is tick-aligned and cannot increase the original planned step. Ownership, reduce-only, post-only, exact residual, fresh account/book/fees, venue limit and authoritative replacement preflight remain mandatory. The canonical Max Loss IOC/defensive workflow remains independent of patient TP. No risk limit or leverage is increased.

**RESTART_AND_PARTIAL_FILL:** Existing CANCEL/finality/PLACE tests cover partial fills during cancellation, restart before coverage repair, unknown ACK, stale market and changed budget. A separate journal-reopen test restores the consumed anchor with an already-resting replacement and proves repeated evaluations send no further CANCEL. Flat/new-opening tests isolate position epochs. No production journal/schema migration or separate strategy-state database is introduced; only new intent metadata and a read query are added. The quantity-only coverage path still uses the old authenticated resting price; combining adverse repricing with coverage now preserves the adverse authorization reason instead of dropping the checkpoint under a generic combined reason.

**REGRESSION_RESULTS:**

- Focused patient TP/PID 36848/canonical Max Loss: **35 passed**, including two 10000-frame oscillation soaks; `.tmp_patient_focused.log`.
- ENTRY plus reconciliation/HTTP: **49 passed** across seven files; `.tmp_patient_entry_and_secondary.log`. The secondary stage was run separately because the existing `npm test` script short-circuits after core failure.
- Complete `npm test`: **1195 passed, 7 failed**, 37 files, 92.21s; `.tmp_patient_final_test.log`. The orchestrator file passes all **529** tests. Remaining failures match the prior task's web/session failures: two Chromium sandbox/cache failures, two telemetry mocks lacking `readMarketMetadata`, and three authenticated initialization recovery expectations. No TP-policy regression fails and no test timeout occurred in this run.
- `npm run typecheck`: passed. `npm run build`: passed.
- `npm run format:check`: fails on four pre-existing files: `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`, `tests/fixtures/entry_cost_19884_v1.json`, `tests/fixtures/entry_simplification_36080_v1.json`.
- Final `npm run lint`: fails only on pre-existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts` outside the configured project service; `.tmp_patient_verified_lint.log`. Changed code/tests pass ESLint and Prettier. `git diff --check` passes for changed tracked files.

All five required verification commands were run. Complete repository verification remains **not green**; unrelated files and test expectations were not modified to hide those failures.

**FILES_CHANGED:** `src/decibel_exit_economics_v1.ts`, `src/decibel_execution_intent_v1.ts`, `src/decibel_execution_lifecycle_journal_v1.ts`, `src/decibel_production_live_orchestrator_v1.ts`, `src/decibel_production_live_state_source_v1.ts`, `src/decibel_risk_capacity_v1.ts`, `tests/decibel_production_live_orchestrator_v1.test.ts`, and this report. ENTRY policy/quote generation and production Settings/session/journal data are unchanged.

**BUILD_FINGERPRINT:** `e2619b1079463a1f`, 118 covered files, using `calculateDecibelSourceBuildFingerprintV1` after build. Covers the complete local source tree, including pre-existing uncommitted changes, not a deployed process or commit.

**NOT_VERIFIED:** Authenticated fills, fill probability, queue position, fill-rate/PnL improvement, original PID regime/session budget, real cancellation latency or holding duration, broad out-of-sample calibration and live restart/deployment. No live order was sent or cancelled. If a reconciled authenticated opening-fill epoch or representative regime cannot be established, strategic TP stays put while normal coverage repair and independently authorized hard-risk actions retain their existing controls.
