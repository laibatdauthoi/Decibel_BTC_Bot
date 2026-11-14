# Practical Capacity Finalization

This update tightens the existing calculator and read-only NEXT SESSION estimate.
It does not authorize or connect estimated capacity to live execution or sizing.
The prior read-only authorization remains respected. No production mutation,
restart or commit was performed.

## Final Calculation And Cost Provenance

For the practical branch, let A = min(configured Capital times the unchanged
collateral allocation fraction, authenticated free margin). Let G be the greater
of 5% of configured Max Loss and valid observed transaction cost estimates.
Let F = 10% of A. Maker and taker fees each use max(10 bps policy floor,
fresh authenticated applicable rate). Adverse selection uses max(8 bps,
fresh applicable observed adverse selection). The 8 bps floor supersedes the
previous 5 bps assumption and exceeds the historical 7.5596953 bps estimate.

    adverseMoveBps = max(100, 2 * recentMidpointRangeBps)
    lossBps = adverseMoveBps + makerFeeBps + takerFeeBps + 25 + adverseSelectionBps
    marginCapacity = max(0, A - F - G) /
                     (max(1/configuredEffectiveLeverage, 1/actualLeverage) +
                      (makerFeeBps + takerFeeBps + 25)/10000)
    riskCapacity = max(0, MaxLoss + min(0, netPnLAfterFees) - G) / (lossBps/10000)
    aggregateLimit = floorToBtcLot(min(marginCapacity, riskCapacity,
                     twoSidedDepthWithin25Bps, existingVenueAndSafetyCeilings))

Target volume is not an input to risk capacity. Max Loss comes from the supplied
Settings/snapshot, with no USD 2 default. Worst-case existing, pending and inflight
exposure is reserved separately when deriving headroom, without netting opposite
resting orders. Known higher valid costs can only reduce capacity. Invalid cost
units/provenance are rejected; stale/future observations do not qualify as facts.
Returned diagnostics distinguish policy estimates from applied observed costs.

The existing economic artifact can supply authenticated maker fees; optional
authenticated taker rates are now retained if a producer supplies them with source
and timestamps. This is not a new taker fee producer. Applicable regime-specific
adverse-selection and successful-transaction gas P95 estimates remain labeled
estimates, never authenticated future costs. Historical FX completeness or exact
future gas proof is not required for this preview.

## Approval And Hard Safety Boundary

No fresh production reads were performed in this update. Previously available
artifact data is stale: maker fee 1.5 bps, no taker fee, adverse-selection estimate
7.56 bps and successful-transaction gas estimate USD 0.0004687676. These values
cannot qualify current live safety. The 30-second modeled exit horizon and
100-bps stress floor remain policy assumptions, not measured guarantees. The
earlier tiny depth probe does not qualify larger aggregate exit sizes.

Actual user leverage is still missing for flat accounts in the current position
feed. Fresh post-fill venue margin/tier/liquidation verification and accepted
latency/stress/cost policy remain necessary before any live connection. Estimated
costs are permissible for modeling but cannot override those venue requirements.
Existing certificate-based live gating, executable projection, ACTIVE immutable
snapshots, loss enforcement, quote sizing and canonical unwind remain unchanged.

The next live approval must cover the numeric stress/fee/slippage/reserve policy
and possible exposure increase, backed by current mandatory venue inputs. With
synthetic Capital 8, margin 10.22, verified leverage 40, BTC price 80000, lot
0.00001 and unchanged collateral allocation 0.5, the illustration below uses a
non-strategy ceiling of 1000 solely to expose calculator behavior:

| Settings Max Loss USD | Risk Capacity USD | Estimated Aggregate Limit USD |
| -------------------- | ----------------- | ----------------------------- |
| 1                    | 62.09             | 61.60                         |
| 2                    | 124.18            | 118.40                        |
| 3                    | 186.27            | 116.80                        |
| 5                    | 310.46            | 112.80                        |

Each result is identical across targets 50, 100, 200, 1000 and 5000. At larger
Max Loss the margin constraint binds and the proportional transaction reserve
increases, so aggregate capacity need not increase monotonically. These are test
illustrations, not executable production limits. Existing production safety
ceilings were not raised.
