# Historical CANCEL Startup Recovery — 2026-11-05

The workspace repair resolves the persisted cancellation identity defect in the
web-v1 startup reconciler. Production recovery was not applied and the running
backend was not replaced. This is not an unattended-trading safety certification.

## Authoritative Read-Only Evidence

Two authenticated account reads returned position 0 BTC and zero open orders.
An independent authenticated order/fill query from the PLACE creation boundary
returned the following exact lineage:

- PLACE `intent-200854252a7cd14bdea29a31`, original quantity 0.00013 BTC,
  creation time 1793854095963.
- Venue order `170141594179263706066195014466442100736`, client order
  `d1b200854252a7cd14bdea29a31f3109`.
- Fill `129260825583338352264272522248193`, 0.00003 BTC at 80473.5,
  transaction version 7909291813, timestamp 1793854309308.
- CANCEL `intent-1debdec09afa6198fc89b1d0`, residual quantity 0.00010 BTC,
  creation time 1793854312854, persisted status ACKNOWLEDGED.
- Venue history contains a partial-fill FILLED event with 0.00010 remaining,
  followed by CANCELLED with zero remaining. The partial-fill event alone is
  not terminal proof.

The persisted PLACE is already CANCELLED_EXTERNALLY and owns the exact fill
provenance. The original database has one unresolved intent, the CANCEL above.
Its SQLite user_version is 0; the actual stored bodies and PLACE lineage parse
under the current code. No schema incompatibility was needed to explain this
incident.

## Proven Defect And Repair

The prior fix changed the execution-loop `getReconciliationIdentity` path.
web-v1 startup instead calls `reconcileDecibelAcknowledgedTerminalOrdersV1`, then
`reconcileAllDecibelAcknowledgedOrdersV1`, inside
`convergeDecibelStartupRecoveryV1`. The latter still compared the CANCEL residual
against venue original quantity in two places, and queried fills beginning at
CANCEL creation, after the actual fill.

Startup now validates unique durable PLACE lineage, uses its original quantity
and creation boundary, and preserves contradictory ID/side/market/quantity
blocking. Missing PLACE lineage remains unresolved. A CANCELLED event must have
zero remaining quantity before this direct startup path treats it as final.

Fills are persisted to PLACE and CANCEL completion is persisted without taking
ownership of those fills. Both updates use the existing atomic journal batch.
Existing PLACE transaction provenance is preserved. Merely changing the original
quantity would otherwise expose fill ownership/provenance failures. The journal
validation rules themselves were not weakened.

## Isolated Replay

A read-only SQLite online backup of the real production journal was opened only
at a separate temporary path. The deterministic fake venue supplied the exact
identity, original size, prior fill and final cancellation shape above. The test
uses the exported web-v1 convergence function and both startup journal
reconciliation functions. Its session-recovery callback checks that no unresolved
journal rows remain; it does not run a real trading session or full HTTP server.

Result: RECOVERED, CANCEL status CANCELLED_EXTERNALLY, no remaining nonterminal
intents, unchanged intent count and unchanged mutation-attempt count. The exact
fill remains attached to PLACE. A repeated reconciliation pass performs no
further identity lookup. The production journal remains ACKNOWLEDGED.

Additional regressions cover unknown outcomes, non-final cancellations, genuine
quantity and venue-ID mismatches, outages, and fills during cancellation larger
than the cancellation residual but within the original PLACE quantity. Position
status tests cover confirmed, partial and zero TP coverage, stale account data,
wrong account identity and unavailable account data.

## Protective Execution Audit And Remaining Limitation

Existing execution separates entry capacity/headroom from validated position
reduction and bypasses the TP profit requirement for the existing canonical
RISK_REDUCTION action. Fresh account and market evidence, account identity,
reduce-only quantity, duplicate-order checks and existing policy still apply.
No loss threshold, leverage, maker-only policy or Max Loss was changed.

The existing executor blocks cancellation-first TP upsize with
TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD. Additive planning requires
verified venue semantics and execution is still blocked by
MULTIPLE_REDUCE_ONLY_CANONICAL_ADMISSION_UNVERIFIED. Production does not supply
verified multiple-reduction rules. Existing confirmed TP is therefore preserved;
the uncovered residual must remain UNPROTECTED. No additive capability is
claimed or enabled by this repair.

Historical startup reconciliation can still prevent runtime creation/activation,
and unresolved recovery is handled before strategic selection. This change does
not implement an independent protective executor through an unrelated historical
recovery failure. That requested architectural separation remains incomplete.
Unknown submissions and genuine identity conflicts remain blocking; they are
not bypassed on the strength of a flat account snapshot.

The runtime status area now separately displays engine operation, new-entry
readiness, authenticated position, confirmed exit quantity, uncovered quantity,
protection state, protective-action availability and the actual recovery blocker.
It explicitly reports BLOCKED_RECOVERY even if existing TP coverage is confirmed.
The status projection does not authorize orders. No session buttons were added.

## Startup And Verification

The exact `npm.cmd run decibel:production:web-v1` command was run before and after
the recovery repair. Both dashboard builds succeeded; the launcher used the
existing production bindings and Node v22.23.2 child. The post-fix process loaded
the changed source, then exited on EADDRINUSE at 127.0.0.1:4173. The occupying
process was not stopped, taken over or restarted. No deployment was performed.

Typecheck and both builds pass. The full npm test command passes outside the
sandbox, where its existing Chrome layout tests can run. Changed-file lint and
format checks pass. Repository-wide checks still report pre-existing scratch
files: lint cannot include `.tmp_conflict_readonly.cjs` and
`.tmp_exact_evidence.ts` in its project service; format also reports
`.tmp_conflict_readonly.cjs` and `src/readonly_exit_architecture_tmp.ts`.
No rules were disabled and these existing files were not removed.

No credentials were printed. No production journals, Settings, environment
bindings, startup scripts or risk policy were edited. No live orders were
submitted/cancelled and no real session was started, ended or restarted.
