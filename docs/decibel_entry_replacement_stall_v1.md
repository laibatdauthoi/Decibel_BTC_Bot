# ENTRY Replacement Quantity and Capacity Publication Fix

## Exact quantity blocker

Read-only SQLite queries recovered the original intents and strategy decision snapshot for cycle 332322. The position is FLAT. Both orders are ACKNOWLEDGED/OPEN at that observation:

| Side | Venue Order ID | Resting Price | Resting Residual BTC | Candidate Price | Candidate BTC | Age |
| --- | --- | --- | --- | --- | --- | --- |
| SELL | 170141596714564909712113324059283947520 | 81506.7 | 0.00071 | 81430.3 | 0.00069 | 4569216 ms (76.15 min) |
| BUY | 170141599249866108304763908384014467072 | 81241.1 | 0.00018 | 81275.70000000001 | 0.00069 | 5174204 ms (86.24 min) |

The respective persisted intents are intent-ed4299d3d5d596e3985dc947 and intent-237da4486fd9dea81b7192ca. Quantity and remaining capital are available, not missing. The candidate quantity comes from current dynamic sizing and the flat-pair cohort, whereas current.quantity is the authenticated resting residual. These inputs legitimately differ as prices, capital and inventory change. The BUY was created earlier than the SELL. The original review required desired.quantity === current.quantity and returned KEEP:ENTRY_COMPARABLE_QUANTITY_REQUIRED before reading comparative economics. Thus both planner WOULD_REPLACE actions could remain KEEP indefinitely regardless of material price movement.

A common quantity is a legitimate requirement for comparing price economics; demanding that the independently sized actual orders be identical is the demonstrated calculation defect. The fix compares both prices on min(authenticated residual, proposed quantity), after lot-alignment and positivity validation. It does not alter either order quantity. Actual replacement preflight still checks the entire proposed quantity. Both transaction costs and the adverse-selection reserve for the full proposed replacement remain charged. Extra quantity cannot manufacture comparative benefit. Missing comparative P95 observations, stale evidence, pending cancellation and reconciliation conflicts continue to block.

## Exact capital replay

The saved snapshot records best bid/ask 81332.6/81332.7, available margin 6.187671125 USD, effective limit 114.6790365 USD, available headroom 56.932855 USD and remaining volume 384.471711 USD. Existing pending notional is 72.493155 USD. At leverage 40 it uses 1.812328875 USD of session capital. The session settings were Capital 8 USD, Max Loss 3 USD and Volume 500 USD. Under the unchanged 0.5 aggregate allocation fraction, remaining entry allocation is 2.187671125 USD. Raw per-side budget is 57.33951825 USD; the recorded cohort selects 0.00069 BTC on each side. None of these inputs or policies was changed.

Before: both unequal-sized comparisons stop at COMPARABLE_QUANTITY_REQUIRED with null benefit.

After: both comparisons reach comparative economic evidence. The historical snapshot does not retain candidate-specific P95 observations, so it is not sufficient to claim either real replacement was economically justified. Replaying absent observations correctly gives KEEP:ENTRY_COMPARATIVE_ECONOMICS_UNPROVEN.

Controlled tests retain these exact prices, sizes, capital and headroom and supply explicit synthetic comparative evidence. With zero adverse selection at both distances, net benefit is approximately -0.075758396 USD (SELL) and -0.029242968 USD (BUY), so both KEEP. With resting adverse selection 50 bps and candidate 0 bps, benefits are approximately +0.205439719 USD (SELL) and +0.043874022 USD (BUY), and both pass the existing age, sustained-improvement, drift and execution gates. These are test scenarios, not claimed historical venue observations.

Partial residual tests compare only the currently remaining lots, preserve the actual proposed quantity and fill-ledger reference, and keep the existing full-size execution preflight. No journal transition or order mutation is introduced by the benefit calculation.

## Independent capacity defects

The session projection captured its execution snapshot and practicalCapacityInputs before awaiting readCapacityProduction. That operation reads manifest transaction receipts asynchronously. While it runs, the authenticated supervisor can publish fresh account evidence; the cycle nevertheless continued with the older captured inputs. This can produce avoidable CAPACITY_ACCOUNT_EVIDENCE_STALE despite fresh available evidence. Projection now awaits receipt production first, then reads the latest supervisor snapshot and practical inputs together without another network await between capture and use. It does not refresh a timestamp or extend the 5000 ms TTL. Deterministic tests publish newer evidence during a delayed receipt read and verify selection of the new observation; genuinely stale or missing data still blocks.

A separate background margin-rule refresh borrowed its account request's AbortSignal. The supervisor aborts that signal when the account operation settles; a background refresh intentionally allowed to continue after successful account publication was therefore canceled prematurely. Background stages now retain their own existing timeout and Source.close shutdown ownership. Required, awaited risk refreshes still use the parent cancellation signal. Existing singleflight remains intact. The regression routes account refreshes through the actual supervisor, delays rule completion, and verifies one surviving refresh, no duplicate rule reads, unchanged leverage/fees reuse and rejection after real expiry.

Historical receipt timing and every failing account response are not retained, so the changes do not claim that all previous stale cycles had one cause. Genuine transport delays and expired evidence remain fail-closed. Adjacent persisted cycles independently show capacity evidence disappearing and later recovering, rather than a permanently missing account configuration.

## Files and functions

- src/decibel_production_live_orchestrator_v1.ts: evaluateDecibelEntryReplacementBenefitV1 compares common residual lots, preserving full proposed-size preflight and reserve.
- src/decibel_session_capacity_projection_v1.ts: readDecibelSessionCapacityProjectionV1 assembles the latest evidence after asynchronous receipt production.
- src/run_decibel_production_web_v1.ts: readProjectedSessionSnapshot uses that projection order.
- src/decibel_production_live_state_source_v1.ts: refreshAccountRiskInputs gives background stages the correct lifetime.
- tests/decibel_production_live_orchestrator_v1.test.ts: exact two-order economic replay, partial residual checks, delayed projection, and supervisor-owned background refresh regressions.
- tests/fixtures/entry_replacement_stall_v1.json: sanitized persisted decision evidence for cycle 332322.

No DCA, TP, sizing policy, leverage, Max Loss, Capital, Volume, economic thresholds or strategy settings were modified.

## Verification and deployment

Five focused replay/publication/rule-lifetime tests passed. Authoritative reconciliation and HTTP recovery suites passed (17 tests). Typecheck, build, changed-file formatting and lint pass. Required repository format/lint checks remain blocked by the pre-existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts files. Full npm test production-core stage: 807 passed, 2 failed because Chrome presentation tests cannot launch in this environment. The chained authoritative reconciliation/HTTP stage was run separately and all 17 tests passed.

Implemented locally on the existing non-main branch; no commit or deployment. Production journals and settings were read only. No orders were placed or canceled, and no process was restarted. At inspection time the journal already reported these two orders CANCELLED_EXTERNALLY and the session ENDED; the historical fixture preserves the requested earlier stalled observation. That later production state was not caused by this task.
