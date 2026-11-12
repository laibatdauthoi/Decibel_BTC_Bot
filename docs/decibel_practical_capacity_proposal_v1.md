# Practical Auto Position Limit Proposal

## Scope And Approval Boundary

The existing calculator now accepts observed inputs and deterministic policy
estimates without requiring historical certificates. This is a testable proposal,
not a production-enabled replacement. Automatic approval review rejected wiring
these estimates into live projection/preflight and removing the certificate blocker
because the specific parameters could increase exposure. Existing production
gating remains unchanged. No capital, leverage or Max Loss setting was changed.

## Proposed Policy (Requires Approval Before Live Integration)

- Modeled exit horizon: 30 seconds. This is a policy assumption, not measured latency.
- Adverse move: max(100 bps, twice recent observed midpoint range in bps).
  It is a stress estimate, not a statistical confidence bound or loss guarantee.
- Fees: 10 bps per entry/exit leg; adverse selection: 5 bps.
- Executable depth: smaller of BUY/SELL quantities within 25 bps of midpoint.
  The full 25 bps is reserved as exit slippage, not a claim about realized VWAP.
- Collateral reserve: 10% of eligible allocated collateral.
- Transaction/exit reserve: 5% of configured Max Loss, in USD.
  This does not assert gas completeness or guarantee transaction affordability.

Known higher costs must not be overridden by these estimates during eventual
integration. Existing economic, gas-affordability, margin, identity, reconciliation,
loss and reduce-only unwind checks must remain independently enforced.

## Formula

Let A = min(Capital * existing collateral allocation fraction, authenticated free
margin), R = 0.05 * Max Loss and F = 0.10 * A. The existing collateral allocation
fraction is not raised. With actual authenticated leverage L:

    marginCapacity = max(0, A - F - R) / (1/L + (10 + 10 + 25)/10000)
    stressBps = max(100, 2 * recentRangeBps)
    remainingLoss = max(0, MaxLoss + min(0, netPnLAfterFees) - R)
    riskCapacity = remainingLoss / ((stressBps + 10 + 10 + 25 + 5)/10000)
    limit = floorToBtcLot(min(marginCapacity, riskCapacity, twoSidedDepth,
                             existing non-strategy/venue ceilings))

Opposite resting orders are not netted. With signed inventory q, pending BUY B
and pending SELL S, worst exposure is max(abs(q+B), abs(q-S)) * midpoint.
Inflight intents participate once; callers must exclude those already represented
by venue orders. Headroom is max(0, limit - worst exposure), separate from the cap.
No estimated reserved collateral is credited back to free margin. Under existing
exposure this is intentionally conservative and can shrink aggregate capacity.

Missing/stale account or market data, missing actual leverage, unknown maintenance
margin/deficit, invalid depth and insufficient authenticated liquidation distance
block this proposal. Venue maximum leverage is not substituted for actual user
leverage. In particular, flat-account leverage discovery still needs a verified
source during integration; absence is not a license to assume 40x.

## Deterministic Comparison (Synthetic Inputs, Not Production Capacity)

Capital USD 8, Max Loss USD 2, free margin USD 10.22, verified leverage 40,
midpoint USD 80,000, BTC lot 0.00001, unchanged collateral fraction 0.5,
deep book, low observed range and non-strategy ceiling USD 1,000:

| Target USD | Certificate Required, Absent | Proposed Limit USD |
| ---------- | --------------------------- | ------------------ |
| 50         | UNKNOWN                     | 118.40             |
| 100        | UNKNOWN                     | 118.40             |
| 200        | UNKNOWN                     | 118.40             |
| 1,000      | UNKNOWN                     | 118.40             |
| 5,000      | UNKNOWN                     | 118.40             |

Margin capacity is approximately USD 118.64 before flooring; risk capacity is
USD 126.67. Quote size remains bounded by remaining trading volume, pending
orders, minimum order rules and all execution guards. These numbers do not prove
that production can safely trade USD 118.40 or that larger orders fill sooner.

The subsequent [Read-Only Integration](decibel_practical_capacity_readonly_validation_v1.md)
authorizes a separately labeled NEXT SESSION estimate only. ACTIVE preflight,
immutable settings, order sizing and canonical stop/unwind remain unchanged.
