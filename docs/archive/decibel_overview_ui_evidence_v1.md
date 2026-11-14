# Overview UI Evidence Repair

## ROOT_CAUSE

Overview rendered the proposed quote ladder under LIVE QUOTES, independently of venue order evidence. Session cards used the telemetry FIFO PnL projection, whose missing components were treated as zero in its partial value, rather than the canonical session risk calculation. Max Loss used that partial value and next-session Settings. Session identity was not checked before rendering these values. Settings loaded once. Disconnected/stale telemetry remained visible as ordinary live numbers. Equal-timestamp replay frames were accepted.

## OLD_VS_NEW_BOT_STATE

Previously: session status plus a long runtime field list and proposed quotes.

Now: Bot Status, Current Action, Position with BTC quantity, verified Open Orders, Last Action with journal update time/result, and a waiting/error reason. Runtime fields, dependency/readiness/protection diagnostics and explicitly labeled planned quotes remain in a collapsed Diagnostics section. Live Orders comes only from authenticated openOrders. Orders remain displayed as last observed when verification expires, including after STOP. Reduce-only is shown only when supplied by the venue state. Current Action is conservative: active submission can show PLACING; unresolved work shows RECONCILING; verified standing orders show KEEPING ORDERS. It does not infer REPRICING or TP management from a plan.

## FIVE_METRIC_SOURCES

| Metric | Source and definition |
| --- | --- |
| Capital | Active snapshot.sessionConfiguration.capitalToUseUsd when identity matches; otherwise operator Settings labeled CONFIGURED NEXT SESSION. This is allocation, not equity or available margin. |
| Session PnL | snapshot.sessionConfiguration.pnlUsd, matching authoritative active session and execution session IDs. Canonical realized + mark-to-market unrealized - trading fees; gas excluded. Missing evidence stays UNKNOWN. |
| All-Time PnL | Existing bot-scoped accounting history projection, displayed numerically only when complete. Current producer lacks full unrealized/gas/history evidence, so NOT VERIFIED is expected. No financial history is deleted. |
| Max Loss | max(0, -canonical session PnL) / active snapshot.sessionConfiguration.maxLossUsd. Same source is used for loss-utilization alerts. No ledger reset. |
| Total Executed Volume | Canonical sessionConfiguration cumulative totalExecutedVolumeUsd, makerVolumeUsd and takerVolumeUsd. Replaces snapshots; does not add events or count PLACE/CANCEL. |

## SESSION_RESET_SEMANTICS

No reset command, storage deletion, settings mutation or engine change was introduced. A session metric requires matching controller activeSession.sessionId, telemetry overviewEvidence.sessionId and runtime.executionSessionId. Ended/interrupted/no-session states cannot inherit old session totals. A new session gets the engine's own baseline. Refresh/reconnect reuses authoritative state. No local fill or PnL accumulation exists. Existing financial and protection obligations remain in their canonical stores.

## REALTIME_UPDATE_PATH

Canonical session accounting and authenticated venue snapshot -> existing telemetry mapper -> overviewEvidence plus orders -> existing /api/events SSE full snapshot -> monotonic timestamp selection -> React state -> Overview.

SSE reconnect waits for a valid snapshot and refreshes session/settings through read-only GETs. The existing two-second session refresh also refreshes Settings; no additional polling timer for market/fill data was introduced. Older concurrent session responses are ignored using request sequence. Malformed basic frame envelopes are rejected. Equal/older/invalid snapshot timestamps are ignored. A local one-second clock expires display evidence even when no new frame arrives. Connection failure, degraded state, old generatedAt or last successful cycle hides live metric values. Account readiness and authenticated state age gate venue verification.

## FILES_CHANGED

