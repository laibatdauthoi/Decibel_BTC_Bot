# Decibel Market Pipeline Audit

Audit Date: 9 November 2026 (Asia/Bangkok). Replays use mocked feeds and temporary
test journals. No production session, production journal or live order endpoint
was operated. Existing test imports can load environment configuration; no
credential values were printed.

## Current Implementation Before Changes

`decibel_client` uses the pinned `@decibeltrade/sdk` 0.7.0 reader. SDK transport
parses JSON and validates each depth frame before invoking the client callback.
The client owns one singleflight BTC subscription at aggregation 1; a pending
latest-frame slot and 50 ms timer coalesce frames before `normalizeDepthPayload`
validates market identity, positive levels, unique prices, BBO consistency and
uncrossed spread, sorts levels and derives top-five imbalance/microprice.

The production source's `readCurrentBook` calls `getBTCStreamingBook` only.
`getBTCCurrentBook` remains an explicit REST helper, not a production fallback.
The malformed-frame catch comment claiming a REST fallback is inaccurate.
Concurrent streaming readers share a subscription and waiters. A 5000 ms valid
observation idle limit initiates unsubscribe/resubscribe and a metadata HTTP read.
The SDK also reconnects its persistent socket and resubscribes existing topics.
There is no separate production adverse-collector subscription: its scheduled
job uses the shared raw BBO store.

`run_decibel_production_web_v1` schedules shared market publication at the lesser
of the controller interval and half BBO TTL (minimum 250 ms). The source produces
public market state, supervisor checks freshness, and the raw BBO store supplies
adverse/economic computations. Authenticated HTTP account/order/history reads
remain separate, with bounded reads, recovery/backoff and original observation
windows. These cannot be replaced by unverified ACKs or public depth messages.

The session runtime serializes `scheduleCycle` with `activeCycle`, supports wake,
and keeps recurring reconciliation. Orchestrator intent/journal/risk/final maker
admission precede external execution; finality and authenticated reconciliation
remain required. Scheduler jobs can run independently with one owner per key.
No trading policy, controller cadence or mutation concurrency change is justified
by the adapter delay alone.

## Feed Contract Evidence

Installed files inspected:

- `node_modules/@decibeltrade/sdk/dist/read/market-depth/market-depth.reader.js`
- `node_modules/@decibeltrade/sdk/dist/read/market-depth/market-depth.types.js`
- `node_modules/@decibeltrade/sdk/dist/read/ws-subscription.js`

