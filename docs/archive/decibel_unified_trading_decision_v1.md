# Unified Production Trading Decision

## Implemented architecture

`evaluateTradingDecision(snapshot, session)` in `src/decibel_trading_decision_v1.ts`
is pure and deterministic. It consumes the existing typed authenticated
`decibel_production_live_snapshot_v1`, immutable active-session settings and
explicit journal execution context. No second capacity calculator, certificate
system, trading scheduler or risk policy was added.

The result contains TRADE/WAIT/STOP, a primary reason, detailed reasons,
bid/ask eligibility, executable aggregate limit, executable per-order BTC sizes,
new-exposure permission, evidence timestamps/ledger/hash/session identity,
recovery condition and separate quote-cost/session-loss diagnostics.

The production orchestrator and its final fresh submission preflight consume
this decision. Repeated strategic capacity/session-risk branches were removed.
Existing lot, quantity, margin, venue, ownership, identity and submission checks
remain final safety assertions. The actor publishes its decision with the same
snapshot; presentation cannot invent TRADE by selecting different quotes. It
may revoke stale/unsafe permission. UI shows TRADE/WAIT/STOP, a human primary
reason, authenticated update time, executable limit, actual quote sizes and
recovery status. Session clock and backend polling cadence are unchanged. ETA
remains UNKNOWN outside reliable TRADE throughput.

## Recovery semantics

WAIT preserves the existing control loop. Economic rejection recomputes on the
next market/account update. Account risk inputs and margin rules have separate
freshness checks and reuse fresh successful components. Missing/failed/stale
rules are retried on the next existing authenticated refresh even when
leverage/fees remain fresh. A position change invalidates cached position-bound
leverage inputs. Single-flight behavior is preserved. No source timestamp is
rewritten to make stale evidence appear fresh.

Continuous mandatory-evidence failure escalates WAIT to STOP after 60000 ms.
This is an operational escalation, not a trading timeout: no missing data ever
becomes permission. Refresh/reconciliation continues during STOP. Fresh complete
verification can recover nonterminal STOP; session END and actual Max Loss stay
terminal. Repeated stable control messages are rate-limited to heartbeat output.

## Three reported reasons

- `LIFECYCLE_COST_BUDGET_EXCEEDED`: quote admission is measured in bps, separate
  from Settings Max Loss in USD. The shared formula is one maker fee plus two
  USD transaction reserves converted to bps, adverse selection and safety.
  Candidate-specific adverse evidence uses the existing side/distance, 30-sample
  and one-hour coverage policy. Strategy and final preflight share the helper.
  No duplicate maker fee or USD/bps conversion defect was found.
- `SESSION_CAPACITY_EVIDENCE_REQUIRED`: a missing or position-mismatched cached
  leverage/fee observation must trigger refresh, never an assumed cap. The
  consumer remains fail-closed, with immutable session identity/revision checks.
- `CAPACITY_VENUE_MARGIN_RULES_STALE`: the old cache shortcut checked only
  leverage/fee age and could skip stale or failed margin rules. Independent
  component freshness/retry now fixes that producer-consumer path.

Read-only production evidence captured at epoch ms 1793026806548 is stored in
`data/decibel_unified_decision_readonly_evidence_v1.json`. That sample had
Capital $8, Max Loss $2, target $201, reported session PnL $0, executed volume
$0, and aggregate capacity/headroom $118.08069. Maker fee was 1.5 bps, adverse
selection 9.173921798414584 bps, safety 1 bps and gas reserve
$0.0004660329 per transaction. Even before gas, cost was
11.673921798414584 bps, above the 11.25 bps admission ceiling and 11.035 bps entry budget.
No quote size can satisfy that sampled cost policy while those inputs remain
unchanged. The remaining session loss allowance was $2 based on reported PnL;
it is not an economic admission budget or a loss guarantee. No policy parameter
was changed to manufacture profitability. This sample is not a live validation
of the refactored process.

