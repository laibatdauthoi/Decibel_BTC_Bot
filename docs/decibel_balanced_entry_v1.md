# Balanced ENTRY Replacement

ROOT_CAUSE: Displayed quantity passed could exceed a tiny residual order many times while the candidate still retained almost all of the distance to best maker. Depth quantity proves observed price priority, not that cancellation is worthwhile.

CURRENT_POLICY_PROBLEM: `outsideBand && (reachesBestMaker || materialDisplayedPriority)` did not measure the fraction of the maker gap closed. Admission-boundary changes could therefore consume OPEN time priority and a cancel/finality/place interval for limited competitive progress. The stability band was also an absolute veto even on substantial arrival at best maker.

EXACT_POLICY_CHANGE:

- Keep the existing spread/depth/movement band calculation and maker/admission/freshness/comparability checks.
- Require progress that either closes at least one third of the resting-to-best-maker gap, passes at least half of the displayed base quantity ahead of the resting order, reaches the existing competitive band, or reaches best maker directly. The displayed fraction describes only the supplied depth, including all observed better prices, not hidden liquidity or queue position.
- Normally retain the outside-band requirement. Allow substantial arrival at best maker to outweigh a wide band when improvement exceeds both one tick and the spread. This exception still requires fresh, passive, admitted, comparable prices.
- Publish relative gap improvement and both progress predicates in replacement diagnostics. No change to quote generation, PLACE admission, standalone cancellation, risk limits, finality or TP.

WHY_NOT_TOO_AGGRESSIVE: Large crossed quantity alone is insufficient. Small changes and one-tick arrival at best maker remain KEEP. OPEN time priority is preserved on limited progress; no queue position or fill probability is inferred.

WHY_NOT_TOO_CONSERVATIVE: One third and one half are explicit policy tradeoffs rather than statistically calibrated fill thresholds. Passing most observed liquidity ahead can bypass the distance fraction; substantial arrival at best maker can bypass the band. Neither distance nor depth is individually mandatory. Strong displacements still REPLACE in both directions. There is no timer, age floor, gas gate or readmission lock.

PID_40436_BEFORE_AFTER: User-reported SELL 75611.9 → 75593.7 with best ask 75573.6 closes 18.2 / 38.3 = 47.52% of the gap, leaving 20.1. It remains eligible to REPLACE; the 9013ms reported replacement-ready interval is a real opportunity cost, not sufficient evidence to call the replacement wrong. The unit replay reconstructs individual depth levels, bid, quantity and admission inputs; it matches three crossed levels totaling 10.9822 BTC. It is not a replay of the unavailable original authenticated snapshot.

CHURN_AND_MARKET_DISTANCE_BEFORE_AFTER: Same constructed six-frame timeline, independently simulated old/new resting prices, mirrored BUY/SELL, 20s spacing and **synthetic** 2s absence per replacement. Results below are per side. The baseline reproduces the preceding predicate for these fresh, admitted, aligned, passive frames with valid displayed depth; it is not a historical production execution replay.

| Metric | Before | After |
| --- | ---: | ---: |
| CANCEL / replacement PLACE | 3 / 3 | 2 / 2 |
| Replacements with verified displayed price priority | 3 | 2 |
| Replacements with limited relative competitive progress | 1 | 0 |
| ENTRY on book | 114s | 116s |
| ENTRY absent | 6s | 4s |
| Mean distance to best maker while on book | 17.7596 | 20.4690 |
| Missed designated strong-move opportunities | 0 / 2 | 0 / 2 |

Distance increases **15.26%**, a measured tradeoff, while replacement count falls 33.33%. The synthetic regression bounds the distance increase to 25%; this bound is a test acceptance criterion, not a live risk setting or empirical guarantee. “Limited progress” still means real price priority improvement; it does not mean zero economic benefit. No authenticated fill tape is used. The two designated strong moves are the scenario oracle, not an exhaustive count of all possible fill opportunities.

For latency sensitivity only, applying the user-reported 9013ms cost to each replacement in this same synthetic schedule would change absence from 27.039s to 18.026s, and book time from 92.961s to 101.974s. This is arithmetic under a constant-latency assumption, not measured replay execution or a decision timer.

ENTRY_FILL_OPPORTUNITY_PRESERVED: Replacement policy is called for existing resting entries only. Existing PID 3108 tests cover fresh placement after cancellation. PID 14112 tests cover reconstructed one-tick boundary movement. PID 24216 recorded cancel facts all close less than one third of the maker gap; full historical depth is absent, so their historical old/new mutation totals and book time cannot be reconstructed honestly. No new PLACE gate or production-setting change was introduced.

TP_EXIT_UNCHANGED: Adaptive TP, bounded loss, Max Loss, reduce-only, coverage and defensive actions are unchanged. Existing PID 36848 regressions exercise adverse movement and controlled maker losses without requiring positive net PnL.

TEST_RESULTS:

- Focused ENTRY suite: **32/32 passed**, five files; `.tmp_balanced_focused.log`.
- Reconciliation/HTTP secondary stage: **17/17 passed**, run separately because `npm test` short-circuits after its core stage fails; `.tmp_balanced_secondary.log`.
- Final complete `npm test`: **1182 passed, 8 failed**, 37 files, 162.09s; `.tmp_balanced_verified_test.log`. Failures: two Chromium sandbox/cache failures, two telemetry mocks missing `readMarketMetadata`, three authenticated initialization recovery failures (metadata stage and TIMEOUT versus ABORTED), and one 1000-cycle liveness test exceeding its existing 20s limit. These are not suppressed.
- Isolated final-source liveness/PID rerun: **26/26 passed**, 491 unrelated tests skipped, 68.87s; `.tmp_balanced_verified_regressions.log`. This includes the 1000-cycle liveness test with its unchanged 20s limit, plus PID 3108/14112/24216/36848. The full-run timeout did not reproduce in isolation. PID 3108 preserves two unique ENTRY placements, one BUY and one SELL, with no readmission lock.
- `npm run typecheck` and `npm run build`: passed on final source; `.tmp_balanced_verified_typecheck.log` and `.tmp_balanced_verified_build.log`.
- Whole-repository `format:check`: fails on four pre-existing files: `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`, `tests/fixtures/entry_cost_19884_v1.json`, `tests/fixtures/entry_simplification_36080_v1.json`.
- Whole-repository `lint`: fails on pre-existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts` outside the configured project service. Changed TypeScript files pass ESLint; changed code/tests/package pass Prettier.

The focused suite includes both directions, relative-boundary checks, substantial arrival despite a wide band, the displayed-depth alternative, stale/missing depth and PID 40436 reconstruction. New regression is included in `npm test` through `test:production-core`. The complete repository verification is not green.

FILES_CHANGED: `src/decibel_smart_ladder_v1.ts`, `tests/decibel_balanced_entry_v1.test.ts`, `tests/decibel_entry_price_stability_v1.test.ts`, `package.json`, and this report. The existing gas-accounting test moves resting BUY 99.05 → 99.00 so the scenario retains meaningful relative progress while price improvement remains smaller than replacement gas accounting.

BUILD_FINGERPRINT: `4aebdd73ac3aa994`, 118 covered files, calculated by `calculateDecibelSourceBuildFingerprintV1`. This identifies the complete local source tree, including the user's pre-existing uncommitted changes, not a commit or deployed process.

NOT_VERIFIED: Authenticated fills, fill-rate or PnL improvement; actual future replacement latency; live time priority or queue position; production restart/deployment; full PID 40436/24216 historical depth; broad out-of-sample calibration of the one-third tradeoff. No live order was sent or cancelled by this task.
