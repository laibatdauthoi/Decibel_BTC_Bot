# BTC Exit Coverage Architecture Repair

Audit date: 4 November 2026, Asia/Bangkok. Branch: `chore/production-cleanup-v1`.
This workspace already contained extensive uncommitted production fixes and
incident replays. This review preserved and tested them, and corrected additional
demonstrated gates. Changes are local; this is not a deployment confirmation.

ROOT_CAUSE_MATRIX=

| Incident / evidence | First incorrect application transition | Correction / evidence boundary |
| --- | --- | --- |
| DCA inventory growth; recorded fills 0.00072 at 80466.8, 0.00019 at 80407.6, 0.00013 at 80346.7; original TP 0.00091 at 80577.4 | Coverage upsizing and price repricing shared economic/selection gates. An entry-oriented candidate gate could remove a quantity repair before its own authorization was assessed. | Separate ordinary TP assessment from entry edge/cost admission. Quantity-only repair preserves the exact authenticated resting-price authorization through committed cancellation and restart; changed-price orders retain TP net-profit checks. See `decibel_inventory_exit_incident_v1.md` for conditional basis calculations and exact journal identities. |
| Authorized defensive reduction; PID 19104 and PID 24500 reports | A KEEP branch or entry capacity/final admission could discard an already-authorized reducing action. | Existing canonical risk authorization has dispatch priority. Reduction sizing uses the authenticated position and genuine venue cap. Freshness, ownership, unknown submission, maker constraints and Max Loss remain enforced. |
| PID 24500; full TP 0.00128 at 80847.3 cancelled; replacement 0.00068 at 78826.9 | Successful cancel removed coverage; replacement ACK was not proof of a resting order. Entry headroom/notional and margin dependencies subsequently obstructed recovery. | Cancellation and replacement remain distinct durable intents. Resolve exact identity, then rebuild and reauthorize from fresh position/orders. Venue PostOnlyViolation is a legitimate rejection; the prolonged blocked recovery was an application defect. |
| PID 18876; authenticated entry 0.00045 at 78399.1 | After the opposite non-reduce-only order was correctly cancelled, ordinary TP candidate construction yielded `NO_QUOTE_CANDIDATE`; selection/result permitted healthy-looking NONE/NO_OP with no specific TP condition. | Build/assess protective candidates independently of entry funding; report actual TP economics or missing evidence. Uncovered silent HOLD becomes BLOCKED even without the optional reduction-capacity extension. No losing TP is newly authorized. |
| Remaining-volume audit, demonstrated by new failing LONG/SHORT regressions | `evaluateWithFlatPairCohort` shared entry volume/collateral across a non-flat pair; `evaluateTradingDecision.validOrder` independently capped reduction by remaining target volume. | Shared allocation applies to flat opening pairs. Remaining entry volume does not truncate a reducing order. Reaching the session target still requests the existing canonical unwind. |
| Small inventory audit, demonstrated by new failing LONG/SHORT regressions | Entry notional filtering discarded a profitable, venue-executable 0.00003 BTC TP after reduction sizing. Exhausted ladder funding could prevent any price candidate. | Use the existing price formula independently of entry funding when a protected candidate is missing; apply venue minimum size, position/venue maximum, TP economics and final maker admission. Entry floors and entry strategy are unchanged. |
| Cancel commit audit | Strategic cancel commit reapplied entry venue-margin-rule freshness to quantity-only/defensive reductions after upstream authorization. | Preserve fresh authenticated position/account and market checks; apply entry margin-tier dependencies to increasing replacements. Event replay includes stale entry rules. |
| Late authenticated request / partial publication | Comparing completion timestamps alone could let an older-started read overwrite a newer batch. | Reject regressing read-start clocks; retain atomic publication, original clocks, batch overlap checks and position consistency. Reject non-finite window clocks. |
| Unknown execution and startup cancellation equivalence | Pre-submission validation exceptions could look like unknown submissions; equivalent terminal cancellation encodings could latch conflicts. | Preserve the existing corrected durable-claim boundary and canonical identity resolver. Genuine unknown outcomes remain owned and cannot be retried from absence or elapsed time alone. |
| Coverage outcome / price ownership audit | Any non-cancel ACK could be labelled TP repair; a partial order from the wrong market/strategy could provide a resting-price witness. | Only reducing action classes can produce repair ACK outcomes. Resting-price witnesses require matching market, strategy, nonempty identities and a valid price. |

