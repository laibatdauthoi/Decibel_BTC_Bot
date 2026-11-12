# Bot State Offsets And Share Availability

## FILES_CHANGED

- web_dashboard/src/styles.css: three declarations on existing wrappers for the requested horizontal offsets.
- web_dashboard/src/main.tsx: strengthen the existing derived shareEnabled condition using already-available session evidence; no new state, API or component.
- web_dashboard/src/overview_v1.test.ts: verify RUNNING-but-unready cannot share despite fresh market data, plus identity, volume and session-start evidence.
- This report and screenshots/measurement evidence in docs/bot_state_share_offset_v1/.

No backend, trading engine, business data, session lifecycle or data binding was changed. App, header/navigation/footer, market header, LIVE QUOTES, all five metric cards, Activity/Settings and the complete Bot State markup are unchanged. The shareCard function, export module, tooltip and accessibility attributes are unchanged.

## BOT_STATE_OFFSET

The existing field wrapper gets 24px inline-start padding and a matching 24px width compensation. This moves every label AND value exactly 24px without shrinking their original column tracks. The column gap remains 12px. Font remains 14.586px; line-height remains 19.8px; family, weight, colors, row gaps, field text/order and vertical centering remain unchanged.

## SHARE_BUTTON_OFFSET

The existing action wrapper translates 24px horizontally, with no vertical translation. Square dimensions, Share 2 icon, stroke 2.5 and existing keyboard/PNG behavior remain unchanged. Moving fields and button by the same amount preserves their 15px clearance. At 1280px the button remains about 146px away from the LIVE QUOTES divider; it does not crowd that divider or overlap fields.

## EXISTING_SHARE_STATE_BEHAVIOR

The button already had enabled/disabled styles: enabled has full-opacity neutral dark border/icon; disabled uses opacity 0.45. Hover and focus-visible states already exist, so no redundant color/border styling was added.

Previously shareEnabled required a fresh authoritative RUNNING session and fresh telemetry frame, but could still be true when canonical share values were absent or the execution/session identities mismatched. The UI-derived guard now additionally requires matching active/controller/execution identity, fresh accounting, finite canonical PnL and executed volume, valid capital/loss limit/target/progress source, and a known session elapsed time. Verified zero PnL/volume are valid; absence is not replaced with zero.

The three cases are now distinct in availability: STOPPED/no session is disabled; RUNNING with missing canonical share data is disabled; RUNNING with complete current share evidence is enabled. This is not driven solely by fresh market data or a connected WebSocket. Transport freshness remains the existing protective gate. No export function or trading action was redesigned.

## SHARE_BORDER_ACTIVE_VS_INACTIVE

Native Chromium computed styles and screenshots confirm:

| State | Disabled | Opacity | Border / icon presentation |
| --- | --- | --- | --- |
| STOPPED / no session | true | 0.45 | Existing light gray appearance |
| RUNNING / canonical PnL unavailable | true | 0.45 | Same inactive appearance, cannot export |
| RUNNING / current share evidence ready | false | 1 | Existing dark neutral border and high-contrast icon |

All three test cases had fresh market data and CONNECTION: CONNECTED, proving that connection/market availability alone does not activate Share. The underlying 1px border color is rgb(22,23,24); disabled gray is produced by the existing opacity, not a new palette. Existing native hover/focus/disabled styling is retained.

## SCREENSHOT_VERIFICATION

Real Chromium screenshots of the mounted React App with isolated local test responses and bundled fonts, not a live production session:

- [Before 1280](bot_state_share_offset_v1/before_1280.png) / [Ready after 1280](bot_state_share_offset_v1/running_1280.png)
- [Before 1440](bot_state_share_offset_v1/before_1440.png) / [Ready after 1440](bot_state_share_offset_v1/running_1440.png)
- [RUNNING but Share unavailable, 1280](bot_state_share_offset_v1/unready_1280.png)
- [STOPPED / no session, 1280](bot_state_share_offset_v1/stopped_1280.png)
- [Measurements, state styles and keyboard/download results](bot_state_share_offset_v1/verification.json)

Measured label, value and button-center horizontal deltas are each exactly +24px at both viewports. Column gap remains 12px, field/button clearance 15px, field font 14.586px, line-height 19.8px, and button size 61.875px square. Vertical-center error remains at most 0.5px due to the existing border. List and button stay inside Bot State. Native Tab/Enter/Space still work; two PNG downloads completed in the ready case. Disabled cases produced no download when clicked. No non-GET API requests occurred. Temporary local harness files and server were removed/stopped.

Only these desktop viewports were revalidated. The previously reported narrow-width global separator issue is outside this patch and unchanged.

## TEST_RESULTS

- Frontend/browser/PNG/reconciliation/HTTP: 126 passed across five files, including Overview's 19 cases.
- Native browser offset/state/keyboard checks: PASS.
- npm run typecheck: PASS.
- npm run build: PASS.
- npm run build:web-dashboard: PASS.
- Changed-file ESLint and Prettier: PASS.
- Additional frontend tsc still reaches existing imported nullability errors in src/decibel_authenticated_passive_recycling_orchestrator_v1.ts; no web_dashboard diagnostics were emitted.
- Final full repository test/format/lint results are recorded below.

No commit, deployment or production restart was performed. No production Settings/session/journal data was edited and no order was submitted/cancelled.

Final repository verification:

- npm test: 1,228 passed, 5 failed across 40 files. Remaining failures are the existing two authenticated-reader mocks missing readMarketMetadata and three initialization/recovery stage assumptions; no new frontend failures remain.
- npm run format:check: four untouched formatting failures (.tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json).
- npm run lint: two untouched temporary-file project-service errors (.tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts).
- The final controller guard also requires the authoritative controller state itself to be RUNNING; recovery-blocked state cannot activate Share merely because a persisted active record still says RUNNING. This uses the existing session object, not a new state mechanism.
