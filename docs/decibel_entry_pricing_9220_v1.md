# ENTRY Pricing, Resting Comparison And TP Economics

**ROOT_CAUSE_ENTRY_PRICE** — Candidate selection minimized lifecycle cost bps.
With identical BTC quantity, a higher SELL price slightly increases the USD
denominator and lowers gas bps. It therefore selected the farthest ASK even when
closer candidates already passed admission. Selection now checks edge and the
existing lifecycle budget first, then prefers the most competitive maker price.
No fill probability, adverse fallback or distance threshold was introduced.

The recorded SELL placement had BBO 75,952.2 / 75,955.0, midpoint 75,953.6 and
regime distance multiplier 0.9. The 10.8092 bps ASK cost 2.7043357 bps versus
2.7044645 bps for the 4.50275 bps ASK. This difference is gas dilution, not a
measured execution advantage. Tick rounding contributes less than one $0.1 tick;
the subsequent market move increased the resting distance independently.

**ENTRY_PRICE_BEFORE_AFTER** — Exact recorded market/cost inputs; controlled
fresh adapter and unchanged quantities/limits in replay:

| Snapshot | BUY Before → After | SELL Before → After |
| --- | --- | --- |
| SELL placement, 1794016968506 | 75,919.4 → 75,919.4 | 76,035.7 → 75,987.8 |
| BUY placement, 1794022696682 | 75,661.0 → 75,661.0 | 75,789.8 → 75,736.8 |
| Resting review, 1794024735426 | 75,718.4 → 75,718.4 | 75,847.3 → 75,794.3 |

These are candidate prices, not submissions or fills. At the resting review,
BBO was 75,756.3 / 75,756.4; the older OPEN orders were still 75,661 / 76,035.7.
Their $374.7 gap is not a TP interval.

**ROOT_CAUSE_RESTING_KEEP** — The previous positive-continuation branch returned
KEEP and discarded the admitted candidate before comparing it. It now retains
the candidate and publishes `ENTRY_REPLACEMENT_ECONOMICS` per order. Comparison
subtracts remaining conditional costs and two new transaction gas reserves;
original placement gas is excluded. Admission budget remains a PLACE filter.

**KEEP_REPLACE_DECISIONS** — PID 9220 BUY 0.00043 BTC at 75,661 versus candidate
75,718.4 loses $0.0254160977 conditional surplus after $0.0007279272 cancel/place
gas reserves: KEEP. The SELL residual is 0.00047 BTC but the new admitted candidate
is 0.00043 BTC: KEEP because the quantities are not comparable. There is no silent
upsize. Both expected value and fill probability stay null. A favorable price
surplus farther from market still requires execution evidence; it is not EV.

**LIMITATION** — There is no trustworthy queue/fill-benefit producer in this
adapter. The comparison therefore does not authorize economic ENTRY replacements.
It makes the KEEP evidence explicit but does not resolve the existing OPEN-order
stall by guessing fill benefits. Existing safety cancellation, partial-fill
reconciliation, ACK/finality, restart ownership and mutation deduplication remain
the execution authority. No new replacement state, timer or cooldown was added.

**ROOT_CAUSE_TP** — The configured TP requirement is strictly net > $0. At
placement, 75,717.9 was the first profitable tick under the existing reserves:
estimated net $0.0000235194; one tick lower is negative. During the recorded review,
the adverse reserve had decreased and estimated net became $0.0005364959.
Near-zero net is a policy consequence, not a demonstrated units/rounding bug.
No new target profit was invented. Separately, the suitability review incorrectly
credited reduced execution distance as positive USD benefit. It now reports the
conditional PnL delta less new cancel/place costs. Sunk costs cancel in that delta;
closer distance alone cannot authorize repricing. Missing atomic replacement
capability continues to prevent cancelling confirmed TP coverage.

**TP_GROSS_NET_BREAKDOWN** — 0.00047 BTC LONG, basis 75,611.8, TP 75,717.9,
review 1793987998390; fee-reserve model 4.5 bps entry / 1.5 bps maker exit:

