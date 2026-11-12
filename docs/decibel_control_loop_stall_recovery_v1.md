# Control-loop authenticated-read stall recovery

## Failure chain

The web supervisor schedules a recurring session cycle. scheduleCycle shares an
active promise and cycle uses evaluating/finally to prevent concurrent executor
work. evaluateOnce reads its authenticated snapshot from the supervisor; stale
state joins runAuthenticatedRefresh. That refresh reads account, position, open
orders and fill history before publishing state. The source account path then
awaits refreshAccountRiskInputs.

The proven permanent-owner defect is refreshAccountRiskInputs: its unbounded
Promise.allSettled retained CapacitySettingsRead whenever either leverage/fee
initialization or venue-margin reading did not settle. The shared supervisor
refresh also had no deadline. The Aptos bounded-fetch adapter only sent abort;
a request or response body ignoring abort could still remain pending. In the
failure path transport-diagnostics initialization was another unbounded wait.
The orchestrator's outer read timeout stopped its own wait but did not cancel
or release the supervisor/source owner; subsequent attempts joined it again.
This is a hung read poisoning singleflight ownership, not evidence that a rejected
promise failed to run the existing finally. A successful process heartbeat says
nothing about these promises completing.

LAST_CYCLE_AGE was based on lastSuccessfulCycleAt, so increasing age alone did not
prove that scheduler attempts stopped. It was also refreshed by authenticated
publication, which could incorrectly imply cycle progress. No live stack was
sampled and no claim is made about the exact remote socket of PID 17856.

## Implemented repair

- Fetch now races both request and body against its existing deadline and sends
  abort. There is no transport retry, especially no executor submission retry.
- Capacity settings and venue rules use the existing cancellable stage deadline;
  late stage results cannot publish cache updates. Stage controllers clean up on
  success, synchronous exceptions, rejection, timeout and source shutdown.
- Supervisor authenticated singleflight has a configured read deadline, per-attempt
  abort identity and finally cleanup. Shutdown aborts the active attempt. The next
  request receives a new owner rather than the expired promise.
- Web publication, fill-snapshot replacement and source account publication check
  the attempt signal after awaits. The adapter forwards cancellation. Old callbacks
  cannot publish over a newer attempt. Outer rejection schedules another read if
  no retry is already scheduled, preserving existing rate-limit backoff scheduling.
- Diagnostics are bounded; a diagnostics failure cannot retain cycle ownership.
  Ignored cycle-cleanup promises have rejection handlers. Existing recurring cycle
  scheduling, serialized executor ownership and unresolved-intent reconciliation
  remain unchanged.
- Only completed evaluations update lastSuccessfulCycleAt. Structured telemetry
  exposes executionLoopHealthy separately from executionLoopRunning using the
  existing 30-second heartbeat staleness policy; the dashboard uses health to show
  STALLED. Console health also checks cycle age against configured read/retry timing.

No timeout manufactures account values or FLAT state. Recovery refreshes account,
position, open orders and fills through the same authenticated path before normal
execution; existing unresolved-intent reconciliation retains its priority. Reading
failure itself does not authorize cancel, replacement or resubmission of resting
orders. DCA, TP price/quantity, sizing, economics, Max Loss and venue safety rules
are unchanged.

## Offline replay

The reproduced pre-fix path could retain a hung request/body and its singleflight
owner indefinitely despite abort. The new deterministic replay times out the first
attempt, verifies owner release, retries through the existing recurring scheduler,
and publishes fresh non-flat inventory with both BUY and SELL resting. Late old
publication is rejected; there are no executor mutations in this replay. Other
focused cases cover synchronous/asynchronous rejection cleanup, shutdown, hung
capacity rules, ignored-abort response bodies and overdue health reporting.
Existing full lifecycle/recovery tests cover duplicate-order admission and restart
with unresolved intents. All test stores are temporary; production journal and
Settings were not opened or changed. No active process was restarted or venue
orders placed/cancelled.

Changed production files: decibel_bounded_fetch_client_v1.ts,
decibel_runtime_supervisor_v1.ts, decibel_production_live_state_source_v1.ts,
decibel_production_live_state_source_adapter_v1.ts,
decibel_production_live_orchestrator_v1.ts, run_decibel_production_web_v1.ts,
decibel_production_web_telemetry_v1.ts and web_dashboard/src/main.tsx.
Tests changed: decibel_bounded_fetch_client_v1.test.ts,
decibel_production_web_telemetry_v1.test.ts and
decibel_production_live_orchestrator_v1.test.ts. Position revalidation also uses
the same stage deadline and cannot convert a failed read into FLAT.

Verification: full production-core run had 789 passing tests and two Chrome
presentation failures (environment GPU/access errors). Separate canonical
recovery/reconciliation run passed 62 tests. Typechecks for backend and dashboard,
backend/dashboard builds and focused ESLint/Prettier pass. Full format/lint checks
remain blocked by the pre-existing .tmp_conflict_readonly.cjs and
.tmp_exact_evidence.ts; neither file was changed or excluded.
