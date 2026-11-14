# PID 1528 Capital Fix, Deployment Gate And Downside Policy

5 November 2026, Asia/Bangkok. No deployment, process start/stop, session mutation, Settings mutation, live order or production journal write was performed. Read-only observations below expire; repeat them immediately before an approved deployment. This supplements `decibel_capital_tp_defensive_pid1528_v1.md` rather than treating the earlier venue observation as current.

CAPITAL_FIX_VERIFICATION=

The exact historical reconciliation remains:

`position margin = .0007 * 80078.85 / 40 = 1.401379875`.

`strategy allocation = 5 * .5 = 2.5`.

`remaining = max(0, min(venue free, 2.5 - 1.401379875)) = 1.098620125`.

The fixture explicitly uses $4.20 as representative venue-free margin in the reported $4.18–4.22 range, not an invented exact same-frame account observation. The result is unchanged throughout that range. Previously, the reduce-only .0007 TP at 80314.4 added **1.405502** of fictitious opening margin, producing **2.806881875** used, a full-capital residual **2.193118125** that exactly matches the journal, and zero remaining strategy allocation.

The shared `isDecibelPositionReductionV1` exemption requires an explicit reduce-only flag, correct direction and positive finite quantity bounded by the authenticated position. Missing flags, false flags, wrong direction and oversize remain reserved. Opening ENTRY/DCA reservations and unresolved opening PLACE intents still consume capital; the existing runtime identity dedup removes an inflight PLACE already represented by its live order. A .00013 opening order at 80000 reserves $.26. A .0013 position at the incident midpoint requires $2.602562625 margin and still exhausts $2.50 allocation even if venue free margin is positive.

Consumer audit:

| Consumer | Verified behavior |
| --- | --- |
| `deriveDecibelSessionTradingLimitsV1` | Canonical position/opening margin, opening pending exposure and strategy remaining; includes inflight and validates their quantities/prices |
| Web active-session projection | Carries reduce-only metadata from durable intent, deduplicates live identity and publishes canonical remaining |
| Start capacity preview | Uses the same calculator against authoritative open orders; returns null on unavailable/invalid evidence |
| `calculateDecibelRiskCapacityV1` | Worst-case endpoints include opening reservations; do not net opposite opening orders; bounded reduce-only orders cannot manufacture a reversal |
| `produceDecibelPostFillMarginV1` | Same endpoint classification; still reserves exit fees and mark-to-execution costs |
| `evaluateTradingDecision` | Uses canonical pending-opening exposure when present and the same classification in its fallback; stale account evidence nulls financial telemetry |
| Quote sizing / final maker admission | Opening orders remain bounded by derived position/headroom, venue/margin, volume and economic gates. Reductions use authoritative remaining quantity and independent venue reduction constraints |
| TP coverage / lifecycle | Exit coverage remains separate from opening margin; aggregate integer-lot quantity, exact lineage and unknown-outcome reconciliation remain mandatory |

`limits.availableMarginUsd` is the existing full-capital residual, not strategy remaining or authenticated venue free. The distinct fields are retained deliberately. The capital fix does not override the inventory-skewed quote budget: the historical healthy frame leaves $8.007885 on the opening side, below the $10 minimum, despite $16.01577 risk headroom. No DCA is forced.

CURRENT_RUNNING_REVISION=

**No current matching production web process was found.** An elevated read-only `Win32_Process` query for PID 1528 and Node processes whose command contains `decibel_production_web` returned no rows. This scope does not prove no unrelated trading application exists.

PID 1528's recorded startup build ID was **fb051338df236691**, Node **v22.23.2**, NODE_START epoch **1793807145480**. The launcher began at 1793807136862. Forensics record `GRACEFUL_SHUTDOWN_COMPLETE` at **1793826724622** and child exit SIGINT at **1793826724656**, with autoRestart false. This task did not stop it. Its stale `last_runtime_state.json` still contains nodePid 1528; that file is not process-presence evidence.

FIXED_SOURCE_REVISION=

Current source fingerprint: **3db6fe7595096c2f**, 115 covered source/configuration files, source timestamp **1793827408506**. The production fingerprint hashes file paths and contents, not a Git commit alone. The two added replay tests do not change that production-source fingerprint. Git HEAD is **471e9ef686ba26f8b48a13c26f20841b9139ef40**, `feat: establish lean decibel btc market maker production bot`; it does not identify the complete fixed working tree.

