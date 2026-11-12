# Inventory exit lifecycle: incident and offline changes

## Evidence boundary

Read-only production journal and runtime log reconstruction, PID 26824, session
`session-1793116030054-d0a3e8fd-5148-4a64-8adc-98b56952c8da`. SQLite was opened
with `readonly: true, fileMustExist: true`. No production journal, Settings,
session, process or mainnet orders were changed. The local runtime endpoint
returned an old cached snapshot; it is not a fresh venue-position verification.

The sanitized incident fixture is
`tests/fixtures/decibel_inventory_exit_incident_v1.json`. Recorded fills are:

| Quantity BTC | Price USD | Execution timestamp ms | Recorded transaction version |
| --- | --- | --- | --- |
| 0.00072 | 80466.8 | 1793116093691 | 7789286361 |
| 0.00019 | 80407.6 | 1793116740129 | 7789388557 |
| 0.00013 | 80346.7 | 1793117521062 | 7789521413 |

These fragments were read from existing authenticated ingestion records. Their
historical transactions were not fetched again. The historical authenticated
position `entry_price` was not persisted in the decision snapshots inspected.
Do not label the reconstructed weighted average as a newly authenticated
position field. Candidate 80353.8 was recovered in decision 1793117599909;
80431.2 is operator-reported and its exact decision timestamp was not recovered.

## Profitability, with numbers

Weighted average from these recorded opening fills is 80440.9721153846 after
inventory reaches 0.00104 BTC. Assuming this matches the venue position basis,
the existing conservative model gives:

| Proposed SELL price | Quantity BTC | Estimated net PnL USD |
| --- | --- | --- |
| 80577.4 | 0.00104 | +0.0338191373 |
| 80431.2 | 0.00104 | -0.1181027566 |
| 80353.8 | 0.00104 | -0.1985319945 |

These are conditional calculations, not historical authenticated PnL. The
existing 0.00091 TP at 80577.4 estimates +0.0294771545 under the same basis.
Inputs recorded in this episode: maker 1.5 bps, taker 4.5 bps, gas estimate
0.0004583624 USD/operation, adverse-selection reserve 5.79383670486129 bps,
safety reserve 1 bp. Entry fees are conservatively reserved at the larger
current maker/taker rate, not asserted to equal the fee actually paid.

The unchanged TP minimum policy is strictly positive estimated net PnL:

`q * (sign * (exit - basis) - basis * entryFee / 10000
     - exit * (exitFee + adverseReserve + safetyReserve) / 10000) - 2 * gas > 0`.

Quantity is validated in integer chain/lot units. USD results are estimates.
The shared assessment now reports exact missing basis/fee/account/cost inputs,
resting and proposed PnL and the zero minimum separately. Missing or stale
inputs return UNKNOWN. `TP_EXPECTED_NET_BENEFIT_KIND` explicitly identifies the
execution-distance proxy. Positive distance improvement is not profit proof or
a fill-probability estimate. Generic replacement benefit now reports a comparable
TP net-PnL delta less replacement gas rather than silently substituting distance.

## Why quantity replacement reused the old price

The planner prioritized `EXIT_COVERAGE_UPSIZE`, replacing its desired price with
the current TP price before the price-suitability review. Quantity and price
were therefore conflated. Upsize cancellation also lacked a complete prospective
profitability/readiness check for its replacement.

Price candidate and exact coverage quantity are now carried separately. A
profitable price that passes the existing sustained/materiality checks can be
composed with the quantity transition. Otherwise quantity repair retains the
existing price only if the larger TP remains proven profitable and executable.
Missing evidence preserves the existing confirmed coverage instead of destroying
it first. The existing time/tick policy is unchanged; no new cooldown is added.
The displacement window follows resting-order identity, price and remaining
order quantity. An inventory/basis update rechecks profitability immediately but
does not erase sustained displacement while the same TP rests. LONG/SHORT actor
replays cover growth precisely as the existing window qualifies, composing both
changes without extending a cooldown or reusing stale profitability.

After cancel ACK, fresh authenticated remaining inventory and economics are
checked again. Durable upsize-cancel provenance now participates in the existing
replacement-profitability guard across restart, without changing journal schema.
Emergency/risk-reduction paths remain independent of that TP guard.

## Multiple reduce-only capability remains unverified

Installed SDK 0.7.0 exposes market `min_size`, `lot_size`, order-level
`is_reduce_only`, and authenticated order history. The recorded BTC metadata
has lot 0.00001 and minimum size 0.00002 BTC. The incident delta is exactly
13 lots = 0.00013 BTC, about 10.45 USD, exceeding both that recorded size floor
and the bot's 10 USD entry policy. No special dust exception is assumed.

