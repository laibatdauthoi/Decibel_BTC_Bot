# PID 1528 Capital, TP And Defensive Exit Audit

5 November 2026. Local branch: `chore/production-cleanup-v1`. This report separates authenticated read-only observations, historical journal evidence, isolated production-path tests and policy limitations. It is not a live execution or deployment certification.

CURRENT_AUTHENTICATED_VENUE_STATE=

Read-only SDK inspection started at epoch **1793826778397** and completed its endpoint reads by **1793826779531**. BTC positions and open orders were empty; other-market position/order counts were zero. Equity, total margin and available margin were **$5.621517**, maintenance margin, unrealized PnL and margin deficit were zero. Selected leverage was 40; authenticated maker/taker rates were 1.5/4.5 bps. Independent GET responses do not constitute an atomic venue snapshot or a continuing freshness guarantee.

The historical session is now ENDED, `OPERATOR_END`, final recorded session PnL **+$0.015470000000009629**, fees **$0.065193**, gas unknown. The TP was cancelled and 0.0007 BTC sold at **80073.6**, fee **$0.025223**, transaction **7904513677**. The journal attributes that close to the existing `SESSION_UNWIND_IOC` intent `intent-ed1ea7306bb23b13c6fc4238`, prepared at 1793826299541, reduce-only, IOC limit 80056.5. These events preceded the audit; this task did not cause them. They do not prove a Max Loss defensive trigger.

CAPITAL_ACCOUNTING_FORMULA=

Settings frozen in the session: capital $5, Max Loss $2, target executed volume $500, order notional $10, legacy max-position field $50, capacity policy version 1. Existing V2 capacity semantics use their derived position limit; this repair does not reactivate the legacy $50 ceiling. The collateral fraction is 0.5; effective leverage is the minimum of configured and authenticated leverage, here 40.

Canonical quantities, in USD unless explicitly BTC:

- Position exposure = `abs(authenticated BTC) * midpoint`.
- Position margin estimate = position exposure / effective leverage. This is a policy estimate, not a replacement for venue-reported initial/maintenance margin.
- Opening reservations = authenticated opening orders plus identity-deduplicated unresolved PLACE intents. Runtime excludes an inflight intent already represented by its live order.
- A pure reduction is explicitly reduce-only, opposite the current position, finite, positive and bounded by authenticated remaining quantity. Missing/false flags, wrong direction and oversize remain conservatively reserved. Coverage and aggregate no-flip admission still independently validate ownership and total exit quantity.
- Used margin estimate = position margin + opening reservation notional / leverage.
- Strategy allocation = capital * collateral fraction = $2.50.
- Strategy remaining = `max(0, min(venue available margin, strategy allocation - used margin))`.
- `limits.availableMarginUsd` remains the existing full-capital residual `min(venue free, max(0, capital - used margin))` for compatibility with sizing/capacity consumers. It is distinct from both venue free margin and strategy remaining; it must not be labelled as either.
- Capacity additionally applies stress loss, fee/transaction reserves, exit depth, venue rules, liquidation buffers, notional ceilings and lot rounding. Opening headroom is the resulting limit minus worst-case opening exposure. Opposite opening orders are not netted away. TP fees and adverse mark-to-execution cost reserves remain included in post-fill safety calculations.

NUMERICAL_CAPITAL_RECONCILIATION=

Exact healthy journal frame **1793821051935**, book **80078.8 / 80078.9**, midpoint **80078.85**, position **0.0007** BTC:

| Quantity | Before | Corrected |
| --- | ---: | ---: |
| Position exposure | 56.055195 | 56.055195 |
| Position margin / 40 | 1.401379875 | 1.401379875 |
| TP notional: 80314.4 * 0.0007 | 56.22008 | 56.22008 of exit coverage |
| TP opening-margin debit | 1.405502 | 0 |
| Total used margin estimate | 2.806881875 | 1.401379875 |
| Full-capital residual | 2.193118125 | 3.598620125 |
| Strategy allocation remaining | 0 | 1.098620125 |
| Pending opening exposure | 56.22008 | 0 |

