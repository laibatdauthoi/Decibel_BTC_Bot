# Decibel BTC Bot — Project Handover (refresh)

**Audit date:** 2026-11-12 (Asia/Bangkok)
**Workspace:** `D:\study\Decibel_BTC_Bot`
**Branch:** `chore/production-cleanup-v1` (no upstream configured)
**HEAD:** `471e9ef` — `feat: establish lean decibel btc market maker production bot` (committed 2026-09-05)
**Supersedes:** `PROJECT_HANDOVER.md` (audit of 2026-10-21). That file is kept unchanged for history.
**Audit method:** read-only. Source, docs, git state, runtime logs, persisted settings and a copy of the session database were inspected. `.env` was read for configuration _names_ and for non-secret mode/limit values only; no credential value was read into this report. No order, session, journal, setting or process was touched.

Evidence labels used below: **VERIFIED** (checked directly during this audit), **DOCUMENTED** (stated in a repository doc, not re-checked), **INFERRED** (conservative deduction), **UNKNOWN**, **CONFLICT**.

---

## 0. Tóm tắt nhanh (tiếng Việt)

- Bot không còn là market maker hai chiều đơn giản như bản 21/10. Luồng hiện tại là: **ENTRY maker (PostOnly) → TP reduce-only**, có Max Loss theo session và Target Volume do người vận hành đặt trên dashboard.
- **`.env` đang cấu hình giao dịch tiền thật trên mainnet**: `TRADING_MODE=mainnet`, `LIVE_TRADING_ENABLED=true`, `DECIBEL_EXECUTOR_ENABLED=true`, `DECIBEL_EXECUTOR_DRY_RUN=false`, `RELEASE_STAGE=CANARY`.
- Bot **đang tắt**. Lần chạy cuối dừng bằng Ctrl+C lúc **2026-11-10 01:03** (giờ VN), trạng thái IDLE, không có session, không có owner.
- Code sửa sau thời điểm đó (đến khoảng 19:12 ngày 10/11) **chưa từng chạy thật**.
- Từ 21/10 đến nay **chưa có commit nào**. Có 32 file sửa (+34.973 / −1.274 dòng) và 213 mục chưa track, trong đó có khoảng 50 module `src` cốt lõi.
- **Với Settings hiện tại (Capital $5, Max Loss $0,20, Target $300), bot gần như chắc chắn không vào lệnh được.** Kích thước entry ưu tiên là $15, vượt trần rủi ro stress-loss (khoảng $12,4), nên bị `RISK_BLOCKED`. 4 session gần nhất đều có 0 fill. Đây là cơ chế an toàn hoạt động đúng thiết kế, không phải bug. Muốn bot giao dịch thì bạn phải tự quyết thay đổi tham số.
- **DCA đã bị xóa ngày 2026-11-12, rồi được thêm lại ở dạng đơn giản ngày 2026-11-13 (theo yêu cầu của user, `decibel_dca_v1.ts`).** Tối đa 2 lần thêm (đếm theo số lệnh mở đã khớp trong vị thế), maker PostOnly, mỗi lần chỉ khi giá ngược ≥ 25 bps so với entry basis trung bình hiện tại; kích thước ≤ entry ưu tiên và ≤ risk capacity còn lại sau vị thế hiện tại; lần thêm < 1/3 vị thế bị từ chối. Mô phỏng trước khi làm (67 entry từ 5/11) cho thấy DCA làm tổng PnL tệ hơn và tạo một vòng vượt Max Loss; user vẫn chọn làm. Mã chặn: `DCA_*`, `POSITION_GROWTH_DISABLED` khi không có DCA được duyệt.
- Kết quả thực tế ghi trong DB: 64 session có PnL đầy đủ, **tổng −$5,77** trên khoảng $5.200 maker volume (xấp xỉ −11 bps/volume). Bot chưa có lãi.
- Kiểm tra hôm nay: typecheck **PASS**; lint **FAIL** (2 file nháp `.tmp*`); format **FAIL** (4 file); `npm test` **chưa chạy lại được** (xem mục 9).
- Xung đột stop-loss trong `AGENTS.md` **vẫn chưa giải quyết**. Không có logic stop-loss nào trong `src`.

---

