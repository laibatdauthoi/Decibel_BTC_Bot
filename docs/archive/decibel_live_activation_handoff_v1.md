# Decibel Live Activation Handoff V1

## Purpose and evidence boundary

This document describes the current repository implementation for `DECIBEL_MARKET_MAKER_V1` and isolates what remains before its production executor can perform supported Decibel live `PLACE`/`CANCEL` operations. It is an information-extraction artifact, not an activation procedure.

- Repository milestone: `8691e11249e9b17e40eab927100eb646bbe2885d` (`feat: add production live orchestration runtime`)
- Network: `mainnet`
- Market: `BTC/USD`
- Decibel market address: `0x5e0e16f34adfb4b316f8d532d68acbfa206826feaaa418d3938046bdc2044861`
- Target subaccount: `0x7c9d963218ad7ff98670a3d670aa93a1593b883df56b3d1f7b1d9d1f075c9b8b`
- Installed SDK: `@decibeltrade/sdk@0.7.0`
- Validated runtime: Node `v22.23.2`, Windows `win32`, `x64`
- Evidence sources: current local working tree, installed SDK declarations/source, repository tests/docs, and frozen manifests. GitHub may lag this tree.

No secret value is recorded here. Credential values are represented as `REDACTED / USER-SUPPLIED SECRET`.

## Executive conclusion

The write boundary is not missing. `src/decibel_external_production_executor_v1.ts` already implements `DecibelProductionExecutionExecutorV1`, lazily constructs an Aptos `Account` from an `Ed25519PrivateKey`, constructs SDK `DecibelWriteDex`, and maps exact post-only placement and exact-order cancellation into the lifecycle result contract. `src/run_decibel_production_live_v1.ts` dynamically loads that executor through `createDecibelProductionExecutorV1`.

What is not established by the repository is whether direct owner-private-key construction is Decibel's officially recommended unattended-production authentication model, or whether an API Wallet, delegated/session account, `accountOverride`, or another authorization mechanism should replace it. Secure production secret provisioning is also not implemented: the existing writer consumes `DECIBEL_PRIVATE_KEY` directly from the process environment. The release remains deliberately inactive: frozen V2 evidence says `liveCanaryValidated=false`, `liveMutationEnabled=false`, and `autonomousMainnetTradingEnabled=false`.

## Runtime architecture

```text
npm script decibel:production:live-v1
  -> runDecibelProductionLiveV1 (src/run_decibel_production_live_v1.ts)
  -> decibel_production_live_orchestrator_v1
  -> createDecibelProductionLiveStateSourceV1 (authenticated, read-only)
  -> evaluateAuthenticatedPassiveRecyclingStateV1 (deterministic strategy/safety)
  -> buildPlaceIntentV1 / buildCancelIntentV1
  -> decibel_execution_lifecycle_journal_v1 (durable SQLite state)
  -> decibel_execution_lifecycle_v1 (idempotency/recovery/reconciliation)
  -> decibel_production_execution_v1 release boundary
  -> dynamically loaded createDecibelProductionExecutorV1
  -> decibel_external_production_executor_v1
  -> @decibeltrade/sdk DecibelWriteDex
  -> Aptos Account signer
  -> Decibel/Aptos venue
```