The old full-capital residual **exactly matches the journal's 2.193118125**. The fixture uses $4.20 as an explicitly representative venue-free value from the reported $4.18–4.22 range; an exact same-frame raw account value was not retained in this fixture. All values in that range exceed the computed residuals, so this uncertainty does not affect the reconciliation. The healthy frame's position limit was **72.070965**, giving headroom **16.01577**; the user's approximately $16.8 came from a different market/time snapshot.

WHY_MARGIN_IS_POSITIVE_BUT_ALLOCATION_IS_ZERO=

The incident had a demonstrated false debit: `(5 * .5) - (1.401379875 + 1.405502) < 0`. Venue free margin was positive but was not automatically spendable strategy capital. The repair removes only the fictitious opening collateral of the bounded reduce-only TP. Genuine allocation exhaustion remains valid: 0.0013 BTC at this midpoint requires **$2.602562625** margin, exceeding $2.50 even with $4.20 venue free. Both LONG and SHORT regressions retain zero remaining allocation in that case. An additional pending 0.00013 opening order at 80000 reserves **$0.26**.

DOUBLE_COUNTING_AUDIT=

Position notional was correctly divided by leverage; it was not directly charged as margin. The defect was treating a reduce-only TP as another opening commitment, and displaying its notional as pending opening exposure. The canonical helper is now shared by allocation, worst-case risk endpoints, post-fill endpoints and decision telemetry. Inflight opening reservations are included in allocation; runtime identity deduplication is preserved. Cost reserves still charge potential exit execution costs. This is not permission to count one BTC position in multiple exits: existing aggregate quantity, lineage, reconciliation and final no-flip gates remain.

EXACT_ENTRY_AND_DCA_BLOCKERS=

Healthy-cycle `NO_QUOTE_CANDIDATE` occurs before candidate economics, final risk admission or executor invocation. At the recorded inventory pressure **7/9**, the smart ladder gives the reducing side **$64.06308** of its **$72.070965** aggregate quote commitment. The increasing side has **$8.007885**, below the existing $10 tier-one minimum. Even though opening risk headroom is $16.01577, that headroom is an upper bound, not an instruction to override inventory-skewed quote allocation. The ladder deliberately preserves the aggregate commitment; its existing PID 32328 regression requires no increasing quote when the minimum cannot fit. No borrowing/reallocation or DCA price policy was introduced. Therefore the capital repair does **not** imply that this historical DCA should submit.

On stale cycles, first blockers instead include `CAPACITY_VENUE_MARGIN_RULES_STALE`, `SESSION_CAPACITY_EVIDENCE_REQUIRED`, authenticated read failures, account freshness or book freshness. Those are separate from the healthy budget rejection. A generated TP candidate at 80162.5 fails exact-quantity aggregate economics with **-$0.07092238533670264**. No candidate/order was manufactured to bypass any of these gates.

INTENDED_TP_ACCOUNTING_MODEL=

Implemented and documented policy is **authenticated aggregate average-cost position accounting**, not fill-owned TP lots. Settings expose no per-fill ownership choice. DCA changes weighted entry basis and remaining inventory; the TP owns a bounded reduction of that position, not an independently earmarked entry lot. Session PnL is separately computed from attributed executions using average cost. TP admission does not require the whole session to be profitable.

PER_FILL_VS_AGGREGATE_TP_COMPARISON=

Authenticated historical BUY fills underlying this position:

| BTC | Price | Actual fee USD | Contribution to aggregate basis |
| --- | ---: | ---: | ---: |
| 0.00044 | 80202.4 | .005293 | 50412.93714285715 |
| 0.00013 | 80151.8 | .001562 | 14885.334285714285 |
| 0.00013 | 80067.7 | .001561 | 14869.715714285712 |

Weighted basis is **80167.98714285714**, agreeing with authenticated **80167.987143**. Actual entry fees sum to **.008416**. Those amounts agree with rounded 1.5-bps maker fees, but fee magnitude alone is not proof of liquidity classification. The SDK trade row normalizes primary-collateral fee amounts as USD; it does not supply a separate arbitrary-currency FX conversion here.