## 1. What changed since the 2026-10-21 handover

| Area                     | 2026-10-21 state                                   | 2026-11-12 state                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commits                  | HEAD `471e9ef`                                     | **Unchanged.** All work since is uncommitted.                                                                                                                                                                         |
| Tracked diff             | 28 files, ~12k insertions                          | **32 files, +34,973 / −1,274** (VERIFIED `git diff --shortstat`)                                                                                                                                                      |
| Untracked                | many                                               | **213 entries**, incl. ~50 production `src` modules, tests, ~75 docs, live state files (VERIFIED)                                                                                                                     |
| `src` size               | 83 files / ~29k lines                              | **115 files / ~47.6k lines** (VERIFIED)                                                                                                                                                                               |
| Tests                    | 22 files / 445 tests                               | **51 test files / ~44.4k lines; last recorded run 1,355 tests** (VERIFIED file count; test count from 2026-11-10 log)                                                                                                 |
| Strategy                 | NORMAL_MM two-sided passive quoting                | **ENTRY → TP** (up to two DCA additions, re-added 2026-11-13) with session Max Loss / Target Volume (DOCUMENTED + VERIFIED in source)                                                                                 |
| Decision layer           | multiple strategic branches in orchestrator        | **`evaluateTradingDecision` in `decibel_trading_decision_v1.ts`** returns TRADE / WAIT / STOP (DOCUMENTED, file VERIFIED)                                                                                             |
| Sizing                   | position headroom partly from `maxLoss × leverage` | **Dynamic entry size** (`decibel_entry_size_v1.ts`) independent of Max Loss; Max Loss now only feeds a separate stress-loss admission check (DOCUMENTED)                                                              |
| Production entry command | `npm run decibel:production:web-v1`                | **`npm run decibel:production`** → `src/run_decibel_production_bootstrap_v1.mjs` (VERIFIED). Requires Node `v22.23.2` at `%LOCALAPPDATA%\DecibelTools\node-v22.23.2-win-x64\node.exe` or `DECIBEL_NODE22_EXECUTABLE`. |
| CI                       | "no CI found"                                      | `.github/workflows/quality.yml` **exists** (format, lint, typecheck, test, build on push/PR). It cannot pass on a clean clone today: untracked modules are missing and lint/format fail.                              |
| Execution journal        | ~713 MB                                            | **~2.35 GB** `data/decibel_execution_v1.sqlite` (VERIFIED)                                                                                                                                                            |
| `data/`                  | not measured                                       | **~30 GB, 3,070 files**, incl. several ~1.28 GB `.tmp_*recovery*.sqlite` copies (VERIFIED)                                                                                                                            |

Main work streams since 21/10 (DOCUMENTED in `docs/`, newest first):

1. **Entry risk admission / START transition** (`decibel_risk_blocked_root_cause_audit_v1.md`, `decibel_start_transition_risk_diagnostics_v1.md`, 2026-11-10). START → RUNNING activation failure no longer triggers an invalid rollback (`SESSION_TRANSITION_CONFLICT`). Exact risk diagnostics are added. The stress-loss rule is retained.
2. **Dynamic entry size + DCA policy** (`decibel_dynamic_entry_size_v1.md`, 2026-11-09).
3. **Market pipeline audit** (`decibel_market_pipeline_audit_v1.md`, 2026-11-09). Found an old-generation coalescing timer firing after reconnect, and SDK error handling that could re-mark the feed connected. Fix status was **not independently verified** in this audit.
4. **Dashboard work** (2026-11-08 to 11-09): overview metrics, share card / PNG export, logo, settings capital validation, activity history, session modal.
5. **Entry pricing / replacement policy**: maker breakeven pricing, balanced ENTRY replacement, entry price priority/stability.
6. **TP policy**: patient TP with persisted adverse anchors, TP decision liveness, partial TP coverage recovery.
7. **Protective safety lane**: independent protective recovery, exit coverage architecture repair, systemic execution audit (2026-11-06, written in Vietnamese).

---

## 2. Product and strategy (current)

**VERIFIED/DOCUMENTED:** a deterministic, single-instance, local-Windows bot for the Decibel BTC/USD perpetual on Aptos mainnet. No AI model is called when making trading decisions (`AGENTS.md`). The operator controls it from a React dashboard at `http://127.0.0.1:4173` (loopback only, no HTTP authentication).

