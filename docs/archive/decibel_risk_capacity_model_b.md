# Model B: Evidence-Gated Aggregate Capacity

This supersedes the V2 capacity formula in the earlier effective-exposure audit.
No Capital, Max Loss, leverage, production journal or immutable saved/session
snapshot is edited by this change. Legacy V1 behavior remains isolated. The persisted
maxPositionUsd field remains readable for historical compatibility, but is not a V2
strategy ceiling. Target and executed volume are not inputs to the capacity model.

## Verified Missing Production Evidence

The current source has BBO history and empirical candidate adverse-selection markouts
for quote economics. It does not certify size-dependent executable exit depth,
conservative taker exit cost, a stress window tied to measured unwind latency,
liquidation-distance/margin-tier headroom, reserved collateral or complete session gas.
No existing BBO markout or configured percentage is promoted into such a certificate.
No producer, environment override or CLI currently supplies capacityEvidence.
Consequently the production result is UNKNOWN / SESSION_CAPACITY_EVIDENCE_REQUIRED,
not a larger position limit. New strategic PLACE is blocked. Existing canonical
CANCEL/reduce-only IOC and reconciliation remain usable; missing capacity evidence
requests existing risk reduction rather than enabling new exposure.

## Formula

Let r=max(1/validated leverage, authenticated initial margin rate).
A=min(configured Capital * existing collateral fraction,
authenticated free margin + authenticated reserved collateral).
F=collateral reserve + liquidation reserve + conservative fixed exit/gas reserve.
Margin capacity=max(0,A-F)/(r+entry fee rate+exit fee rate+exit slippage rate).

Remaining loss=max(0,Max Loss+min(0,session PnL after fees)-session gas already paid-fixed exit cost).
Loss rate=empirical adverse move over the measured exit horizon + entry fee + exit fee
+ exit slippage + adverse selection. Risk capacity=remaining loss/loss rate.
Positive PnL does not expand the configured loss budget. Fees already in PnL are not
charged again as historical fees; modeled rates reserve future round-trip costs.
This stress estimate is not a guarantee losses cannot exceed Max Loss.

Aggregate limit=floor_to_lot(min(margin capacity,risk capacity,authenticated exchange
position limit,certified executable exit depth,existing non-strategy notional ceiling)).
Near-liquidation evidence insufficient to cover modeled move/cost blocks increases.
Invalid/missing/expired evidence blocks increases rather than falling back to $50.
The certificate must have explicit provenance, validity and horizon sources. No stress
percentage is selected in production merely to obtain a desired limit.

## Exposure And Integration

For signed position q, total unfilled BUY quantity B and SELL quantity S, maximum
possible inventory across fill subsets is max(abs(q+B),abs(q-S)). Opposite orders are
not netted away. Inflight PLACE quantities not already represented by exact client
or venue identity in open orders are included once. Headroom is separate from the
aggregate limit; it is not subtracted a second time from the displayed limit.
Strategy sizing and fresh submission preflight reserve aggregate headroom. Reduce-only
management is exempt from new-exposure gating and still validates exact position,
quantity, side, exchange constraints and existing reconciliation/identity guards.

NEXT SESSION GET Settings projection uses this same calculator and a new-session
accounting baseline, while still reserving actual current positions/orders. ACTIVE
uses its immutable session capital/loss/target, authenticated accounting and pending
journal intents. UI uses the backend projection and remains UNKNOWN without evidence.
Backend telemetry carries capacity blocker, binding constraint and numeric components.
No new settings/debug UI is added.

Quote sizing still reserves remaining V2 executed trading volume and pending orders,
floors to lot and refuses sub-minimum orders. Target crossing/unreachable residual
still invokes canonical unwind, which is not blocked by the strategy volume cap.
V2 maker/taker/open/close accounting is unchanged.

## Verification Interpretation

See [Production Evidence Pipeline](decibel_capacity_production_pipeline_v1.md) for
the implemented producers and remaining production qualification blockers.

Synthetic certificates in tests prove calculation and wiring only. They are explicitly
not production market estimates. With the supplied synthetic fixture and the existing
100 USD non-strategy ceiling, target 50/100/200/1000/5000 all produce capacity 100 USD.
With available production inputs, all five produce UNKNOWN and no new exposure.
Before enabling larger production positions, a validated source must supply measured
exit-window stress, authenticated depth/tier/liquidation data, current fees and complete
gas accounting. Do not populate these fields manually to bypass the gate.