OPEN ENTRY continuation does not reuse this admission ceiling as a cancellation
rule. It evaluates the authenticated residual's future net economics (excluding
sunk placement gas), while independent hard-risk and executor checks remain.

ENTRY business flow is FLAT → PLACING → OPEN → CANCELLING → FLAT. A verified
terminal fill transfers protection to the inventory/TP workflow. Partial fills
retain OPEN ownership of the residual and protect the filled position separately.
Executor RECONCILING/unknown-submission states suspend mutations; they do not
introduce another quote-selection strategy. No new persisted business state or
state-machine framework is required. Planner and final submission share admission
economics; final authentication/risk validation remains necessary after read races.

## Independent safety lane

Reconciliation, pending-intent resolution, supported safe cancellation and
canonical reduce-only IOC unwind execute independently of strategic admission.
TP ownership checks remain required. FLAT alone never proves an intent terminal.
The existing session controller persists ENDED only after authenticated flat,
zero orders, zero unresolved intents and completed unwind.

End-to-end replay also exposed a canonical partial-fill/cancel gap: terminal
cancellation previously rejected its proven fills. The existing atomic journal
boundary now accepts exact partial-fill cancellation with merged immutable
quantity bounds. CANCEL receipts do not claim fill ownership belonging to PLACE.
No production journal was changed.

## Verification coverage

- Same-runtime WAIT -> TRADE for economic improvement, missing capacity and stale
  margin rules, without restart or START SESSION.
- Actual producer reads retry stale/missing rules while retaining fresh
  leverage/fee reads; account identity is verified.
- LONG 0.00073, ~$118 capacity, pending TP ownership, manual FLAT with an unresolved
  journal conflict, zero headroom, sub-minimum sizing and Settings Max Loss
  $1/$2/$3/$5.
- 500-cycle fake-venue integration: controller START, strategy decision, sizing,
  quote, maker fills, exact-once V2 ingestion, partial cancellation, inventory
  management, End Session with economic admission deliberately blocked,
  reduce-only taker IOC, authenticated flat/orders/intents convergence, durable
  ENDED and store restart. Session settings and volume accounting are preserved.
- Existing identity/stale-OPEN, delayed ACK, partial fills, restart, target and
  ETA regressions remain in the full test suite. Offline fixtures are never
  production evidence.

## Deployment

The backend is not restarted or activated by this task. Build the backend and
web dashboard together. After a separately authorized session-aware handover,
use the existing `npm.cmd run decibel:production:web-v1` launcher without
`--auto-resume` or a session START request. Verify the new build and
`runtime.tradingDecision` read-only. Existing canonical recovery must establish
account/order/journal safety; unknown TP ownership and real identity conflicts
remain STOP. Do not force ENDED, change immutable settings, bypass unfavorable
costs or manually rewrite production journal records.


## Inventory-aware capital and execution follow-up

Entry allocation/headroom is no longer the universal quote bound. The existing
planner has a separate reduction bound from verified venue order limits (or the
existing independent order safety ceiling). Its per-side callback applies the
original dynamic cap and allocated margin to entries. Strict reductions use
unallocated authenticated margin and cannot exceed the remaining authenticated
position minus same-side pending reductions. Every inventory-reducing maker
intent is reduce-only; final fresh preflight repeats its quantity checks.

The shared decision publishes authenticated free margin, strategy collateral
allocation remaining, aggregate exposure cap, incremental headroom, reducible
BTC, pending exposure and the executable minimum separately. Per-side OPEN and
REDUCE plans and existing-order management are diagnostic backend data. Critical
identity/evidence/Max Loss checks and the independent canonical unwind remain.
No frontend layout, operator setting or approved economic/risk parameter changed.

The existing account refresh path proactively refreshes short-lived margin rules
at half their current validity window, single-flight. Still-valid observations
can be reused while the refresh runs; original source timestamps and submission
TTL checks remain mandatory. Failed/expired sources never grant permission.