Business flow per session (DOCUMENTED, `decibel_unified_trading_decision_v1.md`, `decibel_dynamic_entry_size_v1.md`):

1. The operator saves Settings: **Capital to use, Max Loss, Target maker volume, order notional, max position**. Then the operator presses **Start Session**.
2. **ENTRY**: a passive PostOnly maker order, priced at the nearest tick that still satisfies the lifecycle cost equation (maker fee + safety + 2 × gas/quantity), bounded by the BBO.
3. **ENTRY lifecycle**: FLAT → PLACING → OPEN → (CANCELLING) → FLAT. A verified fill hands protection to the TP workflow. A partial fill keeps the residual OPEN and protects the filled part.
4. **TP**: a reduce-only maker order with net ≥ 0 (breakeven allowed). Adverse repricing (2026-11-13, flag `DECIBEL_TP_CANDLE_RULE_ENABLED`, default on): once the price is outside the safe band (clamp(1.2 × 5-minute range, 10, 40) bps against the entry), a step needs two clock-aligned 5-minute candles to close with the price never back inside the band since it left (or since the opening fill / previous step). The first step moves the TP to break-even, later steps rest it the rescue offset (clamp(0.5 × range, 5, 20) bps) from the maker. With the flag off, the earlier time rule applies (5 minutes untouched, break-even until 15 minutes, then rescue).
5. **DCA**: removed on 2026-11-12, re-added in a simple form on 2026-11-13 (`decibel_dca_v1.ts`): up to two maker additions, each at ≥ 25 bps adverse to the current average entry basis, capped by the preferred entry size and the risk capacity left after the position. A TP covering < 75% of the position is then replaced at full size.
6. **Catastrophe stop** (2026-11-13, `decibel_catastrophe_stop_v1.ts`, flag `DECIBEL_CATASTROPHE_STOP_ENABLED`, default on): for offline protection only, the bot keeps one full-size position SL (`place_tp_sl_order_for_position` without a size) on an open position. The trigger is beyond the session Max Loss (1.2 × Max Loss of the notional, clamped to 2–10% from the entry, never closer than 1% to the market) and the Stop Limit's limit is 3% past the trigger. It is placed after a cycle with no submission, never while a submission is in flight, at most every 30 s, from a fresh venue read; the venue keeps at most one full-size SL and removes it when the position closes (Stage D). Position TP/SL rows are excluded from limit orders; any other TP/SL (a TP, a sized or tight SL) still counts as foreign activity (`activeTpSlCount`). A triggered stop fills with an empty client order id, i.e. as non-strategy activity that needs operator review. Not yet tested on mainnet: the trigger reference price and Stop Limit behaviour in a gap.
7. **Session end**: operator END, `TARGET_VOLUME_REACHED`, `MAX_LOSS_REACHED`, or `TARGET_UNREACHABLE_MINIMUM_ORDER`. The session terminalizes only after an authenticated FLAT position, zero orders, zero unresolved intents and a completed unwind.

`evaluateTradingDecision(snapshot, session)` is pure and deterministic. It outputs TRADE / WAIT / STOP plus reasons, executable sizes and evidence timestamps. If mandatory evidence keeps failing, WAIT escalates to STOP after **60,000 ms** (`DECIBEL_EVIDENCE_FAILURE_STOP_AFTER_MS_V1`, VERIFIED).

---

## 3. Architecture (largely unchanged from 21/10)

The runtime model in the 21/10 handover §4 is still accurate. Treat that section as the reference for supervisor domains, data flow, HTTP endpoints and persistence. Additions and corrections:

- **Launch chain:** `npm run decibel:production` → `run_decibel_production_bootstrap_v1.mjs` (checks Node 22.23.2, native preflight for `better-sqlite3`/`esbuild`, refuses to install deps while a production process is running) → web launcher → `run_decibel_production_web_v1.ts` → orchestrator / state source / lifecycle / executor.
- **Decision layer:** `decibel_trading_decision_v1.ts` (≈41 KB) is consumed by `decibel_production_live_orchestrator_v1.ts` (≈224 KB, the largest file) and by the final submission preflight.
- **Sizing and risk modules:** `decibel_entry_size_v1.ts`, `decibel_dynamic_quote_size_v1.ts`, `decibel_risk_capacity_v1.ts`, `decibel_capacity_producers_v1.ts`, `decibel_operator_settings_v1.ts`, `decibel_session_capacity_projection_v1.ts`.
- **TP/exit modules:** `decibel_exit_economics_v1.ts`, `decibel_entry_cycle_v1.ts` (fill-history reconciliation), `decibel_exit_coverage_workflow_v1.ts`, `decibel_protective_recovery_admission_v1.ts`, `decibel_order_action_v1.ts`.
- **Session control:** `decibel_production_session_controller_v1.ts` (exclusive transition queue, idempotent START, session ID assigned before admission) and `decibel_production_session_v1.ts`.
- **Hot spots** (large, regression-sensitive): orchestrator (224 KB), `run_decibel_production_web_v1.ts` (135 KB), `decibel_production_live_state_source_v1.ts` (128 KB), `decibel_execution_lifecycle_journal_v1.ts` (116 KB), and the orchestrator test file (**699 KB**).

---

## 4. Settings, sizing and risk formulas

### Current persisted Settings (VERIFIED `config/production_state/decibel_operator_settings_v1.json`, revision 14, saved 2026-11-09 03:31)

| Field                | Value |
| -------------------- | ----- |
| capitalToUseUsd      | 5     |
| maxLossUsd           | 0.20  |
| targetMakerVolumeUsd | 300   |
| orderNotionalUsd     | 10    |
| maxPositionUsd       | 50    |

`.env` limits (VERIFIED, non-secret): `DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD=10`, `..._MAX_NOTIONAL_USD=50`, `MAX_EFFECTIVE_LEVERAGE=40`, `MARKET_SYMBOL=BTC/USD`.

### Entry size (DOCUMENTED, `decibel_dynamic_entry_size_v1.md`)

- Fixed target: `preferredEntrySizeUsd = max(10, targetMakerVolumeUsd / 20)`. With target $300 this is **$15**.
- "Until capital limit" (negative target sentinel): `max(10, capital × collateralFraction / 4)`.
- The size is raised to the venue minimum, floored to the lot, and capped by executable margin capacity. Max Loss is **not** an input.

### Independent stress-loss admission (DOCUMENTED, `decibel_risk_blocked_root_cause_audit_v1.md`; constants VERIFIED in `decibel_risk_capacity_v1.ts`)

```text
lossBps       = adverseMoveBps + entryFeeBps + exitFeeBps + exitSlippageBps + adverseSelectionBps
lossRemaining = max(0, MaxLoss + min(0, netSessionPnl) - sessionGas - fixedExitCost)
riskCapacity  = lossRemaining / (lossBps / 10000)
RISK_BLOCKED:SESSION_PROJECTED_STRESS_LOSS  if  projectedExposureUsd > riskCapacityUsd + 1e-9
```

Policy floors: adverse move `max(100 bps, 2 × recent midpoint range)`, fee 10 bps per leg, adverse selection 8 bps, exit slippage 25 bps, fixed exit cost `max(5% × MaxLoss, observed)`. These are policy choices. They are not empirically calibrated (DOCUMENTED).

**Consequence (INFERRED, high confidence):** the doc's reproduced fixture uses **exactly the current Settings** (Capital $5, Max Loss $0.20, Target $300). It yields a $14.40 candidate against **≈$12.42 risk capacity**, so every entry is RISK_BLOCKED. This matches the last 4 sessions (2026-11-09/10), which all had 0 fills (§7). Unblocking entries requires an operator decision: raise Max Loss, lower Target (the entry size follows Target/20, with a $10 floor), or accept no trading. **Do not change these without explicit user approval** (`AGENTS.md`).

### Lifecycle cost admission (VERIFIED `decibel_smart_ladder_v1.ts`)

`DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1 = 11.25`, hysteresis `0.215`, so the new-entry threshold is 11.035 bps. One documented live sample (2026-10) measured 11.67 bps of cost before gas. In those conditions no quote can be admitted (DOCUMENTED).

---

## 5. Invariants to preserve

All invariants in the 21/10 handover §6 still apply. In addition:

- Max Loss must not determine the preferred entry size. The stress-loss check stays a separate hard gate.
- Position growth only through an admitted DCA addition (at most two) (`assessDecibelDCAV1`), checked in the planner and the decision layer; the risk engine still checks the projected position against the risk capacity.
- Do not cancel an existing TP in order to "replace" it with a better one, because cancel + place is not atomic. Quantity repair returns `TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD` (DOCUMENTED, systemic audit).
- The protective lane (reconciliation, safe cancel, reduce-only TP, canonical unwind) runs independently of entry admission. Entry, DCA and cancellation-first transitions cannot pass protective admission.
- The patient TP anchor is persisted in the CANCEL intent. Restart and reconciliation must not reset it.
- START is idempotent. There is no automatic START resubmission.
- No timers, cooldowns, age-based cancels or fabricated fill probabilities in entry/TP policy (`fillProbability` / `expectedValueUsd` remain null).

---

## 6. Live configuration and safety status

| Item                              | Value                                                                                    | Label    |
| --------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| `TRADING_MODE`                    | `mainnet`                                                                                | VERIFIED |
| `LIVE_TRADING_ENABLED`            | `true`                                                                                   | VERIFIED |
| `DECIBEL_NETWORK`                 | `mainnet`                                                                                | VERIFIED |
| `DECIBEL_EXECUTION_MODE`          | `production`                                                                             | VERIFIED |
| `DECIBEL_EXECUTOR_ENABLED`        | `true`                                                                                   | VERIFIED |
| `DECIBEL_EXECUTOR_DRY_RUN`        | **`false`**                                                                              | VERIFIED |
| `DECIBEL_EXECUTION_RELEASE_STAGE` | `CANARY`                                                                                 | VERIFIED |
| Credentials present in `.env`     | `DECIBEL_PRIVATE_KEY`, `DECIBEL_NODE_API_KEY`, `DECIBEL_SUBACCOUNT_ADDRESS` (names only) | VERIFIED |

**Meaning:** pressing Start Session will submit real mainnet orders.

**CONFLICT:** `config/production_state/decibel_execution_mode_v1.json` (persisted 2026-09-28) says `dryRun: true`. According to the 21/10 handover, `.env` is authoritative and the API refuses mode writes, so the effective mode is **live, not dry-run**. This stale file is misleading and should be removed or regenerated.

**`AGENTS.md` safety rule "Live trading must be disabled by default":** this is satisfied in code defaults (DOCUMENTED). The local `.env` deliberately enables live trading.

### Runtime state at last shutdown (VERIFIED `data/production_runtime/`)

- Last process: launcher PID 24840 / node PID 29584. Stopped by **SIGINT at 2026-11-10 01:03:26 (UTC+7)**, `autoRestart: false`.
- `last_runtime_state.json`: `runtimeState=IDLE`, `ownerState=NONE`, `executionRunning=false`. Economic, recovery and authenticatedState dependencies were all `READY`.
- Final stdout: `SESSION_CONTROL_STATE=WAITING_FOR_USER_START`, `LAST_START_BLOCKER=SESSION_TRANSITION_CONFLICT`. This START issue is addressed in source after the shutdown but not runtime-verified.
- `config/production_state/decibel_restart_safety_v1.json` is **stale** (2026-10-31). At that time it recorded position 0.00073 BTC and 1 open order. Current venue position and open orders are **UNKNOWN** to this audit, because no authenticated read was performed. The last session rows record `final_position_base = 0` (§7).
- Source files changed **after** the shutdown (still not run): `decibel_risk_capacity_v1.ts`, `decibel_trading_decision_v1.ts`, `decibel_production_live_orchestrator_v1.ts`, `tests/decibel_entry_size_v1.test.ts`, plus docs.

---

## 7. Operational history (VERIFIED from a copy of `decibel_production_sessions_v1.sqlite`)