SHARED_ARCHITECTURAL_FAILURE=

Entry candidate availability was being used as a prerequisite for protecting
existing inventory. Several later layers independently reconstructed capacity
and economics, so upstream authorization did not imply downstream action
admission. Journal ACK, venue order existence, and confirmed coverage were also
different facts that some recovery/telemetry paths treated interchangeably.

The resulting architecture keeps these facts separate:

- Authenticated position plus authenticated remaining owned reduce-only orders
  determine actual coverage through `calculateDecibelExitCoverageV1`.
- Pending intents reserve execution ownership/quantity but establish no coverage.
- Action classes identify ENTRY, DCA, TP_COVERAGE_REPAIR, TP_PRICE_REPRICE,
  DEFENSIVE_RISK_REDUCTION, CANCEL and RECONCILIATION.
- TP candidate price, quantity, profitability authorization, final admission,
  SDK acknowledgment and authoritative order confirmation remain separate stages.

Production decision path and gate map:

| Stage | Production functions / required evidence |
| --- | --- |
| Authenticated read | `readAuthenticatedAccountState`, `readAuthenticatedFillLedger`, `mergeDecibelVenueReconciliationSnapshotV1`; original read windows, complete position/order batch, monotonically newer evidence |
| Session projection | `projectDecibelVenueDecisionSnapshotV1`, `projectSessionConfiguration`; matching account/session/market, position basis, genuine venue reduction cap independent of entry headroom |
| Inventory / coverage | `calculateDecibelExitCoverageV1`, `withExitReservations`; count authenticated resting quantity only, reserve unresolved identities separately, pause entries while uncovered |
| Candidate price / quantity | `evaluateAuthenticatedSnapshot` -> `evaluateWithFlatPairCohort` -> `evaluateDecibelAuthenticatedPassiveRecyclingV1`; existing ladder pricing plus independent reducing-candidate construction, directional dynamic sizing |
| Ordinary TP authorization | `assessDecibelTPActionV1`, `assessDecibelExitEconomicsV1`; fresh basis/account/book/fees/reserves, valid exact reducing quantity, unchanged strictly positive net-profit policy for new prices |
| Defensive authorization | `coordinateDecibelInventoryExitV1`, canonical RISK_REDUCTION / SESSION_UNWIND evaluation; existing risk policy alone grants authority, ordinary TP repair does not depend on defensive eligibility |
| Plan / replacement | `selectMutation`, `evaluateDecibelReplacementDecisionV1`; retain valid existing coverage until replacement readiness is proven, committed cancel identity, fresh replacement revalidation |
| Final admission | `evaluateTradingDecision`, `validateDecibelFinalMakerAdmissionV1`, `validateDecibelPlaceIntentV1`; account/session ownership, current position, aggregate reducing quantity, increments, genuine venue cap, passive price, persistence and no unresolved identity |
| Execution | `decibel_execution_lifecycle_v1` -> executor gate -> `decibel_external_production_executor_v1`; durable claim before invocation, exact client identity, PostOnly and reduce-only SDK arguments |
| ACK / reconciliation | Journal outcome plus authenticated exact-identity reconciliation; ACK reserves ownership, OPEN/PARTIAL_FILL confirms remaining coverage, terminal evidence releases ownership |
| Outcome | `deriveDecibelExitCoverageWorkflowV1`; VERIFIED_COVERED, TP_REPAIR_ACKNOWLEDGED, DEFENSIVE_EXIT_SUBMITTED, RECONCILIATION_PENDING or BLOCKED with evidence and next condition. Synchronous execution reports ACK after the submitted stage; requests never count as verified coverage. |