| Layer               | File and exported symbol                                                                                                                                                                                     | Responsibility                                                                                                                                                                                     | Capability and wiring                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| CLI                 | `src/run_decibel_production_live_v1.ts` — `runDecibelProductionLiveV1`                                                                                                                                       | Parses production configuration, loads source/executor, opens journal, runs bounded/continuous polling, handles shutdown.                                                                          | Orchestration only; wired.                                            |
| Orchestrator        | `src/decibel_production_live_orchestrator_v1.ts` — `decibel_production_live_orchestrator_v1`, `DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1`                                                                      | Recovery first, authenticated snapshot, deterministic strategy evaluation, second snapshot/state-hash check, mutation selection, intent construction, dry-run terminalization, lifecycle dispatch. | Mutation-capable only through injected lifecycle/executor; wired.     |
| Live state source   | `src/decibel_production_live_state_source_v1.ts` — `createDecibelProductionLiveStateSourceV1`                                                                                                                | Reads authenticated positions, orders, bounded order/trade history, TWAP/bulk activity, metadata, and current BBO; establishes strategy lineage and a semantic state hash.                         | Read-only; explicitly has no writer/signer dependency; wired default. |
| Strategy            | `src/decibel_authenticated_passive_recycling_orchestrator_v1.ts` — `evaluateAuthenticatedPassiveRecyclingStateV1`                                                                                            | Applies authenticated activity exclusivity and safety gates and returns blocked/hold/place/cancel/replace intent-level state.                                                                      | Pure/read-only decision logic; wired.                                 |
| Strategy components | `src/decibel_passive_volume_recycling_v1.ts`, `src/decibel_quote_engine_v1.ts`, `src/decibel_inventory_controller_v1.ts`, `src/decibel_market_maker_risk_controller_v1.ts`, `src/decibel_volume_cycle_v1.ts` | Deterministic quoting, inventory, risk, and volume-cycle calculations.                                                                                                                             | Pure; wired through strategy.                                         |
| Intent contract     | `src/decibel_execution_intent_v1.ts` — `buildPlaceIntentV1`, `buildCancelIntentV1`                                                                                                                           | Produces canonical, hashed PLACE/CANCEL intents with semantic and mutation identity.                                                                                                               | Pure; wired.                                                          |
| Journal             | `src/decibel_execution_lifecycle_journal_v1.ts` — `decibel_execution_lifecycle_journal_v1`                                                                                                                   | SQLite/WAL journal for intents, attempts, outcomes, reconciliation, blockers, idempotency, and restart recovery.                                                                                   | Local durable writes only; wired.                                     |
| Lifecycle           | `src/decibel_execution_lifecycle_v1.ts` — `decibel_execution_lifecycle_v1`                                                                                                                                   | Preflight, mutation budgets, executor invocation, unknown-outcome quarantine, authenticated reconciliation, and recovery.                                                                          | Mutation-capable through executor; wired.                             |
| Release boundary    | `src/decibel_production_execution_v1.ts` — production execution configuration/loader                                                                                                                         | Enforces production/release/dry-run gates and dynamically loads the plugin factory.                                                                                                                | Mutation-capable when all gates permit; wired.                        |
| Executor contract   | `src/decibel_production_executor_handoff_v1.ts` — `DecibelProductionExecutionExecutorV1`                                                                                                                     | Stable plugin interface and normalized result categories.                                                                                                                                          | Interface; wired.                                                     |
| External executor   | `src/decibel_external_production_executor_v1.ts` — `decibel_external_production_executor_v1`, `createDecibelProductionExecutorV1`                                                                            | Validates exact contract, lazily builds SDK writer, performs one SDK call, maps result/exception without retry.                                                                                    | Mutation-capable; implemented and wired.                              |
| SDK compatibility   | `src/decibel_sdk_runtime_v1.ts` — `loadDecibelSdkRuntimeV1`, `DECIBEL_SDK_REQUIRED_VERSION_V1`                                                                                                               | Pins SDK 0.7.0 and supplies a repository-local Windows ESM compatibility mechanism.                                                                                                                | Loader only; wired into writer creation and preflight.                |

## Production configuration

Defaults do not constitute authorization to activate live execution.

