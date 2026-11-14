# Decibel BTC Market Maker Production Handover Specification

## 1. Document Purpose and Scope

This document is the production handover for `Decibel_BTC_Bot`. It describes the active BTC/USD production runtime, its execution and reconciliation boundaries, operator interfaces, safety controls, persistent state, verification status, and known operational history.

The system goal is a deterministic, high-availability market maker for Decibel DEX in the Aptos ecosystem. Trading decisions must not call an AI model. The bot reads authenticated account state and current BTC/USD market state, generates controlled maker quotes, submits mutations only through the production execution lifecycle, journals every intent and outcome, and reconciles local state against authoritative venue evidence.

This document contains no credentials, private keys, API keys, auth headers, or wallet secrets.

## 2. Production Entry Points and Commands

The active commands are:

```powershell
npm run decibel:production:live-v1
npm run decibel:production:tui-v1
npm run decibel:recycling:attribute-and-resync-v1
npm run decibel:execution:resolve-pre-submit-failure-v1
npm run test:production-core
```

Roles:

- `decibel:production:live-v1` starts the non-interactive production orchestration loop.
- `decibel:production:tui-v1` starts the Node 22 bridge and the full-screen operator TUI. The package script currently supplies `--auto-resume`.
- `decibel:recycling:attribute-and-resync-v1` performs authenticated BTC activity attribution and versioned checkpoint reconciliation.
- `decibel:execution:resolve-pre-submit-failure-v1` resolves only locally proven pre-submission failures after explicit operator confirmation.
- `test:production-core` runs the retained production test closure.

The production TypeScript build is controlled by `tsconfig.production.json` and includes both production runners, the TUI bridge, resync and journal recovery entry points, and the external executor boundary.

## 3. Core Runtime Overview

The high-level execution flow is:

```text
Authenticated account and market read
  -> BTC/USD market scope validation
  -> strategy and smart-ladder evaluation
  -> quote selection and re-quote hysteresis
  -> immutable execution intent construction
  -> rolling mutation budget check
  -> execution preflight
  -> production executor gate
  -> external Decibel executor
  -> durable outcome journaling
  -> authenticated state reconciliation
  -> lifecycle terminalization or RECONCILE_ONLY
```

The intended steady-state behavior is symmetric two-sided BTC/USD maker quoting when inventory and risk allow it. Inventory pressure reduces the inventory-increasing side and favors the inventory-reducing side. Strict one-sided behavior is reserved for hard risk conditions or controlled termination behavior.

All regular ladder, inventory-reducing maker, and take-profit maker intents are limit and PostOnly. Stop-loss or emergency taker behavior must remain explicitly separated and must never be introduced by weakening standard maker intent validation.

## 4. Architecture and File Map

### 4.1 Runners and operator interface

