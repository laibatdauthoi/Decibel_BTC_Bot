# Dynamic Entry Size V1

Implementation report, 2026-11-09. Changes are local and have not been deployed. No live session was started/stopped, no venue order was sent/cancelled, and no production journal was edited by this task.

## OLD_SIZING_ROOT_CAUSE

The legacy `deriveDecibelMaximumPositionUsdV1` included `maxLossUsd * maximumEffectiveLeverage`. The practical capacity calculator also selected the minimum of collateral capacity and a stress-loss-derived notional ceiling. Its effective position headroom then fed quote sizing and ENTRY admission. A session loss budget therefore indirectly selected per-entry quantity. The old transaction-loss reserve also entered margin calculations.

## NEW_ENTRY_SIZE_FORMULA

New sessions carry `sizingPolicyVersion: 1`.

- Fixed Target: `preferredEntrySizeUsd = max(10, targetMakerVolumeUsd / 20)`.
- Examples: targets $100 / $300 / $500 / $1,000 prefer $10 / $15 / $25 / $50 per entry.
- Until Capital Limit: the existing negative target sentinel means there is no fixed volume target. The separate formula is `max(10, capitalToUseUsd * maximumAggregateCollateralFraction / 4)`. It divides the existing configured collateral allocation across one initial entry and three possible additions. Leverage never enlarges this preferred allocation.

These values are USD notional per entry, not margin or a total position limit. Executable quantity can differ after lot rounding, actual margin constraints, and venue rules. For example, $15 at $80,000/BTC with a 0.00001 BTC lot rounds down to 0.00018 BTC ($14.40).

## VENUE_MINIMUM_HANDLING

The engine uses the actual market minimum quantity, lot step and existing tick rules. Where metadata supplies a minimum notional, it also applies. It rounds `max(minimumSize, minimumNotionalUsd / price)` upward to a valid lot to obtain the executable minimum. It raises a smaller preferred entry to that minimum only when execution capacity supports it. The $10 operator floor is never treated as the venue minimum.

## MARGIN_ADAPTATION

The entry calculator and existing dynamic quote budget share authenticated free margin, configured/actual leverage, existing collateral and execution-cost reserves, directional pending exposure, venue limits and remaining session-volume constraints. A preferred entry is reduced and rounded down when these execution constraints bind. A sub-minimum result produces no PLACE. Existing order collateral is credited only for the identified replacement reservation. Unresolved submissions retain their existing finality and duplicate-prevention gates.

Max Loss-derived transaction reserves remain in independent projected-loss risk assessment. New-policy margin calculations use validated observed transaction costs instead of deriving margin reserves from Max Loss.

## DCA_3_ADDITIONS_POLICY

The cycle is recovered from durable authenticated fills and the market opportunity stored in each PLACE intent. An initial authenticated fill is required before DCA. There are at most four filled opportunity groups: initial ENTRY plus three additions.

A new DCA requires all existing maker ENTRY, margin, exposure, risk, Max Loss and TP protection checks. It also requires:

1. A fresh venue market frame and coherent current depth.
2. An existing operational-regime classification from distinct observed market frames, using the existing volatility lookback and BBO freshness limits.
3. An adverse move below the previous filled reference for LONG, or above it for SHORT. The significance band is the maximum of current and previous opportunity spread and regime-adjusted realized volatility. The anchor also includes the previous opportunity midpoint, so the same movement cannot authorize another addition.
4. Verified bid and ask liquidity within that band sufficient for the proposed quantity.

There are no new fixed USD/tick/time triggers or cooldowns. Missing evidence produces specific blockers such as `DCA_VERIFIED_CURRENT_DEPTH_REQUIRED`, `DCA_VERIFIED_VOLATILITY_REGIME_REQUIRED`, `DCA_VERIFIED_LIQUIDITY_INSUFFICIENT`, or `DCA_NEW_ADVERSE_OPPORTUNITY_REQUIRED`. Ambiguous mixed-side fill sequencing blocks additions until evidence is reconciled; verified flat starts a new cycle.

The persisted opportunity records its identity, midpoint, observed time, source hash, regime, spread, volatility, significance band, verified depth quantities, reference price and original notional allocation. Authenticated partial fills and a bounded replacement remainder retain one opportunity identity. CANCEL/REPLACE itself consumes no addition. Repeated frames and same-price quote eligibility do not create a new DCA. Completing an original partial allocation cannot exceed that allocation. DCA submissions must be maker/post-only.

The initial ENTRY does not require a DCA trigger. TP reduce-only, coverage, capability and finality gates remain enforced. The current SDK still does not supply the existing proof of safe multiple reduce-only reductions; production DCA remains blocked with `POSITION_GROWTH_PROTECTION_CAPABILITY_UNVERIFIED` when that proof is absent. Tests use an explicitly hypothetical venue contract and do not fabricate production capability.

## MAX_LOSS_SEPARATION

The preferred-size function has no Max Loss or PnL argument. New-policy executable capacity excludes the stress-loss ceiling from sizing. The independently calculated projected loss budget is checked at ENTRY admission and authoritative maker preflight. An executable $15 proposal that violates that budget receives `RISK_BLOCKED`; it is not resized to a Max Loss-derived amount. Canonical session Max Loss stopping/unwind logic and thresholds remain unchanged.

## REMOVED_POSITION_LIMIT_PATHS

