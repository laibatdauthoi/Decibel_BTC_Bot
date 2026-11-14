# ENTRY Maker Priority Repair - 2026-11-07

ROOT_CAUSE_CHURN

The verified starting source fingerprint is `8e239124aed74d35` (118 files). The old priority gate compared price movement times residual quantity with cancel/place gas. It admitted small moves while candidates remained behind the actual BBO. After a strategic terminal cancellation, an unfavorable fresh quote cleared FrozenReprice; the following cycle could PLACE farther away. The journal proves cycle 421588 at 19:05:08.855 blocked with ENTRY_REPLACEMENT_PRIORITY_NO_LONGER_IMPROVED, then cycle 421592 at 19:05:29.965 placed BUY 75856.8 with DESIRED_ORDER_ABSENT.

CANCEL_TIMELINE_19_05_19_13

Evidence: read-only `data/decibel_execution_v1.sqlite`, 184 decision snapshots, 10 CANCEL intents, 10 PLACE intents in [19:05, 19:14) Bangkok time. Every cancellation has authenticated terminal CANCELLED evidence in the fixture. Next PLACE means the next same-side intent, not a guaranteed linked replacement. All quantities are 0.00047 BTC.

| Bangkok Time | Order ID | Side | Resting | Bid / Ask | Candidate | Actual Reason | Next PLACE | Better Price? |
|---|---|---|---:|---|---:|---|---:|---|
| 19:05:00.054 | 170141594179263709986961548347164327936 | BUY | 75868.8 | 75890.1 / 75892.0 | 75870.5 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75856.8 | No |
| 19:05:12.902 | 170141594179263706598934933136243425280 | SELL | 75910.2 | 75877.3 / 75877.4 | 75897.9 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75897.9 | Yes |
| 19:06:39.562 | 170141591643962506133473786331444281344 | BUY | 75856.8 | 75877.3 / 75883.6 | 75859.9 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75863.6 | Yes |
| 19:06:59.792 | 170141599249866108953972764170243801088 | SELL | 75897.9 | 75886.3 / 75886.4 | None | ECONOMIC_INVALID:RESTING_ENTRY_FUTURE_EDGE_INSUFFICIENT | 75908.0 | No |
| 19:07:06.486 | 170141599249866110200968334116023959552 | BUY | 75863.6 | 75887.4 / 75887.5 | 75866.9 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75866.9 | Yes |
| 19:09:11.056 | 170141594179263706612433619798263332864 | BUY | 75866.9 | 75890.0 / 75890.1 | 75869.5 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75869.5 | Yes |
| 19:10:12.032 | 170141604320468510642252256955670200320 | BUY | 75869.5 | 75890.0 / 75896.1 | 75872.5 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75875.7 | Yes |
| 19:10:18.223 | 170141599249866107426590311812840816640 | SELL | 75908.0 | 75895.8 / 75896.1 | None | ECONOMIC_INVALID:RESTING_ENTRY_FUTURE_EDGE_INSUFFICIENT | 75916.9 | No |
| 19:12:26.859 | 170141594179263706924470639306767073280 | BUY | 75875.7 | 75897.6 / 75898.1 | 75877.3 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75877.1 | Yes |
| 19:13:26.746 | 170141606855769710831307052508558393344 | SELL | 75916.9 | 75890.0 / 75890.1 | 75910.6 | REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED | 75910.6 | Yes |

Eight cancellations were strategic, two were continuation economics, none was hard risk. Strategic BUY at 19:05 lost time priority and next placed $12 lower. The two farther SELL placements followed independent continuation losses: -$0.00028698035 and -$0.0000526924 after remaining fee/gas, excluding admission safety margin. Those two cancellations remain valid; they are not strategic replacement failures. Other next placements improved price, but every recorded candidate was behind actual best bid/ask. No exact queue position or fill probability is inferred.

FILES_CHANGED

