# Overview Session Metrics And Share Card

## FILES_CHANGED

- web_dashboard/src/main.tsx: requested Overview fields, circle quote marker, card order and bindings, local Share Card button.
- web_dashboard/src/styles.css: append-only rules for the marker, Bot State grouping/progress and Share Card button.
- web_dashboard/src/overview_share_v1.ts: net-cost presentation and local PNG generation.
- src/decibel_overview_metrics_v1.ts: read-only session count and UTC-day fill aggregation.
- src/decibel_production_web_telemetry_v1.ts: expose overviewHistory over the existing telemetry stream.
- src/run_decibel_production_web_v1.ts: supply read-only persisted session count to the UI mapper, at initial and refreshed snapshots.
- web_dashboard/src/overview_v1.test.ts, web_dashboard/src/overview_share_v1.test.ts, tests/decibel_overview_metrics_v1.test.ts, tests/decibel_production_web_telemetry_v1.test.ts: behavior, aggregation, PNG export and binding tests.
- package.json: include new regression tests in the existing production-core command; preserve existing workspace edits.
- This report and six PNG artifacts under docs/overview_session_metrics_v1/.

No trading strategy, risk limit, TP, ENTRY, execution policy or production engine behavior changed. No production Settings/session/journal data was edited. No session was started, no orders were sent/cancelled, and no production service was restarted.

## EXACT_UI_CHANGES

LIVE QUOTES now has a CSS circle marker instead of a plus, with the existing side colors and structure. The duplicated small BOT STATUS row is removed; the main status headline remains. Bot State contains the requested operational fields and a second compact group for target, progress with percent/bar, elapsed time, capital, Session PnL and Max Loss. A fixed numeric target has a progress bar; unlimited targets have no invented percent. Share Card sits at the lower right of the existing Bot State region, downloads a PNG, and is disabled without a fresh RUNNING session. No popup or sharing service is used.

Exactly five bottom cards remain, in this order: TOTAL SESSIONS EXECUTED, TOTAL EXECUTED VOLUME, SESSION PNL, AVERAGE COST PER 1M VOLUME, TOTAL VOLUME SINCE 00:00 UTC. Capital/Max Loss are inside Bot State. All-time PnL is removed from the bottom strip; no sixth card was added.

Text comparisons with the saved pre-change source confirm App (including header, navigation, footer and control wiring), Activity, Settings, the market header and LIVE QUOTES section markup are unchanged. Only the separate QuoteLine marker component changed. Existing CSS is preserved as an exact prefix; additions affect the requested quote marker and Bot State controls.

## DATA_SOURCES_USED_FOR_EACH_FIELD

| Field | Source / evidence |
| --- | --- |
| Headline | Authoritative /api/session state plus actual execution-loop health, runtime error and blocker. |
| Current Action | Journal SUBMITTING PLACE/CANCEL or unresolved execution statuses. Otherwise HOLD/WAIT, never a proposed quote. |
| Position / Open Orders | Authenticated inventory and openOrders, gated only by account readiness, source age and frame age. |
| Last Action | Most recent actual PLACE/CANCEL/REPLACE journal outcome with updated timestamp. |
| Reason | Session recovery blocker or actual runtime error/execution blocker/whyNoAction. |
| Target Volume | Active controller session's immutable configSnapshot.targetMakerVolumeUsd. |
| Progress | Canonical cumulative session executed volume / target; legacy target-semantics version 1 uses maker volume, version 2 uses total volume. Text may show an overshoot; visual bar is bounded at 100%. |
| Elapsed Time | Active session startedAt and the existing advancing UI clock. Missing session is NO SESSION; stale controller evidence is marked independently. |
| Capital | Active session configSnapshot.capitalToUseUsd; otherwise current configured Settings capital. |
| Session PnL | overviewEvidence.sessionPnlUsd from canonical sessionConfiguration.pnlUsd, with matching controller/snapshot/execution session IDs and fresh accounting. Realized + unrealized - trading fees; gas excluded. |
| Max Loss | max(0,-canonical Session PnL) / active configSnapshot.maxLossUsd. Unknown usage is not replaced by zero. |
| Total Sessions Executed | Read-only COUNT from the complete configured production_sessions_v1 table where started_at IS NOT NULL. Includes current/ended/interrupted sessions that reached RUNNING; excludes starts rejected before RUNNING. This avoids the existing 100-row paginated history cap. |
| Total Executed Volume | Canonical current-session totalExecutedVolumeUsd; maker/taker details use matching canonical aggregates. |
| Average Cost Per 1M Volume | Current-session net trading cost: -canonical Session PnL / canonical executed USD volume * 1,000,000. This includes both trading PnL and trading fees, as clarified by the user. Fees are already subtracted in canonical PnL and are NOT charged twice. Profit produces negative net cost. Missing PnL or zero/missing volume is NOT AVAILABLE. Gas is excluded and disclosed in the tooltip. |
| Total Volume Since 00:00 UTC | Sum quantity * price for verified bot-lineage authenticated fills in the configured canonical journal, using its accounting observed_at timestamp, on the current UTC day. Duplicate fill IDs are counted once; conflicting evidence is unavailable. Missing journal is UNVERIFIED, not zero. |