| File                                                                     | Production role                                                                                                                          |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/run_decibel_production_live_v1.ts`                                  | Loads environment configuration, state source, executor, journal, mutation budget, and continuous production loop.                       |
| `src/run_decibel_production_live_tui_node22_bridge_v1.ts`                | Ensures the TUI runs through the pinned compatible Node 22 runtime path.                                                                 |
| `src/run_decibel_production_live_tui_v1.ts`                              | Runs authenticated preflight resync, profile selection, heartbeat, controls, auto-resume, degraded-feed handling, and TUI model updates. |
| `src/decibel_production_tui_v1.ts`                                       | Pure TUI rendering, alternate-screen lifecycle, panels, quote display, event formatting, fee display, and gas display.                   |
| `src/run_decibel_authenticated_btc_activity_resync_v1.ts`                | CLI boundary for authenticated BTC attribution, conservation checks, and checkpoint creation.                                            |
| `src/run_decibel_execution_journal_resolve_pre_submission_failure_v1.ts` | Explicitly confirmed recovery command for provable pre-submission failures.                                                              |

### 4.2 Strategy and quoting

| File                                                             | Production role                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/decibel_production_live_orchestrator_v1.ts`                 | Main deterministic coordinator. Reads snapshots, recovers pending intents, evaluates strategy, selects mutations, applies cooldowns, and controls lifecycle transitions. |
| `src/decibel_authenticated_passive_recycling_orchestrator_v1.ts` | Evaluates authenticated strategy state and desired recycling actions.                                                                                                    |
| `src/decibel_passive_volume_recycling_v1.ts`                     | Passive recycling sizing and risk-bounded notional logic.                                                                                                                |
| `src/decibel_smart_ladder_v1.ts`                                 | Builds up to three bid and ask levels with 50/30/20 allocation, volatility spacing, inventory skew, tick alignment, lot alignment, and collateral limits.                |
| `src/decibel_quote_engine_v1.ts`                                 | Pure quote construction and tick-safe price behavior.                                                                                                                    |
| `src/decibel_fair_price_engine_v1.ts`                            | Pure fair-price calculation.                                                                                                                                             |
| `src/decibel_inventory_controller_v1.ts`                         | Pure inventory pressure and skew controls.                                                                                                                               |
| `src/decibel_market_state_v1.ts`                                 | Normalized market-state contracts.                                                                                                                                       |

### 4.3 Execution lifecycle and journal

| File                                             | Production role                                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/decibel_execution_intent_v1.ts`             | Immutable PLACE and CANCEL intent construction, identity, status types, and execution preflight validation.                                                                |
| `src/decibel_execution_lifecycle_v1.ts`          | Submission boundary, mutation budget enforcement, duplicate suppression, outcome mapping, recovery enumeration, and reconciliation transitions.                            |
| `src/decibel_execution_lifecycle_journal_v1.ts`  | Durable SQLite journal for intents, attempts, executor outcomes, blockers, reconciliation observations, fills, and lifecycle state.                                        |
| `src/decibel_production_execution_v1.ts`         | Production execution adapter loading and higher-level execution boundary.                                                                                                  |
| `src/decibel_production_executor_handoff_v1.ts`  | Stable executor interface and result contract used by the orchestrator.                                                                                                    |
| `src/decibel_external_production_executor_v1.ts` | Mainnet Decibel SDK execution implementation, signer and subaccount checks, client-order identity, gas controls, PostOnly payload construction, and transaction telemetry. |
| `src/decibel_chain_units_v1.ts`                  | Converts price and quantity into chain-safe integer units so floating-point values do not reach Move ABI arguments.                                                        |
| `src/decibel_client.ts`                          | Decibel client boundary used by retained production modules.                                                                                                               |
| `src/decibel_sdk_runtime_v1.ts`                  | SDK runtime compatibility and safe loading boundary.                                                                                                                       |

### 4.4 Authenticated state, activity scope, and recovery

| File                                                           | Production role                                                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/decibel_production_live_state_source_v1.ts`               | Produces authenticated production snapshots, current books, positions, order state, fill state, terminal evidence, and timed-out-intent verification. |
| `src/decibel_authenticated_passive_recycling_live_state_v1.ts` | Normalizes authenticated recycling state used by strategy evaluation.                                                                                 |
| `src/decibel_btc_market_activity_scope_v1.ts`                  | Canonically filters account activity to BTC/USD before exclusivity evaluation. Non-BTC orders and positions must not block the BTC strategy.          |
| `src/decibel_actual_fill_truth_v1.ts`                          | Authenticated fill ledger and maker-volume truth model.                                                                                               |
| `src/decibel_authenticated_btc_activity_resync_v1.ts`          | Attributes BTC activity, checks position conservation, and builds immutable resync state.                                                             |
| `src/decibel_authenticated_btc_resync_checkpoint_chain_v1.ts`  | Validates and chains versioned resync checkpoints without rewriting prior checkpoints.                                                                |
| `src/decibel_authenticated_passive_recycling_journal_v1.ts`    | Authenticated recycling journal state.                                                                                                                |
| `src/decibel_pnl_tracker_v1.ts`                                | Computes realized PnL windows used by the TUI.                                                                                                        |
| `src/decibel_durable_client_order_identity_recovery_v1.ts`     | Recovers deterministic strategy order identity across restart boundaries.                                                                             |