Topic is `depth:<derived market address>:<aggregation>`. Aggregation choices are
1, 2, 5, 10, 100 and 1000; these are not documented level-count limits. Schema
contains market, asks/bids arrays of price/size, optional BBO and `unix_ms`.
There is no depth sequence, checksum, operation, relative quantity or deletion
contract in this installed interface. The existing consumer treats each frame
as a complete state. Reliable incremental reconstruction is unsupported by the
inspected contract; do not invent it. Timestamp ordering is not sequence proof.
The current [official SDK](https://github.com/decibeltrade/sdk) was also consulted;
its moving README is not substituted for the installed version's contracts.

## Evidence-Justified Scope

The 50 ms client timer deliberately adds publication delay even to the first frame.
A next-turn timer can remove that wait when no usable state exists; retain the
50 ms background coalescing window so sustained traffic does not increase parsing
work or change steady-state quote inputs. Controller scheduling and execution
gates need not change. Reconnect
invalidation currently leaves its old timer armed, so a new generation's frame
can be processed by an older generation's closure. SDK error handling also only
marks disconnected, allowing an already queued callback to mark connected again.
These are concrete lifecycle issues to test and repair together.

No redundant production full-book HTTP download was found. SDK wire byte counts
are inaccessible behind private socket state; JSON reserialization would measure
neither wire traffic nor mobile usage and add per-frame work. No live 4G savings
will be claimed. Broader event-driven trading dispatch requires separate measured
benefit and end-to-end churn evidence, so it is not inferred from transport delay.

## CURRENT_MARKET_DATA_ARCHITECTURE

Decibel SDK WS -> SDK JSON/schema parsing -> client latest-state slot -> depth
validation and normalized state -> source public snapshot -> supervisor freshness
publication -> deterministic strategy -> independent risk/final maker admission
-> durable execution intent -> external executor -> finality/authenticated
reconciliation. Account, margin, positions, open orders and history use separate
authenticated HTTP reads; a public frame does not authorize account mutations.
See the pre-change audit above for scheduling and ownership details.

## DECIBEL_FEED_CAPABILITIES_VERIFIED

The pinned SDK provides complete-shaped depth arrays, BBO fields and a venue
timestamp. Subscription aggregation is a price aggregation parameter, not a
verified requested number of levels. No reliable incremental depth contract was
found. No depth sequence/checksum or delta deletion semantics are assumed.
Authenticated topics exist in the SDK, but the audited production source uses
HTTP account/history evidence; replacing it requires separate correctness work.

## CURRENT_NETWORK_REDUNDANCIES

No duplicate production depth subscription or repeated REST full-book download
was found. Concurrent streaming readers singleflight; the adverse collector
reuses shared observations. SDK JSON/schema parsing still happens for every
wire frame before application coalescing. Coalescing saves local normalization,
not bytes. Public source reads also request market metadata on every refresh,
and account snapshots request metadata separately. These reads include mutable
venue mode/leverage and bounded observation windows: no new TTL cache was added
without evidence that reusing those observations preserves final risk freshness.
Reconnect metadata reads and account reconciliation remain intentional.

## INCREMENTAL_DEPTH_DECISION

**Unsupported by the inspected contract.** Retain the existing complete-state
consumer and shared subscription. Snapshot replacements naturally remove absent
levels; no relative deltas, zero-size deletion rules or sequence-gap recovery are
invented. Sequence-gap and partial-delta tests are consequently not applicable.

## EVENT_PROCESSING_OPTIMIZATIONS

- Initial/recovery publication uses a next-turn timer when no usable state exists.
- Normal background publication retains its established 50 ms burst window.
- Invalidation cancels the timer and clears its pending frame. Generation checks
  protect both metadata initialization and processing callbacks.
- SDK errors immediately invalidate queued state; an old callback cannot restore
  CONNECTED after disconnection. Late old-generation frames are ignored.
- Malformed, crossed and wrong-market complete states clear usable state and
  block streaming access until recovery. Timestamp regression against published
  state is rejected; equal timestamps remain valid because they are not IDs.
- Aggregate counters track received, coalesced, verified and rejected states, plus
  last/max callback-receipt-to-verification delay. Existing diagnostics retain
  reconnect count and liveness. The existing 30-second telemetry job emits these
  public fields as `DECIBEL_PRODUCTION_MARKET_PIPELINE`; there is no per-tick log
  or new dashboard layout.

## CONCURRENCY_SAFETY

No execution concurrency, risk authorization cache, prepared quote cache or wake
frequency changed. Existing active-cycle serialization, keyed scheduler ownership,
intent identity, exposure reservations, reduce-only TP and final admission remain
in place. Only market states can be coalesced. The market slot never receives
fills, ACKs or finality. A microtask-delivery test checks that queued critical
callbacks run while a burst is pending; it is not a venue delivery guarantee.
Reconnect history/fill recovery is exercised separately by existing durable
reconciliation tests. No production session was started, stopped or deployed.

## NETWORK_BYTES_BEFORE_AFTER

**Unavailable for live transport and 4G usage.** No wire counter is exposed by the
installed SDK's private socket. No synthetic JSON size is presented as wire bytes.
The identical 1000-frame cold-start replay performs zero REST book requests both
before and after; 100 concurrent subsequent readers still use one subscription
and one subscription-initialization metadata read. No byte savings are claimed.
Per-purpose HTTP rates and transport sent/received byte instrumentation across
SDK/authenticated transports remain unavailable from this focused change.

## PROCESSING_LATENCY_BEFORE_AFTER

Deterministic replay in `tests/decibel_client.test.ts` injects the original 50 ms
timer policy into the same adapter as a controlled baseline, then compares the
new first-state scheduling policy. It is a timer-policy comparison, not a captured
historical binary benchmark or a live timing measurement.

| Fixture / Metric | Original Timer Policy | Final Policy |
| --- | --- | --- |
| 1000 complete states in one turn, cold start | 50 ms | 0 ms scheduled delay |
| States normalized/published | 1 | 1 |
| Superseded frames coalesced | 999 | 999 |
| REST book requests | 0 | 0 |
| Steady-state timer window | 50 ms | 50 ms |

Zero is fake-clock scheduled delay: a real timer incurs event-loop scheduling and
normalization cost. Timing starts at the SDK callback, excluding wire transit and
SDK JSON/schema parsing. A sustained test seeds one book then sends 1000 updates
1 ms apart: 21 total states verified, 980 coalesced, final BBO preserved. Thus this
change does not turn sustained traffic into per-message normalization.
Verified-state-to-decision, decision-to-submission and ACK/finality-to-readiness
before/after latency are **not measured**; no end-to-end speed claim is made.

## PLACE_CANCEL_CHURN_REGRESSION

The adapter never submits transactions. Subscription count and zero REST book
request assertions pass. Execution cadence and normal coalescing remain intact.
Existing orchestrator replay tests exercise KEEP/replacement suppression, the
100-cycle BUY/SELL convergence bound, patient TP and stale-data admission. The two
orchestrator cases that timed out under overlapping heavy test runs pass when
rerun in isolation. No live churn measurement or full before/after transaction
trace is claimed; first-state recovery can intentionally become ready earlier.

## FILES_CHANGED

Changes made for this task, preserving the pre-existing dirty workspace:

- `src/decibel_client.ts`: initial/recovery scheduling, lifecycle invalidation,
  timestamp regression rejection and aggregate diagnostics.
- `tests/decibel_client.test.ts`: controlled replay and transport regressions.
- `src/run_decibel_production_web_v1.ts`: diagnostics in existing telemetry job.
- `docs/decibel_market_pipeline_audit_v1.md`: pre-change audit and final report.

No dependency, policy, environment, production journal or Settings change.

## Regression Coverage Mapping

| Requested Area | Coverage / Limitation |
| --- | --- |
| Initial snapshot; BBO, spread and liquidity after updates | New complete-state normalization/replacement and first-state tests |
| Delta insert/update/delete; sequence gaps | Not applicable: unsupported contract; complete-state insert/update/removal tested |
| Duplicate / out-of-order | Burst supersession, published timestamp regression and equal-timestamp state acceptance; no invented uniqueness proof |
| Reconnect / stale local state / unverified access | Existing stall resubscribe plus new socket-error generation, malformed/crossed/wrong-market and close-during-initialization tests |
| High-frequency bursts / coalescing | 1000 simultaneous frames and sustained 1 ms stream |
| Duplicate execution / partial fill / finality / recovery | Existing execution lifecycle and recovery suites, authoritative order reconciliation and production execution tests |
| ENTRY / TP safety and churn | Existing orchestrator and entry stability replay suites; execution concurrency unchanged |
| Independent Max Loss / dynamic sizing / three DCA additions / LONG/SHORT | Existing entry-size, DCA, production execution and orchestrator suites |
| TP coverage / reduce-only | Existing orchestrator, canonical recovery and execution suites |
| Repeated full snapshot downloads | New 100-reader assertion plus existing streaming-without-REST test |

## TEST_RESULTS

All commands use `npm.cmd` because PowerShell's execution policy blocks the
`npm.ps1` shim. No execution policy was changed.

- Focused final run: **9 files / 176 tests passed**, including **31 client tests**,
  lifecycle/finality/partial-fill recovery, authoritative reconciliation, HTTP
  recovery, entry sizing, DCA, production execution and collector liveness.
- Two orchestrator timeout cases rerun alone: **2 passed**, 536 skipped.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- Changed TypeScript files: targeted ESLint and Prettier checks **PASS**;
  selected tracked-file `git diff --check` **PASS**.
- `npm run format:check`: **FAIL**, unmodified existing files:
  `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts`,
  `tests/fixtures/entry_cost_19884_v1.json`,
  `tests/fixtures/entry_simplification_36080_v1.json`.
- `npm run lint`: **FAIL**, only existing `.tmp_conflict_readonly.cjs` and
  `.tmp_exact_evidence.ts` are outside ESLint's TypeScript project service.
- First full `npm test`: 1344 passed / 4 failed. One 1000-cycle orchestrator
  timeout passed on isolated retry. Three unchanged browser cases failed:
  Chromium PNG export timed out; amber status and desktop Settings spacing
  checks encountered Chrome GPU process startup/access errors. These are outside
  the market-data changes. No timeout thresholds, Chrome flags or lint rules were
  weakened to conceal failures.
- Final `npm test` rerun: **1346 passed / 3 failed**, 46 test files passed and
  2 failed. All 538 orchestrator cases passed on this run. Remaining failures
  are the same three browser cases above. The chained HTTP recovery/reconciliation
  command does not run if production-core fails; those suites were therefore run
  explicitly in the 176-test focused command. All five required verification
  commands were run; none was omitted.

## BUILD_FINGERPRINT

Production fingerprint from the project's own
`calculateDecibelSourceBuildFingerprintV1()` after `npm run build`:
`f87b75a240952afe`, 138 covered files, source timestamp `1794233913431`.
This covers existing workspace edits as well as this task; it is not a deployment
receipt. HEAD is
`471e9ef686ba26f8b48a13c26f20841b9139ef40`; branch is
`chore/production-cleanup-v1`. HEAD alone does not identify the dirty working tree.

## UNVERIFIED_ASSUMPTIONS

The venue's depth arrays are consumed as complete states, matching the existing
SDK interface and production behavior; no live venue completeness test was run.
SDK 0.7.0 cannot prove sequence continuity or detect silent disconnect immediately
because its close path has no public lifecycle callback. Existing stale/idle checks
remain the fallback for a close without an error event. Timestamp ordering cannot
prove transport continuity; same-timestamp duplicates can refresh receipt liveness
under existing policy. Source clock-skew and final risk checks remain mandatory.
The old steady-state window and HTTP reconciliation are intentionally retained.
Mobile byte savings, end-to-end latency improvement and live churn are unverified.
