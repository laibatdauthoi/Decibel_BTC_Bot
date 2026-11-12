# Bot State Font And Share Size Patch

## FILES_CHANGED

- web_dashboard/src/styles.css: only field font/line-height, existing share-size variable and SVG dimensions.
- web_dashboard/src/main.tsx: replace the thin export SVG with a Share 2 equivalent (three circles/two diagonal links).
- web_dashboard/src/overview_v1.test.ts: assert the three-circle SVG and stroke width.
- This report and verification artifacts in docs/bot_state_share_scale_v1/.

## FONT_ADJUSTMENT

Both labels and values: 13.26px * 1.1 = 14.586px. Line height: 18px * 1.1 = 19.8px. Font family, weight, color, field order and text are unchanged. Label/value column gap remains 12px; row gaps and group gap are unchanged. Title/headline typography is untouched. Existing grid alignment automatically centers the taller list; no coordinates or new layout structure were introduced.

## SHARE_BUTTON_ADJUSTMENT

The shared CSS size changes from 2.75rem to 4.125rem, exactly 1.5 times both width and height. Measured size: 61.875 x 61.875px, compared with the prior 41.25px square. SVG dimensions change from 1.4rem to 2.1rem, keeping the same icon/button proportion. The inline Share 2 equivalent uses three circle nodes joined diagonally, stroke-width 2.5, currentColor and no new dependency.

Existing border, palette, hover/focus/disabled behavior, tooltip, aria-label and export function are unchanged. The same zero-width grid track centers the larger button on the horizontal-rule endpoint; its reserved space grows automatically from the existing shared size variable, preserving clearance.

## SCREENSHOT_VERIFICATION

Actual mounted React App in Chromium, using isolated local test responses and bundled fonts:

- [Before 1440 x 1000](bot_state_share_scale_v1/before_1440.png) / [After 1440 x 1000](bot_state_share_scale_v1/running_1440.png)
- [Before 1280 x 800](bot_state_share_scale_v1/before_1280.png) / [After 1280 x 800](bot_state_share_scale_v1/running_1280.png)
- [Measured geometry and native keyboard/download verification](bot_state_share_scale_v1/verification.json)

Both widths were visually inspected. Measurements confirm font scale 1.1, button scale 1.5, three SVG circles, stroke 2.5, column gap 12px, and button-axis error 0px. List/Share vertical-center error is at most 0.5px due to the existing border. At 1280px, gaps above/below the list are 77.72px / 76.72px; at 1440px, 148.72px / 147.72px. Field/button clearance remains 15px; neither overlaps nor exits Bot State. Native Tab, Enter and Space still work; two PNG downloads completed, with no non-GET API calls.

Source comparisons confirm App/header/navigation/footer, market header, LIVE QUOTES, all five metric cards, Activity/Settings and shareCard are unchanged. Reversing the four intended CSS value substitutions reproduces the exact previous stylesheet.

The screenshots use offline test data, not a live production session. Only 1280/1440 widths were revalidated in this patch. The previously reported 1100px global separator issue is outside this patch and remains unchanged. Temporary harness files and the local test server were removed/stopped. No backend, API, session state, trading logic or production data was changed.

## TEST_RESULTS

- Frontend/presentation/PNG/browser/reconciliation/HTTP regressions: 125 passed across five files. Overview's 18 cases pass.
- Native browser geometry/keyboard/download check: PASS.
- npm run typecheck: PASS.
- npm run build: PASS.
- npm run build:web-dashboard: PASS.
- Changed-file ESLint and Prettier: PASS.
- Additional frontend tsc remains blocked by existing imported nullability errors in src/decibel_authenticated_passive_recycling_orchestrator_v1.ts; no web_dashboard errors were emitted.
- Full repository test/format/lint results are recorded below.

No commit, deployment or production restart performed.

Final repository checks:

- npm test: 1,226 passed, 6 failed across 40 files. Five are the previously observed authenticated-reader/recovery failures. One additional orchestration test (1000 fresh admission cycles) hit its existing 20-second timeout during the complete run; running that unchanged test separately passed in 15.38 seconds. No test timeout or engine code was modified.
- npm run format:check: four untouched formatting failures (.tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json).
- npm run lint: two untouched temporary-file project-service errors (.tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts).
- Changed files pass formatting/lint. The temporary local server is stopped and its HTML harness has been removed.
