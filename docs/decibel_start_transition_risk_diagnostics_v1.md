# START Transition And Entry Risk Diagnostics

## START_CONFLICT_ROOT_CAUSE

Read-only retained `data/production_runtime/process_forensics.jsonl` records PID 29584 START requests at epochs 1794233401933, 1794246414732 and 1794246483965. Each has one REQUESTED event followed by REJECTED/HTTP 409. They are separate requests, not evidence of simultaneous duplicate dispatch. `stdout.log` lines 6675–6679 show the first rejection followed by STARTING and ACTIVE/RISK_BLOCKED.

The controller previously committed STARTING → RUNNING and called runtime activation inside the same try block. Any synchronous activation failure entered a catch that unconditionally attempted STARTING → BLOCKED. Since the row was already RUNNING, the second transition threw SESSION_TRANSITION_CONFLICT, masking the original error and reporting rejection while the owned session remained live. A deterministic regression injects an activation failure after commit and verifies this ordering. The original production exception was overwritten and cannot be identified from these retained events; the deployed source version and any independent database writer have not been reconstructed.

Authenticated evidence at the first rejection was 3025 ms old against a 5000 ms freshness window, marked READY. This does not support attributing that rejection to an account timeout. Later cycles independently alternate between stale evidence and risk rejection.

## START_TRANSITION_FIX

The existing exclusive controller queue and persisted recovery lease remain the transition owners. In-flight START calls join one promise; owned RUNNING sessions are returned idempotently. HTTP responses distinguish ACCEPTED_STARTING, ALREADY_STARTING and ALREADY_ACTIVE. Pre-admission failures remain BLOCKED or REJECTED_TRANSITION and require another explicit operator request.

A request receives its eventual session ID before admission. That ID is the transition ID in audit records and HTTP responses, and persists in the session row across restart. Activation failure after committed RUNNING returns admission with an explicit readiness blocker; it cannot attempt a rollback through STARTING. Runtime readiness is separately available in session diagnostics. Reconciled abandoned STARTING sessions reach RUNNING before recovery activates their loop.

The dashboard reads authoritative session state before presenting a delayed failed HTTP response. ACTIVE diagnostics suppress historical Start rejection. No dashboard rows, banners or layouts changed. No automatic START resubmission was added.

## RISK_BLOCKED_EXACT_PREDICATE

For dynamic ENTRY, `evaluateTradingDecision` rejects when risk capacity is missing/nonfinite, or:

`abs(positionBase + sideSign * (sameSidePendingQuantity + candidateQuantity)) * candidatePrice > riskCapacityUsd + 1e-9`

`riskCapacityUsd = lossRemainingUsd / (lossBps / 10000)`

`lossRemainingUsd = max(0, maxLossUsd + min(0, netSessionPnlAfterFeesUsd) - sessionGasPaidUsd - fixedExitCostUsd)`

`lossBps = adverseMoveBps + entryFeeBps + exitFeeBps + exitSlippageBps + adverseSelectionBps`

The new diagnostic identifies SESSION_PROJECTED_STRESS_LOSS, exact candidate and projected exposure, margin, allocation, headroom, session PnL components when available, Max Loss, modeled remaining budget/costs, projected loss when the model is available, required evidence and ages, and the exact failing predicate. It is attached to the decision and emitted at finalPlan rejection. Missing risk capacity is preserved as missing rather than substituted with zero.

## RISK_BLOCKED_ROOT_CAUSE

The displayed exposure headroom is the executable margin/depth/venue ceiling, not the independent stress-loss ceiling. A candidate below the first ceiling can legitimately exceed the second. Existing tests explicitly require this independent hard-risk rejection. A synthetic $15 candidate with $11.91 risk capacity is rejected on both sides; raising only the synthetic risk capacity to $100 removes this predicate's rejection.

The historical production logs omit candidate quantity/price, risk capacity and its complete loss-model inputs at rejection. Therefore the precise historical numeric comparison cannot be reconstructed honestly. Flat position, zero pending exposure, $5.437078 free margin, $2.50 allocation and approximately $75–76 headroom alone do not establish risk eligibility.