EXACT_CODE_CHANGES=

Additional changes made during this review:

- `decibel_production_live_orchestrator_v1.ts`: scope two-sided entry allocation
  to flat inventory; remove entry margin-tier checks from proven reducing
  replacement commit; check original account clocks in freshness; classify
  uncovered silent HOLD explicitly without requiring a capacity extension.
- `decibel_authenticated_passive_recycling_orchestrator_v1.ts`: scope notional
  floors to the action; construct a missing reducing price candidate independently
  of ladder funding, then apply existing authorization and executable sizing.
- `decibel_smart_ladder_v1.ts`: extract the identical price calculation as
  `calculateDecibelLadderPriceV1`, shared by entry ladder and protective candidate.
- `decibel_trading_decision_v1.ts`: exclude exact reductions from entry-volume
  truncation and apply venue quantity minimum to authorized TP reductions.
- `decibel_order_action_v1.ts`: validate resting price-witness market/ownership.
- `decibel_exit_coverage_workflow_v1.ts`: exclude ENTRY/DCA/reconciliation ACKs
  from TP repair outcomes.
- `decibel_venue_reconciliation_snapshot_v1.ts`: reject late older-started
  batches and malformed evidence clocks.
- `decibel_production_live_orchestrator_v1.test.ts`: new regressions and extended
  real-adapter event sequences, including sub-entry-floor TP and market movement.
- Existing production wiring and test files were formatted; unnecessary type
  assertions were removed. No lint rules were disabled.

The already-present journal price witness, TP/entry admission separation,
identity reconciliation, pre-submission error classification and PID replays were
preserved and exercised. They were not all newly implemented in this turn.

REMOVED_CONFLICTING_GATES=

1. Non-flat reducing orders sharing incremental two-sided entry budgets.
2. Final reducing order notional bounded by remaining entry target volume.
3. Entry notional floors filtering authenticated protective quantities.
4. Entry ladder funding required before a protective price can be considered.
5. Entry margin-tier freshness required to commit a reducing replacement.
6. Optional reduction-capacity metadata required to expose a silent uncovered HOLD.
7. Any ACK being sufficient to report TP repair, regardless of action class.

These removals do not remove venue limits, ownership checks, maker-only checks,
TP profitability, Max Loss, unknown-submission protection or session unwind.

PID18876_BEFORE_AFTER_REPLAY=

Actual read-only local evidence:

- Opening intent `intent-3fee4ce804ce99b2daa575ab`, BUY 0.00045 at 78399.1,
  order `170141604320468508255931283162468974592`.
- Venue fill: OpenLong 0.00045 at 78399.1, epoch 1793342060027,
  transaction version 7827149603.
- Opposite order `170141591643962508946981648023569825792` was an entry
  SELL 0.00045 at 78599.6 with reduce-only=false. It was not authoritative TP
  coverage. Cancelling it for `RISK_INVALID:REDUCE_ONLY_REQUIRED` was correct.
- Cancel intent `intent-dc282e4d60c19a8b35d4fa73`, created 1793342064369.
- `data/production_runtime/stdout.log` contains 1051 matching
  LONG-0.00045 NONE/NO_OP observations with incomplete coverage. These are
  log observations, not 1051 independently authenticated venue reads.
- Journal decisions at 1793342100417, 1793342101950 and 1793342102758 have
  askReason=NO_QUOTE_CANDIDATE, desiredAsk=null, entryBlockedByCoverage on BUY,
  despite available headroom about 36.85 USD. This local decision defect is
  directly established; an exchange rejection was not the cause of these NO_OPs.
- Authenticated history now confirms a later reduce-only CloseLong fill,
  0.00045 at 77973, epoch 1793347488672, transaction version 7828003734,
  order `170141599249866107167435336324728487936`. Actor attribution is unknown.
  It occurred historically and is not attributed to these changes.

