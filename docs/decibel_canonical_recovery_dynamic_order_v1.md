# Canonical Recovery And Dynamic Per-Order Integration

## Result And Boundaries

Implementation completed for the independently verifiable changes. Production
journal/config/session files were only read; no live transactions, restart,
exposure-gate activation or commit. This report supersedes the previous statement
that an independent $50 per-order limit must remain in the NEW practical path.
The existing legacy path and old immutable session snapshots remain unchanged.

## Canonical Recovery

Inputs: the sealed zero-position baseline at 1788337839284 and the previously
retrieved authenticated 517 BTC fragments / complete paginated order history.
Full order ID AND client order ID matching (not OR) yields:

- 490 fragments with unique immutable intent/session ownership.
- 25 fragments without an exact matching intent. These are UNATTRIBUTED, not
  automatically classified as manual or foreign.
- 2 fragments with ambiguous immutable intent ownership:
  - 129026115413905161512434371395587: intents
    intent-3926db3f0e8e4e56f1c33b00 and intent-d74e4c1ae3506fd078b0972f.
  - 129164222053605458099793742528513: intents
    intent-66734eacaac2030deb16808a and intent-49be2dcfc63de3832f6b8f9f.
- All 517 have exact matching terminal order history with zero remaining quantity
  and timestamp at/after execution. This does not fabricate a submission receipt
  or equate a matching-engine transaction hash with the operator's submission.
- Current journal nonterminal intent query: zero. These discrepancies are
  historical; no current unresolved mutation was identified by this query.

The existing resync module now produces a pure deterministic recovery plan. It
validates the sealed baseline, quantities, transaction versions, ordering,
duplicates, aggregate order fill quantity and terminal identity. It does not
invent session IDs. The manifest preserves exact execution IDs, fees, executed
volume, timestamps, versions, ownership candidates and terminal facts. It records
historical session execution totals separately; it never rewrites historical
session snapshots or marks historical targets completed.

A verified canonical ingestion defect was fixed: session accounting previously
used the first matching lineage row, silently accepting ambiguous ownership. It
now matches the full client identity and rejects ambiguous ownership. Fill
insertions are staged and applied through the existing atomic batch boundary;
contradictory records cannot partially commit the batch. Restart/exact replay are
idempotent. Existing wrong-client identity checks remain fail-closed.

Fresh readonly backup `data/.tmp_canonical_recovery_review.sqlite` replayed the
484 missing fragments through the atomic boundary: inventory 0.00014 -> 0 BTC;
repeat inserted 0 / duplicate 484; restart remained 0 BTC. This inventory-only
copy does NOT apply unresolved attribution, liquidity classification or historical
session accounting. Its strategy maker volume remains 438.20083. Fees and volumes
are retained in the manifest, not invented as journal maker/taker state. Complete
production accounting repair is therefore NOT ready. Do not copy this SQLite
file over production.

Exact records and integrity hashes:

- `data/decibel_canonical_history_repair_plan_v1.json`: all 517 execution records
  with exact 27 unresolved records and their candidate identities/blockers.
- `data/decibel_canonical_recovery_evidence_manifest_v1.json`: hashes of source
  history/plan, ownership, historical session execution facts, current nonterminal
  query and isolated replay results. approvedForProduction=false.
- `tests/fixtures/decibel_historical_recovery_v1.json`: captured normalized history
  for deterministic regression only; it is never a production evidence source.

Review sequence: resolve the 25 missing lineage records and two ownership
collisions using original signed intent/submission/adoption provenance; preserve
any unavailable facts as blocked; separately reconcile maker/taker attribution
and submission receipts before applying a production canonical plan. The current
manifest is reviewable, not authorized to apply.

## Per-Order Ceiling And Formula

Exact legacy source: DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD=50. It flows through
source snapshot maximumNotionalUsd, runtime projection, smart ladder,
calculateDecibelDynamicQuoteSizeV1 MAX_ORDER_NOTIONAL and
validateDecibelPlaceIntentV1 EXECUTION_PREFLIGHT_NOTIONAL_ABOVE_MAXIMUM.
The source field is a configured bot ceiling, not authenticated venue evidence.

For NEW immutable capacityPolicyVersion=1 sessions, behind the existing disabled
policy gate, runtime now publishes:

maximumOrderNotionalUsd = min(shared effective aggregate capacity,
                              verified venue maximum order notional)

