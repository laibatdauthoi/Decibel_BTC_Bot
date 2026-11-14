# Bot State Centering And Share Icon

## FILES_CHANGED

- web_dashboard/src/main.tsx: group the existing fields and share control inside the existing ruled content container; replace button text with SVG and accessibility attributes.
- web_dashboard/src/styles.css: content-grid centering, shared rule-end alignment and compact icon button states.
- web_dashboard/src/overview_v1.test.ts: update accessible icon/disabled markup expectations.
- This report and screenshots/measurement evidence in docs/bot_state_center_share_v1/.

No backend, API, session data, trading engine or Share Card export function was changed. Temporary local test harness/server files were removed/stopped after verification. No production session was started and no trading mutation was submitted.

## LAYOUT_FIX

The existing .runtime-status-panel keeps the same width as its top horizontal rule. It now uses a grid: the original 11 fields are wrapped as a single flex group in the first track, and the share action occupies a zero-width second track. Grid alignment centers both vertically. The field-group gap remains 4px and each field's 13.26px font, 18px line height, weight, color, text, order and binding are unchanged.

The obsolete 64px bottom reservation for the old bottom button was removed. The Bot State content extends to its actual lower boundary, with symmetric rem-based block padding. Title, headline and rule retain their positions. There are no absolute top/left/right offsets for the icon.

## SHARE_ICON_AND_ALIGNMENT

The inline stroke SVG depicts an arrow pointing northeast out of an open square. No icon package was added. The native button has aria-label="Share Card", a descriptive title, aria-busy, and an aria-hidden/non-focusable SVG. No visible button text is rendered. Existing onClick, shareEnabled, sharing/disabled state and the shareCard async function are unchanged.

The center of the zero-width grid track is the same geometry as the right endpoint of the container's top border. The icon button is centered on that track; a gap reserves enough room so it cannot cover field values. Its square size is rem-based. Hover uses the existing black/cream palette; keyboard focus has a visible outline; the existing disabled opacity is retained.

## SCREENSHOT_VERIFICATION

These are real Chromium screenshots of the mounted React App with local offline test responses. Fetch was intercepted before mount; non-GET calls were blocked and asserted absent. No production endpoint was contacted. The existing workspace source and bundled fonts were used; no external reference image was used.

- [1440 x 1000](bot_state_center_share_v1/running_1440.png)
- [1280 x 800](bot_state_center_share_v1/running_1280.png)
- [1100 x 800, including the legacy separator limitation](bot_state_center_share_v1/running_1100.png)
- [Measured geometry and native keyboard/download results](bot_state_center_share_v1/verification.json)

At 1440: above-list gap 158.59px, below-list gap 157.61px. At 1280: 87.59px above and 86.61px below. The difference is the existing 1px border. List/icon vertical center error is below 0.5px. Horizontal button-center versus rule endpoint error is 0px at all three tested widths. Field-to-button clearance is 15px; the button stays inside Bot State. Font remains 13.26px. Native Tab focus passed. Native Enter and Space each completed one actual local PNG download, with 1200 x 900 dimensions. Both reuse the existing session-based filename.

Known narrow-breakpoint limitation: at 1100px the pre-existing market-view::after decorative separator uses 124px while the actual summary grid row is 92px. Its visible line is therefore 32px above the real Bot State lower boundary and can cross the last field. The new grid itself remains centered within the true Bot State bounds. This global Overview rule was not changed because that would affect LIVE QUOTES/metric-row presentation outside the authorized Bot State patch. At 1280/1440 the visible rule and true boundary coincide and no overlap was observed.

Source comparisons confirm App/header/navigation/footer, Activity/Settings, market header, LIVE QUOTES, metric cards and the shareCard function are unchanged.

## TEST_RESULTS

- Frontend/presentation/PNG-export/browser/reconciliation/HTTP checks: 125 passed across five files. Overview's 18 cases pass with icon-only accessibility/disabled expectations.
- Additional native browser check: Tab + Enter + Space passed; two completed PNG downloads, zero non-GET API requests; geometry and bounds checks passed.
- npm run typecheck: PASS.
- npm run build: PASS.
- npm run build:web-dashboard: PASS.
- Changed-file ESLint/Prettier: PASS.
- Additional frontend tsc is blocked by existing imported nullability errors in src/decibel_authenticated_passive_recycling_orchestrator_v1.ts; no web_dashboard diagnostics were emitted.
- Full repository test/format/lint final results are recorded below.

Build fingerprint: ffc615aae3d0b2b9. Dashboard assets: index-DsjN1-gM.js and index-BY3JacZE.css. No commit or deployment performed.

Final repository checks:

- npm test: 1,227 passed, 5 failed across 40 files. Failures are the existing two authenticated-reader mocks missing readMarketMetadata and three initialization/recovery stage cases. No new frontend failures remain.
- npm run format:check: four untouched failures (.tmp_conflict_readonly.cjs, src/readonly_exit_architecture_tmp.ts, tests/fixtures/entry_cost_19884_v1.json, tests/fixtures/entry_simplification_36080_v1.json).
- npm run lint: two untouched temporary-file project-service errors (.tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts).
- Changed-file format/lint pass. The temporary port 5193 listener is stopped and its workspace HTML harness has been removed.
