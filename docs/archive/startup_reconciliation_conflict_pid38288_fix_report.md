# PID 38288 Authoritative Reconciliation Conflict

EXACT_CONFLICTING_RECORDS=

| Field | Stored record | Fresh authoritative confirmation |
| --- | --- | --- |
| Intent | intent-bfa7a98d86f6580c10d715c6 | Same |
| Venue order | 170141590376311906128769130109975134208 | Same |
| Client order ID | d1sbfa7a98d86f6580c10d715c67745e | Same |
| Market/action | BTC/USD, PLACE SELL, reduce-only PostOnly | Exact same BTC order |
| Quantity/price | 0.00068 BTC at 78826.9 | Same original quantity/price |
| Local terminal status | CANCELLED_EXTERNALLY | CANCELLED_EXTERNALLY |
| Provenance source | AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION | AUTHENTICATED_TERMINAL_ORDER_HISTORY |
| Provenance venueStatus | CANCELLED_EXTERNALLY | CANCELLED |
| Remaining quantity | null (unknown) | 0 |
| Transaction hash | 0xdeca4c615d026e80177cc38028ab1e61ce8f7d6c8e7d43d6ae6684cb103962e0 | Same |
| Stored evidence timestamp | 1793306634892 | Fresh batch observedAt, e.g. 1793321315013 |
| Matching fills | None | Direct exhaustive venue query returned none |

The authenticated raw order history contains Open and Cancelled events at the same venue epoch 1793306633003 (30 October 2026, 03:43:53.003 Bangkok), with cancellation_reason PostOnlyViolation. This is a historical accepted-then-cancelled order, not a currently live order. Direct venue audit 1793321489010..1793321489826 found no account-wide positions or open orders. The most recent local read at 1793335769749 (11:49:29 Bangkok) still showed BTC flat, zero BTC orders, and recovery blocked. The earlier non-BTC short/order from the preceding incident is not the conflicting record; no non-BTC record enters this exact identity comparison.

THROWING_FUNCTION= decibel_execution_lifecycle_journal_v1.applyAuthoritativeReconciliation(), in the already-terminal status branch. The original identity guard passed: venue order and client IDs match. The subsequent terminal-provenance guard threw EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT because the prior venueStatus CANCELLED_EXTERNALLY did not equal CANCELLED and was not among its recognized stronger-confirmation cases. Its existing normalization handled stale OPEN and a legacy FULL_FILL label, but omitted the direct-reconciliation cancellation label. The transaction rolled back, retaining the same prior record and ensuring the next refresh retried the same failing comparison indefinitely.

VENUE_VS_LOCAL_ROOT_CAUSE= Demonstrated local provenance-normalization defect. The initial eight HTTP attempts all succeeded. This error was thrown after successful venue reads, inside local journal reconciliation, not by ACCOUNT_OVERVIEW or the transport. The same production rows and authenticated snapshot reproduced the failure in an in-memory database with production opened readonly. After the fix, that same isolated replay reconciled only intent-bfa7a98d86f6580c10d715c6; repeating the replay returned an empty result. No production row was changed.

The new acceptance case is narrow: prior source must be AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION, prior venueStatus CANCELLED_EXTERNALLY with null remaining quantity, local terminal status and reconciliation state CANCELLED_EXTERNALLY, identical transaction hash, non-regressing observedAt, no stored/incoming fills, and exact matching venue/client identities. The existing outer guard still requires authoritative terminal history with CANCELLED and zero remaining quantity. It strengthens the existing cancellation; it neither infers cancellation from flatness nor accepts an identity/fill contradiction.

An additional demonstrated identity-projection defect was exposed by the negative regression: cancellation lineage projection could overwrite an observed contradictory PLACE client ID with the local ID before journal validation. The telemetry reconciler now rejects that contradiction before lineage projection. CANCEL intents may have their own local request ID; their venue target is validated through the PLACE identity. Genuine conflicts include invariant, exact intent/order/client IDs, prior/observed states, provenance source and clocks in their error message, using primitive-only sanitized diagnostic fields.

Input trace:

