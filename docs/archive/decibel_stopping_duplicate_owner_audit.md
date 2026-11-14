# STOPPING Duplicate Owner Audit

The production journal was opened read-only. PID 29964 session
session-1792946362640-ad852068-73df-443e-9b10-e3ea42732e61, revision 3,
target 51, was already ENDED / OPERATOR_END before any code change.
It started at 1792946363175 and ended at 1792946578443. Final position and
unresolved execution count are zero; executed volume and fill count are zero.

The two previous uncertain owners were:
- intent-775da7b009fab826cc105367, BUY,
  client d1b775da7b009fab826cc105367888d9,
  venue 170141594179263706325462758128399417344.
- intent-939629f0f04d4933e95edaa7, SELL,
  client d1s939629f0f04d4933e95edaa725ad7,
  venue 170141594179263709323399712224858603520.

Both journal records now have CANCELLED_EXTERNALLY terminal provenance.
Fresh authenticated read-only evidence at 1792946758270/1792946758885
confirmed exact matching identities, CANCELLED, original quantity 0.00031,
remaining zero, no fills, transaction COMMITTED. Account position was zero
and open orders empty. Absence or FLAT alone was never used as terminal proof.
UNRESOLVABLE_ACK means the resolver could not establish exact order/fill evidence
at that observation; COMMITTED submission does not by itself prove final order state.

## Defect

claimForSubmission may return DUPLICATE_SUPPRESSED with the ID of an existing
side owner, without persisting the new CANCEL candidate. The orchestrator formerly
called reconcileAfterMutation(candidate.intentId). That lookup found nothing and
returned, so the actual owner was not reconciled and the result reported blocker NONE.
Recovery could repeatedly choose an older acknowledged OPEN owner while a newer
UNRESOLVABLE_ACK owner prevented cancellation of the selected target.

## Fix And Safety

Reconcile the actual outcome.intentId and report that ID with an explicit duplicate
owner reconciliation blocker. Prioritize uncertain submission/ACK owners ahead of
already-known OPEN owners. Keep the existing scheduler, ownership, mutation budget,
exact cancel validation, canonical reconciliation transaction and completion checks.
No submission is retried because it was suppressed. No status is forced terminal.
Canonical ENDED still requires complete unwind, authenticated flat/open-order state
and no non-terminal journal intents. Existing session controller completion remains
idempotent; no new completion shortcut was added.

Tests use the real order IDs, client IDs, prices, size/step and mutation cycle keys,
with relative fixture timestamps and mocked venue operations. They cover transient
reads, unknown ACK priority, duplicate owner reconciliation, pending cancellation,
restart and idempotent completion. Existing canonical session tests cover durable
ENDED and delayed fills/ACKs. No production mutation was made.

## Session Clock

A frontend component anchors elapsed time to backend timestamps plus monotonic
performance.now(). A local one-second interval only re-renders the clock; it does
not read the backend. RUNNING and STOPPING tick; endedAt freezes duration.
Missing/invalid timestamps produce UNKNOWN; small future skew clamps at zero,
large future skew or an end before start is rejected. Backend polling is unchanged.
Intervals are cleaned up on unmount, end and dependency changes. Browser tests
confirmed ticking with frozen telemetry, tab/refresh continuity from backend start,
ended duration freezing and no extra polling/writes.