New Settings projections use `projectDecibelNextSessionEntrySizeUsdV1`. New runtime sessions use the versioned entry calculator through quote construction, directional admission, DCA and final preflight. Neither the legacy `maxLoss * leverage` ceiling nor the `STRESS_LOSS` capacity cap sizes a new-policy session. Legacy projection helpers and unversioned historical-session behavior remain for compatibility; new HTTP projections do not publish the old estimate.

## SETTINGS_UI_CHANGES

The existing left row and right summary now show ENTRY SIZE. The draft requests an independent executable projection; the right summary uses saved configuration or active-session quote sizing. Draft edits cannot change saved configuration before an authoritative Save response. Unavailable executable sizing displays UNAVAILABLE, warns beside Capital To Use and disables Save. The server revalidates executable entry capability before saving. Existing equity, margin, Max Loss and revision validation remains. Typography and panel structure are preserved.

## OVERVIEW_UI_CHANGES

Overview contained no Auto Position Limit label requiring a new card. LIVE QUOTES retain the existing display and receive the new lot-rounded quantity through the production quote engine. No extra Overview metric was added. Maker pricing, patient TP, fee/gas/funding accounting, Share Card branding/layout and navigation were not changed.

## HISTORICAL_COMPATIBILITY

Only newly created session snapshots receive `sizingPolicyVersion: 1`. Historical snapshots are read without upgrading or rewriting them. Legacy numeric fields remain readable but do not size new-policy sessions. Activity CONFIG distinguishes DYNAMIC V1/PREFERRED ENTRY for the new policy and retains original ORDER SIZE/MAX POSITION for historical sessions. Accounting, session PnL and executed-volume semantics remain unchanged.

## FILES_CHANGED

Files touched by this task, excluding unrelated pre-existing working-tree changes:

- `package.json`
- `src/decibel_entry_size_v1.ts`
- `src/decibel_dca_opportunity_v1.ts`
- `src/decibel_dynamic_quote_size_v1.ts`
- `src/decibel_operator_settings_v1.ts`
- `src/decibel_risk_capacity_v1.ts`
- `src/decibel_capacity_producers_v1.ts`
- `src/decibel_production_session_v1.ts`
- `src/decibel_execution_intent_v1.ts`
- `src/decibel_execution_lifecycle_journal_v1.ts`
- `src/decibel_authenticated_passive_recycling_orchestrator_v1.ts`
- `src/decibel_production_live_orchestrator_v1.ts`
- `src/decibel_trading_decision_v1.ts`
- `src/run_decibel_production_web_v1.ts`
- `web_dashboard/src/main.tsx`
- `web_dashboard/src/settings_v1.test.tsx`
- `tests/decibel_entry_size_v1.test.ts`
- `tests/decibel_dca_opportunity_v1.test.ts`
- `tests/decibel_practical_capacity_wiring_v1.test.ts`
- `tests/decibel_production_live_orchestrator_v1.test.ts`
- `tests/decibel_production_session_v1.test.ts`
- `tests/decibel_production_web_telemetry_v1.test.ts`
- `tests/decibel_production_web_presentation_v1.test.ts`
- `docs/decibel_dynamic_entry_size_v1.md`

Authenticated-read test fixtures were updated to supply mandatory venue metadata. Existing snapshot and presentation assertions were updated for the new sizing version and labels. Type-only nullable annotations also make the dashboard TypeScript check pass without changing quote policy.

## TEST_RESULTS

| Check | Result |
| --- | --- |
| `npm run format:check` | Fails on four untouched files: `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`, and fixtures `entry_cost_19884_v1.json` / `entry_simplification_36080_v1.json`. |
| `npm run lint` | Fails only on the two pre-existing root temporary files `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`, which are outside the TypeScript project service. |
| Targeted ESLint for files touched | Pass. |
| `npm run typecheck` | Pass. |
| Dashboard `tsc --noEmit` | Pass. |
| `npm test` | 1,331 pass; three Chromium visual/export tests fail in this environment. All 538 orchestrator tests pass. |
| Focused sizing/DCA/Settings/capacity tests | 98 pass across seven files; final sizing/DCA/quantity rerun: 40 pass. |
| Explicit authoritative reconciliation + HTTP recovery | 17 pass. Run separately because failing browser tests prevent the package script's second stage. |
| `npm run build` | Pass. |
| `npm run build:web-dashboard` | Pass. |
| `git diff --check` | Pass. |

The browser failures are the Settings status color and compact-spacing Chromium checks (GPU initialization/access-denied failures) and the Share PNG export Chromium timeout. None were skipped, disabled, or changed to hide failure. No lint rules or compiler safety checks were suppressed. Commands were invoked through `npm.cmd` because PowerShell blocks the installed `npm.ps1` wrapper.

## BUILD_FINGERPRINT

- Source build ID: `44655c130c2f17cc`.
- Covered source/configuration files: 138.
- Source timestamp: `1794227468607`.
- Dashboard asset: `index-LWMDfxmM.js` (CSS `index-CrTsc0tf.css`).
- Existing branch: `chore/production-cleanup-v1`; no commit was created. A focused branch could not be created because `.git` is read-only in this environment. Work remained off `main`.

## NOT_VERIFIED

Live venue submission, real fills, current operator capital/margin, deployed UI and production DCA protection capability were not exercised. The production session database, settings store and execution journal were not mutated. Chromium visual/PNG verification remains unsuccessful in this environment. Repository-wide formatting/lint remain blocked by the unrelated files listed above.
