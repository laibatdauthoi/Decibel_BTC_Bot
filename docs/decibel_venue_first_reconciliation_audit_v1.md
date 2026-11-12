# Venue-First Reconciliation Audit

## Read-only production observations

Authenticated GETs completed at **2026-10-29 05:27:01.364 UTC**:

- Positions: none; account FLAT.
- Open orders: none, across all returned markets.
- Equity: 8.441935 USD; available margin: 8.441935 USD.

This is a point-in-time venue observation, not a guarantee of subsequent state.
No order API, journal writer or production restart was used for this observation.

Read-only SQLite inspection found the latest session still STOPPING,
`unwind_requested=1`, `unwind_reason=SESSION_END`, owned by PID 22848.
That PID existed. The configured default execution journal contained no
nonterminal intents. Its former SELL TP .00128 at the incident identity was
already CANCELLED_EXTERNALLY. Thus unresolved intents in that journal do not
explain the persisted STOPPING observation. The local dashboard endpoint was
unavailable; the owner's exact current failing cycle cannot be established from
these observations alone. No production session record was modified.

## Authority and data flow

| Domain | Authority | Local responsibility |
| --- | --- | --- |
| Position, entry basis | Authenticated positions endpoint | Preserve observed size/basis; never reconstruct actual inventory from strategy intent |
| Open orders, residual quantity | Authenticated open orders | Normalize identity and remaining size; absence alone never proves completion |
| Terminal status | Exact order history and authenticated fills | Resolve matching venue/client identities; retain conflicts and unknowns |
| Fill quantity, volume, fees | Authenticated fill ledger | Deduplicate fills, require transaction provenance and preserve partial fills |
| Balance, free margin, maintenance | Authenticated account overview and risk inputs | Retain original read clocks and existing capacity checks |
| Submission outcome | Durable execution journal plus identity-specific venue evidence | Retain SUBMITTING/SUBMIT_UNKNOWN/UNRESOLVABLE ownership until proven resolved |
| Executor/session owner | Session store PID and process-instance lease | Revalidate current owner before every final mutation |
| Market/economic inputs | Independently dated BBO, fee/gas and adverse evidence | Authorize dependent actions; never erase venue inventory during warmup |

The production path is SDK/worker reads → source normalization → one supervised
account/history batch → immutable venue snapshot → shared market/economic
projection → session capacity/accounting → orchestrator reconciliation and plan
→ refreshed pre-commit plan → lifecycle submission validation → risk preflight
and executor gate → executor → forced authenticated post-mutation reconciliation.

ENTRY/DCA admission consumes actual venue inventory and remaining orders.
Opposite-side TP coverage consumes authenticated residual quantities plus pending
journal reservations. Canonical defensive reduction uses the same evaluated
risk plan at selection and final validation. Cancel/replace retains old ownership
until exact cancellation/terminal evidence permits replacement. Startup restores
ownership separately from completing a persisted unwind.

## Demonstrated defects and repairs

1. **Mixed and partially published read sets.** History was written into the
   shared snapshot before account publication, including before rejection of an
   older account response. Position-only refresh could also replace inventory
   without corresponding orders, fills, margin or entry basis. Account/history
   now publish together after monotonicity and acquisition-window checks. A
   position change invalidates the entire read set; disagreement defers mutation
   until a coherent full refresh succeeds.
2. **Assembly time obscured source age.** Source account observations used the
   end of a multi-endpoint read. Market projection advanced snapshot time while
   old authenticated facts remained. Original account/history acquisition windows
   now survive projection and are checked against the existing freshness bound.
   Account capacity observations conservatively retain the request start time.
   No TTL was increased.
3. **History changes were missing from decision generation.** Projection hashes
   covered position/orders/book, but omitted fill/terminal history. The shared
   projector now includes the immutable venue generation and economic inputs.
   History is hashed once per authenticated batch, not reparsed on every BBO.
4. **Economic availability gated reconciliation availability.** Missing economic
   evidence prevented reconstruction of the shared execution snapshot. The
   projector now retains venue facts with explicitly unknown economic values.
   Existing entry/TP profitability checks remain mandatory; canonical risk
   reduction does not wait for entry-only economic warmup.
5. **Final preflight disagreed with canonical planning.** The web callback checked
   reductions as entry candidates without their canonical evaluation. Planning,
   refreshed planning and final preflight now share the existing evaluation.
   Entry spread/lifecycle profitability is not reapplied to a bounded canonical
   reduce-only risk action. Freshness, quantity, ownership, session loss and risk
   preflight still apply.
6. **Final mutation ownership was incomplete.** The web callback returned early
   for cancellation and unwind without checking session ownership. It now checks
   the current PID/instance lease for every mutation, and rechecks after awaited
   strategic placement validation.
7. **Post-mutation force refresh was not called.** The orchestrator checked for
   `readAuthenticatedSnapshotAfterMutation`, then called the ordinary reader.
   It now invokes the forced reader, avoiding reuse of a pre-mutation supervisor
   cache for reconciliation.
