# HTTP Rate-Limit Recovery Fix

## Root cause and evidence limits

The proven code defect is a self-renewing local HTTP cooldown. `readSnapshot()` checks the shared gate before dispatching any request. The gate throws `PRODUCTION_DECIBEL_HTTP_RATE_LIMITED`. `evaluateOnce()` recognized that local error and unconditionally called `enterDecibelHTTPReadBackoffV1(now + configured duration)` again. Control-loop calls more frequent than the configured backoff prevented expiry indefinitely. Worker counters consequently stopped moving; the last worker failure/stage remained the old ACCOUNT_OVERVIEW timeout. Refresh logs displayed those unchanged diagnostics beside local gate failures.

The supplied PID 38884 evidence establishes a worker timeout and an application cooldown, not a server response with status 429. The timeout string does not match the 429 classifier. An earlier server 429 may have initiated the cooldown, but no corresponding raw response was supplied or independently established. Do not treat the rate-limit label as proof of a new server 429.

A second proven scheduler defect could discard a due one-shot retry when the previous operation with the same key was still in flight. The job was deleted before the in-flight check. It now stays queued and is armed when its owner settles.

## Implementation

| File | Functions and changes |
| --- | --- |
| `src/decibel_http_read_backoff_v1.ts` | `enterDecibelHTTPReadBackoffForErrorV1`: only a remote 429 can extend cooldown; accepts Retry-After seconds or HTTP dates through error causes. `isDecibelHTTP429V1`: bounded 429 matching. |
| `src/decibel_production_live_orchestrator_v1.ts` | `evaluateOnce`, `readSnapshot`: preserve deadline on local gate rejection. Shared 429 classifier. |
| `src/decibel_production_live_state_source_v1.ts` | `readAuthenticatedSnapshot`, `readAuthenticatedAccountState`: preserve remote Retry-After when establishing backoff. |
| `src/decibel_authenticated_http_reader_v1.ts` | `get`: retain status and Retry-After. |
| `src/decibel_authenticated_http_worker_v1.mjs` | `get`, `handleMessage`: send structured HTTP status and Retry-After over worker transport. |
| `src/decibel_authenticated_http_worker_client_v1.ts` | `getWorker`: reconstruct error metadata; obsolete worker exit/error cannot reject a replacement worker's pending requests. |
| `src/decibel_runtime_supervisor_v1.ts` | `runScheduledJobs`, `armScheduler`: retain in-flight retries and re-arm on settlement; cap timer duration against overflow. `setAuthenticatedSnapshot`: reject older observations. |
| `src/decibel_authenticated_refresh_retry_v1.ts` | `recordFailure`, `resetAfterSuccess`: deterministic exponential delay from 1 to 30 seconds; deduplicate repeated error logging until success or a changed error. |
| `src/run_decibel_production_web_v1.ts` | `refreshAuthenticatedComponents`: keyed supervisor scheduling, unchanged local cooldown deadline, bounded retry delay, deduplicated logs, captured owner revision, abort/publication guards. `publishAuthenticatedAccountState`: reject older observations. |

STOP from evidence failure does not stop the supervisor scheduler; only shutdown does. Existing refresh singleflight and abort checks prevent concurrent publication by expired requests. Recovery fetches account overview, positions, open orders and active-session fills before publication. Existing lifecycle recovery handles pending intents before strategic execution. No recovery action cancels/replaces ENTRY or TP orders. DCA, TP strategy, sizing, Max Loss, volume target and Settings are unchanged.

## Deterministic replay

Before: a remote 429 establishes deadline T; each local HOLD at t < T extends deadline to t + backoff. Reads stay frozen; stale transport error remains visible. A replacement one-shot job can also disappear while its predecessor is running.

After: repeated local HOLD cycles keep exactly deadline T and make no requests or mutations. At T the next authenticated read succeeds, advancing reads from 1 to 2 in the orchestrator regression replay, with zero order mutations. Worker timeout replay advances attempts to 2, successes to 1 and failures to 1, clearing lastFailure on recovery. Tests cover structured 429/Retry-After, timeout distinction, capped retries, duplicate-log suppression, queued retry retention, singleflight, stale publication and recovery while evidence blocks execution.

## Verification and deployment

Required commands were run using npm.cmd because PowerShell blocks npm.ps1. Typecheck and build pass. Repository format check fails on existing `.tmp_conflict_readonly.cjs`. Repository lint fails on existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`; changed code passes targeted lint. Full npm test production-core stage: 799 passed, 3 failed (two Chrome startup/GPU sandbox failures; one SDK liquidation test timeout); its chained second stage therefore did not run in that command. Focused recovery/reader/worker run: 17 passed. The affected orchestrator, recovery, reader, worker, authoritative reconciliation and margin-producer suites pass separately: 318 tests across six files. The SDK test passed in that focused run.

Implemented locally on the existing non-main branch. Not committed or deployed. The live process was not restarted; no mainnet orders or production journal mutations were performed by this task. Production recovery is not claimed until the new build is deployed and observed.
