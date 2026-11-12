# Maker ENTRY And Breakeven TP Policy

Baseline: `1272411b5a7b6a5e`. Evidence: archived production snapshots in
`tests/fixtures/entry_pricing_9220_v1.json`; tests use controlled fresh adapters,
not historical execution authorization.

**ROOT_CAUSE** — The baseline chose the nearest admissible member of a fixed
distance grid, leaving valid closer prices unexplored. TP still charged adverse
selection as a cost, required strictly positive net, and retained a distant
proposed price even when a nearer breakeven tick existed. Resting comparison
rejected unequal quantities before evaluating the shared executable residual.
These are changes to execution policy, not proof of higher expected profit.

**FILES_CHANGED** — Five existing production modules:
`src/decibel_smart_ladder_v1.ts`,
`src/decibel_authenticated_passive_recycling_orchestrator_v1.ts`,
`src/decibel_exit_economics_v1.ts`, `src/decibel_order_action_v1.ts`,
`src/decibel_production_live_orchestrator_v1.ts`;
`tests/decibel_production_live_orchestrator_v1.test.ts`, and this report.
Pre-existing workspace changes and evidence fixtures were preserved.

**ENTRY_PRICING_BEFORE_AFTER** — Nearest maker price is derived from the existing
admission costs, with rate r = (maker fee + configured safety) / 10000:
BUY <= (midpoint - 2 × gas / quantity) / (1 + r);
SELL >= (midpoint + 2 × gas / quantity) / (1 - r).
Directional tick rounding and best bid/ask bound the result. Existing quantity,
minimum notional, maximum notional and production quantity constraints are
retained; ordinary admission still decides eligibility. Unknown costs do not
authorize a new quote. No adverse estimate or fill probability is used.

| Recorded snapshot | Baseline BUY → New BUY | Baseline SELL → New SELL |
| --- | --- | --- |
| Original SELL placement | 75,919.4 → 75,933.0 | 75,987.8 → 75,974.2 |
| Original BUY placement | 75,661.0 → 75,678.2 | 75,736.8 → 75,719.6 |
| PID 9220 resting review | 75,718.4 → 75,735.7 | 75,794.3 → 75,777.0 |

The original production SELL placement was 76,035.7 before the previous baseline
repair. These are replay candidate prices, not fills. Tests verify that a tick
closer fails the unchanged cost equation when the book is not the binding limit.
The lifecycle budget remains 11.25 bps.

**RESTING_KEEP_REPLACE_BEFORE_AFTER** — Unequal quantities now compare at
min(resting quantity, admitted candidate quantity), without resizing the real
orders or crediting the removed residual. New CANCEL + PLACE gas reserves total
$0.0007279272; sunk placement gas is excluded. PID 9220 results:

| Side | OPEN price / quantity | New candidate | Compared BTC | Conditional delta after replacement reserves | Decision |
| --- | --- | --- | ---: | ---: | --- |
| BUY | 75,661 / 0.00043 | 75,735.7 / 0.00043 | 0.00043 | -$0.03285695745 | KEEP |
| SELL | 76,035.7 / 0.00047 | 75,777 / 0.00043 | 0.00043 | -$0.11194111695 | KEEP |

SELL previously stopped at incomparable quantities; it now has a comparable
cost calculation. Neither closer distance nor a positive payoff farther away
is assigned a fill benefit. Queue evidence remains unavailable, and both
`fillProbability` and `expectedValueUsd` stay null. No proven economic replacement
is authorized for these orders. Consequently this patch does not establish that
hours-long resting orders will be replaced; it does not cancel by age.

**TP_NET_BREAKDOWN** — Policy is now net >= 0. TP admission, construction,
post-cancel revalidation and coverage candidate checks use that boundary.
Adverse reserve is zero and is no longer a prerequisite. Fresh venue fees, gas,
configured safety, basis and exact reducible quantity remain required.

For LONG 0.00047 BTC, basis 75,611.8, TP 75,717.9:

| Component | USD |
| --- | ---: |
| Gross PnL | +0.0498670000 |
| Entry fee reserve, 4.5 bps when actual fee is unavailable | -0.0159918957 |
| Maker exit fee, 1.5 bps | -0.0053381120 |
| Two transaction gas reserves | -0.0007445188 |
| Existing configured safety, 1 bps | -0.0035587413 |
| Adverse reserve | 0 |
| New estimated net | +0.02423373225 |

The old estimated net $0.000536495857 also subtracted $0.023697236393 adverse
reserve. Under the new policy, the old TP is not the closest breakeven price:
at the original placement BBO 75,592.5 / 75,613.2, the nearest valid tick is
75,666.4, estimated net +$0.0000347835; one tick lower has negative net. At the
later review BBO 75,681 / 75,683.3, maker passivity instead binds at 75,681.1.
The proposed quote no longer pushes a newly constructed TP farther away.