| Environment variable                                    | Required / optional                                  | Consumed by                                | Expected value/type and purpose                                                                       | Safe here?     | Known non-secret value                                                |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| `DECIBEL_NETWORK`                                       | Required by live source/writer                       | state source, external executor            | Literal `mainnet`; rejects other networks in production path                                          | Yes            | `mainnet`                                                             |
| `DECIBEL_SUBACCOUNT_ADDRESS`                            | Required                                             | state source, external executor            | Aptos/Decibel subaccount address used for reads and writes                                            | Yes            | `0x7c9d963218ad7ff98670a3d670aa93a1593b883df56b3d1f7b1d9d1f075c9b8b`  |
| `DECIBEL_NODE_API_KEY`                                  | Optional secret                                      | state source/client and SDK writer options | Node/API credential string                                                                            | Name/type only | `REDACTED / USER-SUPPLIED SECRET`                                     |
| `DECIBEL_PRIVATE_KEY`                                   | Required only when writer connection is first needed | external executor                          | Aptos Ed25519 private key material                                                                    | Name/type only | `REDACTED / USER-SUPPLIED SECRET`                                     |
| `DECIBEL_EXECUTION_MODE`                                | Required for production                              | execution boundary/orchestrator            | Literal `production`                                                                                  | Yes            | `production` for production runtime                                   |
| `DECIBEL_EXECUTION_RELEASE_STAGE`                       | Optional, safe default                               | execution boundary/orchestrator            | `DISABLED`, `CANARY`, or `AUTONOMOUS`; default `DISABLED`                                             | Yes            | Default `DISABLED`                                                    |
| `DECIBEL_EXECUTOR_ENABLED`                              | Optional, safe default                               | execution boundary/orchestrator            | Boolean; default `false`                                                                              | Yes            | Default `false`                                                       |
| `DECIBEL_EXECUTOR_DRY_RUN`                              | Optional                                             | execution boundary/orchestrator            | Boolean; production readiness used `true`                                                             | Yes            | Readiness evidence: `true`                                            |
| `DECIBEL_PRODUCTION_EXECUTOR_MODULE`                    | Optional                                             | CLI/loader                                 | Module path exporting `createDecibelProductionExecutorV1`; default repository plugin where configured | Yes            | Repository plugin is `src/decibel_external_production_executor_v1.ts` |
| `DECIBEL_PRODUCTION_LIVE_SOURCE_MODULE`                 | Optional                                             | CLI                                        | Alternate module path for authenticated state source                                                  | Yes            | Default is built-in real source                                       |
| `DECIBEL_EXECUTION_JOURNAL_PATH`                        | Optional                                             | orchestrator/CLI                           | SQLite lifecycle journal path; defaults under `data`                                                  | Yes            | Default `data/decibel_execution_v1.sqlite`                            |
| `DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH`               | Required for autonomous gate                         | execution boundary/orchestrator            | Hash of reconciled canary evidence                                                                    | Yes            | Not frozen here                                                       |
| `DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH`                 | Required for autonomous gate                         | execution boundary/orchestrator            | Required/reference canary hash; must equal reconciled hash                                            | Yes            | Not frozen here                                                       |
| `DECIBEL_PRODUCTION_LIVE_SESSION_ID`                    | Optional                                             | state source                               | Stable runtime session identifier                                                                     | Yes            | Generated/defaulted by runtime                                        |
| `DECIBEL_PRODUCTION_LIVE_STRATEGY_CONFIG_ID`            | Optional                                             | state source                               | Strategy configuration identity                                                                       | Yes            | Repository default                                                    |
| `DECIBEL_PRODUCTION_LIVE_MAX_BBO_AGE_MS`                | Optional                                             | state source                               | Positive integer; maximum authenticated BBO age, default `5000`                                       | Yes            | `5000` default                                                        |
| `DECIBEL_PRODUCTION_LIVE_MIN_NOTIONAL_USD`              | Optional                                             | state source                               | Positive number; default `0.01`                                                                       | Yes            | `0.01` default                                                        |
| `DECIBEL_PRODUCTION_LIVE_MAX_NOTIONAL_USD`              | Optional                                             | state source                               | Positive number; default `100`                                                                        | Yes            | `100` default                                                         |
| `DECIBEL_PASSIVE_RECYCLING_TARGET_VOLUME_USD`           | Optional                                             | state source/strategy                      | Positive target maker-volume amount                                                                   | Yes            | No value asserted                                                     |
| `DECIBEL_PRODUCTION_LIVE_POLL_INTERVAL_MS`              | Optional                                             | orchestrator                               | Positive integer; default `5000`                                                                      | Yes            | `5000` default                                                        |
| `DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS`               | Optional                                             | orchestrator                               | Positive integer; default `10000`                                                                     | Yes            | `10000` default                                                       |
| `DECIBEL_PRODUCTION_LIVE_MAX_CONSECUTIVE_READ_FAILURES` | Optional                                             | orchestrator                               | Positive integer; default `3`                                                                         | Yes            | `3` default                                                           |
| `DECIBEL_PRODUCTION_LIVE_SHUTDOWN_TIMEOUT_MS`           | Optional                                             | orchestrator                               | Positive integer; default `15000`                                                                     | Yes            | `15000` default                                                       |
| `DECIBEL_PRODUCTION_LIVE_MAX_CYCLES`                    | Optional                                             | orchestrator                               | Positive bounded-cycle count; omitted permits normal runner loop                                      | Yes            | No value asserted                                                     |

