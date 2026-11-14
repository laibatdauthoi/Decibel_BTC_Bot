# Economic Warmup and Restart Reuse — PID 1528

4 November 2026, Asia/Bangkok. Local source repair on
`chore/production-cleanup-v1`; no production restart or deployment.

WHY_WARMUP_STARTS_AT_3_30_AND_5_30=

PID 1528 started at epoch **1793807136862**. The latest pre-start canonical BBO
was at **1793790044526**, a gap of **17092336 ms = 4 h 44 min 52.336 s**.
The unchanged observation TTL is 3600000 ms. All **212815** pre-start canonical
observations were expired. None qualified for restoration at that launch.

The permanent public-data fixture
`tests/fixtures/decibel_pid1528_warmup_v1.json` reconstructs the supplied counts:

| Evaluation epoch | Since process start | Public rows available | Current FAST regime | GLOBAL |
| --- | --- | --- | --- | --- |
| 1793807316862 | 180 s | 60 | **3/30** | **5/30** |
| 1793807346862 | 210 s | 71 | **4/30** | **6/30** |
| 1793807646308 | 509.446 s | 172 | **14/30** | **15/30** |

The first new persisted observation was 1793807154664, **17.802 seconds after
process start**. At the first two evaluation points the current regime is FAST.
Thirty-second blocks, not raw message counts, determine qualification. The
observed progress is consistent with the existing estimator, not evidence that
each refresh acquires only one WebSocket message. Available account margin does
not replace missing statistical evidence.

PERSISTED_SAMPLE_REUSE_STATUS=

| Source inspected read-only | Reuse result at PID 1528 startup |
| --- | --- |
| Canonical `decibel_production_raw_ws_bbo_v1.jsonl` | 212815 earlier observations, all expired; file was retained and correctly parsed |
| `decibel_raw_ws_bbo_v1.jsonl` | 25 rows, latest 1789535460359; zero fresh |
| `live_adverse_ws_bbo_v1.jsonl` | 252 rows, latest 1789531482250; zero fresh |
| Configured execution journal `strategy_decision_snapshots` | Zero decisions in the preceding hour; latest earlier decision 1793789254530 |
| Previously published adverse evidence | Original observedAt 1793790022430; 65 effective samples, but expired before startup; count alone cannot make it reusable |

No fresh pre-start sample loss, truncation or malformed-row rejection was found
in this incident. A later full-file audit found zero malformed/invalid canonical
rows and 19 historically out-of-order rows. The store's existing sorted insertion
handles those rows; their order is not a reason to discard otherwise eligible
observations. All pre-start rows were still outside TTL.

Warm-restarter behavior is separately verified with genuine persisted PID 6628
public observations: restarts 1, 10 and 60 seconds after its qualified observation
reuse that evidence immediately. They retain the original observation clock.
Restart after TTL correctly remains blocked. These are isolated replay restarts;
no production process was restarted to collect measurements.

The installed SDK's depth reader exposes the current depth subscription; its
historical trade/candlestick data is not a historical bid/ask observation stream.
No inspected contract established an additional historical BBO source with the
required original clock, regime and provenance. Trade prices, candle extrema,
strategy quote requests or decision-publication times cannot safely substitute
for the existing statistical inputs. No such synthetic backfill was introduced.

SAMPLE_REJECTION_BREAKDOWN=

At 1793807316862:

- **Expired before startup:** 212815 earlier canonical rows.
- **Eligible public rows since startup:** 60, with no invalid or consecutive
  unchanged-price rows in this prefix.
- **GLOBAL:** 6 non-overlapping 30-second entry blocks; 5 have a qualifying future
  observation and 1 is not yet mature. The other 54 raw rows fall inside existing
  blocks; counting them as independent samples would weaken the methodology.
- **FAST:** 28 rows; 32 other-regime rows are excluded from this regime bucket
  but remain in GLOBAL. There are 4 entry blocks: 3 mature and 1 pending. The
  other 24 FAST rows fall inside existing blocks.

At 1793807346862, GLOBAL has 71 rows, 6 mature blocks, 1 pending block and 64
within-block observations. FAST has 39 rows, 4 mature blocks, 1 pending block and
34 within-block observations; the same 32 other-regime rows remain in GLOBAL.