### 4.5 Retained production tests

| Test file                                               | Coverage focus                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `tests/decibel_external_production_executor_v1.test.ts` | Executor payload, safety, SDK boundary, chain units, IDs, gas, and telemetry.                             |
| `tests/decibel_production_live_orchestrator_v1.test.ts` | Production orchestration, reconciliation, TUI helpers, timeout recovery, laddering, and live-loop safety. |
| `tests/decibel_production_execution_v1.test.ts`         | Production gate and execution integration behavior.                                                       |
| `tests/decibel_execution_lifecycle_v1.test.ts`          | Intent submission, budget, duplicate suppression, outcomes, rolling replenishment, and reconciliation.    |
| `tests/decibel_execution_lifecycle_recovery_v1.test.ts` | Crash recovery, explicit pre-submission recovery, flat neutralization, and legacy intent cleanup.         |
| `tests/decibel_quote_engine_v1.test.ts`                 | Pure quote behavior and alignment.                                                                        |
| `tests/decibel_chain_units_v1.test.ts`                  | Deterministic fixed-point chain conversion.                                                               |
| `tests/decibel_client.test.ts`                          | Decibel client contracts and parsing.                                                                     |

## 5. TUI Behavior and Controls

The TUI uses the alternate terminal screen buffer and hides the cursor while mounted:

```text
Enter: \x1b[?1049h and hide cursor
Leave: restore cursor and \x1b[?1049l
```

Exit and signal handlers restore the standard screen buffer. Rendering is pinned rather than appended to terminal scrollback.

The dashboard is designed to show:

- Active profile, master APT gas, subaccount collateral, and effective leverage.
- BTC/USD price, BTC inventory, unrealized PnL, and realized PnL windows.
- Target session volume and progress.
- Generated ladder levels and authenticated active quotes.
- Execution lifecycle events, actual fill fees, and transaction gas where evidence is available.

Event formatting supports fields such as:

```text
FEE=$0.001200
GAS=0.00010000 APT
```

Safe profile switching uses preconfigured environment profiles and isolated journal paths. It must pause quoting, cancel and reconcile through the existing lifecycle, close the old journal without deleting it, load the selected profile, reconcile the new identity, and remain paused until allowed to resume. Raw interactive private-key entry and journal flushing are prohibited.

Operator controls implemented by the TUI include profile switching, target volume, order notional, leverage, half-spread, maximum position, maximum drawdown, pause or resume, and cancel-all behavior. Operator cancel requests still pass through the execution lifecycle and safety gates.

## 6. Production Configuration and Defaults

### 6.1 Execution activation

Production configuration is validated with strict schemas. Live execution is disabled unless explicitly configured through the production release controls. Repository safety additionally requires both:

```text
TRADING_MODE=mainnet
LIVE_TRADING_ENABLED=true
```

The production orchestrator also validates:

- `DECIBEL_EXECUTION_MODE=production`
- `DECIBEL_EXECUTION_RELEASE_STAGE`, default `DISABLED`
- `DECIBEL_EXECUTOR_ENABLED`, default `false`
- `DECIBEL_EXECUTOR_DRY_RUN`, default `false`

Never copy credentials into this document, source, tests, logs, or command output.

### 6.2 Quote stability and ladder controls

