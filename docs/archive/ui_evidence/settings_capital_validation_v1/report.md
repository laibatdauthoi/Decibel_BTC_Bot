# Settings Capital Validation Patch

FILES_CHANGED: `web_dashboard/src/main.tsx`, `src/run_decibel_production_web_v1.ts`, `src/settings_capital_margin_v1.ts`, `tests/decibel_operator_settings_v1.test.ts`, `tests/settings_capital_margin_v1.test.ts`.

VALIDATION_RULE: Compare positive capital against authenticated Available Margin in USD using decimal integer scaling (BigInt), without cent rounding or floating-point arithmetic. Equal amounts are valid. Stale/unknown/nonfinite margin fails closed. Frontend freshness uses the existing 15-second account evidence window; the POST boundary uses the supervisor's current authenticated freshness diagnostics and snapshot. Existing settings schema validation remains in place.

WARNING_DISPLAY: Replace the existing capital CHANGED small element with EXCEEDS AVAILABLE MARGIN. No stylesheet, grid, font, color or other UI changes. Screenshots confirm unchanged row geometry.

SAVE_DISABLED_BEHAVIOR: Native disabled state plus click-handler guard. Other invalid fields continue to block Save. POST handler validates before Store.update; absent evidence fails closed. Latest account evidence is read after receiving the request body. No session changes or order requests.

TEST_RESULTS:

- 56 focused settings/overview tests passed (including exact equality, extra decimal precision, exponent inputs, stale/unknown, falling margin, multi-field save, other validation, direct handler rejection and recovery).
- 86 presentation regression tests passed with Chrome outside sandbox.
- 7 browser interaction checks passed; see ui_regression.json (margin updates, stale/unknown, click/Enter, recovery, Discard).
- Production typecheck and build passed. Frontend Vite build passed.
- Frontend typecheck was run and failed on existing TypeScript errors in decibel_authenticated_passive_recycling_orchestrator_v1.ts and decibel_production_live_orchestrator_v1.ts; no errors in the patched frontend.
- Full format:check failed on four existing unrelated files. Scoped formatting and lint passed. Full lint failed on the existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts project-service errors.
- Full npm test was run; it reported telemetry (2) and session (3) failures, plus two Chrome sandbox failures subsequently resolved by the separate 86-test presentation run. The full run stopped producing output and was interrupted; no full-suite pass is claimed.

SCREENSHOT_VERIFICATION: invalid.png shows $8 > $5.44, orange warning in the original CHANGED slot and disabled Save. valid.png shows $5 <= $5.44, CHANGED restored and Save enabled. Both use the actual Settings component with isolated synthetic account data and blocked fetch requests; they do not claim a live account balance. Styles and row dimensions are identical. No production process was restarted or deployed.