The [official UI description](https://app.decibel.trade/) confirms that
reduce-only orders reduce an existing position. It does not establish the full
coexistence/reservation/partial-fill behavior needed to admit a second TP here.
No production producer currently verifies those semantics. This is not a finding
that the venue prohibits multiple reduce-only orders.

Replay-only capability inputs demonstrate exact additional coverage planning
while retaining the old TP. Production ADD dispatch remains explicitly blocked
with `MULTIPLE_REDUCE_ONLY_CANONICAL_ADMISSION_UNVERIFIED`; the existing journal
single-owner claim is unchanged. Auto-review rejected a proposed concurrent
submission exception because authoritative venue proof was missing. It was not
applied. Actual production inputs have no such capability proof and continue
through the improved canonical single-order cancel/replace fallback.

Aggregate reduction preflight now checks resting quantity plus the new reduction
in integer units. Pending/unobserved intents still occupy the canonical owner;
they do not count as confirmed coverage or allow another submission. Excess
aggregate coverage pauses entry and requests reconciliation.

## Observed coverage gap

Original TP: `intent-224a238333b07c789aea70b7`, venue
`170141599249866108349184721734405718016`, SELL 0.00091 at 80577.4.
Cancel: `intent-408ea7ed6a4fff9fc080c328`, prepared 1793117531991;
SDK ACK 1793117535495. Parent TP terminal provenance appeared at 1793117543185;
cancel intent terminal provenance at 1793117544537.

Replacement: `intent-7594d437afc8fc47a959228a`, venue
`170141591643962505462831255812009099264`, SELL 0.00104 at 80577.4;
prepared 1793117554803, SDK ACK 1793117559759, first authenticated OPEN
1793117569328.

Parent terminal observation to first replacement OPEN observation is 26.143 s;
using cancel-intent terminal gives 24.791 s. Added entry fill to replacement OPEN
is 48.266 s. These are observation intervals, not exact on-chain cancel/activation
times, and need not equal the operator's different latency samples (19.958 s and
45.410 s). An SDK ACK never closes the unconfirmed-coverage interval.

Coverage telemetry distinguishes partial, zero, pending cancel/placement ACK,
aggregate conflict and unresolved dust. Gap duration is time since the first
observed unconfirmed-coverage state, not a claim of exact venue downtime; it is
UNKNOWN when freshness or restart history cannot prove duration. Entry pacing
remains blocked while any positive uncovered lot/dust remains.

## Unified inventory exit lifecycle

Inventory assessment is intrinsic. TP retains its net-profit requirement;
canonical position-limit, margin and explicit risk reductions use the existing
risk lifecycle, while session Max Loss always takes unwind priority. There is
no separate defensive execution policy or activation switch.

Continuous fresh adverse history uses the existing 30-second capacity horizon,
and the canonical effective exposure limit, already derived from remaining
Max Loss, authenticated PnL, fees, margin and transaction reserves. No separate
holding-risk calculator or allocation is used. Exceeding that limit reports
`HOLDING_RISK_POLICY_GAP`; it does not invent an earlier loss-taking threshold.
Existing Settings authorize exposure constraints and session termination, but do
not specify when adverse movement alone should realize a loss before Max Loss.
The remaining operator decision is that intermediate threshold and whether it
requires partial or full reduction. Until resolved, TP stays intact and existing
canonical risk reductions and emergency unwind remain available automatically.

Inventory assessment does not alter DCA or entry eligibility. Existing reduce-only,
integer-lot, no-flip, replacement preflight, terminal ACK and multiple-order venue
admission checks remain authoritative.

## DCA scope correction

The previous patch added entry restrictions after the original strategy evaluation:
it cleared the adverse direction's desired quote/ladder, removed its entry actions,
and generated `INVENTORY_RISK_ENTRY_PAUSED` cancellations. It also stored a signed
basis/market recovery anchor in `lifecycle_state`, retaining the restriction through
partial/full fills and restart. These additions were outside the intended exit scope
and have been removed, including the journal accessors and suppression tests.

Before those additions the disabled duplicate defensive branch returned the canonical
strategy evaluation unchanged. The corrected coordinator again returns that exact
evaluation, including entry eligibility, sizes and actions; inventory assessment remains
diagnostic. No older strategy guard was reverted. Canonical capacity/headroom, capital,
economic edge, freshness, incomplete exit coverage, position limits, Max Loss, risk
reduction, venue admission and execution ownership checks are unchanged. There is no
new DCA threshold, cooldown, recovery gate or activation flag. Existing production
journal contents are not read, migrated or deleted by this correction.

## Verification

Regression fixtures cover LONG/SHORT inventory, TP profitability, sustained
adverse and sideways prices, reversal, exhausted Max Loss, partial fills,
stale evidence, integer-lot no-flip limits, terminal ACK, unverified multiple
reduce-only admission and restart recovery. Current command results are reported
with this change; historical successful runs do not validate the current tree.

Current offline results (2026-10-28): production-core has 775 passing tests and
2 failing Chrome presentation tests (GPU process/access errors); authoritative
reconciliation, run separately because npm test stops at the failed core stage,
has 11 passing tests. The earlier suppression replay cases were replaced with LONG/SHORT DCA parity replays.
Typecheck and build pass. Focused ESLint and Prettier pass. Repository-wide
format checking fails on the pre-existing `.tmp_conflict_readonly.cjs`; lint
fails on that file and `.tmp_exact_evidence.ts` because they are outside the
TypeScript project. These unrelated temporary files were left unchanged.
No mainnet orders, active-session restarts, production journal writes or live
activation were performed.
