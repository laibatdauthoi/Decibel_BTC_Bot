# Dynamic Activation Incident ? PID 24208

Changes are source fixes only. No production restart, session command, journal write,
PLACE or CANCEL was performed by this incident investigation.

## Authenticated observations

- Session `session-1793008278870-1fd095c9-218a-4147-a5bb-b9a223ac0a40`, RUNNING, REV 7.
- Immutable Settings: Capital $8, Max Loss $2, target $201, capacity policy version 1.
- Latest successful position/order reads: LONG 0.00073 BTC, entry 80391.3; one
  Pending reduce-only Take Profit Market, order
  `170141594179263706731123742119886323712`, trigger 80431.5.
  The order has an empty client ID and null quantity/price, and cannot be invented
  into an owned strategy LIMIT order. No SL order was reported by the venue.
- Executed volume is $58.685649; remaining target $142.314351.
- The latest attempt to refresh conflicting-order history timed out; earlier exact
  authenticated evidence succeeded. Production reconciliation must re-read it.

## Exact identity defect

Intent `intent-e02f664dcf803fb03020def4`, client
`d1be02f664dcf803fb03020def4bc6e8`, venue order
`170141594179263710023408565949002940416`.
Submission transaction
`0x9c7897f73ad90b29a61cffcbca024fcecb410a81c19d7ddbbb0b4c9b0875a422`.
Authenticated fill `129199871361185980409520675356676`: BUY 0.00073 at
80391.3, timestamp 1793008399547, transaction version 7771963901; order FILLED,
remaining zero, submission transaction COMMITTED.

The runtime persisted APPLIED/FULL_FILL but copied remaining 0.00073 from an
older OPEN snapshot. It wrote the lifecycle label FULL_FILL instead of venue
FILLED and used fill timestamp 1793008399547 as the transaction version.
Stale OPEN adoption then classified that terminal intent as an identity conflict.
The existing exact-evidence repair accepted old OPEN provenance but not this
FULL_FILL variant. It also ran only during startup; the runtime adapters omitted
the identity reader needed for active-session convergence.

The fixes normalize terminal provenance, propagate real authenticated transaction
versions, extend the existing atomic repair only for this exact legacy shape,
and call the same repair during normal reconciliation cycles. A repaired cycle
returns RECONCILE_ONLY with zero mutations. Missing evidence and immutable/fill
contradictions remain blocking.

## Sizing defect and evidence limits

The invalid-limits test conflated finite per-order capacity below $10 (including
zero) with malformed numbers. The dynamic calculator intentionally returns zero
order capacity when mandatory capacity evidence fails. Stale/missing evidence
now retains its specific capacity blocker before strategic quote evaluation.
Valid zero and sub-minimum caps return explicit no-new-quote reasons; negative,
nonfinite and malformed inputs stay invalid.

One captured healthy input had capacity $118.119351, current exposure
$58.657909, headroom $59.461442, margin $6.533552275, leverage 40, lot 0.00001,
minimum size 0.00002 and minimum notional $10. None of those healthy values
individually causes invalid limits. The archived invalid cycle 1793009022833
omitted the maximum-notional/margin scalar inputs, so the exact failed scalar
cannot be reconstructed honestly. Backend-only sizingInputs diagnostics were
added for subsequent cycles; no Settings debug UI was added.

## Exit safety and isolated verification

SESSION_UNWIND constructs a planning bound from existing inventory even when
strategic capacity is zero; it does not grant exposure-increase permission.
Final IOC intents still require reduce-only, authenticated remaining quantity,
identity, venue, transaction and margin checks. External/unattributed TP orders
remain a real blocker requiring venue-supported ownership/cancel reconciliation.
No FLAT or ENDED state is inferred.

An isolated journal excerpt containing all 518 authenticated fills and the real
ledger state successfully repaired only terminal/fill provenance. Inventory
remained 0.00073 BTC, fill count stayed 518, and the second run made no repair.
See `data/incident_isolated_reconciliation_result.json`. No production repair was
applied.

## Changed source files

- src/decibel_actual_fill_truth_v1.ts
- src/decibel_production_live_state_source_v1.ts
- src/decibel_execution_lifecycle_journal_v1.ts
- src/decibel_production_live_orchestrator_v1.ts
- src/decibel_production_web_telemetry_v1.ts
- src/decibel_authenticated_passive_recycling_orchestrator_v1.ts
- src/decibel_production_live_state_source_adapter_v1.ts
- src/run_decibel_production_web_v1.ts

Regressions: dynamic quote size, production live orchestrator, production web
telemetry, and `tests/fixtures/decibel_dynamic_activation_incident_v1.json`.

## Deployment

Backend code is not loaded into PID 24208. Do not stop/restart that process from
this task. A separately authorized session-aware deployment/handover must keep
strategic trading paused/stopping, obtain fresh identity evidence, let canonical
reconciliation repair provenance, resolve the TP order through supported venue
checks, and execute only canonical CANCEL/reduce-only unwind. Verify FLAT, zero
orders and no unresolved intents before declaring ENDED. Do not edit the live
journal or force terminal acknowledgements.
