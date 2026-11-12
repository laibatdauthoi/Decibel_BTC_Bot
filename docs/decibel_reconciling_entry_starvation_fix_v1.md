# Reconciling Entry Starvation Fix

## ROOT_CAUSE

SELL PLACE `intent-c035f1949f3471c942bd4bdc` was accepted with order ID
`170141591643962507099208910846541430784`. Journal transition 282071 records
SUBMITTING -> ACKNOWLEDGED at 1793995692625. Transition 282072 records
ACKNOWLEDGED -> RECONCILING at 1793995694489. Its blocker is
`PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING` at 1793995694505.
The post-mutation reconciliation path requires authoritative order visibility;
transaction commitment alone does not establish OPEN.

The recurring recovery selector prioritized UNRESOLVABLE_ACK, SUBMIT_UNKNOWN,
SUBMITTING, CANCEL, and orders absent from the snapshot. It omitted RECONCILING.
With both entries visible, the older BUY ACK was selected repeatedly. SELL never
reached the existing reconciliation/provenance application boundary. This is
durable recovery starvation after a temporary visibility gap, not proof that the
venue order remained unknown forever. Observation alone does not update the
journal owner; successful reconciliation must apply it.

## FILES_CHANGED

- `src/decibel_production_live_orchestrator_v1.ts`: include RECONCILING in the
  unresolved priority group. Existing authenticated reconciliation performs all
  state and ledger changes. No new timer or alternate recovery path.
- `tests/decibel_production_live_orchestrator_v1.test.ts`: exact incident IDs,
  prices, quantities and client identities; older BUY ACK plus newer SELL
  RECONCILING. Check selection, OPEN recovery, pending evidence, blocker and
  repeated replay without mutation.
- This report.

The workspace already contained extensive uncommitted changes. This task does
not claim those changes, commit them, or change trading economics/settings.

## RECONCILIATION_BEFORE_AFTER

Authenticated read-only checks completed at 1794002812021 through 1794002813964:

| Identity | Journal PLACE Price | Side | Original Qty | Current Venue State | Remaining | Matching Fills | PLACE Transaction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 170141591643962507099208910846541430784 / d1sc035f1949f3471c942bd4bdccb204 | 75951.4 | SELL | 0.00047 | CANCELLED | 0 | 0 | COMMITTED |
| 170141599249866109810101889545734717440 / d1b18473238f397a824ad2f2521a21b0 | 75540.8 | BUY | 0.00047 | CANCELLED | 0 | 0 | COMMITTED |

The configured subaccount authenticated account read returned no open orders,
no positions, and inventory 0. The identity reader queried authenticated open
orders, exhaustive order history, exhaustive trade history, and transaction
lookup. It rejects related IDs/client IDs with contradictory identities or
non-BTC markets. Matching history confirmed both original sizes and sides.
The normalized terminal evidence does not expose price or reduce-only; those
columns are verified only against the durable PLACE bodies (reduceOnly=false),
not independently asserted from the terminal API response. No screenshot was
used as evidence. No separate order-detail endpoint was invoked.

Before this task's edits, both PLACE owners were already CANCELLED_EXTERNALLY:
SELL at 1794002541765 and BUY at 1794002555079, with authenticated terminal
provenance. Existing SESSION_UNWIND cancellation intents are in the journal;
this task did not issue them. They must remain terminal, not return to OPEN.
PID 21704 was absent when checked.

In regression, the older ACK no longer starves SELL: authenticated OPEN accepted
by the existing boundary restores ACKNOWLEDGED. Pending evidence preserves
RECONCILING and prevents mutation. Existing terminal/fill reconciliation and
partial-fill accounting remain unchanged.

## BLOCKER_BEFORE_AFTER

The reproduced incident starts with `RECONCILIATION_REQUIRED` (surfaced to
execution admission as `EXECUTION_RECONCILIATION_REQUIRED`). After accepted OPEN
reconciliation, the durable owner is ACKNOWLEDGED and the journal-derived
blocker is null if no other unresolved owner/conflict remains. Pending evidence
retains the blocker over repeated cycles. No session reset or journal surgery
is used.

The production journal read after verification contained only terminal statuses
and no active identity conflicts. This was an observation, not a production
state change made by this patch. Production code was not deployed/restarted.

## TESTS

- Exact-ID selection/OPEN/pending regression and existing ACK publication /
  persisted RECONCILING restart: 4 passed.
- Authoritative reconciliation + lifecycle + lifecycle recovery: 94 passed.
- Orchestrator filtered partial/finality/mismatch/stale/restart/replay/unknown:
  129 passed. Includes existing safety and coverage regressions.
- HTTP recovery: 6 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Changed TypeScript files: Prettier passed; ESLint checked separately.
- `npm run format:check`: failed on existing `.tmp_conflict_readonly.cjs`,
  `src/readonly_exit_architecture_tmp.ts`, and fixtures
  `entry_cost_19884_v1.json`, `entry_simplification_36080_v1.json`.
- `npm run lint`: failed on existing `.tmp_conflict_readonly.cjs` and
  `.tmp_exact_evidence.ts` outside the configured TypeScript project.
- `npm test`: 1095 passed, 8 failed across 4 files. Failures: one ENTRY reprice
  expectation, three initialization recovery cases (missing market metadata
  reader / timeout diagnostic), two unrelated-market telemetry cases (missing
  market metadata reader), two Chromium presentation cases (GPU/sandbox error).
  The subsequent authoritative/HTTP stage was skipped by npm's `&&`; those
  relevant suites were run separately above. These failures were not repaired
  as part of reconciliation scheduling.

## BUILD_FINGERPRINT

`calculateDecibelSourceBuildFingerprintV1`: buildId `f36f6db5a67c365d`,
sourceBuildTimestamp `1794002726652`, coveredFileCount `118`.
Build output generated locally; no deployment, restart, real PLACE/CANCEL,
manual session edit, or manual production journal edit was performed.
