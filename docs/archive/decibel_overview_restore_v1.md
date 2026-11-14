# Overview Restoration

This report supersedes the presentation changes described in decibel_overview_ui_evidence_v1.md. Trading-engine changes and the existing canonical accounting projection have been retained.

## Restored Presentation

- Restored the original market-view class and its two-column CSS grid.
- Restored compact-market-price, BTC/USD, BID, ASK, SPREAD and the original price formatting.
- Restored LIVE QUOTES, SELL/BUY labels, L1 rows, midpoint divider, prices, quantities and existing colors. Quotes come from ladder, including when no session is active. They are not called open venue orders.
- Removed LIVE ORDERS, the diagnostics accordion, its additional headings and the entire overview-compact/overview-state-grid CSS override block added in the previous task.
- Restored the original five-card markup and visible card labels, including the original volume maker/taker and target lines. Metric definitions moved to tooltips rather than extra visible explanatory rows.
- Header/navigation, Activity, Settings and footer JSX are unchanged. Text comparison against the pre-correction source confirms this. All existing CSS preceding the previous override block is preserved exactly after normalizing line endings.

Git inspection found these dashboard files untracked, with no history entries. ce90f449ac433253 was a runtime source fingerprint, not a Git commit. Restoration used the source captured before the earlier edit and removed only the known presentation changes. No blanket git restore/reset was used.

## Bot State

The existing Bot State position and styles now contain only Bot Status, Current Action, Position with BTC quantity, verified Open Orders count, Last Action with time and journal outcome, and Reason. Pending submission/reconciliation comes from real journal statuses. An idle loop shows HOLD/WAIT. Planned quotes do not determine execution action. Missing account evidence affects position/order verification without hiding fresh market quotes.

## Five Metric Sources

| Card | Source |
| --- | --- |
| CAPITAL | Active controller session configSnapshot.capitalToUseUsd, otherwise current operator Settings capitalToUseUsd. This is configured trading allocation, not account equity. |
| SESSION PNL | overviewEvidence.sessionPnlUsd from canonical snapshot.sessionConfiguration.pnlUsd; only when controller, snapshot and execution session identities match. Realized + unrealized - trading fees; gas excluded, disclosed in the tooltip. |
| ALL-TIME PNL | Existing bot-scoped accounting history; numeric only when completeness evidence is present, otherwise NOT VERIFIED. Missing session evidence does not erase historical evidence. |
| MAX LOSS | max(0, -canonical session PnL) and the active session's immutable configSnapshot.maxLossUsd. Unknown usage is shown as ?, never fabricated zero. No active session shows NO SESSION. |
| TOTAL EXECUTED VOLUME | Matching canonical cumulative totalExecutedVolumeUsd, makerVolumeUsd and takerVolumeUsd from actual session fills. Snapshot replacement avoids replay accumulation; PLACE/CANCEL are not counted. |

## Freshness And Session Reset

Freshness is checked independently. Market prices/quotes use frame freshness plus book age, including time elapsed since receipt. Position/orders use authenticated account readiness and age. Bot session status uses the successful /api/session read time. Dynamic session accounting uses matching identity and the canonical snapshot's last successful cycle time. Stable configuration values and verified historical PnL do not share the market gate. The global degraded flag no longer blanks Overview.

A missing individual metric remains unknown without blanking the other cards. No active session shows NO SESSION for session-scoped totals. New session identities replace old totals; refresh/reconnect use existing authoritative snapshots and monotonic replacement. Canonical risk, fill history, accounting and protection obligations are never reset. No trading commands are emitted by refresh.

## Screenshot Comparison

Headless Chromium successfully captured actual Overview component renders with the bundled Fredoka font. Inputs are offline test fixtures; the browser did not connect to a production API. Header/footer wrappers in the fixture are static; their production JSX was verified separately by text comparison.

- [Before correction, 1440 x 1000](overview_restore_v1/before_correction.png)
- [Restored running, 1440 x 1000](overview_restore_v1/restored_running.png)
- [Restored stopped with planned quotes, 1440 x 1000](overview_restore_v1/restored_stopped.png)
- [Restored running, 1280 x 800](overview_restore_v1/restored_running_1280.png)

The same-viewport comparison shows the previous vertical presentation replaced by the original two-column structure, the return of BBO and BUY/SELL L1, five original cards, and removal of the additional accordion. The restored 1280 and 1440 renders were visually inspected.

There is no archived screenshot from before ce90f449ac433253, so pixel-identical equivalence to that original image is NOT VERIFIED. These screenshots compare the prior incorrect implementation with this correction, not an unavailable original production screenshot. No claim of complete visual equivalence is made solely from passing tests.

## Verification

- Frontend rendering/presentation plus independent order-reconciliation/HTTP-recovery tests: 117 passed across four files. Both existing Chromium checks pass when run with the child-process permissions required by the local browser.
- All 14 Overview tests pass, covering stopped, running/flat, LONG/SHORT, protective order count, planned quotes without a session, independent stale sources, missing PnL with valid other metrics, fill aggregate updates, cancel without volume, session replacement and replay/out-of-order snapshots.
- npm run typecheck: PASS.
- npm run build: PASS.
- npm run build:web-dashboard: PASS.
- Additional frontend tsc: blocked by existing nullability errors in src/decibel_authenticated_passive_recycling_orchestrator_v1.ts; no web_dashboard errors were emitted.
- npm test: 1,215 passed, 5 failed across 38 files. Existing failures: two authenticated BTC publication mocks lack readMarketMetadata; three initialization/recovery tests have outdated reader/stage assumptions. No execution logic was changed to address these.
- npm run format:check: fails on four untouched files: .tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json.
- npm run lint: fails on two untouched temporary files outside TypeScript project service: .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts.
- Changed-file ESLint: PASS. Changed-file Prettier and diff whitespace checks were also performed.

## Files Changed In This Correction

- web_dashboard/src/main.tsx
- web_dashboard/src/styles.css
- web_dashboard/src/overview_v1.test.ts
- tests/decibel_production_web_presentation_v1.test.ts
- docs/decibel_overview_restore_v1.md
- Four screenshot artifacts under docs/overview_restore_v1/

No backend, strategy, TP, ENTRY, risk-limit, execution, production Settings, session or journal file was changed in this correction. The previous telemetry projection, snapshot selector and test-script integration remain in place.

## Build And Remaining Limits

Source fingerprint: 9d4471b493728132 (120 covered files). Dashboard assets: index-oTJnsfhj.js and index-BgKpdNM4.css. Branch remains chore/production-cleanup-v1; no commit, deployment or production restart was performed.

Production fills, TP execution, session starts/stops and live reconnect/restart were not exercised. Offline tests verify their UI snapshot semantics. Complete all-time accounting evidence remains unavailable in the current producer and is displayed as NOT VERIFIED. Exact equivalence to the missing pre-ce90 screenshot remains unverified.