The actual launcher spawns the pinned Node executable with `--import tsx src/run_decibel_production_web_v1.ts`. Backend code runs from TypeScript source, not `dist/`. Modules stay loaded in that process; building or editing disk does not hot-update them. The dashboard uses its generated Vite assets. The launcher records the child's identity and the backend records its loaded source build ID; `restartRequired` compares the loaded fingerprint to disk. Do not label a disk hash as a running hash.

UNCOMMITTED_CHANGE_AUDIT=

The inspected branch is **chore/production-cleanup-v1**, not main. There were **186 modified/untracked status entries** before the new report and **187 afterward**; many required production modules and tests are untracked, alongside unrelated scratch and local state. No commit, reset, clean, stash, blanket stage or deletion was performed. A `git archive HEAD` release would omit the correction and required untracked modules; `git add .` risks including trading state and scratch. Neither is an acceptable deployment method.

The current source fingerprint includes source-tree scratch in its coverage, even if TypeScript's production dependency graph does not execute it. Repository-wide formatting and lint remain red on the known scratch files. No clean, focused reviewed release revision has been established. This is an explicit release blocker, not proof that the capital calculation is incorrect. Review the complete production dependency closure, dashboard, lockfile/configuration and prior fixes into a focused release candidate, exclude local state and scratch, then rebuild/retest that exact candidate and record its new build ID. Do not silently remove necessary earlier fixes while isolating this repair.

CURRENT_READ_ONLY_VENUE_STATE=

New authenticated GET window **1793828359623–1793828360534**:

| Field | Result |
| --- | --- |
| BTC positions / open orders | Empty / empty |
| Other-market position / order counts | 0 / 0 |
| Equity, available margin, total margin | $5.621517 each |
| Maintenance margin, deficit, unrealized PnL | 0 each |
| Selected leverage | 40 |
| Maker / taker fee schedule | approximately 1.5 / 4.5 bps |

Independent endpoints are not atomic. A subsequent read-only local check found zero unresolved intents, zero inflight mutations and zero ACTIVE identity conflicts. SQLite `quick_check` returned `ok` for journal and session databases. No session is STARTING/RUNNING/STOPPING. Latest session `session-1793807276381-d5de8161-068d-4200-aefe-1d35e45adc81` is ENDED, OPERATOR_END, ended at **1793826312333**. Its historical owner_pid remains 1528/OWNED; an ended row's ownership record is not an active lease or permission to rewrite it.

The canonical launcher environment validates as **production, CANARY, executor enabled, dryRun=false, TRADING_MODE=mainnet, LIVE_TRADING_ENABLED=true**. The legacy `config/production_state/decibel_execution_mode_v1.json` says dry-run but is ignored by the current `loadDecibelPersistedExecutionModeV1`, which reads/validates the environment. No configuration was changed. Starting this launcher is therefore a real-money capable action, even though a fresh session is not authorized here.

DEPLOYMENT_GO_NO_GO=

**NO-GO for deployment now.** Account/recovery evidence was clear at the audit time and the capital correction is locally verified, but there is no reviewed clean release revision, repository-wide lint/format are not clean, and no user deployment/start approval has been given. A finite position-risk policy is also not approved or implemented. Passing tests does not remove those conditions or establish a maximum realized loss.

Required operator actions: approve the exact reviewed release manifest/revision after excluding scratch/local state; resolve or explicitly document scratch checks outside that release; repeat authoritative venue/journal/session checks; approve starting that exact mainnet-capable runtime; separately choose whether to retain current session-only loss semantics or approve the finite-risk proposal below. Do not start a trading session while these decisions or reconciliation are unresolved.

EXACT_DEPLOYMENT_COMMANDS=

These are an ordered **future operator procedure**, not commands executed by this task. No stop/start/deployment command below is authorized by this report itself. Keep the same workspace/state paths unless a separately reviewed migration explicitly rewires absolute paths.

1. Identify process and release. In PowerShell, with read access to Windows process details:

```powershell
Set-Location -LiteralPath 'D:\study\Decibel_BTC_Bot'
$DeployRoot = (Get-Location).Path
$DeployNode = Join-Path $env:LOCALAPPDATA 'DecibelTools\node-v22.23.2-win-x64\node.exe'
& $DeployNode --version
Get-CimInstance Win32_Process |
  Where-Object { $_.ProcessId -eq 1528 -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'decibel_production_web') } |
  Select-Object ProcessId, ParentProcessId, CreationDate, ExecutablePath
git branch --show-current
git rev-parse HEAD
git status --short
git diff --check
```