Regime changes therefore explain the regime/GLOBAL difference. They do not reset
the persisted GLOBAL window. Future observations are never used before their
timestamp; the replay filters at each historical evaluation time.

MEASURED_SAMPLE_ACQUISITION_RATE=

The first captured PID 1528 interval contains 172 BBO observations over
**491.644 seconds** between first and last observations: about **0.350 BBO/s**
and **1.83 matured GLOBAL samples/minute**. A later read contained 255 observations
over **706.698 seconds**: about **0.361 BBO/s**, with GLOBAL **22/30**, approximately
**1.87 effective samples/minute**. These point-in-time reads have different end
times because the running process continued ingesting independently.

Over 150 adjacent intervals in the 172-row fixture are shorter than the 30000 ms
economic retry interval. This directly demonstrates that ingestion is not paced
by the economic refresh job. The 30-second retry schedules calculation/validation;
it is not the public-market subscription's sampling clock.

For the earlier PID 6628 launch, the first 900 process seconds contained 189
observations, about **0.213 BBO/s** between observed endpoints, and 25 matured
GLOBAL samples. Its first sufficient selected estimate is reconstructed at
**1793788639843**. These are two existing launch histories, not controlled
production restart experiments.

ACTUAL_VS_EXPECTED_WARMUP_DURATION=

- Policy minimum from the first qualifying observation: **30 x 30000 ms =
  900000 ms = 15 minutes**, provided observations arrive at the required boundaries.
  Regime-specific scarcity, event spacing and connection gaps can extend it.
- PID 6628 first qualifying selected estimate: **1054506 ms = 17 min 34.506 s**
  after process start, or **17 min 23.683 s** after its first persisted BBO.
- The recorded qualified economic document at 1793788671433 is approximately
  **31.590 s** later than that first reconstructed eligibility. This bounds a
  historical calculation/publication observation delay; it is not an exact
  timestamp for every HTTP request or every admission-gate transition.
- PID 1528 was still genuinely insufficient at the captured 22/30 point. A final
  read of the continuing persisted stream reconstructs its first sufficient
  selected estimate at **1793808082293**, **945431 ms = 15 min 45.431 s** after
  process start, or **15 min 27.629 s** after its first observation. The economic
  document subsequently records observedAt **1793808144475**, **32** samples and
  **GLOBAL_FALLBACK**. The difference between these observation clocks is
  **62.182 s**; it bounds an observed eligibility/publication gap, not the exact
  duration of a particular HTTP stage or proof of an order-admission event.
  This production progression occurred without deployment/restart by this task.
- Repeated short warm restarts in the production-path replay reuse the qualified
  persisted window without another 15-minute wait. Expired long-gap restarts
  cannot receive that treatment under the unchanged policy.

PROVEN_ROOT_CAUSE=

The reported 3/30 and 5/30 counts result from a **long ingestion gap exceeding
TTL**, followed by an early stage of the required non-overlapping sample
acquisition. No policy-preserving repair can turn that expired history into fresh
samples. The source continued progressing to higher counts during this audit.

Three avoidable implementation defects were corrected:

1. **Duplicate cold-start restoration:** web startup hydrated the raw/economic
   store and then cold-start validation hydrated it again through a newly created
   store. On this 22 MB, 212000+ row history, that needlessly repeated parsing and
   calculation. Cold-start validation now uses the existing shared incremental
   store, and the redundant earlier web hydration was removed. This is startup
   overhead, not the explanation for minutes of missing effective samples.
2. **Publication behind unrelated HTTP:** the refresh function awaited the
   fee/gas input audit before hydrating qualifying persisted BBO evidence. Valid
   local market evidence could wait for a slow/failed remote component refresh.
   It is now hydrated first, with the web's existing complete validator notified
   immediately. Stale fee/gas/FX or invalid provenance still prevents readiness.
   A second pass after the await includes genuinely new BBOs arriving during HTTP;
   both passes share the same incremental store.
3. **Stale bootstrap result after partial recovery:** the bootstrap catch branch
   reused readiness captured before the asynchronous refresh. It could report
   false unavailability after local restoration succeeded, or reuse an earlier
   ready result after evidence expired. It now revalidates the current complete
   document using original component clocks before returning readiness.