8. **Identity-free completion inference.** A legacy fallback inferred fills or
   cancellation from changes in unrelated order/fill sets. It has been removed.
   Missing exact identity remains ambiguous; omission does not release ownership.
9. **Session completion depended on quote readiness.** Terminal journal evidence
   is now reconciled on authenticated publication. An owned, requested unwind can
   finish from fresh account/history proving FLAT, zero open orders, no pending
   intents and no active identity conflict, independently of market/economic
   quote readiness. The finalizer also refuses aged authenticated evidence.

## Meaning of RECOVERED and STOPPING

`recoverDecibelProductionSessionBeforeListenV1` emits RECOVERED when
`recoverStartup` restores a runtime owner. The persisted STOPPING/unwind request
is intentionally retained. RECOVERED plus STOPPING is therefore valid during
pending cancellation, submission uncertainty, non-FLAT inventory or incomplete
venue evidence. RECOVERED is not proof that a session resumed trading or ended.

The repaired completion path does not require an executable quote merely to
record an already verified FLAT end. It never ends a session from an empty order
response while an unknown submission or identity conflict remains unresolved.

## Consistency limits

The available SDK reads do not provide a common atomic venue ledger cursor.
This implementation therefore uses overlapping, bounded acquisition windows,
original evidence clocks, immutable batch generations, position/position-detail
agreement and existing exact order/fill reconciliation. It does **not** claim
cross-endpoint serializability or repair upstream HTTP/indexing failures. A
disjoint/expired batch is rejected and left to the existing refresh owner;
identity or quantity contradictions remain fail-closed. No retry policy or
freshness threshold was expanded.

## Files and functions

- `src/decibel_venue_reconciliation_snapshot_v1.ts`: atomic batch merge, shared
  decision projection and original-clock freshness assertion.
- `src/decibel_production_live_state_source_v1.ts`: authenticated read windows,
  account source timestamps, removal of identity-free reconciliation fallback.
- `src/decibel_production_live_orchestrator_v1.ts`: shared
  `evaluateAuthenticatedSnapshot`, coherent position refresh, original-clock
  validation, forced post-mutation reader, canonical warmup authorization.
- `src/run_decibel_production_web_v1.ts`: batch publication, shared projection,
  final canonical validation and owner checks, terminal reconciliation and
  account-driven STOPPING finalization.
- `src/decibel_trading_decision_v1.ts`: distinguish canonically authorized
  reductions from entry economics while retaining actual candidate preflight.
- `tests/decibel_production_live_orchestrator_v1.test.ts`: nine new cases,
  strengthened position-refresh regression, and existing DCA/defensive replays
  routed through the production batch/projector and final validation boundary.

## Replay evidence

The tests use temporary journals and mocked executors; they do not mutate venue
orders. They exercise the actual orchestrator and lifecycle dispatch:

| Scenario | Verified outcome |
| --- | --- |
| FLAT / LONG / SHORT startup during economic warmup | Venue inventory preserved; existing open orders adopted; zero unauthorized submissions |
| Restart with working orders | Durable identity ownership restored; no duplicate placement |
| DCA .00071 → .00089 and repeated/late partial fills, both signs | Cancel/terminal ownership before exact remaining-quantity replacement |
| Canonical defensive reduction with full TP coverage, both signs | Batch → projection → plan → final candidate authorization → one cancel then one reduce-only place |
| HTTP 500 / worker timeout | Mutation deferred; fresh read resumes the same reconciliation owner |
| Unknown submission outcome | Nonterminal ownership retained; repeated cycles do not resubmit |
| Older account/history response | Rejected before publication; current venue generation remains intact |
| Inconsistent single-position refresh | No mutation from mixed facts; complete FLAT read set restores decisions |
| Confirmed terminal order versus stale journal OPEN | Exact terminal publisher resolves owner without economic readiness |
| STOPPING with FLAT terminal evidence | Finalizer succeeds despite unavailable quote economics or stale market; aged account/history or unresolved ownership refuses completion |
| Duplicate/lost executor owner | Final lifecycle callback invoked; executor invocation count stays zero for PLACE and CANCEL |

## Verification

- Final targeted run: **423 passed** across five suites: live orchestration,
  session lifecycle, authoritative order reconciliation, HTTP recovery and
  execution lifecycle recovery.
- Full `npm test`: **840 passed, 2 failed** in Chromium presentation tests due to
  GPU subprocess/access failures. Because its `&&` continuation was skipped,
  the authoritative reconciliation and HTTP suites were included explicitly in
  the passing targeted run.
- Production typecheck and build passed. Changed-file Prettier/ESLint passed.
- Global `format:check` remains blocked by existing
  `.tmp_conflict_readonly.cjs`; global lint reports existing project-service
  parsing errors for that file and `.tmp_exact_evidence.ts`. Neither unrelated
  file was changed.

## Deployment

Source/tests changed locally only. No live order submission/cancellation,
production journal/session mutation, or process restart. Deployment and live
verification remain outstanding. Passing mocked executor replays is evidence of
the repaired application path, not proof that the running production process
has adopted it.