When complete authenticated fill applications reconcile to the current position
and average basis, actual USD entry charges replace the current-rate reserve.
Fees are allocated pro rata after partial reductions; a flip starts the new
residual basis. Complete fragment fees are accepted when the aggregate fee is
unavailable. Duplicate fills do not duplicate fees. Incomplete, future, foreign
market or mismatched history cannot be labeled an actual residual fee.
Historical transaction gas and position-attributed funding are not present in
this snapshot: gas remains estimated, funding remains unknown, not asserted zero.
No realized or guaranteed all-cost breakeven is claimed from these estimates.

**DEFENSIVE_EXIT_FINDINGS** — Existing canonical risk reduction can act before
Max Loss on an explicit reduction request, fresh authenticated margin deficit /
maintenance breach, position limit or reduction minimum-notional dead zone.
The new regression checks a fresh margin breach with PnL -$0.1 and Max Loss $2:
canonical defensive eligibility is true, remaining budget $1.9; stale account
evidence instead requires reconciliation. No venue order is submitted by this
test. The generic sustained-adverse-history branch still reports
`HOLDING_RISK_POLICY_GAP` when no intermediate-loss policy is defined. There is
no trustworthy independent signal-invalidation exit to activate; none was invented.

**RISK_AND_FINALITY** — Maker-only ENTRY, authenticated ownership/identity,
partial-fill ledger, hard exposure/margin/capital limits and Max Loss remain the
authority. No OPEN cancellation is based on admission budget or age. No duplicate
replacement path bypasses CANCEL ACK, authenticated finality and reconciliation.
Confirmed TP is retained because the adapter has no verified atomic replacement
primitive; a better hypothetical price is not permission to leave inventory
uncovered. No Settings/session/journal edit, deployment, restart or real-money
order submission/cancellation was performed.

**REMOVED_VS_ADDED_BRANCHES** — Removed/replaced the dynamic ENTRY distance target,
the equal-quantity-only comparison restriction, TP adverse reserve/prerequisite,
the proposed-TP-price floor/ceiling, and strict-positive TP checks. Added a pure
cost-boundary price calculation and pure attribution of existing authenticated
fill fees. Common-quantity normalization extends the existing comparison. No
service, persistent state, schema migration, cooldown, lease, timer, prediction
model or new approval layer was added.

**TEST_RESULTS** — All five required npm commands were run. Typecheck/build and
Prettier/ESLint for all modified TypeScript files passed. Focused orchestrator,
ENTRY economics, authoritative reconciliation and HTTP recovery suites passed
502 tests; the 1,000-cycle soak was selected out of that focused run because it
had already passed in the full npm run. The focused run includes PID 9220,
19884, 34312, 1620, 26796, 36080, 21704 reconciliation priority, partial fill,
TP coverage, restart, stale evidence, Max Loss, venue finality and duplicate
mutation suppression. Actual-fee tests cover fragments, pro-rata residual fees,
flip allocation, incomplete history and duplicate fill application. Exact-zero
TP is admitted, and adverse evidence from null through 10,000 bps does not
change the TP result.

The PID 9220 replay advances 100 snapshots by one second: planned PLACE=0,
CANCEL=0, REPLACE=0. Simulated elapsed time is 99 seconds; SELL age since its
PLACE intent advances from 7,766,920 to 7,865,920 ms, BUY from 2,038,744 to
2,137,744 ms. These are replay clock ages, not fresh venue measurements or ACK
ages. The separate 1,000-cycle dry-run soak asserts zero executor calls.
No replacement churn or duplicate mutation was observed in those fixtures;
this is not evidence of live fill performance.

Full `npm.cmd test`: 1,101 passed / seven baseline failures in three suites.
Two Chromium presentation tests cannot initialize the GPU process in this
environment. Two telemetry and three session mocks lack `readMarketMetadata`
and fail at MARKET_METADATA before the intended read-stage assertions. The
reconciliation/HTTP tail skipped by npm's `&&` chain was run explicitly in the
passing focused command.

Full `npm.cmd run format:check` still reports four existing files:
`.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`,
`tests/fixtures/entry_cost_19884_v1.json`,
`tests/fixtures/entry_simplification_36080_v1.json`.
Full `npm.cmd run lint` still reports two existing project-service parsing
errors in `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`. Those user
files and lint rules were preserved. `git diff --check` on modified tracked
files passed.

**BUILD_FINGERPRINT** — `b008d456e4352b99`, 118 production source/config files,
using `calculateDecibelSourceBuildFingerprintV1`. Production command remains
`npm.cmd run decibel:production:web-v1`; it was not launched.

**NOT_VERIFIED** — Live fill rate, live resting duration, realized PnL/gas savings,
historical entry transaction gas, historical entry fee for the archived LONG,
position-attributed funding and queue-loss/fill benefit of replacement. The
historical LONG uses the explicit conservative entry-fee reserve because those
actual fees were not recovered. Without proven execution benefit and atomic TP
replacement, the archived ENTRY/TP orders continue to KEEP. No prediction or
distance-as-profit proxy was introduced to force another result.
