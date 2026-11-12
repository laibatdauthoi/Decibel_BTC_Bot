# Stable Settings Start Interaction

## Exact flicker mechanism

The Settings Start button used `deriveSessionStartGateV1` as if it were trading
authorization. Its inputs were `presentation.abnormal`, the highest-priority
operator alert, and cached authenticated equity. The disabled expression was
`!canStartOperatorSessionV1(settingsAvailable, startBlocked, dirtyCount)`.
The Settings summary independently converted the same `startBlocked` value into
START BLOCKED or ENDED · READY TO START.

Authenticated snapshots in the production web supervisor have a **5000 ms TTL**.
The refresh scheduler targets the deadline with a **2000 ms safety margin**.
Delayed reads or event-loop delay can still cross the real freshness boundary.
Web telemetry/SSE publication defaults to **5000 ms**; session/history polling in
the browser runs every **2000 ms**. No `.env` override was found for web refresh,
read timeout or maximum BBO age during this investigation.

At expiry, AuthState becomes BLOCKED/STALE. The telemetry projection can publish
a readiness blocker and unavailable cached equity. The frontend interpreted
either as a prohibition on submitting Start. The next successful authenticated
publication reversed that interpretation. Session status remained ENDED and
saved settings did not need to change for this READY ↔ BLOCKED transition.

This was the wrong permission boundary: a user request may be submitted before
fresh evidence is available, while actual admission/activation must wait for it.

## Backend versus frontend

The existing backend already refreshes authenticated evidence on admission:

1. `Controller.start` serializes starts and checks active session/exclusivity and
   the expected saved Settings revision.
2. `ensureDecibelAuthenticatedStateReadyForStartV1` refreshes when cached evidence
   has expired and then asserts readiness.
3. Production `validateStart` additionally calls `readAndPublishStrategySnapshot`,
   which invokes the supervised authenticated refresh owner.
4. Prior journal intents and venue orders are reconciled; fresh capital allocation
   and ownership checks run before creating/promoting a runtime.
5. The controller transitions to RUNNING and invokes activation before returning
   successful admission. Subsequent mutations retain their existing risk gates.

No backend freshness, economic or ownership bypass was needed or added. The new
tests exercise this existing HTTP handler, supervisor readiness and controller
with temporary stores and mocked venue/runtime dependencies.

Two additional frontend defects were demonstrated: there was no synchronous
in-flight request guard, and Start responses were sent to `setApplyResult` while
the corresponding value was discarded (`const [, setApplyResult]`). Thus an
actual admission error could be invisible near the Start control.

## Changes

- Removed the shared top session/control-loop banner and its CSS. It is absent
  from Settings, Overview and Activity. Existing operator alerts remain.
- The frontend request gate uses saved Settings validity, session ownership,
  pending/unknown execution state and known reconciliation/identity blockers.
  It does not treat cached account, market or economic expiry as authorization
  to disable a request. It also checks all reported blockers rather than letting
  a higher-priority temporary alert obscure an ownership conflict.
- Cached equity is no longer treated as final capital authorization. Backend
  `validateDecibelCapitalAllocationV1` is unchanged and still rejects inadequate
  fresh equity. A regression explicitly verifies this rejection.
- Added `session_start_request_v1`, a frontend single-flight request controller.
  It changes synchronously to CHECKING ACCOUNT… before sending the POST, so
  rapid clicks cannot create parallel requests.
- Existing session polling observes STARTING session preparation and displays
  STARTING SESSION…. SESSION ACTIVE requires a backend session projection with
  RUNNING status and OWNED runtime. A successful HTTP status alone is insufficient;
  paused takeover ownership is not displayed as active.
- A known admission rejection displays its exact error beside Start and allows
  an explicit retry. Passive readiness polling does not overwrite that result.
  A transport outcome that cannot be confirmed remains a non-error confirmation
  notice; no automatic duplicate POST is sent.
- Retained End Session separately. Ended/stopping sessions and ownership pauses
  are not silently converted into a new trading session.

All Settings values, strategy rules, economic thresholds, sizing, leverage,
Max Loss, exposure limits, TTLs and startup policy remain unchanged.

## Regression evidence

Seven new deterministic cases cover:

- Repeated observations at 4999/5000/5001/6000 ms and fresh publication: an ENDED
  session's request remains available, with stable START SESSION text.
- Snapshot expired one millisecond before click: frontend accepts one request;
  backend waits for fresh authenticated evidence before creating STARTING.
- Pending runtime preparation displays STARTING SESSION…; activation happens
  once before the UI confirms SESSION ACTIVE. Double-click returns the same
  in-flight promise and produces only one POST.
- Authenticated HTTP 500 and worker timeout: no session is created and no runtime
  activates. The precise rejection remains visible, then a successful explicit
  retry refreshes evidence and activates once.
- A genuine existing owner remains authoritative even if the frontend gate is
  bypassed; backend returns SESSION_ALREADY_ACTIVE and does not activate again.
- Unresolved submission, invalid Settings and identity conflicts still block
  requests. HTTP success without owned runtime confirmation remains pending;
  another click does not resubmit. Paused ownership is not called active.

## Files

- `web_dashboard/src/presentation.ts`: request eligibility separated from trading
  readiness; existing backend-error formatting retained.
- `web_dashboard/src/session_start_request_v1.ts`: single-flight interaction,
  confirmation, rejection, pending status and button labels.
- `web_dashboard/src/main.tsx`: banner removal, request controller wiring,
  stable progress/status and visible errors next to Start.
- `web_dashboard/src/styles.css`: removed banner styling; scoped Start error text.
- `tests/decibel_production_session_v1.test.ts`: actual handler/controller/TTL
  replays with temporary journals and fake runtimes.
- `tests/decibel_production_web_presentation_v1.test.ts`: request eligibility and
  frontend confirmation regressions.
- `tests/decibel_production_web_telemetry_v1.test.ts`: cached equity versus actual
  backend capital rejection regression updated for the correct boundary.

## Verification and deployment

- Seven new cases passed; the session, web telemetry, authoritative-order and
  HTTP-recovery suites passed **146 tests**.
- Full `npm test`: **860 passed, 2 failed**, both existing Chromium presentation
  checks failing because the GPU subprocess is unusable/access is denied.
- Production typecheck/build, dashboard TypeScript check, changed-file ESLint and
  formatting passed. Global formatting/lint remain blocked by existing
  `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts` issues.
- The dashboard build passed using isolated output
  `data/.tmp_stable_start_dashboard_build`; production-served assets were not
  replaced. Chromium visual verification remains limited by the GPU failures.
- Local implementation only: no live Start, order submission/cancellation,
  production journal edits or process restart. Not deployed or live verified.