At exit 80103, the last fill alone has fee-only PnL approximately **+.0014659915** before gas/adverse/safety reserves; the full position's modeled TP PnL is **-.11254194348** using this frame's costs. These are different definitions. At 80180, the last lot's standalone modeled net is **+.00148150134** while aggregate modeled net is **-.05868133882**. At 80280, aggregate modeled net is **+.01126749840**, while the first/highest entry lot alone is **-.00836879781**. Independent lot examples are diagnostic counterfactuals, not authorized ownership or extra orders. Charging one transaction's fixed costs separately to each lot means standalone modeled lot results need not sum to one aggregate transaction result.

Partial exits use the exact requested quantity and current aggregate basis. Actual closing PnL for the final .0007 close is approximately **-.066071 gross**, **-.099710 after these entry/exit fees**, excluding unknown gas/funding. The positive whole-session result includes earlier profitable cycles; it does not make this final position profitable. Average-cost accounting does not assign its realized PnL back to three uniquely owned lots.

TP_PROFITABILITY_GATE_AUDIT=

For a long, modeled maker TP net is:

`q * (price - basis - basis * max(authenticated maker,taker fee)/10000 - price * (maker fee + adverse + safety)/10000) - 2 * gas`.

SHORT reverses price movement. This frame uses maker 1.5 bps, conservative entry fee 4.5 bps, adverse 4.80896810258691 bps, safety 1 bps and gas .0004075542 per transaction. It models exact exit quantity, not automatically full inventory. Authenticated account/basis, book, both fee observations and cost evidence remain required. Positive modeled profit is required for a newly priced TP; no threshold changed.

Coverage repair may preserve an exactly authenticated, previously authorized resting price and adjust quantity independently of price improvement. Existing durable same-price authorization, cancellation/restart recovery, integer-lot aggregate no-flip checks and final venue admission remain. TP price repricing requires its own suitability/economic decision. A valid existing TP is retained when a proposed alternative loses money. Candidate generation uses the existing quote distances/resting authorization; introducing a new far-away profit-floor quote policy is a separate strategy proposal, not an accounting repair.

CURRENT_TP_ORDER_VALIDATION=

Historical order **170141604320468507528212794363007205376**, client **d1s4a4b33426c0e5b8a6ca8164d877e2**, was acknowledged OPEN, SELL .0007 at 80314.4, reduce-only, matching full authenticated inventory. The healthy frame retained it as `KEEP:VALID_REDUCE_ONLY_EXIT`. With that frame's costs its modeled net is **+.03532989841**, rather than the user's +.0283 from another cost/time snapshot. At 80103 the same fixed frame yields -.11254 rather than -.1195; neither difference authorizes re-aging costs. The TP is now historical and cancelled; no current live TP validation is claimed.

DEFENSIVE_EXIT_STATE_MACHINE=

1. Authenticate inventory/orders, enforce ownership and current book/account safety. An unknown submission or cancellation is reconciled before a duplicate reduction.
2. Existing terminal/session unwind authority, including Max Loss, takes priority. Max Loss is a **session** budget, based on attributed average-cost realized PnL plus current unrealized PnL minus signed observed fees. It is not a per-lot or per-position stop.
3. Explicit canonical RISK reduction is evaluated independently of ENTRY allocation, TP profitability and continuous holding-history diagnostics. It precedes the conditional continuous-history branch. Existing TP coverage must be safely cancelled/reconciled or reused, not overlapped blindly.
4. Conditional holding-risk assessment requires continuous authenticated position/market history (30 seconds, no gap exceeding the existing book-age bound). Startup public BBO hydration establishes market history, not proof that the bot continuously held the same position. Position epoch/reversal and stale intervals invalidate that continuity.
5. Below canonical thresholds, policy may retain the valid TP and HOLD. No new intermediate loss authority is inferred from elapsed time or an unprofitable market-near TP.

Canonical normal reduction retains post-only execution and final authenticated admission. Existing session unwind has its already implemented reduce-only IOC behavior; this audit adds no market fallback. A stale/unknown venue state can block even a risk-authorized order because safe quantity/identity cannot be inferred.

WHY_DEFENSIVE_EXIT_WAS_NOT_ELIGIBLE=