- Authenticated BTC position and open orders came from the account read, independently of journal terminal labels. The failing replay had BTC position 0 and no BTC open orders; neither fact was used to fabricate a cancellation.
- BTC order history supplied the exact CANCELLED/zero terminal row. Fill history supplied no fills for this identity. The source's BTC strategy ledger and exhaustive raw identity audit are distinct provenance sources; they were not merged into an invented fill.
- Account-wide positions are retained where needed for collateral evidence; actualInventoryBase sums BTC only. The source filters open orders by BTC market. Tests inject an unrelated non-BTC position/order and verify they cannot become BTC inventory or orders, while non-BTC position metadata remains distinguishable.
- The local execution journal had no nonterminal intents and no active identity-conflict record. The conflict originated in the already-terminal historical PLACE record and its prior provenance, not in an unknown submission.
- The persisted session was session-1793298728045-581cfac3-f7cd-4bf1-b75b-f5a5626f0dd9, STOPPING, owner PID 24500 / instance 38104-1793298584893, heartbeat 1793318395908. The new process was PID 38288 / instance 15628-1793319547438, build bdbe251a1f06d627. No recovery lease was held. The prior owner requires ordinary recovery, but the conflict arose before session ownership recovery could finish. No owner record was overridden.
- Before-fix in-memory replay used overlapping source windows: account 1793321311871..1793321312460 and history 1793321311873..1793321312391, sourceStateHash d6017d03a69a422d3eb197d3622faeac9a2fb5f4783ded7cda9c93e4a07ee18c. After-fix isolated replay used account 1793321572245..1793321572680 and history 1793321572246..1793321572719, hash 7349bf8425da8f6982354ed0d77411dc3259bcc11bdebf715a3f129db32c07cc. Both describe the same immutable cancelled order; no disjoint/mixed-time read was needed to produce the error. Tests reject disjoint account/history windows and partial reads before publication.
- The old publication ordering marked authenticated state ready before terminal reconciliation could throw. The fix moves reconciliation before committing the new authenticated snapshot/observation. A failed candidate leaves the previous coherent publication intact, with its original TTL; it does not claim the failed candidate is ready.

WHY_JOURNAL_CLEAR_BUT_RECOVERY_BLOCKED= JOURNAL_CLEAR means Journal.nonTerminal() is empty. It does not mean every historical provenance record has passed republication validation or that session ownership recovery completed. Closed cancelled orders are intentionally reconsidered when their prior terminal provenance can be strengthened. That historical comparison threw, so startup never reached successful session recovery. The recovery dependency therefore remained blocked and the execution loop stayed unscheduled. The new normalizer breaks this specific repeat loop without weakening genuine conflicts. Existing Warning UI now renders the full recovery reason, including invariant and IDs, instead of showing only the generic recovery message.

FILES_AND_FUNCTIONS_CHANGED=

- src/decibel_execution_lifecycle_journal_v1.ts — applyAuthoritativeReconciliation: exact legacy-cancellation confirmation and detailed fail-closed diagnostics.
- src/decibel_production_web_telemetry_v1.ts — reconcileDecibelAcknowledgedTerminalOrdersV1: preserve and validate observed PLACE identity before projecting cancellation lineage.
- src/run_decibel_production_web_v1.ts — reconcileBeforeDecibelAuthenticatedPublicationV1, publishAuthenticatedSnapshot and publishAuthenticatedAccountState: reconcile before publication; bootstrap candidate selection is staged before committing it.
- web_dashboard/src/presentation.ts — buildOperatorAlertsV1: include the sanitized specific recovery reason in the existing Warning mechanism. No UI section/button/banner added.
- tests/decibel_production_web_telemetry_v1.test.ts — exact-record replay, idempotency, identity/transaction/source/time/fill negatives, publication failure, IDLE recovery, unknown-submission retention, non-BTC and mixed/partial-read cases.
- tests/decibel_production_web_presentation_v1.test.ts — specific conflict Warning and updated recovery-message expectation.

BEFORE_AFTER_STARTUP_REPLAY= Before: successful authenticated HTTP -> exact cancelled record encounters terminal-provenance conflict -> transaction rollback -> JOURNAL_CLEAR plus RECOVERY_BLOCKED -> repeated same failure. After, using copied production rows only in memory: authoritative terminal history strengthens one cancellation -> the next identical pass is a no-op -> candidate can publish -> startup convergence with no active session reaches IDLE without creating a session or invoking startRuntime. Existing STOPPING-session/old-order recovery tests continue to cover ordinary owned recovery/finalization; this patch does not change that policy or automatically start a new session.

Regression scenarios include BTC flat/no BTC orders with unrelated non-BTC activity, active BTC inventory with reduce-only coverage, cancelled historical order, retained unknown submission and Start rejection, contradictory authenticated identities/states/fills, disjoint source windows and HTTP partial reads. Genuine missing/contradictory evidence remains blocked; the failed candidate is not published.

REGRESSION_RESULTS= Targeted journal/telemetry/session/authoritative suites: 171 passed. Warning regressions: 2 passed. Separate HTTP recovery suite: 6 passed. Production typecheck and build, plus dashboard build passed. Final npm test: 925 passed, 2 failed across 31 production-core files; both failures are the existing Chromium GPU startup/layout checks. The chained HTTP tests were run separately and passed. Changed files pass ESLint and Prettier. Repository format:check fails on pre-existing .tmp_conflict_readonly.cjs; repository lint reports project-service parsing errors for pre-existing .tmp_conflict_readonly.cjs and .tmp_exact_evidence.ts. No lint/test suppression or bypass was added.

DEPLOYMENT_STATUS= Local implementation and test/build artifacts only. Not deployed or restarted. Production remained RECOVERY_BLOCKED at the last read; this report does not claim live recovery. No mainnet orders, cancellations, session starts, production journal writes/deletion, manual recovery override or live state mutation. Production SQL connections were readonly; reconciliation replay mutations occurred only in an isolated in-memory copy and temporary test databases. No strategy, risk, Settings, leverage, sizing, DCA, TP or maker policy changes.