Replay after correction: the recorded inventory/basis and representative adverse
book produce a specific `TP_NET_PROFIT_NOT_POSITIVE` blocker and zero submission;
LONG and mirrored SHORT both pass. The profitable-condition counterfactual uses
the same quantity and succeeds through actual orchestrator, final maker admission,
lifecycle, disposable journal and real executor adapter with an injected fake
venue. It retains zero confirmed coverage after ACK until an authenticated fake
OPEN observation. The same path covers 0.00003 BTC with zero entry budget and
zero available entry margin. No TP threshold is relaxed to force a fill.

The replay is an incident-state reconstruction and controlled event simulation;
it is not a recovered recording of every historical HTTP response or market tick.

PID24500_BEFORE_AFTER_REPLAY=

Read-only journal confirms cancel intent `intent-b884b410c22e54046edfa54c`
at 1793306540416 for SELL TP 0.00128 at 80847.3 and replacement intent
`intent-bfa7a98d86f6580c10d715c6` at 1793306627110, SELL 0.00068 at 78826.9.
The earlier authenticated incident report records replacement Open/Cancelled at
the same venue timestamp with PostOnlyViolation and subsequent prolonged zero
coverage; see `zero_exit_coverage_pid24500_fix_report.md` for all identities,
read clocks and the eventual historical close.

Existing LONG/SHORT replay exercises the incident-sized 0.00128 position,
exhausted entry capacity, canonical defensive authorization, actual final gate,
real adapter with a fake SDK client, PostOnly/reduce-only arguments and exact ACK
identity. It proves coverage remains zero until authenticated OPEN and then
converges to full remaining coverage. A real venue rejecting a maker order is
still possible; the correction ensures explicit recovery or a necessary blocker.

TP_CANCEL_REPLACE_FAILURE_MATRIX=

| Event sequence | Required / tested outcome |
| --- | --- |
| Cancel succeeds; replacement accepted | Reconcile cancellation, submit one independently admitted replacement, confirm coverage from OPEN rather than ACK |
| Cancel succeeds; replacement receives PostOnlyViolation | ACK plus authoritative terminal cancellation releases that exact identity; fresh reauthorization creates a new identity; no blind resubmission |
| Other deterministic terminal rejection | Same identity-resolution requirement; the fake-venue sequence models terminal rejection after ACK. Adapter/lifecycle suites separately cover deterministic executor rejections |
| Timeout after acceptance | Durable unknown identity remains owned; repeated hidden observations cause no second submission; exact OPEN resolves it |
| HTTP failure after cancel | Keep cancellation/price provenance; no placement with failed evidence; recover after a complete fresh read |
| Partial reduction before replacement | Rebuild against smaller current inventory; replacement never exceeds it |
| Stale entry-margin rules | Quantity repair proceeds only with fresh authenticated account/book and its own economics; unrelated margin-tier clocks cannot block it |
| Market changes at final submission | Final maker preflight prevents a crossing order; later fresh passive evidence permits one new admitted attempt |
| Restart after cancel | Reopen disposable durable journal; recover the same authorization and identity before placement |
| Genuine identity conflict / missing authoritative result | Fail closed with exact conflict/evidence reason; elapsed time alone cannot authorize a duplicate |

The event matrix is LONG/SHORT and runs through the actual production interfaces.
Bounded test cycles demonstrate progress once evidence resolves. No finite time
bound can guarantee maker acceptance or resolve permanently unavailable venue
identity evidence; those conditions remain explicit blockers.

LONG_SHORT_INVARIANT_RESULTS=

The coverage sweep checks 762 lot-aligned LONG/SHORT position/coverage states
(127 quantities x 3 coverage states x 2 directions). Confirmed plus uncovered
equals absolute inventory; partial/zero coverage cannot be VERIFIED_COVERED.
Separate actual-orchestrator sequences check DCA, partial fills, reprice policy,
defensive priority, unknown outcomes, rejection/restart and exhausted entry caps.
New regressions demonstrate the previously failing target-volume and minimum
notional conditions before repair. Existing foreign-market tests preserve BTC
scope; no test venue can invoke a network-capable write client.

