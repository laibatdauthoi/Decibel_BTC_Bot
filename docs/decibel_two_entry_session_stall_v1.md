# Two ENTRY Session Stall Recovery

## Evidence and limits

The production execution journal was queried with SQLite `mode=ro`. No production journal API capable of mutation was used. A separate SDK reader made only authenticated GET requests. The process was not restarted and no orders were submitted or canceled.

| Side | Intent | Client ID | Venue Order ID |
| --- | --- | --- | --- |
| SELL | intent-8290b5a77d88d871a6dae49a | d1s8290b5a77d88d871a6dae49a4c2a5 | 170141591643962509397391306721247363072 |
| BUY | intent-78c410cdb75fe877475a7eaa | d1b78c410cdb75fe877475a7eaa7c3b5 | 170141599249866109929633691153746362368 |

Both have persisted PLACE_ACCEPTED SDK outcomes, distinct transaction hashes, ACKNOWLEDGED state, and authenticated OPEN provenance with remaining quantity 0.00071. The SELL is repeatedly reconciled OPEN in the journal; the BUY also has an authenticated OPEN confirmation. Neither target has a persisted active identity-conflict record or recorded fills in the inspected journal. This does not prove that no transient conflict was thrown: the direct OPEN fallback throws before recording a durable identity conflict.

Fresh read-only venue history returns OPEN then CANCELLED for each exact order/client pair. Cancellation reasons are OrderCancelledByUser, with transaction versions 7798355608 (BUY) and 7798355625 (SELL). No matching trades, no matching currently open orders, and no positions were returned. These are venue observations; this task did not perform those cancellations. The narrow sanitized history is stored in the deterministic test fixture. Current terminal evidence does not reconstruct every earlier failed response.

## Demonstrated defects

1. **False direct ACK identity conflict from floating-point price representation.** Persisted SELL price is 81494.90000000001; authenticated history price is 81494.9. Direct OPEN recovery compared prices with strict numeric inequality. The regression reproduces that conflict using these exact values. Recovery now requires price alignment and equality of integer tick counts. Different IDs, side, market, reduce-only provenance and genuinely different prices remain blocking. A one-tick mismatch test still rejects. The raw original failing OPEN response was not retained, so the historical conflict cannot uniquely be attributed to this field; it is a demonstrated defect supported by the persisted and venue values, not proof of every historical failure.
2. **Terminal history omitted from periodic publication.** Periodic account/history refresh fetched ORDER_HISTORY but returned only the fill ledger. The web runtime retained old terminalOrderEvidence. It now returns and atomically publishes terminal evidence from the same successful history refresh, so zero-fill cancellations can advance reconciliation. A failed history read still prevents publication; no freshness requirement is relaxed.
3. **Orphaned reads overlap retries.** Supervisor rejection did not abort its operation signal, and account/history stages were not linked to that signal. One HTTP 500 could leave sibling requests running while the next attempt began. Supervisor settlement now aborts the owner signal, and account, history and complete-snapshot stages receive it. The regression shows all four pending siblings canceled before retry and exactly two requests per endpoint over failure plus recovery.
4. **Duplicate startup read and incompatible singleflight results.** Startup first refreshed account/history, then requested a second complete snapshot. Its generic singleflight could also return an account-shaped result to the strategy-snapshot caller. Strategy recovery now awaits the one authenticated refresh owner and reads its complete published projection. Initial structural bootstrap still uses the complete source read.
5. **Stale evidence mislabeled as initialization.** Freshness correctly expires after the existing 5000 ms window; HTTP 500 can prevent timely replacement. Previously even an expired, previously valid snapshot reported INITIALIZATION_REQUIRED. It now reports PRODUCTION_AUTHENTICATED_STATE_STALE. Existing snapshots retain their original timestamps and are not extended on error; successful publication restores READY.

No changes were made to DCA, TP strategy, entry decisions, sizing, leverage, Capital to Use, Max Loss, Volume or economic thresholds.

## Changed files and functions

- `src/decibel_production_live_orchestrator_v1.ts`: direct OPEN fallback in evaluateOnceInternal compares aligned integer price ticks; readAuthenticatedFillLedger interface carries cancellation signal and terminal evidence.
- `src/decibel_production_live_state_source_v1.ts`: normalizeDecibelTerminalOrderEvidenceV1 shared by complete and periodic reads; readAuthenticatedFillLedger returns terminal evidence; readAuthenticatedAccountState/readAll propagate owner cancellation.
- `src/decibel_runtime_supervisor_v1.ts`: runAuthenticatedRefresh aborts children on settlement; refreshAuthenticatedFreshness/setAuthenticatedReadBlocked/getSnapshot distinguish expired evidence.
- `src/run_decibel_production_web_v1.ts`: refreshAuthenticatedComponents passes the history signal and publishes terminal evidence; readAndPublishStrategySnapshot reuses the canonical refresh projection.
- `tests/decibel_production_live_orchestrator_v1.test.ts`, `tests/decibel_http_recovery_v1.test.ts`, `tests/fixtures/two_entry_order_history_v1.json`: deterministic precision, genuine-conflict, HTTP 500 cancellation/retry, freshness and two-order finalization regressions.

## Replay and session finalization

The exact two acknowledged identities are seeded into a temporary journal. OPERATOR_END persists STOPPING. An HTTP 500 leaves both intents unresolved and prevents finalization. On recovery, exact authenticated cancellation evidence reconciles both to CANCELLED_EXTERNALLY. With position FLAT, no open orders and zero unresolved intents, the existing durable finalizer automatically persists ENDED and releases the active session. Order mutation count is zero. Separate tests retain STOPPING/ownership for missing or contradictory evidence and reject a genuine one-tick price conflict.

## Verification and deployment

Affected orchestrator, supervisor recovery, authoritative reconciliation, session and telemetry suites: 423 passed across five files. The latest targeted two-order, precision and five-read cancellation replays pass (4 tests). Typecheck and build pass; changed-file formatting and lint pass.

Required repository checks were run using npm.cmd. Full npm test production-core stage: 803 passed, 2 failed due to Chrome headless GPU/access errors in existing presentation tests. Its chained second stage was run separately as part of the passing affected suites. Repository format check fails on existing .tmp_conflict_readonly.cjs; repository lint also rejects existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts. Those unrelated files were preserved.

Implemented locally on the existing non-main branch. No commit or deployment. PID 15264 was not restarted; production intents/session records remain untouched. Successful production convergence is not claimed until deployment and observation.