Require v22.23.2. Review the exact source/dependency manifest, not merely the last commit. No blanket reset/clean/stage. If an active runtime or session now exists, stop this procedure and obtain an appropriate separately approved graceful lifecycle plan. Do not force-kill an inventory owner or issue session/end merely to deploy.

2. Repeat read-only checks in this audited workspace. Existing helper files in `data/` are ignored audit utilities, **not a release artifact or trading entry point**; preserve/review them separately if using these commands after release cleanup:

```powershell
& $DeployNode --import tsx data/audit_deployment_state_v1.ts
& $DeployNode --import tsx src/run_decibel_read_only_journal_check_v1.ts
& $DeployNode --import tsx data/audit_capital_tp1528.ts
```

The deployment helper reads source hash, SQLite read-only state and canonical environment; the venue helper only calls SDK GET readers. Never substitute a normal journal constructor for read-only inspection: it can migrate/recover state. Any nonzero position, live order, unknown submission, active conflict, incomplete history or active session is a new condition requiring reviewed handling; do not infer terminal status from an absent open order. Unrelated-market exposure must be retained and must not be cancelled or closed by this BTC deployment.

3. Preserve state **after confirming no runtime/writer and no active session**. Use SQLite's consistent backup API, not a bare `.sqlite` copy while WAL writes may exist. The following creates snapshots without checkpointing or mutating the source database:

```powershell
$DeployBackup = Join-Path $DeployRoot ('data\deployment_backups\' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $DeployBackup -ErrorAction Stop | Out-Null
$DeployBackupCode = @'
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import {join} from 'node:path';
dotenv.config({quiet:true});
const pairs = [
  [process.env.DECIBEL_EXECUTION_JOURNAL_PATH, 'execution.sqlite'],
  [process.env.DECIBEL_PRODUCTION_SESSION_STORE_PATH ?? 'config/production_state/decibel_production_sessions_v1.sqlite', 'sessions.sqlite'],
];
for (const [source,name] of pairs) {
  if (!source) throw Error('BACKUP_SOURCE_REQUIRED');
  const db = new Database(source,{readonly:true,fileMustExist:true});
  try { await db.backup(join(process.argv[1],name)); } finally { db.close(); }
}
'@
& $DeployNode --input-type=module -e $DeployBackupCode $DeployBackup
if ($LASTEXITCODE -ne 0) { throw 'DEPLOYMENT_BACKUP_FAILED' }
Copy-Item -LiteralPath 'config\production_state' -Destination (Join-Path $DeployBackup 'production_state') -Recurse -ErrorAction Stop
```

The logical SQLite snapshots are the database backup authority; the directory copy preserves JSON, audit files and checkpoint companions. Confirm backups can be opened read-only and `quick_check` is ok before continuing. Preserve the original `.env`, journals, reconciliation provenance, ownership, restart safety, economic evidence and raw market history **in place**, under the same access controls. Do not print or commit private configuration/backup contents. Do not delete WAL/SHM or run recovery/migration utilities as a cleanup step. No cross-database atomic backup is claimed if another writer is allowed during this step.

4. On the reviewed release candidate, verify with the pinned runtime and preserve exit codes:

```powershell
$env:PATH = "$(Split-Path $DeployNode);$env:PATH"
$DeployChecks = @('format:check','lint','typecheck','build','build:web-dashboard')
foreach ($DeployCheck in $DeployChecks) {
  npm.cmd run $DeployCheck
  if ($LASTEXITCODE -ne 0) { throw "DEPLOYMENT_CHECK_FAILED:$DeployCheck" }
}
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'DEPLOYMENT_TESTS_FAILED' }
& $DeployNode --import tsx data/audit_deployment_state_v1.ts
```

The current dirty workspace cannot pass the format/lint step. Resolve the release blocker first; do not add `--force`, disable rules or treat this script as a waiver. Backend compilation validates the dependency graph but does not activate source. Dashboard compilation supplies the static assets. Record the resulting build fingerprint as the approved expected build ID; source cleanup legitimately changes it, so do not blindly reuse 3db6fe7595096c2f for a different release.

5. **Only after explicit approval**, and after repeating step 2, launch the exact reviewed source with the repository's actual launcher. This is a start action; it is intentionally not performed now:

```powershell
$DeployLauncher = Start-Process -FilePath $DeployNode `
  -ArgumentList @('--import','tsx','src/run_decibel_production_web_launcher_v1.ts') `
  -WorkingDirectory $DeployRoot -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $DeployBackup 'launcher.stdout.log') `
  -RedirectStandardError (Join-Path $DeployBackup 'launcher.stderr.log')
$DeployLauncher.Id
```

An approved foreground alternative is `& $DeployNode --import tsx src/run_decibel_production_web_launcher_v1.ts`; no `--auto-resume` flag is added. Starting the runtime may execute its authorized startup reconciliation, so a flat snapshot from minutes earlier is insufficient permission. Existing startup logic must remain enabled. Do not use the standalone live trading runner as a substitute for this web launcher/session owner.

6. Verify from read-only endpoints/logs before any separately approved trading-session start:

```powershell
Get-Content -LiteralPath (Join-Path $DeployBackup 'launcher.stdout.log') -Tail 30
Get-Content -LiteralPath (Join-Path $DeployBackup 'launcher.stderr.log') -Tail 20
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4173/api/session'
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4173/api/telemetry'
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4173/api/runtime-snapshot'
Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4173/api/restart-safety'
& $DeployNode --import tsx data/audit_capital_tp1528.ts
& $DeployNode --import tsx src/run_decibel_read_only_journal_check_v1.ts
```

Port 4173 is the source default; use the actual configured loopback port printed in `DECIBEL_PRODUCTION_WEB=READY`, not an assumed endpoint. Capture a new Windows PID/creation identity, `DECIBEL_PRODUCTION_CHILD_NODE_VERSION=v22.23.2`, expected **loaded** `BUILD_ID`, `RESTART_REQUIRED=NO`, completed startup recovery, fresh original account/book timestamps and exact venue/journal order identities. Require no unknown submissions, no conflicts, no stale authorization, correct inventory/TP quantity and no accidental session activation. ACK alone does not demonstrate coverage until authenticated open-order evidence confirms it. An ended prior session must not be resurrected by editing SQL.

7. Rollback: do not start a new session on hash mismatch, failed recovery, unexpected orders/positions, stale data, over-coverage, unknown outcomes or non-BTC mutations. If orders have been sent, first reconcile the latest venue state and obtain a separately approved graceful stop/recovery plan; do not kill an owner or start two owners. Roll back compatible **code only** after schema compatibility review. Never restore an old journal/session backup over newer executions: it erases identity and permits duplicates. Preserve unknown submissions and all subsequent fills. Do not rollback to the original capital bug merely because it was the previous build; prepare a compatible corrected recovery version. This report does not authorize a forced close or any rollback mutation.

AGGREGATE_TP_POLICY=

TP remains aggregate average-cost, exact-quantity, fee/adverse/gas/safety-adjusted profitability. No per-fill ownership is introduced. A profitable far TP is retained over an unprofitable near replacement. Same-price coverage/quantity repair is separate from new-price suitability, with durable exact resting-price authorization and cancellation/restart reconciliation. Total exit quantity cannot exceed authenticated remaining inventory. TP placement/ACK never means the position closed. Full coverage is authoritative open quantity, not guaranteed fill or a stop-loss.

CURRENT_DOWNSIDE_RISK_POLICY=

Canonical Max Loss is the existing **$2 session** budget, using attributed average-cost realized PnL plus current unrealized PnL minus observed signed fees. Earlier session profit can offset the current position's loss. The session metric does not currently incorporate funding or gas in that function; unknown costs are not claimed as zero economic costs. Canonical explicit RISK_REDUCTION and session/emergency unwind are separate action authorities from TP profit. DCA exhaustion is an opening gate, not new loss authorization.

| Situation | Measurement / authorization | Decision and executable path | Blocks / indefinite HOLD |
| --- | --- | --- | --- |
| LONG falls below basis | Authenticated signed position/basis, book and session PnL; no new per-position trigger | Retain valid TP; only already-authorized DCA may enter | Below canonical triggers, HOLD may continue indefinitely |
| SHORT rises above basis | Same sources with reversed direction | Symmetric TP/risk path | Same limitation |
| Profitable TP far away | Exact-price aggregate net remains positive | Keep authenticated TP; do not cancel for losing candidate | Non-fill has no existing maximum holding time |
| DCA allocation exhausted | Canonical allocation/headroom and venue limits | Block opening orders; continue TP/reconciliation and authorized defensive exit | Exhaustion alone cannot authorize loss realization |
| TP unfilled for prolonged period | Open-order identity/remaining quantity and elapsed observations | Continue coverage/suitability; no new timeout stop | Indefinite non-fill allowed below risk authority |
| Unrealized loss below Max Loss | Full session PnL, not just current position PnL | HOLD unless independent canonical risk reduction applies | No guaranteed per-position cap |
| Restart lacks continuous history | Original account/book clocks, position epoch and 30-second continuity | Conditional holding assessment waits; canonical risk/unwind authority is not replaced by this history gate | Conditional branch may remain unavailable, but missing history alone cannot suppress independently authorized risk dispatch |
| Price crosses canonical threshold rapidly | Next valid authenticated/market/session observation | Canonical risk dispatch or existing session Max Loss unwind, safe TP cancellation/reconciliation first | Sampling, API lag, unknown state, venue admission, gaps and non-fill prevent a hard dollar-loss guarantee |
| Maker defensive order rejected / unfilled | Actual rejection/ACK/open order/fill, fresh inventory | Remain in management/reconciliation; revalidate before a new attempt; preserve ownership | Post-only rejection or no contra liquidity can delay indefinitely; no new taker fallback |
| API/venue outage | Failed/expired account/book evidence | Block unauthenticated mutations, reconcile on recovery; retain known resting coverage | Existing TP can fill or remain unfilled; no guaranteed close or bounded loss during outage |

Existing session unwind is already reduce-only IOC, not a newly invented market-order fallback. Normal canonical defensive maker reduction remains post-only. IOC can partially fill or reject and is not a guarantee either. TP profitability cannot authorize a loss; authorized risk reduction need not pass TP profitability. Fresh account/order quantity, ownership and venue constraints remain mandatory for both.

INDEFINITE_HOLD_SCENARIOS=

Yes: below the session/canonical risk trigger despite adverse movement; prolonged far TP non-fill; DCA exhausted without independent reduction authority; unavailable conditional holding continuity; maker-only non-fill/repeated post-only rejection; venue outage/unknown execution state. These differ: the first cases are policy permission to hold, the latter can prevent execution even after authorization. **No finite maximum realized loss is guaranteed by the current software, a resting TP, a maker order or an IOC request.** Leverage and gaps can make losses exceed a configured trigger before any fill.

DEFENSIVE_EXIT_EXECUTION_GAPS=

The existing code dispatches independently authorized risk reduction before the conditional history guard and independently of ENTRY economic/allocation rejection. Existing TP must be cancelled/reconciled before an overlapping exit; its profitable status cannot veto canonical risk authority. Unknown submission outcome locks the identity for reconciliation; absence from open orders alone is not terminal proof. Partial fills reduce the remaining quantity only after authenticated evidence, and the next action revalidates that residual.

Engineering gates remain: current authenticated safety evidence, exact ownership, canonical admission, venue minimum/tick/lot, notional constraints where actually applicable, post-only crossing rejection, rate limits and outcome ambiguity. These are not permission to mark a submitted exit complete. Existing tests exercise them with fake venue ACK/reconciliation, including zero entry allocation and stale unrelated ENTRY economics. No further separation defect was demonstrated in this follow-up; no new risk policy was implemented to make tests pass.

PROVEN_CODE_DEFECTS_FIXED=

The prior source correction is retained and reverified: reduce-only margin/pending-opening double debit, omitted inflight opening reservation, incorrect opening worst-case endpoints, duplicate strategy-remaining arithmetic and downstream pending telemetry. This follow-up adds a **LONG/SHORT production-orchestrator consumer replay**, not a second capital implementation. It sends canonical calculator output into the actual session snapshot, runs the orchestrator with a disposable journal/fake adapter, checks corrected telemetry, preserved ACK order identity, full confirmed .0007 coverage and zero submissions. Additional regression assertions reserve missing/false/wrong-direction/oversized reduction metadata conservatively. No newly demonstrated production source bug was left unimplemented; unapproved finite-risk behavior remains design only.

FINITE_RISK_POLICY_OPTIONS_REQUIRING_APPROVAL=

The smallest design separates **finite authorization** from **guaranteed finite execution loss**, which software cannot promise through a venue outage or market gap. There is no already-authorized per-position loss budget or time-underwater timeout in Settings. Do not infer one from $5 capital, $2 session Max Loss, DCA exhaustion or TP distance.

| Choice | Smallest approval needed | Trade-off / possible loss / compatibility |
| --- | --- | --- |
| Keep existing session-only policy | Explicit acceptance of current HOLD limitation; no economics change | Preserves current Settings, but does not solve indefinite per-position holding |
| Position loss trigger + maker-only reduction | User supplies a position loss budget, or explicitly approves reusing the existing Max Loss value as an additional position cap; define realized/fees/funding scope | Realizes losses intentionally when triggered; authorization is finite but maker non-fill means execution/loss remains unbounded. Session Max Loss still takes priority |
| Position trigger + approved marketable reduce-only limit/IOC escalation | Same loss decision plus explicit permission for the existing IOC mechanism to be used under the new authority, and user-defined price/slippage bounds/escalation conditions | Better closure probability, higher/taker fees and realized losses; gaps, partial fills and outage still prevent a hard loss bound. It changes current normal maker-only defensive policy |
| Adverse duration / DCA-exhaustion escalation | User-defined duration/adverse condition, reset semantics and whether it only blocks entries/alerts or authorizes reduction; separate execution choice above | Avoids an arbitrary indefinite wait once configured, but can crystallize temporary drawdowns. Exhaustion alone does not specify an economically acceptable loss |

Concrete proposed implementation contract, **disabled until parameters and behavior are approved**:

- Position epoch keyed by authenticated BTC direction/ownership and fill lineage; track a defined position-loss budget and time-underwater state separately from existing session PnL. Define whether partial realization and DCA retain the epoch; prevent budget/time reset through repeated DCA or process restarts.
- Measure loss from authenticated aggregate basis, remaining quantity, fresh executable bid/ask and approved actual/projected costs. Treat funding/gas/rebates and partial realized loss explicitly; unavailable inputs produce UNKNOWN, never a zero-loss authorization. Retain original venue timestamps and provenance.
- Evaluate existing session/emergency authority first, then the approved position authority. DCA exhaustion, prolonged TP non-fill and adverse duration are persisted escalation facts; they only trigger a reduction under the explicitly approved conditions. No new threshold or time value is supplied by this report.
- Persist the risk epoch, risk-policy revision, original evidence windows, elapsed observed-underwater intervals, latched reduction authorization/reason and outstanding execution identity. Restore from durable authenticated fills/orders and compatible prior state. Do not fabricate continuity across an outage/restart; unknown time cannot silently count as proven duration. A previously valid latched loss trigger must not reset just because process memory is new; execution still requires current quantity/ownership.
- Use the existing durable cancellation/submission/reconciliation owner. Latch risk authority while reconciling TP cancellation; a temporary favorable tick must not start cancel/replace churn unless approved revocation rules permit it. One outstanding exit identity; all open/pending exits count toward aggregate no-flip quantity.
- Maker-only mode stays OPEN/ACKNOWLEDGED until authenticated fills. PostOnlyViolation returns to bounded revalidation under existing pacing, not success or blind retry. Any IOC escalation must have explicitly approved conditions/price protection and the existing unknown-outcome lock; never assume an IOC fully filled.
- During venue/API outage, cease new exposure and unauthenticated mutations, preserve durable intent/known coverage, surface the existing failure state and reconcile on recovery. No software-only emergency mechanism can guarantee execution against an unavailable venue. Do not cancel a known valid TP merely because the local feed is unavailable.

Required user decision is therefore economic scope/budget, optional duration/exhaustion rule, and permitted execution/escalation. No option was activated, no Settings keys were added and no numerical threshold was invented.

Safety state ownership:

| Transition | Owner / evidence | Observable completion |
| --- | --- | --- |
| POSITION_OPEN | Authenticated source/reconciliation: signed quantity, basis, account window | Confirmed venue inventory, never an intent-derived assumption |
| PROFITABLE_TP_COVERED | TP assessor + coverage workflow: exact authorized price and live owned order | Authenticated remaining TP quantity; ACK/request alone insufficient |
| PRICE_MOVES_ADVERSELY / RISK_REASSESSMENT | Market source + canonical session/risk evaluator | Dated book/account/cost evidence and explicit reason |
| DEFENSIVE_EXIT_ELIGIBLE | Canonical policy authority, separate from TP profit/ENTRY budget | Logged authorized action; not a fill |
| EXECUTION_ADMISSION | Final maker/IOC gate as appropriate | Fresh identity/quantity/no-flip/venue validation |
| SUBMISSION | Durable lifecycle/executor, exact intent/client identity | Attempt recorded; unknown result stays unresolved |
| VENUE_ACKNOWLEDGMENT | Authenticated exact order identity/reconciliation | Live/terminal status; never assumed closure |
| FILL | Authenticated execution stream/history, fragment dedup | Executed quantity and fees, partial residual retained |
| RECONCILED_POSITION | Fresh venue inventory/open orders + durable fill attribution | Residual/flat accepted only after authoritative reconciliation |

PRODUCTION_PATH_REPLAY_RESULTS=

New canonical-capital-to-orchestrator LONG/SHORT replay passes for the PID 1528 healthy frame, with exact .0007 confirmed coverage and unchanged owned ACK identity, no fake-venue mutation. Existing production-path suite includes multi-fill/DCA basis and same-price quantity repair, genuine exhausted capital, far profitable TP retained over losing replacement, sustained adverse movement below authority, canonical risk crossing with TP/zero allocation, actual final maker admission and ACK, PostOnlyViolation/market gap, authenticated outages/recovery, partial fills, unknown result, cancel/restart recovery and BTC-only isolation. Existing per-fill/aggregate economic comparisons remain diagnostic and do not allocate new lots. The tests distinguish planner-only checks from lifecycle/final-gate/fake-adapter execution; none are claimed as live verification.

TEST_AND_BUILD_RESULTS=

| Check | Result |
| --- | --- |
| `npm run format:check` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `src/readonly_exit_architecture_tmp.ts` |
| `npm run lint` | Failed only on pre-existing `.tmp_conflict_readonly.cjs` and `.tmp_exact_evidence.ts`, outside the TypeScript project service |
| `npm run typecheck` | Passed; also rerun directly with pinned Node v22.23.2 |
| `npm run build` | Passed; also rerun directly with pinned Node v22.23.2 |
| `npm run build:web-dashboard` | Passed; also rerun directly with pinned Node v22.23.2 |
| Full `npm test` with pinned production Node v22.23.2 first on PATH | **1007 passed across 33 files**: 990 production-core plus 17 reconciliation/HTTP tests |
| Final conservative capital assertions | 22 practical-capacity tests passed under pinned Node |
| Final BTC-only defensive execution with an unrelated ETH position | 2 LONG/SHORT real-final-gate/fake-adapter ACK and coverage replays passed; only BTC was submitted, foreign position remained unchanged, any cancellation rejected by the fake |
| Changed test ESLint | Passed |
| `git diff --check` | Passed with Windows line-ending notices |

The initial full run under default workstation Node v24.11.1 hit the existing 20-second timeout in the 1,000-cycle liveness stress test while verification workloads overlapped: 989 passed, one timed out, and the script did not reach its second test batch. No timeout or assertion was relaxed. The complete pinned-runtime run passed the same stress test and all other tests. Final metadata/foreign-market assertions were then rerun in their affected suites without repeating unrelated passing tests. Default-runtime failure and pinned-runtime success are both disclosed; no claim of an uninterrupted clean run is made. Native SQLite was independently loaded successfully under the pinned runtime. Chromium tests used isolated fake venues/disposable journals outside the process sandbox.

DEPLOYMENT_STATUS=

**Not deployed or started.** No session started/ended, no real order submitted/cancelled/replaced/closed, no Settings change, no production journal mutation or restart. Local changes in this follow-up are two consumer replay cases, conservative metadata assertions, an extension of the existing LONG/SHORT final-gate replay to retain unrelated ETH inventory, and this report; the ignored read-only audit helper is not a production dependency. Local backend/dashboard build artifacts were regenerated. Production source build ID remains 3db6fe7595096c2f; no running process is certified with it.

REMAINING_REAL_MONEY_RISKS=

Unapproved per-position downside policy; indefinite below-trigger holding; maker/IOC non-fill, venue gaps/outage and unknown outcomes; stale independent data; incomplete fee/funding/gas semantics; source/release hygiene and schema-compatible rollback. Flat-at-a-time-of-audit is not future flatness. A passed fake-venue suite is not a mainnet acceptance test or a guarantee of limited losses. The plan deliberately refuses a clean-deployment claim until the release and explicit operator approvals exist.