- **126 sessions**, from 2026-09-08 to 2026-11-10.
- Status: ENDED 99, INTERRUPTED 21, **BLOCKED 6**.
- Stop reasons: OPERATOR_END 75, PROCESS_INTERRUPTED 21, PROCESS_SHUTDOWN 16, **SESSION_UNWIND_COMPLETION_CONFLICT 6**, TARGET_UNREACHABLE_MINIMUM_ORDER 5, TARGET_VOLUME_REACHED 2, MAX_LOSS_REACHED 1.
- **64 sessions with complete PnL: total −$5.7738**, maker volume ≈ $5,202, total executed ≈ $5,616, 168 fills (all sessions), fees ≈ $1.01. Gas is not recorded in this table (NULL).
- 62 sessions have incomplete PnL (≈ $61 maker volume). They are excluded from the total above.
- The 4 most recent sessions (2026-11-09 03:32 → 2026-11-10 00:51) all have **0 fills / 0 volume**, consistent with RISK_BLOCKED under the current Settings.
- The last session with fills (2026-11-08 15:52–20:41) ended `TARGET_UNREACHABLE_MINIMUM_ORDER`: $497 maker volume, −$0.029.

**Interpretation (INFERRED):** the bot has executed real volume with small, consistent net losses (≈ −11 bps of volume). It has not demonstrated a profitable edge. Most sessions were short and manually ended during debugging.

---

## 8. Known issues and risks (prioritized)

### Critical

1. **No commits for 9+ weeks of production work.** The core modules, tests and docs are untracked or uncommitted. A disk failure or a stray `git clean` would lose them. A clean clone cannot run the bot.
2. **Live mainnet execution is armed in `.env` while the newest code is unverified at runtime.** Starting a session now runs code that has never executed against the venue.

### High

3. **The stop-loss policy conflict is still unresolved.** `AGENTS.md` says "Every new position must have a stop-loss". There is no stop-loss implementation anywhere in `src` (VERIFIED by search). Protection relies on TP, inventory/risk limits and canonical unwind. The user must decide whether market-making inventory is exempt.
4. **The current Settings make entries impossible** (§4). This looks like "the bot does nothing" but is the intended outcome of the stress-loss gate.
5. ~~DCA is blocked in production.~~ **Resolved 2026-11-12:** DCA removed at the user's request.
6. **Economics are negative so far** (§7). The lifecycle cost sample was above budget (§4).
7. **6 sessions are persisted as BLOCKED / `SESSION_UNWIND_COMPLETION_CONFLICT`.** Whether they hold stale ownership or need operator recovery is UNKNOWN. Review them before the next start.

### Medium

8. **Quality gates fail:** lint fails because of 2 stray root files (`.tmp_conflict_readonly.cjs`, `.tmp_exact_evidence.ts`). Format fails on `.tmp_conflict_readonly.cjs`, `src/readonly_exit_architecture_tmp.ts` and 2 fixtures. The last recorded `npm test` (2026-11-10 ~01:05) had **3 failures / 1,355**, all Chromium PNG/screenshot tests that crashed with a GPU error and timed out (`overview_share_v1.test.ts`, `decibel_production_web_presentation_v1.test.ts`). These failures are likely environmental, but that is not proven.
9. **Workspace bloat:** 272 `.tmp_*` files in the repo root, `src/readonly_exit_architecture_tmp.ts`, ~30 GB in `data/` including multiple 1.28 GB recovery SQLite copies, and a 2.35 GB journal with no retention policy.
10. **Documentation sprawl and drift:** ~75 incident/fix reports in `docs/` with PNG evidence folders. `README.md` is still legacy. `.env.example` is legacy and omits the current production keys (`DECIBEL_EXECUTION_MODE`, `DECIBEL_EXECUTOR_ENABLED`, `DECIBEL_EXECUTOR_DRY_RUN`, `DECIBEL_EXECUTION_RELEASE_STAGE`, `DECIBEL_PRIVATE_KEY`, `DECIBEL_SUBACCOUNT_ADDRESS`, `DECIBEL_PRODUCTION_EXECUTOR_MODULE`, `DECIBEL_EXECUTION_JOURNAL_PATH`, `DECIBEL_PRODUCTION_LIVE_MIN/MAX_NOTIONAL_USD`, `MAX_EFFECTIVE_LEVERAGE`).
11. **Authenticated read timeouts** were observed (OPEN_ORDERS 9,015 ms against a 9,000 ms limit, 2026-11-10) (DOCUMENTED).
12. **`npm test` uses an explicit file list.** `web_dashboard/src/branding_v1.test.ts` is **not** included (VERIFIED). New tests must be added to `package.json` manually or they are silently skipped.
13. **Dependency drift risk:** caret ranges on several packages, and `@types/node` ^26 while the runtime is Node 22. The repo is Windows-only in practice (bootstrap path, PowerShell, win32 native binaries in `node_modules`).
14. The local API has no authentication (loopback/OS boundary only), and it can start and end sessions that trade real funds.