## External production executor contract

The plugin factory is:

```ts
createDecibelProductionExecutorV1(): DecibelProductionExecutionExecutorV1
```

The implemented interface has two methods:

```ts
placePostOnlyLimit(intent: place_intent_v1): Promise<production_execution_result_v1>
cancelExactOrder(intent: cancel_intent_v1): Promise<production_execution_result_v1>
```

### PLACE

The canonical `place_intent_v1` includes intent/mutation/client-order identity, exact subaccount and BTC/USD market identities, `side`, `price`, `quantity`, integer `priceTicks`/`quantityLots`, `type: 'LIMIT'`, `postOnly: true`, `selfTradePermitted: false`, and `externalCounterpartyRequired: true`. The executor revalidates this contract, then calls SDK `placeOrder` once with:

- `marketName: 'BTC-USD'`
- `price`, `size`, and `isBuy`
- `timeInForce: 1` (SDK `TimeInForce.PostOnly` numeric representation)
- `isReduceOnly: false`
- canonical `clientOrderId`
- exact `subaccountAddr`

Successful SDK response requires both `success` and `orderId`, producing `PLACE_ACKNOWLEDGED` with the venue order ID. A venue rejection produces `PLACE_REJECTED`. Connection errors, thrown transport errors, or ambiguous/missing acknowledgement identity produce `PLACE_OUTCOME_UNKNOWN`. The executor does not retry.

### CANCEL

The canonical `cancel_intent_v1` carries `expectedPreviousVenueOrderId`. The executor refuses a missing or mismatched identity and calls SDK `cancelOrder` once with exactly that `orderId`, the exact BTC market address, and exact subaccount address. It has no cancel-all, nearest-order, or most-recent-order fallback. Completion maps to `CANCEL_CONFIRMED`; a contract rejection maps to `CANCEL_REJECTED`; thrown/ambiguous transport outcome maps to `CANCEL_OUTCOME_UNKNOWN`. It does not retry.

### Result categories and lifecycle ownership

`production_execution_result_v1` supports:

- `PLACE_ACKNOWLEDGED`, `PLACE_REJECTED`, `PLACE_OUTCOME_UNKNOWN`
- `CANCEL_CONFIRMED`, `CANCEL_REJECTED`, `CANCEL_OUTCOME_UNKNOWN`
- optional `venueOrderId` where applicable

The lifecycle, not the plugin, owns attempt counting, mutation budgets, journal transitions, timeout/unknown quarantine, and authenticated reconciliation. Unknown submission outcomes remain `SUBMIT_UNKNOWN`; they are not blindly resubmitted. Tests inject a writer factory to prove a single transport invocation and exact field preservation. The real writer is initialized lazily, so module import, factory construction, and dry-run do not load signing material or mutate the venue.

## Existing Decibel write and signing implementation