The healthy incident exposure **$56.055195** was below **$72.070965** capacity; no explicit canonical reduction request was established in that frame. The $2 session Max Loss threshold was not established as reached. `CONTINUOUS_POSITION_AND_MARKET_HISTORY_REQUIRED` describes the conditional holding branch; it is not proof that missing history suppressed a separately authorized canonical RISK action. Existing production-path regressions dispatch canonical risk reduction before that history guard, including zero entry allocation and existing TP cases. The eventual OPERATOR_END IOC is not evidence that a defensive threshold fired.

PRICE_NEVER_RETURNS_SCENARIO=

A resting profitable TP provides coverage, not guaranteed downside protection or execution. Below an existing canonical loss/risk condition the current policy can HOLD indefinitely if price never returns. Session profits can offset a position loss before session Max Loss is reached. Stale reads, venue rejection and post-only constraints can delay authorized action. Per-position stops, maximum holding time, a different loss budget, per-fill TPs or a new fallback require explicit strategy approval; none were added.

READINESS_FLAPPING_ROOT_CAUSE=

The inspected `stdout.log` contains 48 lines mentioning authenticated-state staleness, 23 book-stale lines, 219 margin-rule-stale lines, 63 transient authenticated-read lines and 160 capacity-evidence-required lines. These are overlapping diagnostic-line counts, **not independent incident counts or latency measurements**. Healthy and stale margin-rule frames alternate even while the same inventory persists. Rules include the original oracle mark time; a new HTTP response cannot refresh an old oracle mark. Account, book, fees and mark have independent clocks/TTLs. Failed capacity acquisition yields absent capacity rather than fabricated zero-margin evidence; decision telemetry nulls untrusted financial values.

Earlier source/publication, bounded-read cancellation and independent WS publication repairs in this workspace are documented in `decibel_production_data_architecture_pid6628_v1.md` and retained. This audit does not attribute every PID 1528 transient to those defects, nor prove endpoint latency as the sole cause from coarse log lines. Freshness mismatches are deliberately blocking. No TTL extension, timestamp advancement, new cache owner or competing readiness layer was added here. The capital double debit explains the healthy false zero allocation; it does not explain actual HTTP failures or old oracle observations.

ACTUAL_CODE_DEFECTS=

- Reduce-only TP opening-margin debit and pending-opening telemetry, reproduced numerically against the exact healthy journal residual.
- Allocation omitted unresolved opening PLACE reservations even though risk endpoints considered inflight quantities; runtime's existing identity dedup is now carried into the canonical reservation calculation.
- Worst-case opening/post-fill endpoints treated explicitly bounded reducing orders as potential opening reversal. They now share the same conservative action predicate while retaining all execution-cost reserves.
- Runtime strategy remaining duplicated allocation arithmetic; it now consumes the canonical result. Decision pending-opening telemetry now consumes canonical exposure when present and the same reduction classification otherwise.

The raw fill ledger's legacy maker label is not independent proof of maker execution. Session accounting already combines it with exact durable PostOnly intent lineage, so IOC closes are not counted as maker session volume; that regression remains. A complete venue-provided maker/taker provenance model and explicit rebate/funding policy deserve separate work. This audit does not certify those legacy global labels or hypothetical rebate handling as economically complete. The incident fills had `is_rebate=false`; neither issue explains the demonstrated capital double debit.

FILES_AND_FUNCTIONS_CHANGED=

| File | Change |
| --- | --- |
| `src/decibel_order_action_v1.ts` | Added `isDecibelPositionReductionV1` |
| `src/decibel_operator_settings_v1.ts` | `deriveDecibelSessionTradingLimitsV1`: canonical strategy remaining; classify opening reservations including inflight; validate their price/quantity |
| `src/decibel_risk_capacity_v1.ts` | `calculateDecibelRiskCapacityV1`: opening-only worst-case endpoints |
| `src/decibel_capacity_producers_v1.ts` | `produceDecibelPostFillMarginV1`: opening-only endpoints, unchanged fee/cost reserves |
| `src/run_decibel_production_web_v1.ts` | Propagate inflight reduce-only metadata and consume canonical allocation remaining |
| `src/decibel_trading_decision_v1.ts` | Opening-only pending-exposure telemetry |
| `tests/decibel_practical_capacity_v1.test.ts` | LONG/SHORT capital double-debit, genuine exhaustion and pending-opening reservation regressions |
| `tests/decibel_post_fill_margin_producer_v1.test.ts` | LONG/SHORT endpoint classification with exit cost reserve retained |
| `tests/decibel_production_live_orchestrator_v1.test.ts` | Recorded PID 1528 exact-quantity aggregate/per-fill economic comparisons |
| `tests/fixtures/decibel_pid1528_capital_tp_v1.json` | Sanitized historical frame/configuration/fill fixture; representative venue margin explicitly identified |