- src/decibel_smart_ladder_v1.ts
- src/decibel_production_live_orchestrator_v1.ts
- tests/decibel_production_live_orchestrator_v1.test.ts
- tests/decibel_entry_price_priority_v1.test.ts
- tests/fixtures/entry_churn_2026_11_07_v1.json
- docs/decibel_entry_price_priority_2026_11_07_v1.md

KEEP_REPLACE_RULE_BEFORE_AFTER

Before: a passive admitted price movement exceeding cancel/place gas could trigger replacement, even behind best. After: require a passive tick-aligned candidate that improves side-specific price and reaches actual best bid (BUY) or best ask (SELL), while resting is behind best. Resting at or better than best, farther candidates and incremental behind-best moves KEEP. Gas, conditional surplus and age do not decide priority. Gas estimates remain diagnostic/accounting; existing admission, funding and risk preflights remain authoritative.

After terminal cancellation, reconstruct from fresh book and require both improved price and best-quote competitiveness. Retain the existing frozen commitment across blocked cycles instead of letting normal PLACE bypass it. Inventory changes and independent risk cancellation retain their existing authority. No new timer, cooldown, framework or state machine.

PID_40112_RESULT

BUY 75877.1 -> 75872.9 KEEP; SELL 75910.6 -> 75914 KEEP. Price examples are regression inputs; no PID 40112 process attribution is invented.

PID_22692_RESULT

Farther SELL KEEP. Recorded BUY 75984.8 -> 76002.7 is still behind recorded best bid 76023.2, so KEEP under the requested actual-best rule. Synthetic case with best bid 76002.7 proves REPLACE for exactly those prices, independent of gas (null, zero, or large). This distinction is explicit rather than relabeling an admission boundary as best maker quote.

PLACE_CANCEL_COUNTS_BEFORE_AFTER

Historical venue-intent counts: PLACE=10, CANCEL=10. On unchanged recorded observations, strategic replacement proposals fall from 10 to 0; the 8 executed strategic cancels would fail the new priority precondition. Two independent loss cancellations remain valid. These are observation-level comparisons, not counterfactual venue counts: deleting an earlier mutation changes later orders. Exact after-PLACE/CANCEL counts cannot be established from this fixed historical tape. Synthetic terminal-finality replay has one CANCEL/one PLACE on recovery; pending finality has one CANCEL/zero PLACE; 20 worse-price cycles add zero mutations.

SAFETY_REGRESSIONS

Focused coverage includes partial-fill inventory changes, pending ACK/finality, pending restart, stale books, authoritative reconciliation, continuation loss and independent hard position limits. TP policy, Max Loss, leverage, sizing, capital limits and funding policy are unchanged. Raw-BBO priority can KEEP indefinitely if existing admission cannot reach BBO; this patch does not relax admission to claim more fills.

TEST_RESULTS

Typecheck and build pass. Changed-file ESLint and Prettier pass. Focused priority/economics/reconciliation/HTTP suites: 31 passed. Focused live replay plus 1000-cycle soak: 13 passed; adjusted historical strategy regressions: 5 passed. Full npm test: 1110 passed, 7 failed across 31 files; all 485 orchestrator tests pass. The seven failures are three session HTTP recovery fixtures, two telemetry metadata-reader fixtures, and two Chromium sandbox tests, matching the previously documented categories. The npm test second-stage reconciliation command is skipped by its && after the core failure; both suites passed separately.

All five required commands ran. Repository format:check fails on four untouched files: .tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json. Repository lint fails on project-service inclusion of existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts. No suppression or unrelated cleanup was applied.

BUILD_FINGERPRINT

Before `8e239124aed74d35`; after `f810098d44a01b91`; 118 covered production source/configuration files. Existing branch chore/production-cleanup-v1; extensive prior workspace changes preserved. No commit.

NOT_VERIFIED

No deployment, restart, live PLACE/CANCEL, production settings/session/journal write, live fill rate, realized PnL improvement, exact queue position or counterfactual venue mutation count. Fixtures contain a filtered local evidence copy.