---

## 9. Verification performed in this audit (2026-11-12)

Run inside a Linux VM against the mounted Windows workspace, using the existing `node_modules` (Node v22.23.4 in the VM):

| Command                                                            | Result                                                                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc -p tsconfig.production.json --noEmit` (= `npm run typecheck`) | **PASS**                                                                                                                                                                                     |
| `eslint .` (= `npm run lint`)                                      | **FAIL**: 2 parsing errors, only the stray `.tmp_*` root files                                                                                                                               |
| `prettier --check .` (= `npm run format:check`)                    | **FAIL**: 4 files (listed in §8)                                                                                                                                                             |
| `npm test`                                                         | **NOT RUN.** `node_modules` contains only win32 `esbuild`/`rollup`/`better-sqlite3` binaries, and a separate Linux install could not finish within the tool's time limit. Run it on Windows. |
| `npm run build`                                                    | **NOT RUN**: it emits `dist/`, and this audit was read-only.                                                                                                                                 |

---

## 10. Recommended next steps (in order)

1. **Safety first:** until the steps below are done, set `LIVE_TRADING_ENABLED=false` (or `DECIBEL_EXECUTOR_DRY_RUN=true`) in `.env`. This is the user's decision.
2. **Back up and commit:** remove or ignore the stray `.tmp_*` files and `src/readonly_exit_architecture_tmp.ts`. Make sure `config/production_state/*` and `data/` stay uncommitted. Then commit the source, tests and selected docs in focused commits on this branch and push to the remote.
3. **Run the full gate on Windows:** `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build`. Fix the Chromium screenshot tests or mark them environment-dependent, and add `branding_v1.test.ts` to the test script.
4. **Resolve the stop-loss policy question** with the user.
5. **Decide Settings explicitly** (Max Loss / Target / Capital) with the stress-loss arithmetic in §4, or accept that the bot will not enter.
6. **Review the 6 BLOCKED sessions** and the unresolved journal intents. Run a fresh restart-safety check before any START.
7. **Mutation-disabled runtime verification of the current build** (dry run): START idempotency, risk diagnostics, market feed reconnect behavior, TP planner diagnostics.
8. Rewrite `README.md` and `.env.example` from the current implementation, and archive the incident reports into `docs/archive/`.
9. Define a retention/archive policy for `data/`, and delete the large `.tmp_*recovery*.sqlite` copies after confirming they are not needed.

---

## 11. Guidance for future AI/Codex work

The 21/10 handover §12 still applies (authority, allowed mutations, invariants, structured returns). Additionally:

- Read `docs/decibel_unified_trading_decision_v1.md`, `docs/decibel_dynamic_entry_size_v1.md` and `docs/decibel_risk_blocked_root_cause_audit_v1.md` before touching decision, sizing or risk.
- Before diagnosing "bot doesn't trade", check the TRADE/WAIT/STOP primary reason and the exact predicate diagnostics. RISK_BLOCKED with small Max Loss is expected.
- Never write to `.env`, `config/production_state/`, the execution journal or the session DB without explicit user permission.
- Write fix reports into the existing docs pattern, but prefer updating this handover over creating more one-off reports.
- Do not create new `.tmp_*` files in the repo root. Use a scratch directory outside the repo.

---

## 12. Unknowns

- Current venue position, open orders and unresolved journal intents (no authenticated read in this audit).
- Whether the 6 BLOCKED sessions require manual recovery.
- Whether the market-pipeline lifecycle fixes described on 2026-11-09 are fully implemented.
- Whether the Chromium test failures are purely environmental.
- The user's profitability target, risk appetite and stop-loss decision.
- The intended remote/backup state: the branch has no upstream configured, and the remote URL is `github.com/laibatdauthoi/Decibel_BTC_Bot`.