BEFORE_AFTER_REGRESSION_REPLAYS=

Before: the actual incident TP produces $2.806881875 used margin, zero strategy remaining and $56.22008 pending opening exposure. After: $1.401379875 used, $1.098620125 remaining and zero pending opening exposure. Turning off the reduce-only flag restores conservative reservation. A genuine .0013 BTC position still exhausts the allocation. An inflight .00013 opening order reserves $.26. LONG/SHORT endpoint tests retain exit costs without fabricating a reversing position.

New economics replays compare a profitable standalone lot with a losing aggregate, a profitable aggregate with a losing component lot, exact partial quantity and profitable resting TP versus losing candidate. They use the actual production economic assessor and recorded costs. Existing production orchestrator/lifecycle/final admission/fake-adapter regressions cover DCA same-price quantity repair, profitable-TP retention, canonical defensive dispatch, zero allocation, covered/uncovered inventory, unknown outcomes, partial fills, exact cancellation and restart identity, PostOnlyViolation, account/book mismatch and transient read recovery. BTC-only source/executor tests retain unrelated-market isolation. A pure economics calculation is not described as a submitted order; fake-adapter ACKs are not mainnet verification.

SAFETY_INVARIANTS=

No Settings, leverage, Max Loss, collateral fraction, sizing policy, sample requirements, TTLs, adverse methodology, TP thresholds or maker-only rule changed. Every new order still passes canonical risk and final authenticated venue admission. Unknown metadata is conservative. Exit fees/reserves, exact lineage, lot rounding, total coverage and no-flip rules remain. No production mutation, restart or live order was performed.

UNRESOLVED_STRATEGY_DESIGN_QUESTIONS=

- Per-fill ownership versus existing aggregate average-cost TP: separate approval required, with durable partial-lot allocation and no duplicated BTC.
- Per-position stop, holding-time limit or new defensive price policy: separate approval required. Existing session Max Loss is not guaranteed per-position downside protection.
- A new TP profit-floor quote generator or reallocation of the inventory-skewed ladder's reducing-side budget would alter quote policy; not introduced to force an ENTRY.
- Current session PnL uses attributed realized/unrealized PnL and observed fees; funding and gas are not incorporated into that function. Gas is separately unknown in the final session record. Explicit funding/gas/rebate and maker/taker provenance requirements need a defined, tested accounting contract; no invented FX, fee evidence or policy was used here.

TEST_RESULTS=

| Command | Result |
| --- | --- |
| `npm run format:check` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `src/readonly_exit_architecture_tmp.ts` |
| `npm run lint` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`, outside the configured TypeScript project service |
| `npm run typecheck` | Passed |
| `npm test` | **1005 passed across 33 files**: 988 production-core plus 17 authoritative-reconciliation/HTTP tests |
| `npm run build` | Passed |
| `npm run build:web-dashboard` | Passed |

Targeted capital/post-fill/orchestrator run: **413 passed**. New/changed source, tests, fixture and report pass Prettier; `git diff --check` passed with Windows line-ending notices. An earlier full run failed the existing 100-ms concurrent HTTP-worker timing test (with an unhandled timeout); its isolated rerun passed all four tests and the complete rerun then passed without changing that test or timeout policy. The initial failure is retained here rather than presented as an uninterrupted clean run. Chromium checks ran outside the process sandbox using isolated fake venues and disposable state. Equivalent `.cmd` launchers avoided PowerShell's restricted `.ps1` wrappers without altering execution policy. Scratch files were not deleted, ignored or used to disable lint/format checks.

DEPLOYMENT_STATUS=

Local source/tests/fixture/report and generated build artifacts only. No live submit, cancel, replace or close, no production journal writes, session change, Settings write or production restart. SQLite audit connections used read-only mode. The running PID cannot pick up these source fixes without a separately authorized deployment; no mainnet success claim is made.