No new cache, alternate sample policy, artificial history, TTL extension or
separate collection service was added. No claim is made that the new code has
already shortened PID 1528's live warmup.

FILES_FIXED=

- `src/decibel_production_economic_refresh_v1.ts`:
  `resolveDecibelProductionEconomicColdStartV1` accepts the shared store;
  `refreshDecibelProductionEconomicEvidenceV1` restores/publishes qualifying local
  evidence before the HTTP await and retains a same-store post-await catchup;
  `bootstrapDecibelProductionEconomicEvidenceV1` revalidates after failure.
- `src/run_decibel_production_web_v1.ts`: remove duplicate initial hydration;
  pass the owned store into cold start; use `onLocalEvidence` to invoke the same
  complete economic publication validator already used by production.
- `tests/decibel_adverse_ws_collector_liveness_v1.test.ts`: exact PID 1528 sample
  reconstruction, independent ingestion, repeated short/expired restart reuse,
  no duplicate raw parsing, original timestamp preservation, pre-HTTP publication
  and bootstrap recovery despite isolated HTTP failure.
- `tests/fixtures/decibel_pid1528_warmup_v1.json`: 172 genuine public BBO rows,
  copied read-only with no account, credential or private-key fields.

BEFORE_AFTER_RESTART_REPLAY=

| Replay | Before defect / after result |
| --- | --- |
| Qualified canonical data, existing startup store | Cold start instantiated another parser; shared-store replay now parses zero historical BBO rows again |
| Restart at +1 s, +10 s and +60 s | Same still-fresh representative evidence is immediately reusable; original adverse observedAt remains unchanged |
| Restart after +3600001 ms | Expired evidence stays blocked; neither timestamp nor count is repaired artificially |
| Expired economic P95 but qualifying genuine raw observations | Existing estimator restores qualifying evidence with its real original observation timestamp |
| HTTP audit deliberately held pending | `LOCAL_VALIDATED` occurs before `HTTP_STARTED` completes; full existing schema/TTL/provenance validation remains necessary |
| Local restoration succeeds, remote audit fails | Bootstrap records refresh FAIL but correctly reports current fully validated economic evidence ready; initial LKG state remains separately reported |
| Actual PID 1528 early history | Preserves 3/30, 5/30 then 4/30, 6/30; remains blocked because the genuine deficit cannot be bypassed |

The same suite retains the actual active-session orchestrator warmup/recovery
replay and all LONG/SHORT TP, risk, maker-only, identity, unknown-submission and
restart controls. New tests use temporary files and fake remote readers. The
captured fixture is public market evidence, not a network-capable executor.

TEST_RESULTS=

| Command | Result |
| --- | --- |
| `npm run format:check` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `src/readonly_exit_architecture_tmp.ts` |
| `npm run lint` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`, outside the TypeScript project service |
| `npm run typecheck` | Passed |
| `npm test` | **999 passed across all 33 files**: 982 production-core plus 17 authoritative reconciliation/HTTP tests |
| `npm run build` | Passed |
| `npm run build:web-dashboard` | Passed |

All eight market-collector/warmup tests pass, including the actual PID 1528
reconstruction and production cold-start/refresh/bootstrap restart replay.
The complete suite retains active-orchestrator warmup and LONG/SHORT execution
replays with disposable journals and fake clients. Changed files pass formatting;
final lint output has only the two scratch-file errors above. `git diff --check`
passed with Windows line-ending notices. Chromium checks ran outside the process
sandbox; no trading write clients were enabled. Equivalent npm/npx `.cmd`
launchers were used because PowerShell blocks their `.ps1` wrappers.

DEPLOYMENT_STATUS=

Local source, tests, fixture, report and generated builds only. No live orders,
cancellations, closes, session changes, journal mutations, Settings writes or
production restarts. SQLite inspection used `readonly: true, fileMustExist: true`.
Production raw files and logs were read; replay writes were confined to disposable
test state. No current mainnet success is inferred from the fake-client tests.

The mandatory 30/30 requirement, 1-hour default TTL, horizons, regime selection,
GLOBAL fallback and all economics/risk thresholds are preserved. A genuinely cold
start after a long gap still requires genuine new data. Shortening that inherent
collection time would require a separately justified methodological policy change,
which this task explicitly forbids.
