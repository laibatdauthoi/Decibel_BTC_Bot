# Read-Only Practical Capacity Integration

## Authorization And Data Flow

Only the GET operator-settings response calls the practical estimated projection.
It consumes existing cached authenticated account observations and validated depth,
checks source timestamps against the current clock and returns a separate
`estimate.classification = ESTIMATED`. The original executable
`effectivePositionLimitUsd` remains independent and UNKNOWN without its required
evidence. No estimated value is copied into snapshots, ACTIVE preflight, strategy
sizing, session settings or risk gates. No new market requests are added.

Draft capital, loss and target query values affect this read-only estimate only.
Capital/loss affect capacity; target does not. Existing journal intents are read to
retain pending/inflight exposure, excluding orders already represented by exact
client/venue identity. The preview does not submit, cancel or write journal/config.

The dashboard distinguishes AUTO POSITION LIMIT · EXECUTABLE from ESTIMATED NEXT
SESSION LIMIT. The estimate tooltip identifies the policy assumptions and says
that the value does not authorize orders. Missing authenticated leverage remains
UNKNOWN, including flat accounts whose market-specific leverage is not returned.
Venue maximum leverage is never used to invent actual account leverage.

## Policy Validation Against Available Evidence

Local economic artifact observedAt `1792399415449` is historical/stale for this
review. It reports maker fee 1.5 bps with source
`DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES`, no taker fee, successful-transaction
P95 gas USD 0.0004687676, and regime-specific synthetic BBO adverse-selection
estimate 7.5596953 bps. None is promoted to fresh authenticated production evidence.
The earlier read-only production report in `decibel_capacity_production_pipeline_v1.md`
records a 0.00061 BTC depth probe and two committed receipts totaling 0.001154 APT;
those observations are historical comparisons, not a current approval.

| Assumption | Assessment | Minimum Requirement Before Live Approval |
| ---------- | ---------- | ---------------------------------------- |
| 30-second exit horizon | Unsupported: no measured complete IOC/unwind latency distribution is qualified | Measure submission-to-fill/terminal plus reconciliation, retries and cancel/close sequence; select a buffered horizon |
| max(100 bps, 2 x recent range) adverse move | Unsupported tail protection; recent range can miss jumps and sparse sampling | Establish accepted stress policy over the approved horizon, timestamp/coverage bounds and high-volatility response |
| 10 bps maker fee | Conservative relative to historical 1.5 bps only; current fee unverified | Refresh account fee rates; use at least the larger of policy and authenticated applicable fee |
| 10 bps taker exit fee | Unsupported: missing authenticated taker fee | Obtain applicable taker rate, account tier and any surcharges; do not substitute maker fee |
| 25 bps depth/slippage | Conservative relative to the earlier tiny probe (~0.0062 bps), unsupported for larger capacity or moving/thin books | Sweep both sides at the proposed aggregate exit size immediately before placement, with liquidity haircut and latency allowance |
| 5 bps adverse selection | Optimistic relative to historical 7.56 bps estimate | At minimum do not undercut fresh validated applicable adverse-selection estimates; assess together with stress to avoid inconsistent cost modeling |
| 10% collateral reserve | Policy buffer, unsupported as a substitute for liquidation/tier requirements | Verify actual leverage, maintenance/tier rules, collateral eligibility and stressed post-fill headroom |
| 5% of Max Loss transaction reserve ($0.10 at $2) | Conservative versus one historical successful transaction; unsupported for complete lifecycle/failed attempts or gas spikes | Bound cancel/close/retry transaction count and gas funding; account known costs without double counting |

Estimates are not loss guarantees. Current zero maintenance margin on a flat
account does not establish the future position's liquidation requirements. The
preview continues checking actual maintenance margin/deficit, authenticated
liquidation price for existing positions, freshness, depth and actual leverage;
live checks must independently verify all applicable venue requirements.

## Remaining Approval Items

Approve revised numeric parameters only after the comparisons above; establish a
fresh actual-leverage source for flat accounts; ensure cost estimates never replace
known higher costs; validate venue post-fill liquidation/margin; verify gas funding,
multi-order worst-case exposure and stop/unwind behavior. A separate explicit live
integration authorization is still required. This change does not request it or
activate it. Deployment/restart was not performed.
