# Model B Production Evidence Pipeline

## Implemented Sources And Boundaries

The existing Decibel REST/WebSocket order-book ingestion now preserves validated
full depth. The capacity producer sweeps both sides at the same explicit quantity,
checks ordering, crossed books, freshness and complete executable depth. Repeated
frames cannot extend freshness. Bounded exchange clock skew uses the existing
receipt-time normalization and retains the original exchange timestamp.

Authenticated account/position reads retain maintenance margin, margin deficit,
cross-margin ratio, user leverage and estimated liquidation price where supplied.
These observations do not prove post-order tier capacity. SDK defaults and market
maximum leverage/open interest are not substituted for authenticated tier rules.

Aptos committed user-transaction receipts provide gas used, gas unit price, success,
hash and ledger version. Reconciliation and gas accounting share a singleflight
cache of committed responses. Pending transactions are not cached as committed.
The read-only session transaction manifest includes attempted mutations, including
failed transactions and missing hashes. Gas accounting requires all receipts and
historical transaction-linked APT/USD provenance; current FX cannot fill gaps.

The exit-stress producer requires explicit policy, measured authenticated IOC exit
observations, complete timestamp coverage and nonoverlapping executable-depth
windows. Policy parameters are assumptions, not authenticated observations. It
does not substitute a single BBO markout for exit-window stress. Restart discards
in-memory coverage and blocks certification until coverage is rebuilt.

Certificate assembly requires every source, valid intersecting lifetimes and an
exit horizon supported by that lifetime. ACTIVE projection, submission preflight
and sizing consume the same report/certificate. A report without a certificate
invalidates a previously attached certificate. NEXT SESSION uses the same
calculator with its own accounting baseline; ACTIVE settings remain immutable.

## Read-Only Production Observation

Observed on 2026-10-26, without execution or journal/config/session writes:

- Session `session-1792946362640-ad852068-73df-443e-9b10-e3ea42732e61`,
  ENDED, settings revision 3.
- Authenticated equity, free margin and total margin: USD 10.222805 each.
- Position: zero; open orders: zero; maintenance margin and deficit: zero.
- Session manifest: two committed transaction receipts; total gas: 0.001154 APT.
  Historical USD gas valuation remains unavailable.
- Depth probe: 0.00061 BTC on each side; midpoint USD 80,677.55;
  BUY VWAP 80,677.60; SELL VWAP 80,677.50. This proves that probe only,
  not a permitted position capacity or a default position cap.

Capacity remains UNKNOWN and no production certificate is published. Required
unresolved evidence/policy: validated exit-horizon policy and measured IOC exit
coverage, verified post-order margin/tier/liquidation headroom, transaction-linked
historical FX, authenticated taker exit fees and a verified future lifecycle gas
bound. Existing successful-transaction gas estimates are not complete lifecycle
gas bounds. Existing fresh regime-specific BBO adverse-selection evidence can
contribute a cost component only; it cannot qualify exit stress.

These are missing validated adapters/inputs, not a claim that the venue can never
provide them. Do not insert fixture certificates or select policy parameters merely
to produce a desired capacity. Deployment alone will not remove these blockers.

## Verification

Synthetic certificate regressions exercise source completeness, freshness, depth,
volatility, tier boundaries, duplicate/conflicting data, failed transaction gas,
pending ACK handling, replay and deterministic calculation. They establish code
behavior only and do not qualify production evidence. Existing sizing/session
regressions cover pending exposure, partial fills and immutable session behavior.

Deploy backend artifacts only after reviewing the diff and the source prerequisites.
Use the existing controlled deployment process; no production restart or trading
action was performed during this change. Confirm fresh reports after deployment;
UNKNOWN must remain until every certificate requirement is satisfied.