## ENTRY_FIX_OR_JUSTIFIED_BLOCK

The independent stress-loss rule is retained. Max Loss does not determine the preferred entry size: FIXED TARGET remains max($10, Target Volume / 20), followed by venue minimum, lot rounding and executable margin sizing. The risk capacity is evaluated separately afterward. No leverage, risk limit, margin, TP, maker/post-only or reduce-only guard was weakened. Existing dynamic sizing bypasses the obsolete configured position ceiling through its established sizing-policy path; this change does not remove any further gate without evidence it is obsolete.

## AUTHENTICATED_READ_FINDINGS

Retained stderr includes OPEN_ORDERS timeout epoch 1794245516120 → 1794245525135 (9015 ms against 9000 ms), with worker abort. This occurred separately from the START request epochs above. Low queue latency in neighboring transport diagnostics does not prove the timed-out request's network latency; those transport fields are last-completed observations.

The supervisor consolidates concurrent account refreshes. Publication checks abort and owner generation after awaited reads; account freshness uses the read-window start, and late worker replies have no pending request to resolve after timeout/abort. Failed refreshes preserve only the original snapshot's remaining freshness window. No timeout or TTL was extended. The worker client retained abort listeners after completed requests; every settlement path now removes its listener, and timeout clears its timer. Tests use local mock servers and temporary databases.

## FILES_CHANGED

- `src/decibel_production_session_controller_v1.ts`
- `src/decibel_production_session_v1.ts`
- `src/decibel_session_control_diagnostics_v1.ts`
- `src/run_decibel_production_web_v1.ts`
- `src/decibel_trading_decision_v1.ts`
- `src/decibel_risk_capacity_v1.ts`
- `src/decibel_production_live_orchestrator_v1.ts`
- `src/decibel_authenticated_http_worker_client_v1.ts`
- `web_dashboard/src/session_start_request_v1.ts`
- `web_dashboard/src/settings_v1.test.tsx`
- `tests/decibel_production_session_v1.test.ts`
- `tests/decibel_production_live_orchestrator_v1.test.ts`
- `tests/decibel_authenticated_http_worker_client_v1.test.ts`
- This report.

The workspace already contained extensive tracked and untracked work. No commit, reset, production START/STOP, live order or production journal mutation was performed.

## TEST_RESULTS

- Focused lifecycle/sizing/worker/reconciliation: 104 passed across five files.
- Focused Settings/worker: 25 passed. Exact BUY/SELL risk-predicate regressions: two passed.
- Final `npm test`: 1352 passed, three failed across 48 files. All 538 orchestrator tests passed. The failures are Chromium status rendering, Chromium Settings spacing, and PNG export timeout; Chrome launch/cache/GPU errors appear in the test output. Because production-core failed, npm's chained reconciliation command did not run in that invocation; those reconciliation tests passed in the separate focused run.
- `npm run typecheck`, `npm run build`, and `npm run build:web-dashboard`: passed.
- `npm run format:check`: failed on pre-existing `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`, `tests/fixtures/entry_cost_19884_v1.json`, and `tests/fixtures/entry_simplification_36080_v1.json`.
- `npm run lint`: failed on pre-existing project-service parsing errors for `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`.
- Formatting and ESLint passed for all 13 changed code/test files. No checks or lint rules were disabled.

An earlier full run also hit a short-deadline worker scheduling failure under load; the final run and focused worker runs passed with unchanged timeouts. Settings assertions were updated to expect the new passive GET after a rejected START, while asserting no second POST.

## BUILD_FINGERPRINT

Repository source fingerprint: `feabe4529820bf80`, covering 138 files, source timestamp `1794247356938`. Calculated by `calculateDecibelSourceBuildFingerprintV1`. This is not a deployment or a claim about PID 29584's loaded build.

## UNVERIFIED

Original masked production activation exception; full production loss-model operands at each historical rejection; production acceptance and ENTRY submission after deployment; network cause of the intermittent authenticated timeout. Production lifecycle and journals were deliberately left untouched as requested.