- src/decibel_production_web_telemetry_v1.ts: UI evidence projection and actual reduce-only flag.
- web_dashboard/src/main.tsx: Overview, freshness/reconnect/session display state, canonical loss alerts.
- web_dashboard/src/styles.css: compact responsive layout, text wrapping, remove inherited fixed overview decoration/height.
- web_dashboard/src/snapshot_v1.ts: monotonic snapshot replacement.
- web_dashboard/src/overview_v1.test.ts: actual React SSR evidence regression tests.
- tests/decibel_production_web_telemetry_v1.test.ts: canonical metric mapping assertions.
- tests/decibel_production_web_presentation_v1.test.ts: update diagnostics-location assertion for collapsed Overview.
- package.json: include new Overview tests in the existing production-core test command. Existing workspace edits retained.
- docs/decibel_overview_ui_evidence_v1.md: this report.

## SCREENSHOT_OR_RENDER_VALIDATION

React renderToStaticMarkup exercises the actual exported Overview component, including stopped/flat, retained orders, unknown venue state, active session metrics, LONG/SHORT -> FLAT, reduce-only order labeling, pending submission, stale data, session replacement and cancel without volume accumulation. Planned quotes must appear after the collapsed details element. Layout CSS has responsive 3/2/1 state columns and 5/2/1 metric columns, wrapping and automatic height.

No successful browser screenshot or pixel-level layout verification is claimed. Existing Chromium tests fail with Windows access-denied/GPU-process errors in this environment.

## TEST_RESULTS

Production typecheck, production build and Vite dashboard build pass. New Overview and targeted telemetry/diagnostics tests pass. Full repository verification was run; final counts are recorded below.

Format check fails on four untouched workspace files: .tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json.

Full lint fails on two untouched temporary files not included in TypeScript project service: .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts. Changed-file lint is checked separately.

Additional frontend tsc reaches pre-existing type errors in src/decibel_authenticated_passive_recycling_orchestrator_v1.ts; no remaining web_dashboard diagnostics were observed. Required production typecheck passes.

## BUILD_FINGERPRINT

Final source fingerprint and Vite artifact names are recorded below. Nothing was deployed or restarted.

## NOT_VERIFIED

No production session was started, no production Settings were changed, no orders were sent/cancelled and no journal or financial ledger was reset. Live partial-fill/TP-fill, venue reconnect, backend restart and real active-session recovery were not exercised against production. Offline tests validate snapshot presentation and identity/replay behavior; they are not live trading verification. All-time financial completeness remains unavailable and is explicitly shown as NOT VERIFIED. Browser pixel layout remains unverified because Chromium checks are blocked by the environment. Five unrelated authenticated-reader/recovery tests remain failing; no trading-engine changes were made to address them.

Final verification record:

- `npm run format:check`: FAIL, four untouched files listed above. Changed-file Prettier check: PASS.
- `npm run lint`: FAIL, two untouched temporary files listed above. Changed-file ESLint: PASS.
- `npm run typecheck`: PASS.
- `npm test`: FAIL; latest complete run: 1,207 passed, 8 failed across 38 files. One obsolete diagnostics-location assertion was subsequently updated and rerun successfully. The remaining failures consist of five authenticated-reader/recovery cases and two Chromium environment cases. The chained authoritative-order/HTTP-recovery test stage was also run independently rather than left unexecuted.
- Follow-up Overview + telemetry + authoritative order reconciliation + HTTP recovery: 140 passed, 2 failed. Both failures are the unchanged mock `readMarketMetadata` cases. All nine new Overview render/replay tests pass.
- Targeted canonical metric mapping: both target-semantics versions pass. Updated diagnostics-location test passes.
- `npm run build`: PASS.
- `npm run build:web-dashboard`: PASS.
- Additional frontend typecheck: no web_dashboard errors; blocked by existing imported trading-module nullability errors.
- `git diff --check`: PASS (Git emitted line-ending notices on pre-existing workspace changes).

Build identity:

- Source build ID: `ce90f449ac433253`, 120 covered files.
- Dashboard JavaScript: `index-py2rEBzi.js`.
- Dashboard CSS: `index-DYQ6b8jv.css`.
- Branch: `chore/production-cleanup-v1`. No commit or deployment performed; the workspace already contained extensive unrelated edits before this task.
