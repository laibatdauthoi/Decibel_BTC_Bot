# Final Dynamic Capacity Integration Decision

This report supersedes the previous mandatory numeric maximum-order-field blocker.
No production writes, orders, restart, gate activation or commit were performed.

## Exact Changes In This Turn

- Removed the artificial requirement for an explicit numeric maximum-order field
  absent from SDK 0.7.0. When a real order maximum is supplied it remains enforced.
  Otherwise the order ceiling is shared capacity, subject to verified venue
  post-order margin/tier constraints. No $50 fallback in the new policy path.
- Reused the existing produceDecibelMarginTierV1 observation/validator; no new
  model, calculator, certificate or gate. New-session execution now requires it.
  Its initial margin rate, maximum notional, covered tier boundary and conservative
  candidate liquidation distance constrain the SAME practical calculator used by
  projection, runtime sizing and preflight. Freshness is validated; old certificate
  history/gas proofs are not required in this practical branch.
- Historical recovery assessment now explicitly separates historical discrepancy
  records from current session attribution and current nonterminal mutations.
  It never converts history uncertainty into a live PLACE/CANCEL intent. It is a
  readonly recovery-plan diagnostic, not a replacement for live readiness guards.
- Regression covers no invented order maximum, higher initial margin, inadequate
  liquidation distance, stale venue margin observations, long/short inventory with
  both-side pending orders, historical-only gaps, stale current evidence and
  independent current accounting failure.

## Fresh Read-Only Result

Evidence file: data/decibel_current_readiness_final_v1.json.
Account observation 1792989457603: authenticated position 0 BTC, orders [], free
margin/equity 10.222805. Latest session
session-1792946362640-ad852068-73df-443e-9b10-e3ea42732e61 is ENDED.
Journal nonterminal intents: 0. Durable journal inventory: 0.00014 BTC.

All 27 attribution discrepancies predate the current session boundary. They remain
explicit historical discrepancies in the existing repair manifest. Current-session
attribution discrepancies: 0. No unattributed fill is silently assigned to current
volume/PnL and no historical session is marked completed by this assessment.

JOURNAL_CURRENT_READINESS=BLOCKED, specifically
CURRENT_ACCOUNTING_INVARIANT_UNRESOLVED: durable inventory 0.00014 versus venue 0.
The isolated 484-fill replay proves the inventory correction, but production has
not been canonically repaired. Minimum correction: separately reviewed canonical
append of exact missing fills with persistent historical discrepancy attribution;
never overwrite inventory or guess the missing owners. The existing plan/manifest
remain review-only, not claimed externally approved.

## Remaining Executable Integration Gap

FEATURE_CODE_COMPLETE=NO. The source does not yet populate the existing
capacity_verified_margin_v1 observation for the larger candidate. Current account
maintenance margin and flat selected leverage are not a substitute for candidate
post-fill coverage. The exact code blocker is
CAPACITY_POST_ORDER_MARGIN_TIER_UNVERIFIED, not the obsolete certificate subsystem
and no longer the absent maximum-order API field.

Minimum correction: the production source must derive/verify the existing
postOrderMargin observation from authenticated collateral plus authoritative
instrument initial/maintenance-margin and tier/size rules, covering the maximum
candidate, worst-case pending fills and both LONG/SHORT liquidation distance.
Do not set its AUTHENTICATED_POST_ORDER_MARGIN_TIER source from a policy estimate.
The calculator/derivation/preflight consumer is now wired and tested for this
observation. A tested synthetic observation is not installed as a producer.

## Policy And Activation

Existing constants unchanged: 30s exit horizon, max(100bps, 2*observed range),
25bps slippage, 10bps fees per leg, 8bps adverse selection, 10% collateral reserve,
5% of Settings Max Loss transaction reserve. Fees exceed captured authenticated
1.5/4.5bps rates; adverse selection exceeds the valid observed 7.56bps. These are
conservative relative to those observations. Current depth is a fresh executable
constraint, not a guarantee of future liquidity. Horizon/stress, reserves and
future exit costs remain explicit operator policy estimates, not authenticated
worst-case guarantees. No impossible proof of future costs is requested.

LIVE_ACTIVATION_READY=NO. Required sequence: canonical accounting repair reviewed
and authorized separately; production post-order margin producer verified; then
operator approval of these exact policy parameters and the concrete code change
DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED false -> true. That change permits
only new versioned session snapshots to use dynamic capacity/order sizes above
$50 when real constraints allow. It does not alter Capital, Max Loss, target,
leverage or existing ACTIVE snapshots. Existing code gate remains false.

Do not apply the activation hunk or restart production from this task. A later
controlled code deployment needs a restart; it must remain distinct from live
policy activation. There is no new gate or environment override.
