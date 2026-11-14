# Production Data Lifecycle Repair — PID 6628

4 November 2026, Asia/Bangkok. Branch: `chore/production-cleanup-v1`.
The repeated attachment contains the same request and was handled as the same
task. The supplied workspace already contained earlier exit/reconciliation fixes;
they were preserved. This report distinguishes historical production observations,
new source changes and isolated verification. No deployment is claimed.

SOURCE_OF_TRUTH_TABLE=

The installed dependency is `@decibeltrade/sdk` **0.7.0**. Endpoint/topic names
below were inspected in that installed SDK and the project's actual HTTP adapter,
not inferred from a current online example. The official SDK describes separate
readers for venue market/account data and separate write operations; its current
public README can differ from the pinned installed version.
[Official Decibel TypeScript SDK](https://github.com/decibeltrade/sdk).

| DATA_FIELD | DECIBEL_ENDPOINT_OR_STREAM | VENUE_PROVIDED_OR_LOCALLY_DERIVED | ORIGINAL_SOURCE_TIMESTAMP | CURRENT_CACHE_OR_SNAPSHOT_OWNERS | ACTUAL_CONSUMERS | NECESSARY_FRESHNESS_REQUIREMENT |
| --- | --- | --- | --- | --- | --- | --- |
| BTC size, direction, entry basis | `/api/v1/account_positions` | Venue; normalize BTC market and signed quantity locally | Account request start/completion window; basis is from the returned position | Source reader -> supervisor authenticated publication; decision snapshots are projections | Inventory, TP PnL, risk, final admission, reconciliation | Original account window within existing 5000 ms default; fresh revalidation before mutation; do not rebuild inventory from intents |
| Equity, available/maintenance margin | `/api/v1/account_overviews` | Venue | Independently requested account read within bounded window | Source account observation -> supervisor authenticated publication; capacity projection reads the source observation | Capacity and entry admission, risk, telemetry | Existing account TTL; successful assembly does not reset observation age |
| Live owned orders and remaining size | `/api/v1/open_orders` | Venue; ownership labels derived from exact strategy/client identity | Account read window; endpoint does not supply an atomic position/order transaction clock | Source normalizer -> authenticated publication; journal retains execution ownership | Exit coverage, duplicate prevention, cancellation, final quantity checks | Fresh authenticated open-order read; no inference from request/ACK/absence |
| Historical order identity/status | `/api/v1/order_history`; SDK topic `order_updates:<subaccount>` | Venue | Venue event/transaction provenance where available plus independent history read window | Authenticated history publication; durable identity reconciliation in journal | Startup, cancel/replace, terminal/unknown resolution | Exact identity and non-regressing history; account/history windows validated; absence never proves terminal state |
| Fills, executions, actual fees and volume | `/api/v1/trade_history`; `user_trades:<subaccount>` | Venue executions; aggregation/deduplication and session accounting local | Execution `transaction_unix_ms` and transaction version; history observation window | Source fill ledger and durable fill provenance, projected into supervisor state | Accounting, actual fill truth, reconciliation, session targets | Complete required history and exact identities; historical executions retain their execution time |
| Selected leverage / isolation | `/api/v1/account_positions?include_deleted=true` | Venue | Independent authenticated leverage observation | Source `CapacitySettings.leverage`; execution/session projection | Entry capacity and risk | Existing short risk-input TTL and position identity; no inferred leverage increase |
| Maker/taker fee schedule | `/api/v1/user_fee_rates` | Venue | Fee response observation; retain component clock | Source risk-input cache; economic document contains a separately dated policy input | TP economics, entry economics and capacity | Existing short risk-input validity where required; economic component TTL remains unchanged; the two consumer horizons are not interchangeable |
| Market metadata, tick, lot, venue leverage | `/api/v1/markets` | Venue | Metadata fetch observation; structural metadata promise currently cached | Source metadata promise; structural snapshot | Price/quantity normalization, venue admission | Existing metadata/market identity rules; structural cache is not proof of fresh price or account state |
| Venue margin configuration, mark and open interest | Aptos ledger info plus Decibel `GlobalAccountStates`, `PerpMarketConfiguration`, `OpenInterestTracker`, `PriceDetails` resources pinned to one ledger version | Venue resources; executable capacity is local policy calculation | Rule request observation, pinned ledger version, original `last_oracle_update_us` converted to mark ms; raw mark clock retained | Source `CapacityVenueRules`; capacity projection | Entry margin-tier admission, risk diagnostics | Existing rule and mark TTLs; refreshing the request cannot make an old oracle update fresh |
| BTC BBO/depth | SDK `depth:<market>:<aggregation>` subscription | Venue | Venue `unix_ms` and local latest-valid-WS-observation clock are distinct | One MarketClient subscription -> supervisor market publication; Source depth history and raw store retain observations for calculations | Quote prices, final PostOnly check, depth capacity, local adverse estimator | Existing 5000 ms default market TTL and connection/subscription checks; venue clock is also validated |
| BTC market trades | `/api/v1/trades`; `trades:<market>` | Venue | Venue trade timestamps | SDK/MarketClient reads | Market analysis/research; synthetic production adverse estimator does not require own fills | Required consumer policy; never substitute own execution activity for public market evidence |
| APT/USD for gas conversion | Decibel `/api/v1/prices` where available; existing supported provenance alternatives retained | Venue price; USD gas conversion local | Price component observation retained | Economic document -> validated supervisor economic publication | Lifecycle cost and TP reserves | Existing economic TTL; no timestamp rebasing |
| Adverse-selection P95 | **No inspected venue field supplies this statistic** | Local estimate from genuine Decibel BBO observations | Newest qualifying observation; not job completion time | One shared incremental raw store -> economic document -> validated supervisor publication | Entry/TP economics under their existing policies | Existing rolling 3600000 ms default window; 30 effective 30-second samples; existing provenance and TTL |
| Candidate-side adverse buckets | Same public BBO observations, locally calculated hypothetical quote/markout samples | Local | Candidate evidence observation clock | Economic document candidate buckets -> decision projection | Candidate edge/cost evaluation | Existing minimum 30 samples and TTL for a qualifying bucket; missing buckets remain missing |
| Gas reserve, expected net benefit, allocation and executable order limit | Historical successful transaction receipts, observed FX, account/venue inputs and saved Settings | Local strategy/risk calculations over venue facts | Preserve each dependency's original clock | Economic producer / session capacity projection | Economic decisions and risk engine | Existing dependency checks, costs and risk thresholds; no new venue-field assumption |

The Source caches are acquisition/history inputs, the journal owns durable intent
and reconciliation identity, and the supervisor owns active publication. Telemetry,
execution projections and disk history are consumers rather than alternative
authorities for current venue position. Account/order/history HTTP calls remain
independently timed; a bounded overlapping read window is **not** an atomic
exchange snapshot. Final ownership, identity, quantity and freshness checks remain.

ACTUAL_ADVERSE_SELECTION_DATA_SOURCE=

Production path:

`Decibel WS depth -> validated BBO -> refreshDecibelProductionMarketDataV1`
`-> shared decibel_raw_ws_bbo_store_v1 -> rolling markouts -> evidence validation`
`-> synchronizeEconomicSnapshot -> active orchestrator / final admission`.

The selected estimator uses QUIET/NORMAL/FAST/ONE_SIDED/THIN regime observations,
with the existing representative GLOBAL fallback. It evaluates horizons of
1000, 5000, 15000 and 30000 ms. Entry observations for a horizon are spaced by at
least that horizon; a later observation must mature each entry. The 30000 ms
distribution determines representativeness: **30 effective samples**, not 30
WebSocket messages. The selected P95 combines BUY and SELL adverse markouts.
The theoretical minimum is 900 seconds; sparse changes/gaps extend it.

Invalid/future/expired rows, different-regime rows for a regime bucket and
consecutive unchanged prices are excluded under the existing estimator. A genuine
unchanged quote is not turned into an additional independent statistical sample.
Candidate buckets use BUY/SELL distances 5, 6, 7, 8, 9, 10 and 12 bps, a
hypothetical touch within 60000 ms and a 30000 ms future markout; each bucket
retains its existing 30-sample qualification. These are locally modeled samples,
not assertions that the venue filled a strategy order.

The repair additionally preserves the original venue book clock in raw evidence
when supplied, alongside the existing local WS observation clock. Neither is
replaced with the economic job's completion time.

PROVEN_ROOT_CAUSE_PID6628=

The persisted observations and logs establish the following, without a current
venue-state inference:

| Evidence epoch ms | Reconstructed evidence | Meaning |
| --- | --- | --- |
| 1793787594647 | No fresh raw BBO rows yet | Cold-start store cannot authorize adverse evidence |
| 1793787596160 | First qualifying persisted BBO in the copied interval | Warmup starts from observed market data |
| 1793788211499 | 136 fresh public observations; NORMAL effective samples **17/30**; GLOBAL **17/30** | Existing policy correctly requires blocking; additional WebSocket messages are not mature 30-second blocks |
| 1793788671433 | NORMAL effective samples **31**; selected P95 **4.5331204294757015 bps** | Genuine sufficient data; economic document records the same selected P95/clock |

The sanitized permanent fixture
`tests/fixtures/decibel_pid6628_market_warmup_v1.json` contains 237 public BBO
observations from that interval. It contains no account, credential or private-key
fields. The regression reproduces the exact 17/30 deficit and later 31-sample
estimate. Differences between physical rows and a regime's raw sample count are
expected after regime/duplicate filtering.

`stdout.log.1` records WARMING progress 14/30, 15/30, 16/30 and 17/30. Later
`stdout.log` records economic refresh PASS and ACTIVE/RUNNING with blocker NONE.
Those historical observations show that this sample processor did progress and
that recovery occurred before these new changes were deployed. This task did not
cause or claim that production recovery.

Demonstrated defects were separate from the genuine sample deficit:

1. `refreshSupervisorFromAuthoritativeState` had its own readiness/clearing branch.
   It could overwrite sample progress with generic ADVERSE_SELECTION_STALE.
   Active-cycle readiness also used a weaker component-only decision than the
   supervisor's full schema/provenance validator.
2. The market refresh closure awaited authenticated bootstrap before persisting
   valid BBO data when no structural snapshot existed. An account failure could
   stop sample ingestion and mark the healthy market source failed.
3. Every hydration/readiness call could construct another raw-store cache and
   parse the historical JSONL again. The horizon estimator also restarted a
   full-window search for each entry. These were redundant processing paths;
   the audit does not claim measured event-loop starvation caused every PID 6628
   stale observation.
4. Snapshot selection compared decision assembly time before original account
   read clocks. A newer venue read could lose to a later local projection of
   older venue facts; a late disconnected market result could invalidate a newer
   healthy observation because diagnostics were processed before ordering.
5. The complete economic schema accepted representative=true with fewer than
   the policy's 30 samples. The producer already enforced 30; the consumer now
   enforces the same existing requirement instead of trusting that flag.
6. Cycle telemetry could replace an actual reduction/reconciliation outcome with
   generic economic warming. Warnings also classified all blockers as critical
   reconciliation messages.

The logs also show MARKET_DATA_STALE and CAPACITY_VENUE_MARGIN_RULES_STALE.
Those are independent source checks. Rule freshness includes the real oracle
update time, not only successful HTTP completion. The supplied diagnostic lines
do not establish a unique network/oracle cause for every occurrence; no TTL was
extended and no margin failure was relabelled as sufficient samples. Previous
startup cancellation-provenance conflicts were a separate demonstrated local
normalization defect, documented in the existing PID 38288 report and preserved
by this task.

REDUNDANT_LAYERS_REMOVED=

- Removed authenticated bootstrap from the market sampling path. The existing
  bounded authenticated scheduler remains its owner.
- Reused the existing raw-store instance for production hydration, readiness
  inspection and refresh instead of creating competing parsing caches.
- Removed the separate telemetry economic readiness/clear implementation.
  Telemetry and active-cycle warmup now invoke the same full validation and
  publication path, preserving every component, schema, provenance and TTL check.
- Parsed the economic document once per publication attempt; component checks
  and full schema validation now inspect that same document.
- Reused one component-state read to choose refresh components and prior clocks.
- Replaced repeated horizon scans with a forward cursor over the same sorted
  observations; eligibility, sample counts and P95 policy are unchanged.
- Removed generic economic override of the actual completed cycle outcome.

The economic singleflight guard, component in-flight guard, retry scheduler,
authenticated singleflight, journal identity history and final mutation checks
remain. No unsafe concurrency exception was introduced. Durable history and
bounded source buffers were not deleted merely because they resemble caches;
they serve restart reconciliation or statistical calculation.

ARCHITECTURE_BEFORE_AFTER=

Before: venue reads -> several differently dated projections; market ingestion
could wait on account bootstrap; raw evidence was reparsed through multiple
instances; component-only readiness and full validation could disagree;
telemetry could overwrite precise progress or actual action results.

After: Source readers preserve venue facts and clocks -> supervisor-owned
authenticated and market publications -> one validated economic publication
derived from the shared raw store -> action-specific planning/final admission.
The existing market closure is replaced by the exported production publisher
used directly in isolated tests; no new state-manager class/module was added.

Current venue facts outrank local assembly clocks. An older independently timed
account/history observation cannot overwrite a newer one; owner revision remains
required. Authenticated supervisor freshness now starts from original account
request time, rather than snapshot completion/publication. Market failure,
account failure, insufficient samples and genuine order conflict stay distinct.

EXACT_FILES_AND_FUNCTIONS_CHANGED=

| File | Functions / change |
| --- | --- |
| `src/run_decibel_production_web_v1.ts` | `refreshDecibelProductionMarketDataV1` replaces the market closure's acquisition/publication work; startup no longer couples market sampling to account bootstrap. `synchronizeEconomicSnapshot` performs single-document full validation. `refreshSupervisorFromAuthoritativeState` and `isEconomicWarming` use that owner. Authenticated publication preserves original account clocks. Cycle telemetry reports the actual result. |
| `src/decibel_production_economic_refresh_v1.ts` | `hydrateDecibelProductionEconomicEvidenceV1`, `inspectDecibelAdverseEvidenceReadinessV1`, `refreshDecibelProductionEconomicEvidenceV1` accept the existing shared raw store. `readDecibelProductionEconomicComponentStatesV1` can inspect the already-parsed document. |
| `src/decibel_adverse_selection_evidence_v1.ts` | Raw observation/store preserve optional venue clock, reject older appends and non-finite prices. `calculateBlockAwareMarkouts` uses a forward cursor with identical horizon/sample rules. |
| `src/decibel_production_live_state_source_v1.ts` | `readPublicMarketState` retains venue `unix_ms`. `validateDecibelProductionEconomicEvidenceV1` can validate the same parsed publication document. Complete schema enforces the existing 30-sample minimum. |
| `src/decibel_runtime_snapshot_owner_v1.ts` | `selectNewestDecibelRuntimeSnapshotV1` orders authenticated observations before local decision assembly; prevents account/history clock regressions and retains owner-revision checks. |
| `src/decibel_runtime_supervisor_v1.ts` | `setMarketDataSnapshot` rejects older observations before interpreting their failed diagnostics. |
| `src/decibel_production_live_orchestrator_v1.ts` | `setEconomicWarming` retains a precise reason in the existing warmup state; default callers remain compatible. Actual warmup gate reports that reason; canonical reduction/unwind exceptions remain the existing ones. Public market interface carries optional original venue clock. |
| `web_dashboard/src/presentation.ts` | `classifyOperatorEvidenceV1` supplies the five requested classifications, source and impact in the existing Warning feed. Raw blocker codes are preserved for Start/recovery controls; an unknown ACK is not fabricated into a proven identity conflict. |
| Tests / fixture | Actual public-observation reconstruction, production market/economic producer replay, full active-orchestrator warmup/recovery replay, older-clock/late-failure negatives, shared-store parsing regression, insufficient-count false-ready negative and six Warning classifications. |

RECOVERY_BEFORE_AFTER_REPLAY=

| Sequence | Before defect / after verified behavior |
| --- | --- |
| PID 6628 recorded samples | 17/30 is genuinely insufficient; after repair the exact count is retained as the blocker. The copied venue observations later calculate 31 samples and the recorded P95. |
| Active flat session, expired adverse evidence, continuous genuine fake market events | Production producer plus actual orchestrator stays non-mutating below 30, preserves the active unpaused session, then acknowledges an eligible order when the 30th block matures. Each side is submitted once; no repeated Start is used. |
| Account evidence unavailable during market acquisition | Production market publisher continues storing valid BBO events while account remains unavailable; execution cannot become falsely ready. Confirmed prior identity remains retained. |
| WS disconnect/reconnect | Market becomes BLOCKED, no synthetic sample is added; a genuinely new valid observation recovers the same publication path. |
| Same raw data, later hydration | Published adverse timestamp remains the newest observation; job time cannot renew it. Reusing the store parses no old BBO rows again. |
| Forged representative flag with 17 samples | Full schema rejects it; raw component numeric readiness cannot authorize trading. |
| Newer account facts with an earlier assembly clock | Original authenticated read windows win. Older account/history and prior-owner candidates remain rejected. |
| Older disconnected market completion after healthy data | Current healthy evidence and generation are preserved; older failure cannot clear it. |
| Authenticated HTTP timeout / retry | Existing real scheduler/singleflight tests retain identity, expire stale observations, bound retry frequency, reject late publication and recover on genuinely fresh data. |
| Stale venue rules | Existing source tests refresh rules independently of fresh fees/leverage. Entry remains blocked when genuine rule/mark evidence is stale. |
| Startup, restart, unknown submission | Existing actual lifecycle/journal/executor and authoritative reconciliation tests preserve exact identities, terminal provenance, no blind retries and genuine conflict blocking. |

ENTRY_VS_REDUCTION_SAFETY=

ENTRY/DCA still require complete valid economic evidence, current entry capacity,
maker-only admission, session/risk ownership and authenticated account/market
facts. Ordinary TP repair and repricing retain their own basis/fees/reserve and
profit authorization. Canonical defensive reduction uses existing risk authority
and independent reduction capacity; a generic entry warmup flag does not override
its completed outcome. This task adds no permission to use missing TP-specific
cost evidence, reduce at a loss without canonical authorization or retry unknown
submission. Max Loss and session unwind remain unchanged.

LONG_SHORT_REGRESSIONS=

The full suite retains LONG/SHORT PID 18876 and PID 24500 replays, DCA quantity
repair, profitable TP with exhausted entry volume/headroom, sub-entry-floor venue
quantities, partial fills, defensive dispatch, stale entry rules, PostOnlyViolation,
market movement at submission, cancellation/restart and unknown outcomes. The
762-state lot-aligned coverage sweep remains. All execution is against isolated
fake clients and disposable journals. The public market fixture supplies market
observations only and cannot submit an order.

REMAINING_RISKS=

- A genuine 17/30 deficit is not repairable by refreshing an economic timestamp.
  Quiet/sparse/disconnected streams can still require a policy-valid warmup.
- The audit proves neither that every historical HTTP endpoint failure was local
  nor that every margin-rule expiry was a network defect. Independent source
  outages and stale oracle updates remain necessary blockers.
- Independent HTTP endpoints do not offer an atomic cross-endpoint snapshot.
  Original windows, consistency checks and final authenticated validation remain
  essential; freshness is not a guarantee against an in-flight venue change.
- Structural market metadata remains cached by the existing source. No TTL was
  invented or relaxed for it; changes to venue metadata need the existing source
  validation path. Exhaustive identity/fill reads were retained where their
  completeness is required for safe recovery.
- Canonical local publication and active runtime projections still exist because
  durable restart evidence and current decisions serve different purposes. This
  repair does not claim all historical state has been eliminated.
- Existing workspace scratch files still prevent clean repository-wide formatting
  and lint checks. They were not deleted, ignored or used to disable rules.
- No live process loading/acceptance test was authorized. Passing fake-venue
  replays is not a mainnet-success claim.

TEST_RESULTS=

| Command | Final result |
| --- | --- |
| `npm run format:check` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `src/readonly_exit_architecture_tmp.ts` |
| `npm run lint` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`, outside the configured TypeScript project service |
| `npm run typecheck` | Passed |
| `npm test` | **997 passed across all 33 files**: 980 production-core tests plus 17 authoritative-reconciliation/HTTP tests |
| `npm run build` | Passed |
| `npm run build:web-dashboard` | Passed |

The 997 include 378 actual orchestrator tests, 86 presentation tests and six
market-collector tests, including the exact persisted-observation reconstruction.
Changed source/test/report/fixture files pass Prettier. Final ESLint output has
only the two scratch-file errors above. `git diff --check` passed, with Windows
line-ending notices. PowerShell's restricted `.ps1` wrappers were avoided using
equivalent `npm.cmd`/`npx.cmd` launchers without changing execution policy.

Chromium presentation checks require execution outside the process/filesystem
sandbox; the complete final test suite ran there with fake venues and disposable
state. An intermediate run caught the warning-code/Start-gate interaction; it
was corrected by retaining raw control codes and adding classification metadata.
No test assertion, economic threshold, sample minimum, timeout policy or lint
rule was disabled to obtain the final passing suite.

DEPLOYMENT_STATUS=

Local source/tests/report and generated build artifacts only. No production
restart, session start/end, order submission/cancellation/close, Settings write or
production journal mutation was performed. Existing Settings, sample thresholds,
TTLs, maker-only policy, leverage, DCA/TP economics, sizing, allocation, Max Loss
and ownership were preserved. Read-only local production logs and public market
observations were inspected. No live write client was used for verification.

An automatic review rejected the initial combined refactor at the web-runtime
step. The retained implementation preserves both existing refresh guards and
the full validator; it uses a smaller publication/readiness consolidation instead.
No safety check was disabled to obtain approval or passing tests.