| Component | USD |
| --- | ---: |
| Gross PnL | +0.0498670000 |
| Entry fee reserve | -0.0159918957 |
| Exit fee reserve | -0.0053381120 |
| Two transaction gas reserves | -0.0007445188 |
| Adverse reserve, 6.65888144 bps | -0.0236972364 |
| Safety reserve, 1 bps | -0.0035587413 |
| Estimated net | +0.0005364959 |

The entry fee is a conservative current-rate estimate, not an authenticated
historical fill fee. Funding is unavailable, not asserted to be zero. These
limitations are explicit in the new breakdown. The recorded alternative TP
75,765.6 had estimated net $0.0229349626 and conditional delta after replacement
reserves $0.0216539479; it is farther away and lacks proven execution improvement
and atomic coverage continuity, so KEEP. No realized PnL claim is made.

**SIZING_EXPOSURE_FINDINGS** — Pending gross notional is
35.736779 + 32.534230 = $68.271009. Directional worst-case exposure is
max(0.00047, 0.00043) × 75,756.35 = $35.6054845, not zero and not gross pending
notional. It is below the $67.4231515 position limit, leaving $31.817667 headroom.
At the existing 40x leverage, gross pending margin reserve is $1.706775225;
the $2.5 strategy allocation leaves $0.793224775. Authenticated available margin
is separately $4.842113; equity was approximately $5.7. These fields have different
units/semantics and are consistent in this snapshot. No sizing, leverage or Max
Loss limit was increased.

**FILES_CHANGED** — Focused edits within the pre-existing dirty workspace:
`src/decibel_authenticated_passive_recycling_orchestrator_v1.ts`,
`src/decibel_smart_ladder_v1.ts`, `src/decibel_exit_economics_v1.ts`,
`src/decibel_production_live_orchestrator_v1.ts`,
`tests/decibel_production_live_orchestrator_v1.test.ts`,
`tests/fixtures/entry_pricing_9220_v1.json`, and this report. Production settings,
sessions and journal were not edited; journal extraction used SQLite mode=ro.
Existing unrelated changes were preserved. Two stale test assertions were
corrected: removed age/drift replacement policy and an undefined `evidence`
variable in an ORDER_OPEN fixture.

**REGRESSIONS** — Recorded PID 9220 placement/resting snapshots and LONG TP
boundary; PID 21704 RECONCILING-owner priority; PID 19884/34312 admission without
adverse reserves; PID 1620/26796/36080 retention; partial fills, coverage, Max Loss,
stale evidence, cancellation finality, restart ownership and duplicate mutation
suppression are covered by the focused suites. Repeated pure replay is identical.

**TESTS** — All five required npm commands were executed.

- Focused ENTRY/economics/orchestrator/authoritative reconciliation/HTTP suites:
  499 passed, one soak test selected out after its separate successful rerun.
- The 1,000-cycle soak passed alone in 15.97 seconds. An earlier concurrent run
  exceeded its existing 20-second timeout (20.35 seconds); timeout was not changed.
- `npm.cmd run typecheck` and `npm.cmd run build`: passed.
- Prettier and ESLint on every changed TypeScript file: passed; fixture formatting
  also passed. `git diff --check` on the changed tracked files passed.
- Full `npm.cmd test`: 1,099 passed, seven failures in three unrelated suites.
  Two presentation tests failed when sandboxed Chrome could not start its GPU
  process. Two telemetry and three session tests use reader mocks missing
  `readMarketMetadata`, failing at MARKET_METADATA before the intended assertions.
  Those reader implementations/tests were not changed by this task. The npm
  chain's reconciliation/HTTP tail was run explicitly in the focused command.
- Full `npm.cmd run format:check`: four existing formatting failures:
  `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`,
  `tests/fixtures/entry_cost_19884_v1.json`,
  `tests/fixtures/entry_simplification_36080_v1.json`.
- Full `npm.cmd run lint`: two existing project-service parsing errors in
  `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`. No lint rules were
  disabled, and unrelated user files were not deleted or reformatted.

**BUILD_FINGERPRINT** — `1272411b5a7b6a5e`, calculated by
`calculateDecibelSourceBuildFingerprintV1`, covering 118 production source/config
files. Production launch command remains `npm.cmd run decibel:production:web-v1`.
No deployment, restart or real-money venue mutation was performed. Replay does
not establish higher fill rate, realized PnL or lower realized gas spending.
