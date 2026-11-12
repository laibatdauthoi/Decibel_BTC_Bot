# Web Ready Without a Trading Session — PID 29632 / 33120

## Finding

No admitted new session or failed control-loop launch was found for either PID.
The prior session was already ENDED. Startup recovery correctly returned
NOT_REQUIRED and did not construct or activate another trading runtime.
Starting the web service is not authorization to start trading.

The existing application did not audit Start HTTP requests or admission failures
before session creation. Consequently, a click that failed before persistence
cannot be ruled out historically. Absence of a session row proves that no new
session reached creation/admission; it does not prove that no button was clicked.

## Production evidence obtained read-only

| Evidence | PID 29632 | PID 33120 |
| --- | --- | --- |
| Process start, UTC | 2026-10-29 07:53:46.430 | 2026-10-29 10:31:48.032 |
| Build | a5c56ecb4e9aa74b | a5c56ecb4e9aa74b |
| Recovery log | SESSION_RECOVERY_NOT_REQUIRED | SESSION_RECOVERY_NOT_REQUIRED |
| New session rows during process window | 0 | 0 |
| Session rows owned by PID | 0 | 0 |
| CONTROL_LOOP lines in process log segment | 0 | 0 |
| Existing Start request markers | 0; requests were not audited | 0; requests were not audited |

The most recent persisted session ended at **2026-10-29 05:34:05.475 UTC**,
before either process started. Its owner was PID 22848 and persisted stop reason
was PROCESS_SHUTDOWN. No STARTING, RUNNING or STOPPING session remained.

Live `GET /api/session` returned IDLE, owner NONE and activeSession null.
Telemetry returned executionSessionId null, executionCycles 0,
executionLoopRunning false and trading reason SESSION_NOT_RUNNING. The process
forensic state independently reported IDLE/NONE and recovery READY.

At one observation, authenticated state was 6047 ms old and readiness reported
PRODUCTION_AUTHENTICATED_STATE_STALE. That is a current readiness condition, not
proof of a rejected historical Start. Start admission forces fresh authenticated
reads, so its actual outcome cannot be inferred without issuing that request.
No production Start request was issued during this investigation.

Authenticated venue GETs completed at **2026-10-29 10:51:12.119 UTC**:
positions empty, BTC open orders empty, equity and free margin both 8.441935 USD.
This is a point-in-time observation. No order mutations were performed.

## Intended workflow and scheduling path

1. The web launcher starts HTTP service and background evidence refresh.
   WEB=READY means the HTTP service is listening.
2. `recoverStartup` examines active persisted sessions. `getActive` excludes
   ENDED/BLOCKED rows. With none active, recovery returns 0/NOT_REQUIRED.
   It does not call `startRuntime` or `activate`.
3. After a completed session, the operator opens **Settings**, saves any intended
   changes, and explicitly clicks **Start Session**. There must be no unsaved
   changes and the existing UI readiness/allocation gate must permit the request.
4. The button sends `POST /api/session/start` with expectedSettingsRevision.
   The backend checks exclusivity and settings revision, refreshes authenticated
   venue evidence, reconciles prior intents/orders and validates allocation.
   It then creates STARTING, prepares/claims the owned runtime, transitions to
   RUNNING and calls `activate`.
5. `activate` schedules recurring cycles and requests an immediate first cycle.
   `evaluateOnce` emits CONTROL_LOOP/TRADING_STATE telemetry. Every actual order
   still passes existing freshness, ownership, economics and risk authorization.

Without step 3 there is no trading loop to stall. Event-loop logging continues
because HTTP and evidence refresh still run. The reported 3–5 second maximum lag
can affect evidence freshness but does not explain the absence of an active
session or authorize automatic trading.

## Demonstrated diagnostics defects repaired

- Web availability, session lifecycle and control-loop scheduling were not shown
  together explicitly. The dashboard now displays an independent session banner:
  IDLE while loading, WAITING_FOR_USER_START, ENDED, STARTING, START_BLOCKED,
  ACTIVE, STOPPING or RECOVERY_BLOCKED, plus loop status and precise blocker.
- ENDED explains that a new Start Session is required. Current readiness blockers
  are displayed separately from a recorded admission rejection.
- An owned RUNNING session with no scheduled loop is explicitly identified as
  SESSION_CONTROL_LOOP_NOT_SCHEDULED. Existing unhealthy-loop telemetry is shown
  as stalled rather than silently presented as active.
- The controller records its latest REQUESTED/ADMITTED/REJECTED attempt, settings
  revision, timestamps, admitted session ID and rejection reason. This includes
  failures before a session row exists. The API exposes this diagnostic record.
- The web process records HTTP start request/response events and controller
  admission outcomes in process forensics, without logging request bodies or
  credentials. Periodic lifecycle diagnostics also explain intentional idle.
  Diagnostic storage failure does not change admission outcome.

These changes are observational. No automatic start, recovery retry, start gate,
economic threshold, risk rule, strategy, sizing or ownership policy was changed.
No scheduling repair was justified by the production evidence.

## Changed files/functions

- `src/decibel_session_control_diagnostics_v1.ts`:
  `deriveDecibelSessionControlDiagnosticsV1` and start-attempt diagnostic type.
- `src/decibel_production_session_controller_v1.ts`: `start`, `getState` and optional
  audit observer; existing admission and activation sequence retained.
- `src/run_decibel_production_web_v1.ts`: Start HTTP audit, controller observer and
  periodic lifecycle diagnostic logging.
- `web_dashboard/src/main.tsx`, `styles.css`: lifecycle banner using the shared
  projection; existing Start button and admission controls retained.
- Existing session and presentation test suites: explicit-start recovery,
  rejected/admitted requests, failed preparation and diagnostic state replays.

## Regression evidence

- PID 29632/33120 replay: prior ENDED session → NOT_REQUIRED → IDLE/NONE;
  no new session row, runtime preparation or activation.
- HTTP Start replay with stale venue admission: REQUESTED → REJECTED; precise
  blocker retained, no row created and no runtime activated.
- A subsequent explicit request after fresh admission: REQUESTED → ADMITTED;
  venue admission precedes preparation and exactly one activation. A duplicate
  request is rejected as SESSION_ALREADY_ACTIVE.
- Preparation failure remains BLOCKED with the exact reason; recovery does not
  silently retry it. A diagnostic writer failure does not turn successful
  admission into a failed start.
- Presentation cases distinguish loading, waiting for user, ended, rejected,
  first-cycle pending, active, unscheduled, stalled and stopping states.

All replay sessions use temporary SQLite stores and fake runtimes. No production
session was started for testing. The dashboard build was emitted to an isolated
`data/.tmp_session_control_dashboard_build` directory; production-served
`web_dashboard/dist` assets were not replaced.

## Deployment

Verification: production typecheck/build and dashboard TypeScript check passed.
The isolated dashboard production build passed. Changed-file formatting and
ESLint passed. Full `npm test`: **853 passed, 2 failed**, both existing Chromium
presentation tests failing because the GPU subprocess is unusable/access is
denied. The separately run session, authoritative-order and HTTP-recovery suites
passed **59 tests**. All 13 new diagnostic/replay cases passed.

Global format checking remains blocked by existing `.tmp_conflict_readonly.cjs`.
Global ESLint reports existing project-service errors for that file and
`.tmp_exact_evidence.ts`; neither file was changed.

Local source/tests only. Not deployed or verified in the running build.
No mainnet orders/cancellations, session starts, process restarts or production
journal/session edits. Historical rejected-click attribution remains unavailable
for the old build; the added audit makes future requests distinguishable.