## HOW_RESET_AND_SCOPE_WORK

The existing SSE snapshot path is retained. Additional history fields are recomputed by the UI mapper and replace prior state, without a second polling stream or local financial accumulation. No financial store is reset.

PnL, volume, progress, cost and elapsed time belong to the current active session. Session identity changes cannot carry over prior totals. Refresh/reconnect replaces cumulative snapshots, with existing replay/out-of-order rejection. Count is lifetime within the configured bot session database. UTC volume is independent of session reset and is recalculated using floor(timestamp / 86,400,000), never local midnight. The frontend rejects a yesterday-dated daily aggregate at midnight until the current-day snapshot arrives.

Market, account, controller/session and accounting freshness remain independent. One missing metric does not blank valid target, capital, limits, quotes or other historical values. Reading the session-count database opens it read-only and never creates a missing file.

## TESTS_RUN

- Frontend, read-only metrics, browser presentation, independent reconciliation and HTTP recovery: 128 passed across six files. Includes real PNG signature/dimensions and one local download action under Chromium; 17 Overview cases; UTC boundary/deduplication; more than 100 persisted sessions; fee-inclusive net cost and missing-evidence cases.
- npm run typecheck: PASS.
- npm run build: PASS.
- npm run build:web-dashboard: PASS.
- npm test: 1,226 passed, 5 failed across 40 files. The unchanged failures are two authenticated BTC-publication mocks missing readMarketMetadata and three initialization/recovery reader-stage assumptions. The chained reconciliation/HTTP stage was additionally run independently.
- npm run format:check: blocked by four untouched files: .tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json.
- npm run lint: blocked by two untouched files not included in TypeScript project service: .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts. Changed-file lint passes.
- Additional frontend tsc reaches existing imported nullability errors in src/decibel_authenticated_passive_recycling_orchestrator_v1.ts; no web_dashboard errors were emitted.

## SCREENSHOT_VERIFICATION

Real headless Chromium renders of the actual Overview component, using offline regression fixtures and the bundled Fredoka font, were inspected at 1440 x 1000 and 1280 x 800. The fixtures do not contact production; header/footer wrappers are static and production App JSX was checked separately for exact equality.

- [Before, 1440](overview_session_metrics_v1/before_1440.png) / [After, 1440](overview_session_metrics_v1/after_1440.png)
- [Before, 1280](overview_session_metrics_v1/before_1280.png) / [After, 1280](overview_session_metrics_v1/after_1280.png)
- [Stopped with planned quotes](overview_session_metrics_v1/stopped_1440.png)
- [PNG exported by the actual Share Card function](overview_session_metrics_v1/share_card.png)

The renders show circles instead of pluses, one status headline, the requested fields/progress/button, exactly five ordered cards and unchanged two-column/BBO layout. Long new card labels wrap within their existing cells at 1280 pixels.

## LIMITATIONS

No live session/fill/TP/restart was exercised. Tests simulate authoritative snapshots and the canonical ledger; production services were not deployed or restarted. Average cost includes unrealized trading PnL and trading fees, excludes gas/funding, and is scoped to the current session. Daily volume uses canonical accounting observed_at; legacy fills without a venue timestamp may be bucketed by received/observed time. It covers verified bot-lineage fills in the configured journal, not unrelated external-account trades. Persisted session count covers the configured session store and does not infer deleted or external history.

Share Card downloads a local PNG; it does not publish to social platforms. Missing/stale fields remain explicitly marked in the exported snapshot. Complete browser screenshots of a live production session were not taken; provided screenshots are offline component renders.

Build fingerprint: 87dc7cbbfeb5e8e2 (123 covered source files). Dashboard assets: index-MHlv9oXe.js and index-BIq7nSVl.css. No commit/deployment was performed.
