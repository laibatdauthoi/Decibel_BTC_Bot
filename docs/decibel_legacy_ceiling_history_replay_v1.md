# Legacy Position Ceiling Removal And Read-Only Inventory Replay

Verified 2026-10-26. No production journal/config/session mutations, mainnet
mutations, restart, commit, or live policy activation were performed.

## Ceiling Provenance And Change

Saved revision 6 contains legacy `maxPositionUsd=50`. V2 already ignores that
field, but `DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD=50` was reused as both the
per-order execution guard and aggregate position ceiling through session limits,
runtime snapshots, ladder and preflight. This is configuration, not proof of an
exchange maximum or a calculated margin/risk limit.

The prepared practical policy now gives the existing calculator a natural gross
collateral/leverage upper bound: Capital * allocation fraction * configured
leverage. The calculator still applies fresh actual leverage, margin, Settings
Max Loss, stress/cost policy, depth and its existing mandatory checks. Target
volume and saved maxPositionUsd do not cap aggregate capacity in this branch.
NEXT estimate and executable projection use the same calculator. Runtime gives
sizing and preflight the calculated aggregate cap; the independent configured
per-order notional guard remains unchanged. Thus an order above $50 is still
rejected with the current per-order configuration. This task does not authorize
raising that independent guard.

New sessions capture optional `capacityPolicyVersion=1` only after the existing
code gate is approved/enabled. Old snapshots lacking the marker keep historical
behavior even if a later binary enables the gate. Saved operator settings are not
rewritten. Production gate remains false. Missing mandatory inputs remain blocked;
there is no executable fallback to a made-up $50 capacity in the new policy path.
Tests exercise gated integration with test-only module overrides, not production
activation. No calculator or certificate subsystem was added.

## Baseline And Complete Retrieval

Earliest available trusted stored baseline: sealed authenticated resync checkpoint
1788337839284 (2026-09-02 08:30:39.284 UTC), position 0 BTC, body SHA256
`e69d23751f85dbfab33a41c4a8827364f8cf323ffff840f77c29647b515d4086`.
The existing validator verified its seal. It references the prior canary manifest
and recycling journal source hashes. This is a historical checkpoint, not a new
venue assertion; history before this checkpoint was not reconstructed.

Authenticated SDK account history was fetched ASC, fixed end 1792988069614
(2026-10-26 04:14:29.614 UTC): 518 trade rows over three pages, 3,122 order rows
over sixteen pages. 517 unique BTC fragments, one other-market fragment excluded.
All BTC rows use OrderFill and supported OpenLong/CloseLong/OpenShort/CloseShort
inventory actions. All 33 original journal fills match uniquely by execution
identity, side, quantity and price; zero unmatched or ambiguous existing fills.
All four stored zero-position checkpoint boundaries replay to zero.

The pagination defect is fixed: a short page with an advertised larger total must
continue from its actual length, not stop or skip to offset+200. Empty incomplete
pages, conflicting totals and pagination exhaustion fail closed.

## Exact Residual And Replay

The BUY for intent-3a529abf809225414a140eb0 is already in authenticated_fills:
fill 128898875220580423760518836322307, 0.00014 @ 79320.8, version 7121429716.
Its reconciliation_fill_provenance is absent; inventory replay does not invent
terminal provenance or rewrite that intent.

Two important missing records (not the entire missing set):

| Action | Fill | Quantity | Price | Version |
| --- | --- | --- | --- | --- |
| BUY/OpenLong | 128898877329375817182005589901317 | 0.00014 | 79291.3 | 7121433962 |
| SELL/CloseLong | 128898884121914318665649968316422 | 0.00014 | 79291.8 | 7121446942 |

Official Aptos indexer user_transactions returned HTTP 200 for all three versions.
Timestamps match history at millisecond precision, providing an alternative to
pruned fullnode HTTP 410. Fill identity/quantity comes from authenticated Decibel
history; indexer sender is the matching-engine transaction sender, not proof that
it equals the operator's submission hash. No sender/submission hash conflation.
No new general indexer production reader was installed.

There are 484 missing BTC fragments in total, signed net -0.00014 BTC. Full
history signed net is 0. Fees net rebates across this BTC history are $1.422175;
this is historical fill fees, not complete gas, session PnL or a new risk budget.
The complete missing record list and exact provenance are in
[data/decibel_history_reconstruction_readonly_v1.json](../data/decibel_history_reconstruction_readonly_v1.json).
Raw paginated response evidence is in
[data/decibel_complete_authenticated_history_readonly_v1.json](../data/decibel_complete_authenticated_history_readonly_v1.json).

A readonly SQLite backup created isolated `data/.tmp_history_replay_atomic.sqlite`.
The existing applyFill boundary, wrapped in a new atomic batch method, appended
484 exact missing fragments in that COPY only: 0.00014 -> 0 BTC. Replaying again
reported 484 duplicates. Reopening the copy preserved 0 BTC. Conflicting batch
identities roll back the whole batch. No inventory reset/forced FLAT was used.
Fresh authenticated account at 1792988162647: position 0, open orders [], margin
$10.222805. It agrees with the history replay. Production inventory remains
0.00014 and production fill count remains 33.

This is an inventory reconstruction, not a production repair activation. Missing
history was deliberately not attributed to a session/maker status without proof;
strategy maker volume remains 438.20083 in the copy. Complete session accounting,
all terminal provenance, historical position state between fills, and gas are not
claimed repaired. The batch API has no production call site or automatic trigger.
It does not change STOPPING/ENDED or synthesize ACK/terminal status from FLAT.
Full production canonical repair therefore remains unapplied and is not declared
ready merely because inventory now reconciles in a copy.

## Deployment

Keep live policy gate false and current independent safety guards. Review the
isolated evidence/replay and attribution/terminal-provenance mapping before any
separately authorized production canonical repair. Review mandatory venue checks
and approve the live policy separately before enabling it for new sessions.
Deploying the code requires a later controlled process restart; none was performed.

## Verification Results

- npm test: 647/647 PASS (636 production core + 11 canonical reconciliation).
- Backend and dashboard typecheck: PASS.
- Backend and dashboard build: PASS.
- Targeted lint for all changed source/test files: PASS.
- Full format check: fails only on pre-existing .tmp_conflict_readonly.cjs.
- Full lint: fails only on pre-existing root .tmp_conflict_readonly.cjs and
  .tmp_exact_evidence.ts, outside ESLint project-service configuration.
- Production gate remains false; no production repair or activation performed.
