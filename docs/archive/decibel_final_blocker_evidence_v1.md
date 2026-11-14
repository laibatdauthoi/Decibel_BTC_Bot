# Final Blocker Evidence And Code Fixes

## Historical Evidence Recovered

Authenticated Decibel `order_history` and `trade_history` were read on
2026-10-26 (`observedAt=1792979918072`). In the requested historical window,
the responses contained 66 order events and 22 fills. Official Aptos GraphQL
`user_transactions` independently returned all three fill versions below despite
fullnode REST returning 410. Historical data availability is therefore not limited
to fullnode retention.

| Intent | Venue Order / Fill | Quantity / Price | Fill Ledger Version / Timestamp (ms) |
| ------ | ------------------ | ---------------- | ------------------------------------ |
| `intent-3a529abf809225414a140eb0` | `170141604320468511586446771042868264960` / `128898875220580423760518836322307` | BUY 0.00014 / 79320.8 | 7121429716 / 1788831238977 |
| `intent-11d11736b575ff13b58e3c01` | `170141599249866108057804583744577732608` / `128898877329375817182005589901317` | BUY 0.00014 / 79291.3 | 7121433962 / 1788831268242 |
| `intent-a8f2fc42587b1eaaa679f791` | `170141604320468511648367853035119968256` / `128898884121914318665649968316422` | SELL CloseLong 0.00014 / 79291.8 | 7121446942 / 1788831362507 |

Market, account, order/client identities, quantities, prices and timestamps agree
between the authenticated histories. Order history has matching FILLED events,
remaining zero, and the same fill versions. Indexer timestamps match to milliseconds.
The indexer transaction sender/entrypoint can be a counterparty bulk-order update:
a maker fill transaction is distinct from its order submission transaction.
For example the first order's OPEN event is version 7121429425, whereas its fill
is version 7121429716. Submission hash stored in the journal must not be labeled
as the fill transaction hash without independent proof.

The public indexer `events` query returned a deprecated-resource error; its current
query schema exposes no events table. `user_transactions` exposes version,
timestamp, sender and entrypoint, not a verified execution receipt/hash mapping
for these old submissions. Journal submission hashes
`0xe7d148017fbc35fcaaba6346586b61c3e0266830e2fad906d66c28c6a41d159c`
and `0x2295708c008ca5de5b9bee66091d85a00b7c0eeb1efce5fd175ea1100038ba55`
remain stored accepted outcomes, not newly verified archived receipts.

## Why The Scalar Cannot Be Reset

The journal's 33 ingested fills sum to +0.00014 BTC. The 22-fill historical
window includes many additional buys/closes, including manual fills, and nets
zero overall. Only two BUY fills from that window are present in the ingested
table. Importing the entire window's missing subset would change the scalar by
-0.00028 BTC, producing -0.00014, not zero. Importing just the later BUY/CLOSE
pair nets zero and cannot repair the +0.00014 residual either.

The pre-window journal baseline and all omitted historical fills therefore remain
unreconciled. No unique closing fill can legitimately be assigned to erase the
residual. Fresh venue FLAT is current position evidence, not a substitute for that
history. Production journal was opened read-only and remains untouched.

## Verified Defect Fixed At Existing Canonical Boundary

`reconcileAllDecibelAcknowledgedOrdersV1` and active identity-conflict resolution
previously wrote millisecond timestamps into `transaction_version`. The source
now propagates authenticated `trade.transaction_version`. Missing ledger versions
block provenance persistence; no timestamp fallback remains. Fragment aggregation
also rejects inconsistent transaction versions.

The existing `applyAuthoritativeReconciliation` transaction can correct only the
known legacy timestamp-as-version defect: already APPLIED, exact FILLED identity,
zero remaining, complete fill quantity, same fill/order/client/intent/quantity/
price, and old version equal to the exact authenticated fill timestamp. Unrelated
version/identity/quantity contradictions still fail closed. The correction is
audited, atomic, idempotent and does not create fills or alter inventory. Tests
verify rollback on a later conflict and replay across restart. This code was not
run against production journal state.

## Fresh Candidate And The Remaining USD 50 Constraint

Read-only worker/account/book/risk reads at 2026-10-26 03:50:25.646 UTC:

- Saved Settings revision 6: Capital 8, Max Loss 2; existing allocation 0.5.
- Selected/configured effective leverage 40; fees 1.5/4.5 bps, tier 0, discount 0.
- Free margin 10.222805, FLAT, no open orders; midpoint 79397.55.
- On-chain maintenance multiplier/divisor 1/2, i.e. BTC maintenance 1.25%.
- `DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD=50` in the existing environment.

With the proposed policy, margin capacity is USD 118.6441 and risk capacity is
USD 124.1830. The existing configured notional ceiling binds first. After lot
flooring, candidate is **0.00062 BTC = USD 49.226481**. The calculator previously
labeled that ceiling EXCHANGE; practical diagnostics now correctly label it
CONFIGURED_EXECUTION_NOTIONAL_CEILING. This is not a venue account position cap.
No existing ceiling was raised or removed.

For that candidate, local initial margin is USD 1.230662, maintenance 0.615331.
Using full cross equity minus 6 bps actual fee reserve and the explicitly assumed
USD 0.50 collateral/transaction reserves, modeled LONG/SHORT liquidation prices
are approximately 64570.37 / 93858.62. Strategy allocation remaining is USD
2.239802. These are local, policy-conditional calculations, not an authoritative
venue simulation or executable permission. A single current book cannot qualify
the 30-second stress horizon or establish tail-risk safety.

## Integration And Deployment

The existing calculator's gated branch now uses min(configured ceiling, verified
selected leverage) consistently for margin accounting. NEXT executable projection
and ACTIVE derivation use the current clock for practical input freshness, and
the practical branch does not inherit irrelevant historical-certificate blockers.
Sizing receives the same effective leverage and exposure limits. Test-only module
overrides exercise that branch for Settings Max Loss 1/2/3/5 and all target sizes;
production source gate remains false.

LIVE_INTEGRATION_READY = NO. Preconditions remain: complete baseline/historical
reconciliation, applicable post-fill venue constraints, explicit policy approval
(30s horizon, max(100bps,2x range) stress, 25bps slippage, fee floors 10bps/leg,
adverse selection floor 8bps, collateral reserve 10%, transaction reserve 5% of
Settings Max Loss) and explicit review of the configured USD 50 execution ceiling.
There is no unconditional justified larger live position size from this evidence.
No activation patch is prepared as an approved deployment action. Keep
`DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED=false`; do not change configuration,
restart, commit or trade as part of this work.