| Parameter                                         |  Default | Meaning                                                                                                         |
| ------------------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------- |
| `DECIBEL_PRODUCTION_REQUOTE_HYSTERESIS_FRACTION`  |    `0.5` | A replacement is suppressed when the new target remains within the configured fraction of half-spread distance. |
| `DECIBEL_PRODUCTION_MIN_ACTIVE_ORDER_LIFETIME_MS` |   `5000` | Minimum observed active lifetime before a normal replacement may proceed.                                       |
| `DECIBEL_SMART_LADDER_MAX_LEVELS_PER_SIDE`        |      `3` | Maximum levels on each side. Schema does not permit more than three.                                            |
| `DECIBEL_SMART_LADDER_COLLATERAL_FRACTION`        |    `0.5` | Maximum fraction of leveraged available collateral considered for aggregate ladder notional.                    |
| `DECIBEL_SMART_LADDER_VOLATILITY_LOOKBACK_MS`     | `900000` | Fifteen-minute rolling volatility lookback.                                                                     |
| `DECIBEL_SMART_LADDER_MAX_VOLATILITY_MULTIPLIER`  |      `3` | Maximum volatility spread multiplier.                                                                           |

Level allocations are `50%`, `30%`, and `20%`. The ladder caps commitment by the minimum of configured maximum notional, position notional limit, and leveraged collateral fraction. Prices are rounded down for buys and up for sells. Quantities are lot-aligned. Tier 1 is omitted when its venue minimum cannot be met inside the side budget.

### 6.3 Read and reconciliation controls

| Parameter                                                   | Default | Meaning                                                                   |
| ----------------------------------------------------------- | ------: | ------------------------------------------------------------------------- |
| `DECIBEL_PRODUCTION_LIVE_POLL_INTERVAL_MS`                  |  `5000` | Main production polling interval.                                         |
| `DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS`                   | `10000` | Authenticated read timeout.                                               |
| `DECIBEL_PRODUCTION_LIVE_READ_RETRY_COUNT`                  |     `3` | Bounded transient read retries.                                           |
| `DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS`             |   `250` | Initial exponential retry backoff.                                        |
| `DECIBEL_PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT_MS` | `10000` | Age before direct timeout verification becomes eligible.                  |
| `DECIBEL_PRODUCTION_MAX_RECONCILIATION_AGE_MS`              | `30000` | Age before transaction-expiration proof may terminalize a phantom intent. |
| `DECIBEL_PRODUCTION_LIVE_MAX_CONSECUTIVE_READ_FAILURES`     |     `3` | Continuous-loop read failure limit.                                       |
| `DECIBEL_PRODUCTION_LIVE_SHUTDOWN_TIMEOUT_MS`               | `15000` | Graceful shutdown bound.                                                  |

Authenticated state errors remain fail-closed. Transient network failures may retry or pause the TUI, but invalid credentials, integrity failures, unresolved execution outcomes, malformed market data, excessive clock skew, and ambiguous BTC activity must not be converted into trading permission.

### 6.4 Dynamic mutation budget

The production runners configure a rolling 60-second mutation budget:

```text
PLACE limit = max(15, ladderLevelsPerSide * 5)
CANCEL limit = max(15, ladderLevelsPerSide * 5)
TOTAL limit = max(30, ladderLevelsPerSide * 10)
```

With the default three levels per side, the base allowance is 15 PLACE, 15 CANCEL, and 30 total mutation attempts per rolling 60 seconds.

The budget is computed from durable mutation-attempt timestamps. It replenishes automatically as the oldest attempts leave the rolling window. When depleted:

1. The first blocked submission records `EXECUTION_MUTATION_BUDGET_BLOCKED`.
2. The lifecycle reports the exact next slot time.
3. The orchestrator enters silent `HOLD` cooldown.
4. It does not perform mutation submission or preflight during cooldown.
5. It resumes evaluation after a slot becomes available.

An unknown submission outcome is not equivalent to normal rate-limit depletion. It remains reconciliation-gated and must not be cleared merely by waiting for budget replenishment.

## 7. Execution Safety Guardrails

### 7.1 Mandatory intent validation

Every order must pass through the intent builder, lifecycle, risk checks, executor gate, and external executor. Standard maker PLACE intents require:

- Exact BTC/USD market identity.
- LIMIT order type.
- PostOnly semantics.
- Permitted execution role.
- Permitted side.
- Tick-aligned price.
- Lot-aligned quantity.
- Notional at or above the venue minimum.
- Notional at or below the configured maximum.
- A price that does not cross the current best opposite quote.
- External counterparty requirement and no self-trade permission.

The external executor validates the subaccount, master signer, network, client order ID, SDK payload, gas policy, and integer chain units. Client order IDs are deterministic and limited to the contract-safe maximum of 32 bytes.

### 7.2 Account, market, and inventory safety

- Market scope is BTC/USD only for this strategy.
- Non-BTC activity is excluded before BTC strategy exclusivity checks.
- Unknown or unmanaged current BTC/USD activity remains a blocker.
- Historical maker volume alone is not current unrelated activity.
- Fresh and complete market and account data are required before opening risk.
- Balance, orders, positions, and fills are reconciled on startup and recovery.
- Every new position requires the configured risk protection boundary.
- Position-closing orders use reduce-only where supported.
- Daily loss and configured inventory limits remain hard controls.
- Risk limits and leverage must not be increased without explicit operator approval.

## 8. Durable State and Journal Semantics

The default execution journal is:

```text
data/decibel_execution_v1.sqlite
```

TUI profiles may specify distinct journal paths. A profile switch must never reuse or flush another identity's active journal.

The lifecycle journal stores:

- Immutable intent body and deterministic intent ID.
- Lifecycle status and venue order ID.
- Mutation attempts.
- Executor outcomes.
- Transaction hash and signed expiration timestamp when returned by the executor.
- Reconciliation observations and blockers.
- Authenticated fills, inventory, and strategy maker volume.

Important terminal states include:

- `APPLIED`
- `EXTERNALLY_NEUTRALIZED`
- `CANCELLED_EXTERNALLY`
- `FAILED_TIMEOUT`
- `FAILED_DROPPED`
- `FAILED_DROPPED_LEGACY`
- `REJECTED`
- `SUPERSEDED`

Non-terminal states are recovered as `RECONCILE_ONLY`. The bot must not submit a replacement while a possibly executed mutation is unresolved.

## 9. Startup Cleanup and Reconciliation

### 9.1 Legacy unsubmitted intent cleanup

On orchestrator initialization, legacy cleanup examines historical `PREPARED` intents. An intent is changed to `FAILED_DROPPED_LEGACY` only when the journal proves:

- Status is `PREPARED`.
- No mutation attempt exists.
- No executor outcome exists.

This removes provably unsubmitted legacy rows from startup reconciliation.

The cleanup must not terminalize `SUBMITTING`, `SUBMIT_UNKNOWN`, or any intent with a mutation attempt or executor outcome merely because transaction telemetry is missing. Such an intent might have reached mainnet and therefore remains fail-closed.

### 9.2 Normal authoritative reconciliation

Reconciliation uses authenticated current and historical evidence:

1. Read current BTC/USD open orders for the configured subaccount.
2. Read bounded order history for the relevant time range.
3. Match by exact venue order ID or exact `client_order_id`.
4. Normalize terminal venue states such as cancelled, expired, or rejected.
5. Apply authenticated fills before changing inventory-sensitive lifecycle state.

An externally cancelled order may transition to `CANCELLED_EXTERNALLY`. An authenticated flat neutralization may transition to `EXTERNALLY_NEUTRALIZED` only when checkpoint evidence and timing requirements are satisfied.

Nearest-order and most-recent-order heuristics are unsafe and must not be introduced.

### 9.3 Phantom intent elimination

An old, unconfirmed intent is not automatically dropped after a wall-clock timeout. Authoritative `FAILED_DROPPED` requires all of the following:

- The intent is old enough to pass `DECIBEL_PRODUCTION_MAX_RECONCILIATION_AGE_MS`.
- The journal contains its transaction hash.
- The journal contains its signed transaction expiration timestamp.
- Current open-order lookup finds no matching BTC/USD order.
- Bounded order-history lookup finds no matching terminal order.
- A direct Aptos fullnode check confirms the transaction hash was not committed.
- The fullnode ledger timestamp is strictly later than the signed transaction expiration timestamp.

Only then does the state source return `DROPPED_EXPIRED`, the lifecycle transition to `FAILED_DROPPED`, and the orchestrator release the reconciliation lock. Before ledger expiration, or without required telemetry, the bot remains in `RECONCILE_ONLY`.

This boundary prevents duplicate execution after an ambiguous network or indexer outcome.

## 10. Authenticated BTC Resync and Checkpoints

The resync system attributes BTC fills and verifies inventory conservation against authenticated position truth. Checkpoints are versioned and hash-chained. Existing checkpoints are not overwritten.

When explicitly permitted, conserved and fully settled out-of-band activity at a verified flat position may be checkpointed as reconciled. A non-zero position or incomplete proof retains stricter safeguards and inventory-management behavior.

Silent TUI preflight resync runs with venue mutation, signer, and transaction submission disabled. It may create validated local checkpoint evidence, but it must not place or cancel orders. Runtime state reads and public book reads are separated so a transient authenticated read failure does not corrupt market identity or execution truth.

## 11. Failure Modes and Operator Interpretation

| State or blocker                                 | Meaning and response                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `RECONCILE_ONLY`                                 | A prior mutation requires authenticated resolution. Do not bypass it or delete the journal.                    |
| `PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING` | Normal bounded wait for venue or indexer confirmation.                                                         |
| `PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT` | Indexer confirmation is late; direct verification may run, but trading remains locked until proof exists.      |
| `FAILED_DROPPED`                                 | Fullnode ledger-expiration and transaction non-commit proof established that the intent cannot execute.        |
| `FAILED_DROPPED_LEGACY`                          | The journal proved the old PREPARED intent never reached a mutation attempt.                                   |
| `EXECUTION_MUTATION_BUDGET_BLOCKED`              | Rolling mutation capacity is exhausted. The orchestrator cools down silently until a slot replenishes.         |
| `PRODUCTION_AUTHENTICATED_READ_TRANSIENT`        | Retryable authenticated transport or timing failure. Retain last safe view and pause mutations as appropriate. |
| `PRODUCTION_AUTHENTICATED_READ_REQUIRED`         | Authentication or required authenticated evidence is unavailable. Treat as fatal or paused fail-closed.        |
| `PRODUCTION_LIVE_SOURCE_BOOK_STALE`              | Current market evidence is stale. Pause quoting and retry without using the stale book.                        |
| `PRODUCTION_LIVE_SOURCE_BOOK_FUTURE`             | Book time exceeds permitted clock skew. Do not quote.                                                          |
| `STRATEGY_ACTIVITY_EXCLUSIVITY_LOST`             | Unmanaged active BTC/USD strategy activity exists or cannot be safely attributed.                              |
| `EXECUTION_PREFLIGHT_REJECTED`                   | Intent violates a concrete execution constraint. Inspect the safe rejection code and reason.                   |

Never resolve ambiguity by deleting production state, fabricating order status, selecting a nearest order, or blindly resubmitting.

## 12. Operational History and Stabilization Record

The active production closure incorporates the following resolved classes of issues:

- Node runtime compatibility is enforced for the Decibel SDK TUI path through the Node 22 bridge.
- Authenticated read errors expose safe diagnostics without printing credentials.
- Transient authenticated reads and stale books use bounded retry or pause behavior instead of unsafe quoting.
- BTC market scoping excludes unrelated non-BTC account activity from BTC exclusivity checks.
- Historical out-of-band BTC activity can be attributed through immutable chained checkpoints when conservation requirements pass.
- External cancellation and terminal order-history evidence can neutralize journal state without forcing duplicate placement.
- Tick and lot alignment prevent raw decimal values from reaching Aptos Move ABI integer arguments.
- Transaction sender, subaccount identity, gas controls, and client order ID size are validated before submission.
- Execution telemetry preserves transaction hash and signed expiration for authoritative dropped-transaction proof.
- Re-quote hysteresis and minimum active lifetime reduce place-cancel churn.
- Multi-level smart laddering is capped by collateral, leverage, notional, and inventory constraints.
- Rolling mutation budget replenishment avoids permanent budget lockout and repeated blocker logs.
- Legacy PREPARED rows proven never submitted are terminalized without weakening ambiguous-submission safety.
- Alternate-screen TUI rendering and event formatting expose authenticated quotes, fills, fees, and gas without terminal scroll overflow.

This history describes implemented safeguards, not a claim that every future venue or network condition is resolved. Mainnet operation still requires continuous monitoring, exact authenticated reconciliation, and conservative response to unknown states.

## 13. Code and Documentation Standards

All future changes must follow these repository rules:

- Use only straight single (`'`) and double (`"`) quotes in code and comments.
- Do not use curved quotes.
- Do not use the em-dash character.
- Use English for code, comments, diagnostics, tests, and documentation.
- Class names use lowercase `snake_case`, for example `risk_engine`.
- Instance names use `PascalCase`, for example `MainnetExecutor`.
- Functions and methods begin with a lowercase verb and use `camelCase`, for example `validateOrder`.
- Use strict TypeScript.
- Avoid `any`; isolate and explain it if unavoidable.
- Validate all environment variables and external data.
- Keep market data, strategy, risk, and execution boundaries independent.
- Add or update tests for every behavior change.
- Do not suppress compiler or lint failures.
- Do not commit secrets, generated logs, or local trading databases.
- Do not modify signing or lifecycle semantics as an incidental fix.
- Do not increase leverage or risk limits without explicit approval.

## 14. Required Change Workflow

Before changing production behavior:

1. Work on a focused non-main branch.
2. Inspect the complete intent, executor, journal, and reconciliation path affected by the change.
3. Preserve fail-closed behavior for ambiguous mainnet outcomes.
4. Use mocks and fixtures for tests. Do not run live mutations as validation.
5. Review the complete diff for credentials, unsafe logging, and accidental state files.

Before declaring a task complete, run:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

The focused production commands are:

```powershell
npx tsc -p tsconfig.production.json --noEmit
npm run test:production-core
```

## 15. Current Verification Status

At the time this handover was generated, the active retained production suite reported:

```text
Test files: 8 passed
Tests: 156 passed
TypeScript production typecheck: PASS
Prettier format check: PASS
ESLint: PASS
Production build: PASS
git diff --check: PASS
```

The most recent focused lifecycle and orchestrator validation reported 61 passing tests.

This status reflects local deterministic verification. It is not proof of current venue availability, account funding, open-order state, or live mainnet readiness at a later time. Re-run all checks and authenticated dry-run or reconciliation procedures appropriate to the intended operation before enabling mutations.

## 16. Immediate Resume Checklist

For a developer or AI resuming work:

1. Read this document and `AGENTS.md` completely.
2. Inspect `git status` and preserve all existing operator changes and state files.
3. Confirm the active branch is not `main` before editing.
4. Do not print `.env` or secret-bearing configuration.
5. Identify the exact production entry point and dependency closure involved.
6. Inspect unresolved journal intents before starting any mutation-enabled runtime.
7. Never clear `SUBMITTING` or `SUBMIT_UNKNOWN` state without authenticated proof.
8. Confirm BTC/USD market identity, subaccount identity, network, current book freshness, balance, positions, orders, and fill lineage.
9. Run production core tests and typecheck before runtime work.
10. Start with execution disabled or dry-run unless live mutation is separately and explicitly authorized.

The central production invariant is simple: no new mutation may be submitted while an earlier mutation could still have executed but remains unresolved.