| File                                             | Symbol                                     | What it does                                                                                                    | Used by production executor? | Mode                                    | Dependencies                                    | Authentication/signer inputs                                                         |
| ------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/decibel_external_production_executor_v1.ts` | `createWriteClient` (internal)             | Dynamically imports Aptos account classes and the compatible SDK runtime; creates signer and `DecibelWriteDex`. | Yes                          | Mutation-capable                        | `@aptos-labs/ts-sdk`, `loadDecibelSdkRuntimeV1` | `DECIBEL_PRIVATE_KEY`, optional `DECIBEL_NODE_API_KEY`, `DECIBEL_SUBACCOUNT_ADDRESS` |
| `src/decibel_external_production_executor_v1.ts` | `decibel_external_production_executor_v1`  | Calls `placeOrder` and `cancelOrder`; exact validation, single attempt, ambiguous outcome mapping.              | Yes                          | Mutation-capable                        | `DecibelWriteDex` through injected/lazy writer  | Exact intents and configured subaccount                                              |
| `src/decibel_external_production_executor_v1.ts` | `createDecibelProductionExecutorV1`        | Export expected by the dynamic production loader.                                                               | Yes                          | Mutation-capable when called past gates | Above writer factory                            | Process environment is consumed lazily                                               |
| `src/decibel_sdk_runtime_v1.ts`                  | `loadDecibelSdkRuntimeV1`                  | Loads pinned SDK and returns `DecibelWriteDex` and `MAINNET_CONFIG` after compatibility/version checks.         | Yes                          | No mutation by itself                   | `@decibeltrade/sdk@0.7.0`                       | None                                                                                 |
| `src/decibel_production_live_state_source_v1.ts` | `createDecibelProductionLiveStateSourceV1` | Constructs read clients only; source tests assert absence of writer/signer/mutation dependencies.               | Indirectly, before execution | Read-only                               | Decibel read SDK/client                         | Node/API key if configured, subaccount                                               |

The current signer construction is exact repository code:

```text
Ed25519 private key -> Aptos Ed25519PrivateKey -> Account.fromPrivateKey -> Account
Account + MAINNET_CONFIG + optional nodeApiKey -> DecibelWriteDex
```

No separate repository abstraction for a hardware signer, custody signer, API Wallet, delegated wallet, session key, or external secret provider was found in this production path. No `accountOverride` is supplied by the executor. That is not proof those mechanisms are unnecessary; their official role is **UNKNOWN / NEEDS DECIBEL CONFIRMATION**.

## Installed SDK 0.7.0 write surface

The locally installed SDK exposes these relevant public symbols/contracts:

- `DecibelWriteDex extends BaseSDK`
- constructor: `new DecibelWriteDex(config: DecibelConfig, account: Account, opts?: Options)`
- `Options` includes `nodeApiKey?`, `skipSimulate?`, `gasPriceManager?`, and `timeDeltaMs?`
- `MAINNET_CONFIG` supplies the network configuration used by this repository
- `TimeInForce.GoodTillCanceled = 0`, `TimeInForce.PostOnly = 1`, `TimeInForce.ImmediateOrCancel = 2`
- `placeOrder(...)` accepts `marketName`, `price`, `size`, `isBuy`, `timeInForce`, `isReduceOnly`, optional `clientOrderId`, optional stop/TP/SL/builder fields, optional `subaccountAddr`, optional `accountOverride?: Account`, and optional `tickSize`; it returns `Promise<PlaceOrderResult>`
- `cancelOrder(...)` accepts `orderId`, market identity (`marketName` or `marketAddr`), optional `subaccountAddr`, and optional `accountOverride?: Account`; it returns a committed transaction response
- `BaseSDK` contains transaction build/submit machinery and a protected sender accepting an optional account override

The SDK declarations establish that an Aptos `Account` is accepted. They do not, from the inspected package surface, establish how a production API Wallet/delegated signer should be provisioned or authorized for this subaccount. That is **NEEDS DECIBEL DOCUMENTATION CONFIRMATION**.

## Authentication versus signing

| Capability                           | Current implementation                                         | Required credential/object                                                    | Source of truth                                  | Wired today?                                                       |
| ------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Public/current market reads          | Decibel read client in production state source                 | Network/client configuration; node API key if service requires it             | state source and SDK/client                      | Yes                                                                |
| Authenticated account/position reads | Existing authenticated Decibel client/state-source path        | Subaccount identity plus read/API authentication context                      | `src/decibel_production_live_state_source_v1.ts` | Yes; mainnet reads have repository evidence                        |
| Open-order reads                     | Same state source                                              | Same read authentication and subaccount                                       | state source                                     | Yes                                                                |
| Fill/order-history reads             | Bounded authenticated history reads                            | Same read authentication and subaccount                                       | state source                                     | Yes                                                                |
| PLACE                                | `DecibelWriteDex.placeOrder` wrapper                           | SDK writer plus Aptos `Account`; official recommended signer model unresolved | external executor and SDK                        | Yes technically; release-disabled                                  |
| CANCEL                               | `DecibelWriteDex.cancelOrder` wrapper                          | Same writer/account and exact venue order ID                                  | external executor and SDK                        | Yes technically; release-disabled                                  |
| Transaction signing                  | `Account.fromPrivateKey` signer passed to writer               | `DECIBEL_PRIVATE_KEY` Ed25519 material                                        | external executor                                | Yes technically; secure/official deployment model unresolved       |
| Transaction submission               | SDK writer/BaseSDK                                             | Signed transaction and configured mainnet transport                           | installed SDK                                    | Yes behind executor/release gates; not live-validated by V2 freeze |
| Subaccount targeting                 | Exact `subaccountAddr` on place/cancel and authenticated reads | `DECIBEL_SUBACCOUNT_ADDRESS`                                                  | state source/external executor                   | Yes                                                                |
| API/node access                      | Optional `nodeApiKey` SDK option                               | `DECIBEL_NODE_API_KEY`                                                        | SDK `Options`, repository code                   | Yes, optional; not transaction signing                             |
| API Wallet/delegation                | No production-path implementation found                        | UNKNOWN                                                                       | Decibel documentation/support                    | Unknown                                                            |
| `accountOverride`                    | SDK supports optional `Account`; executor does not use it      | Possibly session/delegated account; purpose not fully established locally     | installed SDK declarations                       | No                                                                 |

An API/node token and a transaction-signing account are separate credential classes in the current code. They must not be treated as interchangeable.

## Safety and execution invariants

| Invariant                                                                      | Enforcement source                                                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Exact BTC/USD and exact Decibel market address                                 | state source, intent validation, external executor                                         |
| Exact configured subaccount                                                    | state source and external executor                                                         |
| `LIMIT` only and `PostOnly` only                                               | intent builder/preflight and external executor (`timeInForce: 1`)                          |
| `selfTradePermitted=false`; `externalCounterpartyRequired=true`                | intent schema/preflight/executor validation                                                |
| Positive finite price/quantity/notional                                        | intent and lifecycle preflight                                                             |
| Integer/consistent price ticks and quantity lots                               | intent/lifecycle preflight                                                                 |
| Exact venue-order identity cancellation                                        | cancel intent, lifecycle, external executor                                                |
| Stable client order ID on placement                                            | intent builder and external executor mapping                                               |
| Duplicate/mutation-key suppression                                             | journal uniqueness and lifecycle                                                           |
| One known live strategy order                                                  | lifecycle/preflight and strategy/orchestrator                                              |
| Unknown outcome becomes `SUBMIT_UNKNOWN`                                       | external executor result mapping and lifecycle                                             |
| Reconciliation-first restart/recovery; no blind retry                          | lifecycle `recover`/reconciliation and journal nonterminal states                          |
| State re-read and semantic hash equality immediately before intent             | live orchestrator; mismatch blocks `EXECUTION_STATE_CHANGED_BEFORE_INTENT`                 |
| Authenticated state freshness and activity exclusivity                         | live state source and recycling orchestrator                                               |
| Release defaults disabled                                                      | production execution config                                                                |
| CANARY permits at most its bounded mutation budget then halts                  | production executor handoff/release gate                                                   |
| AUTONOMOUS requires nonempty required/reconciled canary hashes that match      | production execution/orchestrator gate                                                     |
| Dry-run invokes no writer and safely terminalizes dry-run-only `PREPARED` rows | orchestrator and journal `supersedeDryRunOnlyPrepared`                                     |
| `BEHIND_5_TICKS` replacement policy                                            | production live orchestrator; replace only at the configured maker-safe distance condition |
| No blind retry after transport ambiguity                                       | executor and lifecycle                                                                     |

## Current verified repository state

Repository source/tests/manifests support the following statements:

- A real authenticated mainnet read source exists and is the default production-live source.
- Focused state-source tests cover flat BTC/USD state, positions/orders/activity, strategy fill attribution, exclusion of frozen historical activity before the authoritative handoff boundary, bounded history reads, stale data, restart reconciliation, and the absence of writer/signer dependencies.
- Focused orchestrator tests cover disabled defaults, zero-call dry-run intent preparation, three consecutive dry-run cycles, same-journal restart, stale/state-change fail-closed behavior, semantic hold, `SUBMIT_UNKNOWN` recovery without resubmission, autonomous canary-hash gating, and bounded loop shutdown.
- Dry-run-only `PREPARED` intents are terminalized as `SUPERSEDED` without a mutation attempt; real nonterminal states retain reconciliation-first semantics.
- `EXECUTION_STATE_CHANGED_BEFORE_INTENT` is a deliberate transient fail-safe caused by the second authenticated state check, not permission to bypass revalidation.
- Frozen runtime-readiness V2 evidence records Node `v22.23.2`, SDK `0.7.0`, preflight `PASS`, production result `DRY_RUN_PREPARED`, and zero mutation invocations, venue mutations, and signed transactions.

The V2 freeze does **not** prove live writer operation. It explicitly records `realPlaceValidated=false`, `realCancelValidated=false`, `liveCanaryValidated=false`, `liveMutationEnabled=false`, and `autonomousMainnetTradingEnabled=false`.

## Canary and readiness evidence

Relevant immutable/frozen artifacts found:

- `research/decibel_authenticated_live_canary_success_v1_manifest.json`
- `research/decibel_mcp_mainnet_shadow_readiness_v1_manifest.json`
- `research/decibel_mainnet_execution_lifecycle_shadow_v1_manifest.json`
- `research/decibel_production_executor_handoff_v1_manifest.json`
- `research/decibel_production_executor_runtime_readiness_v1_manifest.json`
- `research/decibel_production_executor_runtime_readiness_v2_manifest.json`

V2 chains to the V1 file SHA-256 and V1 body hash and preserves the V1 artifact. It also chains upstream production-handoff and lifecycle-shadow body hashes. Its release state is authoritative for the frozen production-executor runtime claim: the next stage is `CANARY`, but live canary validation and mutations remain false.

The runtime reads `DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH` and `DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH`. `AUTONOMOUS` is rejected unless both are present and identical. `CANARY` is separately mutation-budgeted. Existing historical canary artifacts are evidence, but the repository does not automatically infer the runtime environment hashes from merely finding a manifest. The operator/integration must supply the exact evidence expected by the gate through a separately controlled release process. No activation value is prescribed here.

## What is still missing for live execution

### A. Already implemented

- Authenticated read-only live state, bounded history, exact market/subaccount validation, semantic state hashing, and fail-closed activity exclusivity.
- Deterministic passive-recycling strategy, quote/inventory/risk/volume logic.
- Canonical PLACE/CANCEL intents and stable client/mutation identities.
- Durable journal, mutation budgets, duplicate suppression, `SUBMIT_UNKNOWN`, and reconciliation-first recovery.
- Dynamic production plugin boundary and a concrete `DecibelProductionExecutionExecutorV1` implementation.
- SDK 0.7.0 compatibility loader, `DecibelWriteDex` construction, Aptos `Account` construction, post-only placement, and exact cancellation mapping.

### B. Implemented but not activated

- Mutation-capable writer/executor: lazily connected and release-gated.
- Production execution mode: defaults to disabled; dry-run evidence only in V2.
- CANARY/AUTONOMOUS transitions: code exists, but V2 says canary validation and live mutation are false.
- Transaction submission capability inside the SDK: reachable only after all gates and credential initialization; not proven by V2 live evidence.

### C. Missing implementation

- A production-grade secret/signer provider boundary. Current `createWriteClient` reads raw `DECIBEL_PRIVATE_KEY` from process environment and directly constructs an account.
- If Decibel requires an API Wallet, delegated/session signer, or custody signer, its provisioning/authorization adapter is absent.
- If official deployment requires rotation, revocation, custody, or signer-health semantics beyond an Aptos `Account`, those abstractions are absent.

Expected consumption boundary is the lazy writer factory in `src/decibel_external_production_executor_v1.ts`; it must continue returning a client compatible with `DecibelProductionWriteClientV1` without weakening the lifecycle or release gates. The installed SDK's discoverable signer type is `Account`, with optional per-call `accountOverride?: Account`.

### D. Needs external Decibel information

- Official SDK 0.7.0 signer/authentication model for unattended mainnet production.
- Whether direct owner-key `Account` is supported/recommended or an API Wallet/delegated account is required.
- How such a signer is authorized for the configured subaccount and whether `accountOverride` is required.
- Whether `nodeApiKey` is solely API transport authentication and what scopes it needs.
- Official transaction acknowledgement/finality semantics needed to refine `ACKNOWLEDGED` versus `OUTCOME_UNKNOWN` without weakening conservative mapping.
- Official client-order-ID uniqueness/recovery expectations and cancel response guarantees.

### E. User-supplied secret/credential required

- A transaction signer credential/object from an approved secure provider. The current environment variable name is `DECIBEL_PRIVATE_KEY`; its value must never enter source, tests, logs, or this handoff.
- A Decibel/node API credential if required by the selected endpoint/provider. The current optional variable is `DECIBEL_NODE_API_KEY`.

No instructions for enabling these values or executing a live transaction are provided here.

## Unresolved questions for the next AI

1. What officially supported Decibel SDK 0.7.0 signer type and custody pattern should unattended mainnet execution use?
2. Is a Decibel API Wallet or delegated/session account required or recommended instead of the direct Aptos owner `Account` currently constructed?
3. How is that signer authorized for subaccount `0x7c9d963218ad7ff98670a3d670aa93a1593b883df56b3d1f7b1d9d1f075c9b8b`, and is SDK `accountOverride` required?
4. What is the exact separation and required scope between `DECIBEL_NODE_API_KEY` transport/read authentication and transaction-signing authority?
5. What secure secret-manager/custody interface should replace direct process-environment private-key ingestion while remaining compatible with the SDK `Account` contract?
6. Which SDK/chain result is sufficient for `PLACE_ACKNOWLEDGED` or `CANCEL_CONFIRMED`, and which transport/finality states must remain `*_OUTCOME_UNKNOWN` pending authenticated reconciliation?
7. What are Decibel's official `clientOrderId` uniqueness, retention, and recovery guarantees across process restarts?
8. Which exact reconciled canary evidence hash should be bound as both required and reconciled evidence for the next controlled release, given V2 still states `liveCanaryValidated=false`?

## Secret-hygiene declaration

This handoff contains public addresses, source symbols, configuration variable names, and public contract shapes only. It contains no private key, mnemonic, token, cookie, authentication header, `.env` content, or secret value.