A read-only production sample at epoch ms 1793065834750 showed SHORT 0.00073 BTC
($58.4181405), authenticated free margin $8.0533424, calculated aggregate capacity
$118.436778 and headroom $60.0186375, but stale margin rules blocked quoting.
These are captured values, not a post-deployment account or position claim.

Existing executor logs for intent-069290a7061778f0e32fe3ff showed 3018 ms before
SDK PLACE and another 1353 ms in the SDK. Four independent gas/balance/object
RPCs were sequential. They now run concurrently, with all observations and
existing safety checks still awaited before PLACE/CANCEL. No RPC result is
fabricated or treated as fresh by changing its timestamp. Existing SDK stage
logs remain; cycle diagnostics additionally measure authenticated reads,
market-to-decision, newly observed fill-to-eligible-opposite decision,
decision-to-executor, executor-to-ACK and cancel-to-replacement readiness.
Bootstrapped historical fills do not produce fabricated latency samples.

Offline regression replays the SHORT with $7.8 free margin and zero entry cap:
reducing maker BUY, partial fill, owned resting residual without a duplicate,
canonical cancel/IOC, flat/orders-zero/intents-zero, and journal reopen. The
500-cycle controller replay separately verifies durable ENDED, accounting and
restart. This task does not restart/deploy the production backend or send any
mainnet mutation. Use the separately authorized session-aware deployment
procedure above; do not interrupt an active position to load these changes.


## Two-sided dynamic quote regression

The legacy ladder suppresses inventory-increasing admission outside a fixed $2.50
neutral band. That was still applied before authenticated dynamic headroom, so a
SHORT near $58.4 lost SELL candidates despite approximately $60 incremental
headroom. The new-session dynamic planning path passes its verified headroom to
the existing ladder; the authenticated aggregate cap already contains the
collateral allocation, so that fraction is not applied again to the residual
budget. Legacy inputs without verified dynamic headroom retain their original
admission semantics. Hard position limits, Max Loss and final fresh preflight
remain required.

Both sides are planned in one decision, while the existing executor continues
to serialize mutations. A small joint allocator in the existing sizing module
shares remaining executed-volume and collateral reservations across both valid
quotes, rounds to exchange lots, and falls back to one justified side if two
actual minimums cannot fit. It does not net opposite orders. A valid resting
flat-pair cohort keeps its quantity while the second side is admitted; an exact
terminal cancel releases ownership idempotently, never absence/FLAT alone.

Dynamic reduction candidates are capped independently instead of replacing the
entire candidate ladder with its first level. Candidate selection and final
preflight now agree on candidate-specific adverse evidence and expected edge;
edge is recomputed for the selected candidate. Legacy cost-only admission and
its historical tests remain unchanged. A side that genuinely fails economics
stays ineligible without suppressing its valid counterpart.

Backend decision/log diagnostics expose BID_SIZE, ASK_SIZE, BID_BLOCKER,
ASK_BLOCKER, BID_REDUCE_ONLY, ASK_REDUCE_ONLY, REMAINING_ENTRY_HEADROOM and
COMBINED_PENDING_RISK. Log eligibility uses the unified executable decision,
not a stale raw candidate flag. Concurrent-fill regressions check every BUY/SELL
fill subset against the same aggregate cap and retain the anti-flip cancel for
partial fills. No dashboard redesign or production order/journal mutation was
performed for this change; offline results do not imply live deployment.


The same existing directional position-budget helper is used by dynamic sizing
and the unified submission decision. Global worst-side headroom had already
reserved pending exposure; capping every side by that global remainder and then
subtracting same-side pending again could strand an affordable second quote or
shrink its own replacement twice. Final preflight retains shared directional
sizing instead of repeating that global cap. The bound checks each endpoint
(position + all BUY fills, position - all SELL fills), never an assumption that
opposite orders have already offset. Joint reservations separately retain all
live collateral/volume obligations until exact CANCEL ACK, so an intended shrink
cannot finance a new opposite quote early. Regression includes a globally fully
reserved flat BUY with a still-safe SELL endpoint, and exact replacement credit.
