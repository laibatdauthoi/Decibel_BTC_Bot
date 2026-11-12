# Overview Targeted Refinements

## FILES_CHANGED

- web_dashboard/src/main.tsx
- web_dashboard/src/styles.css
- web_dashboard/src/overview_v1.test.ts
- docs/decibel_overview_refine_v1.md and five screenshot artifacts under docs/overview_refine_v1/

No backend, trading engine, data aggregation, production Settings, session, journal or execution file was changed in this task.

## EXACT_UI_CHANGES

- Existing 7 x 7 quote marker now has a 1px current-color outline and transparent center. Its dimensions and BUY/SELL colors are preserved.
- Share Card is anchored to the Bot State panel (20px from its right edge, 24px above its bottom) rather than the narrower 560px text group. Button padding/minimum height/font are approximately 1.5 times their previous values. Bottom space is reserved within the existing group to avoid content overlap.
- Session group precedes the operational group immediately after the existing headline. Field order: Target Volume, Progress, Elapsed Time, Capital, Session PnL, Max Loss, Current Action, Position, Open Orders, Last Action, Reason, then Share Card at the lower right.
- Removed the separator between these two groups. Preserved the existing headline separator. Group labels/values use 15.6px instead of 12px, with 18px line height, scoped only to Bot State. No global typography change.
- Progress retains its verified text/bar for fixed targets. No-session state is plain NO SESSION, without an invented empty percentage.
- Card 2 contains only its title and main value. Maker/taker subtext is removed in all states.
- Exactly five cards remain; no sections or diagnostics were added.

Source comparisons confirm the App, header/navigation/footer, Activity/Settings, market header and LIVE QUOTES section markup are unchanged. LIVE QUOTES marker geometry is unchanged; its fill alone changed.

## DATA_BINDING_CHANGES

Card 3 now reads telemetry.pnl.allTimePnl, independently of active-session identity and PnL. A numeric value requires complete=true plus a finite non-null valueUsd. Otherwise it displays NOT VERIFIED. It never reads session PnL as an all-time substitute. Session PnL remains inside Bot State and continues to drive the existing session cost/risk presentation.

All other bindings, session reset rules, UTC-day aggregation, history count, elapsed time, progress and Share Card generation are retained. Tests verify that session PnL changes and session end do not overwrite verified all-time PnL, and that incomplete evidence suppresses the numeric total.

## TITLE_RENAMES

| Card | New Title |
| --- | --- |
| 3 | ALL-TIME PNL |
| 4 | COST / 1M VOL |
| 5 | TODAY VOL (UTC) |

The cost and UTC-day definitions are unchanged and remain available in the existing tooltips.

## SCREENSHOT_VERIFICATION

Actual Overview component renders were captured in Chromium with the bundled fonts, using offline regression fixtures:

- [Before 1440 x 1000](overview_refine_v1/before_1440.png) / [After 1440 x 1000](overview_refine_v1/after_1440.png)
- [Before 1280 x 800](overview_refine_v1/before_1280.png) / [After 1280 x 800](overview_refine_v1/after_1280.png)
- [Stopped / NO SESSION](overview_refine_v1/stopped_1440.png)

Both viewport sizes were visually inspected: hollow markers align in the existing columns, fields follow the requested order, the enlarged button stays inside Bot State without overlap, and shortened titles/subtext removal do not increase card height. The header/footer wrappers in these offline fixtures are static; production App JSX was separately checked for exact equality. These are not screenshots of a live production session.

## TESTS_RUN

- 129 frontend/read-model/browser/reconciliation tests pass across six files. Overview has 18 passing cases, including field order, exactly five renamed cards, no maker/taker subtext, and independent verified/unverified all-time PnL.
- npm run typecheck: PASS.
- npm run build: PASS.
- npm run build:web-dashboard: PASS.
- Full npm test and repository format/lint checks were run; final results are recorded below.
- Changed-file ESLint and Prettier checks pass.
- Additional frontend tsc remains blocked by existing imported nullability errors in src/decibel_authenticated_passive_recycling_orchestrator_v1.ts; no web_dashboard diagnostics were emitted.

## LIMITATIONS

The all-time producer currently lacks complete cost/history evidence, so NOT VERIFIED is the expected real-data display until the producer can supply a complete total. No backend behavior was changed to manufacture an all-time value. No production service was restarted, no session was started/stopped and no orders were sent or cancelled. Exact live-production visual verification was not performed; provided screenshots exercise the actual component with offline fixtures.

Build fingerprint: 4f7ad1af07b366ea (123 covered files). Dashboard assets: index-DXgGkypl.js and index-OU6aAH1i.css. No commit or deployment performed.

Final repository verification:

- npm test: 1,227 passed, 5 failed across 40 files. The failures are the existing two authenticated-reader mocks lacking readMarketMetadata and three initialization/recovery stage cases. No new Overview failures remain.
- npm run lint: two untouched temporary-file project-service errors (.tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts). Changed-file lint passes after removing the unused taker display variable.
- npm run format:check: four untouched formatting failures (.tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json). Changed-file formatting passes.