The existing ladder/allocation and quote sizing then floor to lot the minimum of
proposed allocation, directional worst-case exposure headroom, authenticated
strategy margin * effective leverage, that order limit and remaining target less
pending reservations. Shared capacity already limits remaining loss budget,
executable BUY/SELL depth, costs and risk. Existing preflight, economic, identity,
reconciliation, stop/unwind, rounding and minimum-order guards remain. Reduce-only
canonical unwind retains its existing exact-reduction exemptions.

No target/2 position cap or arbitrary replacement USD constant was added. The
old ENV $50 is ignored as a strategic per-order cap only in the gated new policy
path. It remains effective for historical/unapproved paths. Sizing and execution
consume the same projected snapshot limits; NEXT executable projection uses the
same derivation and returns UNKNOWN when mandatory order evidence is missing.

Mandatory missing input: installed SDK 0.7.0 PerpMarketSchema exposes min_size,
lot_size, max_leverage, max_open_interest and market mode, but no verified maximum
order notional/size. max_open_interest is not an account/order maximum. No producer
was fabricated. New path returns SESSION_CAPACITY_VENUE_ORDER_LIMIT_REQUIRED and
maximum order 0 until this venue constraint is established. The optional evidence
field is populated only in synthetic tests, not production. Preview estimates
cannot authorize execution.

## Synthetic Comparison, Not Production Permission

Common test inputs: Capital 8, authenticated margin 20, leverage 40, midpoint
80000, lot 0.00001, deep two-sided book, allocation 0.5, synthetic verified venue
order maximum 10000, empty inventory/pending. Values are rounded by lot.

| Settings Max Loss | Target | Old per-order guard | New dynamic order |
| --- | --- | --- | --- |
| 1 | 50 | 49.60 | 49.60 |
| 1 | 200 or 5000 | 49.60 | 61.60 |
| 2 | 50 | 49.60 | 49.60 |
| 2 | 200 or 5000 | 49.60 | 118.40 |
| 3 | 200 or 5000 | 49.60 | 116.80 |
| 5 | 200 or 5000 | 49.60 | 112.80 |

The non-monotonic Max Loss result once margin binds is intentional existing
policy: transaction reserve = 5% of Settings Max Loss grows with Max Loss and
reduces margin capacity. No model rewrite or promises of faster fills. Regression
also lowers capital, margin, liquidity and loss budget; tests targets
50/100/200/1000/5000. These numbers are NOT a production executable projection.

## Policy Validation And Live Blockers

- Authenticated leverage 40 and fee rates maker 1.5 / taker 4.5 bps were verified
  in the prior readonly evidence capture. Freshness is still required at execution.
  Fee floor 10 bps per leg is conservative relative to those captured rates.
- Adverse-selection floor 8 bps exceeds the valid observed 7.56 bps; this is a
  conservative floor for that observation, not a bound for future adverse moves.
- 30-second exit horizon and max(100 bps, 2 * range) stress are policy estimates,
  not a validated historical tail/exit-latency guarantee. Approval remains needed.
- 25 bps exit slippage is enforced against current two-sided book coverage; depth
  can disappear during exit. It is not a guaranteed future execution price.
- 10% collateral reserve is a policy buffer, not a venue liquidation requirement.
- 5% Max Loss transaction reserve has not been proven an upper bound on complete
  future lifecycle transaction costs. It remains an explicitly unvalidated policy.
- Current-position maintenance/deficit/liquidation guards remain. Authoritative
  post-fill tier/liquidation validation for both directions at the larger proposed
  size has not been established by this work. Flat account state alone is not
  sufficient. No larger live position is approved.

Exact activation hunk, REVIEW ONLY, NOT APPLIED:

```diff
-export const DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED: boolean = false;
+export const DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED: boolean = true;
```

This hunk alone would still leave mandatory missing venue evidence blocked; it is
not a complete approved activation action. Preconditions: canonical accounting
repair approved/complete, authenticated venue order constraints and candidate
post-fill checks implemented/verified, policy explicitly approved, fresh inputs.
Only then can a new session capture policy version 1. Old snapshots remain old.
No ENV settings or risk budgets should be changed to force a result.

## Verification And Deployment

Full npm test: 652/652 PASS (641 core + 11 canonical). Backend/frontend typecheck,
backend/dashboard builds and targeted lint PASS. Formatting/lint full-repository
checks retain only the pre-existing root temporary file failures documented in
the previous report; changed files are formatted.

Keep the production gate false. Review the manifest and unresolved records first;
do not mutate production journal or restart during this task. Deployment later
requires a controlled process restart; code deployment must be separated from
any separately approved live policy activation. No commit was created.