UNKNOWN_SUBMISSION_SAFETY=

No blind order retry was added. The lifecycle claims durable identity before
invocation. Pre-claim validation failure is not an unknown venue submission.
After invocation uncertainty, exact authenticated client/order/transaction
evidence is required. Missing open orders, stale cached snapshots, a failed HTTP
read, flat account projection or timeout alone cannot prove rejection. Terminal
identity evidence permits a newly evaluated intent, not a replay of the old one.

REMAINING_UNRESOLVED_RISKS=

- No deployed-process acceptance test was authorized. Local replays and builds
  do not prove a running production process has loaded this source.
- Current read-only venue state is flat. It cannot exercise a live nonzero
  inventory recovery. A losing ordinary TP remains blocked under existing
  economics unless canonical defensive policy independently authorizes reduction.
- Account/history endpoints are separate reads. Validated overlapping bounded
  windows are not an exchange-provided transactional snapshot. Changes during
  reads still require final refresh, identity checks and subsequent reconciliation.
- Multiple concurrent reduce-only order semantics remain unverified in production;
  the existing single-owner cancel/replace fallback remains enforced.
- Maker rejection and authenticated outages can prevent immediate coverage.
  Safety requires a specific blocker rather than an unsafe market fallback.
- Historical records are incomplete for some old ticks/basis observations;
  conditional economic reconstruction is labelled as such in the source reports.
- The workspace-wide formatting/lint checks still encounter pre-existing scratch
  files. They were not deleted, excluded or used to disable checks.

TEST_RESULTS=

Final `npm.cmd test`: **987 passed across all 33 files** (970 production-core
tests plus 17 authoritative-reconciliation/HTTP tests). This includes all 377
orchestrator tests, the 16 LONG/SHORT cancel/replace event sequences and 80
presentation tests. Chromium requires execution outside this filesystem/process
sandbox; the final full suite was run there with fake venues/disposable journals.

| Required command | Result |
| --- | --- |
| `npm run format:check` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `src/readonly_exit_architecture_tmp.ts` |
| `npm run lint` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`, outside the configured TypeScript project service |
| `npm run typecheck` | Passed |
| `npm test` | Passed, 987 tests |
| `npm run build` | Passed |
| `npm run build:web-dashboard` | Passed |

Changed source/test/report files passed a separate Prettier check. The final
repository ESLint output contains only the two scratch-file project-service
errors above; no changed production/test-file lint error remains. `git diff
--check` passed (Git also emitted Windows line-ending notices). PowerShell blocks
the npm/npx `.ps1` wrappers, so the equivalent `.cmd` launchers were used without
changing execution policy.

The first restricted full run failed Chromium GPU startup. A later concurrent
verification run crossed an existing 20-second 1000-cycle test timeout. After
the final source changes, the complete normal-timeout suite passed; no timeout
limit, assertion, lint rule or risk threshold was disabled to achieve that result.

DEPLOYMENT_STATUS=

Local source and generated build artifacts only. No commits, live submissions,
cancellations, session transitions, process restarts or production journal writes.
Production SQLite inspection used `readonly: true, fileMustExist: true`, without
constructing the mutable lifecycle/journal classes. Authenticated venue audit
used reader methods only.

At epoch 1793785621338 (4 November 2026, 16:47:01.338 Bangkok), the authenticated
positions and open-order requests began; they completed at 1793785622260 and
1793785622133 respectively. Both returned empty lists for BTC and other markets.
These are separate read observations, not a guarantee about later venue state.
Initial sandboxed read requests failed; the inspected read-only audit succeeded
outside the sandbox. No historical close is attributed to this investigation.

The dashboard layout and controls were not redesigned. Existing Warning-section
presentation and telemetry tests are part of verification; no banners or buttons
were added. This report does not declare live deployment or permanent mainnet
resolution.
