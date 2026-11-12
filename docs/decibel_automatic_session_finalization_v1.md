# Automatic session finalization and reconciliation recovery

## Read-only incident trace

The latest persisted UNRESOLVABLE_ACK blocker identifies
`intent-e169bfd25367d98dc3ac0512`, a PLACE belonging to
`session-1793146310080-79631e79-7205-4914-8032-e3985f0bce53`.
Venue order: `170141599249866107437794217400878497792`.
Client order: `d1be169bfd25367d98dc3ac051209098`.
The blocker was recorded at 1793150752849. The stored authoritative provenance
subsequently reports OPEN with remaining 0.00051 at 1793150890641, then FILLED
with remaining 0 at 1793150892540, sourced from
AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION. The journal record is now APPLIED.
At inspection, no nonterminal intents remained and this session was ENDED.
The historical owner PID was 16444; an owner annotation on an ENDED history row
does not make it an active session. No independent live venue query was made;
these are persisted authoritative provenance records, not a new venue attestation.
No production data was repaired or changed during this task. A later read-only
GET of cached local telemetry showed FLAT/zero coverage, no reconciliation blocker,
fresh account equity/free margin 9.395691 USD, but the old session ID and expired
capacity projection still driving MANDATORY_EVIDENCE_FAILURE_PERSISTENT. This
confirms stale completed-session presentation separately from the historical
real capacity-evidence failure. Both automatic completion and idle refresh now
invalidate that old session projection before rehydrating fresh state.

## Independent headroom finding

The decision recorded at 1793150837779 has authenticated inventory -0.00051 BTC,
available margin 5.942554175 USD, maximum notional 0, headroom 0 and
SESSION_CAPACITY_EVIDENCE_REQUIRED. Its displayed exactReasonCode was
NO_NEW_QUOTE_HEADROOM. Missing authenticated capacity, rather than lack of cash,
caused that fail-closed quote decision. It is independent of the ACK blocker and
must not be overridden to authorize orders. The later FLAT report cannot be
substituted for the historical non-flat observation.

## Corrected failure paths

reconcileAllDecibelAcknowledgedOrdersV1 previously queried exact order identity
and then awaited Source.reconcileIntent before using the fetched evidence. If
the latter lookup lagged, its UNRESOLVABLE_ACK exception discarded the already
available terminal proof. Exact fetched terminal/fill evidence now goes through
the existing canonical identity resolver first. Conflicts and missing proof stay
blocked; fill transaction provenance and idempotent journal application remain
mandatory. The active orchestrator also uses that path when its ordinary lookup
cannot resolve an ACK.

Start admission previously inspected persisted ACK status before attempting this
reconciliation. It now refreshes and reconciles before checking unresolved
ownership, and validates saved capital against that fresh account snapshot.
The older HTTP precheck used potentially cached equity before this refresh.
Idle recovery now schedules another canonical attempt while unresolved intents
remain; it does not require a process restart or an operator recovery command.
An active session retains its own serial cycle/reconciliation owner.

Session completion previously canceled scheduling and closed local runtime
resources before persisting ENDED. A persistence/ownership failure could strand
the session with no local cycle left to retry. Finalization now verifies exact
FLAT, zero open orders and zero unresolved intents, commits canonical completion
while ownership is valid, and only then tears down scheduling. Failed completion
remains retryable. Completed-session projections are invalidated and fresh
account publication is scheduled, fencing old callbacks by the existing revision.
Session B uses its own immutable Settings snapshot, fill attribution and capital
calculation. No previous-session loss/volume/headroom is copied into its accounting.

## Start rejection visibility

The persisted ACK blocker and backend rejection code for that condition are
PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK.
The UI discarded the error body and displayed a generic safety message. It now
renders the exact returned error code, and distinguishes an immediately ENDED
response (for example TARGET_UNREACHABLE_MINIMUM_ORDER) from SESSION STARTED.
NO_NEW_QUOTE_HEADROOM is treated as a quote-admission result at the UI Start gate,
not a permanent session lock. Backend authentication, unresolved-order, capital,
capacity and all order-risk checks remain authoritative. No production Start
request was submitted as part of this task; no current rejection is invented
when the inspected journal is already clear.

## Replay and scope

Same-process replays use real temporary journals/session stores and simulated
authenticated responses: session A ACKs an order, a transient read fails, missing
terminal evidence preserves UNRESOLVABLE_ACK/STOPPING, exact FILLED or CANCELLED
proof arrives, canonical reconciliation terminalizes ownership, A becomes ENDED,
and B starts immediately. B has no inherited fills or volume, and its capital
calculation uses the fresh available margin and zero old position/order usage.
Additional checks retain genuine unresolved/open/non-flat states and retry after
a completion-persistence exception. The lifecycle scheduler, canonical resolver,
controller and journal are exercised without network or venue mutation.

Changed code: decibel_production_web_telemetry_v1.ts (canonical exact evidence),
decibel_production_live_orchestrator_v1.ts (ACK recovery),
run_decibel_production_web_v1.ts (admission, idle retry, completion ordering), and
web_dashboard/src/presentation.ts and main.tsx (Start gate and exact errors).
Regression coverage is in decibel_production_web_telemetry_v1.test.ts.
DCA, TP prices/quantities, Max Loss, sizing, entry economics, venue restrictions,
production Settings and production journals are unchanged by this task.

Verification: 121 session/telemetry tests pass; 61 separate authoritative
reconciliation/lifecycle-recovery tests pass. The final full production-core run
had 794 passing tests, two Chrome presentation failures (GPU/access environment
errors), and one authenticated-worker timeout test failure with an unhandled
rejection during parallel load. That unchanged worker file passes all four tests
in isolation. Backend/dashboard typechecks, backend/dashboard builds and focused
ESLint/Prettier pass. Full format/lint remain blocked by the pre-existing
.tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts. Those files were not edited
or excluded. No runtime deployment, mainnet orders, live restart, Settings mutation
or production journal mutation occurred.
