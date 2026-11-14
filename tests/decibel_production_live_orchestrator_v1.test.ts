import {
  assessDecibelProtectiveRecoveryV1,
  assertDecibelExposureRecoveryCompleteV1,
  assertDecibelRecoveryIntentV1,
  getDecibelVerifiedCurrentPlaceOwnerV1,
} from '../src/decibel_protective_recovery_admission_v1.js';
import { createDecibelMarketStructureV1 } from '../src/decibel_market_structure_v1.js';
import { makeDecibelActivityBaselineFixtureV1 } from './fixtures/decibel_activity_baseline_fixture_v1.js';
import {
  assessDecibelEntryPhaseEconomicsV1,
  assessDecibelRestingEntryEconomicsV1,
  assessDecibelEntryReplacementEconomicsV1,
  calculateDecibelLifecycleCostBpsV1,
} from '../src/decibel_smart_ladder_v1.js';
import {
  constructDecibelProfitableTPPriceV1,
  constructDecibelAdaptiveTPPriceV1,
  assessDecibelAdaptiveTPV1,
  planDecibelPatientTPV1,
  getDecibelBreakEvenTPPriceV1,
  getDecibelTPPositionKeyV1,
} from '../src/decibel_exit_economics_v1.js';
import { deriveDecibelExitCoverageWorkflowV1 } from '../src/decibel_exit_coverage_workflow_v1.js';
import {
  getDecibelRestingCoveragePriceV1,
  assessDecibelTPActionV1,
} from '../src/decibel_order_action_v1.js';
import { resolveDecibelAuthoritativeOrderEvidenceV1 } from '../src/decibel_authoritative_order_reconciliation_v1.js';
import {
  decibel_external_production_executor_v1,
  type DecibelProductionWriteClientV1,
} from '../src/decibel_external_production_executor_v1.js';
import { validateDecibelFinalMakerAdmissionV1 } from '../src/decibel_final_maker_admission_v1.js';
import { getDecibelPositionReductionNotionalLimitV1 } from '../src/decibel_session_capacity_projection_v1.js';
import { buildDecibelCandidateAdverseSelectionEvidenceV1 } from '../src/decibel_candidate_adverse_evidence_v1.js';
import { readDecibelSessionCapacityProjectionV1 } from '../src/decibel_session_capacity_projection_v1.js';
import { assembleDecibelCapacityCertificateV1 } from '../src/decibel_capacity_producers_v1.js';
import {
  finalizeDecibelVerifiedSessionV1,
  convergeDecibelStartupRecoveryV1,
  assertDecibelSessionMutationOwnerV1,
} from '../src/run_decibel_production_web_v1.js';
import { decibel_runtime_supervisor_v1 } from '../src/decibel_runtime_supervisor_v1.js';
import { decibel_raw_ws_bbo_store_v1 } from '../src/decibel_adverse_selection_evidence_v1.js';
import {
  normalizeDecibelTerminalOrderEvidenceV1,
  normalizeDecibelAuthenticatedOpenOrdersV1,
} from '../src/decibel_production_live_state_source_v1.js';
import { synchronizeDecibelSessionAccountingV1 } from '../src/decibel_session_accounting_v1.js';
import { decibel_production_session_controller_v1 } from '../src/decibel_production_session_controller_v1.js';
import { decibel_production_session_store_v1 } from '../src/decibel_production_session_v1.js';
import {
  decibel_operator_settings_store_v1,
  deriveDecibelSessionTradingLimitsV1,
} from '../src/decibel_operator_settings_v1.js';
import {
  evaluateTradingDecision,
  DECIBEL_EVIDENCE_FAILURE_STOP_AFTER_MS_V1,
} from '../src/decibel_trading_decision_v1.js';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateDecibelEntrySizeV1 } from '../src/decibel_entry_size_v1.js';
import {
  getDecibelEntryReplacementBandBpsV1,
  getDecibelReentryPriceLimitV1,
  getDecibelTPTargetNetBpsV1,
} from '../src/decibel_volatility_targets_v1.js';

import {
  applyDecibelActualFillTruthV1,
  createDecibelActualFillLedgerV1,
} from '../src/decibel_actual_fill_truth_v1.js';
import {
  buildDecibelExecutionIntentV1,
  validateDecibelPlaceIntentV1,
  type execution_intent_v1,
} from '../src/decibel_execution_intent_v1.js';
import {
  calculateDecibelExitCoverageV1,
  evaluateDecibelAuthenticatedPassiveRecyclingV1,
  type decibel_recycling_action_v1,
} from '../src/decibel_authenticated_passive_recycling_orchestrator_v1.js';
import { decibel_execution_lifecycle_journal_v1 } from '../src/decibel_execution_lifecycle_journal_v1.js';
import {
  assertDecibelHTTPReadAllowedV1,
  enterDecibelHTTPReadBackoffV1,
  getDecibelHTTPReadBackoffUntilV1,
  resetDecibelHTTPReadBackoffForTestV1,
} from '../src/decibel_http_read_backoff_v1.js';
import { DECIBEL_BTC_USD_MARKET_ADDRESS_V1 } from '../src/decibel_btc_market_v1.js';
import {
  decibel_production_live_orchestrator_v1,
  assertDecibelProductionControlLivenessV1,
  buildDecibelCanonicalOrderKeyV1,
  classifyDecibelCancelV1,
  evaluateDecibelReplacementDecisionV1,
  isDecibelTPCoverageSeverelyUndersizedV1,
  isTransientDecibelAuthenticatedReadErrorV1,
  evaluateDecibelTPPriceSuitabilityV1,
  assessDecibelExitEconomicsV1,
  coordinateDecibelInventoryExitV1,
  findDecibelInventoryCrossingOpenOrderV1,
  isDecibelHttpRateLimitErrorV1,
  parseDecibelProductionLiveConfigurationV1,
  runDecibelProductionLiveLoopV1,
  selectDecibelInventoryCrossingSafetyCancelV1,
  type DecibelProductionLiveStateSourceV1,
  type decibel_market_regime_bootstrap_v1,
  type decibel_production_live_snapshot_v1,
} from '../src/decibel_production_live_orchestrator_v1.js';
import { wrapDecibelProductionLiveStateSourceV1 } from '../src/decibel_production_live_state_source_adapter_v1.js';
import type { DecibelProductionExecutionExecutorV1 } from '../src/decibel_production_executor_handoff_v1.js';
import { selectNewestDecibelRuntimeSnapshotV1 } from '../src/decibel_runtime_snapshot_owner_v1.js';
import { classifyDecibelOperationalMarketRegimeV1 } from '../src/decibel_market_regime_v1.js';
import {
  isDecibelTransactionExpirationProvenV1,
  aggregateDecibelTradeHistoryFragmentsV1,
  createDecibelTransactionEvidenceReaderV1,
  decibel_production_live_state_source_v1,
  getDecibelAuthoritativeAvailableMarginUsdV1,
  loadDecibelProductionEconomicEvidenceV1,
  normalizeDecibelProductionBookTimestampV1,
  readDecibelPaginatedHistoryV1,
  resolveDecibelProductionLiveSourceEnvironmentV1,
  resolveDecibelRecentOrderEvidenceV1,
  resolveDecibelAuthenticatedFlatCheckpointNeutralizationV1,
  validateDecibelProductionEconomicEvidenceV1,
  type DecibelProductionLiveAuthenticatedReaderV1,
} from '../src/decibel_production_live_state_source_v1.js';
import { execution_preflight_rejection_v1 } from '../src/decibel_execution_intent_v1.js';
import { calculateDecibelRealizedPnlWindowsV1 } from '../src/decibel_pnl_tracker_v1.js';
import {
  bootstrapDecibelProductionEconomicEvidenceV1,
  inspectDecibelAdverseEvidenceReadinessV1,
  resolveDecibelProductionEconomicColdStartV1,
  getDecibelProductionEconomicRefreshDelayV1,
  getDecibelProductionEconomicPostSuccessDelayV1,
  readDecibelProductionEconomicComponentStatesV1,
  readDecibelProductionEconomicLkgReadinessV1,
  hydrateDecibelProductionEconomicEvidenceV1,
  refreshDecibelProductionEconomicEvidenceV1,
} from '../src/decibel_production_economic_refresh_v1.js';
import {
  buildDecibelCandidateAdverseSelectionEvidenceV1,
  loadFreshDecibelJournalBboObservationsV1,
} from '../src/run_decibel_production_economic_viability_v1.js';
import {
  deriveAuthenticatedMakerFeeEvidenceV1,
  loadLastKnownGoodEconomicInputsV1,
  resolveAptUsdEvidenceChainV1,
  resolveCoinbaseAptUsdEvidenceV1,
  resolveCoinGeckoAptUsdEvidenceV1,
  resolveAptUsdFromAllMarketPricesV1,
  resolveDecibelHistoricalGasEvidenceV1,
} from '../src/run_decibel_production_economic_inputs_audit_v1.js';

// Hypothetical venue contract for strategy-only tests. Production has no such
// evidence producer; these fixtures must never imply verified Decibel support.
/** Volatility TP target net (USD) used when constructing a new TP. */
function tpTargetNetUsd(snapshot: decibel_production_live_snapshot_v1, quantity: number): number {
  const book = snapshot.input.book;
  return (
    (quantity *
      ((book.bestBid + book.bestAsk) / 2) *
      getDecibelTPTargetNetBpsV1(snapshot.priceRangeBps)) /
    10000
  );
}

function buildFakeReductionRules(input: decibel_production_live_snapshot_v1['input']) {
  return {
    market: input.market,
    source: 'FAKE_VENUE_CONTRACT_ONLY',
    observedAt: input.now,
    validUntil: input.now + 10000,
    multipleOrders: true,
    enforcesReduceOnlyOnEveryFill: true,
    maximumOrders: 4,
    minimumSize: input.metadata.minimumSize,
    minimumNotionalUsd: 0,
  };
}

const makeSnapshot = (overrides: Partial<decibel_production_live_snapshot_v1> = {}) => {
  const now = 1_000;
  const input = {
    sessionId: 'session',
    strategyConfigId: 'DECIBEL_MARKET_MAKER_V1_PASSIVE_VOLUME_RECYCLING_V1',
    configuredSubaccount: 'subaccount',
    authenticatedSubaccount: 'subaccount',
    configuredNetwork: 'mainnet' as const,
    observedNetwork: 'mainnet',
    now,
    market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
    metadata: {
      marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      symbol: 'BTC/USD',
      tickSize: 0.1,
      lotSize: 0.001,
      minimumSize: 0.001,
      mode: 'Open',
      observedAt: now,
    },
    book: { bestBid: 100, bestAsk: 100.2, observedAt: now },
    maxBboAgeMs: 5_000,
    actualInventoryBase: 0,
    inventoryDirectionProven: true,
    openOrders: [],
    activeTwapCount: 0,
    activeTpSlCount: 0,
    activeBulkOrderCount: 0,
    manualOrDelegatedActivityCount: 0,
    unresolvedExecutionPlanCount: 0,
    persistenceAvailable: true,
    targetExternalMakerVolumeUsd: null,
    actualFillLedger: createDecibelActualFillLedgerV1([]),
  };
  return {
    input,
    sourceStateHash: 'state-1',
    minimumNotionalUsd: 0.01,
    maximumNotionalUsd: 1,
    availableMarginUsd: 1,
    maximumEffectiveLeverage: 1,
    economicInputs: {
      makerFeeBps: 0,
      makerFeeSource: 'CONFIG',
      estimatedGasCostUsd: 0,
      estimatedGasCostSource: 'CONFIG',
      adverseSelectionBufferBps: 0,
      adverseSelectionSource: 'CONFIG',
      safetyMarginBps: 0,
    },
    ...overrides,
  } satisfies decibel_production_live_snapshot_v1;
};

afterEach(() => resetDecibelHTTPReadBackoffForTestV1());

function withEntryReviewEvidence(
  snapshot: decibel_production_live_snapshot_v1,
  action: Parameters<typeof evaluateDecibelReplacementDecisionV1>[0],
): decibel_production_live_snapshot_v1 {
  if (!action.current || !action.desired) throw new Error('TEST_ENTRY_REQUIRED');
  const midpoint = (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2;
  return {
    ...snapshot,
    input: { ...snapshot.input, openOrders: [{ ...action.current, reduceOnly: false }] },
    economicInputs: {
      ...snapshot.economicInputs!,
      candidateAdverseSelection: [action.current, action.desired].map((order, index) => ({
        side: order.side,
        distanceBps: (Math.abs(order.price - midpoint) / midpoint) * 10000,
        p95AdverseSelectionBps:
          index === 0
            ? (Math.abs(action.desired!.price - action.current!.price) / midpoint) * 20000
            : 0,
        sampleCount: 30,
        observedAt: snapshot.input.now,
      })),
    },
  };
}

function make(input?: {
  readSnapshot?: () => decibel_production_live_snapshot_v1;
  supportUnwindIOC?: boolean;
  reconcileIntent?: DecibelProductionLiveStateSourceV1['reconcileIntent'];
  executor?: DecibelProductionExecutionExecutorV1;
  validateSubmission?: DecibelProductionLiveStateSourceV1['validateSubmission'];
  environment?: NodeJS.ProcessEnv;
  snapshots?: decibel_production_live_snapshot_v1[];
  placeOutcome?: 'PLACE_ACKNOWLEDGED' | 'PLACE_OUTCOME_UNKNOWN';
  cancelOutcome?: 'CANCEL_CONFIRMED' | 'CANCEL_OUTCOME_UNKNOWN';
  journalPath?: string;
  postMutationRead?: boolean;
  readFailuresAt?: ReadonlyMap<number, Error>;
  reconciliationState?: 'ORDER_OPEN' | 'PARTIAL_FILL' | 'FULL_FILL' | 'ORDER_CANCELLED';
  authenticatedPositions?: number[];
  authenticatedPositionError?: Error;
  reconciliationError?: Error;
  reconciliationResults?: Array<
    'ORDER_OPEN' | 'PARTIAL_FILL' | 'FULL_FILL' | 'ORDER_CANCELLED' | Error
  >;
  timeoutVerification?: 'ORDER_OPEN' | 'INTENT_FAILED_TIMEOUT' | 'DROPPED_EXPIRED' | 'UNRESOLVED';
  directOpenOrder?: decibel_production_live_snapshot_v1['input']['openOrders'][number];
  cancelTargetState?:
    'ORDER_OPEN' | 'FULL_FILL' | 'ORDER_CANCELLED' | 'CANCELLED_EXTERNALLY' | 'UNRESOLVED';
  regimeBootstrap?: decibel_market_regime_bootstrap_v1;
  exchangeCandles?: () => readonly import('../src/decibel_exchange_candles_v1.js').decibel_exchange_candle_v1[];
}) {
  const journal = new decibel_execution_lifecycle_journal_v1(
    input?.journalPath ?? join(mkdtempSync(join(tmpdir(), 'decibel-live-')), 'journal.sqlite'),
  );
  const snapshots = [...(input?.snapshots ?? [makeSnapshot(), makeSnapshot()])];
  let decisionNow = snapshots[0]?.input.now ?? 1000;
  let reads = 0;
  let calls = 0;
  let positionReads = 0;
  let postMutationReads = 0;
  let reconciliations = 0;
  const reconciledIntentIds: string[] = [];
  const submitted: Array<{ action: 'PLACE' | 'CANCEL'; side: 'BUY' | 'SELL' }> = [];
  const source: DecibelProductionLiveStateSourceV1 = {
    ...(input?.validateSubmission ? { validateSubmission: input.validateSubmission } : {}),
    ...(input?.exchangeCandles
      ? { readExchangeCandles1m: () => Promise.resolve(input.exchangeCandles!()) }
      : {}),
    readAuthenticatedSnapshot: () => {
      reads += 1;
      const failure = input?.readFailuresAt?.get(reads);
      if (failure !== undefined) return Promise.reject(failure);
      const snapshot = input?.readSnapshot?.() ?? snapshots.shift();
      if (snapshot === undefined) throw new Error('NO_SNAPSHOT');
      decisionNow = snapshot.input.now;
      return Promise.resolve(snapshot);
    },
    ...(input?.authenticatedPositions === undefined &&
    input?.authenticatedPositionError === undefined
      ? {}
      : {
          readAuthenticatedPosition: () => {
            positionReads += 1;
            if (input.authenticatedPositionError !== undefined)
              return Promise.reject(input.authenticatedPositionError);
            const positionBase = input.authenticatedPositions?.shift();
            if (positionBase === undefined) throw new Error('NO_AUTHENTICATED_POSITION');
            return Promise.resolve({
              positionBase,
              observedAt: 1_001,
              source: 'AUTHENTICATED_POSITION_READ' as const,
            });
          },
        }),
    reconcileIntent: (...args) => {
      const [intentId] = args;
      if (input?.reconcileIntent) return input.reconcileIntent(...args);
      reconciledIntentIds.push(intentId);
      reconciliations += 1;
      const reconciliationResult = input?.reconciliationResults?.shift();
      if (reconciliationResult instanceof Error) return Promise.reject(reconciliationResult);
      if (reconciliationResult !== undefined) return Promise.resolve(reconciliationResult);
      if (input?.reconciliationError !== undefined)
        return Promise.reject(input.reconciliationError);
      return Promise.resolve(input?.reconciliationState ?? 'ORDER_NOT_FOUND');
    },
    ...(input?.cancelTargetState === undefined
      ? {}
      : { revalidateCancelTarget: () => Promise.resolve(input.cancelTargetState!) }),
    ...(input?.timeoutVerification === undefined
      ? {}
      : {
          verifyTimedOutIntent: () =>
            Promise.resolve(
              input.timeoutVerification === 'ORDER_OPEN'
                ? {
                    state: 'ORDER_OPEN' as const,
                    openOrder: input.directOpenOrder ?? {
                      venueOrderId: 'verified-open',
                      clientOrderId: `d1b${'a'.repeat(29)}`,
                      strategyConfigId: makeSnapshot().input.strategyConfigId,
                      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
                      side: 'BUY' as const,
                      price: 100,
                      quantity: 0.001,
                      orderType: 'LIMIT' as const,
                      timeInForce: 'PostOnly' as const,
                      postOnly: true as const,
                    },
                  }
                : { state: input.timeoutVerification! },
            ),
        }),
  };
  if (input?.postMutationRead)
    source.readAuthenticatedSnapshotAfterMutation = () => {
      postMutationReads++;
      return source.readAuthenticatedSnapshot();
    };
  const executor: DecibelProductionExecutionExecutorV1 = {
    ...(input?.supportUnwindIOC
      ? {
          placeReduceOnlyImmediateOrCancel: (
            intent: Parameters<DecibelProductionExecutionExecutorV1['placePostOnlyLimit']>[0],
          ) => {
            calls += 1;
            submitted.push({ action: 'PLACE' as const, side: intent.side });
            return Promise.resolve({
              outcome: 'PLACE_ACKNOWLEDGED' as const,
              venueOrderId: `v${calls}`,
            });
          },
        }
      : {}),
    placePostOnlyLimit: (intent) => {
      calls += 1;
      submitted.push({ action: 'PLACE', side: intent.side });
      return Promise.resolve({
        outcome: input?.placeOutcome ?? 'PLACE_ACKNOWLEDGED',
        venueOrderId: `v${calls}`,
      });
    },
    cancelExactOrder: (intent) => {
      calls += 1;
      submitted.push({ action: 'CANCEL', side: intent.side });
      return Promise.resolve({ outcome: input?.cancelOutcome ?? 'CANCEL_CONFIRMED' });
    },
  };
  const configuration = parseDecibelProductionLiveConfigurationV1({
    DECIBEL_EXECUTION_MODE: 'production',
    DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
    DECIBEL_EXECUTOR_ENABLED: 'true',
    DECIBEL_EXECUTOR_DRY_RUN: 'true',
    // Lifecycle tests run without the entry candle filter; it has its own tests.
    DECIBEL_ENTRY_CANDLE_FILTER_ENABLED: 'false',
    ...input?.environment,
  });
  const orchestrator = new decibel_production_live_orchestrator_v1(
    journal,
    source,
    input?.executor ?? executor,
    {
      ...configuration,
    },
    {
      maxPlaceAttemptsPerMinute: 10,
      maxCancelAttemptsPerMinute: 10,
      maxTotalMutationAttemptsPerMinute: 10,
      maxConsecutiveUnknownOutcomes: 2,
      maxKnownLiveOrders: 2,
    },
    input?.regimeBootstrap,
    () => decisionNow,
  );
  return {
    orchestrator,
    journal,
    configuration,
    calls: () => calls,
    reads: () => reads,
    positionReads: () => positionReads,
    postMutationReads: () => postMutationReads,
    reconciliations: () => reconciliations,
    reconciledIntentIds,
    submitted: () => submitted,
  };
}

describe('Decibel production live orchestrator V1', () => {
  it('derives the live-source network from the authoritative mainnet trading mode', () => {
    expect(
      resolveDecibelProductionLiveSourceEnvironmentV1({
        TRADING_MODE: 'mainnet',
        DECIBEL_NETWORK: 'testnet',
      }),
    ).toMatchObject({ TRADING_MODE: 'mainnet', DECIBEL_NETWORK: 'mainnet' });
    expect(() => resolveDecibelProductionLiveSourceEnvironmentV1({ TRADING_MODE: 'live' })).toThrow(
      'PRODUCTION_LIVE_SOURCE_MAINNET_REQUIRED',
    );
  });

  it('classifies an oversized inventory-reducing open order as crossing flat', () => {
    const base = makeSnapshot();
    const snapshot = makeSnapshot({
      input: {
        ...base.input,
        actualInventoryBase: -0.00024,
        metadata: { ...base.input.metadata, lotSize: 0.00001, minimumSize: 0.00001 },
        openOrders: [
          {
            venueOrderId: 'cross-flat-buy',
            clientOrderId: 'd1bcrossflat',
            strategyConfigId: base.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'BUY',
            price: 82_960.6,
            quantity: 0.0003,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
          },
        ],
      },
    });
    expect(findDecibelInventoryCrossingOpenOrderV1(snapshot)?.venueOrderId).toBe('cross-flat-buy');
  });

  it('permits a lot-aligned reduction no larger than authenticated inventory', () => {
    const base = makeSnapshot();
    const snapshot = makeSnapshot({
      input: {
        ...base.input,
        actualInventoryBase: -0.00024,
        metadata: { ...base.input.metadata, lotSize: 0.00001, minimumSize: 0.00001 },
        openOrders: [
          {
            venueOrderId: 'safe-buy',
            clientOrderId: 'd1bsafebuy',
            strategyConfigId: base.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'BUY',
            price: 82_960.6,
            quantity: 0.00024,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
          },
        ],
      },
    });
    expect(findDecibelInventoryCrossingOpenOrderV1(snapshot)).toBeNull();
  });

  it('routes a proven crossing-flat residual through the existing safety-cancel path', () => {
    const base = makeSnapshot();
    const openOrder = {
      venueOrderId: 'partial-residual',
      clientOrderId: 'd1spartialresidual',
      strategyConfigId: base.input.strategyConfigId,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side: 'SELL' as const,
      price: 100.2,
      quantity: 0.00027,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
      reduceOnly: false,
    };
    const crossing = makeSnapshot({
      input: {
        ...base.input,
        actualInventoryBase: 0.00003,
        metadata: { ...base.input.metadata, lotSize: 0.00001, minimumSize: 0.00001 },
        openOrders: [openOrder],
      },
    });
    const selection = selectDecibelInventoryCrossingSafetyCancelV1(crossing);
    expect(selection?.action).toMatchObject({
      action: 'WOULD_CANCEL',
      current: { venueOrderId: 'partial-residual' },
      desired: null,
      reason: 'INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT',
    });
    expect(classifyDecibelCancelV1(selection!.action!)).toBe('SAFETY_CANCEL');
  });

  it('hydrates fresh canonical BBO history and classifies the regime on the first cycle', async () => {
    const runtime = make({
      regimeBootstrap: {
        observedAt: 1_000,
        enforceReadiness: true,
        observations: [
          {
            timestamp: 0,
            bestBid: 99.9,
            bestAsk: 100.1,
            regime: 'NORMAL',
            source: 'DECIBEL_WS_BBO',
          },
          {
            timestamp: 500,
            bestBid: 100,
            bestAsk: 100.2,
            regime: 'NORMAL',
            source: 'DECIBEL_WS_BBO',
          },
        ],
      },
    });

    const result = await runtime.orchestrator.evaluateOnce();

    expect(result.evaluation?.marketRegime).not.toBe('UNKNOWN');
    expect(result.evaluation?.marketRegime).not.toBe('WARMING');
    expect(result.evaluation?.bidEligibilityReason).not.toBe('REGIME_SIDE_EVIDENCE_INSUFFICIENT');
    expect(result.evaluation?.askEligibilityReason).not.toBe('REGIME_SIDE_EVIDENCE_INSUFFICIENT');
  });

  it('keeps diagnostic candidates fail-closed while regime history warms, then auto-classifies', async () => {
    const second = makeSnapshot({
      input: {
        ...makeSnapshot().input,
        now: 2_000,
        book: { bestBid: 100.1, bestAsk: 100.3, observedAt: 2_000 },
      },
      sourceStateHash: 'state-2',
    });
    const runtime = make({
      snapshots: [makeSnapshot(), second, second],
      regimeBootstrap: { observedAt: 1_000, enforceReadiness: true, observations: [] },
    });

    const warming = await runtime.orchestrator.evaluateOnce();
    expect(warming.evaluation?.marketRegime).toBe('WARMING');
    expect(warming.evaluation?.bidCandidatesEvaluated).toBeGreaterThan(0);
    expect(warming.evaluation?.askCandidatesEvaluated).toBeGreaterThan(0);
    expect(warming.evaluation?.bidEligibilityReason).toBe('REGIME_SIDE_EVIDENCE_INSUFFICIENT');
    expect(warming.evaluation?.askEligibilityReason).toBe('REGIME_SIDE_EVIDENCE_INSUFFICIENT');
    expect(warming.evaluation?.desiredBid).toBeNull();
    expect(warming.evaluation?.desiredAsk).toBeNull();
    expect(warming.mutationInvocations).toBe(0);

    const classified = await runtime.orchestrator.evaluateOnce();
    expect(classified.evaluation?.marketRegime).not.toBe('WARMING');
    expect(classified.evaluation?.marketRegime).not.toBe('UNKNOWN');
    expect(classified.evaluation?.bidEligibilityReason).not.toBe(
      'REGIME_SIDE_EVIDENCE_INSUFFICIENT',
    );
    expect(classified.evaluation?.askEligibilityReason).not.toBe(
      'REGIME_SIDE_EVIDENCE_INSUFFICIENT',
    );
  });

  it('classifies operational regimes from real available inputs and changes quote controls', () => {
    const observation = (
      at: number,
      midpoint: number,
      overrides: Partial<
        Parameters<typeof classifyDecibelOperationalMarketRegimeV1>[0][number]
      > = {},
    ) => ({
      at,
      midpoint,
      bestBid: midpoint - 0.001,
      bestAsk: midpoint + 0.001,
      bestBidSize: 1,
      bestAskSize: 1,
      microprice: midpoint,
      topBookImbalance: 0,
      recentTradeIntensity: null,
      ...overrides,
    });
    const quiet = classifyDecibelOperationalMarketRegimeV1([observation(0, 100)], 0);
    const normal = classifyDecibelOperationalMarketRegimeV1(
      [observation(0, 100), observation(10_000, 100.01)],
      0,
    );
    const fast = classifyDecibelOperationalMarketRegimeV1(
      [observation(0, 100), observation(1_000, 100.03)],
      0,
    );
    const oneSided = classifyDecibelOperationalMarketRegimeV1(
      [observation(0, 100, { topBookImbalance: 0.8 })],
      0.01,
    );
    const thin = classifyDecibelOperationalMarketRegimeV1(
      [observation(0, 100, { bestBid: 99.98, bestAsk: 100.02 })],
      0,
    );

    expect(quiet.regime).toBe('QUIET');
    expect(normal.regime).toBe('NORMAL');
    expect(fast.regime).toBe('FAST');
    expect(oneSided.regime).toBe('ONE_SIDED');
    expect(oneSided.inputs.inventoryUsd).toBe(1);
    expect(thin.regime).toBe('THIN');
    expect(
      new Set([quiet, normal, fast, oneSided, thin].map((row) => row.policy.repriceMinimumTicks))
        .size,
    ).toBeGreaterThan(2);
    expect(fast.policy.sizeMultiplier).toBeLessThan(normal.policy.sizeMultiplier);
    expect(thin.policy.minimumRestingAgeMs).toBeGreaterThan(normal.policy.minimumRestingAgeMs);
  });

  it('does not revive the removed age and drift based ENTRY replacement policy', () => {
    let snapshot = makeSnapshot();
    const baseAction = {
      action: 'WOULD_REPLACE' as const,
      side: 'BUY' as const,
      current: {
        venueOrderId: 'resting-bid',
        clientOrderId: `d1b${'a'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        side: 'BUY' as const,
        price: 90,
        quantity: 0.001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
      },
      desired: {
        side: 'BUY' as const,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        price: 95,
        quantity: 0.001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
        clientOrderId: `d1b${'b'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        generation: 0,
      },
      reason: 'SEMANTIC_ORDER_CHANGED_CANCEL_THEN_PLACE',
    };
    snapshot = withEntryReviewEvidence(snapshot, baseAction);
    expect(
      evaluateDecibelReplacementDecisionV1(baseAction, snapshot, 29_999, 30_000, 50),
    ).toBeNull();
    expect(
      evaluateDecibelReplacementDecisionV1(
        { ...baseAction, desired: { ...baseAction.desired, price: 94.9 } },
        snapshot,
        30_000,
        30_000,
        50,
      ),
    ).toBeNull();
    expect(
      evaluateDecibelReplacementDecisionV1(baseAction, snapshot, 30_000, 30_000, 50, false, 30_000),
    ).toBeNull();
    const unsafe = evaluateDecibelReplacementDecisionV1(
      { ...baseAction, current: { ...baseAction.current, price: 100.2 } },
      snapshot,
      0,
      30_000,
      50,
    );
    expect(unsafe).toBeNull(); // Crossing safety is owned by the existing safety selector.
    expect(classifyDecibelCancelV1(baseAction)).toBe('SAFETY_CANCEL');
    expect(
      classifyDecibelCancelV1({
        ...baseAction,
        reason: 'REPRICE:MEANINGFUL_IMPROVEMENT RESTING_AGE_MS=30000 PRICE_DRIFT_TICKS=50',
      }),
    ).toBe('STRATEGIC_REPRICE_CANCEL');
    expect(
      classifyDecibelCancelV1({
        ...baseAction,
        reason: 'UNSAFE:POST_ONLY_CROSS RESTING_AGE_MS=0 PRICE_DRIFT_TICKS=1',
      }),
    ).toBe('SAFETY_CANCEL');
  });

  it('regresses strategic reprice commit safety without weakening immediate safety cancellation', () => {
    let snapshot = makeSnapshot();
    const action = {
      action: 'WOULD_REPLACE' as const,
      side: 'BUY' as const,
      current: {
        venueOrderId: 'owned-bid',
        clientOrderId: `d1b${'a'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        side: 'BUY' as const,
        price: 90,
        quantity: 0.001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
      },
      desired: {
        side: 'BUY' as const,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        price: 95,
        quantity: 0.001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
        clientOrderId: `d1b${'b'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        generation: 0,
      },
      reason: 'REPRICE:MEANINGFUL_IMPROVEMENT RESTING_AGE_MS=30000 PRICE_DRIFT_TICKS=50',
    };
    snapshot = withEntryReviewEvidence(snapshot, action);
    const committed = evaluateDecibelReplacementDecisionV1(
      action,
      snapshot,
      30_000,
      30_000,
      50,
      false,
      30_000,
    );
    expect(committed).toBeNull();
    expect(classifyDecibelCancelV1(action)).toBe('STRATEGIC_REPRICE_CANCEL');

    const movedAgainstReplacement = makeSnapshot({
      input: {
        ...snapshot.input,
        book: { bestBid: 89, bestAsk: 100.2, observedAt: snapshot.input.now },
      },
    });
    expect(
      evaluateDecibelReplacementDecisionV1(
        { ...action, desired: { ...action.desired, price: 89 } },
        movedAgainstReplacement,
        30_000,
        30_000,
        50,
      ),
    ).toBeNull();

    expect(
      classifyDecibelCancelV1({
        ...action,
        reason: 'INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT',
      }),
    ).toBe('SAFETY_CANCEL');
  });

  it('suppresses an ordinary replacement whose normalized execution key is unchanged', () => {
    const snapshot = makeSnapshot();
    const action = {
      action: 'WOULD_REPLACE' as const,
      side: 'SELL' as const,
      current: {
        venueOrderId: 'resting-ask',
        clientOrderId: `d1s${'a'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        side: 'SELL' as const,
        price: 101,
        quantity: 0.00100000000001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
        reduceOnly: false,
      },
      desired: {
        side: 'SELL' as const,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        price: 101,
        quantity: 0.001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
        clientOrderId: `d1s${'b'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        generation: 1,
      },
      reason: 'SEMANTIC_ORDER_CHANGED_CANCEL_THEN_PLACE',
    };
    expect(evaluateDecibelReplacementDecisionV1(action, snapshot, 60_000, 30_000, 50)).toBeNull();
  });

  it('does not cancel an already-resting ENTRY merely because the current BBO crosses it', () => {
    const snapshot = makeSnapshot();
    const action = {
      action: 'WOULD_REPLACE' as const,
      side: 'BUY' as const,
      current: {
        venueOrderId: 'crossing-bid',
        clientOrderId: `d1b${'a'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        side: 'BUY' as const,
        price: 100.2,
        quantity: 0.001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
        reduceOnly: false,
      },
      desired: {
        side: 'BUY' as const,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        price: 100.2,
        quantity: 0.001,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
        clientOrderId: `d1b${'b'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        generation: 1,
      },
      reason: 'SEMANTIC_ORDER_CHANGED_CANCEL_THEN_PLACE',
    };
    expect(evaluateDecibelReplacementDecisionV1(action, snapshot, 1, 30_000, 50)).toBeNull();
  });

  it('assigns the observed cancel and replacement the same normalized order identity', () => {
    const shared = {
      side: 'SELL' as const,
      quantity: 0.00024,
      tickSize: 0.1,
      lotSize: 0.00001,
      timeInForce: 'PostOnly' as const,
      reduceOnly: false,
    };
    const oldOrderKey = buildDecibelCanonicalOrderKeyV1({ ...shared, price: 79_677.4 });
    const newOrderKey = buildDecibelCanonicalOrderKeyV1({
      ...shared,
      price: 79_677.40000000001,
    });
    expect(oldOrderKey).toBe('SELL:796774:24:PostOnly:false');
    expect(newOrderKey).toBe(oldOrderKey);
  });

  it('builds every production candidate adverse bucket without substituting missing evidence', () => {
    const buckets = buildDecibelCandidateAdverseSelectionEvidenceV1(
      [
        { timestamp: 1_000, bestBid: 99.9, bestAsk: 100.1 },
        { timestamp: 61_000, bestBid: 99.9, bestAsk: 100.1 },
      ],
      61_000,
    );
    expect(buckets).toHaveLength(14);
    expect(buckets.map((bucket) => `${bucket.side}:${bucket.distanceBps}`)).toEqual(
      [5, 6, 7, 8, 9, 10, 12].flatMap((distance) => [`BUY:${distance}`, `SELL:${distance}`]),
    );
    expect(buckets.every((bucket) => bucket.sampleCount === 0)).toBe(true);
    expect(buckets.every((bucket) => bucket.p95AdverseSelectionBps === null)).toBe(true);
  });

  it('reuses only fresh authoritative BBO observations from the execution journal', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-journal-')), 'journal.sqlite');
    const Journal = new decibel_execution_lifecycle_journal_v1(path);
    Journal.recordDecisionSnapshot(1, { bookObservedAt: 9_500, bestBid: 100, bestAsk: 101 }, 9_500);
    Journal.recordDecisionSnapshot(2, { bookObservedAt: 8_000, bestBid: 99, bestAsk: 100 }, 8_000);
    Journal.close();
    expect(loadFreshDecibelJournalBboObservationsV1(path, 10_000, 1_000)).toEqual([
      { timestamp: 9_500, bestBid: 100, bestAsk: 101 },
    ]);
  });

  it('loads only fresh provenance-labeled production economic evidence', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-')), 'evidence.json');
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: 10_000,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        conservativeGasCostUsd: 0.0005,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        adverseSelectionBufferBps: 3,
        adverseSelectionObservedAt: 10_000,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );
    expect(loadDecibelProductionEconomicEvidenceV1(path, 10_500, 1_000)).toMatchObject({
      makerFeeBps: 1.5,
      conservativeGasCostUsd: 0.0005,
    });
    expect(loadDecibelProductionEconomicEvidenceV1(path, 12_000, 1_000)).toBeNull();
  });

  it('publishes complete economic evidence atomically while concurrent readers retain old evidence', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-atomic-')), 'evidence.json');
    const complete = (observedAt: number, makerFeeBps: number) => ({
      observedAt,
      makerFeeObservedAt: observedAt,
      makerFeeBps,
      makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
      conservativeGasCostUsd: 0.0005,
      gasCostObservedAt: observedAt,
      gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
      aptUsd: 4.25,
      aptUsdObservedAt: observedAt,
      aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      adverseSelectionBufferBps: 3,
      adverseSelectionObservedAt: observedAt,
      adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionRawSampleCount: 60,
      adverseSelectionEffectiveSampleCount: 30,
      adverseSelectionRepresentative: true,
    });
    writeFileSync(path, JSON.stringify(complete(Date.now() - 7_200_000, 1.5)));
    let releaseViability!: () => void;
    const viabilityPending = new Promise<void>((resolvePending) => {
      releaseViability = resolvePending;
    });
    let candidatePath = '';
    const refresh = refreshDecibelProductionEconomicEvidenceV1(
      {
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '3600000',
      },
      {
        runInputsAudit: (environment) => {
          candidatePath = environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!;
          expect(environment.DECIBEL_PRODUCTION_ECONOMIC_LAST_KNOWN_GOOD_PATH).toBe(path);
          writeFileSync(candidatePath, JSON.stringify({ makerFeeBps: 2 }));
          return Promise.resolve({});
        },
        runViabilityAudit: async () => {
          await viabilityPending;
          writeFileSync(candidatePath, JSON.stringify(complete(Date.now(), 2)));
          return {};
        },
      },
    );
    await new Promise((resolvePending) => setTimeout(resolvePending, 0));
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ makerFeeBps: 1.5 });
    releaseViability();
    await refresh;
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ makerFeeBps: 2 });
  });

  it('publishes fresh fee, gas, and APT independently while adverse evidence remains insufficient', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-partial-')), 'evidence.json');
    const staleAt = Date.now() - 7_200_000;
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: staleAt,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        makerFeeObservedAt: staleAt,
        conservativeGasCostUsd: 0.0005,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        gasCostObservedAt: staleAt,
        aptUsd: 4.25,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        aptUsdObservedAt: staleAt,
        adverseSelectionBufferBps: 3,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionObservedAt: staleAt,
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 10,
        adverseSelectionEffectiveSampleCount: 1,
        adverseSelectionRepresentative: false,
      }),
    );
    let releaseAdverse!: () => void;
    const adversePending = new Promise<void>((resolvePending) => {
      releaseAdverse = resolvePending;
    });
    const refresh = refreshDecibelProductionEconomicEvidenceV1(
      { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path },
      {
        runInputsAudit: (environment) => {
          const now = Date.now();
          writeFileSync(
            environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
            JSON.stringify({
              observedAt: now,
              makerFeeBps: 2,
              makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
              makerFeeObservedAt: now,
              conservativeGasCostUsd: 0.0008,
              gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
              gasCostObservedAt: now,
              aptUsd: 5,
              aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
              aptUsdObservedAt: now,
            }),
          );
          return Promise.resolve({ observedAt: now });
        },
        runViabilityAudit: async () => {
          await adversePending;
          return {};
        },
      },
    );
    await new Promise((resolvePending) => setTimeout(resolvePending, 0));
    const inProgress = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(inProgress).toMatchObject({
      makerFeeBps: 2,
      conservativeGasCostUsd: 0.0008,
      aptUsd: 5,
      adverseSelectionEffectiveSampleCount: 1,
    });
    expect(
      readDecibelProductionEconomicComponentStatesV1({
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
      }).map((state) => state.status),
    ).toEqual(['READY', 'READY', 'READY', 'STALE', 'READY']);
    releaseAdverse();
    await expect(refresh).resolves.toMatchObject({ aptUsd: 5 });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      makerFeeBps: 2,
      conservativeGasCostUsd: 0.0008,
      aptUsd: 5,
    });
  });

  it('preserves unrelated components when only maker fee refresh succeeds', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-fee-only-')), 'evidence.json');
    const now = Date.now();
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        makerFeeObservedAt: now - 7_200_000,
        conservativeGasCostUsd: 0.0005,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        gasCostObservedAt: now,
        aptUsd: 4.25,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        aptUsdObservedAt: now,
        adverseSelectionBufferBps: 3,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionObservedAt: now,
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );
    await expect(
      refreshDecibelProductionEconomicEvidenceV1(
        { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path },
        {
          runInputsAudit: () =>
            Promise.resolve({
              observedAt: Date.now(),
              makerFeeBps: 2,
              makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
              makerFeeObservedAt: Date.now(),
            }),
        },
      ),
    ).resolves.toMatchObject({ aptUsd: 4.25 });
    expect(
      readDecibelProductionEconomicComponentStatesV1({
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
      }).every((state) => state.status === 'READY'),
    ).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      makerFeeBps: 2,
      conservativeGasCostUsd: 0.0005,
      aptUsd: 4.25,
      adverseSelectionBufferBps: 3,
    });
  });

  it('retains validated historical gas P95 when no new transaction lookup succeeds', () => {
    expect(
      resolveDecibelHistoricalGasEvidenceV1([], {
        observedGasTxCount: 213,
        medianGasApt: 0.000589,
        p95GasApt: 0.000648,
      }),
    ).toEqual({
      observedGasTxCount: 213,
      medianGasApt: 0.000589,
      p95GasApt: 0.000648,
      reused: true,
    });
  });

  it('derives a fresh authenticated maker fee from strategy maker fills only', () => {
    expect(
      deriveAuthenticatedMakerFeeEvidenceV1(
        [
          {
            client_order_id: 'd1b123',
            fee_amount: 0.0015,
            is_rebate: false,
            price: 100,
            size: 0.1,
            transaction_unix_ms: 9_900,
          },
          {
            client_order_id: 'manual',
            fee_amount: 1,
            is_rebate: false,
            price: 100,
            size: 0.1,
            transaction_unix_ms: 9_950,
          },
        ],
        10_000,
        1_000,
      ),
    ).toEqual({ makerFeeBps: 1.5, observedAt: 9_900, sampleCount: 1 });
    expect(
      deriveAuthenticatedMakerFeeEvidenceV1(
        [
          {
            client_order_id: 'd1b123',
            fee_amount: 0.0015,
            is_rebate: false,
            price: 100,
            size: 0.1,
            transaction_unix_ms: 1,
          },
        ],
        10_000,
        1_000,
      ),
    ).toBeNull();
  });

  it('resolves alternate APT USD evidence without replacing its venue timestamp', () => {
    expect(
      resolveAptUsdFromAllMarketPricesV1(
        [{ market_name: 'APT/USD', market_addr: '0xapt' }],
        [{ market: '0xAPT', mid_px: 4.25, transaction_unix_ms: 9_900 }],
        10_000,
        1_000,
      ),
    ).toEqual({ aptUsd: 4.25, observedAt: 9_900 });
    expect(
      resolveAptUsdFromAllMarketPricesV1(
        [{ market_name: 'APT/USD', market_addr: '0xapt' }],
        [{ market: '0xAPT', mid_px: 4.25, transaction_unix_ms: 1 }],
        10_000,
        1_000,
      ),
    ).toBeNull();
  });

  it('validates alternate Coinbase APT USD evidence with its source timestamp', () => {
    expect(
      resolveCoinbaseAptUsdEvidenceV1(
        { price: '4.25', time: '1970-01-01T00:00:09.900Z' },
        10_000,
        1_000,
      ),
    ).toEqual({ aptUsd: 4.25, observedAt: 9_900 });
    expect(
      resolveCoinbaseAptUsdEvidenceV1(
        { price: '4.25', time: '1970-01-01T00:00:01.000Z' },
        10_000,
        1_000,
      ),
    ).toBeNull();
    expect(
      resolveCoinbaseAptUsdEvidenceV1(
        { price: '4.25', time: '1970-01-01T00:00:20.000Z' },
        10_000,
        1_000,
      ),
    ).toEqual({ aptUsd: 4.25, observedAt: 10_000 });
  });

  it('validates the secondary external APT USD fallback with source time', () => {
    expect(
      resolveCoinGeckoAptUsdEvidenceV1({ aptos: { usd: 4.25, last_updated_at: 9 } }, 10_000, 2_000),
    ).toEqual({ aptUsd: 4.25, observedAt: 9_000 });
    expect(
      resolveCoinGeckoAptUsdEvidenceV1({ aptos: { usd: 4.25, last_updated_at: 1 } }, 10_000, 2_000),
    ).toBeNull();
  });

  it('continues from a failed external source to the secondary external source', async () => {
    let secondaryReads = 0;
    const resolved = await resolveAptUsdEvidenceChainV1({
      now: 10_000,
      maximumAgeMs: 1_000,
      lastKnownGood: null,
      readDecibelPrimary: () => Promise.reject(new Error('PRIMARY_DOWN')),
      readDecibelFallback: () => Promise.reject(new Error('DECIBEL_FALLBACK_DOWN')),
      readExternalFallback: () => Promise.reject(new Error('COINBASE_DOWN')),
      readExternalSecondary: () => {
        secondaryReads += 1;
        return Promise.resolve({ aptUsd: 4.25, observedAt: 9_900 });
      },
    });
    expect(resolved).toMatchObject({
      aptUsd: 4.25,
      source: 'COINGECKO_APT_USD_SIMPLE_PRICE',
      ageMs: 100,
    });
    expect(secondaryReads).toBe(1);
  });

  it('times out one APT USD source without blocking the remaining fallback chain', async () => {
    let fallbackReads = 0;
    const resolved = await resolveAptUsdEvidenceChainV1({
      now: 10_000,
      maximumAgeMs: 1_000,
      sourceTimeoutMs: 10,
      lastKnownGood: null,
      readDecibelPrimary: () => new Promise<never>(() => undefined),
      readDecibelFallback: () => {
        fallbackReads += 1;
        return Promise.resolve({ aptUsd: 4.25, observedAt: 9_900 });
      },
      readExternalFallback: () => Promise.reject(new Error('MUST_NOT_READ')),
    });
    expect(resolved).toMatchObject({
      aptUsd: 4.25,
      source: 'DECIBEL_REST_ALL_MARKETS_APT_USD_PRICE',
    });
    expect(fallbackReads).toBe(1);
  });

  it('keeps APT USD fallbacks independent after a primary failure or Decibel 429', async () => {
    let decibelFallbackReads = 0;
    let externalReads = 0;
    let rateLimits = 0;
    const resolved = await resolveAptUsdEvidenceChainV1({
      now: 10_000,
      maximumAgeMs: 1_000,
      lastKnownGood: null,
      readDecibelPrimary: () =>
        Promise.reject(Object.assign(new Error('HTTP_429'), { status: 429 })),
      readDecibelFallback: () => {
        decibelFallbackReads += 1;
        return Promise.reject(new Error('PRODUCTION_DECIBEL_HTTP_RATE_LIMITED'));
      },
      readExternalFallback: () => {
        externalReads += 1;
        return Promise.resolve({ aptUsd: 4.25, observedAt: 9_900 });
      },
      onDecibelRateLimit: () => {
        rateLimits += 1;
      },
    });
    expect(resolved).toMatchObject({
      aptUsd: 4.25,
      source: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      ageMs: 100,
      maximumAgeMs: 1_000,
    });
    expect({ decibelFallbackReads, externalReads, rateLimits }).toEqual({
      decibelFallbackReads: 1,
      externalReads: 1,
      rateLimits: 1,
    });
  });

  it('restores a persisted APT USD LKG after restart and rejects it after its TTL', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-apt-lkg-')), 'evidence.json');
    writeFileSync(
      path,
      JSON.stringify({
        aptUsd: 4.25,
        aptUsdObservedAt: 9_900,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      }),
    );
    const lastKnownGood = loadLastKnownGoodEconomicInputsV1({
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
    });
    const unavailable = () => Promise.reject(new Error('SOURCE_UNAVAILABLE'));
    await expect(
      resolveAptUsdEvidenceChainV1({
        now: 10_000,
        maximumAgeMs: 1_000,
        lastKnownGood,
        readDecibelPrimary: unavailable,
        readDecibelFallback: unavailable,
        readExternalFallback: unavailable,
      }),
    ).resolves.toMatchObject({
      aptUsd: 4.25,
      source: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      diagnostic: 'LAST_KNOWN_GOOD_STILL_FRESH',
      ageMs: 100,
    });
    const expired = await resolveAptUsdEvidenceChainV1({
      now: 11_001,
      maximumAgeMs: 1_000,
      lastKnownGood,
      readDecibelPrimary: unavailable,
      readDecibelFallback: unavailable,
      readExternalFallback: unavailable,
    });
    expect(expired.aptUsd).toBeNull();
    expect(expired.source).toBe('UNKNOWN');
    expect(expired.diagnostic).toContain('LAST_KNOWN_GOOD:EXPIRED:AGE_MS=1101');
  });

  it('does not let global Decibel backoff abort atomic refresh orchestration', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-backoff-')), 'evidence.json');
    const now = Date.now();
    const complete = {
      observedAt: now,
      makerFeeObservedAt: now,
      makerFeeBps: 1.5,
      makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
      conservativeGasCostUsd: 0.0005,
      gasCostObservedAt: now,
      gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
      aptUsd: 4.25,
      aptUsdObservedAt: now,
      aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      adverseSelectionBufferBps: 3,
      adverseSelectionObservedAt: now,
      adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionRawSampleCount: 60,
      adverseSelectionEffectiveSampleCount: 30,
      adverseSelectionRepresentative: true,
    };
    enterDecibelHTTPReadBackoffV1(30_000);
    let candidatePath = '';
    await expect(
      refreshDecibelProductionEconomicEvidenceV1(
        { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path },
        {
          runInputsAudit: (environment) => {
            candidatePath = environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!;
            writeFileSync(candidatePath, JSON.stringify(complete));
            return Promise.resolve({ aptUsd: 4.25 });
          },
          runViabilityAudit: () => {
            writeFileSync(candidatePath, JSON.stringify(complete));
            return Promise.resolve({});
          },
        },
      ),
    ).resolves.toMatchObject({
      aptUsd: 4.25,
      aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
    });
  });

  it('preserves prior complete economic evidence when staged refresh fails', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-failure-')), 'evidence.json');
    const oldEvidence = JSON.stringify({ complete: 'old' });
    writeFileSync(path, oldEvidence);
    await expect(
      refreshDecibelProductionEconomicEvidenceV1(
        { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path },
        {
          runInputsAudit: (environment) => {
            writeFileSync(environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!, '{}');
            return Promise.resolve({});
          },
          runViabilityAudit: () => Promise.reject(new Error('REFRESH_FAILED')),
        },
      ),
    ).rejects.toThrow('REFRESH_FAILED');
    expect(readFileSync(path, 'utf8')).toBe(oldEvidence);
  });

  it('loads valid persisted economics before reporting an initial refresh failure', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-bootstrap-')), 'evidence.json');
    const observedAt = 10_000;
    writeFileSync(
      path,
      JSON.stringify({
        observedAt,
        makerFeeObservedAt: observedAt,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        conservativeGasCostUsd: 0.0005,
        gasCostObservedAt: observedAt,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        aptUsd: 4.25,
        aptUsdObservedAt: observedAt,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        adverseSelectionBufferBps: 3,
        adverseSelectionObservedAt: observedAt,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );

    await expect(
      bootstrapDecibelProductionEconomicEvidenceV1(
        {
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '1000',
        },
        {
          now: () => 10_500,
          runInputsAudit: () => Promise.reject(new Error('TRANSIENT_REFRESH_FAILURE')),
        },
      ),
    ).resolves.toEqual({
      lastKnownGoodFound: true,
      lastKnownGoodReady: true,
      refreshTriggered: true,
      refreshResult: 'FAIL',
      economicEvidenceReady: true,
      blocker: 'TRANSIENT_REFRESH_FAILURE',
    });
    expect(loadDecibelProductionEconomicEvidenceV1(path, 10_500, 1_000)).not.toBeNull();
    expect(
      readDecibelProductionEconomicLkgReadinessV1(
        {
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '1000',
        },
        10_500,
      ),
    ).toEqual({ found: true, ready: true, blocker: null });
  });

  it('refreshes from valid persisted economics without waiting on live markout collection', async () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-fast-lkg-'));
    const path = join(root, 'evidence.json');
    const observedAt = Date.now();
    const persisted = {
      observedAt,
      makerFeeObservedAt: observedAt,
      makerFeeBps: 1.5,
      makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
      conservativeGasCostUsd: 0.0005,
      gasCostObservedAt: observedAt,
      gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
      aptUsd: 4.25,
      aptUsdObservedAt: observedAt,
      aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      adverseSelectionBufferBps: 3,
      adverseSelectionObservedAt: observedAt,
      adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionRawSampleCount: 60,
      adverseSelectionEffectiveSampleCount: 30,
      adverseSelectionRepresentative: true,
    };
    writeFileSync(path, JSON.stringify(persisted));
    let viabilityCalls = 0;
    const viability = () => {
      viabilityCalls += 1;
      return new Promise<Readonly<Record<string, unknown>>>(() => undefined);
    };
    const refresh = refreshDecibelProductionEconomicEvidenceV1(
      {
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '1000',
      },
      {
        runInputsAudit: (environment) => {
          writeFileSync(
            environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
            JSON.stringify({
              ...persisted,
              observedAt: Date.now(),
              makerFeeObservedAt: Date.now(),
              gasCostObservedAt: Date.now(),
              aptUsdObservedAt: Date.now(),
              adverseSelectionBufferBps: undefined,
              adverseSelectionObservedAt: undefined,
              adverseSelectionSource: undefined,
            }),
          );
          return Promise.resolve({ makerFeeBps: 1.5, p95GasApt: 0.0001, aptUsd: 4.25 });
        },
        runViabilityAudit: viability,
      },
    );
    await expect(refresh).resolves.toMatchObject({ aptUsd: 4.25 });
    expect(viabilityCalls).toBe(0);
    const published = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(published.adverseSelectionBufferBps).toBe(3);
    expect(published.adverseSelectionSource).toBe('SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95');
  });

  it('refreshes stale maker fee independently while preserving fresh economic components', async () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-component-refresh-'));
    const path = join(root, 'evidence.json');
    const now = Date.now();
    const prior = {
      observedAt: now,
      makerFeeObservedAt: now - 3_600_001,
      makerFeeBps: 1.5,
      makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
      conservativeGasCostUsd: 0.0005,
      gasCostObservedAt: now,
      gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
      aptUsd: 4.25,
      aptUsdObservedAt: now,
      aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      adverseSelectionBufferBps: 3,
      adverseSelectionObservedAt: now,
      adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionRawSampleCount: 60,
      adverseSelectionEffectiveSampleCount: 30,
      adverseSelectionRepresentative: true,
    };
    writeFileSync(path, JSON.stringify(prior));
    let viabilityCalls = 0;
    await expect(
      refreshDecibelProductionEconomicEvidenceV1(
        {
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '3600000',
        },
        {
          runInputsAudit: (environment) => {
            writeFileSync(
              environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
              JSON.stringify({
                ...prior,
                makerFeeObservedAt: Date.now(),
                adverseSelectionBufferBps: undefined,
                adverseSelectionObservedAt: undefined,
                adverseSelectionSource: undefined,
              }),
            );
            return Promise.resolve({ makerFeeBps: 1.5, p95GasApt: 0.0001, aptUsd: 4.25 });
          },
          runViabilityAudit: () => {
            viabilityCalls += 1;
            return new Promise<Readonly<Record<string, unknown>>>(() => undefined);
          },
        },
      ),
    ).resolves.toMatchObject({ aptUsd: 4.25 });
    expect(viabilityCalls).toBe(0);
    const published = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(published).toMatchObject({
      makerFeeBps: 1.5,
      aptUsd: 4.25,
      adverseSelectionBufferBps: 3,
    });
    expect(published.conservativeGasCostUsd).toBeCloseTo(0.000425, 12);
  });

  it('tracks economic readiness independently for every required component', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-components-')), 'evidence.json');
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: 9_000,
        makerFeeObservedAt: 1_000,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        conservativeGasCostUsd: 0.0005,
        gasCostObservedAt: 9_000,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        aptUsd: 4.25,
        aptUsdObservedAt: 9_000,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        adverseSelectionBufferBps: 3,
        adverseSelectionObservedAt: 9_000,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );
    const states = readDecibelProductionEconomicComponentStatesV1(
      {
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '5000',
      },
      10_000,
    );
    expect(states.find((state) => state.component === 'MAKER_FEE')).toMatchObject({
      status: 'STALE',
      ageMs: 9_000,
      ttlMs: 5_000,
    });
    expect(
      states.filter((state) => state.component !== 'MAKER_FEE').map((state) => state.status),
    ).toEqual(['READY', 'READY', 'READY', 'STALE']);
  });

  it('hydrates production adverse evidence from the canonical raw store on restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-hydration-'));
    const path = join(root, 'evidence.json');
    const rawPath = join(root, 'decibel_production_raw_ws_bbo_v1.jsonl');
    const now = 1_800_000_000_000;
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: now,
        makerFeeObservedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        conservativeGasCostUsd: 0.0005,
        gasCostObservedAt: now,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        aptUsd: 4.25,
        aptUsdObservedAt: now,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        adverseSelectionBufferBps: 99,
        adverseSelectionObservedAt: now - 7_200_000,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 1,
        adverseSelectionEffectiveSampleCount: 0,
        adverseSelectionRepresentative: false,
      }),
    );
    const rows = Array.from({ length: 35 }, (_, index) => ({
      timestamp: now - (34 - index) * 31_000,
      bestBid: 100 + index * 0.01,
      bestAsk: 100.1 + index * 0.01,
      regime: 'NORMAL',
      source: 'DECIBEL_WS_BBO',
    }));
    writeFileSync(rawPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    const environment = {
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '3600000',
    };

    const states = hydrateDecibelProductionEconomicEvidenceV1(environment, now);
    expect(states.every((state) => state.status === 'READY')).toBe(true);
    const hydrated = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    expect(hydrated).toMatchObject({
      makerFeeBps: 1.5,
      aptUsd: 4.25,
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionEffectiveSampleCount: 34,
      adverseSelectionRepresentative: true,
    });
    expect(hydrated.adverseSelectionBufferBps).not.toBe(99);

    const second = hydrateDecibelProductionEconomicEvidenceV1(environment, now);
    expect(second.every((state) => state.status === 'READY')).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(hydrated);
  });

  it('schedules refresh before the earliest component expires', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-schedule-')), 'evidence.json');
    const now = 10_000_000;
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: now,
        makerFeeObservedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        conservativeGasCostUsd: 0.0005,
        gasCostObservedAt: now,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        aptUsd: 4.25,
        aptUsdObservedAt: now,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        adverseSelectionBufferBps: 3,
        adverseSelectionObservedAt: now - 2_500_000,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );
    expect(
      getDecibelProductionEconomicRefreshDelayV1(
        {
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
          DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '3600000',
          DECIBEL_ECONOMIC_MARKOUT_DURATION_MS: '75000',
        },
        now,
      ),
    ).toBe(1_025_000);
  });

  it('does not busy-loop proactive refresh when successful evidence is unchanged', () => {
    const path = join(
      mkdtempSync(join(tmpdir(), 'decibel-economic-no-busy-loop-')),
      'evidence.json',
    );
    const now = 10_000_000;
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: now,
        makerFeeObservedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        conservativeGasCostUsd: 0.0005,
        gasCostObservedAt: now,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        aptUsd: 4.25,
        aptUsdObservedAt: now,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        adverseSelectionBufferBps: 3,
        adverseSelectionObservedAt: now - 3_550_000,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );
    const environment = {
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
      DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '3600000',
      DECIBEL_ECONOMIC_MARKOUT_DURATION_MS: '75000',
    };
    expect(getDecibelProductionEconomicRefreshDelayV1(environment, now)).toBe(1_000);
    const before = new Map(
      readDecibelProductionEconomicComponentStatesV1(environment, now).map((component) => [
        component.component,
        component.observedAt,
      ]),
    );
    expect(getDecibelProductionEconomicPostSuccessDelayV1(environment, before, now)).toBe(50_000);
    const anotherComponentAdvanced = new Map(before);
    anotherComponentAdvanced.set('MAKER_FEE', now - 1);
    expect(
      getDecibelProductionEconomicPostSuccessDelayV1(environment, anotherComponentAdvanced, now),
    ).toBe(50_000);
  });

  it('refreshes adverse evidence before preserved evidence can expire', async () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-adverse-lead-'));
    const path = join(root, 'evidence.json');
    const now = Date.now();
    const prior = {
      observedAt: now,
      makerFeeObservedAt: now,
      makerFeeBps: 1.5,
      makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
      conservativeGasCostUsd: 0.0005,
      gasCostObservedAt: now,
      gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
      aptUsd: 4.25,
      aptUsdObservedAt: now,
      aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
      adverseSelectionBufferBps: 3,
      adverseSelectionObservedAt: now - 9_500,
      adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionRawSampleCount: 60,
      adverseSelectionEffectiveSampleCount: 30,
      adverseSelectionRepresentative: true,
    };
    writeFileSync(path, JSON.stringify(prior));
    let viabilityCalls = 0;
    await refreshDecibelProductionEconomicEvidenceV1(
      {
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '10000',
        DECIBEL_ECONOMIC_MARKOUT_DURATION_MS: '1000',
      },
      {
        runInputsAudit: (environment) => {
          writeFileSync(
            environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
            JSON.stringify({
              ...prior,
              observedAt: Date.now(),
              makerFeeObservedAt: Date.now(),
              gasCostObservedAt: Date.now(),
              aptUsdObservedAt: Date.now(),
              adverseSelectionBufferBps: undefined,
              adverseSelectionObservedAt: undefined,
              adverseSelectionSource: undefined,
            }),
          );
          return Promise.resolve({ makerFeeBps: 1.5, p95GasApt: 0.0001, aptUsd: 4.25 });
        },
        runViabilityAudit: (environment) => {
          viabilityCalls += 1;
          const candidate = JSON.parse(
            readFileSync(environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!, 'utf8'),
          ) as Record<string, unknown>;
          writeFileSync(
            environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
            JSON.stringify({
              ...candidate,
              adverseSelectionBufferBps: 2.75,
              adverseSelectionObservedAt: Date.now(),
              adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
              adverseSelectionRegime: 'NORMAL',
              adverseSelectionRawSampleCount: 60,
              adverseSelectionEffectiveSampleCount: 30,
              adverseSelectionRepresentative: true,
            }),
          );
          return Promise.resolve({});
        },
      },
    );
    expect(viabilityCalls).toBe(1);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      adverseSelectionBufferBps: 2.75,
      adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
      adverseSelectionRegime: 'NORMAL',
      adverseSelectionRawSampleCount: 60,
      adverseSelectionEffectiveSampleCount: 30,
      adverseSelectionRepresentative: true,
    });
  });

  it('allows long adverse collection to finish without a whole-refresh timeout', async () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-economic-long-adverse-'));
    const path = join(root, 'evidence.json');
    const observedAt = Date.now();
    let finishAdverse: (() => void) | null = null;
    const refresh = refreshDecibelProductionEconomicEvidenceV1(
      {
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path,
        DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_MAX_AGE_MS: '3600000',
      },
      {
        runInputsAudit: (environment) => {
          writeFileSync(
            environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
            JSON.stringify({
              observedAt,
              makerFeeObservedAt: observedAt,
              makerFeeBps: 1.5,
              makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
              conservativeGasCostUsd: 0.0005,
              gasCostObservedAt: observedAt,
              gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
              aptUsd: 4.25,
              aptUsdObservedAt: observedAt,
              aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
            }),
          );
          return Promise.resolve({ makerFeeBps: 1.5, p95GasApt: 0.0001, aptUsd: 4.25 });
        },
        runViabilityAudit: (environment) =>
          new Promise((resolveAudit) => {
            finishAdverse = () => {
              const candidate = JSON.parse(
                readFileSync(environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!, 'utf8'),
              ) as Record<string, unknown>;
              writeFileSync(
                environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
                JSON.stringify({
                  ...candidate,
                  adverseSelectionBufferBps: 3,
                  adverseSelectionObservedAt: Date.now(),
                  adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
                  adverseSelectionRegime: 'NORMAL',
                  adverseSelectionRawSampleCount: 60,
                  adverseSelectionEffectiveSampleCount: 30,
                  adverseSelectionRepresentative: true,
                }),
              );
              resolveAudit({});
            };
          }),
      },
    );
    await new Promise((resolvePending) => setTimeout(resolvePending, 20));
    expect(finishAdverse).not.toBeNull();
    finishAdverse?.();
    await expect(refresh).resolves.toMatchObject({ aptUsd: 4.25 });
  });

  it('lets adverse collection progress when maker fee and APT inputs are unavailable', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-no-stage-')), 'evidence.json');
    writeFileSync(path, JSON.stringify({ complete: 'old' }));
    let adverseAttempted = false;
    await expect(
      refreshDecibelProductionEconomicEvidenceV1(
        { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path },
        {
          runInputsAudit: () =>
            Promise.resolve({
              observedAt: Date.now(),
              makerFeeBps: null,
              p95GasApt: 0.002934,
              conservativeGasCostUsd: null,
              aptUsd: null,
            }),
          runViabilityAudit: (environment) => {
            adverseAttempted = true;
            const candidate = JSON.parse(
              readFileSync(environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!, 'utf8'),
            ) as Record<string, unknown>;
            writeFileSync(
              environment.DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH!,
              JSON.stringify({
                ...candidate,
                adverseSelectionBufferBps: 3,
                adverseSelectionObservedAt: Date.now(),
                adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
                adverseSelectionRegime: 'NORMAL',
                adverseSelectionRawSampleCount: 60,
                adverseSelectionEffectiveSampleCount: 30,
                adverseSelectionRepresentative: true,
              }),
            );
            return Promise.resolve({});
          },
        },
      ),
    ).rejects.toThrow('PRODUCTION_ECONOMIC_REFRESH_CANDIDATE_INVALID:MAKER_FEE_EVIDENCE_UNKNOWN');
    expect(adverseAttempted).toBe(true);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      p95GasApt: 0.002934,
      adverseSelectionEffectiveSampleCount: 30,
      adverseSelectionRepresentative: true,
    });
  });

  it('requires fresh execution costs while stale adverse remains optional', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-sources-')), 'evidence.json');
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: 10_500,
        makerFeeObservedAt: 10_500,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        gasCostObservedAt: 10_500,
        conservativeGasCostUsd: 0.0005,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        adverseSelectionObservedAt: 9_000,
        adverseSelectionBufferBps: 3,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );
    expect(loadDecibelProductionEconomicEvidenceV1(path, 11_000, 1_000)).toMatchObject({
      makerFeeBps: 1.5,
      conservativeGasCostUsd: 0.0005,
      adverseSelectionSource: undefined,
    });
    expect(loadDecibelProductionEconomicEvidenceV1(path, 12_000, 1_000)).toBeNull();
  });

  it('reports the exact staged economic evidence validation failure', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-economic-invalid-')), 'evidence.json');
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: 10_000,
        makerFeeObservedAt: 10_001,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        conservativeGasCostUsd: 0.0005,
        gasCostObservedAt: 10_000,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        adverseSelectionBufferBps: 3,
        adverseSelectionObservedAt: 10_000,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionRawSampleCount: 60,
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRepresentative: true,
      }),
    );
    expect(validateDecibelProductionEconomicEvidenceV1(path, 10_000, 1_000)).toEqual({
      evidence: null,
      reason: 'MAKER_FEE_EVIDENCE_FUTURE',
    });
  });

  it('detects Decibel HTTP 429 through wrapped SDK errors', () => {
    const rateLimit = Object.assign(new Error('Too Many Requests'), { status: 429 });
    expect(
      isDecibelHttpRateLimitErrorV1(
        new Error('PRODUCTION_AUTHENTICATED_READ_REQUIRED', { cause: rateLimit }),
      ),
    ).toBe(true);
  });
  it('shares one HTTP backoff gate across independent readers', () => {
    enterDecibelHTTPReadBackoffV1(30_000, 1_000);
    expect(() => assertDecibelHTTPReadAllowedV1(1_001)).toThrow(
      'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
    );
    expect(() => assertDecibelHTTPReadAllowedV1(31_000)).not.toThrow();
  });

  it('rejects stale and prior-owner telemetry snapshots', () => {
    const current = makeSnapshot({ input: { ...makeSnapshot().input, now: 2_000 } });
    const stale = makeSnapshot({ input: { ...makeSnapshot().input, now: 1_000 } });
    const newer = makeSnapshot({ input: { ...makeSnapshot().input, now: 3_000 } });
    expect(selectNewestDecibelRuntimeSnapshotV1(current, stale, 2, 2)).toBe(current);
    expect(selectNewestDecibelRuntimeSnapshotV1(current, newer, 1, 2)).toBe(current);
    expect(selectNewestDecibelRuntimeSnapshotV1(current, newer, 2, 2)).toBe(newer);
    const projected = {
      ...current,
      input: { ...current.input, now: 5000 },
      venueReadWindow: {
        account: { startedAt: 1000, completedAt: 1100 },
        history: { startedAt: 1000, completedAt: 1100 },
      },
    };
    const freshVenue = {
      ...current,
      input: { ...current.input, now: 4000 },
      venueReadWindow: {
        account: { startedAt: 3000, completedAt: 4000 },
        history: { startedAt: 3000, completedAt: 4000 },
      },
    };
    expect(selectNewestDecibelRuntimeSnapshotV1(projected, freshVenue, 2, 2)).toBe(freshVenue);
    expect(
      selectNewestDecibelRuntimeSnapshotV1(
        freshVenue,
        {
          ...projected,
          input: { ...projected.input, now: 6000 },
        },
        2,
        2,
      ),
    ).toBe(freshVenue);
    const regressedHistory = {
      ...freshVenue,
      venueReadWindow: {
        ...freshVenue.venueReadWindow,
        history: { startedAt: 500, completedAt: 3500 },
      },
    };
    expect(selectNewestDecibelRuntimeSnapshotV1(projected, regressedHistory, 2, 2)).toBe(projected);
  });

  it('preserves prototype reconciliation methods when observing runtime snapshots', async () => {
    const snapshot = makeSnapshot();
    class prototype_source implements DecibelProductionLiveStateSourceV1 {
      public readAuthenticatedSnapshot(): Promise<decibel_production_live_snapshot_v1> {
        return Promise.resolve(snapshot);
      }

      public reconcileIntent(): Promise<'ORDER_OPEN'> {
        return Promise.resolve('ORDER_OPEN');
      }
    }
    const observed: decibel_production_live_snapshot_v1[] = [];
    const Wrapped = wrapDecibelProductionLiveStateSourceV1(
      new prototype_source(),
      (value) => void observed.push(value),
    );

    await expect(Wrapped.readAuthenticatedSnapshot()).resolves.toBe(snapshot);
    await expect(Wrapped.reconcileIntent('intent-1', snapshot, 'order-1')).resolves.toBe(
      'ORDER_OPEN',
    );
    expect(observed).toEqual([snapshot]);
  });
  it('backs off a Decibel HTTP 429 without an immediate retry storm', async () => {
    const rateLimit = Object.assign(new Error('DecibelHttpApi HTTP 429 Too Many Requests'), {
      status: 429,
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_RATE_LIMIT_BACKOFF_MS: '30000',
      },
      readFailuresAt: new Map([[1, rateLimit]]),
    });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
      mutationInvocations: 0,
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
      mutationInvocations: 0,
    });
    expect(test.reads()).toBe(1);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('does not slide a local cooldown: frozen reads resume at the original deadline', async () => {
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(100_000);
    const test = make({
      readFailuresAt: new Map([[1, Object.assign(new Error('HTTP Error 429'), { status: 429 })]]),
    });
    test.orchestrator.setPaused(true);
    try {
      await test.orchestrator.evaluateOnce();
      const deadline = getDecibelHTTPReadBackoffUntilV1();
      for (let now = 101_000; now < deadline; now += 1_000) {
        clock.mockReturnValue(now);
        await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
          blocker: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
          mutationInvocations: 0,
        });
        expect(getDecibelHTTPReadBackoffUntilV1()).toBe(deadline);
        expect(test.reads()).toBe(1);
      }
      clock.mockReturnValue(deadline);
      await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
        blocker: 'OPERATOR_PAUSED',
        mutationInvocations: 0,
      });
      expect(test.reads()).toBe(2);
      expect(test.calls()).toBe(0);
    } finally {
      clock.mockRestore();
      await test.orchestrator.close();
    }
  });

  it('preserves cached authenticated state during backoff and recovers after expiry', async () => {
    const rateLimit = Object.assign(new Error('DecibelHttpApi HTTP 429 Too Many Requests'), {
      status: 429,
    });
    const Positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.002 },
    });
    const Recovered = makeSnapshot({
      input: { ...makeSnapshot().input, now: 1_002, actualInventoryBase: 0.001 },
      sourceStateHash: 'state-recovered',
    });
    const test = make({
      snapshots: [Positioned, Recovered],
      readFailuresAt: new Map([[2, rateLimit]]),
    });
    test.orchestrator.setPaused(true);

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'OPERATOR_PAUSED',
      mutationInvocations: 0,
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
      mutationInvocations: 0,
    });
    expect(test.orchestrator.getLatestSnapshot()?.input.actualInventoryBase).toBe(0.002);
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
      mutationInvocations: 0,
    });
    expect(test.reads()).toBe(2);

    resetDecibelHTTPReadBackoffForTestV1();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'OPERATOR_PAUSED',
    });
    expect(test.orchestrator.getLatestSnapshot()?.input.actualInventoryBase).toBe(0.001);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('keeps economic warming distinct from operator pause and activates without UI resume', async () => {
    const test = make({
      snapshots: [
        makeSnapshot(),
        makeSnapshot({
          input: { ...makeSnapshot().input, now: 1_001 },
          sourceStateHash: 'economic-ready-state',
        }),
        makeSnapshot({
          input: { ...makeSnapshot().input, now: 1_002 },
          sourceStateHash: 'economic-ready-reconcile-state',
        }),
        makeSnapshot({
          input: { ...makeSnapshot().input, now: 1_003 },
          sourceStateHash: 'economic-ready-post-mutation-state',
        }),
      ],
    });
    test.orchestrator.setEconomicWarming(true);

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED',
      mutationInvocations: 0,
    });
    expect(test.orchestrator.isPaused()).toBe(false);
    expect(test.orchestrator.isEconomicWarming()).toBe(true);
    expect(test.calls()).toBe(0);

    test.orchestrator.setEconomicWarming(false);
    expect(test.orchestrator.isPaused()).toBe(false);
    expect(test.orchestrator.isEconomicWarming()).toBe(false);
    const active = await test.orchestrator.evaluateOnce();
    expect(active.blocker).not.toBe('OPERATOR_PAUSED');
    expect(active.blocker).not.toBe('PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED');
    await test.orchestrator.close();
  });

  it('keeps an active flat orchestrator executable while optional adverse evidence warms', async () => {
    const root = mkdtempSync(join(tmpdir(), 'economic-orchestrator-replay-'));
    const path = join(root, 'economic.json');
    const Store = new decibel_raw_ws_bbo_store_v1(
      join(root, 'decibel_production_raw_ws_bbo_v1.jsonl'),
    );
    const environment = { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path };
    const start = 10_000_000;
    let now = start;
    writeFileSync(
      path,
      JSON.stringify({
        observedAt: start,
        makerFeeObservedAt: start,
        makerFeeBps: 0,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        gasCostObservedAt: start,
        conservativeGasCostUsd: 0,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        aptUsd: 1,
        aptUsdObservedAt: start,
        aptUsdSource: 'TEST_VENUE',
        adverseSelectionBufferBps: 1,
        adverseSelectionObservedAt: start - 3_600_001,
        adverseSelectionSource: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        adverseSelectionRegime: 'NORMAL',
        adverseSelectionEffectiveSampleCount: 30,
        adverseSelectionRawSampleCount: 31,
        adverseSelectionRepresentative: true,
      }),
    );
    const base = makeSnapshot();
    let snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      input: {
        ...base.input,
        now,
        metadata: { ...base.input.metadata, observedAt: now },
        book: { ...base.input.book, observedAt: now },
      },
    };
    const test = make({
      readSnapshot: () => snapshot,
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      reconciliationState: 'ORDER_OPEN',
    });
    try {
      for (let i = 0; i <= 30; i++) {
        now = start + i * 30_000;
        Store.append({
          timestamp: now,
          bestBid: 1 + i * 0.000001,
          bestAsk: 1.001 + i * 0.000001,
          regime: 'NORMAL',
          source: 'DECIBEL_WS_BBO',
        });
        hydrateDecibelProductionEconomicEvidenceV1(environment, now, Store);
        const validation = validateDecibelProductionEconomicEvidenceV1(path, now, 3_600_000);
        const progress = inspectDecibelAdverseEvidenceReadinessV1(environment, now, Store);
        snapshot = {
          ...snapshot,
          sourceStateHash: `economic-evidence-${i}`,
          input: {
            ...snapshot.input,
            now,
            metadata: { ...snapshot.input.metadata, observedAt: now },
            book: { ...snapshot.input.book, observedAt: now },
          },
          economicInputs: {
            ...base.economicInputs,
            adverseSelectionBufferBps: validation.evidence?.adverseSelectionBufferBps ?? null,
          },
        };
        test.orchestrator.setEconomicWarming(
          validation.evidence === null,
          progress.blocker ?? undefined,
        );
        const result = await test.orchestrator.evaluateOnce();
        expect(validation.evidence).not.toBeNull();
        if (i === 0) {
          expect(result.action, result.blocker ?? '').toBe('ACKNOWLEDGED');
          expect(test.calls()).toBe(1);
        }
      }
      expect(test.orchestrator.isPaused()).toBe(false);
      const row = test.journal.nonTerminal()[0]!;
      const intent = test.journal.getIntent(row.intentId)!;
      snapshot = {
        ...snapshot,
        input: {
          ...snapshot.input,
          openOrders: [
            {
              venueOrderId: row.venueOrderId!,
              clientOrderId: intent.clientOrderId,
              strategyConfigId: snapshot.input.strategyConfigId,
              market: snapshot.input.market,
              side: intent.side,
              price: intent.price,
              quantity: intent.quantity,
              reduceOnly: false,
              orderType: 'LIMIT',
              timeInForce: 'PostOnly',
              postOnly: true,
            },
          ],
        },
      };
      await test.orchestrator.evaluateOnce();
      const places = test.submitted().filter((mutation) => mutation.action === 'PLACE');
      expect(places.filter((mutation) => mutation.side === intent.side)).toHaveLength(1);
      expect(new Set(places.map((mutation) => mutation.side)).size).toBe(places.length);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('contains a 429 from the direct authenticated position reader without mutation', async () => {
    const rateLimit = Object.assign(new Error('UserPositionsReader HTTP 429'), { status: 429 });
    const positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.002 },
    });
    const test = make({
      snapshots: [positioned],
      authenticatedPositionError: rateLimit,
    });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
      mutationInvocations: 0,
    });
    expect(test.positionReads()).toBe(1);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('reuses a fresh shared authenticated position snapshot during session stop', async () => {
    const now = Date.now();
    const Base = makeSnapshot();
    const positioned = makeSnapshot({
      input: {
        ...Base.input,
        now,
        book: { ...Base.input.book, observedAt: now },
        actualInventoryBase: 0.002,
      },
    });
    const rateLimit = Object.assign(new Error('UserPositionsReader HTTP 429'), { status: 429 });
    const test = make({
      snapshots: [positioned, positioned],
      authenticatedPositionError: rateLimit,
    });
    test.orchestrator.requestSessionUnwind();

    const result = await test.orchestrator.evaluateOnce();

    expect(result.evaluation?.operatingState).toBe('SESSION_UNWIND');
    expect(test.positionReads()).toBe(0);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });
  it('releases the canary latch after authenticated external journal reconciliation', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
      },
      snapshots: Array.from({ length: 10 }, () => makeSnapshot()),
    });
    const first = await test.orchestrator.evaluateOnce();
    expect(first.action).toBe('ACKNOWLEDGED');
    const pending = test.journal.nonTerminal()[0];
    expect(pending).toBeDefined();
    test.journal.transition(pending!.intentId, 'APPLIED', 1_001);

    const second = await test.orchestrator.evaluateOnce();

    expect(second.action).toBe('ACKNOWLEDGED');
    expect(test.calls()).toBe(2);
    await test.orchestrator.close();
  });
  it('requires ledger time beyond signed expiration and fullnode non-commit proof', () => {
    expect(
      isDecibelTransactionExpirationProvenV1({
        ledgerTimestampMicros: '31000000',
        ledgerVersion: '100',
        expirationTimestampMs: 30_000,
        transactionNotFound: true,
      }),
    ).toBe(true);
    expect(
      isDecibelTransactionExpirationProvenV1({
        ledgerTimestampMicros: '30000000',
        ledgerVersion: '100',
        expirationTimestampMs: 30_000,
        transactionNotFound: true,
      }),
    ).toBe(false);
    expect(
      isDecibelTransactionExpirationProvenV1({
        ledgerTimestampMicros: '31000000',
        ledgerVersion: '100',
        expirationTimestampMs: 30_000,
        transactionNotFound: false,
      }),
    ).toBe(false);
  });
  it.each(['0xbuy', '0xsell'])(
    'keeps the Aptos transaction lookup context for %s ACK',
    async (hash) => {
      const calls: string[] = [];
      const ChainClient = {
        getLedgerInfo: () => Promise.resolve({ ledger_timestamp: '1', ledger_version: '1' }),
        getTransactionByHash: (input: { transactionHash: string }) => {
          calls.push(input.transactionHash);
          return Promise.resolve({ type: 'user_transaction' });
        },
      } as unknown as Parameters<typeof createDecibelTransactionEvidenceReaderV1>[0];
      const Reader = createDecibelTransactionEvidenceReaderV1(ChainClient);

      await expect(Reader.readTransactionByHash(hash)).resolves.toBe('COMMITTED');
      expect(calls).toEqual([hash]);
    },
  );
  it('reports the authoritative transaction evidence source instead of a TypeError', async () => {
    const ChainClient = {
      getLedgerInfo: () => Promise.resolve({ ledger_timestamp: '1', ledger_version: '1' }),
      getTransactionByHash: () => Promise.reject(new Error('RPC_UNAVAILABLE')),
    } as unknown as Parameters<typeof createDecibelTransactionEvidenceReaderV1>[0];

    await expect(
      createDecibelTransactionEvidenceReaderV1(ChainClient).readTransactionByHash('0xack'),
    ).rejects.toThrow('PRODUCTION_RECONCILIATION_TRANSACTION_LOOKUP_FAILED');
  });
  it('uses the latest terminal order event and authenticated fill for recovery', () => {
    const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
    expect(
      resolveDecibelRecentOrderEvidenceV1(
        [
          {
            market,
            client_order_id: 'd1b-test',
            order_id: 'venue-order',
            orig_size: 0.00014,
            remaining_size: 0.00014,
            price: 80_000,
            is_buy: true,
            status: 'Open',
          },
          {
            market,
            client_order_id: 'd1b-test',
            order_id: 'venue-order',
            orig_size: 0.00014,
            remaining_size: 0,
            price: 80_000,
            is_buy: true,
            status: 'Filled',
          },
        ],
        [
          {
            account: 'subaccount',
            market,
            source: 'OrderFill',
            trade_id: 'fill-1',
            size: 0.00014,
            price: 80_000,
            fee_amount: 0,
            is_rebate: false,
            order_id: 'venue-order',
            transaction_unix_ms: 2,
            client_order_id: 'd1b-test',
          },
        ],
        'venue-order',
      ),
    ).toBe('FULL_FILL');
  });
  it('does not treat a per-fill FILLED history row with residual quantity as terminal', () => {
    const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
    expect(
      resolveDecibelRecentOrderEvidenceV1(
        [
          {
            market,
            client_order_id: 'd1b-partial',
            order_id: 'venue-partial',
            orig_size: 0.0003,
            remaining_size: 0.00027,
            price: 81_188.8,
            is_buy: true,
            status: 'Filled',
          },
        ],
        [
          {
            account: 'subaccount',
            market,
            source: 'OrderFill',
            trade_id: 'fill-partial-1',
            size: 0.00003,
            price: 81_188.8,
            fee_amount: 0,
            is_rebate: false,
            order_id: 'venue-partial',
            transaction_unix_ms: 2,
            client_order_id: 'd1b-partial',
          },
        ],
        'venue-partial',
        0.0003,
      ),
    ).toBe('PARTIAL_FILL');
  });
  it('aggregates Decibel fill fragments sharing one trade id before canonical reconciliation', () => {
    const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
    const fragment = {
      account: 'subaccount',
      market,
      source: 'OrderFill' as const,
      trade_id: '129185830884293093972642237710341',
      price: 80_822.4,
      fee_amount: 0,
      is_rebate: false,
      order_id: '170141591643962505379578640564265943040',
      transaction_unix_ms: 1_792_813_548_788,
      client_order_id: 'd1bc90c174d453996d89e1754b56722a',
    };
    const fragments = [
      { ...fragment, size: 0.0001 },
      { ...fragment, size: 0.00017 },
    ];

    expect(aggregateDecibelTradeHistoryFragmentsV1(fragments)).toMatchObject([
      { trade_id: fragment.trade_id, size: 0.00027 },
    ]);
    expect(
      resolveDecibelRecentOrderEvidenceV1(
        [
          {
            market,
            client_order_id: fragment.client_order_id,
            order_id: fragment.order_id,
            orig_size: 0.0003,
            remaining_size: 0,
            price: fragment.price,
            is_buy: true,
            status: 'Filled',
          },
        ],
        [{ ...fragment, trade_id: 'initial-fill', size: 0.00003 }, ...fragments],
        fragment.order_id,
        0.0003,
      ),
    ).toBe('FULL_FILL');
  });
  it('rejects fragment rows that reuse a trade id with contradictory immutable identity', () => {
    const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
    const fragment = {
      account: 'subaccount',
      market,
      source: 'OrderFill' as const,
      trade_id: 'conflicting-fill',
      size: 0.0001,
      price: 80_000,
      fee_amount: 0,
      is_rebate: false,
      order_id: 'venue-order',
      transaction_unix_ms: 2,
      client_order_id: 'client-order',
    };
    expect(() =>
      aggregateDecibelTradeHistoryFragmentsV1([fragment, { ...fragment, price: 80_000.1 }]),
    ).toThrow('PRODUCTION_LIVE_SOURCE_FILL_FRAGMENT_IDENTITY_CONFLICT');
  });
  it('reads every bounded history page instead of silently excluding later evidence', async () => {
    const rows = Array.from({ length: 401 }, (_, index) => index);
    const offsets: number[] = [];
    await expect(
      readDecibelPaginatedHistoryV1({
        readPage: (offset, limit) => {
          offsets.push(offset);
          return Promise.resolve({
            items: rows.slice(offset, offset + limit),
            totalCount: rows.length,
          });
        },
      }),
    ).resolves.toEqual(rows);
    expect(offsets).toEqual([0, 200, 400]);
  });
  it('continues a short page when the declared total proves more history exists', async () => {
    const offsets: number[] = [];
    await expect(
      readDecibelPaginatedHistoryV1({
        readPage: (offset) => {
          offsets.push(offset);
          return Promise.resolve({ items: [offset], totalCount: 3 });
        },
      }),
    ).resolves.toEqual([0, 1, 2]);
    expect(offsets).toEqual([0, 1, 2]);
  });
  it('rejects empty incomplete history and changing totals', async () => {
    await expect(
      readDecibelPaginatedHistoryV1({
        readPage: () => Promise.resolve({ items: [], totalCount: 1 }),
      }),
    ).rejects.toThrow('HISTORY_INCOMPLETE');
    await expect(
      readDecibelPaginatedHistoryV1({
        readPage: (offset) => Promise.resolve({ items: [offset], totalCount: offset ? 3 : 2 }),
      }),
    ).rejects.toThrow('HISTORY_TOTAL_CHANGED');
  });
  it('uses exact fill identity even when the corresponding order-history row is unavailable', () => {
    const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
    const trade = {
      account: 'subaccount',
      market,
      source: 'OrderFill' as const,
      trade_id: 'fill-only',
      size: 0.0003,
      price: 81_000,
      fee_amount: 0,
      is_rebate: false,
      order_id: 'venue-fill-only',
      transaction_unix_ms: 2,
      client_order_id: 'client-fill-only',
    };
    expect(resolveDecibelRecentOrderEvidenceV1([], [trade], 'venue-fill-only', 0.0003)).toBe(
      'FULL_FILL',
    );
    expect(
      resolveDecibelRecentOrderEvidenceV1(
        [],
        [{ ...trade, size: 0.0001 }],
        'venue-fill-only',
        0.0003,
      ),
    ).toBe('PARTIAL_FILL');
    expect(resolveDecibelRecentOrderEvidenceV1([], [trade], 'other-order', 0.0003)).toBeNull();
  });
  it('keeps committed or formerly open orders unresolved when terminal evidence is absent', async () => {
    let historyReads = 0;
    const Reader = {
      readOrderHistory: () => {
        historyReads += 1;
        return Promise.resolve([]);
      },
      readTradeHistory: () => Promise.resolve([]),
      readTransactionByHash: () => Promise.resolve('COMMITTED' as const),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20_000,
    );
    const identity = {
      clientOrderId: 'false-flat-client',
      createdAt: 10_000,
      transactionHash: '0xcommitted',
      requestedQuantity: 0.0003,
    };
    await expect(
      Source.reconcileIntent('false-flat-intent', makeSnapshot(), 'formerly-open', identity),
    ).rejects.toThrow('PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING');
    expect(historyReads).toBe(1);
  });
  it('never resolves an unidentified intent from unrelated open orders or fills', async () => {
    const Source = new decibel_production_live_state_source_v1(
      {} as DecibelProductionLiveAuthenticatedReaderV1,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20000,
    );
    const unrelated = makeSnapshot();
    await expect(Source.reconcileIntent('unknown-owner', unrelated)).rejects.toThrow(
      'PRODUCTION_RECONCILIATION_AMBIGUOUS',
    );
    await expect(
      Source.reconcileIntent('unknown-owner', {
        ...unrelated,
        input: {
          ...unrelated.input,
          openOrders: [
            {
              venueOrderId: 'unrelated',
              clientOrderId: 'unrelated-client',
              strategyConfigId: unrelated.input.strategyConfigId,
              market: unrelated.input.market,
              side: 'BUY',
              price: 100,
              quantity: 0.001,
              reduceOnly: false,
              orderType: 'LIMIT',
              timeInForce: 'PostOnly',
              postOnly: true,
            },
          ],
        },
      }),
    ).rejects.toThrow('PRODUCTION_RECONCILIATION_AMBIGUOUS');
  });
  it('discovers delayed terminal indexing on a later bounded reconciliation read', async () => {
    const starts: number[] = [];
    let indexed = false;
    const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
    const Reader = {
      readOrderHistory: (_subaccount: string, startTimestamp: number) => {
        starts.push(startTimestamp);
        return Promise.resolve(
          indexed
            ? [
                {
                  market,
                  client_order_id: 'delayed-client',
                  order_id: 'delayed-order',
                  orig_size: 0.0003,
                  remaining_size: 0,
                  price: 81_000,
                  is_buy: false,
                  status: 'Cancelled',
                },
              ]
            : [],
        );
      },
      readTradeHistory: () => Promise.resolve([]),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20_000,
    );
    const identity = {
      clientOrderId: 'delayed-client',
      createdAt: 10_000,
      transactionHash: null,
      requestedQuantity: 0.0003,
    };
    await expect(
      Source.reconcileIntent('delayed-intent', makeSnapshot(), 'delayed-order', identity),
    ).rejects.toThrow('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
    indexed = true;
    await expect(
      Source.reconcileIntent('delayed-intent', makeSnapshot(), 'delayed-order', identity),
    ).resolves.toBe('CANCELLED_EXTERNALLY');
    expect(starts).toEqual([10_000, 10_000]);
  });
  it('rejects contradictory terminal observations that match only one identity field', async () => {
    const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
    const Reader = {
      readOrderHistory: () =>
        Promise.resolve([
          {
            market,
            client_order_id: 'different-client',
            order_id: 'expected-order',
            orig_size: 0.0003,
            remaining_size: 0,
            price: 81_000,
            is_buy: false,
            status: 'Cancelled',
          },
          {
            market,
            client_order_id: 'expected-client',
            order_id: 'different-order',
            orig_size: 0.0003,
            remaining_size: 0,
            price: 81_000,
            is_buy: false,
            status: 'Cancelled',
          },
        ]),
      readTradeHistory: () => Promise.resolve([]),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20_000,
    );
    await expect(
      Source.reconcileIntent('exact-intent', makeSnapshot(), 'expected-order', {
        clientOrderId: 'expected-client',
        createdAt: 10_000,
        transactionHash: null,
        requestedQuantity: 0.0003,
      }),
    ).rejects.toThrow('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
  });
  it('accepts and clamps minor future book clock skew within the production tolerance', () => {
    expect(normalizeDecibelProductionBookTimestampV1(6_999, 2_000, 5_000)).toEqual({
      observedAt: 2_000,
      clockSkewMs: 4_999,
      clamped: true,
    });
    expect(normalizeDecibelProductionBookTimestampV1(2_000, 2_000, 5_000)).toEqual({
      observedAt: 2_000,
      clockSkewMs: 0,
      clamped: false,
    });
  });

  it('fails closed when future book clock skew exceeds the production tolerance', () => {
    expect(() => normalizeDecibelProductionBookTimestampV1(7_001, 2_000, 5_000)).toThrow(
      'PRODUCTION_LIVE_SOURCE_BOOK_FUTURE',
    );
  });
  it('uses a validated flat checkpoint for a pre-submission intent without a venue order id', () => {
    const snapshot = makeSnapshot({
      authenticatedFlatNeutralization: {
        checkpointBodyHashSha256: 'checkpoint',
        resyncTimestamp: 2_000,
        outOfBandFillIds: ['fill-1'],
      },
    });
    expect(resolveDecibelAuthenticatedFlatCheckpointNeutralizationV1(snapshot)).toBe(
      'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED',
    );
  });
  it('never uses an account-level flat checkpoint as terminal evidence for an acknowledged order', () => {
    const snapshot = makeSnapshot({
      authenticatedFlatNeutralization: {
        checkpointBodyHashSha256: 'historical-checkpoint',
        resyncTimestamp: 2_000,
        outOfBandFillIds: ['historical-fill'],
      },
    });
    expect(
      resolveDecibelAuthenticatedFlatCheckpointNeutralizationV1(snapshot, 'acknowledged-order'),
    ).toBeNull();
  });
  it('defaults disabled and requires production mode', () => {
    expect(
      parseDecibelProductionLiveConfigurationV1({ DECIBEL_EXECUTION_MODE: 'production' }),
    ).toMatchObject({
      releaseStage: 'DISABLED',
      executorEnabled: false,
      dryRun: false,
      readRetryCount: 3,
      readRetryBackoffMs: 250,
      requoteHysteresisFraction: 0.5,
      repriceMinimumTicks: 50,
      minimumActiveOrderLifetimeMs: 30_000,
    });
    expect(() => parseDecibelProductionLiveConfigurationV1({})).toThrow();
  });

  it('prepares dry-run intent with zero executor calls', async () => {
    const test = make();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'DRY_RUN_PREPARED',
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(0);
    expect(test.journal.nonTerminal()).toEqual([]);
    await test.orchestrator.close();
  });

  it('applies the submission mutation budget before a dry-run intent is prepared', async () => {
    const test = make({ snapshots: Array.from({ length: 4 }, () => makeSnapshot()) });
    const first = await test.orchestrator.evaluateOnce();
    expect(first.action).toBe('DRY_RUN_PREPARED');
    for (let index = 0; index < 10; index += 1) test.journal.attempt(first.intentId!, 1_000);
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'BLOCKED',
      blocker: 'EXECUTION_MUTATION_BUDGET_BLOCKED',
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('holds residual session-unwind dust below venue minimum without lifecycle churn', async () => {
    const base = makeSnapshot();
    const snapshot = makeSnapshot({
      input: {
        ...base.input,
        actualInventoryBase: 0.0005,
        targetExternalMakerVolumeUsd: 0,
      },
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 50,
      availableMarginUsd: 1,
      maximumEffectiveLeverage: 40,
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
      },
      snapshots: [snapshot, snapshot],
    });
    // A reached target now drains through TP; dust handling belongs to the explicit unwind.
    test.orchestrator.requestSessionUnwind();

    const result = await test.orchestrator.evaluateOnce();
    expect(result).toMatchObject({
      action: 'HOLD',
      blocker: 'DUST_BELOW_MIN_SIZE',
      mutationInvocations: 0,
      evaluation: {
        status: 'STOPPING',
        operatingState: 'DUST_BELOW_MIN_SIZE',
        desiredBid: null,
        desiredAsk: null,
      },
    });
    const askGate = result.controlSnapshot.gates.find((gate) => gate.gate === 'ASK_ADMISSION');
    expect(askGate?.reason).toBe('DUST_BELOW_MIN_SIZE');
    expect(askGate?.persistence).toBe('PERSISTENT');
    expect(askGate?.numericInputs.residualInventoryUsd).toBeCloseTo(0.05005, 6);
    expect(askGate?.numericInputs.minimumSize).toBe(0.001);
    expect(askGate?.numericInputs.minimumNotionalUsd).toBe(10);
    expect(test.calls()).toBe(0);
    expect(test.reconciliations()).toBe(0);
    expect(test.journal.countIntents()).toBe(0);
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'DUST_BELOW_MIN_SIZE',
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(0);
    expect(test.journal.countIntents()).toBe(0);
    await test.orchestrator.close();
  });

  it('supports three consecutive dry-run cycles without false reconciliation', async () => {
    const test = make({ snapshots: Array.from({ length: 6 }, () => makeSnapshot()) });
    const actions = [];
    for (let cycle = 0; cycle < 3; cycle += 1)
      actions.push((await test.orchestrator.evaluateOnce()).action);
    expect(actions).toEqual(['DRY_RUN_PREPARED', 'DRY_RUN_PREPARED', 'DRY_RUN_PREPARED']);
    expect(test.reconciliations()).toBe(0);
    expect(test.calls()).toBe(0);
    expect(test.journal.nonTerminal()).toEqual([]);
    await test.orchestrator.close();
  });

  it('assigns a distinct client order identity to each new place mutation', async () => {
    const test = make({ snapshots: Array.from({ length: 4 }, () => makeSnapshot()) });
    const first = await test.orchestrator.evaluateOnce();
    const second = await test.orchestrator.evaluateOnce();
    const firstIntent = test.journal.getIntent(first.intentId ?? '');
    const secondIntent = test.journal.getIntent(second.intentId ?? '');
    expect(firstIntent?.action).toBe('PLACE');
    expect(secondIntent?.action).toBe('PLACE');
    expect(secondIntent?.clientOrderId).not.toBe(firstIntent?.clientOrderId);
    expect(firstIntent?.clientOrderId).toHaveLength(32);
    expect(secondIntent?.clientOrderId).toHaveLength(32);
    await test.orchestrator.close();
  });

  it('places an independent ask after an acknowledged bid is authoritatively open', async () => {
    const empty = makeSnapshot();
    const bidOrder = {
      venueOrderId: 'v1',
      clientOrderId: `d1b${'a'.repeat(29)}`,
      strategyConfigId: empty.input.strategyConfigId,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side: 'BUY' as const,
      price: 100,
      quantity: 0.001,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
    };
    const withBid = makeSnapshot({
      input: { ...empty.input, openOrders: [bidOrder] },
      sourceStateHash: 'state-with-bid',
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
      },
      snapshots: [empty, empty, withBid, withBid],
      reconciliationState: 'ORDER_OPEN',
    });
    const first = await test.orchestrator.evaluateOnce();
    expect(first.action).toBe('ACKNOWLEDGED');
    const placed = test.journal.getIntent(first.intentId!);
    expect(placed?.action).toBe('PLACE');
    if (placed?.action !== 'PLACE') throw new Error('REPLAY_PLACE_REQUIRED');
    Object.assign(bidOrder, {
      clientOrderId: placed.clientOrderId,
      price: placed.price,
      quantity: placed.quantity,
      reduceOnly: placed.reduceOnly,
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'ACKNOWLEDGED',
    });
    expect(test.submitted()).toEqual([
      { action: 'PLACE', side: 'BUY' },
      { action: 'PLACE', side: 'SELL' },
    ]);
    expect(test.journal.nonTerminal()).toHaveLength(2);
    await test.orchestrator.close();
  });

  it('atomically suppresses adjacent same-side placements across runtime owners', async () => {
    const journalPath = join(mkdtempSync(join(tmpdir(), 'decibel-side-owner-')), 'journal.sqlite');
    const Positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.002 },
      maximumAbsPositionBase: 0.01,
    });
    const Changed = makeSnapshot({ ...Positioned, sourceStateHash: 'changed-source-state' });
    const environment = {
      DECIBEL_EXECUTION_MODE: 'production',
      DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
      DECIBEL_EXECUTOR_ENABLED: 'true',
      DECIBEL_EXECUTOR_DRY_RUN: 'false',
    };
    const First = make({ journalPath, environment, snapshots: [Positioned, Positioned] });
    const Second = make({ journalPath, environment, snapshots: [Changed, Changed] });
    First.orchestrator.requestRiskReduction();
    Second.orchestrator.requestRiskReduction();

    const results = await Promise.all([
      First.orchestrator.evaluateOnce(),
      Second.orchestrator.evaluateOnce(),
    ]);

    expect(results.filter((result) => result.action === 'ACKNOWLEDGED')).toHaveLength(1);
    expect(results.filter((result) => result.action === 'DUPLICATE_SUPPRESSED')).toHaveLength(1);
    expect(First.calls() + Second.calls()).toBe(1);
    expect([...First.submitted(), ...Second.submitted()]).toEqual([
      { action: 'PLACE', side: 'SELL' },
    ]);
    expect(First.journal.findNonTerminalPlaceBySide('SELL')).toMatchObject({
      status: 'ACKNOWLEDGED',
    });
    await First.orchestrator.close();
    await Second.orchestrator.close();
  });

  it('suppresses external CANCEL when fresh authoritative evidence proves the target terminal', async () => {
    const journalPath = join(
      mkdtempSync(join(tmpdir(), 'decibel-cancel-terminal-race-')),
      'journal.sqlite',
    );
    const base = makeSnapshot();
    const openOrder = {
      venueOrderId: 'terminal-before-cancel',
      clientOrderId: `d1b${'b'.repeat(29)}`,
      strategyConfigId: base.input.strategyConfigId,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side: 'BUY' as const,
      price: 100,
      quantity: 0.001,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
    };
    const snapshot = makeSnapshot({
      input: { ...base.input, openOrders: [openOrder] },
      sourceStateHash: 'cancel-target-snapshot',
    });
    const terminalSnapshot = makeSnapshot({
      input: { ...base.input, openOrders: [] },
      terminalOrderEvidence: [
        {
          venueOrderId: openOrder.venueOrderId,
          clientOrderId: openOrder.clientOrderId,
          state: 'FILLED',
          originalQuantity: openOrder.quantity,
          remainingQuantity: 0,
        },
      ],
      sourceStateHash: 'cancel-target-terminal-snapshot',
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
      },
      snapshots: [snapshot, snapshot, terminalSnapshot, snapshot, snapshot, snapshot],
      reconciliationResults: ['ORDER_OPEN', 'FULL_FILL'],
      cancelTargetState: 'FULL_FILL',
      journalPath,
    });
    const tracked = buildDecibelExecutionIntentV1({
      sessionId: base.input.sessionId,
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: openOrder.price,
      quantity: openOrder.quantity,
      tickSize: base.input.metadata.tickSize,
      lotSize: base.input.metadata.lotSize,
      clientOrderId: openOrder.clientOrderId,
      knownVenueOrderId: null,
      sourceStateHash: 'tracked-source',
      strategyDecisionHash: 'tracked-decision',
      createdAt: 1,
    });
    test.journal.prepare(tracked);
    test.journal.transition(tracked.intentId, 'ACKNOWLEDGED', 2, openOrder.venueOrderId);
    test.orchestrator.requestCancelAll();

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      blocker: 'CANCEL_SUPPRESSED_TARGET_TERMINAL',
      mutationInvocations: 0,
    });
    expect(test.journal.get(tracked.intentId)?.status).toBe('APPLIED');
    expect(test.journal.getLatestReconciliationProvenance(tracked.intentId)).toMatchObject({
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      venueStatus: 'FILLED',
      venueOrderId: openOrder.venueOrderId,
      clientOrderId: openOrder.clientOrderId,
      remainingQuantity: 0,
    });
    expect(test.journal.getActiveIdentityConflict()).toBeNull();
    expect(test.calls()).toBe(0);

    const delayedOpen = await test.orchestrator.evaluateOnce();
    expect(delayedOpen.blocker).not.toBe('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
    expect(test.journal.getActiveIdentityConflict()).toBeNull();
    expect(test.journal.get(tracked.intentId)?.status).toBe('APPLIED');
    await test.orchestrator.close();

    const restarted = new decibel_execution_lifecycle_journal_v1(journalPath);
    expect(restarted.get(tracked.intentId)?.status).toBe('APPLIED');
    expect(restarted.getActiveIdentityConflict()).toBeNull();
    expect(
      restarted.adoptAuthoritativeOpenOrder({
        intent: tracked,
        venueOrderId: openOrder.venueOrderId,
        observedAt: 10_000,
        remainingQuantity: openOrder.quantity,
      }),
    ).toEqual({ outcome: 'STALE_OPEN_IGNORED', intentId: tracked.intentId });
    expect(restarted.getActiveIdentityConflict()).toBeNull();
    restarted.close();
  });

  it('restarts with a durable next mutation identity without reconciling a dry-run-only intent', async () => {
    const journalPath = join(
      mkdtempSync(join(tmpdir(), 'decibel-live-restart-')),
      'journal.sqlite',
    );
    const first = make({ journalPath });
    const firstCycle = await first.orchestrator.evaluateOnce();
    expect(firstCycle).toMatchObject({
      action: 'DRY_RUN_PREPARED',
    });
    await first.orchestrator.close();
    const restarted = make({ journalPath });
    const restartedCycle = await restarted.orchestrator.evaluateOnce();
    expect(restartedCycle).toMatchObject({
      action: 'DRY_RUN_PREPARED',
      mutationInvocations: 0,
    });
    expect(restartedCycle.intentId).not.toBe(firstCycle.intentId);
    expect(restarted.reconciliations()).toBe(0);
    expect(restarted.calls()).toBe(0);
    await restarted.orchestrator.close();
  });

  it('restores acknowledged open-order side ownership idempotently after abrupt restart', async () => {
    const journalPath = join(mkdtempSync(join(tmpdir(), 'decibel-ack-open-')), 'journal.sqlite');
    const base = makeSnapshot();
    const clientOrderId = `d1s${'a'.repeat(29)}`;
    const venueOrderId = 'venue-restored-ask';
    const intent = buildDecibelExecutionIntentV1({
      sessionId: base.input.sessionId,
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'SELL',
      price: 101,
      quantity: 0.001,
      tickSize: base.input.metadata.tickSize,
      lotSize: base.input.metadata.lotSize,
      clientOrderId,
      knownVenueOrderId: null,
      sourceStateHash: 'before-crash',
      strategyDecisionHash: 'acknowledged-before-crash',
      createdAt: 1,
    });
    const SeedJournal = new decibel_execution_lifecycle_journal_v1(journalPath);
    SeedJournal.prepare(intent);
    SeedJournal.transition(intent.intentId, 'ACKNOWLEDGED', 2, venueOrderId);
    SeedJournal.close();
    const snapshot = makeSnapshot({
      input: {
        ...base.input,
        openOrders: [
          {
            venueOrderId,
            clientOrderId,
            strategyConfigId: base.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'SELL',
            price: 101,
            quantity: 0.001,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
            reduceOnly: false,
          },
        ],
      },
    });
    for (let restart = 0; restart < 2; restart += 1) {
      const Runtime = make({
        journalPath,
        snapshots: [snapshot, snapshot],
        reconciliationState: 'ORDER_OPEN',
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      Runtime.orchestrator.setPaused(true);
      await expect(Runtime.orchestrator.evaluateOnce()).resolves.toMatchObject({
        action: 'HOLD',
        blocker: 'OPERATOR_PAUSED',
        mutationInvocations: 0,
      });
      expect(Runtime.journal.findNonTerminalPlaceBySide('SELL')).toMatchObject({
        intentId: intent.intentId,
        status: 'ACKNOWLEDGED',
        venueOrderId,
      });
      expect(Runtime.calls()).toBe(0);
      await Runtime.orchestrator.close();
    }
  });

  it('applies terminal acknowledged recovery once and never resubmits after restart', async () => {
    const journalPath = join(mkdtempSync(join(tmpdir(), 'decibel-ack-filled-')), 'journal.sqlite');
    const base = makeSnapshot();
    const intent = buildDecibelExecutionIntentV1({
      sessionId: base.input.sessionId,
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 99,
      quantity: 0.001,
      tickSize: base.input.metadata.tickSize,
      lotSize: base.input.metadata.lotSize,
      clientOrderId: `d1b${'b'.repeat(29)}`,
      knownVenueOrderId: null,
      sourceStateHash: 'before-crash',
      strategyDecisionHash: 'filled-before-crash',
      createdAt: 1,
    });
    const SeedJournal = new decibel_execution_lifecycle_journal_v1(journalPath);
    SeedJournal.prepare(intent);
    SeedJournal.transition(intent.intentId, 'ACKNOWLEDGED', 2, 'venue-filled-bid');
    SeedJournal.close();
    const Runtime = make({
      journalPath,
      snapshots: [base],
      reconciliationState: 'FULL_FILL',
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
    });
    await expect(Runtime.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      blocker: null,
      mutationInvocations: 0,
    });
    expect(Runtime.journal.get(intent.intentId)?.status).toBe('APPLIED');
    expect(Runtime.calls()).toBe(0);
    await Runtime.orchestrator.close();
    const RestartedJournal = new decibel_execution_lifecycle_journal_v1(journalPath);
    expect(RestartedJournal.nonTerminal()).toEqual([]);
    expect(RestartedJournal.get(intent.intentId)?.status).toBe('APPLIED');
    RestartedJournal.close();
  });

  it('re-evaluates a changed authenticated state and submits only the refreshed action', async () => {
    const test = make({
      snapshots: [makeSnapshot(), makeSnapshot({ sourceStateHash: 'state-2' })],
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'DRY_RUN_PREPARED',
      blocker: null,
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('fails closed on stale authenticated market state', async () => {
    const stale = makeSnapshot();
    const test = make({
      snapshots: [
        {
          ...stale,
          input: { ...stale.input, now: 10_000, book: { ...stale.input.book, observedAt: 1 } },
        },
      ],
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'BLOCKED',
      blocker: 'MARKET_DATA_STALE',
    });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('blocks a strategy-shaped client ID without a durable original PLACE owner', async () => {
    const base = makeSnapshot();
    const current = {
      venueOrderId: 'existing',
      clientOrderId: `dpvr1-b-0-${'a'.repeat(32)}`,
      strategyConfigId: base.input.strategyConfigId,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side: 'BUY' as const,
      price: 100,
      quantity: 0.001,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
    };
    const snapshot = {
      ...base,
      input: { ...base.input, openOrders: [current] },
    };
    const test = make({ snapshots: [snapshot], reconciliationState: 'ORDER_OPEN' });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'BLOCKED',
      blocker: 'PRODUCTION_CURRENT_ORDER_OWNERSHIP_UNVERIFIED',
      mutationInvocations: 0,
    });
    expect(test.journal.countIntents()).toBe(0);
    expect(test.journal.nonTerminal()).toHaveLength(0);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('lets exact terminal fill evidence dominate a delayed stale open-order observation', async () => {
    const base = makeSnapshot();
    const clientOrderId = `dpvr1-s-0-${'b'.repeat(32)}`;
    const venueOrderId = 'terminal-venue-order';
    const original = buildDecibelExecutionIntentV1({
      sessionId: 'session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'SELL',
      price: 100.2,
      quantity: 0.001,
      tickSize: 0.1,
      lotSize: 0.001,
      clientOrderId,
      knownVenueOrderId: null,
      sourceStateHash: 'original-state',
      strategyDecisionHash: 'original-decision',
      createdAt: 1_000,
    });
    const staleOpen = {
      venueOrderId,
      clientOrderId,
      strategyConfigId: base.input.strategyConfigId,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side: 'SELL' as const,
      price: 100.2,
      quantity: 0.001,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
    };
    const snapshot = {
      ...base,
      input: { ...base.input, now: 3_505, openOrders: [staleOpen] },
      terminalOrderEvidence: [
        {
          venueOrderId,
          clientOrderId,
          state: 'FILLED' as const,
          originalQuantity: 0.001,
          remainingQuantity: 0,
        },
      ],
    };
    const test = make({ snapshots: [snapshot, snapshot, snapshot, snapshot] });
    test.journal.prepare(original);
    test.journal.transition(original.intentId, 'ACKNOWLEDGED', 1_100, venueOrderId);
    test.journal.applyAuthoritativeReconciliation({
      intentId: original.intentId,
      reconciliationState: 'FULL_FILL',
      terminalStatus: 'APPLIED',
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier: `venueOrderId:${venueOrderId}`,
      venueStatus: 'FILLED',
      remainingQuantity: 0,
      transactionHash: '0xfilled',
      venueOrderId,
      clientOrderId,
      observedAt: 1_000,
    });

    const result = await test.orchestrator.evaluateOnce();
    expect(result.blocker).not.toBe('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
    expect(result.mutationInvocations).toBe(0);
    expect(test.journal.get(original.intentId)?.status).toBe('APPLIED');
    expect(test.journal.getLatestReconciliationProvenance(original.intentId)).toMatchObject({
      venueStatus: 'FILLED',
      venueOrderId,
      clientOrderId,
    });
    expect(test.journal.getActiveIdentityConflict()).toBeNull();
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('keeps a durable identity conflict blocking unrelated PLACE across refreshed snapshots', async () => {
    const test = make({ snapshots: Array.from({ length: 4 }, () => makeSnapshot()) });
    test.journal.recordIdentityConflict('conflicting-terminal-intent', 900);

    for (let cycle = 0; cycle < 2; cycle += 1)
      await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
        action: 'RECONCILE_ONLY',
        intentId: 'conflicting-terminal-intent',
        blocker: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
        mutationInvocations: 0,
      });
    expect(test.calls()).toBe(0);
    expect(test.journal.getExecutionReconciliationBlocker()).toBe(
      'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
    );
    await test.orchestrator.close();
  });

  it('does not duplicate an existing non-terminal owner during authenticated adoption', async () => {
    const base = makeSnapshot();
    const clientOrderId = `dpvr1-b-0-${'c'.repeat(32)}`;
    const venueOrderId = 'owned-venue-order';
    const owned = buildDecibelExecutionIntentV1({
      sessionId: 'session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 100,
      quantity: 0.001,
      tickSize: 0.1,
      lotSize: 0.001,
      clientOrderId,
      knownVenueOrderId: null,
      sourceStateHash: 'owned-state',
      strategyDecisionHash: 'owned-decision',
      createdAt: 900,
    });
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        openOrders: [
          {
            venueOrderId,
            clientOrderId,
            strategyConfigId: base.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'BUY' as const,
            price: 100,
            quantity: 0.001,
            orderType: 'LIMIT' as const,
            timeInForce: 'PostOnly' as const,
            postOnly: true as const,
          },
        ],
      },
    };
    const test = make({ snapshots: [snapshot, snapshot], reconciliationState: 'ORDER_OPEN' });
    test.journal.prepare(owned);
    test.journal.transition(owned.intentId, 'ACKNOWLEDGED', 950, venueOrderId);

    await test.orchestrator.evaluateOnce();
    expect(test.journal.getOrderLineageByVenueOrderId(venueOrderId)).toEqual([
      expect.objectContaining({ intentId: owned.intentId }),
    ]);
    expect(test.journal.get(owned.intentId)?.status).toBe('ACKNOWLEDGED');
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('fails closed when adoption reuses a client identity with a different venue order', async () => {
    const base = makeSnapshot();
    const clientOrderId = `dpvr1-b-0-${'d'.repeat(32)}`;
    const owned = buildDecibelExecutionIntentV1({
      sessionId: 'session',
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 100,
      quantity: 0.001,
      tickSize: 0.1,
      lotSize: 0.001,
      clientOrderId,
      knownVenueOrderId: null,
      sourceStateHash: 'owned-state',
      strategyDecisionHash: 'owned-decision',
      createdAt: 900,
    });
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        openOrders: [
          {
            venueOrderId: 'contradictory-venue-order',
            clientOrderId,
            strategyConfigId: base.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'BUY' as const,
            price: 100,
            quantity: 0.001,
            orderType: 'LIMIT' as const,
            timeInForce: 'PostOnly' as const,
            postOnly: true as const,
          },
        ],
      },
    };
    const test = make({ snapshots: [snapshot] });
    test.journal.prepare(owned);
    test.journal.transition(owned.intentId, 'ACKNOWLEDGED', 950, 'original-venue-order');
    test.journal.transition(owned.intentId, 'APPLIED', 975, 'original-venue-order');

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      intentId: owned.intentId,
      blocker: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
      mutationInvocations: 0,
    });
    expect(test.journal.countIntents()).toBe(1);
    expect(test.journal.get(owned.intentId)?.venueOrderId).toBe('original-venue-order');
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('manages an authenticated startup position without treating it as foreign activity', async () => {
    const base = makeSnapshot();
    const positioned = {
      ...base,
      input: {
        ...base.input,
        actualInventoryBase: 0.001,
        inventoryDirectionProven: true,
        manualOrDelegatedActivityCount: 0,
      },
    };
    const test = make({ snapshots: [positioned, positioned] });
    const result = await test.orchestrator.evaluateOnce();
    expect(result.blocker).not.toBe('STRATEGY_ACTIVITY_EXCLUSIVITY_LOST');
    expect(result.evaluation?.strategyState).toBe('LONG_RECYCLE');
    expect(result.evaluation?.operatingState).toBe('NORMAL_MM');
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('returns safe raw market identity diagnostics only for an exclusivity blocker', async () => {
    const base = makeSnapshot();
    const marketScopeDiagnostics = {
      rawPositionMarketIdentities: [
        { market: 'dell/usd', marketAddress: '0xdell', marketId: null },
      ],
      rawOpenOrderMarketIdentities: [],
      rawFillMarketIdentities: [],
      rawTwapMarketIdentities: [],
      rawTpSlMarketIdentities: [],
      historicalOutOfBandBTCFillCount: 0,
      activeTwapCount: 1,
      activeTpSlCount: 0,
      activeBulkOrderCount: 0,
    };
    const blocked = {
      ...base,
      marketScopeDiagnostics,
      input: { ...base.input, activeTwapCount: 1 },
    };
    const test = make({ snapshots: [blocked] });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'BLOCKED',
      blocker: 'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST',
      marketScopeDiagnostics,
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('unknown PLACE is recovered by reconciliation without resubmission', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), makeSnapshot()],
      placeOutcome: 'PLACE_OUTCOME_UNKNOWN',
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILIATION_REQUIRED',
    });
    expect(test.calls()).toBe(1);
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
    });
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('leaves reconcile-only after a verified open order and resumes evaluation', async () => {
    const reconciledSnapshot = makeSnapshot();
    const openOrderSnapshot = Object.freeze({
      ...reconciledSnapshot,
      input: Object.freeze({
        ...reconciledSnapshot.input,
        openOrders: Object.freeze([
          {
            venueOrderId: 'v1',
            clientOrderId: `d1b${'a'.repeat(29)}`,
            strategyConfigId: reconciledSnapshot.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'BUY' as const,
            price: 100,
            quantity: 0.001,
            orderType: 'LIMIT' as const,
            timeInForce: 'PostOnly' as const,
            postOnly: true as const,
          },
        ]),
      }),
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
      },
      snapshots: [makeSnapshot(), openOrderSnapshot, makeSnapshot()],
      reconciliationState: 'ORDER_OPEN',
    });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'ACKNOWLEDGED',
    });
    test.orchestrator.setPaused(true);
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'HOLD',
      blocker: 'OPERATOR_PAUSED',
      mutationInvocations: 0,
    });
    expect(test.reconciliations()).toBe(1);
    expect(test.calls()).toBe(1);
    expect(
      test.journal.getLatestReconciliationProvenance(test.journal.nonTerminal()[0]!.intentId),
    ).toMatchObject({ venueStatus: 'OPEN' });
    await test.orchestrator.close();
  });

  it('reuses margin represented by tracked open orders without charging it twice', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...snapshot.input,
        openOrders: [
          {
            venueOrderId: 'venue-buy',
            clientOrderId: `d1b${'a'.repeat(29)}`,
            strategyConfigId: snapshot.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'BUY',
            price: 100,
            quantity: 1,
          },
        ],
      },
      {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 200,
        availableMarginUsd: 0,
        maximumEffectiveLeverage: 1,
        maximumAbsPositionBase: 2,
        maximumAggregateCollateralFraction: 0.5,
        halfSpreadBps: 5,
        makerFeeBps: 0,
        estimatedGasCostUsd: 0,
        adverseSelectionBufferBps: 0,
        safetyMarginBps: 0,
      },
    );

    expect(evaluation.status).toBe('READY');
    expect(evaluation.desiredBidLadder.length).toBeGreaterThan(0);
    expect(evaluation.desiredAskLadder.length).toBeGreaterThan(0);
  });

  it('keeps a flat-pair cohort quantity identical when margin changes 44 seconds later', () => {
    const source = makeSnapshot();
    const input = {
      ...source.input,
      now: 1_000_000,
      actualInventoryBase: 0,
      metadata: {
        ...source.input.metadata,
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumSize: 0.00002,
      },
      book: { bestBid: 82_900, bestAsk: 82_901, observedAt: 1_000_000 },
    };
    const common = {
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 50,
      maximumEffectiveLeverage: 10,
      candidateSearchDepthPerSide: 1,
      maximumAggregateCollateralFraction: 0.5,
      halfSpreadBps: 5,
      makerFeeBps: 0,
      estimatedGasCostUsd: 0,
      adverseSelectionBufferBps: 0,
      safetyMarginBps: 0,
    } as const;
    const first = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, {
      ...common,
      availableMarginUsd: 5,
    });
    const sharedQuantity = Math.min(
      first.desiredBid?.quantity ?? Number.POSITIVE_INFINITY,
      first.desiredAsk?.quantity ?? Number.POSITIVE_INFINITY,
    );
    expect(Number.isFinite(sharedQuantity)).toBe(true);

    const later = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...input,
        now: input.now + 44_344,
        book: { ...input.book, observedAt: input.now + 44_344 },
      },
      {
        ...common,
        availableMarginUsd: 10,
        flatPairCohortId: 'flat-pair-regression',
        flatPairSharedBaseQuantity: sharedQuantity,
        flatPairBudgetUsd: sharedQuantity * input.book.bestAsk,
      },
    );

    expect(later.bidRawBudgetUsd).not.toBe(first.bidRawBudgetUsd);
    expect(later.askRawBudgetUsd).not.toBe(first.askRawBudgetUsd);
    expect(later.desiredBid?.quantity).toBe(sharedQuantity);
    expect(later.desiredAsk?.quantity).toBe(sharedQuantity);
    expect((later.desiredBid?.quantity ?? 0) - (later.desiredAsk?.quantity ?? 0)).toBe(0);
  });

  it('uses authenticated above-cap inventory only for position-reducing quotes', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      { ...snapshot.input, actualInventoryBase: 0.02 },
      {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 10,
        availableMarginUsd: 10,
        maximumEffectiveLeverage: 1,
        maximumAbsPositionBase: 0.01,
        maximumAggregateCollateralFraction: 0.5,
      },
    );
    expect(evaluation.status).toBe('READY');
    expect(evaluation.desiredBidLadder).toEqual([]);
    expect(evaluation.desiredAskLadder.length).toBeGreaterThan(0);
  });

  it('fails normal quote eligibility closed when economic edge inputs are unavailable', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
      minimumNotionalUsd: 0.01,
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 1,
      halfSpreadBps: 5,
    });
    expect(evaluation.expectedBidEdgeBps).not.toBeNull();
    expect(evaluation.expectedAskEdgeBps).not.toBeNull();
    expect(evaluation.requiredBidEdgeBps).toBeNull();
    expect(evaluation.requiredAskEdgeBps).toBeNull();
    expect(evaluation.bidCandidatesEvaluated).toBeGreaterThan(0);
    expect(evaluation.askCandidatesEvaluated).toBeGreaterThan(0);
    expect(evaluation.bidEligibilityReason).toBe('ECONOMIC_INPUT_UNKNOWN');
    expect(evaluation.askEligibilityReason).toBe('ECONOMIC_INPUT_UNKNOWN');
    expect(evaluation.desiredBid).toBeNull();
    expect(evaluation.desiredAsk).toBeNull();
  });

  it('changes normal quote eligibility when the maker fee exceeds the execution-cost budget', () => {
    const snapshot = makeSnapshot();
    const evaluate = (makerFeeBps: number) =>
      evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 100,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 1,
        maximumAbsPositionBase: 2,
        halfSpreadBps: 5,
        makerFeeBps,
        estimatedGasCostUsd: 0,
        adverseSelectionBufferBps: 999,
        safetyMarginBps: 0,
      });
    const withoutBuffer = evaluate(0);
    const withBuffer = evaluate(11.251);
    expect(withoutBuffer.bidEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(withoutBuffer.askEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(withBuffer.bidEligibilityReason).toBe('LIFECYCLE_COST_BUDGET_EXCEEDED');
    expect(withBuffer.askEligibilityReason).toBe('LIFECYCLE_COST_BUDGET_EXCEEDED');
    expect(withBuffer.desiredBid).toBeNull();
    expect(withBuffer.desiredAsk).toBeNull();
  });

  it('searches three passive prices per side but admits at most one order per side', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
      minimumNotionalUsd: 0.01,
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 1,
      maximumAbsPositionBase: 2,
      candidateSearchDepthPerSide: 3,
      halfSpreadBps: 0,
      makerFeeBps: 0,
      estimatedGasCostUsd: 0,
      adverseSelectionBufferBps: 0,
      safetyMarginBps: 0,
    });

    expect(evaluation.bidCandidatesEvaluated).toBe(3);
    expect(evaluation.askCandidatesEvaluated).toBe(3);
    expect(evaluation.desiredBidLadder).toHaveLength(1);
    expect(evaluation.desiredAskLadder).toHaveLength(1);
    expect(evaluation.desiredBid?.price).toBe(100);
    expect(evaluation.desiredAsk?.price).toBe(100.2);
    expect(evaluation.actions.filter((action) => action.side === 'BUY')).toHaveLength(1);
    expect(evaluation.actions.filter((action) => action.side === 'SELL')).toHaveLength(1);
  });

  it('does not charge any adverse estimator in ENTRY admission costs', () => {
    const snapshot = makeSnapshot();
    const midpoint = (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2;
    const distance = (price: number) => Math.abs(((price - midpoint) / midpoint) * 10_000);
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
      minimumNotionalUsd: 0.01,
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 1,
      maximumAbsPositionBase: 2,
      candidateSearchDepthPerSide: 3,
      halfSpreadBps: 0,
      makerFeeBps: 0,
      estimatedGasCostUsd: 0,
      adverseSelectionBufferBps: 7,
      safetyMarginBps: 0,
      candidateAdverseSelection: [
        {
          side: 'BUY',
          distanceBps: distance(99.8),
          p95AdverseSelectionBps: 2,
          sampleCount: 30,
          observedAt: snapshot.input.now,
        },
        {
          side: 'SELL',
          distanceBps: distance(100.3),
          p95AdverseSelectionBps: 3,
          sampleCount: 30,
          observedAt: snapshot.input.now,
        },
      ],
    });

    expect(evaluation.desiredBid?.price).toBe(100);
    expect(evaluation.desiredAsk?.price).toBe(100.2);
    expect(evaluation.bidLifecycleCostBps).toBe(0);
    expect(evaluation.askLifecycleCostBps).toBe(0);
    expect(evaluation.bidCandidateCosts.map((candidate) => candidate.adverseSource)).toEqual([
      'NOT_APPLIED',
      'NOT_APPLIED',
      'NOT_APPLIED',
    ]);
    expect(evaluation.askCandidateCosts.map((candidate) => candidate.adverseSource)).toEqual([
      'NOT_APPLIED',
      'NOT_APPLIED',
      'NOT_APPLIED',
    ]);
  });

  it('does not hard-block normal admission when candidate-specific adverse evidence is absent', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
      minimumNotionalUsd: 0.01,
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 1,
      maximumAbsPositionBase: 2,
      candidateSearchDepthPerSide: 3,
      halfSpreadBps: 0,
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0,
      adverseSelectionBufferBps: 5.473863,
      safetyMarginBps: 1,
      candidateAdverseSelection: [],
    });

    expect(evaluation.bidLifecycleCostBps).toBeCloseTo(2.5);
    expect(evaluation.askLifecycleCostBps).toBeCloseTo(2.5);
    expect(evaluation.bidEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(evaluation.askEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(evaluation.desiredBid).not.toBeNull();
    expect(evaluation.desiredAsk).not.toBeNull();
  });

  it('uses lifecycle-cost entry hysteresis without relaxing the hard exit cap', () => {
    const snapshot = makeSnapshot();
    const evaluate = (openOrders: typeof snapshot.input.openOrders, makerFeeBps: number) =>
      evaluateDecibelAuthenticatedPassiveRecyclingV1(
        { ...snapshot.input, openOrders },
        {
          minimumNotionalUsd: 0.01,
          maximumNotionalUsd: 100,
          availableMarginUsd: 100,
          maximumEffectiveLeverage: 1,
          maximumAbsPositionBase: 2,
          halfSpreadBps: 5,
          makerFeeBps,
          estimatedGasCostUsd: 0,
          adverseSelectionBufferBps: 0,
          safetyMarginBps: 0,
        },
      );
    const restingOrders = [
      {
        venueOrderId: 'resting-bid',
        clientOrderId: `d1b${'a'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        market: snapshot.input.market,
        side: 'BUY' as const,
        price: 99.9,
        quantity: 0.1,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
      },
      {
        venueOrderId: 'resting-ask',
        clientOrderId: `d1s${'b'.repeat(29)}`,
        strategyConfigId: snapshot.input.strategyConfigId,
        market: snapshot.input.market,
        side: 'SELL' as const,
        price: 100.2,
        quantity: 0.1,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
      },
    ];

    const enteringAtThreshold = evaluate([], 11.035);
    expect(enteringAtThreshold.bidEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(enteringAtThreshold.askEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(enteringAtThreshold.desiredBid).not.toBeNull();
    expect(enteringAtThreshold.desiredAsk).not.toBeNull();

    const enteringInsideHysteresis = evaluate([], 11.1);
    expect(enteringInsideHysteresis.bidEligibilityReason).toBe(
      'LIFECYCLE_COST_ENTRY_THRESHOLD_NOT_MET',
    );
    expect(enteringInsideHysteresis.askEligibilityReason).toBe(
      'LIFECYCLE_COST_ENTRY_THRESHOLD_NOT_MET',
    );

    const resting = evaluate(restingOrders, 11.1);
    expect(resting.bidEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(resting.askEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(resting.desiredBid).not.toBeNull();
    expect(resting.desiredAsk).not.toBeNull();

    const aboveHardCap = evaluate(restingOrders, 11.251);
    expect(aboveHardCap.bidEligibilityReason).toBe('LIFECYCLE_COST_BUDGET_EXCEEDED');
    expect(aboveHardCap.askEligibilityReason).toBe('LIFECYCLE_COST_BUDGET_EXCEEDED');
    expect(aboveHardCap.desiredBid).toBeNull();
    expect(aboveHardCap.desiredAsk).toBeNull();
  });

  it('selects nearest maker quotes that cover the unchanged admission costs', () => {
    const base = makeSnapshot();
    const snapshot = makeSnapshot({
      input: {
        ...base.input,
        metadata: { ...base.input.metadata, tickSize: 0.001 },
        book: { bestBid: 100, bestAsk: 100.01, observedAt: base.input.now },
      },
    });
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
      minimumNotionalUsd: 0.01,
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 1,
      maximumAbsPositionBase: 2,
      halfSpreadBps: 0.1,
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0,
      adverseSelectionBufferBps: 2,
      safetyMarginBps: 1,
    });

    expect(evaluation.expectedBidEdgeBps).toBeGreaterThanOrEqual(
      evaluation.requiredBidEdgeBps ?? 0,
    );
    expect(evaluation.expectedAskEdgeBps).toBeGreaterThanOrEqual(
      evaluation.requiredAskEdgeBps ?? 0,
    );
    expect(evaluation.bidEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(evaluation.askEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(evaluation.desiredBid).not.toBeNull();
    expect(evaluation.desiredAsk).not.toBeNull();
  });

  it('does not carry a prior session lifecycle cost rejection into a fresh flat session', () => {
    const base = makeSnapshot();
    const evaluateSession = (sessionId: string, makerFeeBps: number) =>
      evaluateDecibelAuthenticatedPassiveRecyclingV1(
        {
          ...base.input,
          sessionId,
          actualInventoryBase: 0,
          openOrders: [],
        },
        {
          minimumNotionalUsd: 0.01,
          maximumNotionalUsd: 100,
          availableMarginUsd: 100,
          maximumEffectiveLeverage: 1,
          maximumAbsPositionBase: 2,
          makerFeeBps,
          estimatedGasCostUsd: 0.00047,
          adverseSelectionBufferBps: 999,
          safetyMarginBps: 1,
        },
      );

    const priorSession = evaluateSession('prior-session', 12);
    expect(priorSession.bidEligibilityReason).toBe('LIFECYCLE_COST_BUDGET_EXCEEDED');
    expect(priorSession.askEligibilityReason).toBe('LIFECYCLE_COST_BUDGET_EXCEEDED');

    const freshSession = evaluateSession('fresh-session', 2);
    expect(freshSession.bidEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(freshSession.askEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
    expect(freshSession.desiredBid).not.toBeNull();
    expect(freshSession.desiredAsk).not.toBeNull();
  });

  it('uses authoritative available-to-trade margin without subtracting total margin again', () => {
    const availableMarginUsd = getDecibelAuthoritativeAvailableMarginUsdV1({
      cross_available_to_trade: 8.929000226886915,
    });
    const base = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...base.input,
        actualInventoryBase: 0,
        openOrders: [],
        metadata: {
          ...base.input.metadata,
          tickSize: 0.1,
          lotSize: 0.00001,
          minimumSize: 0.00002,
        },
        book: { bestBid: 81_451.9, bestAsk: 81_452, observedAt: base.input.now },
      },
      {
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 50,
        availableMarginUsd,
        maximumEffectiveLeverage: 40,
        maximumAbsPositionBase: 50 / 81_451.95,
        halfSpreadBps: 0.1,
        makerFeeBps: 1.5,
        estimatedGasCostUsd: 0.0004,
        adverseSelectionBufferBps: 3,
        safetyMarginBps: 1,
      },
    );

    expect(availableMarginUsd).toBe(8.929000226886915);
    expect((0.00013 * 81_452) / 40).toBeCloseTo(0.264719, 9);
    expect((0.00013 * (81_451.9 + 81_452)) / 40).toBeCloseTo(0.529437675, 9);
    expect(availableMarginUsd * 40).toBeCloseTo(357.1600090754766, 9);
    expect(evaluation.blockers).not.toContain('INSUFFICIENT_LEVERAGED_BUYING_POWER');
    expect(evaluation.desiredBid).not.toBeNull();
    expect(evaluation.desiredAsk).not.toBeNull();
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'fails closed for invalid authoritative available-to-trade margin: %s',
    (crossAvailableToTrade) => {
      expect(() =>
        getDecibelAuthoritativeAvailableMarginUsdV1({
          cross_available_to_trade: crossAvailableToTrade as number,
        }),
      ).toThrow('PRODUCTION_LIVE_SOURCE_AVAILABLE_MARGIN_INVALID');
    },
  );

  it('caps outside-band reduction sizing so authenticated inventory cannot flip sides', () => {
    const base = makeSnapshot();
    const evaluate = (actualInventoryBase: number) =>
      evaluateDecibelAuthenticatedPassiveRecyclingV1(
        {
          ...base.input,
          actualInventoryBase,
          metadata: {
            ...base.input.metadata,
            tickSize: 0.1,
            lotSize: 0.00001,
            minimumSize: 0.00001,
          },
          book: { bestBid: 78_628.3, bestAsk: 78_628.4, observedAt: base.input.now },
        },
        {
          minimumNotionalUsd: 10,
          maximumNotionalUsd: 100,
          availableMarginUsd: 100,
          maximumEffectiveLeverage: 1,
          maximumAbsPositionBase: 50 / 78_628.35,
          halfSpreadBps: 0.1,
          makerFeeBps: 1.5,
          estimatedGasCostUsd: 0.0004,
          adverseSelectionBufferBps: 3,
          safetyMarginBps: 1,
        },
      );

    const short = evaluate(-0.00013);
    expect(short.desiredBid?.quantity).toBe(0.00013);
    expect(short.desiredAsk).toBeNull();
    const long = evaluate(0.00013);
    expect(long.desiredAsk?.quantity).toBe(0.00013);
    expect(long.desiredBid).toBeNull();

    const observedLong = evaluate(0.0003);
    expect(observedLong.desiredAsk?.quantity).toBe(0.0003);
    expect(observedLong.desiredBid).toBeNull();
    expect(0.0003 - (observedLong.desiredAsk?.quantity ?? 0)).toBe(0);

    const belowMinimum = evaluate(-0.00004);
    expect(belowMinimum).toMatchObject({
      operatingState: 'RISK_REDUCTION',
      riskReductionTrigger: 'REDUCTION_MINIMUM_NOTIONAL_DEAD_ZONE',
      bidEligibilityReason: 'REDUCTION_QUOTE_ELIGIBLE',
    });
    expect(belowMinimum.desiredBid).toMatchObject({
      quantity: 0.00004,
      timeInForce: 'PostOnly',
      postOnly: true,
    });
  });

  it('reconciles an unknown IOC by exact client identity when terminal evidence arrives', async () => {
    const Reader = {
      readOrderHistory: () => Promise.resolve([]),
      readTradeHistory: () => Promise.resolve([]),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20_000,
    );
    const identity = {
      clientOrderId: 'ioc-client',
      createdAt: 10_000,
      transactionHash: null,
    };
    const terminal = makeSnapshot({
      terminalOrderEvidence: [
        {
          venueOrderId: 'ioc-order',
          clientOrderId: identity.clientOrderId,
          state: 'FILLED',
          originalQuantity: 0.00003,
          remainingQuantity: 0,
        },
      ],
    });
    await expect(Source.reconcileIntent('ioc-intent', terminal, null, identity)).resolves.toBe(
      'FULL_FILL',
    );
    await expect(
      Source.reconcileIntent('ioc-intent', makeSnapshot(), null, identity),
    ).rejects.toThrow('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
  });

  it('keeps a newly acknowledged SELL non-terminal across open-order visibility lag', async () => {
    const Reader = {
      readOrderHistory: () => Promise.resolve([]),
      readTradeHistory: () => Promise.resolve([]),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20_000,
    );
    const venueOrderId = 'new-short-order';
    const clientOrderId = 'new-short-client';
    const identity = { clientOrderId, createdAt: 19_000, transactionHash: null };
    const visibilityLag = makeSnapshot({
      authenticatedFlatNeutralization: {
        checkpointBodyHashSha256: 'older-account-checkpoint',
        resyncTimestamp: 19_500,
        outOfBandFillIds: ['unrelated-historical-fill'],
      },
    });

    await expect(
      Source.reconcileIntent('new-short-intent', visibilityLag, venueOrderId, identity),
    ).rejects.toThrow('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');

    const visible = makeSnapshot({
      input: {
        ...visibilityLag.input,
        openOrders: [
          {
            venueOrderId,
            clientOrderId,
            strategyConfigId: visibilityLag.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'SELL',
            price: 81_425.5,
            quantity: 0.0003,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
          },
        ],
      },
    });
    await expect(
      Source.reconcileIntent('new-short-intent', visible, venueOrderId, identity),
    ).resolves.toBe('ORDER_OPEN');
  });

  it('prioritizes exact terminal history over a coexisting delayed OPEN projection', async () => {
    const Reader = {
      readOrderHistory: () => Promise.resolve([]),
      readTradeHistory: () => Promise.resolve([]),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20_000,
    );
    const venueOrderId = 'fill-raced-cancel-order';
    const clientOrderId = 'fill-raced-cancel-client';
    const base = makeSnapshot();
    const snapshot = makeSnapshot({
      input: {
        ...base.input,
        openOrders: [
          {
            venueOrderId,
            clientOrderId,
            strategyConfigId: base.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'SELL',
            price: 100.2,
            quantity: 0.001,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
          },
        ],
      },
      terminalOrderEvidence: [
        {
          venueOrderId,
          clientOrderId,
          state: 'FILLED',
          originalQuantity: 0.001,
          remainingQuantity: 0,
        },
      ],
    });

    await expect(
      Source.reconcileIntent('fill-raced-cancel-intent', snapshot, venueOrderId, {
        clientOrderId,
        createdAt: 19_000,
        transactionHash: '0xsubmission',
        requestedQuantity: 0.001,
      }),
    ).resolves.toBe('FULL_FILL');
  });

  it.each(['STALE', 'MISSING'])(
    'refreshes %s margin rules independently of fresh leverage and fees',
    async (ruleCase) => {
      let now = 20000,
        riskReads = 0,
        ruleReads = 0,
        fail = false;
      let releaseRules: (() => void) | undefined;
      let deferRules = false;
      const market = DECIBEL_BTC_USD_MARKET_ADDRESS_V1;
      const Reader = {
        readAccountOverview: () =>
          Promise.resolve({
            secondary_collateral: null,
            perp_equity_balance: 10.22,
            total_margin: 10.22,
            cross_available_to_trade: 10.22,
            maintenance_margin: 0,
            margin_deficit: 0,
          }),
        readPositions: () => Promise.resolve([]),
        readOpenOrders: () => Promise.resolve([]),
        readVenueMarginRules: () => {
          ruleReads++;
          if (ruleReads === 1 && ruleCase === 'MISSING')
            return Promise.reject(new Error('RULE_READ_UNAVAILABLE'));
          const observedAt = ruleReads === 1 ? now - 6000 : now;
          const delayed = deferRules
            ? new Promise<void>((resolve) => {
                releaseRules = resolve;
              })
            : Promise.resolve();
          return delayed.then(() => ({
            observedAt,
            markObservedAt: observedAt,
            ledgerVersion: '123',
            maximumLeverage: 40,
            maintenanceMultiplier: 1,
            maintenanceDivisor: 2,
            markPrice: 80000,
            remainingOpenInterestBase: 100,
            sizeModel: 'FIXED_LEVERAGE_V1',
          }));
        },
        readAccountRiskInputs: () => {
          riskReads++;
          if (fail) return Promise.reject(Error('UNAVAILABLE'));
          return Promise.resolve({
            leverage: {
              source: 'AUTHENTICATED_BTC_POSITION_SETTINGS',
              observedAt: now,
              userLeverage: 40,
              positionBase: 0,
              isIsolated: false,
              market,
              subaccount: '0x123',
            },
            fees: {
              source: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
              observedAt: now,
              makerFeeBps: 1.5,
              takerFeeBps: 4.5,
              tier: 0,
              referralDiscount: 0,
              subaccount: '0x123',
            },
          });
        },
        readMarketMetadata: () =>
          Promise.resolve({
            ...makeSnapshot().input.metadata,
            marketAddress: market,
            maximumLeverage: 40,
          }),
        readCurrentBook: () =>
          Promise.resolve({
            market,
            unix_ms: now,
            best_bid: 79999,
            best_ask: 80001,
            bids: [{ price: 79999, size: 1 }],
            asks: [{ price: 80001, size: 1 }],
          }),
        readMarketDataDiagnostics: () => ({
          wsConnectionState: 'CONNECTED',
          wsSubscriptionState: 'SUBSCRIBED',
          lastWsMessageAgeMs: 0,
          lastValidBboAgeMs: 0,
          wsReconnectCount: 0,
          wsLastDisconnectReason: null,
        }),
      } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
      const Source = new decibel_production_live_state_source_v1(
        Reader,
        { DECIBEL_SUBACCOUNT_ADDRESS: '0x123' },
        () => now,
      );
      expect((await Source.readAuthenticatedAccountState()).actualInventoryBase).toBe(0);
      await Source.readPublicMarketState();
      await Source.readAuthenticatedAccountState();
      await Source['CapacitySettingsRead'];
      expect(riskReads).toBe(1);
      expect(ruleReads).toBe(2);
      const inputs = Source.readNextSessionCapacityInputs();
      expect(inputs?.venueMarginRules?.observedAt).toBe(now);
      expect(inputs?.actualLeverage).toBe(40);
      expect(
        inputs?.costObservations?.some((row) => row.kind === 'TAKER_FEE' && row.value === 4.5),
      ).toBe(true);
      await Source.readAuthenticatedAccountState();
      expect(riskReads).toBe(1);
      now = 23000;
      deferRules = true;
      const Supervisor = new decibel_runtime_supervisor_v1();
      await Supervisor.runAuthenticatedRefresh((signal) =>
        Source.readAuthenticatedAccountState(signal),
      );
      await Supervisor.runAuthenticatedRefresh((signal) =>
        Source.readAuthenticatedAccountState(signal),
      );
      expect(ruleReads).toBe(3); // one background rules refresh, never overlapping
      expect(riskReads).toBe(2); // refresh before TTL, sharing the existing rules owner
      expect(Source.readNextSessionCapacityInputs()?.venueMarginRules?.observedAt).toBe(20000);
      releaseRules!();
      await Source['CapacitySettingsRead'];
      expect(Source.readNextSessionCapacityInputs()?.venueMarginRules?.observedAt).toBe(23000);
      deferRules = false;
      now = 27000;
      fail = true;
      await Source.readAuthenticatedAccountState();
      await Source['CapacitySettingsRead'];
      expect(
        Source.readNextSessionCapacityInputs()?.costObservations?.find(
          (row) => row.kind === 'TAKER_FEE',
        )?.observedAt,
      ).toBe(23000);
      now = 30000;
      expect(Source.readNextSessionCapacityInputs()).toBeNull();
      fail = true;
      await Source.readAuthenticatedAccountState();
      await Source['CapacitySettingsRead'];
      expect(Source.readNextSessionCapacityInputs()).toBeNull();
      fail = false;
      await Source.readAuthenticatedAccountState();
      await Source['CapacitySettingsRead'];
      await Source.readPublicMarketState();
      expect(Source.readNextSessionCapacityInputs()?.accountObservedAt).toBe(30000);
      expect(
        Source.readNextSessionCapacityInputs()?.costObservations?.find(
          (row) => row.kind === 'TAKER_FEE',
        )?.observedAt,
      ).toBe(30000);
      Supervisor.stopScheduler();
      await Source.close();
    },
  );
  it('publishes authenticated account state without reading or validating the market book', async () => {
    let bookReads = 0;
    let margin = 22;
    const Reader = {
      readMarketMetadata: () => Promise.resolve(makeSnapshot().input.metadata),
      readAccountOverview: () =>
        Promise.resolve({
          perp_equity_balance: 25,
          total_margin: 3,
          cross_available_to_trade: margin,
          unrealized_pnl: 0,
        }),
      readPositions: () => Promise.resolve([]),
      readOpenOrders: () => Promise.resolve([]),
      readCurrentBook: () => {
        bookReads += 1;
        return Promise.reject(new Error('PRODUCTION_LIVE_SOURCE_BOOK_STALE'));
      },
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount' },
      () => 20_000,
    );

    await expect(Source.readAuthenticatedAccountState()).resolves.toMatchObject({
      availableMarginUsd: 22,
      observedAt: 20_000,
      actualInventoryBase: 0,
      openOrders: [],
      accountMetrics: { collateralUsd: 25, totalMarginUsd: 3 },
    });
    margin = 0.1;
    await expect(Source.readAuthenticatedAccountState()).resolves.toMatchObject({
      availableMarginUsd: 0.1,
    });
    margin = Number.NaN;
    await expect(Source.readAuthenticatedAccountState()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
    );
    expect(bookReads).toBe(0);
  });

  it('aborts a timed-out authenticated HTTP stage and gives the next attempt a fresh signal', async () => {
    const signals: AbortSignal[] = [];
    let accountAttempts = 0;
    const Reader = {
      readMarketMetadata: () => Promise.resolve(makeSnapshot().input.metadata),
      readAccountOverview: (_subaccount: string, signal?: AbortSignal) => {
        if (signal === undefined) return Promise.reject(new Error('ABORT_SIGNAL_REQUIRED'));
        signals.push(signal);
        accountAttempts += 1;
        if (accountAttempts === 1) return new Promise<never>(() => undefined);
        return Promise.resolve({
          perp_equity_balance: 25,
          total_margin: 3,
          cross_available_to_trade: 22,
          unrealized_pnl: 0,
        });
      },
      readPositions: () => Promise.resolve([]),
      readOpenOrders: () => Promise.resolve([]),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      {
        DECIBEL_NETWORK: 'mainnet',
        DECIBEL_SUBACCOUNT_ADDRESS: 'test-subaccount',
        DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS: '1000',
      },
      () => 20_000,
    );

    await expect(Source.readAuthenticatedAccountState()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
    );
    expect(signals[0]?.aborted).toBe(true);
    await expect(Source.readAuthenticatedAccountState()).resolves.toMatchObject({
      observedAt: 20_000,
      actualInventoryBase: 0,
    });
    expect(signals).toHaveLength(2);
    expect(signals[1]).not.toBe(signals[0]);
  });

  it('escapes the sub-notional inventory dead zone through exact reduce-only maker sizing', async () => {
    const Base = makeSnapshot();
    const Positioned = makeSnapshot({
      input: {
        ...Base.input,
        actualInventoryBase: 0.00011,
        metadata: {
          ...Base.input.metadata,
          tickSize: 0.1,
          lotSize: 0.00001,
          minimumSize: 0.00001,
        },
        book: { bestBid: 77_200, bestAsk: 77_200.1, observedAt: Base.input.now },
      },
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 50,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 1,
      maximumAbsPositionBase: 50 / 77_200.05,
    });
    const test = make({ snapshots: [Positioned, Positioned] });

    const result = await test.orchestrator.evaluateOnce();
    const intent = test.journal.getIntent(result.intentId ?? '');

    expect(result.evaluation).toMatchObject({
      operatingState: 'RISK_REDUCTION',
      riskReductionTrigger: 'REDUCTION_MINIMUM_NOTIONAL_DEAD_ZONE',
      bidEligibilityReason: 'INVENTORY_REDUCTION_SIDE_ONLY',
      askEligibilityReason: 'REDUCTION_QUOTE_ELIGIBLE',
    });
    expect(result.evaluation?.desiredAsk).toMatchObject({
      side: 'SELL',
      quantity: 0.00011,
      timeInForce: 'PostOnly',
      postOnly: true,
    });
    expect(intent).toMatchObject({
      action: 'PLACE',
      side: 'SELL',
      quantity: 0.00011,
      reduceOnly: true,
      executionRole: 'INVENTORY_REDUCING_MAKER',
      timeInForce: 'PostOnly',
    });
    await test.orchestrator.close();
  });

  it('persists a complete explainable decision snapshot with an exact reason', async () => {
    const test = make({ snapshots: [makeSnapshot(), makeSnapshot()] });
    await test.orchestrator.evaluateOnce();
    const decisions = test.journal.getDecisionSnapshots();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.snapshot).toMatchObject({
      authenticatedPositionBase: 0,
      bestBid: 100,
      bestAsk: 100.2,
      fairPriceSource: 'BBO_MIDPOINT',
      makerFeeSource: 'CONFIG',
      estimatedGasCostSource: 'CONFIG',
      adverseSelectionSource: 'CONFIG',
      riskReductionTrigger: 'NONE',
      bidEligibilityReason: 'VOLUME_COST_BUDGET_ELIGIBLE',
      askEligibilityReason: 'VOLUME_COST_BUDGET_ELIGIBLE',
      selectedMutation: 'WOULD_PLACE',
      exactReasonCode: 'DESIRED_ORDER_ABSENT',
    });
    expect((decisions[0]?.snapshot as { marketSpreadBps?: number }).marketSpreadBps).toBeCloseTo(
      19.98001998,
    );
    expect((decisions[0]?.snapshot as { quoteSpreadBps?: number }).quoteSpreadBps).toBeGreaterThan(
      0,
    );
    await test.orchestrator.close();
  });

  it('keeps 1000 fresh admission cycles live with an exact action or blocking gate', async () => {
    const snapshots = Array.from({ length: 2_000 }, (_value, index) =>
      makeSnapshot({
        sourceStateHash: `soak-${index}`,
        input: {
          ...makeSnapshot().input,
          now: 10_000 + index,
          book: {
            bestBid: 100 + (index % 3) * 0.1,
            bestAsk: 100.2 + (index % 3) * 0.1,
            observedAt: 10_000 + index,
          },
        },
      }),
    );
    const test = make({ snapshots });
    for (let cycle = 0; cycle < 1_000; cycle += 1) {
      const result = await test.orchestrator.evaluateOnce();
      expect(() => assertDecibelProductionControlLivenessV1(result)).not.toThrow();
      expect(result.controlSnapshot.exactReason).not.toMatch(/UNKNOWN|^HOLD$/);
      expect(result.evaluation?.bidCandidatesEvaluated).toBe(7);
      expect(result.evaluation?.askCandidatesEvaluated).toBe(7);
      expect(result.evaluation?.desiredBidLadder.length ?? 0).toBeLessThanOrEqual(1);
      expect(result.evaluation?.desiredAskLadder.length ?? 0).toBeLessThanOrEqual(1);
    }
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  }, 20_000);

  it('derives a finite hard inventory cap when no operator position cap is supplied', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      { ...snapshot.input, actualInventoryBase: 1.01 },
      {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 100,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 1,
        makerFeeBps: 0,
        estimatedGasCostUsd: 0,
        adverseSelectionBufferBps: 0,
        safetyMarginBps: 0,
        maximumAggregateCollateralFraction: 0.5,
      },
    );
    expect(evaluation.status).toBe('READY');
    expect(evaluation.strategyState).toBe('HARD_LONG');
    expect(evaluation.operatingState).toBe('RISK_REDUCTION');
    expect(evaluation.desiredBidLadder).toEqual([]);
    expect(evaluation.desiredAskLadder.length).toBeGreaterThan(0);
  });

  it('keeps target-stop inventory liquidation one-sided', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...snapshot.input,
        actualInventoryBase: 0.2,
        targetExternalMakerVolumeUsd: 0,
      },
      {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 100,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 1,
        maximumAbsPositionBase: 2,
      },
    );
    expect(evaluation.status).toBe('STOPPING');
    expect(evaluation.operatingState).toBe('SESSION_UNWIND');
    expect(evaluation.desiredBidLadder).toEqual([]);
    expect(evaluation.desiredAskLadder.length).toBeGreaterThan(0);
    expect(evaluation.desiredAsk).toMatchObject({
      price: snapshot.input.book.bestBid,
      quantity: 0.2,
      levelId: 'SELL-UNWIND',
      timeInForce: 'ImmediateOrCancel',
      postOnly: false,
    });
  });

  it('uses reduce-only exclusively for explicit risk reduction', async () => {
    const positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.002 },
      maximumAbsPositionBase: 0.01,
      maximumNotionalUsd: 1,
    });
    const test = make({
      snapshots: [positioned, positioned],
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
    });
    test.orchestrator.requestRiskReduction();

    const result = await test.orchestrator.evaluateOnce();
    const intent = test.journal.getIntent(result.intentId ?? '');

    expect(result.action).toBe('ACKNOWLEDGED');
    expect(result.evaluation?.operatingState).toBe('RISK_REDUCTION');
    expect(result.evaluation?.desiredBidLadder).toEqual([]);
    expect(result.evaluation?.desiredAsk).toMatchObject({
      orderType: 'LIMIT',
      timeInForce: 'PostOnly',
      postOnly: true,
    });
    expect(intent).toMatchObject({
      action: 'PLACE',
      side: 'SELL',
      reduceOnly: true,
      executionRole: 'INVENTORY_REDUCING_MAKER',
    });
    await test.orchestrator.close();
  });

  it('does not reopen exposure while risk reduction is active at zero inventory', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
      minimumNotionalUsd: 0.01,
      maximumNotionalUsd: 1,
      availableMarginUsd: 1,
      maximumEffectiveLeverage: 1,
      maximumAbsPositionBase: 0.01,
      riskReductionRequired: true,
    });

    expect(evaluation.operatingState).toBe('RISK_REDUCTION');
    expect(evaluation.desiredBidLadder).toEqual([]);
    expect(evaluation.desiredAskLadder).toEqual([]);
  });

  it('uses strict reduce-only post-only orders for moderate inventory reduction', async () => {
    const positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.002 },
      maximumAbsPositionBase: 0.01,
      maximumNotionalUsd: 1,
    });
    const test = make({ snapshots: [positioned, positioned] });

    const result = await test.orchestrator.evaluateOnce();
    const intent = test.journal.getIntent(result.intentId ?? '');

    expect(result.evaluation?.operatingState).toBe('NORMAL_MM');
    expect(result.evaluation?.desiredBidLadder).toEqual([]);
    expect(result.evaluation?.desiredAskLadder.length).toBeGreaterThan(0);
    expect(result.evaluation?.desiredBid).toBeNull();
    expect(intent).toMatchObject({
      action: 'PLACE',
      reduceOnly: true,
      executionRole: 'INVENTORY_REDUCING_MAKER',
    });
    await test.orchestrator.close();
  });

  it('enters session unwind and only quotes the reducing side', async () => {
    const positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: -0.002 },
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 50,
      maximumAbsPositionBase: 0.01,
    });
    const test = make({ snapshots: [positioned, positioned] });
    test.orchestrator.requestSessionUnwind();

    const result = await test.orchestrator.evaluateOnce();
    const intent = test.journal.getIntent(result.intentId ?? '');

    expect(result.evaluation?.operatingState).toBe('SESSION_UNWIND');
    expect(result.evaluation?.desiredAskLadder).toEqual([]);
    expect(intent).toMatchObject({
      side: 'BUY',
      reduceOnly: true,
      executionRole: 'SESSION_UNWIND_IOC',
      timeInForce: 'ImmediateOrCancel',
      postOnly: false,
    });
    expect(intent?.quantity).toBe(0.002);
    expect(intent?.price).toBe(positioned.input.book.bestAsk);
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
    await test.orchestrator.close();
  });

  it('does not mistake an ordinary flat paused runtime for completed unwind', async () => {
    const Flat = makeSnapshot();
    const test = make({ snapshots: [Flat, Flat] });
    test.orchestrator.setPaused(true);

    await test.orchestrator.evaluateOnce();
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
    test.orchestrator.requestSessionUnwind();
    await test.orchestrator.evaluateOnce();
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(true);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('converges End Session from a pending ACK through terminal reconciliation to complete', async () => {
    const Flat = makeSnapshot();
    const test = make({
      snapshots: Array.from({ length: 6 }, () => Flat),
      reconciliationResults: ['ORDER_CANCELLED'],
    });
    const intent = buildDecibelExecutionIntentV1({
      sessionId: Flat.input.sessionId,
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      side: 'BUY',
      price: 100,
      quantity: 0.001,
      tickSize: Flat.input.metadata.tickSize,
      lotSize: Flat.input.metadata.lotSize,
      clientOrderId: `d1b${'e'.repeat(29)}`,
      knownVenueOrderId: null,
      sourceStateHash: 'end-pending-ack',
      strategyDecisionHash: 'end-pending-ack-decision',
      createdAt: 1,
    });
    test.journal.prepare(intent);
    test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, 'end-order');
    test.orchestrator.requestSessionUnwind();

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
    });
    expect(test.journal.nonTerminal()).toEqual([]);
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({ action: 'HOLD' });
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(true);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it.each([50])(
    'cancels partial residuals and reconciles inflight before completing V2 unwind at volume %s',
    async (volume) => {
      const Flat = makeSnapshot();
      const openOrder = {
        venueOrderId: 'partial-order',
        clientOrderId: `d1s${'f'.repeat(29)}`,
        strategyConfigId: Flat.input.strategyConfigId,
        market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        side: 'SELL' as const,
        price: 101,
        quantity: 0.0005,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true as const,
      };
      const PartiallyFilled = makeSnapshot({
        input: {
          ...Flat.input,
          openOrders: [openOrder],
          targetExternalMakerVolumeUsd: 50,
          actualFillLedger: { ...Flat.input.actualFillLedger, actualExternalMakerVolumeUsd: 50 },
        },
        sessionConfiguration: {
          revision: 2,
          capitalToUseUsd: 8,
          maxLossUsd: 2,
          targetMakerVolumeUsd: 50,
          maxPositionUsd: 50,
          marginUsedUsd: 0,
          makerVolumeUsd: volume,
          totalExecutedVolumeUsd: volume,
          pnlUsd: 0,
          riskBlocker: null,
        },
        minimumNotionalUsd: 10,
        sourceStateHash: 'partial-open',
      });
      const test = make({
        environment: {
          DECIBEL_EXECUTION_MODE: 'production',
          DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
          DECIBEL_EXECUTOR_ENABLED: 'true',
          DECIBEL_EXECUTOR_DRY_RUN: 'false',
        },
        snapshots: [PartiallyFilled, PartiallyFilled, Flat, Flat, Flat],
        reconciliationResults: ['PARTIAL_FILL', 'ORDER_CANCELLED', 'ORDER_CANCELLED'],
        cancelTargetState: 'ORDER_OPEN',
      });
      const intent = buildDecibelExecutionIntentV1({
        sessionId: Flat.input.sessionId,
        cycleSequence: 1,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'SELL',
        price: openOrder.price,
        quantity: 0.001,
        tickSize: Flat.input.metadata.tickSize,
        lotSize: Flat.input.metadata.lotSize,
        clientOrderId: openOrder.clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: 'partial-submission',
        strategyDecisionHash: 'partial-submission-decision',
        createdAt: 1,
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, openOrder.venueOrderId);
      expect(test.configuration.dryRun).toBe(false);

      const result = await test.orchestrator.evaluateOnce();
      expect(result.mutationInvocations, JSON.stringify(result)).toBe(1);
      expect(test.submitted()).toContainEqual({ action: 'CANCEL', side: 'SELL' });
      expect(test.journal.getLatestReconciliationProvenance(intent.intentId)).toMatchObject({
        venueStatus: 'PARTIAL_FILL',
        remainingQuantity: openOrder.quantity,
      });
      expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
      await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
        action: 'RECONCILE_ONLY',
      });
      expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
      await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
        action: 'RECONCILE_ONLY',
      });
      await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({ action: 'HOLD' });
      expect(test.orchestrator.isSessionUnwindComplete()).toBe(true);
      expect(test.journal.nonTerminal()).toEqual([]);
      await test.orchestrator.close();
    },
  );

  it('switches a target drain to the reduce-only IOC unwind on an explicit unwind', async () => {
    const Positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.002 },
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 50,
      maximumAbsPositionBase: 0.01,
    });
    const test = make({ snapshots: [Positioned, Positioned] });
    test.orchestrator.requestSessionDrain();
    expect(test.orchestrator.isSessionDraining()).toBe(true);
    test.orchestrator.requestSessionUnwind();
    expect(test.orchestrator.isSessionDraining()).toBe(false);
    test.orchestrator.requestSessionDrain();
    expect(test.orchestrator.isSessionDraining()).toBe(false);

    const result = await test.orchestrator.evaluateOnce();
    expect(result.evaluation?.operatingState).toBe('SESSION_UNWIND');
    expect(test.journal.getIntent(result.intentId ?? '')).toMatchObject({
      side: 'SELL',
      reduceOnly: true,
      executionRole: 'SESSION_UNWIND_IOC',
    });
    await test.orchestrator.close();
  });

  it('does not let missing normal-MM economics override a pending session unwind', async () => {
    const Positioned = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.002 },
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 50,
      maximumAbsPositionBase: 0.01,
    });
    const WithoutEconomics = Object.freeze({ ...Positioned, economicInputs: undefined });
    const test = make({ snapshots: [WithoutEconomics, WithoutEconomics] });
    test.orchestrator.requestSessionUnwind();

    const result = await test.orchestrator.evaluateOnce();
    const intent = test.journal.getIntent(result.intentId ?? '');

    expect(result.evaluation?.operatingState).toBe('SESSION_UNWIND');
    expect(result.evaluation?.askEligibilityReason).toBe('REDUCTION_QUOTE_ELIGIBLE');
    expect(intent).toMatchObject({
      side: 'SELL',
      reduceOnly: true,
      executionRole: 'SESSION_UNWIND_IOC',
    });
    await test.orchestrator.close();
  });

  it('shrinks an existing flat cohort from fresh V2 remaining-volume budgets', async () => {
    const Base = makeSnapshot();
    const Wide = makeSnapshot({
      ...Base,
      maximumAbsPositionBase: 0.1,
      maximumNotionalUsd: 10,
      availableMarginUsd: 8,
      sessionConfiguration: {
        revision: 2,
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 50,
        maxPositionUsd: 50,
        marginUsedUsd: 0,
        makerVolumeUsd: 0,
        takerVolumeUsd: 0,
        totalExecutedVolumeUsd: 0,
        targetVolumeUsd: 0,
        pnlUsd: 0,
        riskBlocker: null,
      },
    });
    const Narrow = {
      ...Wide,
      sourceStateHash: 'remaining-volume-changed',
      sessionConfiguration: {
        ...Wide.sessionConfiguration!,
        makerVolumeUsd: 20,
        takerVolumeUsd: 29.85,
        totalExecutedVolumeUsd: 49.85,
        targetVolumeUsd: 49.85,
      },
    };
    const test = make({ snapshots: [Wide, Wide, Narrow, Narrow] });
    const first = await test.orchestrator.evaluateOnce();
    const second = await test.orchestrator.evaluateOnce();
    const firstIntent = test.journal.getIntent(first.intentId ?? '');
    const secondIntent = test.journal.getIntent(second.intentId ?? '');
    expect(firstIntent?.action).toBe('PLACE');
    expect(secondIntent?.action).toBe('PLACE');
    expect(secondIntent!.quantity).toBeLessThan(firstIntent!.quantity);
    expect(secondIntent!.quantity * secondIntent!.price).toBeLessThanOrEqual(0.15 + 1e-9);
    expect(
      test.orchestrator.getLatestSnapshot()?.quoteSizing?.[secondIntent!.side]?.finalNotionalUsd,
    ).toBeLessThanOrEqual(0.15 + 1e-9);
    await test.orchestrator.close();
  });

  it('keeps a flat V2 session with $0.22 remaining open for one more full-size entry', async () => {
    const Base = makeSnapshot();
    const Small = makeSnapshot({
      ...Base,
      maximumAbsPositionBase: 0.01,
      minimumNotionalUsd: 10,
      sessionConfiguration: {
        revision: 2,
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 50,
        maxPositionUsd: 50,
        marginUsedUsd: 0,
        makerVolumeUsd: 25,
        takerVolumeUsd: 24.78,
        totalExecutedVolumeUsd: 49.78,
        targetVolumeUsd: 49.78,
        pnlUsd: 0,
        riskBlocker: null,
      },
    });
    const test = make({ snapshots: [Small, Small] });
    await test.orchestrator.evaluateOnce();
    // A remainder below the venue minimum is not terminal: the next entry keeps its
    // normal size and finishes the target with a small overshoot.
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
    expect(test.orchestrator.isSessionDraining()).toBe(false);
    await test.orchestrator.close();
  });

  it.each([
    [50, null],
    [50, 'SESSION_CAPACITY_EVIDENCE_REQUIRED'],
  ] as const)(
    'drains at V2 volume %s through reduce-only maker exits and never a taker IOC',
    async (volume, blocker) => {
      const Base = makeSnapshot();
      const Reached = makeSnapshot({
        ...Base,
        capacityModelRequired: true,
        input: {
          ...Base.input,
          actualInventoryBase: -0.002,
          targetExternalMakerVolumeUsd: 50,
          actualFillLedger: {
            ...Base.input.actualFillLedger,
            actualExternalMakerVolumeUsd: 25,
            actualTakerVolumeUsd: 25,
          },
        },
        sessionConfiguration: {
          revision: 2,
          capitalToUseUsd: 8,
          maxLossUsd: 2,
          targetMakerVolumeUsd: 50,
          maxPositionUsd: 50,
          marginUsedUsd: 0,
          makerVolumeUsd: 25,
          takerVolumeUsd: 25,
          totalExecutedVolumeUsd: volume,
          pnlUsd: 0,
          riskBlocker: blocker,
        },
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 50,
        maximumAbsPositionBase: 0.01,
      });
      const test = make({ snapshots: [Reached, Reached] });
      const result = await test.orchestrator.evaluateOnce();
      expect(test.orchestrator.isSessionDraining()).toBe(true);
      expect(result.evaluation?.operatingState).not.toBe('SESSION_UNWIND');
      const intent = test.journal.getIntent(result.intentId ?? '');
      if (intent?.action === 'PLACE')
        expect(intent).toMatchObject({ side: 'BUY', reduceOnly: true, timeInForce: 'PostOnly' });
      expect(intent?.executionRole).not.toBe('SESSION_UNWIND_IOC');
      // Short position: SELL would grow it and must never be placed while draining.
      expect(
        test.submitted().filter((entry) => entry.action === 'PLACE' && entry.side === 'SELL'),
      ).toEqual([]);
      await test.orchestrator.close();
    },
  );

  it('latches the target drain across a subsequently lagging snapshot', async () => {
    const Base = makeSnapshot();
    const reached = makeSnapshot({
      input: {
        ...Base.input,
        actualInventoryBase: 0.002,
        targetExternalMakerVolumeUsd: 10,
        targetExternalMakerVolumeBaselineUsd: 100,
        actualFillLedger: {
          ...Base.input.actualFillLedger,
          actualExternalMakerVolumeUsd: 110,
        },
      },
    });
    const lagging = makeSnapshot({
      input: {
        ...Base.input,
        actualInventoryBase: 0.002,
        targetExternalMakerVolumeUsd: 10,
        targetExternalMakerVolumeBaselineUsd: 100,
        actualFillLedger: {
          ...Base.input.actualFillLedger,
          actualExternalMakerVolumeUsd: 109,
        },
      },
    });
    const test = make({ snapshots: [reached, reached, lagging, lagging] });

    const first = await test.orchestrator.evaluateOnce();
    const second = await test.orchestrator.evaluateOnce();

    expect(first.evaluation?.operatingState).not.toBe('SESSION_UNWIND');
    expect(second.evaluation?.operatingState).not.toBe('SESSION_UNWIND');
    expect(test.orchestrator.isSessionDraining()).toBe(true);
    for (const result of [first, second]) {
      const intent = test.journal.getIntent(result.intentId ?? '');
      expect(intent?.executionRole).not.toBe('SESSION_UNWIND_IOC');
      if (intent?.action === 'PLACE')
        expect(intent).toMatchObject({ side: 'SELL', reduceOnly: true, postOnly: true });
    }
    // Long position: BUY would grow it and must never be placed while draining.
    expect(
      test.submitted().filter((entry) => entry.action === 'PLACE' && entry.side === 'BUY'),
    ).toEqual([]);
    await test.orchestrator.close();
  });

  it('measures a fixed session target from its authenticated start-volume baseline', () => {
    const snapshot = makeSnapshot();
    const historicalLedger = {
      ...snapshot.input.actualFillLedger,
      actualExternalMakerVolumeUsd: 187.41,
    };
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...snapshot.input,
        targetExternalMakerVolumeUsd: 50,
        targetExternalMakerVolumeBaselineUsd: 187.41,
        actualFillLedger: historicalLedger,
      },
      {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 100,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 1,
        makerFeeBps: 0,
        estimatedGasCostUsd: 0,
        adverseSelectionBufferBps: 0,
        safetyMarginBps: 0,
      },
    );
    expect(evaluation.status).toBe('READY');
    expect(evaluation.desiredBid).not.toBeNull();
    expect(evaluation.desiredAsk).not.toBeNull();
  });

  it('rejects inconsistent position-only refresh and recovers from a complete FLAT venue read set', async () => {
    const stale = makeSnapshot({
      input: { ...makeSnapshot().input, actualInventoryBase: 0.02 },
      sourceStateHash: 'stale-position',
    });
    const test = make({
      snapshots: [stale, stale, makeSnapshot(), makeSnapshot()],
      authenticatedPositions: [0],
    });

    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    expect(test.calls()).toBe(0);
    const result = await test.orchestrator.evaluateOnce();

    expect(result.action).toBe('DRY_RUN_PREPARED');
    expect(result.evaluation?.actualInventoryBase).toBe(0);
    expect(result.evaluation?.desiredBidLadder.length).toBeGreaterThan(0);
    expect(result.evaluation?.desiredAskLadder.length).toBeGreaterThan(0);
    await test.orchestrator.close();
  });

  it('uses the forced post-mutation venue reader rather than the ordinary cached read', async () => {
    const before = makeSnapshot();
    const after = {
      ...before,
      sourceStateHash: 'forced-authenticated-after-mutation',
      input: { ...before.input, now: before.input.now + 1 },
    };
    const test = make({
      snapshots: [before, before, after],
      postMutationRead: true,
      reconciliationState: 'ORDER_OPEN',
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
    });
    try {
      await test.orchestrator.evaluateOnce();
      expect(test.calls()).toBe(1);
      expect(test.postMutationReads()).toBe(1);
      expect(test.orchestrator.getLatestSnapshot()?.sourceStateHash).toBe(after.sourceStateHash);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('does not use completed flat cycles to force the next entry side', async () => {
    const test = make({ snapshots: [makeSnapshot(), makeSnapshot()] });
    test.journal.applyFill({
      fillId: 'long-entry',
      intentId: null,
      side: 'BUY',
      quantity: 0.001,
      price: 100,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 1,
    });
    test.journal.applyFill({
      fillId: 'long-recycle',
      intentId: null,
      side: 'SELL',
      quantity: 0.001,
      price: 101,
      strategyLineage: true,
      makerProven: true,
      externalCounterparty: true,
      observedAt: 2,
    });

    const result = await test.orchestrator.evaluateOnce();

    expect(result.evaluation?.operatingState).toBe('NORMAL_MM');
    expect(result.evaluation?.desiredBidLadder.length).toBeGreaterThan(0);
    expect(result.evaluation?.desiredAskLadder.length).toBeGreaterThan(0);
    const prepared = test.journal.getIntent(result.intentId ?? '');
    expect(prepared).toMatchObject({ reduceOnly: false });
    await test.orchestrator.close();
  });

  it('reconciles missing reduce-only metadata instead of repricing an unverified exit', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...snapshot.input,
        actualInventoryBase: 0.001,
        openOrders: [
          {
            venueOrderId: 'recycle-sell',
            clientOrderId: `d1s${'a'.repeat(29)}`,
            strategyConfigId: snapshot.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'SELL',
            price: 101,
            quantity: 0.001,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
          },
        ],
      },
      {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 100,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 1,
        maximumAbsPositionBase: 2,
        maximumAggregateCollateralFraction: 0.5,
        halfSpreadBps: 5,
        makerFeeBps: 0,
        estimatedGasCostUsd: 0,
        adverseSelectionBufferBps: 0,
        safetyMarginBps: 0,
      },
    );
    expect(evaluation.actions).toContainEqual(
      expect.objectContaining({
        action: 'BLOCKED',
        side: 'SELL',
        reason: 'EXIT_REDUCE_ONLY_METADATA_UNVERIFIED',
      }),
    );
    expect(evaluation.actions).not.toContainEqual(
      expect.objectContaining({ side: 'SELL', reason: 'SIDE_SUPPRESSED' }),
    );
  });

  it('keeps a valid authenticated resting sell when no new quote candidate exists', () => {
    const snapshot = makeSnapshot();
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...snapshot.input,
        actualInventoryBase: 0.0238,
        openOrders: [
          {
            venueOrderId: 'resting-sell',
            clientOrderId: `d1s${'b'.repeat(29)}`,
            strategyConfigId: snapshot.input.strategyConfigId,
            market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: 'SELL',
            price: 101,
            quantity: 0.023,
            reduceOnly: true,
            orderType: 'LIMIT',
            timeInForce: 'PostOnly',
            postOnly: true,
          },
        ],
      },
      {
        minimumNotionalUsd: 100,
        maximumNotionalUsd: 101,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 1,
        maximumAbsPositionBase: 2,
        maximumAggregateCollateralFraction: 0.5,
        halfSpreadBps: 5,
        makerFeeBps: 0,
        estimatedGasCostUsd: 0,
        adverseSelectionBufferBps: 0,
        safetyMarginBps: 0,
      },
    );

    expect(evaluation.blockers).toEqual([]);
    expect(evaluation.operatingState).toBe('NORMAL_MM');
    expect(evaluation.askEligibilityReason).toBe('NO_QUOTE_CANDIDATE');
    const restingSell = evaluation.actions.find((action) => action.side === 'SELL');
    expect(restingSell).toMatchObject({
      action: 'NO_OP',
      side: 'SELL',
      reason: 'KEEP:VALID_REDUCE_ONLY_EXIT',
    });
    expect(restingSell?.current?.venueOrderId).toBe('resting-sell');
    expect(evaluation.actions).not.toContainEqual(
      expect.objectContaining({ action: 'WOULD_CANCEL', side: 'SELL' }),
    );
  });

  it('completes a recovered filled intent and advances to inventory management', async () => {
    const positioned = makeSnapshot();
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), positioned],
      placeOutcome: 'PLACE_OUTCOME_UNKNOWN',
      reconciliationState: 'FULL_FILL',
    });
    const submitted = await test.orchestrator.evaluateOnce();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      intentId: submitted.intentId,
      mutationInvocations: 0,
    });
    expect(test.journal.get(submitted.intentId ?? '')?.status).toBe('APPLIED');
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('defers transient authenticated reconciliation reads to supervisor-owned cycles without resubmission', async () => {
    const timeout = Object.assign(new Error('Indexer request timed out'), { code: 'ETIMEDOUT' });
    const reset = Object.assign(new Error('Indexer connection reset'), { code: 'ECONNRESET' });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_RECONCILED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_REQUIRED_CANARY_EVIDENCE_HASH: 'same',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), makeSnapshot()],
      placeOutcome: 'PLACE_OUTCOME_UNKNOWN',
      readFailuresAt: new Map([
        [3, timeout],
        [4, reset],
      ]),
    });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILIATION_REQUIRED',
    });
    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
    });
    expect(test.reads()).toBe(5);
    expect(test.reconciliations()).toBe(1);
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('waits safely for delayed indexer confirmation without duplicate placement', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), makeSnapshot()],
      reconciliationError: new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS'),
    });

    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'ACKNOWLEDGED',
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      blocker: 'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING',
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(1);
    expect(test.orchestrator.isPaused()).toBe(false);
    await test.orchestrator.close();
  });

  it('classifies crash-after-ack disappearance without terminal evidence as unresolvable', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
      },
      snapshots: [makeSnapshot(), makeSnapshot(), makeSnapshot()],
      reconciliationError: new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'),
    });

    const acknowledged = await test.orchestrator.evaluateOnce();
    expect(acknowledged.action).toBe('ACKNOWLEDGED');
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      intentId: acknowledged.intentId,
      blocker: 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(1);
    expect(test.journal.get(acknowledged.intentId ?? '')?.status).toBe('UNRESOLVABLE_ACK');
    await test.orchestrator.close();
  });

  it('clears a transient unresolvable ACK only after atomic authoritative provenance', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
      },
      snapshots: Array.from({ length: 30 }, () => makeSnapshot()),
      reconciliationResults: [
        new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'),
        'ORDER_OPEN',
      ],
    });
    const acknowledged = await test.orchestrator.evaluateOnce();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      blocker: 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
    });
    expect(test.journal.get(acknowledged.intentId!)?.status).toBe('UNRESOLVABLE_ACK');
    expect(test.journal.getLatestReconciliationProvenance(acknowledged.intentId!)).toBeNull();
    const recovered = await test.orchestrator.evaluateOnce();
    expect(recovered.blocker).not.toBe('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
    expect(recovered.mutationInvocations).toBe(0);
    expect(test.journal.get(acknowledged.intentId!)?.status).toBe('ACKNOWLEDGED');
    expect(test.journal.getLatestReconciliationProvenance(acknowledged.intentId!)).toMatchObject({
      source: 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION',
      venueStatus: 'OPEN',
    });
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('recovers lagging ACK via exact direct OPEN evidence atomically, including restart', async () => {
    const snapshot = makeSnapshot();
    const direct = {
      venueOrderId: 'v1',
      clientOrderId: 'pending',
      strategyConfigId: snapshot.input.strategyConfigId,
      market: snapshot.input.market,
      side: 'BUY' as const,
      price: 100,
      quantity: 0.001,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    };
    const journalPath = join(mkdtempSync(join(tmpdir(), 'ack-projection-')), 'journal.sqlite');
    const test = make({
      journalPath,
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      snapshots: Array.from({ length: 10 }, () => snapshot),
      reconciliationError: new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'),
      timeoutVerification: 'ORDER_OPEN',
      directOpenOrder: direct,
    });
    const placed = await test.orchestrator.evaluateOnce();
    const intent = test.journal.getIntent(placed.intentId!)!;
    Object.assign(direct, {
      clientOrderId: intent.clientOrderId,
      side: intent.side,
      price: intent.price,
      quantity: intent.quantity,
    });
    expect(test.journal.getLatestReconciliationProvenance(intent.intentId)).toBeNull();
    const recovered = await test.orchestrator.evaluateOnce();
    expect(recovered).toMatchObject({
      action: 'RECONCILE_ONLY',
      blocker: null,
      mutationInvocations: 0,
    });
    expect(test.journal.getLatestReconciliationProvenance(intent.intentId)).toMatchObject({
      venueOrderId: 'v1',
      clientOrderId: intent.clientOrderId,
      venueStatus: 'OPEN',
      remainingQuantity: intent.quantity,
      source: 'AUTHENTICATED_OPEN_ORDERS',
    });
    expect(test.journal.get(intent.intentId)?.status).toBe('ACKNOWLEDGED');
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
    const restarted = make({
      journalPath,
      snapshots: [{ ...snapshot, input: { ...snapshot.input, openOrders: [direct] } }],
      reconciliationState: 'ORDER_OPEN',
    });
    restarted.orchestrator.setPaused(true);
    expect((await restarted.orchestrator.evaluateOnce()).mutationInvocations).toBe(0);
    expect(restarted.journal.nonTerminal()).toHaveLength(1);
    expect(restarted.journal.getActiveIdentityConflict()).toBeNull();
    await restarted.orchestrator.close();
  });

  it('keeps timed-out confirmation nonterminal and never resubmits the pending intent', async () => {
    const base = makeSnapshot();
    const late = makeSnapshot({
      input: {
        ...base.input,
        now: 12_001,
        metadata: { ...base.input.metadata, observedAt: 12_001 },
        book: { ...base.input.book, observedAt: 12_001 },
      },
      sourceStateHash: 'late-state',
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT_MS: '10000',
      },
      snapshots: [base, base, late],
      reconciliationError: new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS'),
    });

    const placed = await test.orchestrator.evaluateOnce();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      intentId: placed.intentId,
      blocker: 'PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT',
      mutationInvocations: 0,
    });
    expect(test.calls()).toBe(1);
    expect(test.journal.get(placed.intentId ?? '')?.status).toBe('ACKNOWLEDGED');
    await test.orchestrator.close();
  });

  it('uses fallback venue verification to recover a timed-out open order', async () => {
    const base = makeSnapshot();
    const late = makeSnapshot({
      input: {
        ...base.input,
        now: 12_001,
        metadata: { ...base.input.metadata, observedAt: 12_001 },
        book: { ...base.input.book, observedAt: 12_001 },
      },
      sourceStateHash: 'late-open',
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT_MS: '10000',
      },
      snapshots: [base, base, late, late],
      reconciliationError: new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS'),
      timeoutVerification: 'ORDER_OPEN',
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'ACKNOWLEDGED',
    });
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      blocker: null,
    });
    expect(test.calls()).toBe(1);
    await test.orchestrator.close();
  });

  it('terminalizes an authenticated failed timeout and releases the intent lock', async () => {
    const base = makeSnapshot();
    const late = makeSnapshot({
      input: {
        ...base.input,
        now: 12_001,
        metadata: { ...base.input.metadata, observedAt: 12_001 },
        book: { ...base.input.book, observedAt: 12_001 },
      },
      sourceStateHash: 'late-failed',
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
        DECIBEL_PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT_MS: '10000',
      },
      snapshots: [base, base, late, late],
      reconciliationError: new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS'),
      timeoutVerification: 'INTENT_FAILED_TIMEOUT',
    });
    const placed = await test.orchestrator.evaluateOnce();
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'RECONCILE_ONLY',
      blocker: null,
    });
    expect(test.journal.get(placed.intentId ?? '')?.status).toBe('FAILED_TIMEOUT');
    expect(test.journal.nonTerminal()).toEqual([]);
    await test.orchestrator.close();
  });

  it('releases a phantom intent only after authoritative ledger-expiration proof', async () => {
    const base = makeSnapshot();
    const expired = makeSnapshot({
      input: {
        ...base.input,
        now: 32_001,
        metadata: { ...base.input.metadata, observedAt: 32_001 },
        book: { ...base.input.book, observedAt: 32_001 },
      },
      sourceStateHash: 'expired-proof',
    });
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'false',
      },
      snapshots: [base, base, expired],
      reconciliationError: new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS'),
      timeoutVerification: 'DROPPED_EXPIRED',
    });
    const placed = await test.orchestrator.evaluateOnce();
    test.journal.recordOutcome(
      placed.intentId ?? '',
      {
        outcome: 'PLACE_TIMEOUT_UNKNOWN',
        transactionHash: '0xtransaction',
        expirationTimestampMs: 20_000,
      },
      1_001,
    );
    const recovered = await test.orchestrator.evaluateOnce();
    expect(recovered.blocker).toContain('INTENT_EXPIRED_DROPPED');
    expect(test.journal.get(placed.intentId ?? '')?.status).toBe('FAILED_DROPPED');
    expect(test.journal.nonTerminal()).toEqual([]);
    await test.orchestrator.close();
  });

  it('fails closed after one transient read so only the supervisor may retry', async () => {
    const failures = new Map<number, Error>();
    for (let read = 1; read <= 4; read += 1)
      failures.set(
        read,
        Object.assign(new Error('Indexer request timed out'), { code: 'ETIMEDOUT' }),
      );
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      readFailuresAt: failures,
    });

    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    expect(test.reads()).toBe(1);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('recovers on the next fresh cycle after transient authenticated reads fail', async () => {
    const failures = new Map<number, Error>();
    failures.set(1, Object.assign(new Error('Indexer timed out'), { code: 'ETIMEDOUT' }));
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      readFailuresAt: failures,
    });
    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    expect(test.calls()).toBe(0);
    const recovered = await test.orchestrator.evaluateOnce();
    expect(recovered.action).toBe('DRY_RUN_PREPARED');
    expect(recovered.mutationInvocations).toBe(0);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('defers stale-book retries across supervisor-owned cycles', async () => {
    const staleBook = new Error('PRODUCTION_LIVE_SOURCE_BOOK_STALE');
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      snapshots: [makeSnapshot(), makeSnapshot()],
      readFailuresAt: new Map([
        [1, staleBook],
        [2, staleBook],
      ]),
    });

    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
    );
    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
    );
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      action: 'DRY_RUN_PREPARED',
      mutationInvocations: 0,
    });
    expect(test.reads()).toBe(4);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('preserves the stale-book blocker without component-owned retries', async () => {
    const failures = new Map<number, Error>();
    for (let read = 1; read <= 4; read += 1)
      failures.set(read, new Error('PRODUCTION_LIVE_SOURCE_BOOK_STALE'));
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      readFailuresAt: failures,
    });

    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
    );
    expect(test.reads()).toBe(1);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('treats an opaque SDK read failure as transient without component-owned retries', async () => {
    const failures = new Map<number, Error>();
    for (let read = 1; read <= 4; read += 1)
      failures.set(read, new Error('Indexer request failed without an HTTP response'));
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_READ_RETRY_BACKOFF_MS: '1',
      },
      readFailuresAt: failures,
    });
    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    expect(test.reads()).toBe(1);
    await test.orchestrator.close();
  });

  it.each([401, 403])(
    'fails immediately for explicit HTTP %s authentication errors',
    async (status) => {
      const authenticationError = Object.assign(new Error('Decibel request rejected'), { status });
      const test = make({ readFailuresAt: new Map([[1, authenticationError]]) });
      await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
        'PRODUCTION_AUTHENTICATED_READ_REQUIRED',
      );
      expect(test.reads()).toBe(1);
      await test.orchestrator.close();
    },
  );

  it('blocks autonomous release without matching canary evidence', () => {
    expect(() =>
      make({
        environment: {
          DECIBEL_EXECUTION_MODE: 'production',
          DECIBEL_EXECUTION_RELEASE_STAGE: 'AUTONOMOUS',
          DECIBEL_EXECUTOR_ENABLED: 'true',
          DECIBEL_EXECUTOR_DRY_RUN: 'false',
        },
      }),
    ).toThrow('AUTONOMOUS_RELEASE_CANARY_EVIDENCE_REQUIRED');
  });

  it('stops a bounded loop at max cycles', async () => {
    const test = make({
      environment: {
        DECIBEL_EXECUTION_MODE: 'production',
        DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
        DECIBEL_EXECUTOR_ENABLED: 'true',
        DECIBEL_EXECUTOR_DRY_RUN: 'true',
        DECIBEL_PRODUCTION_LIVE_MAX_CYCLES: '1',
      },
    });
    const result = await runDecibelProductionLiveLoopV1({
      orchestrator: test.orchestrator,
      configuration: test.configuration,
      signal: new AbortController().signal,
      sleep: () => Promise.resolve(),
    });
    expect(result).toEqual({ cycles: 1, mutationInvocations: 0, stopped: true });
  });

  it('tracks realized PnL over dashboard time windows', () => {
    const now = 2_000;
    const fill = (side: 'BUY' | 'SELL', price: number, id: string) => ({
      venueFillId: id,
      venueOrderId: id,
      localExecutionRequestId: id,
      marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side,
      executedPrice: price,
      executedBaseQuantity: 1,
      executedUsdNotional: price,
      makerOrTaker: 'MAKER' as const,
      receivedAt: new Date(1_000),
      venueTimestamp: new Date(1_000),
      fee: { availability: 'AVAILABLE' as const, amount: 0, currency: 'USD' },
      rebate: { availability: 'UNAVAILABLE' as const, amount: null, currency: null },
      executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
    });
    const result = calculateDecibelRealizedPnlWindowsV1(
      [fill('BUY', 100, 'buy'), fill('SELL', 105, 'sell')],
      now,
    );
    expect(result.hours24.realizedPnlUsd).toBe(5);
    expect(result.days30.realizedPnlPercent).toBeCloseTo((5 / 105) * 100);
  });

  it('runs a 500-cycle deterministic two-sided fake-venue soak without permanent blockers', async () => {
    type OpenOrder = decibel_production_live_snapshot_v1['input']['openOrders'][number];
    const root = mkdtempSync(join(tmpdir(), 'decibel-soak-'));
    const journal = new decibel_execution_lifecycle_journal_v1(join(root, 'journal.sqlite'));
    const openOrders = new Map<string, OpenOrder>();
    const terminalOrders = new Map<string, 'FULL_FILL' | 'ORDER_CANCELLED'>();
    const usedClientOrderIds = new Set<string>();
    const positions: number[] = [0];
    let ledger = createDecibelActualFillLedgerV1([]);
    let inventoryBase = 0;
    let ending = false;
    let activeSessionId = 'session';
    let unwindFills = 0;
    let endResult: unknown = null;
    let now = 10_000;
    let venueSequence = 0;
    let mutationCount = 0;
    let permanentBlockers = 0;
    let buyFills = 0;
    let sellFills = 0;
    const resultCounts = new Map<string, number>();
    const recordVenueFill = (
      order: {
        venueOrderId: string;
        clientOrderId: string;
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
      },
      maker: boolean,
    ) => {
      ledger = {
        ...ledger,
        orders: [
          ...ledger.orders,
          {
            venueOrderId: order.venueOrderId,
            localIntentId: order.clientOrderId,
            localExecutionRequestId: order.clientOrderId,
            marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: order.side,
            requestedQuantity: order.quantity,
          },
        ],
      };
      const fill = {
        venueFillId: `soak-fill-${order.venueOrderId}`,
        venueOrderId: order.venueOrderId,
        localExecutionRequestId: order.clientOrderId,
        marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        side: order.side,
        executedPrice: order.price,
        executedBaseQuantity: order.quantity,
        executedUsdNotional: order.quantity * order.price,
        makerOrTaker: maker ? ('MAKER' as const) : ('TAKER' as const),
        receivedAt: new Date(now),
        venueTimestamp: new Date(now),
        transactionVersion: String(100000 + venueSequence),
        fee: { availability: 'AVAILABLE' as const, amount: 0, currency: 'USD' },
        rebate: { availability: 'AVAILABLE' as const, amount: 0, currency: 'USD' },
        executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
      };
      ledger = applyDecibelActualFillTruthV1(ledger, fill);
      expect(applyDecibelActualFillTruthV1(ledger, fill)).toBe(ledger);
    };
    const snapshot = (): decibel_production_live_snapshot_v1 => {
      now += 10;
      const base = makeSnapshot();
      return makeSnapshot({
        input: {
          ...base.input,
          sessionId: activeSessionId,
          now,
          book: { ...base.input.book, observedAt: now },
          metadata: { ...base.input.metadata, observedAt: now },
          actualInventoryBase: inventoryBase,
          actualFillLedger: ledger,
          openOrders: [...openOrders.values()],
        },
        sourceStateHash: `soak-${now}-${inventoryBase}-${[...openOrders.keys()].join('-')}`,
        sessionConfiguration: {
          revision: 0,
          capitalToUseUsd: 8,
          maxLossUsd: 2,
          targetMakerVolumeUsd: 201,
          maxPositionUsd: 10,
          marginUsedUsd: 0,
          makerVolumeUsd: ledger.actualExternalMakerVolumeUsd,
          totalExecutedVolumeUsd: ledger.actualExternalMakerVolumeUsd + ledger.actualTakerVolumeUsd,
          pnlUsd: ledger.realizedPnlUsd,
          riskBlocker: null,
        },
        maximumNotionalUsd: 10,
        availableMarginUsd: 10,
        economicInputs: {
          makerFeeBps: 0,
          makerFeeSource: 'CONFIG',
          estimatedGasCostUsd: 0,
          estimatedGasCostSource: 'CONFIG',
          adverseSelectionBufferBps: ending ? 999 : 0,
          adverseSelectionSource: 'CONFIG',
          safetyMarginBps: 0,
        },
      });
    };
    const source: DecibelProductionLiveStateSourceV1 = {
      readAuthenticatedSnapshot: () => Promise.resolve(snapshot()),
      readAuthenticatedSnapshotAfterMutation: () => Promise.resolve(snapshot()),
      reconcileIntent: (_intentId, _snapshot, venueOrderId) => {
        if (venueOrderId !== undefined && openOrders.has(venueOrderId))
          return Promise.resolve('ORDER_OPEN');
        const terminal = venueOrderId === undefined ? undefined : terminalOrders.get(venueOrderId);
        if (terminal !== undefined) return Promise.resolve(terminal);
        return Promise.reject(new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS'));
      },
      revalidateCancelTarget: (intent) =>
        Promise.resolve(
          openOrders.has(intent.expectedPreviousVenueOrderId)
            ? 'ORDER_OPEN'
            : (terminalOrders.get(intent.expectedPreviousVenueOrderId) ?? 'UNRESOLVED'),
        ),
    };
    const executor: DecibelProductionExecutionExecutorV1 = {
      placePostOnlyLimit: (intent) => {
        mutationCount += 1;
        expect(ending).toBe(false);
        const reducing =
          (inventoryBase < 0 && intent.side === 'BUY') ||
          (inventoryBase > 0 && intent.side === 'SELL');
        expect(intent.reduceOnly).toBe(reducing);
        if (reducing) expect(intent.quantity).toBeLessThanOrEqual(Math.abs(inventoryBase) + 1e-12);
        expect(intent.postOnly).toBe(true);
        expect(usedClientOrderIds.has(intent.clientOrderId)).toBe(false);
        usedClientOrderIds.add(intent.clientOrderId);
        const venueOrderId = `soak-order-${++venueSequence}`;
        openOrders.set(venueOrderId, {
          venueOrderId,
          clientOrderId: intent.clientOrderId,
          reduceOnly: intent.reduceOnly,
          strategyConfigId: makeSnapshot().input.strategyConfigId,
          market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
          side: intent.side,
          price: intent.price,
          quantity: intent.quantity,
          orderType: 'LIMIT',
          timeInForce: 'PostOnly',
          postOnly: true,
        });
        return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId });
      },
      placeReduceOnlyImmediateOrCancel: (intent) => {
        mutationCount++;
        expect(intent.reduceOnly).toBe(true);
        expect(intent.postOnly).toBe(false);
        expect(intent.quantity).toBeLessThanOrEqual(Math.abs(inventoryBase) + 1e-12);
        expect(intent.side).toBe(inventoryBase > 0 ? 'SELL' : 'BUY');
        const venueOrderId = `soak-unwind-${++venueSequence}`;
        inventoryBase = Number(
          (inventoryBase + (intent.side === 'BUY' ? intent.quantity : -intent.quantity)).toFixed(
            12,
          ),
        );
        recordVenueFill(
          {
            venueOrderId,
            clientOrderId: intent.clientOrderId,
            side: intent.side,
            price: intent.price,
            quantity: intent.quantity,
          },
          false,
        );
        terminalOrders.set(venueOrderId, 'FULL_FILL');
        unwindFills++;
        return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId });
      },
      cancelExactOrder: (intent) => {
        mutationCount += 1;
        const existed = openOrders.delete(intent.expectedPreviousVenueOrderId);
        expect(existed).toBe(true);
        terminalOrders.set(intent.expectedPreviousVenueOrderId, 'ORDER_CANCELLED');
        return Promise.resolve({ outcome: 'CANCEL_CONFIRMED' });
      },
    };
    const configuration = parseDecibelProductionLiveConfigurationV1({
      DECIBEL_EXECUTION_MODE: 'production',
      DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
      DECIBEL_EXECUTOR_ENABLED: 'true',
      DECIBEL_EXECUTOR_DRY_RUN: 'false',
      DECIBEL_PRODUCTION_MIN_ACTIVE_ORDER_LIFETIME_MS: '5000',
      // The soak checks two-sided cycling; the entry candle filter has its own tests.
      DECIBEL_ENTRY_CANDLE_FILTER_ENABLED: 'false',
    });
    const orchestrator = new decibel_production_live_orchestrator_v1(
      journal,
      source,
      executor,
      configuration,
      {
        maxPlaceAttemptsPerMinute: 1_000,
        maxCancelAttemptsPerMinute: 1_000,
        maxTotalMutationAttemptsPerMinute: 2_000,
        maxConsecutiveUnknownOutcomes: 1,
        maxKnownLiveOrders: 2,
      },
      undefined,
      () => now,
    );
    const Settings = new decibel_operator_settings_store_v1(join(root, 'settings.json'), {
      capitalToUseUsd: 8,
      maxLossUsd: 2,
      targetMakerVolumeUsd: 201,
      orderNotionalUsd: 10,
      maxPositionUsd: 50,
    });
    const Sessions = new decibel_production_session_store_v1(join(root, 'sessions.sqlite'));
    const Controller = new decibel_production_session_controller_v1(
      Sessions,
      Settings,
      () =>
        Promise.resolve({
          stop: async () => {
            ending = true;
            orchestrator.requestSessionUnwind();
            for (
              let attempt = 0;
              attempt < 30 && !orchestrator.isSessionUnwindComplete();
              attempt++
            )
              endResult = await orchestrator.evaluateOnce();
            const safeToEnd =
              orchestrator.isSessionUnwindComplete() &&
              inventoryBase === 0 &&
              openOrders.size === 0 &&
              journal.nonTerminal().length === 0;
            const metrics = synchronizeDecibelSessionAccountingV1(
              journal,
              ledger,
              activeSessionId,
              100.1,
            );
            const count = journal.getSessionFills(activeSessionId).length;
            synchronizeDecibelSessionAccountingV1(journal, ledger, activeSessionId, 100.1);
            expect(journal.getSessionFills(activeSessionId)).toHaveLength(count);
            return {
              safeToEnd,
              blocker: safeToEnd ? null : 'AUTHENTICATED_UNWIND_PENDING',
              accounting: {
                makerVolumeUsd: metrics.makerVolumeUsd,
                takerVolumeUsd: metrics.takerVolumeUsd,
                totalExecutedVolumeUsd: metrics.totalExecutedVolumeUsd,
                fillCount: metrics.fillCount,
                finalBotState: 'ENDED',
                finalPositionBase: inventoryBase,
                unresolvedExecutionCount: journal.nonTerminal().length,
              },
            };
          },
        }),
      () => now,
    );
    const started = await Controller.start(0);
    activeSessionId = started.sessionId;
    const fillSide = (side: 'BUY' | 'SELL') => {
      const match = [...openOrders.values()].find((order) => order.side === side);
      expect(match).toBeDefined();
      openOrders.delete(match!.venueOrderId);
      const closing =
        (inventoryBase > 0 && side === 'SELL') || (inventoryBase < 0 && side === 'BUY');
      const executedQuantity = closing
        ? Math.min(Math.abs(inventoryBase), match!.quantity)
        : match!.quantity;
      terminalOrders.set(
        match!.venueOrderId,
        executedQuantity + 1e-12 < match!.quantity ? 'ORDER_CANCELLED' : 'FULL_FILL',
      );
      // Model the venue/reconciliation fixture removing the paired quote after a fill.
      // A stale opposite quote may otherwise legitimately become inventory-invalid under
      // the production anti-flip invariant and requires explicit reconciliation.
      for (const [venueOrderId] of openOrders) {
        openOrders.delete(venueOrderId);
        terminalOrders.set(venueOrderId, 'ORDER_CANCELLED');
      }
      inventoryBase = Number(
        (inventoryBase + (side === 'BUY' ? executedQuantity : -executedQuantity)).toFixed(12),
      );
      recordVenueFill({ ...match!, quantity: executedQuantity }, true);
      positions.push(inventoryBase);
      if (side === 'BUY') buyFills += 1;
      else sellFills += 1;
    };

    for (let cycle = 0; cycle < 500; cycle += 1) {
      if (cycle > 3 && cycle % 4 === 0 && openOrders.size > 0) {
        const preferredSide = inventoryBase > 0 ? 'SELL' : inventoryBase < 0 ? 'BUY' : 'BUY';
        const availableSide = [...openOrders.values()].some((order) => order.side === preferredSide)
          ? preferredSide
          : [...openOrders.values()][0]!.side;
        fillSide(availableSide);
      }
      const before = mutationCount;
      const result = await orchestrator.evaluateOnce();
      const resultKey = `${result.action}:${result.blocker ?? 'NONE'}`;
      resultCounts.set(resultKey, (resultCounts.get(resultKey) ?? 0) + 1);
      expect(mutationCount - before).toBeLessThanOrEqual(1);
      if (result.action === 'BLOCKED' && result.blocker !== 'EXECUTION_MUTATION_BUDGET_BLOCKED')
        permanentBlockers += 1;
      expect(
        [...openOrders.values()].filter((order) => order.side === 'BUY').length,
      ).toBeLessThanOrEqual(1);
      expect(
        [...openOrders.values()].filter((order) => order.side === 'SELL').length,
      ).toBeLessThanOrEqual(1);
    }

    expect(
      buyFills,
      JSON.stringify({
        mutationCount,
        openOrders: [...openOrders.values()],
        resultCounts: [...resultCounts],
      }),
    ).toBeGreaterThan(20);
    expect(sellFills).toBeGreaterThan(20);
    expect(positions.some((position) => position > 0)).toBe(true);
    // Normal neutral-band recycling can retain a residual. Canonical End below
    // must still reach exactly zero; during trading inventory must reduce.
    expect(
      positions.some(
        (position, index) => index > 0 && Math.abs(position) < Math.abs(positions[index - 1]!),
      ),
    ).toBe(true);
    expect(permanentBlockers).toBe(0);
    expect(usedClientOrderIds.size).toBeGreaterThan(40);
    const decisions = journal.getDecisionSnapshots();
    expect(decisions).toHaveLength(500);
    expect(
      decisions.every(
        (decision) =>
          typeof (decision.snapshot as { exactReasonCode?: unknown }).exactReasonCode === 'string',
      ),
    ).toBe(true);
    if (inventoryBase === 0 && openOrders.size > 0) fillSide([...openOrders.values()][0]!.side);
    const endingPosition = inventoryBase;
    const ended = await Controller.end('OPERATOR_END');
    expect(
      ended.status,
      JSON.stringify({
        inventoryBase,
        openOrders: [...openOrders.values()],
        pending: journal.nonTerminal(),
        endResult,
      }),
    ).toBe('ENDED');
    expect(inventoryBase).toBe(0);
    expect(openOrders.size).toBe(0);
    expect(journal.ledger().inventory).toBeCloseTo(0, 12);
    expect(ledger.actualExternalMakerVolumeUsd).toBeGreaterThan(0);
    if (endingPosition !== 0) expect(ledger.actualTakerVolumeUsd).toBeGreaterThan(0);
    expect(journal.nonTerminal()).toHaveLength(0);
    if (endingPosition !== 0) expect(unwindFills).toBe(1);
    expect(ended.configSnapshot).toEqual(started.configSnapshot);
    expect(ended.totalExecutedVolumeUsd).toBeCloseTo(
      ledger.actualExternalMakerVolumeUsd + ledger.actualTakerVolumeUsd,
    );
    expect(ended.fillCount).toBe(ledger.fills.length);
    const countBeforeRestart = mutationCount;
    Sessions.close();
    const Reopened = new decibel_production_session_store_v1(join(root, 'sessions.sqlite'));
    expect(Reopened.list()[0]?.status).toBe('ENDED');
    expect(Reopened.getActive()).toBeNull();
    expect(mutationCount).toBe(countBeforeRestart);
    Reopened.close();
    await orchestrator.close();
    // Allow the full 500-cycle canonical journal/accounting replay under parallel test IO.
  }, 60_000);
});

describe('PID 29964 STOPPING acknowledgement recovery', () => {
  function openFixture() {
    const Base = makeSnapshot({
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 50,
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 40,
    });
    const orders = (['SELL', 'BUY'] as const).map((side) => ({
      venueOrderId:
        side === 'BUY'
          ? '170141594179263706325462758128399417344'
          : '170141594179263709323399712224858603520',
      clientOrderId:
        side === 'BUY' ? 'd1b775da7b009fab826cc105367888d9' : 'd1s939629f0f04d4933e95edaa725ad7',
      strategyConfigId: Base.input.strategyConfigId,
      market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side,
      price: side === 'BUY' ? 80394.1 : 80531.90000000001,
      quantity: 0.00031,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
    }));
    const Open = makeSnapshot({
      ...Base,
      input: {
        ...Base.input,
        openOrders: orders,
        metadata: { ...Base.input.metadata, lotSize: 0.00001, minimumSize: 0.00002 },
        book: { ...Base.input.book, bestBid: 80434.3, bestAsk: 80434.4 },
      },
    });
    return { Open, orders };
  }
  function seed(test: ReturnType<typeof make>, orders: ReturnType<typeof openFixture>['orders']) {
    return orders.map((order, index) => {
      const intent = buildDecibelExecutionIntentV1({
        sessionId: 'session',
        cycleSequence: 298700 + index,
        action: 'PLACE',
        market: 'BTC/USD',
        side: order.side,
        price: order.price,
        quantity: order.quantity,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId: order.clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: 'ack',
        strategyDecisionHash: 'ack',
        createdAt: 1,
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, order.venueOrderId);
      return intent;
    });
  }
  const environment = { DECIBEL_EXECUTOR_DRY_RUN: 'false' };
  it('prioritizes a newer unresolved ACK over an older OPEN owner after transient authentication failure', async () => {
    const { Open, orders } = openFixture();
    const journalPath = join(mkdtempSync(join(tmpdir(), 'stopping-restart-')), 'journal.sqlite');
    const test = make({
      journalPath,
      environment,
      snapshots: Array.from({ length: 8 }, () => Open),
      readFailuresAt: new Map([[1, new Error('PRODUCTION_AUTHENTICATED_READ_TRANSIENT')]]),
      reconciliationResults: [
        new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'),
        'ORDER_OPEN',
      ],
    });
    const intents = seed(test, orders);
    const unresolved = intents[1]!;
    test.journal.markUnresolvableAcknowledgement(unresolved.intentId, 3);
    test.orchestrator.requestSessionUnwind();
    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
      intentId: unresolved.intentId,
      blocker: 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
    });
    expect(test.calls()).toBe(0);
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
    const next = await test.orchestrator.evaluateOnce();
    expect(test.reconciledIntentIds.slice(0, 2)).toEqual([
      unresolved.intentId,
      unresolved.intentId,
    ]);
    expect(next.action).not.toBe('DUPLICATE_SUPPRESSED');
    expect(test.submitted().every((action) => action.action === 'CANCEL')).toBe(true);
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
    await test.orchestrator.close();
    const restarted = make({
      journalPath,
      environment,
      snapshots: Array.from({ length: 10 }, () => makeSnapshot()),
      reconciliationState: 'ORDER_CANCELLED',
    });
    restarted.orchestrator.requestSessionUnwind();
    for (let i = 0; i < 5 && !restarted.orchestrator.isSessionUnwindComplete(); i++)
      await restarted.orchestrator.evaluateOnce();
    expect(restarted.orchestrator.isSessionUnwindComplete()).toBe(true);
    expect(restarted.journal.nonTerminal()).toEqual([]);
    expect(restarted.calls()).toBe(0);
    await restarted.orchestrator.evaluateOnce();
    expect(restarted.orchestrator.isSessionUnwindComplete()).toBe(true);
    await restarted.orchestrator.close();
  });
  it('reconciles and reports the actual duplicate owner, never the unpersisted CANCEL candidate', async () => {
    const { Open, orders } = openFixture();
    const test = make({
      environment,
      postMutationRead: true,
      snapshots: Array.from({ length: 8 }, () => Open),
      reconciliationState: 'ORDER_OPEN',
    });
    const intents = seed(test, orders);
    const owner = intents[1]!;
    vi.spyOn(test.journal, 'claimForSubmission').mockReturnValueOnce({
      duplicate: true,
      intentId: owner.intentId,
    });
    test.orchestrator.requestSessionUnwind();
    const result = await test.orchestrator.evaluateOnce();
    expect(result).toMatchObject({
      action: 'DUPLICATE_SUPPRESSED',
      intentId: owner.intentId,
      blocker: 'EXECUTION_DUPLICATE_OWNER_RECONCILIATION_REQUIRED',
    });
    expect(test.reconciledIntentIds.at(-1)).toBe(owner.intentId);
    expect(test.calls()).toBe(0);
    expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
    await test.orchestrator.close();
  });
});

it.each([0.01, 10])(
  'propagates final admission limits through actual orchestration and reports its outcome (%s)',
  async (maximumNotionalUsd) => {
    const snapshot = makeSnapshot();
    const test = make({
      snapshots: [snapshot, snapshot],
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      validateSubmission: (intent) => ({
        observedAt: snapshot.input.now,
        preflight: {
          tickSize: snapshot.input.metadata.tickSize,
          lotSize: snapshot.input.metadata.lotSize,
          minimumSize: snapshot.input.metadata.minimumSize,
          minimumNotionalUsd: snapshot.minimumNotionalUsd,
          maximumNotionalUsd,
          permittedSide: intent.side,
          bestBid: snapshot.input.book.bestBid,
          bestAsk: snapshot.input.book.bestAsk,
        },
      }),
    });
    try {
      const result = await test.orchestrator.evaluateOnce();
      expect(result.action).toBe(maximumNotionalUsd < 1 ? 'BLOCKED' : 'ACKNOWLEDGED');
      expect(test.calls()).toBe(maximumNotionalUsd < 1 ? 0 : 1);
      expect(result.orderDecisionTrace?.ACTUAL_CAPACITY_LIMIT.maximumOrderNotionalUsd).toBe(
        maximumNotionalUsd,
      );
      expect(result.orderDecisionTrace?.FINAL_EXECUTOR_OUTCOME).toBe(
        maximumNotionalUsd < 1 ? 'BLOCKED' : 'ACKNOWLEDGED',
      );
      if (maximumNotionalUsd < 1)
        expect(result.orderDecisionTrace?.FIRST_BLOCKING_GATE).toMatchObject({
          function: 'decibel_execution_lifecycle_v1.submit',
          reason: 'EXECUTION_PREFLIGHT_NOTIONAL_ABOVE_MAXIMUM',
        });
    } finally {
      await test.orchestrator.close();
    }
  },
);

it('blocks strategic PLACE when the production source requires capacity evidence', async () => {
  const snapshot = makeSnapshot({ capacityModelRequired: true });
  const test = make({
    environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
    snapshots: [snapshot, snapshot],
  });
  const result = await test.orchestrator.evaluateOnce();
  expect(result).toMatchObject({
    action: 'BLOCKED',
    blocker: 'SESSION_CAPACITY_EVIDENCE_REQUIRED',
  });
  expect(result.orderDecisionTrace).toMatchObject({
    FIRST_BLOCKING_GATE: {
      function: 'evaluateTradingDecision.finalPlan',
      reason: 'SESSION_CAPACITY_EVIDENCE_REQUIRED',
    },
    FINAL_EXECUTOR_OUTCOME: 'BLOCKED',
  });
  expect(result.orderDecisionTrace?.REQUIRED_EVIDENCE).toContain(
    'SESSION_CAPACITY_EVIDENCE_REQUIRED',
  );
  expect(test.calls()).toBe(0);
  await test.orchestrator.close();
});

// Sanitized from PID 24208: 0.00073 BTC long, ~$118 aggregate capacity,
// $201 V2 target and $58.685649 executed. No venue identity or account secrets.
describe('Dynamic activation incident sizing and unwind isolation', () => {
  const snapshot = makeSnapshot();
  const input = {
    ...snapshot.input,
    actualInventoryBase: 0.00073,
    book: { bestBid: 80353.3, bestAsk: 80353.7, observedAt: 1000 },
    metadata: { ...snapshot.input.metadata, lotSize: 0.00001, minimumSize: 0.00002 },
    targetExternalMakerVolumeUsd: 201,
  };
  const sizing = {
    minimumNotionalUsd: 10,
    maximumNotionalUsd: 118,
    availableMarginUsd: 6.53,
    maximumEffectiveLeverage: 40,
    maximumAbsPositionBase: 118 / 80353.5,
    makerFeeBps: 1.5,
    estimatedGasCostUsd: 0.0005,
    adverseSelectionBufferBps: 8,
    safetyMarginBps: 1,
  };
  it.each([
    [0, 'NO_NEW_QUOTE_HEADROOM'],
    [5, 'QUOTE_CAPACITY_BELOW_MINIMUM_ORDER'],
  ])('distinguishes finite capacity %s from malformed limits', (cap, reason) => {
    const result = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, {
      ...sizing,
      maximumNotionalUsd: Number(cap),
      maximumAbsPositionBase: Number(cap) === 0 ? 0 : sizing.maximumAbsPositionBase,
    });
    expect(result.blockers).toContain(reason);
    expect(result.blockers).not.toContain('QUOTE_SIZING_LIMITS_INVALID');
    expect(result.actions.some((a) => a.action === 'PLACE')).toBe(false);
  });
  it.each([Number.NaN, -1, Infinity])('retains malformed cap %s as invalid', (cap) => {
    expect(
      evaluateDecibelAuthenticatedPassiveRecyclingV1(input, { ...sizing, maximumNotionalUsd: cap })
        .blockers,
    ).toContain('QUOTE_SIZING_LIMITS_INVALID');
  });
  it('allows canonical reducing IOC despite zero strategic capacity in STOPPING', () => {
    const result = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, {
      ...sizing,
      maximumAbsPositionBase: 0,
      sessionUnwindRequested: true,
    });
    expect(result.blockers).not.toContain('QUOTE_SIZING_LIMITS_INVALID');
    expect(result.operatingState).toBe('SESSION_UNWIND');
    expect(result.desiredBid).toBeNull();
    expect(result.desiredAsk).toMatchObject({
      side: 'SELL',
      quantity: 0.00073,
      timeInForce: 'ImmediateOrCancel',
    });
  });
});

describe('Unified deterministic TRADE / WAIT / STOP', () => {
  const makeDecisionSnapshot = (now = 20000): decibel_production_live_snapshot_v1 => {
    const base = makeSnapshot();
    return {
      ...base,
      capacityModelRequired: true,
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 40,
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 118.4,
      maximumAbsPositionBase: 118.4 / 80000,
      input: {
        ...base.input,
        now,
        book: { bestBid: 79999, bestAsk: 80001, observedAt: now },
        metadata: { ...base.input.metadata, minimumSize: 0.00002, lotSize: 0.00001 },
      },
      economicInputs: {
        ...base.economicInputs,
        makerFeeBps: 1.5,
        estimatedGasCostUsd: 0.0004662997,
        adverseSelectionBufferBps: 8,
        safetyMarginBps: 1,
      },
      practicalCapacityInputs: {
        accountObservedAt: now,
        marketObservedAt: now,
        maximumAgeMs: 5000,
        actualLeverage: 40,
        venueMaximumLeverage: 40,
        equityUsd: 10.22,
        maintenanceMarginUsd: 0,
        marginDeficitUsd: 0,
        liquidationPrice: null,
        bids: [{ price: 79999, size: 1 }],
        asks: [{ price: 80001, size: 1 }],
        recentMidpoints: [80000],
        venueMarginRules: {
          observedAt: now,
          markObservedAt: now,
          ledgerVersion: '123',
          maximumLeverage: 40,
          maintenanceMultiplier: 1,
          maintenanceDivisor: 2,
          markPrice: 80000,
          remainingOpenInterestBase: 100,
          sizeModel: 'FIXED_LEVERAGE_V1',
        },
      },
      sessionConfiguration: {
        revision: 7,
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 201,
        maxPositionUsd: 118.4,
        marginUsedUsd: 0,
        makerVolumeUsd: 0,
        totalExecutedVolumeUsd: 0,
        pnlUsd: 0,
        riskBlocker: null,
        exposureLimits: {
          configuredMaximumPositionUsd: 160,
          effectivePositionLimitUsd: 118.4,
          currentExposureUsd: 0,
          pendingExposureUsd: 0,
          availableHeadroomUsd: 118.4,
          capacityBlocker: null,
        },
      },
    };
  };
  const context = {
    now: 20000,
    sessionId: 'session',
    state: 'RUNNING',
    candidate: { side: 'BUY' as const, price: 79900, quantity: 0.0005 },
  };

  const twoSidedSnapshot = (inventory = 0, target = 201): decibel_production_live_snapshot_v1 => {
    const base = makeDecisionSnapshot();
    return {
      ...base,
      economicInputs: { ...base.economicInputs!, adverseSelectionBufferBps: 5 },
      maximumNotionalUsd: 118.44,
      maximumAbsPositionBase: 118.44 / 80000,
      availableMarginUsd: 6.54,
      authenticatedAvailableMarginUsd: 8.05,
      strategyAllocationRemainingUsd: 2.54,
      maximumReductionNotionalUsd: 200,
      input: {
        ...base.input,
        book: { ...base.input.book, bestBid: 79900, bestAsk: 80100 },
        actualInventoryBase: inventory,
      },
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        targetMakerVolumeUsd: target,
        exposureLimits: {
          ...base.sessionConfiguration!.exposureLimits!,
          effectivePositionLimitUsd: 118.44,
          currentExposureUsd: Math.abs(inventory) * 80000,
          availableHeadroomUsd: 118.44 - Math.abs(inventory) * 80000,
        },
      },
    };
  };

  it.each(['BUY', 'SELL'] as const)(
    'blocks new-policy %s risk without changing a $15 allocation',
    (side) => {
      const base = makeDecisionSnapshot();
      const snapshot: decibel_production_live_snapshot_v1 = {
        ...base,
        sessionConfiguration: {
          ...base.sessionConfiguration!,
          preferredEntrySizeUsd: 15,
          maxLossUsd: 0.2,
          exposureLimits: {
            ...base.sessionConfiguration!.exposureLimits!,
            riskCapacityUsd: 11.91,
            capacityDiagnostics: {
              lossModel: {
                lossRemainingUsd: 0.19,
                lossBps: 153,
                fixedExitCostUsd: 0.01,
                sessionGasPaidUsd: 0,
                stressMoveFraction: 0.01,
                stressSource: 'POLICY_FLOOR_AND_RECENT_RANGE',
                entryFeeBps: 10,
                exitFeeBps: 10,
                observedAt: 20000,
                validUntil: 25000,
              },
            },
          },
        },
      };
      const candidate = {
        side,
        price: side === 'BUY' ? 79900 : 80100,
        quantity: 15 / (side === 'BUY' ? 79900 : 80100),
        reduceOnly: false,
      };
      const decision = evaluateTradingDecision(snapshot, { ...context, candidate });
      expect(decision.detailedReasons).toContain('RISK_BLOCKED');
      expect(decision.riskDiagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            riskRuleId: 'SESSION_PROJECTED_STRESS_LOSS',
            riskRuleOutcome: 'BLOCKED',
            candidateSide: side,
            riskCapacityUsd: 11.91,
            maxLossUsd: 0.2,
            blockingPredicate: 'projectedExposureUsd > riskCapacityUsd + 1e-9',
          }),
        ]),
      );
      expect(Number(decision.riskDiagnostics?.[0]?.candidateNotionalUsd)).toBeCloseTo(15, 8);
      expect(Number(decision.riskDiagnostics?.[0]?.projectedExposureUsd)).toBeCloseTo(15, 8);
      expect(decision.riskDiagnostics?.[0]).toMatchObject({
        remainingLossBudgetUsd: 0.19,
        stressEvidenceFresh: true,
        missingEvidence: [],
      });
      expect(Number(decision.riskDiagnostics?.[0]?.projectedStressLossUsd)).toBeCloseTo(0.2395, 10);
      expect(Number(decision.riskDiagnostics?.[0]?.estimatedTradingFeesUsd)).toBeCloseTo(0.03, 10);
      expect(side === 'BUY' ? decision.bidEligible : decision.askEligible).toBe(false);
      expect(snapshot.sessionConfiguration!.preferredEntrySizeUsd).toBe(15);
      const allowed = evaluateTradingDecision(
        {
          ...snapshot,
          sessionConfiguration: {
            ...snapshot.sessionConfiguration!,
            exposureLimits: {
              ...snapshot.sessionConfiguration!.exposureLimits!,
              riskCapacityUsd: 100,
            },
          },
        },
        { ...context, candidate },
      );
      expect(allowed.detailedReasons).not.toContain('RISK_BLOCKED');
      // The entry sized against the same capacity fits through the gate.
      const fitted = calculateDecibelEntrySizeV1({
        preferredEntrySizeUsd: 15,
        price: candidate.price,
        minimumSize: 0.00001,
        minimumNotionalUsd: 10,
        lotSize: 0.00001,
        maximumExecutableNotionalUsd: 100,
        riskCapacityUsd: 11.91,
      });
      expect(fitted.reason).toBe('RISK_CAPACITY_ADAPTED');
      expect(
        evaluateTradingDecision(snapshot, {
          ...context,
          candidate: { ...candidate, quantity: fitted.quantity },
        }).detailedReasons,
      ).not.toContain('RISK_BLOCKED');
      expect(decision.riskDiagnostics?.[0]?.blockerCode).toBe(
        'RISK_BLOCKED:SESSION_PROJECTED_STRESS_LOSS',
      );
      for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
        const invalidDecision = evaluateTradingDecision(
          {
            ...snapshot,
            sessionConfiguration: {
              ...snapshot.sessionConfiguration!,
              exposureLimits: {
                ...snapshot.sessionConfiguration!.exposureLimits!,
                riskCapacityUsd: invalid,
              },
            },
          },
          { ...context, candidate },
        );
        expect(invalidDecision.detailedReasons).toContain('RISK_BLOCKED');
        expect(invalidDecision.riskDiagnostics?.[0]?.riskRuleId).toBe(
          'SESSION_RISK_OPERAND_INVALID',
        );
      }
    },
  );

  it('keeps a flat entry open when the remaining target is below the venue minimum', () => {
    // Live 2026-11-13: $199.26 of $200 executed. The two-side budget was capped at the
    // $0.74 remainder, below the venue minimum, so both sides were blocked and the
    // session never finished.
    const base = twoSidedSnapshot(0, 200);
    const snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      minimumNotionalUsd: base.input.metadata.minimumSize * base.input.book.bestBid,
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        preferredEntrySizeUsd: 15,
        totalExecutedVolumeUsd: 199.26,
        exposureLimits: { ...base.sessionConfiguration!.exposureLimits!, riskCapacityUsd: 100 },
      },
    };
    const instance = make({ snapshots: [snapshot] });
    try {
      const evaluation = instance.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
      const orders = [evaluation.desiredBid, evaluation.desiredAsk].filter((o) => o !== null);
      expect(orders.length, JSON.stringify(evaluation)).toBeGreaterThan(0);
      for (const order of orders) expect(order.quantity * order.price).toBeGreaterThan(0.74);
      expect([evaluation.bidEligibilityReason, evaluation.askEligibilityReason]).not.toContain(
        'COMBINED_BUDGET_BELOW_TWO_SIDE_MINIMUM',
      );
      // Target reached: nothing new opens.
      const reached = instance.orchestrator.evaluateAuthenticatedSnapshot({
        ...snapshot,
        sessionConfiguration: { ...snapshot.sessionConfiguration!, totalExecutedVolumeUsd: 200 },
      });
      expect([reached.desiredBid, reached.desiredAsk]).toEqual([null, null]);
    } finally {
      instance.journal.close();
    }
  });

  it('pauses new entries while the gas wallet is below the protection reserve', async () => {
    const snapshot = twoSidedSnapshot(0, 200);
    const executor = (balance: number): DecibelProductionExecutionExecutorV1 => ({
      placePostOnlyLimit: () => Promise.resolve({ outcome: 'PLACE_OUTCOME_UNKNOWN' }),
      cancelExactOrder: () => Promise.resolve({ outcome: 'CANCEL_OUTCOME_UNKNOWN' }),
      readAccountDiagnostics: () =>
        Promise.resolve({
          primaryAccountAddress: '0xprimary',
          subaccountAddress: '0xsubaccount',
          primaryAccountAptBalance: balance,
          subaccountAptBalance: 0,
        }),
    });
    for (const [balance, blocked] of [
      [0.05, true],
      [0.5, false],
    ] as const) {
      const test = make({
        snapshots: [snapshot, snapshot],
        executor: executor(balance),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      try {
        const result = await test.orchestrator.evaluateOnce();
        const reasons = [
          result.evaluation?.bidEligibilityReason,
          result.evaluation?.askEligibilityReason,
        ];
        if (blocked) expect(reasons).toEqual(['ENTRY_GAS_BALANCE_LOW', 'ENTRY_GAS_BALANCE_LOW']);
        else expect(reasons).not.toContain('ENTRY_GAS_BALANCE_LOW');
      } finally {
        await test.orchestrator.close();
      }
    }
  });

  it('opens from flat only on the side that fades the last closed candle', () => {
    const base = twoSidedSnapshot(0, 200);
    const filtered = {
      ...base,
      minimumNotionalUsd: 10,
      entryCandleBlockers: { BUY: null, SELL: 'ENTRY_REQUIRES_NEW_HIGH' },
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        totalExecutedVolumeUsd: 0,
      },
    };
    const decide = (side: 'BUY' | 'SELL') =>
      evaluateTradingDecision(filtered, {
        now: base.input.now,
        sessionId: base.input.sessionId,
        state: 'RUNNING',
        candidate: {
          side,
          price: side === 'BUY' ? base.input.book.bestBid - 1 : base.input.book.bestAsk + 1,
          quantity: 0.00018,
          reduceOnly: false,
          postOnly: true,
          timeInForce: 'PostOnly',
        },
      });
    expect(decide('SELL').actionPlan.SELL.reason).toBe('ENTRY_REQUIRES_NEW_HIGH');
    expect(decide('BUY')).toMatchObject({ bidEligible: true });
  });

  it('reads the candle rules from venue candles right after a restart, else falls back', async () => {
    const snapshot = twoSidedSnapshot(0, 200);
    const now = snapshot.input.now;
    const minute = 60_000;
    const lastClosed = Math.floor(now / minute) * minute - minute;
    // 20 closed 1-minute candles; prices step down so the last 5-minute candle makes a new low.
    const candles = (end: number) =>
      Array.from({ length: 20 }, (_, i) => {
        const start = end - (19 - i) * minute;
        const price = 80_000 - i * 2;
        return { start, open: price + 1, high: price + 2, low: price - 1, close: price };
      });
    for (const [label, end, source] of [
      ['fresh', lastClosed, 'EXCHANGE'],
      ['stale', lastClosed - 10 * minute, 'BBO_FALLBACK'],
    ] as const) {
      const test = make({
        snapshots: [snapshot, snapshot],
        exchangeCandles: () => candles(end),
        environment: { DECIBEL_ENTRY_CANDLE_FILTER_ENABLED: 'true' },
      });
      try {
        await test.orchestrator.evaluateOnce();
        const latest = test.orchestrator.getLatestSnapshot()!;
        expect(latest.marketStructure?.source, label).toBe(source);
        if (source === 'EXCHANGE') {
          // No warm-up: the BBO history is empty, yet the filter already has its candles.
          expect(latest.entryCandleBlockers?.BUY).toBeNull();
          expect(latest.entryCandleBlockers?.SELL).toBe('ENTRY_REQUIRES_NEW_HIGH');
          expect(latest.priceRangeBps).not.toBeNull();
        } else
          expect(latest.entryCandleBlockers).toEqual({
            BUY: 'ENTRY_CANDLE_EVIDENCE_REQUIRED',
            SELL: 'ENTRY_CANDLE_EVIDENCE_REQUIRED',
          });
      } finally {
        await test.orchestrator.close();
      }
    }
  });

  it('refuses opening orders while the 5-minute range is above 40 bps', () => {
    const base = twoSidedSnapshot(0, 200);
    const candidate = {
      side: 'SELL' as const,
      price: base.input.book.bestAsk + 1,
      quantity: 0.00018,
      reduceOnly: false,
      postOnly: true,
      timeInForce: 'PostOnly' as const,
    };
    const decide = (priceRangeBps: number) =>
      evaluateTradingDecision(
        {
          ...base,
          minimumNotionalUsd: 10,
          priceRangeBps,
          sessionConfiguration: {
            ...base.sessionConfiguration!,
            totalExecutedVolumeUsd: 0,
          },
        },
        { now: base.input.now, sessionId: base.input.sessionId, state: 'RUNNING', candidate },
      );
    expect(decide(30)).toMatchObject({ askEligible: true });
    expect(decide(45)).toMatchObject({ askEligible: false });
    expect(decide(45).actionPlan.SELL.reason).toBe('ENTRY_VOLATILITY_PAUSE');
  });

  it('checks the remaining target per side so both entries can rest near the end', () => {
    // Live 2026-11-13 21:40: $21.7 left, a $14.5 BUY resting; the SELL was refused because
    // the resting BUY was added to it.
    const base = twoSidedSnapshot(0, 200);
    const price = base.input.book.bestAsk + 1;
    const restingBuy = {
      ...base.input.openOrders[0],
      venueOrderId: 'resting-buy',
      clientOrderId: 'd1b' + 'r'.repeat(29),
      market: base.input.market,
      strategyConfigId: base.input.strategyConfigId,
      side: 'BUY' as const,
      price: base.input.book.bestBid - 1,
      quantity: 0.00018,
      reduceOnly: false,
      postOnly: true as const,
      timeInForce: 'PostOnly' as const,
      orderType: 'LIMIT' as const,
    };
    const snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      minimumNotionalUsd: 10,
      input: { ...base.input, openOrders: [restingBuy] },
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        totalExecutedVolumeUsd: 200 - 21.7,
      },
    };
    const decide = (quantity: number) =>
      evaluateTradingDecision(snapshot, {
        now: snapshot.input.now,
        sessionId: snapshot.input.sessionId,
        state: 'RUNNING',
        candidate: {
          side: 'SELL',
          price,
          quantity,
          reduceOnly: false,
          postOnly: true,
          timeInForce: 'PostOnly',
        },
      });
    expect(0.00018 * price).toBeLessThan(21.7);
    expect(decide(0.00018)).toMatchObject({ askEligible: true });
    expect(0.0003 * price).toBeGreaterThan(21.7);
    expect(decide(0.0003).actionPlan.SELL.reason).toBe('ENTRY_EXCEEDS_REMAINING_TARGET');
    // Live 2026-11-14: $1.37 left, below a one-lot venue minimum. One normal entry (the
    // preferred size) stays allowed so the session can finish; none once it is reached.
    const nearlyDone = (executed: number) => ({
      ...snapshot,
      input: { ...snapshot.input, openOrders: [] },
      sessionConfiguration: {
        ...snapshot.sessionConfiguration!,
        preferredEntrySizeUsd: 16.5,
        totalExecutedVolumeUsd: executed,
        exposureLimits: {
          ...snapshot.sessionConfiguration!.exposureLimits!,
          riskCapacityUsd: 1000,
        },
      },
    });
    const finalEntry = (executed: number, quantity: number) =>
      evaluateTradingDecision(nearlyDone(executed), {
        now: snapshot.input.now,
        sessionId: snapshot.input.sessionId,
        state: 'RUNNING',
        candidate: {
          side: 'SELL',
          price,
          quantity,
          reduceOnly: false,
          postOnly: true,
          timeInForce: 'PostOnly',
        },
      });
    expect(0.0002 * price).toBeLessThan(16.5);
    expect(finalEntry(200 - 1.37, 0.0002)).toMatchObject({ askEligible: true });
    expect(finalEntry(200, 0.0002).actionPlan.SELL.reason).toBe('ENTRY_EXCEEDS_REMAINING_TARGET');
  });

  it('shrinks new ENTRY quantities to the Max Loss risk capacity in live quote construction', () => {
    const base = twoSidedSnapshot();
    const snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      minimumNotionalUsd: base.input.metadata.minimumSize * base.input.book.bestBid,
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        preferredEntrySizeUsd: 15,
        maxLossUsd: 0.2,
        exposureLimits: { ...base.sessionConfiguration!.exposureLimits!, riskCapacityUsd: 11.91 },
      },
    };
    const instance = make({ snapshots: [snapshot] });
    try {
      const evaluation = instance.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
      for (const order of [evaluation.desiredBid, evaluation.desiredAsk]) {
        expect(order).not.toBeNull();
        // $15 preferred would exceed the $11.91 stress-loss capacity and be blocked:
        // the entry is shrunk on the lot grid to fit it instead.
        expect(order!.quantity).toBe(0.00014);
        expect(order!.quantity * order!.price).toBeGreaterThan(10);
        expect(order!.quantity * order!.price).toBeLessThanOrEqual(11.91);
      }
    } finally {
      instance.journal.close();
    }
  });

  it('drops the flat entry side that does not fade the last closed candle', () => {
    const base = makeDecisionSnapshot();
    const sizing = {
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 118.4,
      entryHeadroomUsd: 118.4,
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 40,
      maximumAbsPositionBase: 118.4 / 80000,
      candidateSearchDepthPerSide: 2,
      candidateDistanceBps: [5, 12],
      flatPairSharedBaseQuantity: 0.00043,
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0.0004662997,
      safetyMarginBps: 1,
    };
    const both = evaluateDecibelAuthenticatedPassiveRecyclingV1(base.input, sizing);
    expect(both.desiredBid).not.toBeNull();
    expect(both.desiredAsk).not.toBeNull();
    const filtered = evaluateDecibelAuthenticatedPassiveRecyclingV1(base.input, {
      ...sizing,
      entryCandleBlockers: { BUY: 'ENTRY_REQUIRES_NEW_LOW', SELL: null },
    });
    expect(filtered.desiredBid).toBeNull();
    expect(filtered.bidEligibilityReason).toBe('ENTRY_REQUIRES_NEW_LOW');
    expect(filtered.desiredAsk).not.toBeNull();
  });

  it('selects the closest admitted maker price instead of diluting gas with a farther ASK', () => {
    const base = makeDecisionSnapshot();
    const sizing = {
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 118.4,
      entryHeadroomUsd: 118.4,
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 40,
      maximumAbsPositionBase: 118.4 / 80000,
      candidateSearchDepthPerSide: 2,
      candidateDistanceBps: [5, 12],
      flatPairSharedBaseQuantity: 0.00043,
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0.0004662997,
      safetyMarginBps: 1,
    };
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(base.input, sizing);
    expect(evaluation.desiredBid?.price).toBe(79977.8);
    expect(evaluation.desiredAsk?.price).toBeCloseTo(80022.2, 8);
    expect(evaluation.desiredBid?.postOnly).toBe(true);
    expect(evaluation.desiredAsk?.postOnly).toBe(true);
    expect(evaluation.askCandidateCosts[1]!.lifecycleCostBps).toBe(
      evaluation.askCandidateCosts[0]!.lifecycleCostBps,
    );
    // Edge and cost admission still precede competitiveness.
    const expensive = evaluateDecibelAuthenticatedPassiveRecyclingV1(base.input, {
      ...sizing,
      makerFeeBps: 12,
    });
    expect(expensive.desiredBid).toBeNull();
    expect(expensive.desiredAsk).toBeNull();
    const insufficientEdge = evaluateDecibelAuthenticatedPassiveRecyclingV1(base.input, {
      ...sizing,
      makerFeeBps: 6,
    });
    expect(insufficientEdge.desiredBid!.price).toBeGreaterThan(79904);
    expect(insufficientEdge.desiredAsk!.price).toBeLessThan(80096);
    for (const candidate of [evaluation.desiredBid!, evaluation.desiredAsk!]) {
      const assess = (price: number) =>
        assessDecibelEntryPhaseEconomicsV1({
          phase: 'PLACE',
          side: candidate.side,
          price,
          quantity: candidate.quantity,
          midpoint: 80000,
          makerFeeBps: 1.5,
          gasCostUsd: sizing.estimatedGasCostUsd,
          safetyMarginBps: 1,
        });
      expect(assess(candidate.price).conditionalNetUsd).toBeGreaterThanOrEqual(0);
      expect(
        assess(candidate.price + (candidate.side === 'BUY' ? 0.1 : -0.1)).conditionalNetUsd,
      ).toBeLessThan(0);
    }
  });

  it('replays PID 9220 placement and resting candidates without inventing a fill benefit', () => {
    type recorded_snapshot = {
      timestamp: number;
      bestBid: number;
      bestAsk: number;
      makerFeeBps: number;
      estimatedGasCostUsd: number;
      safetyMarginBps: number;
      maximumAbsPositionBase: number;
      operationalMarketRegimePolicy: {
        bidDistanceMultiplier: number;
        askDistanceMultiplier: number;
      };
      sizingInputs: { maximumNotionalUsd: number; availableMarginUsd: number };
      desiredBid: { price: number; quantity: number };
      desiredAsk: { price: number; quantity: number };
    };
    const record = JSON.parse(
      readFileSync('tests/fixtures/entry_pricing_9220_v1.json', 'utf8'),
    ) as {
      sellPlacement: recorded_snapshot;
      buyPlacement: recorded_snapshot;
      resting: recorded_snapshot;
    };
    for (const [row, expectedBid, expectedAsk] of [
      [record.sellPlacement, 75933, 75974.2],
      [record.buyPlacement, 75678.2, 75719.6],
      [record.resting, 75735.7, 75777],
    ] as const) {
      const base = makeDecisionSnapshot(row.timestamp);
      const input = {
        ...base.input,
        book: { bestBid: row.bestBid, bestAsk: row.bestAsk, observedAt: row.timestamp },
      };
      const sizing = {
        minimumNotionalUsd: 10,
        maximumNotionalUsd: row.sizingInputs.maximumNotionalUsd,
        maximumAbsPositionBase: row.maximumAbsPositionBase,
        availableMarginUsd: row.sizingInputs.availableMarginUsd,
        maximumEffectiveLeverage: 40,
        entryHeadroomUsd: row.sizingInputs.maximumNotionalUsd,
        flatPairSharedBaseQuantity: row.desiredBid.quantity,
        candidateSearchDepthPerSide: 7,
        bidCandidateDistanceBps: [5, 6, 7, 8, 9, 10, 12].map(
          (d) => d * row.operationalMarketRegimePolicy.bidDistanceMultiplier,
        ),
        askCandidateDistanceBps: [5, 6, 7, 8, 9, 10, 12].map(
          (d) => d * row.operationalMarketRegimePolicy.askDistanceMultiplier,
        ),
        makerFeeBps: row.makerFeeBps,
        estimatedGasCostUsd: row.estimatedGasCostUsd,
        safetyMarginBps: row.safetyMarginBps,
      };
      const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, sizing);
      expect(evaluation.desiredBid?.price).toBeCloseTo(expectedBid, 8);
      expect(evaluation.desiredAsk?.price).toBeCloseTo(expectedAsk, 8);
      expect(evaluation.desiredAsk!.price).toBeLessThan(row.desiredAsk.price);
      expect(evaluation.desiredAsk!.price).toBeGreaterThan(row.bestBid);
      expect(evaluation.desiredBid!.price).toBeLessThan(row.bestAsk);
      expect(evaluateDecibelAuthenticatedPassiveRecyclingV1(input, sizing)).toEqual(evaluation);
      if (row === record.resting) {
        const orders = (['BUY', 'SELL'] as const).map((side) => ({
          venueOrderId: `recorded-resting-${side}`,
          clientOrderId: `d1${side === 'BUY' ? 'b' : 's'}${'a'.repeat(29)}`,
          strategyConfigId: input.strategyConfigId,
          market: input.market,
          side,
          price: side === 'BUY' ? 75661 : 76035.7,
          quantity: side === 'BUY' ? 0.00043 : 0.00047,
          orderType: 'LIMIT' as const,
          timeInForce: 'PostOnly' as const,
          postOnly: true,
          reduceOnly: false,
        }));
        const replay = evaluateDecibelAuthenticatedPassiveRecyclingV1(
          { ...input, openOrders: orders },
          sizing,
        );
        expect(replay.actions).toHaveLength(2);
        for (const action of replay.actions) {
          expect(['NO_OP', 'WOULD_REPLACE']).toContain(action.action);
          if (action.action === 'WOULD_REPLACE') {
            expect(
              action.entryReplacementEconomics?.candidateAdmission.conditionalNetUsd,
            ).toBeGreaterThanOrEqual(0);
            expect(
              action.side === 'BUY'
                ? action.desired!.price > action.current!.price
                : action.desired!.price < action.current!.price,
            ).toBe(true);
          }
          expect(action.entryReplacementEconomics?.expectedValueUsd).toBeNull();
          expect(action.desired).not.toBeNull();
        }
        const planned = { place: 0, cancel: 0, replace: 0 };
        for (let cycle = 0; cycle < 100; cycle++) {
          const now = input.now + cycle * 1000;
          const repeated = evaluateDecibelAuthenticatedPassiveRecyclingV1(
            {
              ...input,
              now,
              openOrders: orders,
              metadata: { ...input.metadata, observedAt: now },
              book: { ...input.book, observedAt: now },
            },
            sizing,
          );
          for (const action of repeated.actions) {
            if (action.action === 'WOULD_PLACE') planned.place++;
            if (action.action === 'WOULD_CANCEL') planned.cancel++;
            if (action.action === 'WOULD_REPLACE') {
              planned.replace++;
              const index = orders.findIndex((o) => o.side === action.side);
              orders[index] = {
                ...orders[index]!,
                price: action.desired!.price,
                quantity: action.desired!.quantity,
              };
            }
          }
        }
        expect(planned.place).toBe(0);
        expect(planned.cancel).toBe(0);
        expect(planned.replace).toBeLessThanOrEqual(2); // At most one convergence per side.
      }
    }
    const row = record.resting;
    const common = {
      bestBid: row.bestBid,
      bestAsk: row.bestAsk,
      tickSize: 0.1,
      midpoint: (row.bestBid + row.bestAsk) / 2,
      makerFeeBps: row.makerFeeBps,
      gasCostUsd: row.estimatedGasCostUsd,
      safetyMarginBps: row.safetyMarginBps,
    };
    const buy = assessDecibelEntryReplacementEconomicsV1({
      ...common,
      side: 'BUY',
      restingPrice: 75661,
      candidatePrice: 75735.7,
      restingQuantity: 0.00043,
      candidateQuantity: row.desiredBid.quantity,
    });
    expect(buy.conditionalNetImprovementUsd).toBeCloseTo(-0.03285695745, 10);
    expect(buy.replacementCostUsd).toBe(2 * row.estimatedGasCostUsd);
    expect(buy).toMatchObject({
      decision: 'KEEP',
      reason: 'ENTRY_REPLACEMENT_PRIORITY_NOT_IMPROVED',
      expectedValueUsd: null,
      fillProbability: null,
    });
    // Compare the common executable residual without increasing admitted size.
    expect(
      assessDecibelEntryReplacementEconomicsV1({
        ...common,
        side: 'SELL',
        restingPrice: 76035.7,
        candidatePrice: 75777,
        restingQuantity: 0.00047,
        candidateQuantity: row.desiredAsk.quantity,
      }),
    ).toMatchObject({
      decision: 'KEEP',
      reason: 'ENTRY_REPLACEMENT_PRIORITY_NOT_IMPROVED',
      executableQuantity: 0.00043,
    });
    // Even favorable conditional price improvement is not a calibrated fill EV.
    expect(
      assessDecibelEntryReplacementEconomicsV1({
        ...common,
        side: 'BUY',
        restingPrice: 75661,
        candidatePrice: 75600,
        restingQuantity: 0.00043,
        candidateQuantity: 0.00043,
      }),
    ).toMatchObject({
      decision: 'KEEP',
      reason: 'ENTRY_REPLACEMENT_PRIORITY_NOT_IMPROVED',
    });
  });

  it('replays the recorded LONG TP boundary and exposes estimated cost components', () => {
    const record = JSON.parse(
      readFileSync('tests/fixtures/entry_pricing_9220_v1.json', 'utf8'),
    ) as {
      tpPlacement: {
        bestBid: number;
        bestAsk: number;
        estimatedGasCostUsd: number;
        adverseSelectionBufferBps: number;
      };
      tpReview: {
        bestBid: number;
        bestAsk: number;
        estimatedGasCostUsd: number;
        adverseSelectionBufferBps: number;
      };
    };
    const base = tpPriceFixture(1).snapshot;
    const quantity = 0.00047;
    const makeTP = (costs: typeof record.tpPlacement) => ({
      ...base,
      input: {
        ...base.input,
        actualInventoryBase: quantity,
        openOrders: [],
        book: { ...base.input.book, bestBid: costs.bestBid, bestAsk: costs.bestAsk },
      },
      authenticatedPositions: [
        { market: 'BTC/USD', size: quantity, entryPrice: 75611.8, source: 'BOT' },
      ],
      economicInputs: { ...base.economicInputs!, ...costs },
    });
    const placement = makeTP(record.tpPlacement);
    const reviewed = assessDecibelExitEconomicsV1(
      makeTP(record.tpReview),
      'SELL',
      quantity,
      75717.9,
    );
    expect(reviewed.netPnlUsd).toBeCloseTo(0.02423373224999589, 12);
    expect(reviewed.requiredNetProfitUsd).toBe(0);
    expect(reviewed.breakdown).toMatchObject({
      entryFeeReserveUsd: 0.0159918957,
      transactionGasReserveUsd: 0.0007445188,
      fundingUsd: null,
      entryFeeKind: 'CONSERVATIVE_RATE_ESTIMATE_NOT_ACTUAL_FILL_FEE',
    });
    expect(reviewed.breakdown?.grossPnlUsd).toBeCloseTo(0.049867, 10);
    expect(reviewed.breakdown?.exitFeeReserveUsd).toBeCloseTo(0.00533811195, 12);
    expect(reviewed.breakdown?.adverseReserveUsd).toBe(0);
    expect(reviewed.breakdown?.safetyReserveUsd).toBeCloseTo(0.0035587413, 12);
    expect(
      assessDecibelExitEconomicsV1(placement, 'SELL', quantity, 75717.9).netPnlUsd,
    ).toBeCloseTo(0.02423373224999589, 12);
    expect(
      assessDecibelExitEconomicsV1(placement, 'SELL', quantity, 75666.3).netPnlUsd,
    ).toBeLessThan(0);
    // Nearest tick meeting the volatility TP target (floor without range history).
    const longTP = constructDecibelProfitableTPPriceV1(placement, 'SELL', quantity, 75700).price!;
    expect(
      assessDecibelExitEconomicsV1(placement, 'SELL', quantity, longTP).netPnlUsd!,
    ).toBeGreaterThanOrEqual(tpTargetNetUsd(placement, quantity) - 1e-12);
    expect(
      assessDecibelExitEconomicsV1(placement, 'SELL', quantity, longTP - 0.1).netPnlUsd!,
    ).toBeLessThan(tpTargetNetUsd(placement, quantity));
    expect(
      constructDecibelProfitableTPPriceV1(makeTP(record.tpReview), 'SELL', quantity, 75717.9).price,
    ).toBe(75681.1);
  });

  it('uses authenticated residual entry fees through partial reductions, duplicate fills and flips', () => {
    const base = tpPriceFixture(1).snapshot;
    const rows = [
      { side: 'BUY' as const, quantity: 0.006, fee: 0.0006 },
      { side: 'BUY' as const, quantity: 0.004, fee: 0.0004 },
      { side: 'SELL' as const, quantity: 0.004, fee: 0.0004 },
      { side: 'SELL' as const, quantity: 0.008, fee: 0.0008 },
    ];
    const orders = rows.map((r, i) => ({
      venueOrderId: `fee-order-${i}`,
      localIntentId: `fee-intent-${i}`,
      localExecutionRequestId: `fee-client-${i}`,
      marketAddress: base.input.market,
      side: r.side,
      requestedQuantity: r.quantity,
    }));
    let ledger = createDecibelActualFillLedgerV1(orders);
    const source = () => ({
      ...base,
      input: { ...base.input, actualInventoryBase: ledger.inventoryBase, actualFillLedger: ledger },
      authenticatedPositions: [
        { market: 'BTC/USD', size: ledger.inventoryBase, entryPrice: 100, source: 'BOT' as const },
      ],
    });
    for (const [i, row] of rows.entries()) {
      const fill = {
        venueFillId: `fee-fill-${i}`,
        venueOrderId: orders[i]!.venueOrderId,
        localExecutionRequestId: orders[i]!.localExecutionRequestId,
        marketAddress: base.input.market,
        side: row.side,
        executedPrice: 100,
        executedBaseQuantity: row.quantity,
        executedUsdNotional: row.quantity * 100,
        makerOrTaker: 'MAKER' as const,
        receivedAt: new Date(base.input.now - 1),
        venueTimestamp: new Date(base.input.now - 1),
        fee: {
          availability: i === 1 ? ('UNAVAILABLE' as const) : ('AVAILABLE' as const),
          amount: i === 1 ? null : row.fee,
          currency: 'USD',
        },
        ...(i === 1
          ? {
              executionFragments: [
                {
                  fragmentId: 'fee-fragment-1',
                  quantity: row.quantity,
                  price: 100,
                  feeUsd: row.fee,
                },
              ],
            }
          : {}),
        rebate: { availability: 'UNAVAILABLE' as const, amount: null, currency: null },
        executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
      };
      ledger = applyDecibelActualFillTruthV1(ledger, fill);
      expect(applyDecibelActualFillTruthV1(ledger, fill)).toBe(ledger);
      const side = ledger.inventoryBase > 0 ? 'SELL' : 'BUY';
      const economics = assessDecibelExitEconomicsV1(
        source(),
        side,
        Math.abs(ledger.inventoryBase),
        100,
      );
      expect(economics.breakdown?.entryFeeKind).toBe('AUTHENTICATED_RESIDUAL_FILL_FEE');
      expect(economics.breakdown?.entryFeeReserveUsd).toBeCloseTo(
        [0.0006, 0.001, 0.0006, 0.0002][i]!,
        12,
      );
      if (i === 2) {
        expect(
          assessDecibelExitEconomicsV1(source(), side, 0.003, 100).breakdown?.entryFeeReserveUsd,
        ).toBeCloseTo(0.0003, 12);
        const incomplete = {
          ...source(),
          input: { ...source().input, actualFillLedger: { ...ledger, applications: [] } },
        };
        expect(
          assessDecibelExitEconomicsV1(incomplete, side, 0.003, 100).breakdown?.entryFeeKind,
        ).toBe('CONSERVATIVE_RATE_ESTIMATE_NOT_ACTUAL_FILL_FEE');
      }
    }
  });

  it('admits exact zero net TP, ignores adverse evidence and constructs the nearest target tick', () => {
    const base = tpPriceFixture(1).snapshot;
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        actualInventoryBase: 1,
        openOrders: [],
        book: { ...base.input.book, bestBid: 99.9, bestAsk: 100.1 },
      },
      authenticatedPositions: [
        { market: 'BTC/USD', size: 1, entryPrice: 100, source: 'BOT' as const },
      ],
      economicInputs: {
        ...base.economicInputs!,
        estimatedGasCostUsd: 0,
        safetyMarginBps: 0,
        adverseSelectionBufferBps: null,
      },
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs,
        costObservations: base.practicalCapacityInputs.costObservations.map((o) => ({
          ...o,
          value: 0,
        })),
      },
    };
    expect(assessDecibelExitEconomicsV1(snapshot, 'SELL', 1, 100).netPnlUsd).toBe(0);
    expect(assessDecibelTPActionV1(snapshot, 'SELL', 1, 100)).toBeNull();
    const zeroCostTP = constructDecibelProfitableTPPriceV1(snapshot, 'SELL', 1, 999).price!;
    expect(
      assessDecibelExitEconomicsV1(snapshot, 'SELL', 1, zeroCostTP).netPnlUsd!,
    ).toBeGreaterThanOrEqual(tpTargetNetUsd(snapshot, 1) - 1e-12);
    expect(
      assessDecibelExitEconomicsV1(
        snapshot,
        'SELL',
        1,
        zeroCostTP - snapshot.input.metadata.tickSize,
      ).netPnlUsd!,
    ).toBeLessThan(tpTargetNetUsd(snapshot, 1));
    const hugeAdverse = {
      ...snapshot,
      economicInputs: { ...snapshot.economicInputs, adverseSelectionBufferBps: 10000 },
    };
    expect(assessDecibelExitEconomicsV1(hugeAdverse, 'SELL', 1, 100)).toEqual(
      assessDecibelExitEconomicsV1(snapshot, 'SELL', 1, 100),
    );
  });

  it('allows canonical margin risk reduction before Max Loss but never on stale account evidence', async () => {
    const base = tpPriceFixture(1).snapshot;
    const snapshot = {
      ...base,
      sessionConfiguration: { ...base.sessionConfiguration!, pnlUsd: -0.1, maxLossUsd: 2 },
      practicalCapacityInputs: { ...base.practicalCapacityInputs, marginDeficitUsd: 1 },
    };
    const test = make({ snapshots: [snapshot] });
    try {
      const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
      expect(evaluation.operatingState).toBe('RISK_REDUCTION');
      expect(coordinateDecibelInventoryExitV1(snapshot, { evaluation })).toMatchObject({
        DEFENSIVE_EXIT_ELIGIBLE: true,
        DEFENSIVE_EXIT_REASON: 'CANONICAL_RISK_REDUCTION',
        REMAINING_LOSS_BUDGET: 1.9,
      });
      const stale = {
        ...snapshot,
        practicalCapacityInputs: {
          ...snapshot.practicalCapacityInputs,
          accountObservedAt: snapshot.input.now - 10000,
        },
      };
      expect(coordinateDecibelInventoryExitV1(stale, { evaluation })).toMatchObject({
        DEFENSIVE_EXIT_ELIGIBLE: false,
        EXIT_MODE: 'RECONCILE',
      });
      expect(test.calls()).toBe(0);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('replays PID 34312 BUY/SELL admission without adverse while preserving stale evidence and Max Loss gates', async () => {
    type candidate_cost = {
      distanceBps: number;
      adverseSelectionBps: number;
      lifecycleCostBps: number;
    };
    const { snapshot: s } = JSON.parse(
      readFileSync('tests/fixtures/entry_cost_34312_v1.json', 'utf8'),
    ) as {
      snapshot: {
        timestamp: number;
        bestBid: number;
        bestAsk: number;
        bookObservedAt: number;
        makerFeeBps: number;
        estimatedGasCostUsd: number;
        adverseSelectionBufferBps: number;
        safetyMarginBps: number;
        bidLifecycleCostBps: number;
        askLifecycleCostBps: number;
        bidCandidateCosts: candidate_cost[];
        askCandidateCosts: candidate_cost[];
        quoteSizing: { BUY: { finalSizeBtc: number }; SELL: { finalSizeBtc: number } };
      };
    };
    const base = makeDecisionSnapshot(s.timestamp);
    // Archived market/economics; other mandatory evidence is a controlled fresh
    // adapter. This replay grants no authorization to submit historical orders.
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        book: { bestBid: s.bestBid, bestAsk: s.bestAsk, observedAt: s.bookObservedAt },
      },
      economicInputs: {
        ...base.economicInputs!,
        makerFeeBps: s.makerFeeBps,
        estimatedGasCostUsd: s.estimatedGasCostUsd,
        adverseSelectionBufferBps: s.adverseSelectionBufferBps,
        safetyMarginBps: s.safetyMarginBps,
        candidateAdverseSelection: [],
      },
    };
    const midpoint = (s.bestBid + s.bestAsk) / 2;
    expect(s.bidLifecycleCostBps).toBeGreaterThan(11.25);
    expect(s.askLifecycleCostBps).toBeGreaterThan(11.25);
    for (const side of ['BUY', 'SELL'] as const) {
      for (const row of side === 'BUY' ? s.bidCandidateCosts : s.askCandidateCosts) {
        const price = Number(
          (midpoint * (1 + ((side === 'BUY' ? -1 : 1) * row.distanceBps) / 10000)).toFixed(1),
        );
        const candidate = {
          side,
          price,
          quantity: s.quoteSizing[side].finalSizeBtc,
          reduceOnly: false,
        };
        const context = {
          now: s.timestamp,
          sessionId: base.input.sessionId,
          state: 'RUNNING',
          candidate,
        };
        const decision = evaluateTradingDecision(snapshot, context);
        expect(side === 'BUY' ? decision.bidEligible : decision.askEligible).toBe(true);
        const cost = side === 'BUY' ? decision.costs.bidBps : decision.costs.askBps;
        expect(cost).toBeCloseTo(row.lifecycleCostBps - row.adverseSelectionBps, 11);
        expect(cost).toBeLessThan(11.035);
        const stale = evaluateTradingDecision(snapshot, { ...context, now: s.timestamp + 6000 });
        expect(stale.newExposurePermitted).toBe(false);
        const lossLimit = evaluateTradingDecision(
          {
            ...snapshot,
            sessionConfiguration: {
              ...base.sessionConfiguration!,
              pnlUsd: -base.sessionConfiguration!.maxLossUsd,
            },
          },
          context,
        );
        expect(lossLimit.newExposurePermitted).toBe(false);
      }
    }
    const test = make({ snapshots: [snapshot] });
    try {
      const planned = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
      expect(planned.desiredBid).not.toBeNull();
      expect(planned.desiredAsk).not.toBeNull();
      expect(planned.bidLifecycleCostBps).toBeLessThan(11.035);
      expect(planned.askLifecycleCostBps).toBeLessThan(11.035);
      expect(
        [...planned.bidCandidateCosts, ...planned.askCandidateCosts].every(
          (row) => row.adverseSource === 'NOT_APPLIED' && row.adverseSelectionBps === 0,
        ),
      ).toBe(true);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('admits PID 19884 ENTRY using execution costs only in planner and final admission', async () => {
    const r = JSON.parse(readFileSync('tests/fixtures/entry_cost_19884_v1.json', 'utf8')) as {
      order: { side: 'SELL'; price: number; quantity: number };
      place: {
        timestamp: number;
        bookObservedAt: number;
        bestBid: number;
        bestAsk: number;
        makerFeeBps: number;
        estimatedGasCostUsd: number;
        adverseSelectionBufferBps: number;
        safetyMarginBps: number;
      };
      point: { distanceBps: number; adverseSelectionBps: number };
    };
    const s = r.place,
      base = makeDecisionSnapshot(s.timestamp);
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        book: { bestBid: s.bestBid, bestAsk: s.bestAsk, observedAt: s.bookObservedAt },
      },
      economicInputs: {
        ...base.economicInputs!,
        makerFeeBps: s.makerFeeBps,
        estimatedGasCostUsd: s.estimatedGasCostUsd,
        adverseSelectionBufferBps: s.adverseSelectionBufferBps,
        safetyMarginBps: s.safetyMarginBps,
        // Controlled adapter of the recorded resolved point estimate. Original
        // raw sample clocks/counts are not archived; freshness is not inferred.
        candidateAdverseSelection: [
          {
            side: 'SELL' as const,
            distanceBps: r.point.distanceBps,
            p95AdverseSelectionBps: r.point.adverseSelectionBps,
            sampleCount: 30,
            observedAt: s.timestamp,
          },
        ],
      },
    };
    const result = evaluateTradingDecision(snapshot, {
      now: s.timestamp,
      sessionId: base.input.sessionId,
      state: 'RUNNING',
      candidate: { ...r.order, reduceOnly: false },
    });
    expect(result.detailedReasons).not.toContain('LIFECYCLE_COST_BUDGET_EXCEEDED');
    expect(result.detailedReasons).not.toContain('SPREAD_EDGE_INSUFFICIENT');
    expect(result.askEligible).toBe(true);
    expect(result.costs.askBps).toBeCloseTo(2.7021056688903995, 12);
    for (const adverseSelectionBufferBps of [null, 0, 100, Number.NaN]) {
      const diagnostic = {
        ...snapshot,
        economicInputs: { ...snapshot.economicInputs, adverseSelectionBufferBps },
      };
      const decision = evaluateTradingDecision(diagnostic, {
        now: s.timestamp,
        sessionId: base.input.sessionId,
        state: 'RUNNING',
        candidate: { ...r.order, reduceOnly: false },
      });
      expect(decision.askEligible).toBe(true);
      expect(decision.costs.askBps).toBeCloseTo(2.7021056688903995, 12);
      expect(decision.costs.entryAdverseSelectionApplied).toBe(false);
    }
    for (const costs of [
      { ...snapshot.economicInputs, makerFeeBps: null },
      { ...snapshot.economicInputs, estimatedGasCostUsd: null },
    ]) {
      const missing = evaluateTradingDecision(
        { ...snapshot, economicInputs: costs },
        {
          now: s.timestamp,
          sessionId: base.input.sessionId,
          state: 'RUNNING',
          candidate: { ...r.order, reduceOnly: false },
        },
      );
      expect(missing.askEligible).toBe(false);
      expect(missing.detailedReasons).toContain('ECONOMIC_INPUT_UNKNOWN');
    }
    const test = make({ snapshots: [snapshot] });
    try {
      const planned = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
      expect(planned.desiredAsk).not.toBeNull();
      expect(
        planned.askCandidateCosts.every(
          (c) => c.adverseSelectionBps === 0 && c.adverseSource === 'NOT_APPLIED',
        ),
      ).toBe(true);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('replays PID 36080 cancel snapshots: execution-cost surplus determines KEEP without adverse or lease cancels', async () => {
    const rows = JSON.parse(
      readFileSync('tests/fixtures/entry_simplification_36080_v1.json', 'utf8'),
    ) as {
      id: string;
      clientOrderId: string;
      beforeReason: string;
      at: number;
      bookObservedAt: number;
      positionBase: number;
      bestBid: number;
      bestAsk: number;
      input: {
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
        makerFeeBps: number;
        gasCostUsd: number;
        adverseSelectionBps: number;
        safetyMarginBps: number;
      };
      after: { decision: 'KEEP' | 'CANCEL' | 'RECONCILE' };
    }[];
    let kept = 0,
      cancelled = 0;
    for (const row of rows) {
      const base = makeDecisionSnapshot(row.at),
        cost = row.input;
      expect(row.positionBase).toBe(0);
      const current = {
        venueOrderId: row.id,
        clientOrderId: row.clientOrderId,
        side: cost.side,
        price: cost.price,
        quantity: cost.quantity,
        market: base.input.market,
        strategyConfigId: base.input.strategyConfigId,
        reduceOnly: false,
        orderType: 'LIMIT' as const,
        timeInForce: 'PostOnly' as const,
        postOnly: true,
      };
      const snapshot = {
        ...base,
        input: {
          ...base.input,
          book: { bestBid: row.bestBid, bestAsk: row.bestAsk, observedAt: row.bookObservedAt },
          openOrders: [current],
        },
        economicInputs: {
          ...base.economicInputs!,
          makerFeeBps: cost.makerFeeBps,
          estimatedGasCostUsd: cost.gasCostUsd,
          adverseSelectionBufferBps: cost.adverseSelectionBps,
          safetyMarginBps: cost.safetyMarginBps,
          candidateAdverseSelection: [],
        },
      };
      const test = make({ snapshots: [snapshot] });
      try {
        const result = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
        const action = result.actions.find((a) => a.current?.venueOrderId === row.id);
        const executionOnly = assessDecibelRestingEntryEconomicsV1(cost);
        expect(['NO_OP', 'WOULD_REPLACE']).toContain(action?.action);
        if (action?.action === 'WOULD_REPLACE') {
          expect(
            action.entryReplacementEconomics?.candidateAdmission.conditionalNetUsd,
          ).toBeGreaterThanOrEqual(0);
          expect(
            action.side === 'BUY'
              ? action.desired!.price > action.current!.price
              : action.desired!.price < action.current!.price,
          ).toBe(true);
        }
        if (executionOnly.decision === 'KEEP') {
          kept++;
        } else cancelled++;
      } finally {
        await test.orchestrator.close();
      }
    }
    expect({ kept, cancelled }).toEqual({ kept: 34, cancelled: 0 });
  });

  it('preserves PID 1620 continuation, keeps behind-best candidates, and independently cancels a hard position-limit breach', async () => {
    const rows = JSON.parse(
      readFileSync('tests/fixtures/entry_minimization_1620_v1.json', 'utf8'),
    ) as {
      id: string;
      clientOrderId: string;
      at: number;
      bookObservedAt: number;
      positionBase: number;
      maximumAbsPositionBase: number;
      bestBid: number;
      bestAsk: number;
      input: {
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
        makerFeeBps: number;
        gasCostUsd: number;
        adverseSelectionBps: number;
        safetyMarginBps: number;
      };
      recordedEconomics: { conditionalNetUsd: number; remainingCostBps: number };
    }[];
    const r = rows.find((r) => Math.abs(r.input.price - 75373.4) < 0.01)!;
    const base = makeDecisionSnapshot(r.at),
      c = r.input;
    let breached = false,
      cancelled = false;
    const current = {
      venueOrderId: r.id,
      clientOrderId: r.clientOrderId,
      side: c.side,
      price: c.price,
      quantity: c.quantity,
      market: base.input.market,
      strategyConfigId: base.input.strategyConfigId,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    };
    const snapshot = () => ({
      ...base,
      sourceStateHash: '1620-' + breached + '-' + cancelled,
      // Controlled isolation: no capacity for a new opposite ENTRY in this KEEP replay.
      strategyAllocationRemainingUsd: 0,
      maximumAbsPositionBase: breached ? c.quantity / 2 : r.maximumAbsPositionBase,
      input: {
        ...base.input,
        actualInventoryBase: r.positionBase,
        book: { bestBid: r.bestBid, bestAsk: r.bestAsk, observedAt: r.bookObservedAt },
        openOrders: cancelled ? [] : [current],
      },
      economicInputs: {
        ...base.economicInputs!,
        makerFeeBps: c.makerFeeBps,
        estimatedGasCostUsd: c.gasCostUsd,
        adverseSelectionBufferBps: c.adverseSelectionBps,
        safetyMarginBps: c.safetyMarginBps,
        candidateAdverseSelection: [],
      },
    });
    const submitted: string[] = [];
    const test = make({
      snapshots: [snapshot()],
      readSnapshot: snapshot,
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      cancelTargetState: 'ORDER_OPEN',
      reconcileIntent: () => Promise.resolve(cancelled ? 'ORDER_CANCELLED' : 'ORDER_OPEN'),
      executor: {
        placePostOnlyLimit: () => {
          throw Error('UNEXPECTED_PLACE');
        },
        cancelExactOrder: (intent) => {
          submitted.push(intent.expectedPreviousVenueOrderId);
          cancelled = true;
          return Promise.resolve({ outcome: 'CANCEL_CONFIRMED' });
        },
      },
    });
    const intent = buildDecibelExecutionIntentV1({
      ...c,
      clientOrderId: r.clientOrderId,
      market: 'BTC/USD',
      sessionId: base.input.sessionId,
      cycleSequence: 1,
      action: 'PLACE',
      tickSize: 0.1,
      lotSize: 0.00001,
      knownVenueOrderId: null,
      sourceStateHash: '1620-copy',
      strategyDecisionHash: '1620-copy',
      createdAt: r.at - 746000,
    });
    test.journal.prepare(intent);
    test.journal.transition(intent.intentId, 'ACKNOWLEDGED', r.at - 740000, r.id);
    try {
      const kept = await test.orchestrator.evaluateOnce();
      expect(kept.action).toBe('HOLD');
      expect(submitted).toEqual([]);
      const action = kept.evaluation?.actions.find((a) => a.current?.venueOrderId === r.id);
      expect(action?.action).toBe('NO_OP');
      expect(action?.entryEconomics?.conditionalNetUsd).toBeCloseTo(
        0.0658309034 + (c.price * c.quantity * c.safetyMarginBps) / 10000,
        12,
      );
      expect(action?.entryEconomics?.remainingCostBps).toBeCloseTo(1.611564303203303, 12);
      const admission = evaluateTradingDecision(snapshot(), {
        now: r.at,
        sessionId: base.input.sessionId,
        state: 'RUNNING',
        candidate: { side: c.side, price: c.price, quantity: c.quantity, reduceOnly: false },
      });
      expect(admission.detailedReasons).not.toContain('LIFECYCLE_COST_BUDGET_EXCEEDED');
      breached = true;
      cancelled = false;
      const safetyTest = make({
        readSnapshot: snapshot,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        cancelTargetState: 'ORDER_OPEN',
        reconciliationState: 'ORDER_OPEN',
      });
      safetyTest.journal.prepare(intent);
      safetyTest.journal.transition(intent.intentId, 'ACKNOWLEDGED', r.at - 740000, r.id);
      const safety = await safetyTest.orchestrator.evaluateOnce();
      expect(safetyTest.submitted()).toEqual([{ action: 'CANCEL', side: 'BUY' }]);
      await safetyTest.orchestrator.close();
      expect(safety.action, JSON.stringify({ blocker: safety.blocker })).toBe('ACKNOWLEDGED');
      expect(submitted).toEqual([]);
      expect(
        safety.evaluation?.actions.some(
          (a) => a.reason === 'RISK_INVALID:RESTING_ENTRY_EXCEEDS_POSITION_LIMIT',
        ),
      ).toBe(true);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('keeps both valid OPEN ENTRY orders beyond 300s and restart without proposing replacement', async () => {
    let now = 50000;
    const path = join(mkdtempSync(join(tmpdir(), 'entry-keep-')), 'journal.sqlite');
    const base = makeDecisionSnapshot(now);
    const orders = (['BUY', 'SELL'] as const).map((side) => ({
      venueOrderId: 'keep-' + side,
      clientOrderId: 'd1' + (side === 'BUY' ? 'b' : 's') + 'a'.repeat(29),
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side,
      price: side === 'BUY' ? base.input.book.bestBid : base.input.book.bestAsk,
      quantity: 0.00044,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    }));
    const snapshot = () => {
      const s = makeDecisionSnapshot(now);
      return { ...s, sourceStateHash: 'keep-' + now, input: { ...s.input, openOrders: orders } };
    };
    const open = () =>
      make({
        journalPath: path,
        readSnapshot: snapshot,
        snapshots: [snapshot()],
        reconciliationState: 'ORDER_OPEN',
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        executor: {
          placePostOnlyLimit: () => {
            throw Error('UNEXPECTED_PLACE');
          },
          cancelExactOrder: () => {
            throw Error('UNEXPECTED_CANCEL');
          },
        },
      });
    let test = open();
    for (const o of orders) {
      const intent = buildDecibelExecutionIntentV1({
        ...o,
        market: 'BTC/USD',
        sessionId: base.input.sessionId,
        cycleSequence: o.side === 'BUY' ? 1 : 2,
        action: 'PLACE',
        tickSize: 0.1,
        lotSize: 0.00001,
        knownVenueOrderId: null,
        sourceStateHash: 'original',
        strategyDecisionHash: 'original',
        createdAt: 1000,
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 1000, o.venueOrderId);
    }
    try {
      expect(
        (await test.orchestrator.evaluateOnce()).evaluation?.actions.every(
          (a) => a.action === 'NO_OP',
        ),
      ).toBe(true);
    } finally {
      await test.orchestrator.close();
    }
    now += 1200000;
    test = open();
    try {
      const result = await test.orchestrator.evaluateOnce();
      expect(result.action).toBe('HOLD');
      expect(result.evaluation?.actions).toHaveLength(2);
      expect(
        result.evaluation?.actions.every(
          (a) => a.action === 'NO_OP' && a.entryEconomics?.decision === 'KEEP',
        ),
      ).toBe(true);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('keeps recorded PID 26796 displaced BUY and valid SELL without lease-driven cancel or strategic replacement', async () => {
    const r = JSON.parse(readFileSync('tests/fixtures/entry_retention_26796_v1.json', 'utf8')) as {
      snapshot: {
        timestamp: number;
        bookObservedAt: number;
        bestBid: number;
        bestAsk: number;
        makerFeeBps: number;
        estimatedGasCostUsd: number;
        adverseSelectionBufferBps: number;
        safetyMarginBps: number;
      };
      facts: {
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
        at: number;
        clientOrderId: string;
        venueOrderId: string;
      }[];
    };
    const s = r.snapshot,
      base = makeDecisionSnapshot(s.timestamp);
    const facts = [r.facts[0]!, r.facts[2]!];
    const orders = facts.map((f) => ({
      ...f,
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    }));
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        book: { bestBid: s.bestBid, bestAsk: s.bestAsk, observedAt: s.bookObservedAt },
        openOrders: orders,
      },
      economicInputs: {
        ...base.economicInputs!,
        makerFeeBps: s.makerFeeBps,
        estimatedGasCostUsd: s.estimatedGasCostUsd,
        adverseSelectionBufferBps: s.adverseSelectionBufferBps,
        safetyMarginBps: s.safetyMarginBps,
        candidateAdverseSelection: [],
      },
    };
    const test = make({
      readSnapshot: () => snapshot,
      snapshots: [snapshot],
      reconciliationState: 'ORDER_OPEN',
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      executor: {
        placePostOnlyLimit: () => {
          throw Error('UNEXPECTED_PLACE');
        },
        cancelExactOrder: () => {
          throw Error('UNEXPECTED_CANCEL');
        },
      },
    });
    for (const f of facts) {
      const intent = buildDecibelExecutionIntentV1({
        ...f,
        market: 'BTC/USD',
        sessionId: base.input.sessionId,
        cycleSequence: f.side === 'BUY' ? 1 : 2,
        action: 'PLACE',
        tickSize: 0.1,
        lotSize: 0.00001,
        knownVenueOrderId: null,
        sourceStateHash: 'recorded',
        strategyDecisionHash: 'recorded',
        createdAt: f.at,
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', f.at, f.venueOrderId);
    }
    try {
      const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
      expect(evaluation.actions).toHaveLength(2);
      for (const action of evaluation.actions) {
        expect(action.entryEconomics?.decision).toBe('KEEP');
        expect(['NO_OP', 'WOULD_REPLACE']).toContain(action.action);
        if (action.action === 'WOULD_REPLACE') {
          expect(
            action.entryReplacementEconomics?.candidateAdmission.conditionalNetUsd,
          ).toBeGreaterThanOrEqual(0);
          expect(
            action.side === 'BUY'
              ? action.desired!.price > action.current!.price
              : action.desired!.price < action.current!.price,
          ).toBe(true);
        }
      }
    } finally {
      await test.orchestrator.close();
    }
  });

  it.each(['BUY', 'SELL'] as const)(
    'charges full PLACE reserves while excluding sunk placement gas from KEEP: %s',
    (side) => {
      const input = {
        side,
        price: 100,
        quantity: 1,
        midpoint: side === 'BUY' ? 100.045 : 99.955,
        makerFeeBps: 1.5,
        gasCostUsd: 0.01,
        adverseSelectionBps: 4,
        safetyMarginBps: 1,
      };
      const place = assessDecibelEntryPhaseEconomicsV1({ ...input, phase: 'PLACE' });
      const resting = assessDecibelRestingEntryEconomicsV1(input);
      // Continuation excludes both sunk placement gas and the admission-only
      // safety buffer. Mark payoff remains a diagnostic, not cancellation evidence.
      expect(place.conditionalNetUsd).toBeCloseTo(0, 8);
      expect(resting.conditionalNetUsd).toBeCloseTo(0.02, 8);
      expect(resting.decision).toBe('KEEP');
      const bad = { ...input, midpoint: side === 'BUY' ? 100.02 : 99.98 };
      expect(
        assessDecibelEntryPhaseEconomicsV1({ ...bad, phase: 'PLACE' }).conditionalNetUsd,
      ).toBeLessThan(0);
      expect(assessDecibelRestingEntryEconomicsV1(bad).decision).toBe('KEEP');
    },
  );

  it.each(['BUY', 'SELL'] as const)(
    'rejects the one-reserve admission gap through final production admission: %s',
    (side) => {
      const base = makeDecisionSnapshot(50000);
      const snapshot = {
        ...base,
        input: { ...base.input, book: { bestBid: 79999.9, bestAsk: 80000.1, observedAt: 50000 } },
        economicInputs: {
          ...base.economicInputs!,
          makerFeeBps: 1.5,
          estimatedGasCostUsd: 0.004,
          adverseSelectionBufferBps: 4,
          safetyMarginBps: 1,
          candidateAdverseSelection: [],
        },
      };
      const candidate = {
        side,
        price: side === 'BUY' ? 79968 : 80032,
        quantity: 0.0005,
        reduceOnly: false,
      };
      const result = evaluateTradingDecision(snapshot, {
        now: 50000,
        sessionId: base.input.sessionId,
        state: 'RUNNING',
        candidate,
      });
      expect(result.detailedReasons).toContain('SPREAD_EDGE_INSUFFICIENT');
      expect(result.newExposurePermitted).toBe(false);
      expect(
        assessDecibelRestingEntryEconomicsV1({
          ...candidate,
          midpoint: 80000,
          makerFeeBps: 1.5,
          gasCostUsd: 0.004,
          adverseSelectionBps: 4,
          safetyMarginBps: 1,
        }).decision,
      ).toBe('KEEP');
    },
  );

  it('assembles capacity evidence after delayed receipt reads without extending its freshness', async () => {
    const old = makeDecisionSnapshot(10_000);
    let latest = old;
    let practical = old.practicalCapacityInputs!;
    let release!: (
      report: NonNullable<decibel_production_live_snapshot_v1['capacityProduction']>,
    ) => void;
    const report = new Promise<
      NonNullable<decibel_production_live_snapshot_v1['capacityProduction']>
    >((resolve) => {
      release = resolve;
    });
    const readSnapshot = vi.fn(() => Promise.resolve(latest));
    const projected = readDecibelSessionCapacityProjectionV1({
      readSnapshot,
      readPracticalInputs: () => practical,
      readProduction: () => report,
    });
    expect(readSnapshot).not.toHaveBeenCalled();
    latest = makeDecisionSnapshot(16_000);
    practical = { ...latest.practicalCapacityInputs!, accountObservedAt: 15_900 };
    release(
      assembleDecibelCapacityCertificateV1({
        now: 16000,
        maximumBookAgeMs: 5000,
        market: old.input.market,
        quantity: 0.00069,
        books: [],
        exits: [],
        policy: null,
        margin: null,
        manifest: [],
        receipts: [],
        prices: [],
        fees: null,
        futureGas: null,
        adverseSelectionBps: null,
      }),
    );
    const fresh = await projected;
    const sessionContext = {
      now: 16000,
      sessionId: fresh.input.sessionId,
      state: 'RUNNING' as const,
      candidate: { side: 'BUY' as const, price: 79900, quantity: 0.0005 },
    };
    expect(fresh.practicalCapacityInputs?.accountObservedAt).toBe(15900);
    expect(fresh.practicalCapacityInputs?.maximumAgeMs).toBe(5000);
    expect(evaluateTradingDecision(fresh, sessionContext).detailedReasons).not.toContain(
      'CAPACITY_ACCOUNT_EVIDENCE_STALE',
    );
    practical = { ...practical, accountObservedAt: 10000 };
    const stale = await readDecibelSessionCapacityProjectionV1({
      readSnapshot,
      readPracticalInputs: () => practical,
    });
    expect(evaluateTradingDecision(stale, sessionContext).detailedReasons).toContain(
      'CAPACITY_ACCOUNT_EVIDENCE_STALE',
    );
    const missing = await readDecibelSessionCapacityProjectionV1({
      readSnapshot,
      readPracticalInputs: () => null,
    });
    expect(missing.practicalCapacityInputs).toBeUndefined();
    expect(evaluateTradingDecision(missing, sessionContext).detailedReasons).toContain(
      'SESSION_CAPACITY_EVIDENCE_REQUIRED',
    );
  });

  it('replays PID 32328 partial TP coverage with exhausted entry allocation, stale STOP and recovery', async () => {
    const base = makeDecisionSnapshot();
    const order = {
      venueOrderId: '170141590376311909331936809890191769600',
      clientOrderId: 'd1sd8a98c72e12577f3415f3124562af',
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side: 'SELL' as const,
      price: 81323,
      quantity: 0.00115,
      reduceOnly: true,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    };
    const pending = order.price * order.quantity;
    const snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      sourceStateHash: 'partial-tp-fresh',
      strategyAllocationRemainingUsd: 0,
      availableMarginUsd: 3.07355735,
      authenticatedAvailableMarginUsd: 5.88414539936,
      maximumNotionalUsd: 116.556912,
      maximumReductionNotionalUsd: 116.556912,
      maximumAbsPositionBase: 0.00144,
      input: {
        ...base.input,
        book: { bestBid: 80941.5, bestAsk: 80943.1, observedAt: base.input.now },
        actualInventoryBase: 0.00128,
        openOrders: [order],
      },
      authenticatedPositions: [
        { market: 'BTC/USD', size: 0.00128, source: 'BOT', entryPrice: 81143.351563 },
      ],
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        capitalToUseUsd: 8,
        maxLossUsd: 3,
        targetMakerVolumeUsd: 500,
        totalExecutedVolumeUsd: 103.86349,
        marginUsedUsd: 4.92644265,
        exposureLimits: {
          ...base.sessionConfiguration!.exposureLimits!,
          effectivePositionLimitUsd: 116.556912,
          pendingExposureUsd: pending,
          currentExposureUsd: 0.00128 * 80942.3,
          availableHeadroomUsd: 116.556912 - 0.00128 * 80942.3,
        },
      },
      economicInputs: {
        ...base.economicInputs!,
        makerFeeBps: 1.5,
        estimatedGasCostUsd: 0.0004239584,
        adverseSelectionBufferBps: 3.349949411444634,
        safetyMarginBps: 1,
      },
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs!,
        costObservations: (
          [
            ['MAKER_FEE', 1.5],
            ['TAKER_FEE', 4.5],
          ] as const
        ).map(([kind, value]) => ({
          kind,
          value,
          unit: 'BPS',
          source: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
          observedAt: base.input.now,
          validUntil: base.input.now + 5000,
        })),
      },
    };
    const test = make({ snapshots: [snapshot] });
    const intent = buildDecibelExecutionIntentV1({
      ...order,
      sessionId: snapshot.input.sessionId,
      cycleSequence: 1,
      action: 'PLACE',
      market: 'BTC/USD',
      tickSize: 0.1,
      lotSize: 0.00001,
      knownVenueOrderId: null,
      sourceStateHash: 'partial-tp',
      strategyDecisionHash: 'partial-tp',
      createdAt: 1,
    });
    test.journal.prepare(intent);
    test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, order.venueOrderId);
    const sizing = {
      minimumNotionalUsd: 10,
      maximumNotionalUsd: snapshot.maximumNotionalUsd,
      maximumAbsPositionBase: 0.00144,
      availableMarginUsd: snapshot.availableMarginUsd,
      maximumEffectiveLeverage: 40,
      halfSpreadBps: 5,
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0.0004239584,
      adverseSelectionBufferBps: 3.349949411444634,
      safetyMarginBps: 1,
    };
    try {
      expect(calculateDecibelExitCoverageV1(snapshot.input)).toMatchObject({
        CONFIRMED_EXIT_COVERAGE_QTY: 0.00115,
        UNCOVERED_INVENTORY_QTY: 0.00013,
        entryPaused: true,
      });
      const evaluation = test.orchestrator['evaluateWithFlatPairCohort'](snapshot, sizing);
      const repair = evaluation.actions.find((action) => action.reason === 'EXIT_COVERAGE_UPSIZE');
      expect(repair).toMatchObject({
        action: 'WOULD_REPLACE',
        side: 'SELL',
        current: { quantity: 0.00115, price: 81323 },
        desired: { quantity: 0.00128, price: 81323 },
      });
      expect(
        evaluation.actions
          .filter((action) => action.side === 'BUY')
          .every((action) => action.action !== 'WOULD_PLACE'),
      ).toBe(true);
      // Any undersized TP is replaced at the same price with fresh evidence (operator
      // decision 2026-11-14); a quantity-only repair is not a price/profit decision.
      expect(
        evaluateDecibelReplacementDecisionV1(repair!, snapshot, 40000, 30000, 50),
      ).toMatchObject({ cancel: true, reason: 'EXIT_COVERAGE_UPSIZE' });
      const noProfit = {
        ...snapshot,
        authenticatedPositions: [
          { market: 'BTC/USD', size: 0.00128, source: 'BOT' as const, entryPrice: 81400 },
        ],
      };
      expect(
        evaluateDecibelReplacementDecisionV1(repair!, noProfit, 40000, 30000, 50),
      ).toMatchObject({ cancel: true, reason: 'EXIT_COVERAGE_UPSIZE' });
      const stale = {
        ...snapshot,
        practicalCapacityInputs: {
          ...snapshot.practicalCapacityInputs!,
          accountObservedAt: snapshot.input.now - 5001,
        },
      };
      const context = {
        now: snapshot.input.now,
        sessionId: snapshot.input.sessionId,
        state: 'RUNNING' as const,
        evaluation,
        mandatoryEvidenceFailureSince:
          snapshot.input.now - DECIBEL_EVIDENCE_FAILURE_STOP_AFTER_MS_V1,
      };
      expect(evaluateTradingDecision(stale, context)).toMatchObject({
        state: 'STOP',
        primaryReason: 'MANDATORY_EVIDENCE_FAILURE_PERSISTENT',
      });
      expect(evaluateDecibelReplacementDecisionV1(repair!, stale, 40000, 30000, 50)?.cancel).toBe(
        false,
      );
      expect(evaluateTradingDecision(snapshot, context)).toMatchObject({
        state: 'WAIT',
        evidenceComplete: true,
      });
      test.orchestrator['MandatoryEvidenceFailureSince'] = context.mandatoryEvidenceFailureSince;
      expect(test.orchestrator['evaluateDecision'](stale, evaluation).state).toBe('STOP');
      expect(test.orchestrator['evaluateDecision'](snapshot, evaluation)).toMatchObject({
        state: 'WAIT',
        evidenceComplete: true,
      });
      expect(test.orchestrator['MandatoryEvidenceFailureSince']).toBeNull();
      const missing = { ...snapshot, maximumNotionalUsd: 0, maximumReductionNotionalUsd: 0 };
      delete missing.practicalCapacityInputs;
      const blocked = test.orchestrator['evaluateWithFlatPairCohort'](missing, {
        ...sizing,
        maximumNotionalUsd: 0,
      });
      expect(blocked.status).toBe('FAIL_CLOSED');
      expect(
        blocked.actions.every(
          (action) => action.action !== 'WOULD_PLACE' && action.action !== 'WOULD_REPLACE',
        ),
      ).toBe(true);
      const pendingCancel = {
        ...snapshot.input,
        pendingCancelOrderIds: [order.venueOrderId],
        pendingExitQuantityBase: 0.00128,
      };
      const waiting = evaluateDecibelAuthenticatedPassiveRecyclingV1(pendingCancel, sizing);
      expect(waiting.actions.find((action) => action.side === 'SELL')).toMatchObject({
        action: 'BLOCKED',
        reason: 'EXIT_CANCEL_RECONCILIATION_PENDING',
      });
      expect(
        calculateDecibelExitCoverageV1({
          ...snapshot.input,
          openOrders: [{ ...order, quantity: 0.00128 }],
        }),
      ).toMatchObject({ UNCOVERED_INVENTORY_QTY: 0, entryPaused: false });
      expect(
        calculateDecibelExitCoverageV1({
          ...snapshot.input,
          actualInventoryBase: 0.00118,
          openOrders: [{ ...order, quantity: 0.00105 }],
        }).UNCOVERED_INVENTORY_QTY,
      ).toBe(0.00013);
      expect(test.journal.get(intent.intentId)?.status).toBe('ACKNOWLEDGED');
      expect(test.calls()).toBe(0);
      expect(snapshot.strategyAllocationRemainingUsd).toBe(0);
    } finally {
      await test.orchestrator.close();
    }
  });
  it.each([null, 'CAPACITY_VENUE_MARGIN_RULES_STALE', 'SESSION_CAPACITY_EVIDENCE_REQUIRED'])(
    'replays FLAT two resting entries at 2397ms without false reduce-only invalidation: %s',
    async (capacityBlocker) => {
      const base = twoSidedSnapshot();
      const probe = make({ snapshots: [base, base] });
      const plan = (await probe.orchestrator.evaluateOnce()).evaluation!;
      expect(plan.desiredBid).not.toBeNull();
      expect(plan.desiredAsk).not.toBeNull();
      await probe.orchestrator.close();
      const orders = [plan.desiredBid!, plan.desiredAsk!].map((o, i) => ({
        ...o,
        venueOrderId: `replay-${i}`,
        reduceOnly: false,
      }));
      const first = { ...base, input: { ...base.input, openOrders: orders } };
      const later = {
        ...first,
        sourceStateHash: 'same-flat-account-new-book',
        input: {
          ...first.input,
          now: base.input.now + 2397,
          book: {
            ...first.input.book,
            bestBid: 79900.1,
            bestAsk: 80100.1,
            observedAt: base.input.now + 2397,
          },
        },
        sessionConfiguration: {
          ...base.sessionConfiguration!,
          exposureLimits: {
            ...base.sessionConfiguration!.exposureLimits!,
            capacityBlocker,
          },
        },
      };
      const test = make({
        snapshots: [first, later, later, later],
        reconciliationState: 'ORDER_OPEN',
      });
      for (const o of orders) {
        const intent = buildDecibelExecutionIntentV1({
          ...o,
          sessionId: first.input.sessionId,
          cycleSequence: 0,
          action: 'PLACE',
          tickSize: first.input.metadata.tickSize,
          lotSize: first.input.metadata.lotSize,
          sourceStateHash: 'replay',
          strategyDecisionHash: 'replay',
          createdAt: first.input.now - 1000,
          knownVenueOrderId: null,
          executionRole: 'STANDARD_MAKER',
        });
        test.journal.prepare(intent);
        test.journal.transition(
          intent.intentId,
          'ACKNOWLEDGED',
          first.input.now - 500,
          o.venueOrderId,
        );
      }
      await test.orchestrator.evaluateOnce();
      const result = await test.orchestrator.evaluateOnce();
      expect(result.evaluation?.actions.some((a) => a.action === 'WOULD_CANCEL')).toBe(false);
      // A 0.1 move inside the observed 200-wide spread preserves both working makers.
      expect(result.controlSnapshot.cancelReason).toBeNull();
      if (capacityBlocker === null)
        expect(result.evaluation?.actions.every((action) => action.action === 'NO_OP')).toBe(true);
      expect(result.orderDecisions).toHaveLength(2);
      expect(
        result.orderDecisions?.every((o) => o.EVIDENCE_VERSION.includes('same-flat-account')),
      ).toBe(true);
      expect(test.calls()).toBe(0);
      expect(test.journal.nonTerminal()).toHaveLength(2);
      await test.orchestrator.close();
    },
  );
  it('still cancels entry risk on fresh proven margin deficit, despite missing capacity', async () => {
    const base = twoSidedSnapshot();
    const order = {
      venueOrderId: 'unsafe-entry',
      clientOrderId: `d1b${'a'.repeat(29)}`,
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side: 'BUY' as const,
      price: 79900,
      quantity: 0.00073,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    };
    const snapshot = {
      ...base,
      input: { ...base.input, openOrders: [order] },
      practicalCapacityInputs: { ...base.practicalCapacityInputs!, marginDeficitUsd: 1 },
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        exposureLimits: {
          ...base.sessionConfiguration!.exposureLimits!,
          capacityBlocker: 'SESSION_CAPACITY_ACCOUNT_MARGIN_UNSAFE',
        },
      },
    };
    const test = make({ snapshots: [snapshot, snapshot], reconciliationState: 'ORDER_OPEN' });
    const ownedEntry = buildDecibelExecutionIntentV1({
      ...order,
      sessionId: snapshot.input.sessionId,
      cycleSequence: 0,
      action: 'PLACE',
      tickSize: snapshot.input.metadata.tickSize,
      lotSize: snapshot.input.metadata.lotSize,
      sourceStateHash: 'margin-deficit-replay',
      strategyDecisionHash: 'margin-deficit-replay',
      createdAt: snapshot.input.now - 1000,
      knownVenueOrderId: null,
      executionRole: 'STANDARD_MAKER',
    });
    test.journal.prepare(ownedEntry);
    test.journal.transition(
      ownedEntry.intentId,
      'ACKNOWLEDGED',
      snapshot.input.now - 500,
      order.venueOrderId,
    );
    const result = await test.orchestrator.evaluateOnce();
    expect(
      result.evaluation?.actions.some((a) => a.reason === 'RISK_INVALID:REDUCE_ONLY_REQUIRED'),
    ).toBe(true);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });
  it('discards an earlier cancel proposal when the refreshed evidence fails closed', async () => {
    const base = twoSidedSnapshot();
    const order = {
      venueOrderId: 'refresh-entry',
      clientOrderId: `d1b${'a'.repeat(29)}`,
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side: 'BUY' as const,
      price: 79900,
      quantity: 0.00073,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    };
    const first = { ...base, input: { ...base.input, openOrders: [order] } };
    const refreshed = {
      ...first,
      sourceStateHash: 'refreshed-fail-closed',
      maximumNotionalUsd: 0,
      maximumReductionNotionalUsd: 0,
    };
    const test = make({ snapshots: [first, refreshed], reconciliationState: 'ORDER_OPEN' });
    const owned = buildDecibelExecutionIntentV1({
      ...order,
      sessionId: first.input.sessionId,
      cycleSequence: 0,
      action: 'PLACE',
      tickSize: first.input.metadata.tickSize,
      lotSize: first.input.metadata.lotSize,
      sourceStateHash: 'refresh-replay',
      strategyDecisionHash: 'refresh-replay',
      createdAt: first.input.now - 1000,
      knownVenueOrderId: null,
      executionRole: 'STANDARD_MAKER',
    });
    test.journal.prepare(owned);
    test.journal.transition(
      owned.intentId,
      'ACKNOWLEDGED',
      first.input.now - 500,
      order.venueOrderId,
    );
    test.orchestrator.requestRiskReduction(true);
    const result = await test.orchestrator.evaluateOnce();
    expect(result).toMatchObject({
      action: 'BLOCKED',
      blocker: 'NO_NEW_QUOTE_HEADROOM',
      mutationInvocations: 0,
    });
    expect(result.controlSnapshot).toMatchObject({
      sourceStateHash: 'refreshed-fail-closed',
      cancelReason: null,
    });
    expect(result.orderDecisions?.[0]).toMatchObject({ RISK_VALIDATION_DECISION: 'RECONCILE' });
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });

  it('admits a safe opposite endpoint when global headroom is occupied by the other flat quote', () => {
    const source = twoSidedSnapshot();
    const snapshot = {
      ...source,
      input: {
        ...source.input,
        openOrders: [
          {
            venueOrderId: 'held-buy',
            clientOrderId: 'd1b' + 'b'.repeat(29),
            strategyConfigId: source.input.strategyConfigId,
            market: source.input.market,
            side: 'BUY' as const,
            price: 79900,
            quantity: 118.44 / 80000,
            orderType: 'LIMIT' as const,
            timeInForce: 'PostOnly' as const,
            postOnly: true,
          },
        ],
      },
      sessionConfiguration: {
        ...source.sessionConfiguration!,
        exposureLimits: {
          ...source.sessionConfiguration!.exposureLimits!,
          availableHeadroomUsd: 0,
        },
      },
    };
    const result = evaluateTradingDecision(snapshot, {
      ...context,
      candidate: { side: 'SELL', price: 80100, quantity: 0.0003 },
    });
    expect(result.askEligible).toBe(true);
    expect(result.sideDiagnostics.COMBINED_PENDING_RISK).toBeLessThanOrEqual(118.44 + 1e-8);
  });
  it('retains farther reducing candidates when the nearest candidate has insufficient edge', () => {
    const source = twoSidedSnapshot(-0.00073);
    const input = {
      ...source.input,
      book: { ...source.input.book, bestBid: 79999, bestAsk: 80001 },
    };
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, {
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 118.44,
      maximumAbsPositionBase: 118.44 / 80000,
      entryHeadroomUsd: 60.04,
      availableMarginUsd: 8.05,
      maximumEffectiveLeverage: 40,
      maximumAggregateCollateralFraction: 0.5,
      candidateDistanceBps: [5, 12],
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0,
      adverseSelectionBufferBps: 5,
      safetyMarginBps: 1,
    });
    expect(evaluation.bidCandidatesEvaluated).toBeGreaterThanOrEqual(2);
    expect(evaluation.desiredBid).not.toBeNull();
    expect(evaluation.desiredAsk).toBeNull(); // entry waits for confirmed inventory coverage
    expect(evaluation.expectedBidEdgeBps!).toBeGreaterThanOrEqual(evaluation.requiredBidEdgeBps!);
    expect(evaluation.desiredBid!.quantity).toBeLessThanOrEqual(0.00073);
  });
  it.each([1, -1])(
    'does not submit a second exit before exact cancellation reconciliation (%s)',
    async (sign) => {
      const base = twoSidedSnapshot(sign * 0.0007);
      const side = sign > 0 ? ('SELL' as const) : ('BUY' as const);
      const price = side === 'SELL' ? 80100 : 79900;
      const intent = buildDecibelExecutionIntentV1({
        sessionId: base.input.sessionId,
        cycleSequence: 0,
        action: 'PLACE',
        market: 'BTC/USD',
        side,
        price,
        quantity: 0.0006,
        tickSize: base.input.metadata.tickSize,
        lotSize: base.input.metadata.lotSize,
        clientOrderId: (side === 'SELL' ? 'd1s' : 'd1b') + 'a'.repeat(29),
        knownVenueOrderId: null,
        sourceStateHash: 'prior-tp',
        strategyDecisionHash: 'prior-tp',
        createdAt: 19000,
        reduceOnly: true,
        executionRole: 'INVENTORY_REDUCING_MAKER',
      });
      const order = {
        venueOrderId: 'prior-tp',
        clientOrderId: intent.clientOrderId,
        market: base.input.market,
        strategyConfigId: base.input.strategyConfigId,
        side,
        price,
        quantity: 0.0006,
        reduceOnly: true,
        postOnly: true,
        timeInForce: 'PostOnly' as const,
        orderType: 'LIMIT' as const,
      };
      const snapshot = { ...base, input: { ...base.input, openOrders: [order] } };
      Object.assign(snapshot, {
        authenticatedPositions: [
          {
            market: 'BTC/USD',
            size: base.input.actualInventoryBase,
            source: 'BOT',
            entryPrice: sign > 0 ? 78000 : 82000,
          },
        ],
        practicalCapacityInputs: {
          ...base.practicalCapacityInputs!,
          costObservations: [
            {
              kind: 'MAKER_FEE',
              unit: 'BPS',
              value: 1.5,
              source: 'AUTHENTICATED_TEST_FEE_TIER',
              observedAt: 20000,
              validUntil: 25000,
            },
            {
              kind: 'TAKER_FEE',
              unit: 'BPS',
              value: 4.5,
              source: 'AUTHENTICATED_TEST_FEE_TIER',
              observedAt: 20000,
              validUntil: 25000,
            },
          ],
        },
      });
      const test = make({
        snapshots: Array.from({ length: 10 }, () => snapshot),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
        cancelTargetState: 'ORDER_OPEN',
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 19000, order.venueOrderId);
      const first = await test.orchestrator.evaluateOnce();
      expect(first.evaluation?.actions.find((a) => a.side === side)).toMatchObject({
        reason: 'EXIT_COVERAGE_UPSIZE',
        desired: { price },
      });
      // The undersized TP is cancelled once for a same-price replacement; no second exit
      // is placed while the cancel is not proven final.
      expect(test.submitted()).toEqual([{ action: 'CANCEL', side }]);
      await test.orchestrator.evaluateOnce();
      expect(test.submitted().every((a) => a.action !== 'PLACE')).toBe(true);
      expect(test.journal.findNonTerminalPlaceBySide(side)?.intentId).toBe(intent.intentId);
      await test.orchestrator.close();
    },
  );
  it.each([1, -1])(
    'plans exact reducing coverage for 0.00073 BTC rather than 0.00072 (%s)',
    async (sign) => {
      const snapshot = twoSidedSnapshot(sign * 0.00073);
      const test = make({ snapshots: [snapshot, snapshot] });
      const result = await test.orchestrator.evaluateOnce();
      const exit = sign > 0 ? result.evaluation?.desiredAsk : result.evaluation?.desiredBid;
      expect(exit?.quantity).toBe(0.00073);
      expect(result.tradingDecision.exitCoverage?.UNCOVERED_INVENTORY_QTY).toBe(0.00073);
      expect(result.tradingDecision.newExposurePermitted).toBe(false);
      await test.orchestrator.close();
    },
  );
  it('does not publish old position and pending exposure as current during stale account evidence', () => {
    const source = twoSidedSnapshot(0.00073);
    const result = evaluateTradingDecision(source, { ...context, now: source.input.now + 10000 });
    expect(result.capital.existingReductionQuantityBtc).toBeNull();
    expect(result.capital.pendingExposureUsd).toBeNull();
    expect(result.exitCoverage).toBeNull();
    expect(result.sideDiagnostics.COMBINED_PENDING_RISK).toBeNull();
    expect(result.state).not.toBe('TRADE');
    const dust = evaluateTradingDecision(twoSidedSnapshot(0.00001), context);
    expect(dust.detailedReasons).toContain('UNRESOLVED_INVENTORY_BELOW_VENUE_MINIMUM');
    expect(dust.nextRetryCondition).toBe(
      'VERIFIED_VENUE_CLOSE_RULE_OR_AUTHENTICATED_POSITION_UPDATE',
    );
    expect(dust.newExposurePermitted).toBe(false);
  });
  it.each([1, -1])(
    'keeps actual one-lot residual unresolved through unwind and restart (%s)',
    async (sign) => {
      const snapshot = twoSidedSnapshot(sign * 0.00001);
      const path = join(mkdtempSync(join(tmpdir(), 'decibel-residual-')), 'journal.sqlite');
      for (let restart = 0; restart < 2; restart++) {
        const test = make({
          journalPath: path,
          snapshots: [snapshot, snapshot, snapshot, snapshot],
        });
        test.orchestrator.requestSessionUnwind();
        const result = await test.orchestrator.evaluateOnce();
        expect(test.calls()).toBe(0);
        expect(test.orchestrator.getLatestSnapshot()?.input.actualInventoryBase).toBe(
          sign * 0.00001,
        );
        expect(test.orchestrator.isSessionUnwindComplete()).toBe(false);
        expect(result.evaluation?.status).not.toBe('SESSION_COMPLETE');
        await test.orchestrator.close();
      }
    },
  );
  const tpPriceFixture = (sign: number, now = 20000) => {
    const base = twoSidedSnapshot(sign * 0.00074);
    const side = sign > 0 ? ('SELL' as const) : ('BUY' as const);
    const current = {
      venueOrderId: 'confirmed-tp',
      clientOrderId: (side === 'BUY' ? 'd1b' : 'd1s') + 'a'.repeat(29),
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side,
      price: sign > 0 ? 82000 : 78000,
      quantity: 0.00074,
      reduceOnly: true,
      postOnly: true,
      timeInForce: 'PostOnly' as const,
      orderType: 'LIMIT' as const,
    };
    const snapshot = {
      ...base,
      sourceStateHash: 'tp-' + now,
      input: {
        ...base.input,
        now,
        metadata: { ...base.input.metadata, observedAt: now },
        book: { ...base.input.book, observedAt: now },
        openOrders: [current],
      },
      authenticatedPositions: [
        {
          market: 'BTC/USD',
          size: sign * 0.00074,
          source: 'BOT' as const,
          entryPrice: sign > 0 ? 78000 : 82000,
        },
      ],
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs!,
        accountObservedAt: now,
        marketObservedAt: now,
        venueMarginRules: {
          ...base.practicalCapacityInputs!.venueMarginRules!,
          observedAt: now,
          markObservedAt: now,
        },
        costObservations: (['MAKER_FEE', 'TAKER_FEE'] as const).map((kind) => ({
          kind,
          unit: 'BPS' as const,
          value: kind === 'MAKER_FEE' ? 1.5 : 4.5,
          source: 'AUTHENTICATED_TEST_FEE_TIER',
          observedAt: now,
          validUntil: now + 5000,
        })),
      },
    };
    const action = {
      action: 'WOULD_REPLACE' as const,
      side,
      current,
      desired: {
        ...current,
        strategyConfigId: base.input.strategyConfigId,
        generation: 1,
        price: sign > 0 ? 80090 : 79910,
      },
      reason: 'TP_PRICE_REVIEW_REQUIRED',
    };
    return { snapshot, action };
  };
  it.each([1, -1])(
    'replays PID1528 exact-quantity average-cost economics without inventing per-fill TP ownership (%s)',
    (sign) => {
      const recorded = JSON.parse(
        readFileSync(
          new URL('./fixtures/decibel_pid1528_capital_tp_v1.json', import.meta.url),
          'utf8',
        ),
      ) as {
        fills: { quantity: number; price: number; feeUsd: number }[];
        positionBasis: number;
        frame: {
          makerFeeBps: number;
          estimatedGasCostUsd: number;
          adverseSelectionBufferBps: number;
          safetyMarginBps: number;
        };
      };
      const mirror = (price: number) => (sign > 0 ? price : 160400 - price);
      const base = inventoryIncident(sign);
      const quantity = recorded.fills.reduce((sum, fill) => sum + fill.quantity, 0);
      expect(
        recorded.fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0) / quantity,
      ).toBeCloseTo(recorded.positionBasis, 6);
      const snapshot: decibel_production_live_snapshot_v1 = {
        ...base,
        input: {
          ...base.input,
          actualInventoryBase: sign * quantity,
          book: { bestBid: 80078.8, bestAsk: 80078.9, observedAt: base.input.now },
        },
        authenticatedPositions: [
          {
            market: 'BTC/USD',
            size: sign * quantity,
            entryPrice: mirror(recorded.positionBasis),
            source: 'BOT',
          },
        ],
        economicInputs: { ...base.economicInputs!, ...recorded.frame },
      };
      const side = sign > 0 ? 'SELL' : 'BUY';
      const assess = (price: number, q = quantity, source = snapshot) =>
        assessDecibelExitEconomicsV1(source, side, q, mirror(price));
      expect(assess(80162.5).netPnlUsd).toBeCloseTo(
        sign > 0 ? -0.04393746195004902 : -0.043970755049959016,
        8,
      );
      expect(assess(80314.4).netPnlUsd).toBeGreaterThan(0);
      expect(assess(80180).netPnlUsd).toBeLessThan(0);
      const lot = recorded.fills[2]!;
      const hypotheticalLot = {
        ...snapshot,
        input: { ...snapshot.input, actualInventoryBase: sign * lot.quantity },
        authenticatedPositions: [
          {
            ...snapshot.authenticatedPositions![0]!,
            size: sign * lot.quantity,
            entryPrice: mirror(lot.price),
          },
        ],
      };
      expect(assess(80180, lot.quantity, hypotheticalLot).netPnlUsd).toBeGreaterThan(0);
      expect(assess(80180, lot.quantity).netPnlUsd).toBeLessThan(0);
      expect(assess(80280).netPnlUsd).toBeGreaterThan(0);
      const first = recorded.fills[0]!;
      const hypotheticalFirst = {
        ...snapshot,
        input: { ...snapshot.input, actualInventoryBase: sign * first.quantity },
        authenticatedPositions: [
          {
            ...snapshot.authenticatedPositions![0]!,
            size: sign * first.quantity,
            entryPrice: mirror(first.price),
          },
        ],
      };
      expect(assess(80280, first.quantity, hypotheticalFirst).netPnlUsd).toBeGreaterThan(0);
      expect(assess(80314.4, quantity / 2).netPnlUsd).toBeLessThan(assess(80314.4).netPnlUsd!);
    },
  );
  const ExitIncident = JSON.parse(
    readFileSync(
      new URL('./fixtures/decibel_inventory_exit_incident_v1.json', import.meta.url),
      'utf8',
    ),
  ) as {
    fills: { quantity: number; price: number; timestamp: number }[];
    positionBefore: number;
    positionAfter: number;
    restingPrice: number;
    candidatePrices: number[];
    bestBid: number;
    bestAsk: number;
    makerFeeBps: number;
    takerFeeBps: number;
    gasUsd: number;
    adverseSelectionBps: number;
    safetyBps: number;
    cancelTerminalAt: number;
    replacementAuthenticatedOpenAt: number;
  };
  const reconstructedBasis =
    ExitIncident.fills.reduce((s, f) => s + f.quantity * f.price, 0) / ExitIncident.positionAfter;
  const inventoryIncident = (
    sign = 1,
    basis: number | null = reconstructedBasis,
    now = 60000,
  ): decibel_production_live_snapshot_v1 => {
    const base = tpPriceFixture(sign, now).snapshot;
    const mirror = (p: number) => (sign > 0 ? p : 161000 - p);
    const order = {
      ...base.input.openOrders[0]!,
      quantity: ExitIncident.positionBefore,
      price: mirror(ExitIncident.restingPrice),
    };
    const bid = sign > 0 ? ExitIncident.bestBid : mirror(ExitIncident.bestAsk);
    const ask = sign > 0 ? ExitIncident.bestAsk : mirror(ExitIncident.bestBid);
    return {
      ...base,
      sourceStateHash: `incident-exit-${sign}-${now}`,
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        exposureLimits: {
          configuredMaximumPositionUsd: 100,
          effectivePositionLimitUsd: 100,
          currentExposureUsd: ExitIncident.positionAfter * bid,
          pendingExposureUsd: 0,
          availableHeadroomUsd: Math.max(0, 100 - ExitIncident.positionAfter * bid),
        },
      },
      input: {
        ...base.input,
        actualInventoryBase: sign * ExitIncident.positionAfter,
        book: { bestBid: bid, bestAsk: ask, observedAt: now },
        openOrders: [order],
      },
      authenticatedPositions:
        basis === null
          ? []
          : [
              {
                market: 'BTC/USD',
                size: sign * ExitIncident.positionAfter,
                source: 'BOT',
                entryPrice: mirror(basis),
              },
            ],
      economicInputs: {
        ...base.economicInputs!,
        makerFeeBps: ExitIncident.makerFeeBps,
        estimatedGasCostUsd: ExitIncident.gasUsd,
        adverseSelectionBufferBps: ExitIncident.adverseSelectionBps,
        safetyMarginBps: ExitIncident.safetyBps,
      },
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs,
        bids: [{ price: bid, size: 1 }],
        asks: [{ price: ask, size: 1 }],
        recentMidpoints: [(bid + ask) / 2],
        venueMarginRules: {
          ...base.practicalCapacityInputs.venueMarginRules,
          markPrice: (bid + ask) / 2,
        },
      },
    };
  };
  it.each([1, -1])(
    'publishes corrected PID1528 capital through the real orchestrator while retaining authenticated TP identity (%s)',
    async (sign) => {
      const base = inventoryIncident(sign);
      const midpoint = 80078.85;
      const mirror = (price: number) => (sign > 0 ? price : 2 * midpoint - price);
      const order = { ...base.input.openOrders[0]!, price: mirror(80314.4), quantity: 0.0007 };
      const practical = {
        ...base.practicalCapacityInputs!,
        bids: [{ price: 80078.8, size: 1 }],
        asks: [{ price: 80078.9, size: 1 }],
        recentMidpoints: [midpoint],
        venueMarginRules: {
          ...base.practicalCapacityInputs!.venueMarginRules!,
          markPrice: midpoint,
        },
      };
      const limits = deriveDecibelSessionTradingLimitsV1({
        settings: {
          capitalToUseUsd: 5,
          maxLossUsd: 2,
          targetMakerVolumeUsd: 500,
          orderNotionalUsd: 10,
          maxPositionUsd: 50,
        },
        venueAvailableMarginUsd: 4.2,
        positionBase: sign * 0.0007,
        openOrders: [order],
        midpoint,
        maximumEffectiveLeverage: 40,
        venueMaximumNotionalUsd: 100,
        maximumAggregateCollateralFraction: 0.5,
        capacityInputs: practical,
        pnlUsd: 0,
        lotSize: 0.00001,
        now: base.input.now,
      });
      const snapshot: decibel_production_live_snapshot_v1 = {
        ...base,
        availableMarginUsd: limits.availableMarginUsd,
        authenticatedAvailableMarginUsd: 4.2,
        strategyAllocationRemainingUsd: limits.strategyAllocationRemainingUsd,
        maximumNotionalUsd: 72.070965,
        maximumAbsPositionBase: 0.0009,
        input: {
          ...base.input,
          actualInventoryBase: sign * 0.0007,
          openOrders: [order],
          book: { bestBid: 80078.8, bestAsk: 80078.9, observedAt: base.input.now },
        },
        authenticatedPositions: [
          {
            market: 'BTC/USD',
            size: sign * 0.0007,
            entryPrice: mirror(80167.987143),
            source: 'BOT',
          },
        ],
        practicalCapacityInputs: practical,
        economicInputs: {
          ...base.economicInputs!,
          makerFeeBps: 1.5,
          estimatedGasCostUsd: 0.0004075542,
          adverseSelectionBufferBps: 4.80896810258691,
          safetyMarginBps: 1,
        },
        sessionConfiguration: {
          ...base.sessionConfiguration!,
          capitalToUseUsd: 5,
          marginUsedUsd: limits.marginUsedUsd,
          exposureLimits: {
            ...limits,
            effectivePositionLimitUsd: 72.070965,
            availableHeadroomUsd: 16.01577,
          },
        },
      };
      const test = make({
        readSnapshot: () => snapshot,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
      });
      const owned = ownIncidentTP(test, snapshot);
      try {
        const result = await test.orchestrator.evaluateOnce();
        expect(result.tradingDecision.capital).toMatchObject({
          authenticatedAvailableMarginUsd: 4.2,
          pendingExposureUsd: 0,
        });
        expect(result.tradingDecision.capital.strategyAllocationRemainingUsd).toBeCloseTo(
          1.098620125,
          10,
        );
        expect(test.submitted()).toEqual([]);
        for (let replay = 0; replay < 3; replay++) {
          await test.orchestrator.evaluateOnce();
          expect(test.journal.getExecutionReconciliationBlocker()).toBe(null);
          expect(test.submitted()).toEqual([]);
        }
        expect(test.journal.get(owned.intentId)).toMatchObject({
          status: 'ACKNOWLEDGED',
          venueOrderId: order.venueOrderId,
        });
        expect(result.inventoryExit?.CONFIRMED_EXIT_COVERAGE_QTY).toBe(0.0007);
      } finally {
        await test.orchestrator.close();
      }
    },
  );
  const defensiveDispatchSnapshot = (sign: number) => {
    const base = inventoryIncident(sign, 81170.170313);
    const mirror = (price: number) => (sign > 0 ? price : 162340.4 - price);
    return {
      ...base,
      maximumNotionalUsd: 0,
      maximumReductionNotionalUsd: 200,
      authenticatedPositions: [
        {
          ...base.authenticatedPositions![0]!,
          size: sign * 0.00128,
          entryPrice: mirror(81170.170313),
        },
      ],
      input: {
        ...base.input,
        actualInventoryBase: sign * 0.00128,
        book: {
          bestBid: mirror(sign > 0 ? 79700 : 79700.1),
          bestAsk: mirror(sign > 0 ? 79700.1 : 79700),
          observedAt: base.input.now,
        },
        openOrders: [{ ...base.input.openOrders[0]!, price: mirror(81296.4), quantity: 0.00128 }],
      },
    };
  };

  const projectVenueReplay = (
    fresh: decibel_production_live_snapshot_v1,
    economic = fresh.economicInputs,
  ) => {
    const now = fresh.input.now;
    const merged = mergeDecibelVenueReconciliationSnapshotV1(
      fresh,
      {
        observedAt: now + 1,
        readWindow: { startedAt: now, completedAt: now + 1 },
        actualInventoryBase: fresh.input.actualInventoryBase,
        availableMarginUsd: fresh.availableMarginUsd,
        accountMetrics: fresh.accountMetrics ?? {
          collateralUsd: fresh.availableMarginUsd,
          totalMarginUsd: fresh.availableMarginUsd,
          unrealizedPnlUsd: 0,
          masterAptGas: null,
        },
        authenticatedPositions:
          fresh.input.actualInventoryBase === 0
            ? []
            : (fresh.authenticatedPositions ?? [
                { market: 'BTC/USD', size: fresh.input.actualInventoryBase, source: 'UNKNOWN' },
              ]),
        openOrders: fresh.input.openOrders,
      },
      {
        observedAt: now,
        readWindow: { startedAt: now, completedAt: now + 2 },
        ledger: fresh.input.actualFillLedger,
        terminalOrderEvidence: fresh.terminalOrderEvidence ?? [],
      },
    )!;
    return projectDecibelVenueDecisionSnapshotV1(
      fresh,
      merged,
      fresh.input.book,
      economic ?? null,
      fresh.input.sessionId,
      now + 2,
    );
  };

  it.each([0, 1, -1])(
    'publishes venue inventory and owned open orders independently of economic warmup (%s)',
    async (sign) => {
      const initial = defensiveDispatchSnapshot(sign || 1);
      const fresh =
        sign === 0
          ? {
              ...initial,
              authenticatedPositions: [],
              input: { ...initial.input, actualInventoryBase: 0, openOrders: [] },
            }
          : initial;
      const venue = projectVenueReplay(fresh);
      const staleLocal = {
        ...initial,
        input: {
          ...initial.input,
          actualInventoryBase: -fresh.input.actualInventoryBase,
          openOrders: [],
        },
      };
      const projected = projectDecibelVenueDecisionSnapshotV1(
        staleLocal,
        venue,
        venue.input.book,
        null,
        venue.input.sessionId,
        venue.input.now,
      );
      expect(projected.input.actualInventoryBase).toBe(fresh.input.actualInventoryBase);
      expect(projected.input.openOrders).toEqual(fresh.input.openOrders);
      expect(projected.economicInputs?.adverseSelectionBufferBps).toBeNull();
      const test = make({
        snapshots: Array.from({ length: 6 }, () => projected),
        reconciliationState: 'ORDER_OPEN',
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      if (sign !== 0) ownIncidentTP(test, projected);
      test.orchestrator.setEconomicWarming(true);
      try {
        await test.orchestrator.evaluateOnce();
        expect(test.orchestrator.getLatestSnapshot()?.input.actualInventoryBase).toBe(
          fresh.input.actualInventoryBase,
        );
        expect(test.calls()).toBe(0);
        if (sign !== 0)
          expect(
            test.journal.findNonTerminalByVenueOrderId(fresh.input.openOrders[0]!.venueOrderId),
          ).not.toBeNull();
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it('reconciles a confirmed terminal journal owner and ends FLAT STOPPING during economic warmup', async () => {
    const before = defensiveDispatchSnapshot(1);
    const order = before.input.openOrders[0]!;
    const flat = projectVenueReplay({
      ...before,
      authenticatedPositions: [],
      input: { ...before.input, actualInventoryBase: 0, openOrders: [] },
      terminalOrderEvidence: [
        {
          venueOrderId: order.venueOrderId,
          clientOrderId: order.clientOrderId,
          state: 'CANCELLED',
          originalQuantity: order.quantity,
          remainingQuantity: 0,
        },
      ],
    });
    const snapshot = projectDecibelVenueDecisionSnapshotV1(
      flat,
      flat,
      flat.input.book,
      null,
      flat.input.sessionId,
      flat.input.now,
    );
    const test = make({
      snapshots: Array.from({ length: 8 }, () => snapshot),
      reconciliationState: 'ORDER_CANCELLED',
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
    });
    ownIncidentTP(test, before);
    test.orchestrator.setEconomicWarming(true);
    test.orchestrator.requestSessionUnwind();
    try {
      reconcileDecibelAcknowledgedTerminalOrdersV1(test.journal, snapshot);
      expect(test.journal.nonTerminal()).toEqual([]);
      const venueComplete = vi.fn();
      const withoutMarket = {
        ...snapshot,
        input: { ...snapshot.input, book: { ...snapshot.input.book, observedAt: 0 } },
      };
      expect(
        finalizeDecibelVerifiedSessionV1(withoutMarket, 0, venueComplete, snapshot.input.now),
      ).toBe(true);
      expect(venueComplete).toHaveBeenCalledOnce();
      expect(
        finalizeDecibelVerifiedSessionV1(withoutMarket, 1, venueComplete, snapshot.input.now),
      ).toBe(false);
      for (let cycle = 0; cycle < 4 && !test.orchestrator.isSessionUnwindComplete(); cycle++)
        await test.orchestrator.evaluateOnce();
      expect(test.journal.nonTerminal()).toEqual([]);
      expect(test.orchestrator.isSessionUnwindComplete()).toBe(true);
      const complete = vi.fn();
      expect(
        finalizeDecibelVerifiedSessionV1(
          test.orchestrator.getLatestSnapshot(),
          0,
          complete,
          snapshot.input.now,
        ),
      ).toBe(true);
      expect(complete).toHaveBeenCalledOnce();
      expect(
        finalizeDecibelVerifiedSessionV1(
          snapshot,
          0,
          complete,
          snapshot.input.now + snapshot.input.maxBboAgeMs + 1,
        ),
      ).toBe(false);
      expect(complete).toHaveBeenCalledOnce();
      expect(test.calls()).toBe(0);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('retains original venue read clocks and rejects stale/disjoint batches before publication', () => {
    const fresh = defensiveDispatchSnapshot(1);
    const published = projectVenueReplay(fresh);
    const account = {
      observedAt: fresh.input.now - 1,
      actualInventoryBase: 0,
      availableMarginUsd: 100,
      accountMetrics: {
        collateralUsd: 100,
        totalMarginUsd: 100,
        unrealizedPnlUsd: 0,
        masterAptGas: null,
      },
      authenticatedPositions: [],
      openOrders: [],
    };
    expect(
      mergeDecibelVenueReconciliationSnapshotV1(published, account, {
        observedAt: fresh.input.now - 1,
        ledger: fresh.input.actualFillLedger,
        terminalOrderEvidence: [],
      }),
    ).toBeNull();
    expect(published.input.actualInventoryBase).toBe(0.00128);
    const newerBatch = {
      ...published,
      venueReadWindow: {
        account: { startedAt: fresh.input.now - 100, completedAt: fresh.input.now },
      },
    };
    expect(
      mergeDecibelVenueReconciliationSnapshotV1(
        newerBatch,
        {
          ...account,
          observedAt: fresh.input.now + 1,
          readWindow: { startedAt: fresh.input.now - 101, completedAt: fresh.input.now + 1 },
        },
        null,
      ),
    ).toBeNull();
    expect(() =>
      assertDecibelVenueReconciliationFreshV1(
        {
          ...published,
          venueReadWindow: { account: { startedAt: NaN, completedAt: fresh.input.now } },
        },
        fresh.input.now,
      ),
    ).toThrow('BATCH_STALE');
    expect(() =>
      mergeDecibelVenueReconciliationSnapshotV1(
        published,
        {
          ...account,
          observedAt: fresh.input.now + 10,
          readWindow: { startedAt: fresh.input.now + 9, completedAt: fresh.input.now + 10 },
        },
        {
          observedAt: fresh.input.now,
          readWindow: { startedAt: fresh.input.now, completedAt: fresh.input.now + 1 },
          ledger: fresh.input.actualFillLedger,
        },
      ),
    ).toThrow('BATCH_INCONSISTENT');
    const republished = projectDecibelVenueDecisionSnapshotV1(
      published,
      published,
      { ...published.input.book, observedAt: published.input.now + 6000 },
      published.economicInputs,
      published.input.sessionId,
      published.input.now + 6000,
    );
    expect(() =>
      assertDecibelVenueReconciliationFreshV1(republished, republished.input.now),
    ).toThrow('BATCH_STALE');
    const changedHistory: decibel_production_live_snapshot_v1 = {
      ...published,
      terminalOrderEvidence: [
        {
          venueOrderId: fresh.input.openOrders[0]!.venueOrderId,
          clientOrderId: fresh.input.openOrders[0]!.clientOrderId,
          state: 'CANCELLED',
          originalQuantity: 0.00128,
          remainingQuantity: 0,
        },
      ],
    };
    const unchanged = projectDecibelVenueDecisionSnapshotV1(
      published,
      published,
      published.input.book,
      published.economicInputs,
      published.input.sessionId,
      published.input.now,
    );
    expect(
      projectDecibelVenueDecisionSnapshotV1(
        published,
        changedHistory,
        published.input.book,
        published.economicInputs,
        published.input.sessionId,
        published.input.now,
      ).sourceStateHash,
    ).not.toBe(unchanged.sourceStateHash);
  });

  const zeroCoverageIncident = (sign: number) => {
    const base = defensiveDispatchSnapshot(sign);
    const mirror = (price: number) =>
      Math.round((sign > 0 ? price : 160987.621876 - price) * 10) / 10;
    const bid = mirror(sign > 0 ? 78350 : 78350.1);
    const ask = mirror(sign > 0 ? 78350.1 : 78350);
    const snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      maximumAbsPositionBase: 0.00018,
      availableMarginUsd: 0,
      authenticatedAvailableMarginUsd: 0.14,
      authenticatedPositions: [
        { market: 'BTC/USD', size: sign * 0.00128, entryPrice: 80493.810938, source: 'BOT' },
      ],
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        pnlUsd: -2.65,
        maxLossUsd: 3,
        riskBlocker: 'NO_NEW_QUOTE_HEADROOM',
        exposureLimits: {
          ...base.sessionConfiguration!.exposureLimits!,
          effectivePositionLimitUsd: 15,
          availableHeadroomUsd: 0,
          capacityBlocker: 'NO_NEW_QUOTE_HEADROOM',
        },
      },
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs!,
        accountObservedAt: base.input.now,
        venueMarginRules: {
          ...base.practicalCapacityInputs!.venueMarginRules!,
          observedAt: base.input.now - 5001,
          markObservedAt: base.input.now - 5001,
        },
      },
      input: {
        ...base.input,
        actualInventoryBase: sign * 0.00128,
        openOrders: [],
        book: { bestBid: bid, bestAsk: ask, observedAt: base.input.now },
      },
    };
    return {
      ...snapshot,
      maximumReductionNotionalUsd: getDecibelPositionReductionNotionalLimitV1(snapshot),
    };
  };

  it.each([
    ...[1, -1].flatMap((sign) =>
      [1.5, 5].flatMap((fee) =>
        [0.00044, 0.00057].map((quantity) => ({ sign, fee, quantity, mode: 'ACK' })),
      ),
    ),
    ...[1, -1].flatMap((sign) =>
      ['UNKNOWN', 'POST_ONLY'].map((mode) => ({ sign, fee: 1.5, quantity: 0.00044, mode })),
    ),
  ])(
    'PID21712 constructs and dispatches profitable maker TP to authoritative coverage $sign $fee $quantity $mode',
    async ({ sign, fee, quantity, mode }) => {
      const record = JSON.parse(
        readFileSync(new URL('./fixtures/decibel_pid21712_tp_v1.json', import.meta.url), 'utf8'),
      ) as {
        bestBid: number;
        bestAsk: number;
        estimatedGasCostUsd: number;
        adverseSelectionBufferBps: number;
        safetyMarginBps: number;
        sizingInputs: {
          maximumNotionalUsd: number;
          maximumAbsPositionBase: number;
          availableMarginUsd: number;
        };
      };
      const base = pid18876Snapshot(sign, false, quantity);
      const mirror = (p: number) => (sign > 0 ? p : 160868.6 - p);
      const basis = quantity > 0.00044 ? (0.00044 * 80434.3 + 0.00013 * 80400) / quantity : 80434.3;
      const bid = sign > 0 ? record.bestBid : mirror(record.bestAsk),
        ask = sign > 0 ? record.bestAsk : mirror(record.bestBid);
      let snapshot: decibel_production_live_snapshot_v1 = {
        ...base,
        maximumNotionalUsd: record.sizingInputs.maximumNotionalUsd,
        maximumAbsPositionBase: record.sizingInputs.maximumAbsPositionBase,
        strategyAllocationRemainingUsd: 2.5 - (quantity * (bid + ask)) / 2 / 40,
        availableMarginUsd: record.sizingInputs.availableMarginUsd,
        authenticatedPositions: [
          { market: 'BTC/USD', size: sign * quantity, entryPrice: mirror(basis), source: 'BOT' },
        ],
        input: {
          ...base.input,
          actualInventoryBase: sign * quantity,
          openOrders: [],
          book: { bestBid: bid, bestAsk: ask, observedAt: base.input.now },
        },
        economicInputs: {
          ...base.economicInputs!,
          makerFeeBps: fee,
          estimatedGasCostUsd: record.estimatedGasCostUsd,
          adverseSelectionBufferBps: record.adverseSelectionBufferBps,
          safetyMarginBps: record.safetyMarginBps,
        },
        practicalCapacityInputs: {
          ...base.practicalCapacityInputs,
          costObservations: (['MAKER_FEE', 'TAKER_FEE'] as const).map((kind) => ({
            kind,
            unit: 'BPS' as const,
            value: kind === 'MAKER_FEE' ? fee : Math.max(4.5, fee),
            source: 'AUTHENTICATED_TEST',
            observedAt: base.input.now,
            validUntil: base.input.now + 5000,
          })),
          venueMarginRules: {
            ...base.practicalCapacityInputs.venueMarginRules,
            observedAt: base.input.now,
            markObservedAt: base.input.now,
            markPrice: (bid + ask) / 2,
          },
        },
      };
      const side = sign > 0 ? 'SELL' : 'BUY';
      expect(
        assessDecibelExitEconomicsV1(snapshot, side, quantity, mirror(80464.8)).netPnlUsd,
      ).toBeLessThan(0);
      const constructed = constructDecibelProfitableTPPriceV1(
        snapshot,
        side,
        quantity,
        mirror(80464.8),
      );
      expect(constructed.blocker).toBeNull();
      expect(
        assessDecibelExitEconomicsV1(snapshot, side, quantity, constructed.price!).netPnlUsd,
      ).toBeGreaterThan(0);
      expect(
        assessDecibelExitEconomicsV1(
          snapshot,
          side,
          quantity,
          constructed.price! + (sign > 0 ? -0.1 : 0.1),
        ).netPnlUsd,
      ).toBeLessThan(tpTargetNetUsd(snapshot, quantity));
      expect(
        constructDecibelProfitableTPPriceV1(
          {
            ...snapshot,
            practicalCapacityInputs: {
              ...snapshot.practicalCapacityInputs!,
              accountObservedAt: snapshot.input.now - 5001,
            },
          },
          side,
          quantity,
          mirror(80464.8),
        ).blocker,
      ).toContain('FRESH_AUTHENTICATED_ACCOUNT_REQUIRED');
      expect(
        constructDecibelProfitableTPPriceV1(
          {
            ...snapshot,
            practicalCapacityInputs: { ...snapshot.practicalCapacityInputs!, costObservations: [] },
          },
          side,
          quantity,
          mirror(80464.8),
        ).blocker,
      ).toContain('FRESH_MAKER_FEE_REQUIRED');
      expect(
        constructDecibelProfitableTPPriceV1(
          {
            ...snapshot,
            reductionCapacity: { ...snapshot.reductionCapacity!, venueMaximumOrderNotionalUsd: 1 },
          },
          side,
          quantity,
          mirror(80464.8),
        ).blocker,
      ).toBe('TP_PROFITABLE_PRICE_EXCEEDS_VENUE_ORDER_LIMIT');
      const place = vi.fn(
        (request: Parameters<DecibelProductionWriteClientV1['placeOrder']>[0]) => {
          expect(request.isReduceOnly).toBe(true);
          expect(request.timeInForce).toBe(1);
          expect(request.isBuy).toBe(sign < 0);
          expect(request.size).toBe(BigInt(Math.round(quantity * 1e8)));
          expect(
            sign > 0 ? Number(request.price) / 1e6 > bid : Number(request.price) / 1e6 < ask,
          ).toBe(true);
          if (mode !== 'ACK')
            return Promise.resolve({
              success: false as const,
              error: mode === 'POST_ONLY' ? 'PostOnlyViolation' : 'OUTCOME_UNKNOWN',
            });
          return Promise.resolve({
            success: true as const,
            orderId: 'pid21712-tp',
            transactionHash: 'fake-pid21712',
          });
        },
      );
      const Adapter = new decibel_external_production_executor_v1(() => ({
        client: {
          placeOrder: place,
          cancelOrder: () => Promise.reject(Error('UNEXPECTED_CANCEL')),
        },
        subaccount: '0x123',
      }));
      const journalPath = join(mkdtempSync(join(tmpdir(), 'pid21712-')), 'journal.sqlite');
      const test = make({
        journalPath,
        readSnapshot: () => snapshot,
        executor: Adapter,
        reconciliationState: 'ORDER_OPEN',
        ...(mode === 'ACK'
          ? {}
          : { reconciliationError: new Error('PID21712_AUTHORITATIVE_OUTCOME_UNAVAILABLE') }),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        validateSubmission: (intent) => {
          if (intent.action !== 'PLACE') throw Error('UNEXPECTED_CANCEL');
          expect(
            assessDecibelExitEconomicsV1(snapshot, intent.side, intent.quantity, intent.price)
              .netPnlUsd,
          ).toBeGreaterThan(0);
          return {
            preflight: validateDecibelFinalMakerAdmissionV1(
              snapshot,
              intent,
              {
                now: snapshot.input.now,
                sessionId: snapshot.input.sessionId,
                state: 'RUNNING',
                evaluation: test.orchestrator.evaluateAuthenticatedSnapshot(snapshot),
              },
              500,
            ),
            observedAt: snapshot.input.now,
          };
        },
      });
      let firstClosed = false;
      try {
        const result = await test.orchestrator.evaluateOnce();
        if (mode !== 'ACK') {
          expect(result.action).toBe('RECONCILIATION_REQUIRED');
          await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
            'PID21712_AUTHORITATIVE_OUTCOME_UNAVAILABLE',
          );
          expect(place).toHaveBeenCalledOnce();
          await test.orchestrator.close();
          firstClosed = true;
          // A fresh runtime must restore the unresolved identity without retry.
          const restarted = make({
            journalPath,
            readSnapshot: () => snapshot,
            executor: Adapter,
            reconciliationError: new Error('PID21712_AUTHORITATIVE_OUTCOME_UNAVAILABLE'),
            environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
          });
          try {
            await expect(restarted.orchestrator.evaluateOnce()).rejects.toThrow(
              'PID21712_AUTHORITATIVE_OUTCOME_UNAVAILABLE',
            );
            expect(place).toHaveBeenCalledOnce();
            expect(calculateDecibelExitCoverageV1(snapshot.input).CONFIRMED_EXIT_COVERAGE_QTY).toBe(
              0,
            );
          } finally {
            await restarted.orchestrator.close();
          }
          return;
        }
        expect(result.action, result.blocker ?? '').toBe('ACKNOWLEDGED');
        const row = test.journal.nonTerminal()[0]!,
          intent = test.journal.getIntent(row.intentId)!;
        expect(intent).toMatchObject({ action: 'PLACE', side, quantity, reduceOnly: true });
        expect(place).toHaveBeenCalledOnce();
        expect(calculateDecibelExitCoverageV1(snapshot.input).CONFIRMED_EXIT_COVERAGE_QTY).toBe(0);
        snapshot = {
          ...snapshot,
          maximumNotionalUsd: 0,
          sessionConfiguration: {
            ...snapshot.sessionConfiguration!,
            exposureLimits: {
              ...snapshot.sessionConfiguration!.exposureLimits!,
              capacityBlocker: 'CAPACITY_VENUE_MARGIN_RULES_STALE',
              availableHeadroomUsd: 0,
            },
          },
          input: {
            ...snapshot.input,
            openOrders: [
              {
                venueOrderId: row.venueOrderId!,
                clientOrderId: intent.clientOrderId,
                strategyConfigId: snapshot.input.strategyConfigId,
                market: snapshot.input.market,
                side,
                price: intent.price,
                quantity,
                reduceOnly: true,
              },
            ],
          },
        };
        await test.orchestrator.evaluateOnce();
        expect(
          calculateDecibelExitCoverageV1(test.orchestrator.getLatestSnapshot()!.input),
        ).toMatchObject({ CONFIRMED_EXIT_COVERAGE_QTY: quantity, UNCOVERED_INVENTORY_QTY: 0 });
        expect(place).toHaveBeenCalledOnce();
        const remaining = Number((quantity - 0.00001).toFixed(8));
        snapshot = {
          ...snapshot,
          reductionCapacity: { ...snapshot.reductionCapacity!, maximumQuantityBtc: remaining },
          authenticatedPositions: [
            { market: 'BTC/USD', size: sign * remaining, entryPrice: mirror(basis), source: 'BOT' },
          ],
          input: {
            ...snapshot.input,
            actualInventoryBase: sign * remaining,
            openOrders: snapshot.input.openOrders.map((order) => ({
              ...order,
              quantity: remaining,
            })),
          },
        };
        await test.orchestrator.evaluateOnce();
        expect(
          calculateDecibelExitCoverageV1(test.orchestrator.getLatestSnapshot()!.input),
        ).toMatchObject({ CONFIRMED_EXIT_COVERAGE_QTY: remaining, UNCOVERED_INVENTORY_QTY: 0 });
        expect(place).toHaveBeenCalledOnce();
      } finally {
        if (!firstClosed) await test.orchestrator.close();
      }
    },
  );
  it.each([
    [1, false],
    [-1, false],
    [1, true],
    [-1, true],
  ] as const)(
    'blocks position growth without an admitted maker DCA (sign %s, protection contract %s)',
    async (sign, withContract) => {
      const fixture = tpPriceFixture(sign).snapshot;
      const snapshot = withContract
        ? {
            ...fixture,
            input: {
              ...fixture.input,
              reductionOrderRules: buildFakeReductionRules(fixture.input),
            },
          }
        : fixture;
      const test = make({ snapshots: [snapshot] });
      try {
        const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
        const side = sign > 0 ? 'BUY' : 'SELL';
        expect(side === 'BUY' ? evaluation.desiredBid : evaluation.desiredAsk).toBeNull();
        expect(
          side === 'BUY' ? evaluation.bidEligibilityReason : evaluation.askEligibilityReason,
        ).toBe('POSITION_GROWTH_DISABLED');
        const decision = evaluateTradingDecision(snapshot, {
          now: snapshot.input.now,
          sessionId: snapshot.input.sessionId,
          state: 'RUNNING',
          candidate: {
            side,
            price: side === 'BUY' ? snapshot.input.book.bestBid : snapshot.input.book.bestAsk,
            quantity: 0.00013,
            reduceOnly: false,
          },
        });
        expect(side === 'BUY' ? decision.bidEligible : decision.askEligible).toBe(false);
        expect(decision.actionPlan[side].reason).toBe('DCA_MAKER_POST_ONLY_REQUIRED');
        // A maker candidate still needs an admitted DCA (this fixture has no sizing policy).
        const maker = evaluateTradingDecision(snapshot, {
          now: snapshot.input.now,
          sessionId: snapshot.input.sessionId,
          state: 'RUNNING',
          candidate: {
            side,
            price: side === 'BUY' ? snapshot.input.book.bestBid : snapshot.input.book.bestAsk,
            quantity: 0.00013,
            reduceOnly: false,
            postOnly: true,
            timeInForce: 'PostOnly',
          },
        });
        expect(side === 'BUY' ? maker.bidEligible : maker.askEligible).toBe(false);
        expect(maker.actionPlan[side].reason).toMatch(/^DCA_/);
        expect(test.submitted()).toEqual([]);
      } finally {
        await test.orchestrator.close();
      }
    },
  );
  it.each([1, -1])(
    'admits a maker DCA addition far enough adverse within capacity (%s)',
    (sign) => {
      const fixture = tpPriceFixture(sign).snapshot;
      const side = sign > 0 ? 'BUY' : 'SELL';
      const maker = side === 'BUY' ? fixture.input.book.bestBid : fixture.input.book.bestAsk;
      const position = fixture.input.actualInventoryBase;
      // One authenticated opening fill: the entry, no addition used yet.
      const entryOrder = {
        venueOrderId: 'dca-entry',
        localIntentId: 'dca-entry',
        localExecutionRequestId: 'dca-entry',
        marketAddress: fixture.input.market,
        side,
        requestedQuantity: Math.abs(position),
      };
      const ledger = applyDecibelActualFillTruthV1(createDecibelActualFillLedgerV1([entryOrder]), {
        venueFillId: 'dca-entry-fill',
        venueOrderId: entryOrder.venueOrderId,
        localExecutionRequestId: entryOrder.localExecutionRequestId,
        marketAddress: entryOrder.marketAddress,
        side,
        executedPrice: maker,
        executedBaseQuantity: Math.abs(position),
        executedUsdNotional: Math.abs(position) * maker,
        makerOrTaker: 'MAKER',
        receivedAt: new Date(fixture.input.now - 1000),
        venueTimestamp: new Date(fixture.input.now - 1000),
        fee: { availability: 'AVAILABLE', amount: 0.001, currency: 'USD' },
        rebate: { availability: 'UNAVAILABLE', amount: null, currency: null },
        executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
      });
      // Midpoints every 30 s for 15 minutes; one sample in the last closed 5-minute candle
      // can extend the move against the position by `extremeUsd`.
      const candleMs = 300_000;
      const currentStart = Math.floor(fixture.input.now / candleMs) * candleMs;
      const midpoints = (extremeUsd: number) =>
        Array.from({ length: 31 }, (_, i) => {
          const at = fixture.input.now - (30 - i) * 30_000;
          const inLast = at >= currentStart - candleMs && at < currentStart;
          return {
            at,
            midpoint: inLast && i % 7 === 0 ? maker - sign * extremeUsd : maker,
          };
        });
      const snapshot = (basisOffsetBps: number, extremeUsd = 0) => ({
        ...fixture,
        marketStructure: createDecibelMarketStructureV1(
          'BBO_FALLBACK',
          midpoints(extremeUsd),
          fixture.input.now,
        ),
        input: { ...fixture.input, actualFillLedger: ledger },
        authenticatedPositions: [
          {
            market: 'BTC/USD',
            size: position,
            source: 'BOT' as const,
            // A long's basis above the maker (a short's below) by the given distance.
            entryPrice: maker * (1 + (sign * basisOffsetBps) / 10_000),
          },
        ],
        sessionConfiguration: {
          ...fixture.sessionConfiguration!,
          preferredEntrySizeUsd: Math.abs(position) * maker,
          exposureLimits: {
            ...fixture.sessionConfiguration!.exposureLimits!,
            riskCapacityUsd: Math.abs(position) * maker * 3,
          },
        },
      });
      const decide = (snap: ReturnType<typeof snapshot>) =>
        evaluateTradingDecision(snap, {
          now: snap.input.now,
          sessionId: snap.input.sessionId,
          state: 'RUNNING',
          candidate: {
            side,
            price: maker,
            quantity: Math.abs(position),
            reduceOnly: false,
            postOnly: true,
            timeInForce: 'PostOnly',
          },
        });
      const far = decide(snapshot(40));
      expect(far.actionPlan[side].reason).not.toMatch(/^(DCA_|POSITION_GROWTH)/);
      expect(decide(snapshot(10)).actionPlan[side].reason).toBe('DCA_ADVERSE_DISTANCE_REQUIRED');
      // The last closed candle still extends the move: wait for it to settle.
      expect(decide(snapshot(40, 10)).actionPlan[side].reason).toBe(
        sign > 0 ? 'DCA_PRICE_STILL_MAKING_NEW_LOWS' : 'DCA_PRICE_STILL_MAKING_NEW_HIGHS',
      );
      // No candle history: no addition.
      expect(
        decide({ ...snapshot(40), marketStructure: undefined } as unknown as ReturnType<
          typeof snapshot
        >).actionPlan[side].reason,
      ).toBe('DCA_CANDLE_EVIDENCE_REQUIRED');
    },
  );
  it.each(
    [1, -1].flatMap((sign) =>
      [false, true].flatMap((restartPending) =>
        ['ACK', 'UNKNOWN'].flatMap((outcome) =>
          [false, true].map((duringCancel) => ({ sign, restartPending, outcome, duringCancel })),
        ),
      ),
    ),
  )(
    'PID30680 reconciles partial fill/cancel using immutable PLACE identity and preserves TP $sign pendingRestart=$restartPending outcome=$outcome duringCancel=$duringCancel',
    async ({ sign, restartPending, outcome, duringCancel }) => {
      const f = JSON.parse(
        readFileSync(
          new URL('./fixtures/decibel_pid30680_cancel_v1.json', import.meta.url),
          'utf8',
        ),
      ) as {
        buyOrderId: string;
        buyClientOrderId: string;
        originalQuantity: number;
        remainingAtCancel: number;
        fillQuantity: number;
        buyPrice: number;
        placeAt: number;
        fillAt: number;
        fillId: string;
        fillVersion: string;
        cancelAt: number;
        tpOrderId: string;
        tpClientOrderId: string;
        tpPrice: number;
        tpQuantity: number;
        positionAfter: number;
        basisAfter: number;
      };
      const mirror = (price: number) => (sign > 0 ? price : 161100 - price);
      const base = tpPriceFixture(sign, f.cancelAt).snapshot;
      const fillAt = duringCancel ? f.cancelAt + 1 : f.fillAt;
      const entrySide = sign > 0 ? 'BUY' : 'SELL',
        exitSide = sign > 0 ? 'SELL' : 'BUY';
      const tp = {
        ...base.input.openOrders[0]!,
        venueOrderId: f.tpOrderId,
        clientOrderId: sign > 0 ? f.tpClientOrderId : 'd1b' + '7'.repeat(29),
        side: exitSide,
        price: mirror(f.tpPrice),
        quantity: f.tpQuantity,
      };
      const entry = buildDecibelExecutionIntentV1({
        sessionId: base.input.sessionId,
        cycleSequence: 0,
        action: 'PLACE',
        market: 'BTC/USD',
        side: entrySide,
        price: mirror(f.buyPrice),
        quantity: f.originalQuantity,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId: sign > 0 ? f.buyClientOrderId : 'd1s' + '8'.repeat(29),
        knownVenueOrderId: null,
        sourceStateHash: 'pid30680-place',
        strategyDecisionHash: 'pid30680-place',
        createdAt: f.placeAt,
      });
      let ledger = createDecibelActualFillLedgerV1([
        {
          venueOrderId: f.buyOrderId,
          localIntentId: entry.intentId,
          localExecutionRequestId: entry.clientOrderId,
          marketAddress: base.input.market,
          side: entrySide,
          requestedQuantity: f.originalQuantity,
        },
      ]);
      ledger = applyDecibelActualFillTruthV1(ledger, {
        venueFillId: f.fillId,
        venueOrderId: f.buyOrderId,
        localExecutionRequestId: entry.clientOrderId,
        marketAddress: base.input.market,
        side: entrySide,
        executedPrice: mirror(f.buyPrice),
        executedBaseQuantity: f.fillQuantity,
        executedUsdNotional: f.fillQuantity * mirror(f.buyPrice),
        makerOrTaker: 'MAKER',
        receivedAt: new Date(fillAt),
        venueTimestamp: new Date(fillAt),
        transactionVersion: f.fillVersion,
        fee: { availability: 'AVAILABLE', amount: 0.000362, currency: 'USD' },
        rebate: { availability: 'UNAVAILABLE', amount: null, currency: null },
        executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
      });
      let snapshot: decibel_production_live_snapshot_v1 = {
        ...base,
        maximumNotionalUsd: 72,
        // Drive this identity/finality replay with an independent exposure
        // breach, rather than a transient negative midpoint payoff.
        maximumAbsPositionBase: f.positionAfter + f.remainingAtCancel - base.input.metadata.lotSize,
        reductionCapacity: {
          maximumQuantityBtc: f.positionAfter,
          venueMaximumOrderNotionalUsd: null,
          observedAt: base.input.now,
        },
        authenticatedPositions: [
          {
            market: 'BTC/USD',
            size: sign * f.positionAfter,
            entryPrice: mirror(f.basisAfter),
            source: 'BOT',
          },
        ],
        input: {
          ...base.input,
          actualInventoryBase: sign * f.positionAfter,
          actualFillLedger: ledger,
          book: {
            bestBid: mirror(sign > 0 ? 80422 : 80422.1),
            bestAsk: mirror(sign > 0 ? 80422.1 : 80422),
            observedAt: base.input.now,
          },
          openOrders: [
            tp,
            {
              ...tp,
              venueOrderId: f.buyOrderId,
              clientOrderId: entry.clientOrderId,
              side: entrySide,
              price: entry.price,
              quantity: f.remainingAtCancel,
              reduceOnly: false,
            },
          ],
        },
        terminalOrderEvidence: [
          {
            venueOrderId: f.buyOrderId,
            clientOrderId: entry.clientOrderId,
            state: 'FILLED',
            originalQuantity: f.originalQuantity,
            remainingQuantity: f.remainingAtCancel,
          },
        ],
      };
      const Reader = {
        readOrderHistory: () => Promise.resolve([]),
        readTradeHistory: () => Promise.resolve([]),
      } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
      const Source = new decibel_production_live_state_source_v1(
        Reader,
        { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: '0x123' },
        () => snapshot.input.now,
      );
      const filledSnapshot = snapshot;
      const cancel = vi.fn(
        (request: Parameters<DecibelProductionWriteClientV1['cancelOrder']>[0]) => {
          // The entry residual first; afterwards only the TP, for a same-price upsize.
          if (request.orderId !== f.buyOrderId) {
            expect(request.orderId).toBe(tp.venueOrderId);
            return Promise.resolve({ success: true });
          }
          // The authenticated post-mutation read sees the fill even when the
          // cancel transport returns an unknown outcome.
          if (duringCancel)
            snapshot = {
              ...filledSnapshot,
              input: { ...filledSnapshot.input, now: fillAt },
            };
          if (outcome === 'UNKNOWN')
            return Promise.reject(new Error('SYNTHETIC_CANCEL_TRANSPORT_UNKNOWN'));
          return Promise.resolve({ success: true });
        },
      );
      const place = vi.fn(() => Promise.reject(Error('UNEXPECTED_COVERAGE_GAP_OR_DUPLICATE')));
      const Adapter = new decibel_external_production_executor_v1(() => ({
        client: { placeOrder: place, cancelOrder: cancel },
        subaccount: '0x123',
      }));
      const journalPath = join(mkdtempSync(join(tmpdir(), 'pid30680-')), 'journal.sqlite');
      const reconcile: NonNullable<Parameters<typeof make>[0]>['reconcileIntent'] = (...args) => {
        const body = test.journal.getIntent(args[0]);
        if (body?.action === 'CANCEL' && body.expectedPreviousVenueOrderId === f.buyOrderId) {
          expect(body.quantity).toBe(duringCancel ? f.originalQuantity : f.remainingAtCancel);
          expect(args[3]).toMatchObject({
            requestedQuantity: f.originalQuantity,
            createdAt: f.placeAt,
            clientOrderId: entry.clientOrderId,
            side: entrySide,
          });
        }
        return Source.reconcileIntent(...args);
      };
      const test = make({
        journalPath,
        readSnapshot: () => snapshot,
        executor: Adapter,
        reconcileIntent: reconcile,
        postMutationRead: true,
        cancelTargetState: 'ORDER_OPEN',
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      test.journal.prepare(entry);
      test.journal.transition(entry.intentId, 'ACKNOWLEDGED', f.placeAt + 100, f.buyOrderId);
      ownIncidentTP(test, snapshot);
      let closed = false;
      try {
        for (const change of [
          { clientOrderId: 'd1b' + 'f'.repeat(29) },
          { requestedQuantity: f.remainingAtCancel },
          { side: exitSide },
        ])
          await expect(
            Source.reconcileIntent('synthetic-conflict', snapshot, f.buyOrderId, {
              clientOrderId: entry.clientOrderId,
              createdAt: f.placeAt,
              transactionHash: null,
              requestedQuantity: f.originalQuantity,
              side: entrySide,
              ...change,
            }),
          ).rejects.toThrow('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
        if (duringCancel) {
          snapshot = {
            ...filledSnapshot,
            reductionCapacity: {
              ...filledSnapshot.reductionCapacity!,
              maximumQuantityBtc: f.tpQuantity,
            },
            authenticatedPositions: filledSnapshot.authenticatedPositions?.map((position) => ({
              ...position,
              size: sign * f.tpQuantity,
            })),
            terminalOrderEvidence: [],
            input: {
              ...filledSnapshot.input,
              actualInventoryBase: sign * f.tpQuantity,
              actualFillLedger: createDecibelActualFillLedgerV1([
                {
                  venueOrderId: f.buyOrderId,
                  localIntentId: entry.intentId,
                  localExecutionRequestId: entry.clientOrderId,
                  marketAddress: base.input.market,
                  side: entrySide,
                  requestedQuantity: f.originalQuantity,
                },
              ]),
              openOrders: filledSnapshot.input.openOrders.map((order) =>
                order.venueOrderId === f.buyOrderId
                  ? { ...order, quantity: f.originalQuantity }
                  : order,
              ),
            },
          };
        }
        const first = await test.orchestrator.evaluateOnce();
        expect(first.action, first.blocker ?? '').toBe(
          outcome === 'ACK' ? 'ACKNOWLEDGED' : 'RECONCILIATION_REQUIRED',
        );
        expect(cancel).toHaveBeenCalledOnce();
        const fresh = snapshot;
        snapshot = {
          ...snapshot,
          practicalCapacityInputs: {
            ...snapshot.practicalCapacityInputs!,
            accountObservedAt: snapshot.input.now - 5001,
          },
          input: {
            ...snapshot.input,
            book: { ...snapshot.input.book, observedAt: snapshot.input.now - 5001 },
          },
        };
        const stale = await test.orchestrator.evaluateOnce();
        expect(stale.exitCoverageWorkflow?.evidenceFresh).toBe(false);
        expect(cancel).toHaveBeenCalledOnce();
        expect(place).not.toHaveBeenCalled();
        snapshot = fresh;
        if (restartPending) {
          await test.orchestrator.close();
          closed = true;
          const pendingRestart = make({
            journalPath,
            readSnapshot: () => snapshot,
            executor: Adapter,
            reconcileIntent: (...args) => Source.reconcileIntent(...args),
            environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
          });
          try {
            const waiting = await pendingRestart.orchestrator.evaluateOnce();
            expect(waiting.blocker).toBe('PRODUCTION_RECONCILIATION_CANCEL_FINALITY_PENDING');
            expect(cancel).toHaveBeenCalledOnce();
            expect(place).not.toHaveBeenCalled();
          } finally {
            await pendingRestart.orchestrator.close();
          }
          return;
        }
        expect(place).not.toHaveBeenCalled();
        const pending = await test.orchestrator.evaluateOnce();
        expect(pending.blocker).toBe('PRODUCTION_RECONCILIATION_CANCEL_FINALITY_PENDING');
        expect(cancel).toHaveBeenCalledOnce();
        snapshot = {
          ...snapshot,
          input: { ...snapshot.input, openOrders: [tp] },
          terminalOrderEvidence: [
            {
              venueOrderId: f.buyOrderId,
              clientOrderId: entry.clientOrderId,
              state: 'CANCELLED',
              originalQuantity: f.originalQuantity,
              remainingQuantity: 0,
            },
          ],
        };
        // The entry cancel is final; the undersized TP is now cancelled once for a same-price
        // replacement (operator decision 2026-11-14), and nothing is placed before that
        // cancel is final.
        let repaired = await test.orchestrator.evaluateOnce();
        for (let cycle = 0; cycle < 4 && cancel.mock.calls.length < 2; cycle++)
          repaired = await test.orchestrator.evaluateOnce();
        expect(
          cancel.mock.calls.map((call) => call[0].orderId),
          JSON.stringify({ action: repaired.action, blocker: repaired.blocker }),
        ).toEqual([f.buyOrderId, tp.venueOrderId]);
        await test.orchestrator.evaluateOnce();
        expect(test.journal.getActiveIdentityConflict()).toBeNull();
        expect(cancel).toHaveBeenCalledTimes(2);
        expect(place).not.toHaveBeenCalled();
        await test.orchestrator.close();
        closed = true;
        const restarted = make({
          journalPath,
          readSnapshot: () => snapshot,
          executor: Adapter,
          reconcileIntent: (...args) => Source.reconcileIntent(...args),
          environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        });
        try {
          const resumed = await restarted.orchestrator.evaluateOnce();
          expect(resumed.blocker).toBe('PRODUCTION_RECONCILIATION_CANCEL_FINALITY_PENDING');
          expect(cancel).toHaveBeenCalledTimes(2);
          expect(place).not.toHaveBeenCalled();
        } finally {
          await restarted.orchestrator.close();
        }
      } finally {
        if (!closed) await test.orchestrator.close();
      }
    },
  );
  const pid18876Snapshot = (sign: number, profitable = false, quantity = 0.00045) => {
    const base = zeroCoverageIncident(sign);
    const bid = sign > 0 ? 77949.8 : 78847.5;
    const ask = bid + 0.9;
    const basis = profitable ? (sign > 0 ? 77200 : 79500) : 78399.1;
    return {
      ...base,
      maximumNotionalUsd: 37.46,
      maximumAbsPositionBase: 0.00095,
      maximumReductionNotionalUsd: quantity * ask,
      reductionCapacity: {
        maximumQuantityBtc: quantity,
        venueMaximumOrderNotionalUsd: null,
        observedAt: base.input.now,
      },
      authenticatedPositions: [
        { market: 'BTC/USD', size: sign * quantity, entryPrice: basis, source: 'BOT' as const },
      ],
      sessionConfiguration: {
        ...base.sessionConfiguration!,
        pnlUsd: -0.25,
        riskBlocker: null,
        exposureLimits: {
          ...base.sessionConfiguration!.exposureLimits!,
          effectivePositionLimitUsd: 75,
          availableHeadroomUsd: 37.46,
          capacityBlocker: null,
        },
      },
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs!,
        venueMarginRules: {
          ...base.practicalCapacityInputs!.venueMarginRules!,
          observedAt: base.input.now,
          markObservedAt: base.input.now,
        },
      },
      input: {
        ...base.input,
        actualInventoryBase: sign * quantity,
        openOrders: [],
        book: { bestBid: bid, bestAsk: ask, observedAt: base.input.now },
      },
    };
  };

  // A position opened about 16 minutes ago, 10.7 bps adverse (basis 75700), with candle
  // evidence that satisfies the adverse candle rule. `basis` overrides the entry basis.
  const ADAPTIVE_TP_OPENED_AGO_MS = 16 * 60_000;
  const adaptiveTPFixture = (
    sign = -1,
    now = 60000,
    openedAgoMs = ADAPTIVE_TP_OPENED_AGO_MS,
    basisOverride?: number,
  ): decibel_production_live_snapshot_v1 => {
    const base = pid18876Snapshot(sign, false, 0.00047);
    const mirror = (p: number) => (sign < 0 ? p : 151426.8 - p);
    const bid = sign < 0 ? 75781 : mirror(75781.1);
    const ask = sign < 0 ? 75781.1 : mirror(75781);
    const basis = basisOverride ?? (sign < 0 ? 75700 : mirror(75700));
    // Explicit synthetic opening fill and 35s continuous regime. The incident
    // journal frame did not contain this history; do not label it observed.
    const entry = {
      venueOrderId: 'patient-entry',
      localIntentId: 'patient-entry',
      localExecutionRequestId: 'patient-entry',
      marketAddress: base.input.market,
      side: sign < 0 ? ('SELL' as const) : ('BUY' as const),
      requestedQuantity: 0.00047,
    };
    const ledger = applyDecibelActualFillTruthV1(createDecibelActualFillLedgerV1([entry]), {
      venueFillId: 'patient-entry-fill',
      venueOrderId: entry.venueOrderId,
      localExecutionRequestId: entry.localExecutionRequestId,
      marketAddress: entry.marketAddress,
      side: entry.side,
      executedPrice: basis,
      executedBaseQuantity: 0.00047,
      executedUsdNotional: 0.00047 * basis,
      makerOrTaker: 'MAKER',
      receivedAt: new Date(now - openedAgoMs),
      venueTimestamp: new Date(now - openedAgoMs),
      fee: { availability: 'AVAILABLE', amount: 0.005337, currency: 'USD' },
      rebate: { availability: 'UNAVAILABLE', amount: null, currency: null },
      executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
    });
    const order = {
      ...tpPriceFixture(sign, now).action.current,
      quantity: 0.00047,
      price: mirror(75681.4),
    };
    // Candle rule evidence: the price has stayed at the maker, outside the 10 bps safe band
    // (basis 75700), for the last 15 minutes.
    const marketStructure = createDecibelMarketStructureV1(
      'BBO_FALLBACK',
      Array.from({ length: 16 }, (_, i) => ({
        at: now - (15 - i) * 60_000,
        midpoint: (bid + ask) / 2,
      })),
      now,
    );
    return {
      ...base,
      marketStructure,
      sourceStateHash: `adaptive-${sign}-${now}`,
      reductionCapacity: { ...base.reductionCapacity, observedAt: now },
      input: {
        ...base.input,
        now,
        book: { bestBid: bid, bestAsk: ask, observedAt: now },
        metadata: { ...base.input.metadata, observedAt: now },
        actualInventoryBase: sign * 0.00047,
        actualFillLedger: ledger,
        openOrders: [order],
      },
      authenticatedPositions: [
        { market: 'BTC/USD', size: sign * 0.00047, entryPrice: basis, source: 'BOT' },
      ],
      sessionConfiguration: {
        ...base.sessionConfiguration,
        maxLossUsd: 2,
        pnlUsd: -0.05,
        exitAccounting: {
          inventoryBase: sign * 0.00047,
          entryBasis: basis,
          realizedPnlAfterFeesUsd: -0.005337,
        },
      },
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs,
        accountObservedAt: now,
        marketObservedAt: now,
        bids: [{ price: bid, size: 1 }],
        asks: [{ price: ask, size: 1 }],
        recentMidpoints: [(bid + ask) / 2],
        tpRegimePrices: Array.from({ length: 36 }, (_, i) => ({
          observedAt: now - (36 - i) * 1000,
          midpoint: mirror(75740 + (i % 2) * 4),
        })),
        costObservations: base.practicalCapacityInputs.costObservations!.map((o) => ({
          ...o,
          observedAt: now,
          validUntil: now + 5000,
        })),
        venueMarginRules: {
          ...base.practicalCapacityInputs.venueMarginRules,
          observedAt: now,
          markObservedAt: now,
          markPrice: (bid + ask) / 2,
        },
      },
    };
  };

  // Venue candles that keep the price at the snapshot midpoint for the last 15 minutes, so
  // the orchestrator's own market structure satisfies the adverse candle rule.
  const adverseCandles = (snapshot: decibel_production_live_snapshot_v1) => () => {
    const midpoint = (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2;
    const minute = 60_000;
    const last = Math.floor(snapshot.input.now / minute) * minute - minute;
    return Array.from({ length: 15 }, (_, i) => ({
      start: last - (14 - i) * minute,
      open: midpoint,
      high: midpoint,
      low: midpoint,
      close: midpoint,
    }));
  };

  it.each([1, -1])(
    'PID36848 patient TP authorizes a partial recovery step, not best maker (%s)',
    async (sign) => {
      const snapshot = adaptiveTPFixture(sign);
      const side = sign < 0 ? 'BUY' : 'SELL';
      const maker = side === 'BUY' ? snapshot.input.book.bestBid : snapshot.input.book.bestAsk;
      const price = constructDecibelAdaptiveTPPriceV1(snapshot, side, 0.00047, maker).price!;
      expect(price).not.toBe(maker);
      expect(assessDecibelAdaptiveTPV1(snapshot, side, maker).allowed).toBe(false);
      const policy = assessDecibelAdaptiveTPV1(snapshot, side, price);
      expect(policy).toMatchObject({ mode: 'ADVERSE_EXIT_REPRICE', allowed: true });
      expect(policy.projectedSessionPnlUsd).toBeGreaterThan(-0.1);
      expect(policy.projectedSessionPnlUsd).toBeLessThan(0);
      expect(assessDecibelTPActionV1(snapshot, side, 0.00047, price)).toBeNull();
      const constructed = constructDecibelAdaptiveTPPriceV1(snapshot, side, 0.00047, price);
      expect(constructed.price).toBeCloseTo(price, 8);
      const test = make({
        readSnapshot: () => snapshot,
        reconciliationState: 'ORDER_OPEN',
        exchangeCandles: adverseCandles(snapshot),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      ownIncidentTP(test, snapshot);
      try {
        let result = await test.orchestrator.evaluateOnce();
        if (result.action === 'RECONCILE_ONLY') result = await test.orchestrator.evaluateOnce();
        expect(
          result.action,
          JSON.stringify({ blocker: result.blocker, evaluation: result.evaluation }),
        ).toBe('ACKNOWLEDGED');
        expect(test.submitted()).toEqual([{ action: 'CANCEL', side }]);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  const movePatientMarket = (snapshot: decibel_production_live_snapshot_v1, maker: number) => {
    const now = snapshot.input.now + 1000;
    const short = snapshot.input.actualInventoryBase < 0;
    const spread = snapshot.input.book.bestAsk - snapshot.input.book.bestBid;
    const practical = snapshot.practicalCapacityInputs!;
    return {
      ...snapshot,
      sourceStateHash: `patient-${now}-${maker}`,
      input: {
        ...snapshot.input,
        now,
        metadata: { ...snapshot.input.metadata, observedAt: now },
        book: {
          bestBid: short ? maker : maker - spread,
          bestAsk: short ? maker + spread : maker,
          observedAt: now,
        },
      },
      practicalCapacityInputs: {
        ...practical,
        accountObservedAt: now,
        marketObservedAt: now,
        tpRegimePrices: [
          ...practical.tpRegimePrices!,
          {
            observedAt: snapshot.input.book.observedAt,
            midpoint: (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2,
          },
        ],
        costObservations: practical.costObservations!.map((o) => ({
          ...o,
          observedAt: now,
          validUntil: now + 5000,
        })),
      },
    } satisfies decibel_production_live_snapshot_v1;
  };

  it.each([1, -1])(
    'Candle rule moves the TP only after two closed 5-minute candles outside the band (%s)',
    (sign) => {
      const side = sign < 0 ? 'BUY' : 'SELL';
      const direction = sign < 0 ? 1 : -1;
      const mirror = (p: number) => (sign < 0 ? p : 151426.8 - p);
      const minute = 60_000;
      const now = 1_800_000_000_000 + 2 * minute;
      const fixture = adaptiveTPFixture(sign, now);
      const base = {
        ...fixture,
        input: {
          ...fixture.input,
          // A TP well inside profit, so break-even leaves room for the first step.
          openOrders: [{ ...fixture.input.openOrders[0]!, price: mirror(75650) }],
        },
      };
      // 18 bps adverse (maker 75850 vs basis 75713.4); 6 bps range -> 10 bps safe band.
      const far = (outsideMinutes: number, snapshot = base) => {
        const moved = movePatientMarket(snapshot, mirror(75850));
        return {
          ...moved,
          priceRangeBps: 6,
          marketStructure: createDecibelMarketStructureV1(
            'BBO_FALLBACK',
            Array.from({ length: 15 }, (_, i) => {
              const minutesAgo = 14 - i;
              return {
                at: moved.input.now - minutesAgo * minute,
                midpoint: minutesAgo <= outsideMinutes ? mirror(75850) : mirror(75720),
              };
            }),
            moved.input.now,
          ),
        };
      };
      // Outside for 4 minutes: only one candle has closed.
      expect(planDecibelPatientTPV1(far(4), side).reason).toBe('TP_ADVERSE_AWAITING_CANDLE_CLOSES');
      // Outside for 9 minutes: two closes, the first step goes to break-even.
      const ready = far(9);
      const breakEven = getDecibelBreakEvenTPPriceV1(ready, side)!;
      const first = planDecibelPatientTPV1(ready, side);
      expect(first).toMatchObject({
        reason: 'REPRICE:TP_ADVERSE_EXIT_REPRICE',
        targetPrice: breakEven,
      });
      expect(assessDecibelAdaptiveTPV1(ready, side, breakEven).allowed).toBe(true);
      // Right after the step: two new closes are needed again.
      const atBreakEven = {
        ...base,
        tpAdverseProgress: first.authorization,
        input: { ...base.input, openOrders: [{ ...base.input.openOrders[0]!, price: breakEven }] },
      };
      expect(planDecibelPatientTPV1(far(14, atBreakEven), side).reason).toBe(
        'TP_ADVERSE_AWAITING_CANDLE_CLOSES',
      );
      // Two closes after the step: the TP rests the rescue offset from the maker.
      const later = {
        ...atBreakEven,
        tpAdverseProgress: {
          ...first.authorization!,
          observedAt: first.authorization!.observedAt - 9 * minute,
        },
      };
      const rescue = planDecibelPatientTPV1(far(14, later), side);
      expect(rescue.reason).toBe('REPRICE:TP_ADVERSE_EXIT_REPRICE');
      expect(direction * (rescue.targetPrice! - breakEven)).toBeGreaterThan(0);
      // Back inside the band: no step.
      const inside = {
        ...far(9),
        marketStructure: createDecibelMarketStructureV1('BBO_FALLBACK', [], now),
      };
      expect(
        planDecibelPatientTPV1(
          {
            ...movePatientMarket(base, mirror(75760)),
            priceRangeBps: 6,
            marketStructure: createDecibelMarketStructureV1('BBO_FALLBACK', [], now),
          },
          side,
        ).reason,
      ).toBe('TP_ADVERSE_INSIDE_SAFE_BAND');
      expect(planDecibelPatientTPV1(inside, side).reason).toBe('TP_ADVERSE_AWAITING_CANDLE_CLOSES');
      // Fallback: at break-even for three closes since the step, the rescue step is allowed
      // even though the price came back inside the band two minutes ago.
      const choppy = (snapshot: decibel_production_live_snapshot_v1) => {
        const moved = far(14, snapshot);
        return {
          ...moved,
          marketStructure: createDecibelMarketStructureV1(
            'BBO_FALLBACK',
            moved.marketStructure.samples.map((sample) =>
              sample.at === moved.input.now - 2 * minute
                ? { ...sample, midpoint: mirror(75720) }
                : sample,
            ),
            moved.input.now,
          ),
        };
      };
      const stale = {
        ...atBreakEven,
        tpAdverseProgress: {
          ...first.authorization!,
          observedAt: first.authorization!.observedAt - 31 * minute,
        },
      };
      const fallback = planDecibelPatientTPV1(choppy(stale), side);
      expect(fallback.reason).toBe('REPRICE:TP_ADVERSE_EXIT_REPRICE');
      expect(direction * (fallback.targetPrice! - breakEven)).toBeGreaterThan(0);
      const notYet = {
        ...atBreakEven,
        tpAdverseProgress: {
          ...first.authorization!,
          observedAt: first.authorization!.observedAt - 10 * minute,
        },
      };
      expect(planDecibelPatientTPV1(choppy(notYet), side).reason).toBe(
        'TP_ADVERSE_AWAITING_CANDLE_CLOSES',
      );
    },
  );

  it.each([1, -1])(
    'places one wide catastrophe stop for an open position after the cycle (%s)',
    async (sign) => {
      const stops: Array<{ side: 'BUY' | 'SELL'; triggerPrice: number; limitPrice: number }> = [];
      const fixture = { ...adaptiveTPFixture(sign), catastropheStop: null };
      const executor: DecibelProductionExecutionExecutorV1 = {
        placePostOnlyLimit: () => Promise.resolve({ outcome: 'PLACE_OUTCOME_UNKNOWN' }),
        cancelExactOrder: () => Promise.resolve({ outcome: 'CANCEL_OUTCOME_UNKNOWN' }),
        placeCatastropheStop: (request) => {
          stops.push(request);
          return Promise.resolve({ outcome: 'STOP_SUBMITTED', transactionHash: '0xstop' });
        },
      };
      const test = make({
        readSnapshot: () => fixture,
        executor,
        reconciliationState: 'ORDER_OPEN',
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      ownIncidentTP(test, fixture);
      try {
        for (let cycle = 0; cycle < 3 && stops.length === 0; cycle++)
          await test.orchestrator.evaluateOnce();
        expect(stops).toHaveLength(1);
        const basis = 75713.4;
        const stop = stops[0]!;
        expect(stop.side).toBe(sign > 0 ? 'SELL' : 'BUY');
        // At least 2% beyond the entry, limit further beyond the trigger.
        expect((sign * (basis - stop.triggerPrice)) / basis).toBeGreaterThanOrEqual(0.02 - 1e-9);
        expect(sign * (stop.triggerPrice - stop.limitPrice)).toBeGreaterThan(0);
        // Within the retry interval, and once the venue reports the stop, nothing more is sent.
        await test.orchestrator.evaluateOnce();
        expect(stops).toHaveLength(1);
        expect(test.orchestrator.CatastropheStopStatus).toBe('CATASTROPHE_STOP_MISSING');
      } finally {
        await test.orchestrator.close();
      }
      const protectedTest = make({
        readSnapshot: () => ({
          ...fixture,
          catastropheStop: { venueOrderId: 'sl', triggerPrice: 1, limitPrice: null },
        }),
        executor,
        reconciliationState: 'ORDER_OPEN',
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      ownIncidentTP(protectedTest, fixture);
      try {
        await protectedTest.orchestrator.evaluateOnce();
        expect(stops).toHaveLength(1);
      } finally {
        await protectedTest.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    'Patient TP keeps mild adverse movement and one-tick candidate noise (%s)',
    (sign) => {
      const base = adaptiveTPFixture(sign);
      const side = sign < 0 ? 'BUY' : 'SELL';
      const basis = base.authenticatedPositions![0]!.entryPrice!;
      const direction = sign < 0 ? 1 : -1;
      for (const delta of [0, 0.1, 3, 8]) {
        const snapshot = movePatientMarket(base, basis + direction * delta);
        expect(planDecibelPatientTPV1(snapshot, side).adjustmentReady).toBe(false);
        expect(constructDecibelAdaptiveTPPriceV1(snapshot, side, 0.00047, basis).price).toBe(
          base.input.openOrders[0]!.price,
        );
      }
    },
  );

  it('Patient TP keeps coverage when representative regime or position epoch is unavailable', () => {
    const base = adaptiveTPFixture();
    const cases = [
      {
        ...base,
        practicalCapacityInputs: { ...base.practicalCapacityInputs!, tpRegimePrices: [] },
      },
      {
        ...base,
        practicalCapacityInputs: {
          ...base.practicalCapacityInputs!,
          tpRegimePrices: base.practicalCapacityInputs!.tpRegimePrices!.slice(-3),
        },
      },
      { ...base, input: { ...base.input, actualFillLedger: createDecibelActualFillLedgerV1([]) } },
      { ...base, input: { ...base.input, book: { ...base.input.book, observedAt: 0 } } },
    ];
    for (const snapshot of cases)
      expect(constructDecibelAdaptiveTPPriceV1(snapshot, 'BUY', 0.00047, 75781).price).toBe(
        base.input.openOrders[0]!.price,
      );
  });

  it.each([1, -1])('Patient TP recovers a continuous regime after an older gap (%s)', (sign) => {
    const base = adaptiveTPFixture(sign);
    const side = sign < 0 ? 'BUY' : 'SELL';
    const points = base.practicalCapacityInputs!.tpRegimePrices!;
    const interrupted = {
      ...base,
      practicalCapacityInputs: {
        ...base.practicalCapacityInputs!,
        tpRegimePrices: [
          { observedAt: base.input.now - 59000, midpoint: points[0]!.midpoint },
          ...points.slice(-3),
        ],
      },
    };
    expect(planDecibelPatientTPV1(interrupted, side).movementBandUsd).toBeNull();
    expect(planDecibelPatientTPV1(interrupted, side).targetPrice).toBeNull();
    const recovered = {
      ...interrupted,
      practicalCapacityInputs: {
        ...interrupted.practicalCapacityInputs,
        tpRegimePrices: [
          { observedAt: base.input.now - 59000, midpoint: points[0]!.midpoint },
          ...points,
        ],
      },
    };
    expect(planDecibelPatientTPV1(recovered, side)).toEqual(planDecibelPatientTPV1(base, side));
    expect(planDecibelPatientTPV1(recovered, side).adjustmentReady).toBe(true);
    expect(constructDecibelAdaptiveTPPriceV1(recovered, side, 0.00047, 75781).price).toBe(
      constructDecibelAdaptiveTPPriceV1(base, side, 0.00047, 75781).price,
    );
  });

  it.each([1, -1])(
    'Patient TP distinguishes intentional KEEP from missing candidate evidence (%s)',
    (sign) => {
      const base = adaptiveTPFixture(sign);
      const side = sign < 0 ? 'BUY' : 'SELL';
      const basis = base.authenticatedPositions![0]!.entryPrice!;
      const mild = movePatientMarket(base, basis + (sign < 0 ? 1 : -1) * 3);
      const current = mild.input.openOrders[0]!;
      const action = { action: 'NO_OP' as const, side, current, desired: null, reason: 'HOLD' };
      const review = evaluateDecibelTPPriceSuitabilityV1(action, mild, null, 0, 0)!;
      expect(review.TP_REPRICE_REASON).toBe('KEEP:TP_ADVERSE_INSIDE_SAFE_BAND');
      expect(review.TP_PRICE_SUITABILITY).toBe('KEEP');
      expect(review.TP_ADVERSE_MOVEMENT_BAND_USD).toBeGreaterThan(0);
      const missing = {
        ...mild,
        practicalCapacityInputs: { ...mild.practicalCapacityInputs, tpRegimePrices: [] },
      };
      const unavailable = evaluateDecibelTPPriceSuitabilityV1(action, missing, null, 0, 0)!;
      expect(unavailable.TP_REPRICE_REASON).toBe('KEEP:TP_ADVERSE_REPRESENTATIVE_REGIME_REQUIRED');
      expect(unavailable.TP_PRICE_SUITABILITY).toBe('UNKNOWN');
      expect(unavailable.TP_ADVERSE_MOVEMENT_BAND_USD).toBeNull();
      expect(evaluateDecibelTPPriceSuitabilityV1(action, mild, null, 0, 0)).toEqual(review);
    },
  );

  it('Patient TP rejects rounding-sized steps even after the first adverse trigger', () => {
    const base = adaptiveTPFixture();
    const band = planDecibelPatientTPV1(base, 'BUY').movementBandUsd;
    const maker = 75713.4 + band + 0.2;
    const snapshot = {
      ...base,
      input: { ...base.input, book: { ...base.input.book, bestBid: maker, bestAsk: maker + 0.1 } },
    };
    expect(planDecibelPatientTPV1(snapshot, 'BUY').movementBandUsd).toBe(band);
    expect(
      constructDecibelAdaptiveTPPriceV1(snapshot, 'BUY', 0.00047, snapshot.input.book.bestBid)
        .price,
    ).toBe(base.input.openOrders[0]!.price);
  });

  it('Patient TP cannot strategically cancel a TP without verified strategy ownership', async () => {
    const base = adaptiveTPFixture();
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        openOrders: [{ ...base.input.openOrders[0]!, clientOrderId: 'foreign-order' }],
      },
    };
    const test = make({
      readSnapshot: () => snapshot,
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      reconciliationState: 'ORDER_OPEN',
    });
    try {
      for (let i = 0; i < 3; i++) await test.orchestrator.evaluateOnce();
      expect(test.submitted().filter((row) => row.action === 'CANCEL')).toHaveLength(0);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('Patient TP retains adverse progress across journal reopen, reconciliation and session identity refresh', async () => {
    const base = adaptiveTPFixture();
    const plan = planDecibelPatientTPV1(base, 'BUY');
    const path = join(mkdtempSync(join(tmpdir(), 'patient-progress-')), 'journal.sqlite');
    let test = make({ journalPath: path, readSnapshot: () => base });
    const intent = buildDecibelExecutionIntentV1({
      sessionId: base.input.sessionId,
      cycleSequence: 1,
      action: 'CANCEL',
      market: 'BTC/USD',
      side: 'BUY',
      price: base.input.openOrders[0]!.price,
      quantity: 0.00047,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: base.input.openOrders[0]!.clientOrderId,
      knownVenueOrderId: base.input.openOrders[0]!.venueOrderId,
      sourceStateHash: base.sourceStateHash,
      strategyDecisionHash: 'patient',
      createdAt: base.input.now,
      cancelReason: 'REPRICE:TP_ADVERSE_EXIT_REPRICE',
      tpAdverseProgress: plan.authorization!,
    });
    test.journal.prepare(intent);
    test.journal.transition(intent.intentId, 'APPLIED', base.input.now);
    await test.orchestrator.close();
    const snapshot = {
      ...base,
      input: {
        ...base.input,
        openOrders: [
          {
            ...base.input.openOrders[0]!,
            venueOrderId: 'patient-replacement',
            price: plan.targetPrice!,
          },
        ],
      },
    };
    expect(
      getDecibelTPPositionKeyV1({
        ...snapshot,
        input: { ...snapshot.input, sessionId: 'recovered-session' },
      }),
    ).toBe(getDecibelTPPositionKeyV1(base));
    test = make({
      journalPath: path,
      readSnapshot: () => snapshot,
      reconciliationState: 'ORDER_OPEN',
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
    });
    ownIncidentTP(test, snapshot);
    try {
      expect(test.journal.getTPAdverseProgress(getDecibelTPPositionKeyV1(base)!)).toEqual(
        plan.authorization,
      );
      for (let i = 0; i < 5; i++) await test.orchestrator.evaluateOnce();
      expect(test.calls()).toBe(0);
      expect(test.orchestrator.getLatestSnapshot()!.tpAdverseProgress?.anchorPrice).toBe(
        plan.authorization!.anchorPrice,
      );
    } finally {
      await test.orchestrator.close();
    }
  });

  it('Patient TP retires the previous epoch on flat and does not attach it to a new opening fill', () => {
    const base = adaptiveTPFixture();
    const key = getDecibelTPPositionKeyV1(base);
    const flat = { ...base, input: { ...base.input, actualInventoryBase: 0 } };
    expect(getDecibelTPPositionKeyV1(flat)).toBeNull();
    const ledger = base.input.actualFillLedger;
    const newer = {
      ...base,
      tpAdverseProgress: planDecibelPatientTPV1(base, 'BUY').authorization,
      input: {
        ...base.input,
        actualFillLedger: {
          ...ledger,
          fills: ledger.fills.map((f) => ({ ...f, venueFillId: 'new-opening-fill' })),
          applications: ledger.applications.map((a) => ({
            ...a,
            applicationId: 'new-epoch',
            venueFillId: 'new-opening-fill',
          })),
        },
      },
    };
    expect(getDecibelTPPositionKeyV1(newer)).not.toBe(key);
    expect(planDecibelPatientTPV1(newer, 'BUY').authorization!.positionKey).not.toBe(key);
  });

  it.each([
    'NORMAL',
    'PARTIAL',
    'PARTIAL_COVERAGE',
    'RESTART',
    'STALE',
    'BUDGET_CHANGED',
    'ACK_UNKNOWN',
  ] as const)('PID36848 cancel/finality/fresh maker coverage lifecycle %s', async (scenario) => {
    let snapshot = adaptiveTPFixture();
    if (scenario === 'PARTIAL_COVERAGE')
      snapshot = {
        ...snapshot,
        input: {
          ...snapshot.input,
          openOrders: [{ ...snapshot.input.openOrders[0]!, quantity: 0.0003 }],
        },
      };
    const partialTarget = constructDecibelAdaptiveTPPriceV1(snapshot, 'BUY', 0.00047, 75768).price!;
    let terminal = false;
    const journalPath = join(mkdtempSync(join(tmpdir(), 'adaptive-tp-')), 'journal.sqlite');
    let test = make({
      journalPath,
      readSnapshot: () => snapshot,
      reconcileIntent: (id) =>
        Promise.resolve(
          test.journal.getIntent(id)?.action === 'CANCEL'
            ? terminal
              ? 'ORDER_CANCELLED'
              : 'ORDER_OPEN'
            : 'ORDER_OPEN',
        ),
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      cancelOutcome: scenario === 'ACK_UNKNOWN' ? 'CANCEL_OUTCOME_UNKNOWN' : 'CANCEL_CONFIRMED',
      exchangeCandles: adverseCandles(snapshot),
    });
    const current = snapshot.input.openOrders[0]!;
    ownIncidentTP(test, snapshot);
    try {
      let result = await test.orchestrator.evaluateOnce();
      if (result.action === 'RECONCILE_ONLY') result = await test.orchestrator.evaluateOnce();
      expect(
        result.action,
        JSON.stringify({
          blocker: result.blocker,
          actions: result.evaluation?.actions,
          tp: result.tpPricing,
        }),
      ).toBe(scenario === 'ACK_UNKNOWN' ? 'RECONCILIATION_REQUIRED' : 'ACKNOWLEDGED');
      expect(test.submitted()).toEqual([{ action: 'CANCEL', side: 'BUY' }]);
      for (let i = 0; i < 3; i++) await test.orchestrator.evaluateOnce();
      expect(test.calls()).toBe(1); // A confirmed submission is not venue finality.
      if (scenario === 'ACK_UNKNOWN') return;
      terminal = true;
      const qty = scenario === 'PARTIAL' ? 0.0003 : 0.00047;
      let residualLedger = snapshot.input.actualFillLedger;
      if (scenario === 'PARTIAL') {
        const reduction = {
          ...residualLedger.orders[0]!,
          venueOrderId: 'patient-partial',
          localIntentId: 'patient-partial',
          localExecutionRequestId: 'patient-partial',
          side: 'BUY' as const,
          requestedQuantity: 0.00017,
        };
        residualLedger = applyDecibelActualFillTruthV1(
          { ...residualLedger, orders: [...residualLedger.orders, reduction] },
          {
            ...residualLedger.fills[0]!,
            venueFillId: 'patient-partial-fill',
            venueOrderId: reduction.venueOrderId,
            localExecutionRequestId: reduction.localExecutionRequestId,
            side: 'BUY',
            executedPrice: current.price,
            executedBaseQuantity: 0.00017,
            executedUsdNotional: current.price * 0.00017,
            receivedAt: new Date(snapshot.input.now),
            fee: { availability: 'AVAILABLE', amount: 0, currency: 'USD' },
          },
        );
      }
      snapshot = {
        ...snapshot,
        input: {
          ...snapshot.input,
          actualInventoryBase: -qty,
          actualFillLedger: residualLedger,
          openOrders: [],
          book: {
            ...snapshot.input.book,
            observedAt: scenario === 'STALE' ? 0 : snapshot.input.now,
          },
        },
        authenticatedPositions: snapshot.authenticatedPositions!.map((p) => ({
          ...p,
          size: -qty,
        })),
        reductionCapacity: { ...snapshot.reductionCapacity!, maximumQuantityBtc: qty },
        sessionConfiguration: {
          ...snapshot.sessionConfiguration!,
          maxLossUsd: scenario === 'BUDGET_CHANGED' ? 0.002 : 2,
          pnlUsd: scenario === 'BUDGET_CHANGED' ? -0.001 : -0.05,
          exitAccounting: {
            ...snapshot.sessionConfiguration!.exitAccounting!,
            inventoryBase: -qty,
          },
        },
        terminalOrderEvidence: [
          {
            venueOrderId: current.venueOrderId,
            clientOrderId: current.clientOrderId,
            state: 'CANCELLED',
            originalQuantity: current.quantity,
            remainingQuantity: 0,
          },
        ],
      };
      reconcileDecibelAcknowledgedTerminalOrdersV1(test.journal, snapshot);
      const preRestartCalls = test.calls();
      if (scenario === 'RESTART') {
        await test.orchestrator.close();
        test = make({
          journalPath,
          readSnapshot: () => snapshot,
          reconciliationState: 'ORDER_OPEN',
          environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        });
      }
      for (let i = 0; i < 6; i++) {
        result = await test.orchestrator.evaluateOnce();
        if (test.submitted().some((x) => x.action === 'PLACE')) break;
      }
      if (scenario === 'STALE') {
        expect(test.calls()).toBe(preRestartCalls);
        snapshot = {
          ...snapshot,
          sourceStateHash: 'adaptive-market-refreshed',
          input: {
            ...snapshot.input,
            book: { ...snapshot.input.book, observedAt: snapshot.input.now },
          },
        };
        for (let i = 0; i < 4; i++) {
          result = await test.orchestrator.evaluateOnce();
          if (test.submitted().some((x) => x.action === 'PLACE')) break;
        }
      }
      expect(
        test.submitted().filter((x) => x.action === 'PLACE'),
        JSON.stringify({
          action: result.action,
          blocker: result.blocker,
          bid: result.evaluation?.bidEligibilityReason,
        }),
      ).toHaveLength(1);
      const place = test.journal.getIntent(result.intentId!)!;
      expect(place).toMatchObject({
        action: 'PLACE',
        side: 'BUY',
        reduceOnly: true,
        quantity: qty,
        timeInForce: 'PostOnly',
      });
      if (scenario === 'BUDGET_CHANGED') {
        expect(
          assessDecibelExitEconomicsV1(snapshot, 'BUY', qty, place.price).netPnlUsd,
        ).toBeGreaterThanOrEqual(0);
      } else expect(place.price).toBe(partialTarget);
      const calls = test.calls();
      for (let i = 0; i < 3; i++) await test.orchestrator.evaluateOnce();
      expect(test.calls()).toBe(calls);
    } finally {
      await test.orchestrator.close();
    }
  });

  it('PID36848 replays the recorded journal frame and authenticated residual costs', () => {
    const f = JSON.parse(
      readFileSync(new URL('./fixtures/adaptive_tp_36848_v1.json', import.meta.url), 'utf8'),
    ) as {
      timestamp: number;
      entryBasis: number;
      positionBase: number;
      restingTP: number;
      bestBid: number;
      bestAsk: number;
      makerFeeBps: number;
      estimatedGasCostUsd: number;
      safetyMarginBps: number;
      authenticatedResidualEntryFeeUsd: number;
      restingNetPnlUsd: number;
      oldCandidate: number;
      oldCandidateNetPnlUsd: number;
      newMakerNetPnlUsd: number;
    };
    const base = adaptiveTPFixture(-1, f.timestamp, undefined, f.entryBasis);
    // Aggregate reconstruction, explicitly not a claim to replay original fills.
    const order = {
      venueOrderId: 'aggregate-entry',
      localIntentId: 'aggregate-entry',
      localExecutionRequestId: 'aggregate-entry',
      marketAddress: base.input.market,
      side: 'SELL' as const,
      requestedQuantity: -f.positionBase,
    };
    const ledger = applyDecibelActualFillTruthV1(createDecibelActualFillLedgerV1([order]), {
      venueFillId: 'aggregate-fill',
      venueOrderId: order.venueOrderId,
      localExecutionRequestId: order.localExecutionRequestId,
      marketAddress: base.input.market,
      side: 'SELL',
      executedPrice: f.entryBasis,
      executedBaseQuantity: -f.positionBase,
      executedUsdNotional: -f.positionBase * f.entryBasis,
      makerOrTaker: 'MAKER',
      // Past the break-even hold: this replays the post-hold adverse step.
      receivedAt: new Date(f.timestamp - ADAPTIVE_TP_OPENED_AGO_MS),
      venueTimestamp: new Date(f.timestamp - ADAPTIVE_TP_OPENED_AGO_MS),
      transactionVersion: '123',
      fee: {
        availability: 'AVAILABLE',
        amount: f.authenticatedResidualEntryFeeUsd,
        currency: 'USD',
      },
      rebate: { availability: 'UNAVAILABLE', amount: null, currency: null },
      executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
    });
    const snapshot: decibel_production_live_snapshot_v1 = {
      ...base,
      economicInputs: {
        ...base.economicInputs!,
        makerFeeBps: f.makerFeeBps,
        estimatedGasCostUsd: f.estimatedGasCostUsd,
        safetyMarginBps: f.safetyMarginBps,
      },
      input: {
        ...base.input,
        actualFillLedger: ledger,
        book: { bestBid: f.bestBid, bestAsk: f.bestAsk, observedAt: f.timestamp },
      },
    };
    const net = (p: number) =>
      assessDecibelExitEconomicsV1(snapshot, 'BUY', -f.positionBase, p).netPnlUsd;
    expect(net(f.restingTP)).toBeCloseTo(f.restingNetPnlUsd, 12);
    expect(net(f.oldCandidate)).toBeCloseTo(f.oldCandidateNetPnlUsd, 12);
    expect(net(f.bestBid)).toBeCloseTo(f.newMakerNetPnlUsd, 12);
  });

  it('PID36848 scopes TP blockers to reductions and reopens normal admission after verified flat', async () => {
    const base = adaptiveTPFixture();
    const snapshot = {
      ...base,
      sessionConfiguration: { ...base.sessionConfiguration!, exitAccounting: null },
    };
    const test = make({ readSnapshot: () => snapshot });
    try {
      const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
      const decision = evaluateTradingDecision(snapshot, {
        now: snapshot.input.now,
        sessionId: snapshot.input.sessionId,
        state: 'RUNNING',
        evaluation,
      });
      expect(decision.actionPlan.SELL.kind).toBe('OPEN');
      expect(decision.actionPlan.SELL.eligible).toBe(false);
      expect(decision.actionPlan.SELL.reason).not.toMatch(/^TP_/);
      expect(decision.sideDiagnostics.ASK_BLOCKER).not.toMatch(/^TP_/);
      const flat = twoSidedSnapshot(0);
      const flatEvaluation = test.orchestrator.evaluateAuthenticatedSnapshot(flat);
      const admitted = evaluateTradingDecision(flat, {
        now: flat.input.now,
        sessionId: flat.input.sessionId,
        state: 'RUNNING',
        evaluation: flatEvaluation,
      });
      expect(admitted.bidEligible, admitted.primaryReason).toBe(true);
      expect(admitted.askEligible, admitted.primaryReason).toBe(true);
      expect(admitted.actionPlan.BUY.kind).toBe('OPEN');
    } finally {
      await test.orchestrator.close();
    }
  });

  it('PID36848 budgets full residual once without double charging marked loss or paid entry fee', () => {
    const base = adaptiveTPFixture();
    const snapshot = {
      ...base,
      sessionConfiguration: { ...base.sessionConfiguration!, maxLossUsd: 0.045, pnlUsd: -0.04 },
    };
    const price = planDecibelPatientTPV1(snapshot, 'BUY').targetPrice!;
    const policy = assessDecibelAdaptiveTPV1(snapshot, 'BUY', price);
    const costs = assessDecibelExitEconomicsV1(snapshot, 'BUY', 0.00047, price).breakdown!;
    expect(policy.allowed).toBe(true);
    expect(policy.projectedSessionPnlUsd).toBeCloseTo(
      -0.005337 +
        costs.grossPnlUsd -
        costs.exitFeeReserveUsd -
        costs.transactionGasReserveUsd -
        costs.safetyReserveUsd,
      12,
    );
    const exhausted = {
      ...snapshot,
      sessionConfiguration: { ...snapshot.sessionConfiguration, maxLossUsd: 0.002, pnlUsd: -0.001 },
    };
    expect(assessDecibelTPActionV1(exhausted, 'BUY', 0.00002, price)).toContain(
      'LOSS_BUDGET_EXCEEDED',
    );
  });

  it.each(['BUDGET', 'MAX_LOSS', 'STALE', 'BASIS', 'QUANTITY', 'FEES', 'UNRESOLVED'] as const)(
    'PID36848 adaptive TP rejects unsafe %s evidence',
    (fault) => {
      const base = adaptiveTPFixture();
      const snapshot: decibel_production_live_snapshot_v1 = {
        ...base,
        sessionConfiguration: {
          ...base.sessionConfiguration!,
          maxLossUsd: fault === 'BUDGET' ? 0.01 : 2,
          pnlUsd: fault === 'MAX_LOSS' ? -2 : -0.05,
          exitAccounting: {
            ...base.sessionConfiguration!.exitAccounting!,
            entryBasis: fault === 'BASIS' ? 75700 : 75713.4,
            inventoryBase: fault === 'QUANTITY' ? -0.00048 : -0.00047,
          },
        },
        practicalCapacityInputs: {
          ...base.practicalCapacityInputs!,
          costObservations: fault === 'FEES' ? [] : base.practicalCapacityInputs!.costObservations,
        },
        input: {
          ...base.input,
          book: { ...base.input.book, observedAt: fault === 'STALE' ? 0 : base.input.now },
          unresolvedExecutionPlanCount: fault === 'UNRESOLVED' ? 1 : 0,
        },
      };
      if (fault === 'UNRESOLVED') {
        const current = snapshot.input.openOrders[0]!;
        expect(
          evaluateDecibelTPPriceSuitabilityV1(
            {
              action: 'WOULD_REPLACE',
              side: 'BUY',
              current,
              desired: {
                ...current,
                generation: 1,
                strategyConfigId: snapshot.input.strategyConfigId,
                price: 75768,
              },
              reason: 'TP_PRICE_REVIEW_REQUIRED',
            },
            snapshot,
            0,
            0,
            0,
          )?.TP_REPRICE_DECISION,
        ).toBe('KEEP');
      } else expect(assessDecibelAdaptiveTPV1(snapshot, 'BUY', 75768).allowed).toBe(false);
    },
  );

  it.each([0.1, 13])(
    'PID36848 spread/movement hysteresis soaks 10000 frames without reverse or tick churn (spread %s)',
    (spread) => {
      let snapshot = adaptiveTPFixture();
      let price = 75681.4;
      let replacements = 0;
      for (let i = 0; i < 10000; i++) {
        const bid = 75810 + (i % 2 ? 0.1 : 0);
        snapshot = {
          ...snapshot,
          input: {
            ...snapshot.input,
            book: { ...snapshot.input.book, bestBid: bid, bestAsk: bid + spread },
            openOrders: [{ ...snapshot.input.openOrders[0]!, price }],
          },
        };
        const next = constructDecibelAdaptiveTPPriceV1(snapshot, 'BUY', 0.00047, bid).price!;
        expect(next).toBeGreaterThanOrEqual(price);
        if (next !== price) {
          replacements++;
          snapshot = {
            ...snapshot,
            tpAdverseProgress: planDecibelPatientTPV1(snapshot, 'BUY').authorization,
          };
        }
        price = next;
      }
      expect(replacements).toBe(1);
      const recovered = {
        ...snapshot,
        input: {
          ...snapshot.input,
          book: { bestBid: 75700, bestAsk: 75701, observedAt: snapshot.input.now },
        },
      };
      expect(constructDecibelAdaptiveTPPriceV1(recovered, 'BUY', 0.00047, 75700).price).toBe(price);
    },
  );

  it.each([1, -1])(
    'PID18876 constructs a profitable missing TP rather than repeating rejected near-market prices (%s)',
    async (sign) => {
      const snapshot = pid18876Snapshot(sign);
      const test = make({
        readSnapshot: () => snapshot,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      try {
        const result = await test.orchestrator.evaluateOnce();
        expect(result.action).toBe('ACKNOWLEDGED');
        const intent = test.journal.getIntent(result.intentId!)!;
        expect(intent).toMatchObject({ action: 'PLACE', quantity: 0.00045, reduceOnly: true });
        expect(
          assessDecibelExitEconomicsV1(snapshot, intent.side, intent.quantity, intent.price)
            .netPnlUsd,
        ).toBeGreaterThan(0);
        expect(result.exitCoverageWorkflow).toMatchObject({
          outcome: 'TP_REPAIR_ACKNOWLEDGED',
          uncoveredQuantity: 0.00045,
          evidenceFresh: true,
        });
        expect(test.calls()).toBe(1);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1].flatMap((sign) => [0, 37.46].map((headroom) => ({ sign, headroom }))))(
    'constructs venue-executable profitable TP below the entry notional floor ($sign/$headroom)',
    async ({ sign, headroom }) => {
      const base = pid18876Snapshot(sign, true);
      const quantity = 0.00003;
      const snapshot = {
        ...base,
        maximumNotionalUsd: headroom,
        availableMarginUsd: headroom === 0 ? 0 : base.availableMarginUsd,
        reductionCapacity: { ...base.reductionCapacity, maximumQuantityBtc: quantity },
        maximumReductionNotionalUsd: quantity * base.input.book.bestAsk,
        authenticatedPositions: base.authenticatedPositions.map((p) => ({
          ...p,
          size: sign * quantity,
        })),
        input: { ...base.input, actualInventoryBase: sign * quantity },
      };
      const test = make({ snapshots: [snapshot] });
      try {
        const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
        const desired = sign > 0 ? evaluation.desiredAsk : evaluation.desiredBid;
        expect(
          desired,
          JSON.stringify({
            bid: evaluation.bidEligibilityReason,
            ask: evaluation.askEligibilityReason,
            actions: evaluation.actions,
          }),
        ).toMatchObject({ quantity });
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each(['direction', 'account', 'network', 'quantity'] as const)(
    'never reports verified coverage from unverified %s evidence',
    (fault) => {
      const base = pid18876Snapshot(1, true);
      const snapshot = {
        ...base,
        input: {
          ...base.input,
          actualInventoryBase: fault === 'quantity' ? Number.NaN : 0,
          inventoryDirectionProven: fault !== 'direction',
          authenticatedSubaccount:
            fault === 'account' ? 'foreign' : base.input.authenticatedSubaccount,
          observedNetwork: fault === 'network' ? 'testnet' : base.input.observedNetwork,
        },
      };
      // Invalid quantities must be rejected before lot conversion or coverage.
      const result = deriveDecibelExitCoverageWorkflowV1({
        snapshot,
        now: base.input.now,
        action: 'HOLD',
        actionClass: 'RECONCILIATION',
        reason: null,
        pendingCount: 0,
      });
      expect(result).toMatchObject({
        outcome: 'BLOCKED',
        evidenceFresh: false,
        positionQuantity: null,
        confirmedQuantity: null,
      });
    },
  );

  it.each(['ENTRY', 'POSITION_INCREASE', 'CANCEL', 'RECONCILIATION'] as const)(
    'does not report an unrelated %s acknowledgment as TP repair',
    (actionClass) => {
      const snapshot = pid18876Snapshot(1, true);
      const result = deriveDecibelExitCoverageWorkflowV1({
        snapshot,
        now: snapshot.input.now,
        action: 'ACKNOWLEDGED',
        actionClass,
        reason: 'TP_CANDIDATE_UNAVAILABLE',
        pendingCount: 0,
      });
      expect(result.outcome).toBe(actionClass === 'CANCEL' ? 'RECONCILIATION_PENDING' : 'BLOCKED');
      expect(result.confirmedQuantity).toBe(0);
      expect(result.uncoveredQuantity).toBe(0.00045);
    },
  );

  it.each([1, -1])(
    'admits profitable TP through final admission when its quantity exceeds remaining entry volume (%s)',
    async (sign) => {
      const base = pid18876Snapshot(sign, true);
      const snapshot = {
        ...base,
        sessionConfiguration: {
          ...base.sessionConfiguration,
          targetMakerVolumeUsd: 15,
          makerVolumeUsd: 0,
          totalExecutedVolumeUsd: 0,
          targetVolumeUsd: 0,
        },
      };
      const test = make({ snapshots: [snapshot] });
      try {
        const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
        const desired = (sign > 0 ? evaluation.desiredAsk : evaluation.desiredBid)!;
        expect(desired).not.toBeNull();
        const intent = buildDecibelExecutionIntentV1({
          sessionId: snapshot.input.sessionId,
          cycleSequence: 1,
          action: 'PLACE',
          market: 'BTC/USD',
          side: desired.side,
          price: desired.price,
          quantity: desired.quantity,
          tickSize: snapshot.input.metadata.tickSize,
          lotSize: snapshot.input.metadata.lotSize,
          knownVenueOrderId: null,
          sourceStateHash: snapshot.sourceStateHash,
          strategyDecisionHash: 'volume-scope',
          createdAt: snapshot.input.now,
          reduceOnly: true,
          executionRole: 'INVENTORY_REDUCING_MAKER',
        });
        if (intent.action !== 'PLACE') throw new Error('EXPECTED_PLACE');
        expect(() =>
          validateDecibelFinalMakerAdmissionV1(
            snapshot,
            intent,
            {
              now: snapshot.input.now,
              sessionId: snapshot.input.sessionId,
              state: 'RUNNING',
              evaluation,
            },
            15,
          ),
        ).not.toThrow();
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    'does not borrow TP price authorization from another market or owner (%s)',
    (sign) => {
      const base = dcaCoverageSnapshot(sign);
      const side = sign > 0 ? ('SELL' as const) : ('BUY' as const);
      expect(getDecibelRestingCoveragePriceV1(base, side)).not.toBeNull();
      for (const change of [
        { market: 'OTHER' },
        { strategyConfigId: 'OTHER' },
        { venueOrderId: '' },
        { price: NaN },
      ]) {
        const snapshot = {
          ...base,
          input: { ...base.input, openOrders: [{ ...base.input.openOrders[0]!, ...change }] },
        };
        expect(getDecibelRestingCoveragePriceV1(snapshot, side)).toBeNull();
      }
    },
  );

  it.each([1, -1])(
    'does not spend remaining entry volume on a non-flat reducing candidate (%s)',
    async (sign) => {
      const snapshot = twoSidedSnapshot(sign * 0.00074, 15);
      const test = make({ snapshots: [snapshot, snapshot] });
      try {
        const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
        const reduction = sign > 0 ? evaluation.desiredAsk : evaluation.desiredBid;
        expect(reduction, JSON.stringify(evaluation)).not.toBeNull();
        expect(reduction!.quantity).toBe(0.00074);
        expect(reduction!.quantity * reduction!.price).toBeGreaterThan(15);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1].flatMap((sign) => [0.00045, 0.00003].map((quantity) => ({ sign, quantity }))))(
    'ordinary profitable TP repair uses the actual final gate and adapter without defensive authorization ($sign/$quantity)',
    async ({ sign, quantity }) => {
      const base = pid18876Snapshot(sign, true, quantity);
      let snapshot = {
        ...base,
        maximumNotionalUsd: quantity < 0.0001 ? 0 : base.maximumNotionalUsd,
        availableMarginUsd: quantity < 0.0001 ? 0 : base.availableMarginUsd,
        sessionConfiguration: {
          ...base.sessionConfiguration,
          targetMakerVolumeUsd: 15,
          makerVolumeUsd: 0,
          totalExecutedVolumeUsd: 0,
          targetVolumeUsd: 0,
        },
      };
      const sdkPlace = vi.fn(
        (request: Parameters<DecibelProductionWriteClientV1['placeOrder']>[0]) => {
          expect(request.isReduceOnly).toBe(true);
          expect(request.size).toBe(BigInt(Math.round(quantity * 1e8)));
          return Promise.resolve({
            success: true as const,
            orderId: 'tp-18876',
            transactionHash: 'test-tp-hash',
          });
        },
      );
      const Adapter = new decibel_external_production_executor_v1(() => ({
        subaccount: '0x123',
        client: {
          placeOrder: sdkPlace,
          cancelOrder: () => Promise.reject(new Error('UNEXPECTED_CANCEL')),
        },
      }));
      const test = make({
        readSnapshot: () => snapshot,
        executor: Adapter,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        validateSubmission: (intent) =>
          intent.action !== 'PLACE'
            ? undefined
            : {
                preflight: validateDecibelFinalMakerAdmissionV1(
                  snapshot,
                  intent,
                  {
                    now: snapshot.input.now,
                    state: 'RUNNING',
                    sessionId: snapshot.input.sessionId,
                    evaluation: test.orchestrator.evaluateAuthenticatedSnapshot(snapshot),
                  },
                  15,
                ),
                observedAt: snapshot.input.now,
              },
        reconciliationState: 'ORDER_OPEN',
      });
      try {
        const result = await test.orchestrator.evaluateOnce();
        expect(result.action, result.blocker ?? '').toBe('ACKNOWLEDGED');
        expect(result.evaluation?.operatingState).not.toBe('RISK_REDUCTION');
        expect(result.exitCoverageWorkflow?.outcome).toBe('TP_REPAIR_ACKNOWLEDGED');
        const row = test.journal.nonTerminal()[0]!;
        const intent = test.journal.getIntent(row.intentId)!;
        expect(intent).toMatchObject({
          quantity,
          reduceOnly: true,
          side: sign > 0 ? 'SELL' : 'BUY',
        });
        snapshot = {
          ...snapshot,
          input: {
            ...snapshot.input,
            openOrders: [
              {
                venueOrderId: row.venueOrderId!,
                clientOrderId: intent.clientOrderId,
                market: snapshot.input.market,
                strategyConfigId: snapshot.input.strategyConfigId,
                side: intent.side,
                quantity: intent.quantity,
                price: intent.price,
                reduceOnly: true,
              },
            ],
          },
        };
        await test.orchestrator.evaluateOnce();
        expect(
          calculateDecibelExitCoverageV1(test.orchestrator.getLatestSnapshot()!.input)
            .UNCOVERED_INVENTORY_QTY,
        ).toBe(0);
        expect(sdkPlace).toHaveBeenCalledOnce();
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it('checks exit outcome invariants over lot-aligned LONG/SHORT position and coverage transitions', () => {
    for (const sign of [1, -1])
      for (let lots = 2; lots <= 128; lots += 1)
        for (const covered of [0, Math.floor(lots / 2), lots]) {
          const base = pid18876Snapshot(sign, true),
            quantity = lots / 100000;
          const snapshot = {
            ...base,
            input: {
              ...base.input,
              actualInventoryBase: sign * quantity,
              openOrders:
                covered === 0
                  ? []
                  : [
                      {
                        venueOrderId: 'verified',
                        clientOrderId: 'client',
                        market: base.input.market,
                        strategyConfigId: base.input.strategyConfigId,
                        side: sign > 0 ? ('SELL' as const) : ('BUY' as const),
                        quantity: covered / 100000,
                        price: 80000,
                        reduceOnly: true,
                      },
                    ],
            },
          };
          const result = deriveDecibelExitCoverageWorkflowV1({
            snapshot,
            now: snapshot.input.now,
            action: 'HOLD',
            actionClass: 'TP_COVERAGE_REPAIR',
            reason: 'TP_CANDIDATE_NOT_AUTHORIZED',
            pendingCount: 0,
          });
          expect(result.outcome).toBe(covered === lots ? 'VERIFIED_COVERED' : 'BLOCKED');
          expect((result.confirmedQuantity ?? 0) + (result.uncoveredQuantity ?? 0)).toBeCloseTo(
            quantity,
            12,
          );
        }
  });

  it.each([1, -1])(
    'keeps reduction projection independent of recycled entry caps and respects actual venue limits (%s)',
    (sign) => {
      const snapshot = {
        ...zeroCoverageIncident(sign),
        maximumNotionalUsd: 0,
        maximumReductionNotionalUsd: 0,
      };
      const quantityBound =
        Math.abs(snapshot.input.actualInventoryBase) *
        Math.max(snapshot.input.book.bestBid, snapshot.input.book.bestAsk);
      expect(getDecibelPositionReductionNotionalLimitV1(snapshot)).toBe(quantityBound);
      expect(
        getDecibelPositionReductionNotionalLimitV1({
          ...snapshot,
          practicalCapacityInputs: {
            ...snapshot.practicalCapacityInputs!,
            venueMaximumOrderNotionalUsd: 50,
          },
        }),
      ).toBe(50);
      expect(
        getDecibelPositionReductionNotionalLimitV1({
          ...snapshot,
          practicalCapacityInputs: {
            ...snapshot.practicalCapacityInputs!,
            venueMaximumOrderNotionalUsd: 0,
          },
        }),
      ).toBe(0);
    },
  );

  it.each([1, -1])(
    'dispatches the zero-coverage incident through the real final maker gate to ACK and confirmed coverage (%s)',
    async (sign) => {
      const base = zeroCoverageIncident(sign);
      const foreignPosition = Object.freeze({
        market: 'ETH/USD',
        size: 2,
        entryPrice: 3000,
        source: 'BOT' as const,
      });
      let snapshot = {
        ...base,
        authenticatedPositions: [...base.authenticatedPositions!, foreignPosition],
        maximumReductionNotionalUsd: 0,
      };
      const sdkPlace = vi.fn(
        (request: Parameters<DecibelProductionWriteClientV1['placeOrder']>[0]) => {
          expect(request.isReduceOnly).toBe(true);
          expect(request.marketName).toBe('BTC/USD');
          return Promise.resolve({
            success: true as const,
            orderId: 'incident-venue-one',
            transactionHash: 'test-transaction',
          });
        },
      );
      const Adapter = new decibel_external_production_executor_v1(() => ({
        client: {
          placeOrder: sdkPlace,
          cancelOrder: () => Promise.reject(new Error('UNEXPECTED_TEST_CANCEL')),
        },
        subaccount: '0x123',
      }));
      const validation = vi.fn((intent: execution_intent_v1) => {
        assertDecibelSessionMutationOwnerV1(() => true);
        if (intent.action !== 'PLACE') return;
        const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
        expect(evaluation.operatingState).toBe('RISK_REDUCTION');
        return {
          preflight: validateDecibelFinalMakerAdmissionV1(
            snapshot,
            intent,
            {
              now: snapshot.input.now,
              sessionId: snapshot.input.sessionId,
              state: 'RUNNING',
              evaluation,
            },
            500,
          ),
          observedAt: snapshot.input.now,
        };
      });
      const test = make({
        readSnapshot: () => snapshot,
        executor: Adapter,
        validateSubmission: validation,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
      });
      test.orchestrator.requestRiskReduction();
      try {
        const before = await test.orchestrator.evaluateOnce();
        expect(before.action).toBe('BLOCKED');
        expect(sdkPlace).not.toHaveBeenCalled();
        expect(validation).not.toHaveBeenCalled();
        snapshot = {
          ...snapshot,
          maximumReductionNotionalUsd: getDecibelPositionReductionNotionalLimitV1(snapshot),
        };
        const result = await test.orchestrator.evaluateOnce();
        expect(result.action, result.blocker ?? '').toBe('ACKNOWLEDGED');
        expect(validation).toHaveBeenCalledOnce();
        const row = test.journal.nonTerminal()[0]!;
        const intent = test.journal.getIntent(row.intentId)!;
        expect(intent).toMatchObject({
          side: sign > 0 ? 'SELL' : 'BUY',
          quantity: 0.00128,
          reduceOnly: true,
          executionRole: 'INVENTORY_REDUCING_MAKER',
        });
        expect(row.status).toBe('ACKNOWLEDGED');
        expect(calculateDecibelExitCoverageV1(snapshot.input).CONFIRMED_EXIT_COVERAGE_QTY).toBe(0);
        snapshot = {
          ...snapshot,
          input: {
            ...snapshot.input,
            openOrders: [
              {
                venueOrderId: row.venueOrderId!,
                clientOrderId: intent.clientOrderId,
                strategyConfigId: snapshot.input.strategyConfigId,
                market: snapshot.input.market,
                side: intent.side,
                price: intent.price,
                quantity: intent.quantity,
                reduceOnly: true,
              },
            ],
          },
        };
        await test.orchestrator.evaluateOnce();
        expect(
          calculateDecibelExitCoverageV1(test.orchestrator.getLatestSnapshot()!.input),
        ).toMatchObject({
          CONFIRMED_EXIT_COVERAGE_QTY: 0.00128,
          UNCOVERED_INVENTORY_QTY: 0,
        });
        expect(sdkPlace).toHaveBeenCalledOnce();
        expect(
          snapshot.authenticatedPositions.find((position) => position.market === 'ETH/USD'),
        ).toEqual(foreignPosition);
        expect(sdkPlace).toHaveBeenCalledWith(
          expect.objectContaining({
            size: 128000n,
            isReduceOnly: true,
            isBuy: sign < 0,
            timeInForce: 1,
            clientOrderId: intent.clientOrderId,
          }),
        );
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    'retains essential stale-account and identity protections for the zero-coverage incident (%s)',
    async (sign) => {
      const snapshot = zeroCoverageIncident(sign);
      const test = make({ snapshots: [snapshot, snapshot] });
      test.orchestrator.requestRiskReduction();
      try {
        const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(snapshot);
        const desired = sign > 0 ? evaluation.desiredAsk! : evaluation.desiredBid!;
        const candidate = {
          side: desired.side,
          price: desired.price,
          quantity: desired.quantity,
          reduceOnly: true,
        };
        const context = {
          now: snapshot.input.now,
          sessionId: snapshot.input.sessionId,
          state: 'RUNNING' as const,
          evaluation,
          candidate,
        };
        const increasing = evaluateTradingDecision(snapshot, {
          ...context,
          candidate: { ...candidate, side: sign > 0 ? 'BUY' : 'SELL', reduceOnly: false },
        });
        expect(increasing.state).not.toBe('TRADE');
        expect(increasing.detailedReasons).toContain('CAPACITY_VENUE_MARGIN_RULES_STALE');
        expect(
          evaluateTradingDecision(
            {
              ...snapshot,
              venueReadWindow: {
                account: {
                  startedAt: snapshot.input.now - snapshot.input.maxBboAgeMs - 1,
                  completedAt: snapshot.input.now,
                },
              },
            },
            context,
          ).state,
        ).not.toBe('TRADE');
        expect(
          evaluateTradingDecision(snapshot, {
            ...context,
            identityConflict: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
          }).state,
        ).toBe('STOP');
        expect(
          evaluateTradingDecision(snapshot, { ...context, unresolvedIntentCount: 1 }).state,
        ).not.toBe('TRADE');
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    'revalidates an authenticated partial fill and ownership before incident replacement (%s)',
    async (sign) => {
      let snapshot = zeroCoverageIncident(sign);
      let first = true;
      let owned = true;
      const test = make({
        readSnapshot: () => snapshot,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        validateSubmission: (intent) => {
          if (intent.action !== 'PLACE') return;
          if (first) {
            first = false;
            snapshot = {
              ...snapshot,
              authenticatedPositions: [
                { ...snapshot.authenticatedPositions![0]!, size: sign * 0.00115 },
              ],
              input: { ...snapshot.input, actualInventoryBase: sign * 0.00115 },
            };
            snapshot = {
              ...snapshot,
              maximumReductionNotionalUsd: getDecibelPositionReductionNotionalLimitV1(snapshot),
            };
          }
          assertDecibelSessionMutationOwnerV1(() => owned);
          return {
            preflight: validateDecibelFinalMakerAdmissionV1(
              snapshot,
              intent,
              {
                now: snapshot.input.now,
                sessionId: snapshot.input.sessionId,
                state: 'RUNNING',
                evaluation: test.orchestrator.evaluateAuthenticatedSnapshot(snapshot),
              },
              500,
            ),
            observedAt: snapshot.input.now,
          };
        },
        reconciliationState: 'ORDER_OPEN',
      });
      test.orchestrator.requestRiskReduction();
      try {
        expect((await test.orchestrator.evaluateOnce()).action).toBe('BLOCKED');
        expect(test.calls()).toBe(0);
        owned = false;
        expect((await test.orchestrator.evaluateOnce()).action).toBe('BLOCKED');
        expect(test.calls()).toBe(0);
        owned = true;
        const admitted = await test.orchestrator.evaluateOnce();
        expect(admitted.action, admitted.blocker ?? '').toBe('ACKNOWLEDGED');
        const intent = test.journal.getIntent(test.journal.nonTerminal()[0]!.intentId)!;
        expect(intent).toMatchObject({ reduceOnly: true, quantity: 0.00115 });
        expect(test.calls()).toBe(1);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    'never retries an unknown incident submission before authoritative reconciliation (%s)',
    async (sign) => {
      const snapshot = zeroCoverageIncident(sign);
      const test = make({
        readSnapshot: () => snapshot,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        placeOutcome: 'PLACE_OUTCOME_UNKNOWN',
        reconciliationError: new Error('AUTHENTICATED_HTTP_READ_FAILED'),
        validateSubmission: (intent) =>
          intent.action !== 'PLACE'
            ? undefined
            : {
                preflight: validateDecibelFinalMakerAdmissionV1(
                  snapshot,
                  intent,
                  {
                    now: snapshot.input.now,
                    sessionId: snapshot.input.sessionId,
                    state: 'RUNNING',
                    evaluation: test.orchestrator.evaluateAuthenticatedSnapshot(snapshot),
                  },
                  500,
                ),
                observedAt: snapshot.input.now,
              },
      });
      test.orchestrator.requestRiskReduction();
      try {
        await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
          action: 'RECONCILIATION_REQUIRED',
        });
        await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
          'AUTHENTICATED_HTTP_READ_FAILED',
        );
        expect(test.calls()).toBe(1);
        expect(test.journal.nonTerminal().length).toBe(1);
        expect(calculateDecibelExitCoverageV1(snapshot.input).CONFIRMED_EXIT_COVERAGE_QTY).toBe(0);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    'retains the existing canonical Max Loss unwind IOC without entry headroom (%s)',
    async (sign) => {
      const base = zeroCoverageIncident(sign);
      const snapshot = {
        ...base,
        sessionConfiguration: {
          ...base.sessionConfiguration!,
          riskBlocker: 'SESSION_MAX_LOSS_REACHED',
          pnlUsd: -3.2,
        },
      };
      const test = make({
        readSnapshot: () => snapshot,
        supportUnwindIOC: true,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        validateSubmission: () => {
          assertDecibelSessionMutationOwnerV1(() => true);
        },
      });
      test.orchestrator.requestSessionUnwind();
      try {
        const result = await test.orchestrator.evaluateOnce();
        expect(result.action, result.blocker ?? '').toBe('ACKNOWLEDGED');
        const intent = test.journal.getIntent(test.journal.nonTerminal()[0]!.intentId)!;
        expect(intent).toMatchObject({
          quantity: 0.00128,
          reduceOnly: true,
          executionRole: 'SESSION_UNWIND_IOC',
          timeInForce: 'ImmediateOrCancel',
        });
        expect(test.calls()).toBe(1);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each(['HTTP Error 500', 'PRODUCTION_AUTHENTICATED_READ_TIMEOUT'])(
    'does not invent an unknown submitted identity when final validation fails before claim: %s',
    async (failure) => {
      const snapshot = zeroCoverageIncident(1);
      const test = make({
        snapshots: Array.from({ length: 6 }, () => snapshot),
        validateSubmission: () => Promise.reject(new Error(failure)),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      test.orchestrator.requestRiskReduction();
      try {
        const result = await test.orchestrator.evaluateOnce();
        expect(result).toMatchObject({ action: 'BLOCKED', blocker: failure, intentId: null });
        expect(test.calls()).toBe(0);
        expect(test.journal.nonTerminal()).toHaveLength(0);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([
    { sign: 1, remaining: 0.00128, failure: null, unknown: false },
    { sign: -1, remaining: 0.00128, failure: null, unknown: false },
    { sign: 1, remaining: 0.00128, failure: null, unknown: true },
    { sign: -1, remaining: 0.00128, failure: null, unknown: true },
    { sign: 1, remaining: 0.00115, failure: 'HTTP Error 500: Service temporarily unavailable' },
    { sign: -1, remaining: 0.00115, failure: 'AUTHENTICATED_HTTP_WORKER_REQUEST_TIMEOUT' },
  ])(
    'dispatches canonical defensive reduction despite complete TP coverage ($sign, $remaining, $failure)',
    async ({ sign, remaining, failure, unknown }) => {
      const before = defensiveDispatchSnapshot(sign);
      const order = before.input.openOrders[0]!;
      const after = {
        ...before,
        sourceStateHash: 'defensive-cancel-confirmed',
        authenticatedPositions: [{ ...before.authenticatedPositions[0]!, size: sign * remaining }],
        input: { ...before.input, actualInventoryBase: sign * remaining, openOrders: [] },
        terminalOrderEvidence: [
          {
            venueOrderId: order.venueOrderId,
            clientOrderId: order.clientOrderId,
            state: 'CANCELLED' as const,
            originalQuantity: order.quantity,
            remainingQuantity: 0,
          },
        ],
      };
      const test = make({
        snapshots: [before, before, ...Array.from({ length: 15 }, () => after)].map((snapshot) =>
          projectVenueReplay(snapshot),
        ),
        validateSubmission: (intent) => {
          assertDecibelSessionMutationOwnerV1(() => true);
          if (intent.action !== 'PLACE') return;
          const fresh = projectVenueReplay(after);
          const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(fresh);
          const decision = evaluateTradingDecision(fresh, {
            now: fresh.input.now,
            sessionId: fresh.input.sessionId,
            state: 'RUNNING',
            evaluation,
            candidate: intent,
          });
          expect(evaluation.operatingState).toBe('RISK_REDUCTION');
          expect(decision.state, decision.primaryReason).toBe('TRADE');
          if (decision.state !== 'TRADE')
            throw new execution_preflight_rejection_v1(decision.primaryReason);
        },
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationResults: ['ORDER_OPEN', 'ORDER_CANCELLED', 'ORDER_CANCELLED'],
        reconciliationState: 'ORDER_OPEN',
        cancelTargetState: 'ORDER_OPEN',
        ...(unknown ? { placeOutcome: 'PLACE_OUTCOME_UNKNOWN' as const } : {}),
        ...(failure ? { readFailuresAt: new Map([[4, new Error(failure)]]) } : {}),
      });
      ownIncidentTP(test, before);
      test.orchestrator.requestRiskReduction();
      test.orchestrator.setEconomicWarming(true);
      try {
        const results = [];
        for (let i = 0; i < 8 && test.calls() < 2; i++) {
          try {
            results.push(await test.orchestrator.evaluateOnce());
          } catch (error) {
            expect(isTransientDecibelAuthenticatedReadErrorV1(error)).toBe(true);
            expect(test.submitted()).toEqual([{ action: 'CANCEL', side: order.side }]);
          }
        }
        expect(
          test.submitted(),
          JSON.stringify(results.map((r) => ({ action: r.action, blocker: r.blocker }))),
        ).toEqual([
          { action: 'CANCEL', side: order.side },
          { action: 'PLACE', side: order.side },
        ]);
        expect(results[0]?.action).not.toBe('HOLD');
        expect(results[0]?.evaluation?.operatingState).toBe('RISK_REDUCTION');
        const replacement = test.journal
          .nonTerminal()
          .map((row) => test.journal.getIntent(row.intentId))
          .find(
            (intent) => intent?.action === 'PLACE' && intent.clientOrderId !== order.clientOrderId,
          );
        expect(replacement).toMatchObject({
          reduceOnly: true,
          side: order.side,
          quantity: remaining,
        });
        expect(replacement!.price).not.toBe(order.price);
        if (unknown) {
          await test.orchestrator.evaluateOnce();
          await test.orchestrator.evaluateOnce();
          expect(test.calls()).toBe(2);
          expect(
            test.journal.nonTerminal().some((row) => row.intentId === replacement!.intentId),
          ).toBe(true);
        }
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    'keeps TP without canonical authorization and reconciles pending defensive cancellation (%s)',
    (sign) => {
      const snapshot = defensiveDispatchSnapshot(sign);
      const sizing = {
        minimumNotionalUsd: 0.1,
        maximumNotionalUsd: 200,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 40,
        maximumAbsPositionBase: 0.01,
        entryHeadroomUsd: 0,
      };
      const normal = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, sizing);
      expect(normal.actions.find((action) => action.current?.reduceOnly)?.reason).toMatch(/^KEEP:/);
      const reducing = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
        ...sizing,
        riskReductionRequired: true,
      });
      expect(reducing.operatingState).toBe('RISK_REDUCTION');
      const action = reducing.actions.find((action) => action.current?.reduceOnly)!;
      expect(action.reason).toBe('REPRICE:CANONICAL_RISK_REDUCTION');
      expect(
        evaluateDecibelReplacementDecisionV1(action, snapshot, 0, 30000, 50, true, null, reducing),
      ).toMatchObject({ cancel: true, reason: action.reason });
      expect(
        evaluateDecibelReplacementDecisionV1(action, snapshot, 0, 30000, 50, false)?.cancel,
      ).toBe(false);
      const pending = evaluateDecibelAuthenticatedPassiveRecyclingV1(
        { ...snapshot.input, pendingCancelOrderIds: [snapshot.input.openOrders[0]!.venueOrderId] },
        { ...sizing, riskReductionRequired: true },
      );
      expect(pending.actions.find((action) => action.current?.reduceOnly)).toMatchObject({
        action: 'BLOCKED',
        reason: 'EXIT_CANCEL_RECONCILIATION_PENDING',
      });
      const stale = { ...snapshot, input: { ...snapshot.input, now: snapshot.input.now + 60000 } };
      expect(
        evaluateDecibelReplacementDecisionV1(action, stale, 0, 30000, 50, true, null, reducing)
          ?.cancel,
      ).toBe(false);
    },
  );

  it.each([1, -1])(
    'revalidates canonical authorization after defensive TP cancellation (%s)',
    async (sign) => {
      const before = defensiveDispatchSnapshot(sign);
      const order = before.input.openOrders[0]!;
      const after = {
        ...before,
        sourceStateHash: 'withdrawn-risk-reduction',
        input: { ...before.input, openOrders: [] },
        terminalOrderEvidence: [
          {
            venueOrderId: order.venueOrderId,
            clientOrderId: order.clientOrderId,
            state: 'CANCELLED' as const,
            originalQuantity: order.quantity,
            remainingQuantity: 0,
          },
        ],
      };
      const test = make({
        snapshots: [before, before, ...Array.from({ length: 12 }, () => after)],
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationResults: ['ORDER_OPEN', 'ORDER_CANCELLED', 'ORDER_CANCELLED'],
        reconciliationState: 'ORDER_OPEN',
        cancelTargetState: 'ORDER_OPEN',
      });
      ownIncidentTP(test, before);
      test.orchestrator.requestRiskReduction();
      try {
        await test.orchestrator.evaluateOnce();
        expect(test.submitted()).toEqual([{ action: 'CANCEL', side: order.side }]);
        test.orchestrator.requestRiskReduction(false);
        for (let cycle = 0; cycle < 3 && test.orchestrator['FrozenReprice'] !== null; cycle++)
          await test.orchestrator.evaluateOnce();
        expect(test.orchestrator['FrozenReprice']).toBeNull();
        expect(test.orchestrator.getPendingReplacementDecisionId()).toBeNull();
        expect(test.submitted()).toEqual([{ action: 'CANCEL', side: order.side }]);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([true, false])(
    'blocks final executor dispatch without exclusive ownership (resting TP=%s)',
    async (resting) => {
      const before = projectVenueReplay(defensiveDispatchSnapshot(1));
      const snapshot = resting ? before : { ...before, input: { ...before.input, openOrders: [] } };
      let ownsRuntime = false;
      let validations = 0;
      const test = make({
        snapshots: Array.from({ length: 12 }, () => snapshot),
        reconciliationState: 'ORDER_OPEN',
        cancelTargetState: 'ORDER_OPEN',
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        validateSubmission: async () => {
          validations++;
          await Promise.resolve();
          assertDecibelSessionMutationOwnerV1(() => ownsRuntime);
        },
      });
      if (resting) ownIncidentTP(test, before);
      test.orchestrator.requestRiskReduction();
      try {
        await test.orchestrator.evaluateOnce();
        expect(validations).toBe(1);
        expect(test.calls()).toBe(0);
        if (resting)
          expect(
            test.journal.findNonTerminalByVenueOrderId(before.input.openOrders[0]!.venueOrderId),
          ).not.toBeNull();
        ownsRuntime = true;
        await test.orchestrator.evaluateOnce();
        expect(test.calls()).toBe(1);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  const ownIncidentTP = (
    test: ReturnType<typeof make>,
    snapshot: decibel_production_live_snapshot_v1,
  ) => {
    const order = snapshot.input.openOrders[0]!;
    const owned = buildDecibelExecutionIntentV1({
      ...order,
      market: 'BTC/USD',
      sessionId: snapshot.input.sessionId,
      cycleSequence: 0,
      action: 'PLACE',
      tickSize: snapshot.input.metadata.tickSize,
      lotSize: snapshot.input.metadata.lotSize,
      knownVenueOrderId: null,
      sourceStateHash: 'incident-owned-tp',
      strategyDecisionHash: 'incident-owned-tp',
      createdAt: snapshot.input.now - 1000,
      reduceOnly: true,
      executionRole: 'INVENTORY_REDUCING_MAKER',
    });
    test.journal.prepare(owned);
    test.journal.transition(
      owned.intentId,
      'ACKNOWLEDGED',
      snapshot.input.now - 500,
      order.venueOrderId,
    );
    return owned;
  };

  describe('Independent protective recovery through real scheduler and executor', () => {
    const createRecoveryReplay = (scenario: string, sign = 1) => {
      const original = dcaCoverageSnapshot(sign);
      const root = mkdtempSync(join(tmpdir(), 'independent-protection-'));
      const path = join(root, 'journal.sqlite');
      let quantity = scenario === 'FLAT' ? 0 : Math.abs(original.input.actualInventoryBase);
      let clock = original.input.now;
      let sessionId = original.input.sessionId;
      let assertMutationOwner = () => undefined as void;
      let visible = !['UNKNOWN', 'ACK_ONLY'].includes(scenario);
      let failReads = false;
      let injectedSubmission = false;
      let terminalOrders: NonNullable<
        decibel_production_live_snapshot_v1['terminalOrderEvidence']
      > = [];
      let finalLedger: decibel_production_live_snapshot_v1['input']['actualFillLedger'] | null =
        null;
      let placeCalls = 0;
      let cancelCalls = 0;
      type Order = (typeof original.input.openOrders)[number];
      const orders: Order[] = ['FULL', 'PARTIAL', 'CURRENT_CONFLICT'].includes(scenario)
        ? [
            {
              ...original.input.openOrders[0]!,
              reduceOnly: true,
              quantity: scenario === 'FULL' ? quantity : 0.00071,
            },
          ]
        : [];
      const read = (): decibel_production_live_snapshot_v1 => {
        if (failReads) throw new Error('PRODUCTION_AUTHENTICATED_READ_TRANSIENT');
        const now = ++clock;
        const snapshot = {
          ...original,
          sourceStateHash: `protection-venue-${now}`,
          maximumNotionalUsd: 0,
          reductionCapacity: {
            maximumQuantityBtc: quantity,
            venueMaximumOrderNotionalUsd: null,
            observedAt: now,
          },
          authenticatedPositions:
            quantity === 0
              ? []
              : original.authenticatedPositions.map((p) => ({ ...p, size: sign * quantity })),
          practicalCapacityInputs: {
            ...original.practicalCapacityInputs!,
            accountObservedAt: now,
            ...(scenario === 'DEFENSIVE' ? { marginDeficitUsd: 1 } : {}),
          },
          terminalOrderEvidence: terminalOrders,
          input: {
            ...original.input,
            actualFillLedger: finalLedger ?? original.input.actualFillLedger,
            now,
            actualInventoryBase: sign * quantity,
            sessionId,
            metadata: { ...original.input.metadata, observedAt: now },
            book: { ...original.input.book, observedAt: now },
            openOrders: visible ? [...orders] : [],
          },
        };
        const projected = projectVenueReplay(snapshot);
        if (scenario === 'STALE')
          return {
            ...projected,
            venueReadWindow: {
              ...projected.venueReadWindow!,
              account: { ...projected.venueReadWindow!.account, startedAt: now - 6000 },
            },
          };
        if (scenario === 'WRONG_ACCOUNT')
          return {
            ...projected,
            input: { ...projected.input, authenticatedSubaccount: 'wrong-account' },
          };
        return projected;
      };
      const Adapter = new decibel_external_production_executor_v1(() => ({
        subaccount: '0x123',
        client: {
          cancelOrder: () => {
            cancelCalls++;
            return Promise.reject(new Error('NO_CANCEL_FIRST'));
          },
          placeOrder: (request) => {
            placeCalls++;
            expect(request.isReduceOnly).toBe(true);
            expect(request.timeInForce).toBe(1);
            expect(request.isBuy).toBe(sign < 0);
            if (scenario === 'POSITION_DURING_WRITE') {
              if (scenario === 'POSITION_DURING_WRITE') quantity -= original.input.metadata.lotSize;
              return Promise.resolve({
                success: false,
                error: 'Fake venue rejected reduce-only request before execution',
              });
            }
            const size = Number(request.size) / 1e8;
            expect(size).toBeLessThanOrEqual(quantity);
            orders.push({
              ...original.input.openOrders[0]!,
              venueOrderId: `protective-${placeCalls}`,
              clientOrderId: request.clientOrderId!,
              side: sign > 0 ? 'SELL' : 'BUY',
              quantity: size,
              price: Number(request.price) / 1e6,
              reduceOnly: true,
            });
            if (scenario === 'UNKNOWN')
              return Promise.reject(new Error('Transport timeout after venue acceptance'));
            return Promise.resolve({
              success: true,
              orderId: `protective-${placeCalls}`,
              transactionHash: '0xfake_protective_transaction',
            });
          },
        },
      }));
      let test: ReturnType<typeof make>;
      const create = () =>
        make({
          journalPath: path,
          readSnapshot: read,
          postMutationRead: true,
          executor: Adapter,
          environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
          reconcileIntent: (id, snapshot, venueId, identity) => {
            const body = test.journal.getIntent(id);
            if (body?.action === 'CANCEL')
              return Promise.reject(new Error('HISTORICAL_FINALITY_UNAVAILABLE'));
            const open = snapshot.input.openOrders.find(
              (o) =>
                o.clientOrderId === identity?.clientOrderId &&
                (venueId == null || o.venueOrderId === venueId),
            );
            return open
              ? Promise.resolve('ORDER_OPEN')
              : Promise.reject(new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'));
          },
          validateSubmission: (intent) => {
            assertMutationOwner();
            if (scenario === 'POSITION_CHANGE') quantity -= original.input.metadata.lotSize;
            const fresh = read();
            const proof = assessDecibelProtectiveRecoveryV1(test.journal, fresh, fresh.input.now);
            if (!proof.allowed) throw new execution_preflight_rejection_v1(proof.blocker);
            if (intent.action !== 'PLACE') throw new Error('NO_CANCEL_FIRST');
            const evaluation = test.orchestrator.evaluateAuthenticatedSnapshot(fresh);
            if (scenario === 'DEFENSIVE') {
              expect(evaluation.operatingState).toBe('RISK_REDUCTION');
              expect(
                assessDecibelExitEconomicsV1(fresh, intent.side, intent.quantity, intent.price)
                  .netPnlUsd,
              ).toBeLessThan(0);
            }
            const preflight = validateDecibelFinalMakerAdmissionV1(
              fresh,
              intent,
              {
                now: fresh.input.now,
                sessionId: fresh.input.sessionId,
                state: 'RUNNING',
                evaluation,
                identityConflict: null,
                unresolvedIntentCount: 0,
              },
              -1,
            );
            return {
              assertSubmissionStillAuthorized: () => {
                if (scenario === 'OWNER_LOSS') throw new Error('SESSION_MUTATION_OWNERSHIP_LOST');
                if (scenario === 'CONCURRENT_SUBMISSION' && !injectedSubmission) {
                  injectedSubmission = true;
                  const entry = buildDecibelExecutionIntentV1({
                    sessionId: fresh.input.sessionId,
                    action: 'PLACE',
                    cycleSequence: 999001,
                    market: 'BTC/USD',
                    side: 'BUY',
                    price: fresh.input.book.bestBid,
                    quantity: 0.00013,
                    tickSize: 0.1,
                    lotSize: 0.00001,
                    clientOrderId: 'raced-opening-client',
                    knownVenueOrderId: null,
                    createdAt: fresh.input.now,
                    sourceStateHash: 'race',
                    strategyDecisionHash: 'race',
                  });
                  test.journal.prepare(entry);
                  test.journal.transition(entry.intentId, 'SUBMITTING', fresh.input.now);
                  test.journal.attempt(entry.intentId, fresh.input.now);
                  test.journal.transition(entry.intentId, 'SUBMIT_UNKNOWN', fresh.input.now);
                }
                assertMutationOwner();
              },
              preflight:
                scenario === 'PREFLIGHT_REJECTED'
                  ? {
                      ...preflight,
                      permittedSide: intent.side === 'BUY' ? ('SELL' as const) : ('BUY' as const),
                    }
                  : preflight,
            };
          },
        });
      test = create();
      const first = read();
      if (orders.length) ownIncidentTP(test, first);
      const oldPlace = buildDecibelExecutionIntentV1({
        sessionId: first.input.sessionId,
        cycleSequence: 90001,
        action: 'PLACE',
        market: 'BTC/USD',
        side: sign > 0 ? 'SELL' : 'BUY',
        price: 80473.5,
        quantity: 0.00013,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId: 'historical-unrelated',
        knownVenueOrderId: null,
        sourceStateHash: 'historical',
        strategyDecisionHash: 'historical',
        createdAt: first.input.now - 10000,
      });
      test.journal.prepare(oldPlace);
      test.journal.applyAuthoritativeReconciliation({
        intentId: oldPlace.intentId,
        reconciliationState: 'CANCELLED_EXTERNALLY',
        terminalStatus: 'CANCELLED_EXTERNALLY',
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
        matchedIdentifier: 'venueOrderId:historical-order',
        venueStatus: 'CANCELLED',
        remainingQuantity: 0,
        transactionHash: null,
        venueOrderId: 'historical-order',
        clientOrderId: oldPlace.clientOrderId,
        observedAt: first.input.now - 8000,
      });
      const oldCancel = buildDecibelExecutionIntentV1({
        ...oldPlace,
        action: 'CANCEL',
        cycleSequence: 90002,
        quantity: 0.0001,
        tickSize: 0.1,
        lotSize: 0.00001,
        knownVenueOrderId: 'historical-order',
        cancelReason: 'HISTORICAL_CANCEL',
        createdAt: first.input.now - 7000,
      });
      test.journal.prepare(oldCancel);
      test.journal.transition(
        oldCancel.intentId,
        'ACKNOWLEDGED',
        first.input.now - 6000,
        'historical-order',
      );
      test.journal.markUnresolvableAcknowledgement(oldCancel.intentId, first.input.now - 5000);
      test.journal.recordIdentityConflict(oldCancel.intentId, first.input.now - 4000);
      if (scenario === 'TERMINAL_HISTORY')
        test.journal.recordIdentityConflict(oldPlace.intentId, first.input.now - 3000);
      if (scenario === 'CURRENT_CONFLICT') {
        const owner = test.journal.findPlaceByExactIdentity(
          orders[0]!.venueOrderId,
          orders[0]!.clientOrderId,
        )!;
        test.journal.recordIdentityConflict(owner.intentId, first.input.now);
      }
      if (scenario !== 'AUTO')
        test.orchestrator.setHistoricalRecoveryBlocker('HISTORICAL_FINALITY_UNAVAILABLE');
      const Supervisor = new decibel_runtime_supervisor_v1();
      Supervisor.setDependency('recovery', 'BLOCKED');
      const cycle = () =>
        new Promise<Awaited<ReturnType<typeof test.orchestrator.evaluateOnce>>>(
          (resolve, reject) => {
            Supervisor.scheduleOnce('independent-protection', 0, async () => {
              try {
                resolve(await test.orchestrator.evaluateOnce());
              } catch (error) {
                reject(error instanceof Error ? error : new Error('REPLAY_CYCLE_FAILED'));
              }
            });
          },
        );
      return {
        get test() {
          return test;
        },
        root,
        path,
        orders,
        oldCancel,
        read,
        cycle,
        Supervisor,
        attachSession: (id: string, checkOwner: () => void) => {
          sessionId = id;
          assertMutationOwner = checkOwner;
        },
        counts: () => ({ placeCalls, cancelCalls }),
        reveal: () => {
          visible = true;
        },
        complete: (state: 'FILLED' | 'CANCELLED') => {
          const order = orders.shift()!;
          terminalOrders = [
            {
              venueOrderId: order.venueOrderId,
              clientOrderId: order.clientOrderId,
              state,
              originalQuantity: order.quantity,
              remainingQuantity: 0,
            },
          ];
          if (state === 'FILLED') {
            const openingSide = sign > 0 ? ('BUY' as const) : ('SELL' as const);
            const openingPrice = original.authenticatedPositions[0]!.entryPrice;
            finalLedger = createDecibelActualFillLedgerV1([
              {
                venueOrderId: 'opening-inventory',
                localIntentId: 'opening-inventory',
                localExecutionRequestId: 'opening-client',
                marketAddress: original.input.market,
                side: openingSide,
                requestedQuantity: order.quantity,
              },
              {
                venueOrderId: order.venueOrderId,
                localIntentId: 'protective-fill',
                localExecutionRequestId: order.clientOrderId,
                marketAddress: original.input.market,
                side: order.side,
                requestedQuantity: order.quantity,
              },
            ]);
            for (const fill of [
              {
                venueFillId: 'opening-fill',
                venueOrderId: 'opening-inventory',
                localExecutionRequestId: 'opening-client',
                side: openingSide,
                executedPrice: openingPrice,
                transactionVersion: '9000001',
              },
              {
                venueFillId: 'protective-fill',
                venueOrderId: order.venueOrderId,
                localExecutionRequestId: order.clientOrderId,
                side: order.side,
                executedPrice: order.price,
                transactionVersion: '9000002',
              },
            ])
              finalLedger = applyDecibelActualFillTruthV1(finalLedger, {
                ...fill,
                marketAddress: original.input.market,
                executedBaseQuantity: order.quantity,
                executedUsdNotional: order.quantity * fill.executedPrice,
                makerOrTaker: 'MAKER',
                receivedAt: new Date(clock),
                venueTimestamp: new Date(clock),
                executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
                fee: { availability: 'AVAILABLE', amount: 0, currency: 'USD' },
                rebate: { availability: 'AVAILABLE', amount: 0, currency: 'USD' },
              });
            quantity = 0;
          }
        },
        failReads: () => {
          failReads = true;
        },
        restart: async () => {
          await test.orchestrator.close();
          test = create();
          test.orchestrator.setHistoricalRecoveryBlocker('HISTORICAL_FINALITY_UNAVAILABLE');
        },
        close: async () => {
          Supervisor.stopScheduler();
          await test.orchestrator.close();
        },
      };
    };

    it.each([
      { scenario: 'FLAT', sign: 1 },
      { scenario: 'FULL', sign: 1 },
      { scenario: 'PARTIAL', sign: 1 },
      { scenario: 'PARTIAL', sign: -1 },
      { scenario: 'ZERO', sign: 1 },
      { scenario: 'AUTO', sign: 1 },
      { scenario: 'TERMINAL_HISTORY', sign: 1 },
      { scenario: 'ZERO', sign: -1 },
      { scenario: 'CURRENT_CONFLICT', sign: 1 },
      { scenario: 'WRONG_ACCOUNT', sign: 1 },
      { scenario: 'OWNER_LOSS', sign: 1 },
      { scenario: 'CONCURRENT_SUBMISSION', sign: 1 },
      { scenario: 'POSITION_CHANGE', sign: 1 },
      { scenario: 'POSITION_DURING_WRITE', sign: 1 },
      { scenario: 'DEFENSIVE', sign: 1 },
      { scenario: 'DEFENSIVE', sign: -1 },
    ])(
      'replays $scenario/$sign without relaxing historical recovery or maker policy',
      async ({ scenario, sign }) => {
        const Replay = createRecoveryReplay(scenario, sign);
        try {
          const result = await Replay.cycle();
          const expected = [
            'ZERO',
            'AUTO',
            'TERMINAL_HISTORY',
            'DEFENSIVE',
            'POSITION_DURING_WRITE',
          ].includes(scenario)
            ? 1
            : 0;
          expect(
            Replay.counts(),
            JSON.stringify({ action: result.action, blocker: result.blocker }),
          ).toEqual({ placeCalls: expected, cancelCalls: 0 });
          if (expected && scenario !== 'POSITION_DURING_WRITE') {
            expect(Replay.orders).toHaveLength(1);
            const coverage = calculateDecibelExitCoverageV1(Replay.read().input);
            expect(coverage.UNCOVERED_INVENTORY_QTY).toBe(0);
            const placed = Replay.test.journal.findPlaceByExactIdentity(
              Replay.orders[0]!.venueOrderId,
              Replay.orders[0]!.clientOrderId,
            );
            expect(placed?.status).toBe('ACKNOWLEDGED');
            await Replay.cycle();
            expect(Replay.counts().placeCalls).toBe(1);
          }
          if (scenario === 'POSITION_DURING_WRITE') {
            expect(Replay.orders).toHaveLength(0);
            expect(result.action).toBe('RECONCILIATION_REQUIRED');
            expect(
              Replay.test.journal.nonTerminal().some((row) => row.status === 'SUBMIT_UNKNOWN'),
            ).toBe(true);
          }
          if (scenario === 'PARTIAL') {
            expect(
              calculateDecibelExitCoverageV1(Replay.read().input).UNCOVERED_INVENTORY_QTY,
            ).toBe(0.00018);
            expect(Replay.orders).toHaveLength(1);
          }
          expect(Replay.test.journal.get(Replay.oldCancel.intentId)?.status).toBe(
            'UNRESOLVABLE_ACK',
          );
          if (scenario === 'CURRENT_CONFLICT')
            expect(Replay.test.journal.getActiveIdentityConflicts()).toHaveLength(2);
          expect(Replay.Supervisor.getSnapshot().dependencies.recovery).toBe('BLOCKED');
        } finally {
          await Replay.close();
        }
      },
    );

    it.each(['UNKNOWN', 'ACK_ONLY'])(
      'keeps %s protective submission blocked across restart until an exact authoritative OPEN snapshot',
      async (scenario) => {
        const Replay = createRecoveryReplay(scenario);
        try {
          await Replay.cycle();
          expect(Replay.counts().placeCalls).toBe(1);
          expect(
            calculateDecibelExitCoverageV1(Replay.read().input).CONFIRMED_EXIT_COVERAGE_QTY,
          ).toBe(0);
          await Replay.restart();
          await Replay.cycle();
          expect(Replay.counts().placeCalls).toBe(1);
          expect(
            Replay.test.journal
              .nonTerminal()
              .some(
                (row) =>
                  row.status === (scenario === 'UNKNOWN' ? 'SUBMIT_UNKNOWN' : 'UNRESOLVABLE_ACK') &&
                  Replay.test.journal.getIntent(row.intentId)?.action === 'PLACE',
              ),
          ).toBe(true);
          Replay.reveal();
          await Replay.cycle();
          await Replay.cycle();
          expect(Replay.counts()).toEqual({ placeCalls: 1, cancelCalls: 0 });
          expect(
            Replay.test.journal
              .nonTerminal()
              .some(
                (row) =>
                  row.status === (scenario === 'UNKNOWN' ? 'SUBMIT_UNKNOWN' : 'UNRESOLVABLE_ACK') &&
                  Replay.test.journal.getIntent(row.intentId)?.action === 'PLACE',
              ),
          ).toBe(false);
          expect(calculateDecibelExitCoverageV1(Replay.read().input).UNCOVERED_INVENTORY_QTY).toBe(
            0,
          );
        } finally {
          await Replay.close();
        }
      },
    );

    it('recovers the existing session in protective-only mode through startup convergence, ownership claim and scheduler', async () => {
      const Replay = createRecoveryReplay('ZERO');
      const Sessions = new decibel_production_session_store_v1(
        join(Replay.root, 'sessions.sqlite'),
      );
      const Settings = new decibel_operator_settings_store_v1(join(Replay.root, 'settings.json'), {
        capitalToUseUsd: 8,
        maxLossUsd: 3,
        targetMakerVolumeUsd: -1,
        orderNotionalUsd: 10,
        maxPositionUsd: 100,
      });
      const Previous = new decibel_production_session_controller_v1(
        Sessions,
        Settings,
        () =>
          Promise.resolve({
            stop: () => Promise.resolve({ safeToEnd: false, blocker: 'SIMULATED_OLD_PROCESS' }),
          }),
        () => Replay.read().input.now - 40000,
        () => undefined,
        () => undefined,
        { pid: 999999, instanceId: 'simulated-dead-owner' },
      );
      const running = await Previous.start(0);
      let resolveCycle!: (value: unknown) => void;
      let rejectCycle!: (error: Error) => void;
      const completed = new Promise((resolve, reject) => {
        resolveCycle = resolve;
        rejectCycle = reject;
      });
      let runtimeCreations = 0;
      let ownerChecks = 0;
      const Controller = new decibel_production_session_controller_v1(
        Sessions,
        Settings,
        (_session, historicalBlocker) => {
          runtimeCreations++;
          Replay.test.orchestrator.setHistoricalRecoveryBlocker(historicalBlocker ?? null);
          return Promise.resolve({
            activate: () => {
              expect(Controller.ownsActiveRuntime()).toBe(true);
              void Replay.cycle().then(resolveCycle, (error) =>
                rejectCycle(error instanceof Error ? error : new Error('REPLAY_FAILED')),
              );
            },
            setHistoricalRecoveryBlocker: (blocker: string | null) =>
              Replay.test.orchestrator.setHistoricalRecoveryBlocker(blocker),
            stop: () =>
              Promise.resolve({ safeToEnd: false, blocker: 'NO_SESSION_ACTION_IN_REPLAY' }),
          });
        },
        () => Replay.read().input.now,
        () => undefined,
        (protective) => {
          if (!protective) throw new Error('HISTORICAL_FINALITY_UNAVAILABLE');
        },
        { pid: process.pid, instanceId: 'protective-restart' },
        () => true,
      );
      Replay.attachSession(running.sessionId, () => {
        ownerChecks++;
        assertDecibelSessionMutationOwnerV1(() => Controller.ownsActiveRuntime());
      });
      try {
        const startup = await convergeDecibelStartupRecoveryV1({
          ensureAuthenticated: () => Promise.resolve(),
          readAuthenticatedSnapshot: () => Promise.resolve(Replay.read()),
          reconcileJournal: () => Promise.reject(new Error('HISTORICAL_FINALITY_UNAVAILABLE')),
          recoverSession: () => Controller.recoverStartup(),
        });
        expect(startup.result).toBe('BLOCKED');
        await expect(Controller.recoverProtectiveStartup(startup.blocker!)).resolves.toBe(1);
        await completed;
        expect(Replay.counts()).toEqual({ placeCalls: 1, cancelCalls: 0 });
        expect(runtimeCreations).toBe(1);
        expect(ownerChecks).toBeGreaterThan(0);
        expect(Sessions.list(10)).toHaveLength(1);
        expect(Controller.getState()).toMatchObject({
          state: 'RECOVERY_BLOCKED',
          protectiveOnly: true,
          ownerState: 'OWNED',
        });
        await expect(Controller.recoverStartup()).rejects.toThrow(
          'HISTORICAL_FINALITY_UNAVAILABLE',
        );
        expect(Controller.getState().protectiveOnly).toBe(true);
      } finally {
        Sessions.close();
        await Replay.close();
      }
    });

    it.each(['FILLED', 'CANCELLED'] as const)(
      'crash after authoritative %s commit preserves finality across restart',
      async (state) => {
        const Replay = createRecoveryReplay('ZERO');
        try {
          await Replay.cycle();
          const id = Replay.test.journal
            .nonTerminal()
            .find(
              (row) => Replay.test.journal.getIntent(row.intentId)?.action === 'PLACE',
            )!.intentId;
          Replay.complete(state);
          const apply = Replay.test.journal.applyAuthoritativeReconciliation.bind(
            Replay.test.journal,
          );
          vi.spyOn(Replay.test.journal, 'applyAuthoritativeReconciliation').mockImplementation(
            (input) => {
              apply(input);
              if (input.intentId === id) throw new Error('CRASH_AFTER_AUTHORITATIVE_COMMIT');
            },
          );
          await expect(Replay.cycle()).rejects.toThrow('CRASH_AFTER_AUTHORITATIVE_COMMIT');
          expect(Replay.test.journal.get(id)?.status).toBe(
            state === 'FILLED' ? 'APPLIED' : 'CANCELLED_EXTERNALLY',
          );
          await Replay.restart();
          await Replay.cycle();
          expect(Replay.counts()).toEqual({
            placeCalls: state === 'FILLED' ? 1 : 2,
            cancelCalls: 0,
          });
          if (state === 'FILLED') expect(Replay.read().input.actualInventoryBase).toBe(0);
        } finally {
          await Replay.close();
        }
      },
    );

    it('crash after durable preflight REJECTED never submits an unsafe order', async () => {
      const Replay = createRecoveryReplay('PREFLIGHT_REJECTED');
      try {
        const transition = Replay.test.journal.transition.bind(Replay.test.journal);
        vi.spyOn(Replay.test.journal, 'transition').mockImplementation((...args) => {
          const value = transition(...args);
          if (args[1] === 'REJECTED') throw new Error('CRASH_AFTER_REJECTED');
          return value;
        });
        try {
          await Replay.cycle();
        } catch {
          /* Simulated crash after venue rejection. */
        }
        expect(Replay.orders).toHaveLength(0);
        expect(Replay.counts().placeCalls).toBe(0);
        await Replay.restart();
        await Replay.cycle();
        expect(Replay.orders).toHaveLength(0);
        expect(Replay.counts()).toEqual({ placeCalls: 0, cancelCalls: 0 });
      } finally {
        await Replay.close();
      }
    });

    it('restarts a persisted RECONCILING order using authoritative OPEN evidence without resubmission', async () => {
      const Replay = createRecoveryReplay('ZERO');
      try {
        await Replay.cycle();
        const row = Replay.test.journal
          .nonTerminal()
          .find(
            (candidate) => Replay.test.journal.getIntent(candidate.intentId)?.action === 'PLACE',
          )!;
        Replay.test.journal.transition(
          row.intentId,
          'RECONCILING',
          Replay.read().input.now,
          row.venueOrderId!,
        );
        await Replay.restart();
        await Replay.cycle();
        expect(Replay.test.journal.get(row.intentId)?.status).toBe('ACKNOWLEDGED');
        expect(Replay.counts()).toEqual({ placeCalls: 1, cancelCalls: 0 });
      } finally {
        await Replay.close();
      }
    });

    it('refuses stale authoritative inventory before any protective mutation', async () => {
      const Replay = createRecoveryReplay('STALE');
      try {
        await expect(Replay.cycle()).rejects.toThrow();
        expect(Replay.counts()).toEqual({ placeCalls: 0, cancelCalls: 0 });
      } finally {
        await Replay.close();
      }
    });

    it('runs repeated protective cycles on the production recurring scheduler without duplicated orders', async () => {
      const Replay = createRecoveryReplay('ZERO');
      try {
        await new Promise<void>((resolve, reject) => {
          let cycles = 0;
          Replay.Supervisor.scheduleRecurring(
            'protective-recurring-replay',
            1,
            async () => {
              try {
                await Replay.test.orchestrator.evaluateOnce();
                if (++cycles === 3) {
                  Replay.Supervisor.cancelScheduled('protective-recurring-replay');
                  resolve();
                }
              } catch (error) {
                reject(error instanceof Error ? error : new Error('REPLAY_FAILED'));
              }
            },
            0,
          );
        });
        expect(Replay.counts()).toEqual({ placeCalls: 1, cancelCalls: 0 });
        expect(Replay.Supervisor.getSnapshot().dependencies.recovery).toBe('BLOCKED');
        expect(calculateDecibelExitCoverageV1(Replay.read().input).UNCOVERED_INVENTORY_QTY).toBe(0);
      } finally {
        await Replay.close();
      }
    });

    it('reads fresh protective state without waiting for an unrelated entry-capacity producer', async () => {
      const snapshot = projectVenueReplay(zeroCoverageIncident(1));
      const readProduction = vi.fn(() =>
        Promise.reject(new Error('ENTRY_CAPACITY_PRODUCER_UNAVAILABLE')),
      );
      const projected = await readDecibelSessionCapacityProjectionV1({
        protectiveOnly: true,
        readSnapshot: () => Promise.resolve(snapshot),
        readPracticalInputs: () => snapshot.practicalCapacityInputs,
        readProduction,
      });
      expect(readProduction).not.toHaveBeenCalled();
      expect(projected.input).toBe(snapshot.input);
      expect(projected.practicalCapacityInputs).toBe(snapshot.practicalCapacityInputs);
      expect(projected.capacityProduction).toBeUndefined();
      expect(projected.capacityEvidence).toBeUndefined();
      await expect(
        readDecibelSessionCapacityProjectionV1({
          readSnapshot: () => Promise.resolve(snapshot),
          readProduction,
        }),
      ).rejects.toThrow('ENTRY_CAPACITY_PRODUCER_UNAVAILABLE');
    });

    it('does not dispatch on venue read failure', async () => {
      const Replay = createRecoveryReplay('ZERO');
      try {
        Replay.failReads();
        await expect(Replay.cycle()).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_TRANSIENT');
        expect(Replay.counts()).toEqual({ placeCalls: 0, cancelCalls: 0 });
      } finally {
        await Replay.close();
      }
    });

    it.each(['PREPARED', 'SUBMITTING', 'ACKNOWLEDGED'] as const)(
      'crash/restart after durable %s never blindly repeats a submission',
      async (status) => {
        const Replay = createRecoveryReplay('ZERO');
        try {
          if (status === 'PREPARED') {
            const claim = Replay.test.journal.claimForSubmission.bind(Replay.test.journal);
            vi.spyOn(Replay.test.journal, 'claimForSubmission').mockImplementation((...args) => {
              const result = claim(...args);
              throw new Error(`CRASH_AFTER_${status}:${result.intentId}`);
            });
          } else {
            const transition = Replay.test.journal.transition.bind(Replay.test.journal);
            vi.spyOn(Replay.test.journal, 'transition').mockImplementation((...args) => {
              const result = transition(...args);
              if (args[1] === status) throw new Error(`CRASH_AFTER_${status}`);
              return result;
            });
          }
          try {
            await Replay.cycle();
          } catch {
            /* Simulated process death. */
          }
          expect(Replay.test.journal.nonTerminal().some((row) => row.status === status)).toBe(true);
          const before = Replay.counts().placeCalls;
          await Replay.restart();
          await Replay.cycle();
          expect(Replay.counts()).toEqual({
            placeCalls: status === 'PREPARED' ? 1 : before,
            cancelCalls: 0,
          });
          expect(before).toBe(status === 'ACKNOWLEDGED' ? 1 : 0);
          if (status === 'PREPARED')
            expect(
              Replay.test.journal.nonTerminal().filter((row) => row.status === 'PREPARED'),
            ).toHaveLength(0);
        } finally {
          await Replay.close();
        }
      },
    );
  });

  it('replays recorded inventory/basis arithmetic without claiming a missing historical basis was authenticated', () => {
    expect(reconstructedBasis).toBeCloseTo(80440.9721153846, 8);
    const snapshot = inventoryIncident(1, null);
    for (const price of ExitIncident.candidatePrices) {
      const e = assessDecibelExitEconomicsV1(snapshot, 'SELL', 0.00104, price);
      expect(e.netPnlUsd).toBeNull();
      expect(e.blockers).toContain('AUTHENTICATED_ENTRY_BASIS_REQUIRED');
    }
    // Conditional cost calculation using the recorded fills' reconstructed basis.
    const conditional = inventoryIncident();
    expect(
      assessDecibelExitEconomicsV1(conditional, 'SELL', 0.00104, 80577.4).netPnlUsd,
    ).toBeCloseTo(0.08237177624997553, 8);
    expect(
      assessDecibelExitEconomicsV1(conditional, 'SELL', 0.00104, 80431.2).netPnlUsd,
    ).toBeCloseTo(-0.06963821175002312, 8);
    expect(
      assessDecibelExitEconomicsV1(conditional, 'SELL', 0.00104, 80353.8).netPnlUsd,
    ).toBeCloseTo(-0.15011408775001817, 8);
    expect(ExitIncident.replacementAuthenticatedOpenAt - ExitIncident.cancelTerminalAt).toBe(24791);
  });
  it.each([1, -1])(
    'composes profitable TP price and exact coverage upsize independently (%s)',
    (sign) => {
      const snapshot = inventoryIncident(sign, 80000);
      const current = snapshot.input.openOrders[0]!;
      const price = sign > 0 ? 80431.2 : 161000 - 80431.2;
      const action = {
        action: 'WOULD_REPLACE' as const,
        side: current.side,
        current,
        desired: { ...current, quantity: 0.00104, price, generation: 1 },
        reason: 'REPRICE:TP_PRICE_AND_COVERAGE',
      };
      expect(
        evaluateDecibelTPPriceSuitabilityV1(action, snapshot, 60000, 30000, 50, 30000),
      ).toMatchObject({
        TP_REPRICE_DECISION: 'KEEP',
        TP_NET_PROFIT_REQUIRED: 0,
        TP_EXPECTED_NET_BENEFIT_KIND: 'CONDITIONAL_NET_PNL_DELTA_USD',
      });
      const losing = inventoryIncident(sign);
      const review = evaluateDecibelTPPriceSuitabilityV1(action, losing, 60000, 30000, 50, 30000)!;
      expect(review.TP_REPRICE_DECISION).toBe('KEEP');
      expect(review.CANDIDATE_TP_NET_PNL).toBeLessThan(0);
      expect(review.TP_EXPECTED_NET_BENEFIT).toBeLessThan(0);
    },
  );
  it.each([1, -1])(
    'plans exact 0.00013 additional coverage but preserves canonical admission until verified (%s)',
    async (sign) => {
      const base = inventoryIncident(sign);
      const snapshot = {
        ...base,
        input: {
          ...base.input,
          reductionOrderRules: {
            market: base.input.market,
            source: 'OFFLINE_VERIFIED_RULE_FIXTURE_NOT_PRODUCTION',
            observedAt: base.input.now,
            validUntil: base.input.now + 5000,
            multipleOrders: true,
            enforcesReduceOnlyOnEveryFill: true,
            maximumOrders: 2,
            minimumSize: 0.00002,
            minimumNotionalUsd: 10,
          },
        },
      };
      const test = make({
        snapshots: Array.from({ length: 12 }, () => snapshot),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
      });
      ownIncidentTP(test, snapshot);
      const result = await test.orchestrator.evaluateOnce();
      expect(result).toMatchObject({
        action: 'BLOCKED',
        blocker: 'MULTIPLE_REDUCE_ONLY_CANONICAL_ADMISSION_UNVERIFIED',
      });
      expect(
        result.evaluation?.actions.find((a) => a.reason === 'EXIT_COVERAGE_ADD'),
      ).toMatchObject({ action: 'WOULD_PLACE', desired: { quantity: 0.00013 } });
      expect(test.submitted()).toEqual([]);
      expect(test.journal.nonTerminal()).toHaveLength(1);
      await test.orchestrator.evaluateOnce();
      expect(test.calls()).toBe(0); // The canonical single-owner guard remains intact.
      expect(result.inventoryExit?.CONFIRMED_EXIT_COVERAGE_QTY).toBe(0.00091);
      await test.orchestrator.close();
    },
  );

  const dcaCoverageSnapshot = (sign: number, quantity = 0.00089, covered = 0.00071) => {
    const basis = (0.00071 * 80598.4 + 0.00018 * 80565.2) / 0.00089;
    const original = inventoryIncident(sign, basis);
    const mirror = (price: number) => (sign > 0 ? price : 161200 - price);
    const before = original.input.openOrders[0]!;
    return {
      ...original,
      sourceStateHash: `dca-${sign}-${quantity}-${covered}`,
      economicInputs: {
        ...original.economicInputs!,
        makerFeeBps: 1.5,
        estimatedGasCostUsd: 0.0004153248,
        adverseSelectionBufferBps: 5.4062164048916115,
        safetyMarginBps: 1,
      },
      maximumNotionalUsd: 116.8278775,
      maximumReductionNotionalUsd: 116.8278775,
      maximumAbsPositionBase: 0.00145,
      authenticatedPositions: [
        {
          market: 'BTC/USD',
          size: sign * quantity,
          source: 'BOT' as const,
          entryPrice: mirror(basis),
        },
      ],
      input: {
        ...original.input,
        actualInventoryBase: sign * quantity,
        book: {
          bestBid: sign > 0 ? 80562.4 : mirror(80562.5),
          bestAsk: sign > 0 ? 80562.5 : mirror(80562.4),
          observedAt: original.input.now,
        },
        openOrders: [{ ...before, price: mirror(80661.5), quantity: covered }],
      },
    };
  };

  it.each([1, -1])(
    'repairs exact PID 23792 coverage with one same-price cancel (%s)',
    async (sign) => {
      const basis = (0.00045 * 79430.2 + 0.00013 * 79350.8) / 0.00058;
      const mirror = (price: number) => (sign > 0 ? price : 159000 - price);
      const base = dcaCoverageSnapshot(sign, 0.00058, 0.00045);
      const snapshot = projectVenueReplay({
        ...base,
        authenticatedPositions: [
          {
            market: 'BTC/USD',
            size: sign * 0.00058,
            source: 'BOT' as const,
            entryPrice: mirror(basis),
          },
        ],
        input: {
          ...base.input,
          book: {
            ...base.input.book,
            bestBid: mirror(sign > 0 ? 79350.7 : 79350.8),
            bestAsk: mirror(sign > 0 ? 79350.8 : 79350.7),
          },
          openOrders: [
            {
              ...base.input.openOrders[0]!,
              venueOrderId: '170141604320468509682511671673453805568',
              clientOrderId: 'd1s8c6567b0b9edce01942bf6486426b',
              price: mirror(79532.1),
              quantity: 0.00045,
            },
          ],
        },
      });
      const test = make({
        snapshots: Array.from({ length: 10 }, () => snapshot),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
        cancelTargetState: 'ORDER_OPEN',
      });
      ownIncidentTP(test, snapshot);
      try {
        const before = calculateDecibelExitCoverageV1(snapshot.input);
        expect(before).toMatchObject({
          POSITION_QTY: sign * 0.00058,
          CONFIRMED_EXIT_COVERAGE_QTY: 0.00045,
          UNCOVERED_INVENTORY_QTY: 0.00013,
        });
        const results = [];
        for (let cycle = 0; cycle < 5; cycle++)
          results.push(await test.orchestrator.evaluateOnce());
        // Any undersized TP is replaced at the same price (operator decision 2026-11-14):
        // exactly one cancel, and no replacement before the cancel is proven final.
        expect(
          results.some(
            (result) => result.blocker === 'PRODUCTION_RECONCILIATION_CANCEL_FINALITY_PENDING',
          ),
          JSON.stringify(results.map((r) => ({ action: r.action, blocker: r.blocker }))),
        ).toBe(true);
        expect(test.submitted()).toEqual([
          { action: 'CANCEL', side: snapshot.input.openOrders[0]!.side },
        ]);
        expect(
          test.journal.findPlaceByExactIdentity(
            snapshot.input.openOrders[0]!.venueOrderId,
            snapshot.input.openOrders[0]!.clientOrderId,
          )?.status,
        ).toBe('ACKNOWLEDGED');
        expect(
          calculateDecibelExitCoverageV1(test.orchestrator.getLatestSnapshot()!.input),
        ).toMatchObject({
          POSITION_QTY: sign * 0.00058,
          CONFIRMED_EXIT_COVERAGE_QTY: 0.00045,
          UNCOVERED_INVENTORY_QTY: 0.00013,
        });
        const economics = assessDecibelExitEconomicsV1(
          snapshot,
          sign > 0 ? 'SELL' : 'BUY',
          0.00045,
          mirror(79532.1),
        );
        expect(economics.blockers).toEqual([]);
        expect(economics.netPnlUsd).toBeGreaterThan(0);
        // Journal snapshot at 1793888329152: retain the production reserves.
        const recordedEconomics = assessDecibelExitEconomicsV1(
          {
            ...snapshot,
            economicInputs: {
              ...snapshot.economicInputs!,
              estimatedGasCostUsd: 0.0003759028,
              adverseSelectionBufferBps: 8.595328171518672,
              safetyMarginBps: 1,
            },
          },
          sign > 0 ? 'SELL' : 'BUY',
          0.00045,
          mirror(79532.1),
        );
        expect(recordedEconomics.blockers).toEqual([]);
        expect(recordedEconomics.netPnlUsd).toBeGreaterThan(0);
        if (sign > 0) {
          expect(recordedEconomics.netPnlUsd).toBeCloseTo(0.028083269727590676, 10);
          const gross = 0.00045 * (79532.1 - basis);
          const allocatedActualEntryFees = ((0.005361 + 0.001547) * 0.00045) / 0.00058;
          const makerExitFee = (0.00045 * 79532.1 * 1.5) / 10000;
          expect(gross - allocatedActualEntryFees - makerExitFee).toBeCloseTo(0.04313537635, 9);
        }
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each(
    [1, -1].flatMap((sign) =>
      [
        'POST_ONLY',
        'REJECTED',
        'UNKNOWN',
        'HTTP_AFTER_CANCEL',
        'PARTIAL_BEFORE_REPLACE',
        'STALE_ENTRY_RULES',
        'MARKET_BEFORE_SUBMIT',
        'RESTART',
      ].map((failure) => ({ sign, failure })),
    ),
  )(
    'recovers an already-cancelled historical quantity repair through real adapter, journal and identity reconciliation ($sign/$failure)',
    async ({ sign, failure }) => {
      const base = dcaCoverageSnapshot(sign);
      type Order = (typeof base.input.openOrders)[number];
      const orders = new Map<
        string,
        { order: Order; originalQuantity: number; state: 'OPEN' | 'CANCELLED' }
      >();
      const first = base.input.openOrders[0]!;
      orders.set(first.venueOrderId, {
        order: first,
        originalQuantity: first.quantity,
        state: 'OPEN',
      });
      let clock = base.input.now,
        quantity = Math.abs(base.input.actualInventoryBase);
      let cancelCalls = 0,
        placeCalls = 0,
        failRead = false,
        hideUnknown = false;
      const path = join(
        mkdtempSync(join(tmpdir(), 'decibel-coverage-sequence-')),
        'journal.sqlite',
      );
      const read = (): decibel_production_live_snapshot_v1 => {
        if (failRead) {
          failRead = false;
          throw Object.assign(new Error('HTTP Error 500: after cancellation'), { status: 500 });
        }
        const now = ++clock;
        return {
          ...base,
          sourceStateHash: `fake-venue-${now}`,
          maximumNotionalUsd: 0,
          sessionConfiguration: {
            ...base.sessionConfiguration!,
            riskBlocker: 'NO_NEW_QUOTE_HEADROOM',
            exposureLimits: {
              ...base.sessionConfiguration!.exposureLimits!,
              availableHeadroomUsd: 0,
              capacityBlocker: 'NO_NEW_QUOTE_HEADROOM',
            },
          },
          reductionCapacity: {
            maximumQuantityBtc: quantity,
            venueMaximumOrderNotionalUsd: null,
            observedAt: now,
          },
          practicalCapacityInputs: {
            ...base.practicalCapacityInputs!,
            accountObservedAt: now,
            ...(failure === 'STALE_ENTRY_RULES'
              ? {
                  venueMarginRules: {
                    ...base.practicalCapacityInputs!.venueMarginRules!,
                    observedAt: now - 5001,
                    markObservedAt: now - 5001,
                  },
                }
              : {}),
          },
          authenticatedPositions: base.authenticatedPositions.map((p) => ({
            ...p,
            size: sign * quantity,
          })),
          input: {
            ...base.input,
            now,
            actualInventoryBase: sign * quantity,
            book: { ...base.input.book, observedAt: now },
            openOrders: [...orders.values()]
              .filter(
                (r) =>
                  r.state === 'OPEN' &&
                  !(hideUnknown && r.order.venueOrderId !== first.venueOrderId),
              )
              .map((r) => r.order),
          },
          terminalOrderEvidence: [...orders.values()]
            .filter((r) => r.state === 'CANCELLED')
            .map((r) => ({
              venueOrderId: r.order.venueOrderId,
              clientOrderId: r.order.clientOrderId,
              state: 'CANCELLED',
              originalQuantity: r.originalQuantity,
              remainingQuantity: 0,
            })),
        };
      };
      const Adapter = new decibel_external_production_executor_v1(() => ({
        subaccount: '0x123',
        client: {
          cancelOrder: ({ orderId }) => {
            const row = orders.get(orderId)!;
            expect(row.state).toBe('OPEN');
            row.state = 'CANCELLED';
            cancelCalls++;
            if (failure === 'HTTP_AFTER_CANCEL') failRead = true;
            if (failure === 'PARTIAL_BEFORE_REPLACE') quantity = 0.00079;
            return Promise.resolve({ success: true });
          },
          placeOrder: (request) => {
            placeCalls++;
            expect(request.isReduceOnly).toBe(true);
            expect(request.timeInForce).toBe(1);
            expect(request.isBuy).toBe(sign < 0);
            const size = Number(request.size) / 1e8;
            expect(size).toBeLessThanOrEqual(quantity);
            const price = Number(request.price) / 1e6;
            expect(price).toBe(first.price); // Quantity-only repair never changes the approved TP price.
            const id = `fake-repair-${placeCalls}`;
            const rejected = placeCalls === 1 && ['POST_ONLY', 'REJECTED'].includes(failure);
            orders.set(id, {
              originalQuantity: size,
              state: rejected ? 'CANCELLED' : 'OPEN',
              order: {
                ...first,
                venueOrderId: id,
                clientOrderId: request.clientOrderId!,
                quantity: size,
                price,
              },
            });
            if (failure === 'UNKNOWN' && placeCalls === 1) {
              hideUnknown = true;
              return Promise.reject(new Error('Transport timeout after venue acceptance'));
            }
            return Promise.resolve({
              success: true,
              orderId: id,
              transactionHash: `fake-hash-${placeCalls}`,
            });
          },
        },
      }));
      let movedMarket = false;
      let test: ReturnType<typeof make>;
      const create = () =>
        make({
          readSnapshot: read,
          journalPath: path,
          executor: Adapter,
          environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
          cancelTargetState: 'ORDER_OPEN',
          validateSubmission: (intent) => {
            if (intent.action !== 'PLACE') return;
            let fresh = read();
            if (failure === 'MARKET_BEFORE_SUBMIT' && !movedMarket) {
              movedMarket = true;
              fresh = {
                ...fresh,
                input: {
                  ...fresh.input,
                  book: {
                    ...fresh.input.book,
                    bestBid: sign > 0 ? first.price : first.price - 0.1,
                    bestAsk: sign > 0 ? first.price + 0.1 : first.price,
                  },
                },
              };
            }
            return {
              preflight: validateDecibelFinalMakerAdmissionV1(
                fresh,
                intent,
                {
                  now: fresh.input.now,
                  sessionId: fresh.input.sessionId,
                  evaluation: test.orchestrator.evaluateAuthenticatedSnapshot(fresh),
                  coveragePriceAuthorization: test.journal.getCommittedCoveragePrice(
                    fresh.input.sessionId,
                    intent.side,
                    fresh.terminalOrderEvidence ?? [],
                  ),
                },
                500,
              ),
              observedAt: fresh.input.now,
            };
          },
          reconcileIntent: (intentId, snapshot) => {
            const intent = test.journal.getIntent(intentId)!;
            const row =
              intent.action === 'CANCEL'
                ? orders.get(intent.expectedPreviousVenueOrderId)
                : [...orders.values()].find((r) => r.order.clientOrderId === intent.clientOrderId);
            if (!row || (hideUnknown && row.order.venueOrderId !== first.venueOrderId))
              throw new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
            const resolution = resolveDecibelAuthoritativeOrderEvidenceV1({
              identity: {
                market: 'BTC/USD',
                venueOrderId: row.order.venueOrderId,
                clientOrderId: row.order.clientOrderId,
                intentId,
                side: intent.side,
                originalQuantity: row.originalQuantity,
              },
              observations: [
                {
                  source:
                    row.state === 'OPEN'
                      ? 'AUTHENTICATED_OPEN_ORDERS'
                      : 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
                  observedAt: snapshot.input.now,
                  sourceTimestamp: snapshot.input.now,
                  market: 'BTC/USD',
                  venueOrderId: row.order.venueOrderId,
                  clientOrderId: row.order.clientOrderId,
                  side: intent.side,
                  originalQuantity: row.originalQuantity,
                  remainingQuantity: row.state === 'OPEN' ? row.order.quantity : 0,
                  terminalStatus: row.state === 'OPEN' ? null : 'CANCELLED',
                },
              ],
              fills: [],
            });
            if (resolution.state === 'CONFLICT')
              throw new Error('EXECUTION_AUTHORITATIVE_RECONCILIATION_CONFLICT');
            return Promise.resolve(
              resolution.state === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_OPEN',
            );
          },
        });
      test = create();
      ownIncidentTP(test, base);
      // Legacy/external cancellation happened before this runtime. Preserve the
      // recovery matrix without making the new planner create a protection gap.
      const historicalCancel = buildDecibelExecutionIntentV1({
        sessionId: base.input.sessionId,
        cycleSequence: 0,
        action: 'CANCEL',
        market: 'BTC/USD',
        side: first.side,
        price: first.price,
        quantity: first.quantity,
        tickSize: base.input.metadata.tickSize,
        lotSize: base.input.metadata.lotSize,
        clientOrderId: first.clientOrderId,
        knownVenueOrderId: first.venueOrderId,
        sourceStateHash: 'historical-coverage-cancel',
        strategyDecisionHash: 'historical-coverage-cancel',
        createdAt: clock,
        cancelReason: 'EXIT_COVERAGE_UPSIZE',
      });
      test.journal.prepare(historicalCancel);
      test.journal.transition(historicalCancel.intentId, 'ACKNOWLEDGED', clock, first.venueOrderId);
      await Adapter.cancelExactOrder(historicalCancel);
      const results = [];
      let restarted = false,
        unknownWaits = 0;
      try {
        for (let cycle = 0; cycle < 18; cycle++) {
          try {
            results.push(await test.orchestrator.evaluateOnce());
          } catch (error) {
            expect(isTransientDecibelAuthenticatedReadErrorV1(error)).toBe(true);
            expect(cancelCalls).toBe(1);
            if (failure === 'MARKET_BEFORE_SUBMIT') expect(movedMarket).toBe(true);
            expect(placeCalls).toBe(0);
          }
          if (failure === 'RESTART' && cancelCalls && !restarted) {
            await test.orchestrator.close();
            test = create();
            restarted = true;
          }
          if (hideUnknown) {
            expect(placeCalls).toBe(1);
            if (++unknownWaits >= 3) hideUnknown = false;
            continue;
          }
          const snapshot = test.orchestrator.getLatestSnapshot();
          if (
            placeCalls &&
            snapshot &&
            calculateDecibelExitCoverageV1(snapshot.input).UNCOVERED_INVENTORY_QTY === 0
          )
            break;
        }
        const latest = test.orchestrator.getLatestSnapshot()!;
        expect(
          calculateDecibelExitCoverageV1(latest.input).UNCOVERED_INVENTORY_QTY,
          JSON.stringify(results.map((r) => ({ action: r.action, blocker: r.blocker }))),
        ).toBe(0);
        expect(cancelCalls).toBe(1);
        expect(placeCalls).toBe(['POST_ONLY', 'REJECTED'].includes(failure) ? 2 : 1);
        expect([...orders.values()].filter((row) => row.state === 'OPEN')).toHaveLength(1);
        expect(
          test.journal.getCommittedCoveragePrice(
            latest.input.sessionId,
            first.side,
            latest.terminalOrderEvidence ?? [],
          ),
        ).toBeNull();
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each(
    [
      { sign: 1, quantity: 0.00089, remaining: 0.00071 },
      { sign: -1, quantity: 0.00089, remaining: 0.00071 },
      // 0.00071 / 0.00094 stays above the 75% replacement threshold.
      { sign: 1, quantity: 0.00094, remaining: 0.00071 },
      { sign: -1, quantity: 0.00094, remaining: 0.00071 },
      { sign: 1, quantity: 0.00079, remaining: 0.00061 },
      { sign: -1, quantity: 0.00079, remaining: 0.00061 },
    ].flatMap((scenario) => [false, true].map((contract) => ({ ...scenario, contract }))),
  )(
    'repairs DCA TP coverage once through read failures, without a speculative PLACE ($sign, $quantity, $remaining, contract=$contract)',
    async ({ sign, quantity, remaining, contract }) => {
      const before = dcaCoverageSnapshot(sign);
      const order = before.input.openOrders[0]!;
      const commit = dcaCoverageSnapshot(sign, quantity, remaining);
      const test = make({
        snapshots: [before, commit, ...Array.from({ length: 15 }, () => commit)].map((snapshot) =>
          projectVenueReplay(
            contract
              ? {
                  ...snapshot,
                  reductionCapacity: {
                    maximumQuantityBtc: Math.abs(snapshot.input.actualInventoryBase),
                    venueMaximumOrderNotionalUsd: null,
                    observedAt: snapshot.input.now,
                  },
                }
              : snapshot,
          ),
        ),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
        cancelTargetState: 'ORDER_OPEN',
        readFailuresAt: new Map([
          [
            1,
            Object.assign(new Error('HTTP Error 500: Service temporarily unavailable'), {
              status: 500,
            }),
          ],
          [
            4,
            Object.assign(
              new Error('HTTP Error 500: Service temporarily unavailable after cancel'),
              { status: 500 },
            ),
          ],
        ]),
      });
      ownIncidentTP(test, before);
      try {
        await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
          'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
        );
        expect(test.submitted()).toEqual([]);
        const results = [];
        for (let cycle = 0; cycle < 6 && test.calls() < 2; cycle++) {
          try {
            results.push(await test.orchestrator.evaluateOnce());
          } catch (error) {
            expect(isTransientDecibelAuthenticatedReadErrorV1(error)).toBe(true);
            expect(test.submitted().every((mutation) => mutation.action === 'CANCEL')).toBe(true);
          }
        }
        expect(
          test.submitted(),
          JSON.stringify(
            results.map((r) => ({
              action: r.action,
              blocker: r.blocker,
            })),
          ),
        ).toEqual([{ action: 'CANCEL', side: order.side }]);
        // Any undersized TP is replaced at the same price (operator decision 2026-11-14): one
        // cancel, then no replacement before the venue proves the cancel final.
        expect(
          results.some(
            (result) => result.blocker === 'PRODUCTION_RECONCILIATION_CANCEL_FINALITY_PENDING',
          ),
        ).toBe(true);
        expect(
          test.journal.findPlaceByExactIdentity(order.venueOrderId, order.clientOrderId)?.status,
        ).toBe('ACKNOWLEDGED');
        expect(
          test.journal
            .nonTerminal()
            .filter((row) => test.journal.getIntent(row.intentId)?.action === 'PLACE'),
        ).toHaveLength(1);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it.each([1, -1])(
    're-evaluates repeated/late DCA and partial TP fills without speculative coverage (%s)',
    async (sign) => {
      const initial = dcaCoverageSnapshot(sign);
      const test = make({ snapshots: [initial] });
      try {
        for (const [position, covered] of [
          [0.00089, 0.00071],
          [0.00102, 0.00071],
          [0.00092, 0.00061],
          [0.00061, 0.00061],
        ] as const) {
          const snapshot = dcaCoverageSnapshot(sign, position, covered);
          const evaluation = test.orchestrator['evaluateWithFlatPairCohort'](snapshot, {
            minimumNotionalUsd: 10,
            maximumNotionalUsd: 116.8278775,
            availableMarginUsd: 8,
            maximumEffectiveLeverage: 40,
            maximumAbsPositionBase: 0.00145,
            halfSpreadBps: 5,
            makerFeeBps: 1.5,
            estimatedGasCostUsd: 0.0004153248,
            adverseSelectionBufferBps: 3.5,
            safetyMarginBps: 1,
          });
          const repair = evaluation.actions.find(
            (action) => action.reason === 'EXIT_COVERAGE_UPSIZE',
          );
          if (position > covered) {
            expect(repair?.desired).toMatchObject({
              price: snapshot.input.openOrders[0]!.price,
              quantity: position,
            });
            // Below 75% coverage the same-price TP is replaced; above it, kept.
            expect(
              evaluateDecibelReplacementDecisionV1(repair!, snapshot, 0, 30000, 50)?.cancel,
            ).toBe(isDecibelTPCoverageSeverelyUndersizedV1(covered, position));
            const stale = {
              ...snapshot,
              practicalCapacityInputs: {
                ...snapshot.practicalCapacityInputs!,
                accountObservedAt: snapshot.input.now - 5001,
              },
            };
            expect(
              evaluateDecibelReplacementDecisionV1(repair!, stale, 60000, 30000, 50)?.cancel,
            ).toBe(false);
            const pending = {
              ...snapshot,
              input: {
                ...snapshot.input,
                pendingCancelOrderIds: [snapshot.input.openOrders[0]!.venueOrderId],
                pendingExitQuantityBase: position,
              },
            };
            const pendingPlan = evaluateDecibelAuthenticatedPassiveRecyclingV1(pending.input, {
              minimumNotionalUsd: 10,
              maximumNotionalUsd: 116.8278775,
              availableMarginUsd: 8,
              maximumEffectiveLeverage: 40,
              maximumAbsPositionBase: 0.00145,
              halfSpreadBps: 5,
              makerFeeBps: 0,
              estimatedGasCostUsd: 0,
              adverseSelectionBufferBps: 0,
              safetyMarginBps: 0,
            });
            expect(
              pendingPlan.actions.find(
                (action) => action.side === snapshot.input.openOrders[0]!.side,
              ),
            ).toMatchObject({ action: 'BLOCKED', reason: 'EXIT_CANCEL_RECONCILIATION_PENDING' });
          } else expect(repair).toBeUndefined();
          expect(calculateDecibelExitCoverageV1(snapshot.input).CONFIRMED_EXIT_COVERAGE_QTY).toBe(
            covered,
          );
        }
        const oldTP = initial.input.openOrders[0]!;
        const priceChange = {
          action: 'WOULD_REPLACE' as const,
          side: oldTP.side,
          current: oldTP,
          desired: { ...oldTP, quantity: 0.00089, price: oldTP.price - sign * 10, generation: 1 },
          reason: 'EXIT_COVERAGE_UPSIZE',
        };
        expect(
          evaluateDecibelReplacementDecisionV1(priceChange, initial, 60000, 30000, 50, false, 30000)
            ?.cancel,
        ).toBe(false);
        expect(
          evaluateDecibelTPPriceSuitabilityV1(priceChange, initial, 60000, 30000, 50, 30000),
        ).toMatchObject({
          TP_REPRICE_DECISION: 'KEEP',
          TP_REPRICE_REASON: 'KEEP:TP_NO_MATERIAL_EXECUTION_BENEFIT',
        });
        expect(test.calls()).toBe(0);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it('replaces unchanged-price coverage that is smaller than the position', () => {
    const snapshot = inventoryIncident(1, null);
    const current = snapshot.input.openOrders[0]!;
    const action = {
      action: 'WOULD_REPLACE' as const,
      side: current.side,
      current,
      desired: { ...current, quantity: 0.00104, generation: 1 },
      reason: 'EXIT_COVERAGE_UPSIZE',
    };
    // Any undersized TP is replaced at the same price (operator decision 2026-11-14).
    expect(evaluateDecibelReplacementDecisionV1(action, snapshot, 60000, 30000, 50)?.cancel).toBe(
      true,
    );
    const stale = {
      ...inventoryIncident(),
      input: { ...snapshot.input, pendingCancelOrderIds: [current.venueOrderId] },
    };
    expect(
      coordinateDecibelInventoryExitV1(stale, { gapObservedSince: stale.input.now - 1000 }),
    ).toMatchObject({
      COVERAGE_TRANSITION_STATE: 'CANCEL_ACK_PENDING',
      CONFIRMED_EXIT_COVERAGE_QTY: 0,
      COVERAGE_GAP_MS: 1000,
    });
  });
  it.each([1, -1])(
    'replaces an unchanged-price TP that is smaller than the position (%s)',
    (sign) => {
      const incident = inventoryIncident(sign);
      const resting = incident.input.openOrders[0]!;
      const position = Math.abs(incident.input.actualInventoryBase);
      const small = { ...resting, quantity: 0.00003 };
      const snapshot = { ...incident, input: { ...incident.input, openOrders: [small] } };
      const action = (current: typeof resting) => ({
        action: 'WOULD_REPLACE' as const,
        side: current.side,
        current,
        desired: { ...current, quantity: position, generation: 1 },
        reason: 'EXIT_COVERAGE_UPSIZE',
      });
      expect(isDecibelTPCoverageSeverelyUndersizedV1(0.00003, position)).toBe(true);
      expect(isDecibelTPCoverageSeverelyUndersizedV1(position * 0.95, position)).toBe(true);
      expect(isDecibelTPCoverageSeverelyUndersizedV1(position, position)).toBe(false);
      const decision = evaluateDecibelReplacementDecisionV1(
        action(small),
        snapshot,
        60000,
        30000,
        50,
      );
      // Cancel/replace at the same price through the verified coverage workflow.
      expect(decision).toMatchObject({ cancel: true, reason: 'EXIT_COVERAGE_UPSIZE' });
    },
  );
  it.each([1, -1])(
    'enforces aggregate integer-lot no-flip preflight before and after a partial fill (%s)',
    (sign) => {
      const snapshot = inventoryIncident(sign);
      const side = sign > 0 ? 'SELL' : 'BUY';
      const price = snapshot.input.openOrders[0]!.price;
      const create = (quantity: number) =>
        buildDecibelExecutionIntentV1({
          sessionId: 'session',
          cycleSequence: 2,
          action: 'PLACE',
          market: 'BTC/USD',
          side,
          price,
          quantity,
          tickSize: 0.1,
          lotSize: 0.00001,
          clientOrderId: `${side === 'BUY' ? 'd1b' : 'd1s'}${'b'.repeat(29)}`,
          knownVenueOrderId: null,
          sourceStateHash: 'aggregate-test',
          strategyDecisionHash: 'aggregate-test',
          createdAt: snapshot.input.now,
          reduceOnly: true,
          executionRole: 'INVENTORY_REDUCING_MAKER',
        });
      const limits = {
        tickSize: 0.1,
        lotSize: 0.00001,
        minimumSize: 0.00002,
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 200,
        maximumReductionQuantity: 0.00104,
        openOrders: [{ side, quantity: 0.00091 }],
        permittedSide: side,
      };
      expect(() => validateDecibelPlaceIntentV1(create(0.00013), limits)).not.toThrow();
      expect(() => validateDecibelPlaceIntentV1(create(0.00014), limits)).toThrow(
        'EXECUTION_PREFLIGHT_REJECTED',
      );
      expect(() =>
        validateDecibelPlaceIntentV1(create(0.00013), {
          ...limits,
          maximumReductionQuantity: 0.00103,
          openOrders: [{ side, quantity: 0.0009 }],
        }),
      ).not.toThrow();
      expect(() =>
        validateDecibelPlaceIntentV1(create(0.00013), {
          ...limits,
          maximumReductionQuantity: 0.00103,
        }),
      ).toThrow('EXECUTION_PREFLIGHT_REJECTED');
    },
  );
  const defensiveContext = (snapshot: decibel_production_live_snapshot_v1) => ({
    positionObservedSince: snapshot.input.now - 30000,
    samples: Array.from({ length: 31 }, (_, i) => ({
      at: snapshot.input.now - 30000 + i * 1000,
      midpoint: (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2,
    })),
  });
  it.each([1, -1])(
    'assesses holding risk without inventing intermediate loss authority (%s)',
    (sign) => {
      const snapshot = inventoryIncident(sign);
      const context = defensiveContext(snapshot);
      const decision = coordinateDecibelInventoryExitV1(snapshot, context);
      expect(decision.DEFENSIVE_EXIT_ELIGIBLE).toBe(false);
      expect(decision.REMAINING_LOSS_BUDGET).toBeGreaterThan(0);
      const emergency = {
        ...snapshot,
        sessionConfiguration: {
          ...snapshot.sessionConfiguration!,
          pnlUsd: -snapshot.sessionConfiguration!.maxLossUsd,
        },
      };
      expect(coordinateDecibelInventoryExitV1(emergency, context)).toMatchObject({
        EXIT_MODE: 'EMERGENCY',
        FINAL_EXIT_DECISION: 'CANONICAL_EMERGENCY_UNWIND',
      });
    },
  );
  it.each([1, -1])(
    'replays sustained stress, sideways and profitable holding without a second loss policy (%s)',
    (sign) => {
      const initial = inventoryIncident(sign);
      const stressed = {
        ...initial,
        sessionConfiguration: {
          ...initial.sessionConfiguration!,
          maxLossUsd: 0.5,
          pnlUsd: -0.3,
          exposureLimits: {
            ...initial.sessionConfiguration!.exposureLimits!,
            effectivePositionLimitUsd: 10,
          },
        },
      };
      expect(coordinateDecibelInventoryExitV1(stressed, defensiveContext(stressed))).toMatchObject({
        DEFENSIVE_EXIT_REASON: 'HOLDING_RISK_POLICY_GAP',
        DEFENSIVE_EXIT_ELIGIBLE: false,
        BLOCKING_EVIDENCE: ['INTERMEDIATE_LOSS_THRESHOLD_NOT_DEFINED'],
      });
      const sideways = coordinateDecibelInventoryExitV1(initial, defensiveContext(initial));
      expect(sideways.DEFENSIVE_EXIT_REASON).toBe('HOLD:HOLDING_RISK_WITHIN_CANONICAL_CAPACITY');
      const profitable = inventoryIncident(sign, 80000);
      expect(
        coordinateDecibelInventoryExitV1(profitable, defensiveContext(profitable))
          .DEFENSIVE_EXIT_REASON,
      ).toBe('HOLD:ADVERSE_MOVEMENT_NOT_SUSTAINED');
    },
  );
  it('fails closed for stale/depth/restart/reversal evidence and takes Max Loss from Settings', () => {
    const snapshot = inventoryIncident();
    const context = defensiveContext(snapshot);
    expect(
      coordinateDecibelInventoryExitV1(snapshot, { ...context, samples: [] })
        .DEFENSIVE_EXIT_ELIGIBLE,
    ).toBe(false);
    const stale = { ...snapshot, input: { ...snapshot.input, now: snapshot.input.now + 10001 } };
    expect(coordinateDecibelInventoryExitV1(stale, context)).toMatchObject({
      EXIT_MODE: 'RECONCILE',
      AUTHENTICATED_POSITION_QTY: null,
    });
    const reversal = {
      ...context,
      samples: [
        ...context.samples.slice(0, -1),
        { at: snapshot.input.now, midpoint: reconstructedBasis + 1 },
      ],
    };
    expect(coordinateDecibelInventoryExitV1(snapshot, reversal).DEFENSIVE_EXIT_REASON).toBe(
      'HOLD:ADVERSE_MOVEMENT_NOT_SUSTAINED',
    );
    const thin = {
      ...snapshot,
      practicalCapacityInputs: {
        ...snapshot.practicalCapacityInputs!,
        bids: [{ price: ExitIncident.bestBid, size: 0.00001 }],
      },
    };
    expect(coordinateDecibelInventoryExitV1(thin, context).DEFENSIVE_EXIT_ELIGIBLE).toBe(false);
    for (const maxLossUsd of [1, 2, 3, 5]) {
      const configured = {
        ...snapshot,
        sessionConfiguration: { ...snapshot.sessionConfiguration!, maxLossUsd, pnlUsd: -0.4 },
      };
      expect(
        coordinateDecibelInventoryExitV1(configured, defensiveContext(configured))
          .REMAINING_LOSS_BUDGET,
      ).toBeCloseTo(maxLossUsd - 0.4);
    }
  });
  it.each([1, -1])('reviews TP price separately from structural validity (%s)', (sign) => {
    const { snapshot, action } = tpPriceFixture(sign);
    expect(
      evaluateDecibelTPPriceSuitabilityV1(action, snapshot, 60000, 30000, 50, 0),
    ).toMatchObject({
      TP_REPRICE_DECISION: 'KEEP',
      TP_REPRICE_REASON: 'KEEP:TP_NO_MATERIAL_EXECUTION_BENEFIT',
    });
    const review = evaluateDecibelTPPriceSuitabilityV1(action, snapshot, 60000, 30000, 50, 30000)!;
    expect(review.TP_REPRICE_DECISION).toBe('KEEP');
    expect(review.TP_EXPECTED_NET_BENEFIT).toBeLessThan(0);
    expect(
      evaluateDecibelReplacementDecisionV1(action, snapshot, 60000, 30000, 50, false, 30000)
        ?.cancel,
    ).toBe(false);
    const tiny = {
      ...action,
      desired: { ...action.desired, price: action.current.price + (sign > 0 ? -0.1 : 0.1) },
    };
    expect(
      evaluateDecibelReplacementDecisionV1(tiny, snapshot, 60000, 30000, 50, false, 30000)?.cancel,
    ).toBe(false);
    const losing = {
      ...snapshot,
      authenticatedPositions: [
        { ...snapshot.authenticatedPositions[0]!, entryPrice: sign > 0 ? 81000 : 79000 },
      ],
    };
    expect(
      evaluateDecibelTPPriceSuitabilityV1(action, losing, 60000, 30000, 50, 30000),
    ).toMatchObject({
      TP_REPRICE_DECISION: 'KEEP',
      TP_REPRICE_REASON: 'KEEP:TP_NET_PROFIT_NOT_PROVEN',
    });
    const marketable = {
      ...action,
      current: { ...action.current, price: sign > 0 ? 79800 : 80200 },
    };
    const active = { ...snapshot, input: { ...snapshot.input, openOrders: [marketable.current] } };
    expect(
      evaluateDecibelReplacementDecisionV1(marketable, active, 60000, 30000, 50, false, 30000),
    ).toMatchObject({ cancel: false, reason: 'KEEP:TP_ALREADY_EXECUTABLE_AWAIT_RECONCILIATION' });
    expect(
      evaluateDecibelTPPriceSuitabilityV1(
        action,
        { ...snapshot, authenticatedPositions: [] },
        60000,
        30000,
        50,
        30000,
      ),
    ).toMatchObject({ TP_REPRICE_DECISION: 'KEEP', TP_PRICE_SUITABILITY: 'UNKNOWN' });
    const unavailablePnl = {
      ...snapshot,
      sessionConfiguration: { ...snapshot.sessionConfiguration!, pnlUsd: null },
    };
    expect(
      evaluateDecibelTPPriceSuitabilityV1(action, unavailablePnl, 60000, 30000, 50, 30000),
    ).toMatchObject({
      TP_REPRICE_DECISION: 'KEEP',
      TP_REPRICE_REASON: 'KEEP:TP_REPLACEMENT_PREFLIGHT_BLOCKED',
    });
    const risk = {
      ...snapshot,
      sessionConfiguration: {
        ...snapshot.sessionConfiguration!,
        pnlUsd: -snapshot.sessionConfiguration!.maxLossUsd,
      },
    };
    expect(
      evaluateDecibelTPPriceSuitabilityV1(action, risk, 60000, 30000, 50, 30000),
    ).toMatchObject({
      TP_REPRICE_DECISION: 'RISK_EXIT',
      TP_REPRICE_REASON: 'RISK_EXIT:EXISTING_CANONICAL_UNWIND',
    });
    const delayed = {
      ...snapshot,
      input: { ...snapshot.input, pendingCancelOrderIds: ['confirmed-tp'] },
    };
    expect(
      evaluateDecibelTPPriceSuitabilityV1(action, delayed, 60000, 30000, 50, 30000)
        ?.TP_REPRICE_DECISION,
    ).toBe('KEEP');
  });
  it.each([
    [1, false, false],
    [-1, false, false],
    [1, true, false],
    [-1, true, false],
    [1, false, true],
    [-1, false, true],
  ] as const)(
    'keeps TP despite advisory reprice without atomic replacement (%s, reversal=%s, inventoryGrowth=%s)',
    async (sign, reversal, inventoryGrowth) => {
      const frames = Array.from(
        { length: 75 },
        (_, i) => tpPriceFixture(sign, 20000 + i * 2000).snapshot,
      );
      if (reversal) {
        const frame = frames[20]!;
        const middle = sign > 0 ? 82000 : 78000;
        frame.input.book = { ...frame.input.book, bestBid: middle - 1, bestAsk: middle + 1 };
      }
      if (inventoryGrowth) {
        for (const frame of frames.slice(45)) {
          frame.input.actualInventoryBase = sign * 0.00087;
          frame.authenticatedPositions = frame.authenticatedPositions.map((p) => ({
            ...p,
            size: sign * 0.00087,
            entryPrice: p.entryPrice + sign * 10,
          }));
        }
      }
      const first = frames[0]!;
      const test = make({
        snapshots: frames.flatMap((frame) => [frame, frame]),
        reconciliationState: 'ORDER_OPEN',
      });
      const order = first.input.openOrders[0]!;
      const owned = buildDecibelExecutionIntentV1({
        sessionId: first.input.sessionId,
        cycleSequence: 0,
        action: 'PLACE',
        market: 'BTC/USD',
        side: order.side,
        price: order.price,
        quantity: order.quantity,
        tickSize: first.input.metadata.tickSize,
        lotSize: first.input.metadata.lotSize,
        clientOrderId: order.clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: 'original-tp',
        strategyDecisionHash: 'original-tp',
        createdAt: 1000,
        reduceOnly: true,
        executionRole: 'INVENTORY_REDUCING_MAKER',
      });
      test.journal.prepare(owned);
      test.journal.transition(owned.intentId, 'ACKNOWLEDGED', 1000, order.venueOrderId);
      const reviews: unknown[] = [];
      for (let i = 0; i < 75; i++) {
        const result = await test.orchestrator.evaluateOnce();
        reviews.push({
          review: result.tpPricing,
          reason: result.controlSnapshot.exactReason,
          actions: result.evaluation?.actions,
        });
        if (result.tpPricing?.TP_REPRICE_DECISION === 'REPRICE') {
          expect(i).toBeGreaterThanOrEqual(reversal ? 66 : 45); // existing THIN regime minimum is 90 seconds
          expect(result.controlSnapshot.cancelReason).toBeNull();
          if (inventoryGrowth) {
            expect(result.evaluation?.actualInventoryBase).toBe(sign * 0.00087);
            expect(result.controlSnapshot.cancelReason).toBeNull();
          }
          break;
        }
        expect(result.controlSnapshot.cancelReason ?? '').not.toContain('REPRICE:TP_');
      }
      expect(reviews.length).toBeGreaterThan(0);
      expect(test.submitted()).toEqual([]);
      expect(test.calls()).toBe(0); // isolated dry-run only
      await test.orchestrator.close();
    },
  );
  it.each([1, -1])(
    'protects TP replacement profitability across failure and restart (%s)',
    async (sign) => {
      const { snapshot: base, action } = tpPriceFixture(sign);
      const snapshot = {
        ...base,
        availableMarginUsd: 0,
        strategyAllocationRemainingUsd: 0,
        maximumNotionalUsd: 0,
        input: { ...base.input, openOrders: [] },
        authenticatedPositions: [
          { ...base.authenticatedPositions[0]!, entryPrice: sign > 0 ? 81000 : 79000 },
        ],
      };
      const path = join(mkdtempSync(join(tmpdir(), 'decibel-tp-restart-')), 'journal.sqlite');
      for (let restart = 0; restart < 2; restart++) {
        const test = make({
          journalPath: path,
          snapshots: Array.from({ length: 6 }, () => snapshot),
          environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        });
        if (restart === 0) {
          const cancel = buildDecibelExecutionIntentV1({
            sessionId: base.input.sessionId,
            cycleSequence: 99,
            action: 'CANCEL',
            market: 'BTC/USD',
            side: action.side,
            price: action.current.price,
            quantity: 0.00074,
            tickSize: base.input.metadata.tickSize,
            lotSize: base.input.metadata.lotSize,
            clientOrderId: action.current.clientOrderId,
            knownVenueOrderId: action.current.venueOrderId,
            sourceStateHash: 'cancel-proof',
            strategyDecisionHash: 'cancel-proof',
            createdAt: 1000,
            cancelReason: 'REPRICE:TP_NET_PROFIT_AND_EXECUTION_DISTANCE',
          });
          test.journal.prepare(cancel);
          test.journal.transition(cancel.intentId, 'APPLIED', 1001, action.current.venueOrderId);
        }
        expect(test.journal.hasTPRepriceCancellation(base.input.sessionId, action.side)).toBe(true);
        const blocked = await test.orchestrator.evaluateOnce();
        expect(blocked.blocker).toBe('TP_REPLACEMENT_NET_PROFIT_NOT_PROVEN');
        expect(test.calls()).toBe(0);
        await test.orchestrator.close();
      }
      const restored = { ...snapshot, authenticatedPositions: base.authenticatedPositions };
      const retry = make({
        journalPath: path,
        snapshots: Array.from({ length: 8 }, () => restored),
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      });
      expect((await retry.orchestrator.evaluateOnce()).action).toBe('ACKNOWLEDGED');
      await retry.orchestrator.evaluateOnce();
      expect(retry.calls()).toBe(1);
      expect(retry.submitted()).toEqual([{ action: 'PLACE', side: action.side }]);
      await retry.orchestrator.close();
    },
  );
  it('continues TP suitability evaluation while an independent entry requires RISK_INVALID cancellation', async () => {
    const frames = Array.from(
      { length: 50 },
      (_, i) => tpPriceFixture(-1, 20000 + i * 2000).snapshot,
    );
    for (const frame of frames) {
      frame.input.openOrders.push({
        ...frame.input.openOrders[0]!,
        venueOrderId: 'entry-sell',
        clientOrderId: 'd1s' + 'b'.repeat(29),
        side: 'SELL',
        price: 81000,
        quantity: 0.00013,
        reduceOnly: false,
      });
    }
    const first = frames[0]!;
    const test = make({
      snapshots: frames.flatMap((frame) => [frame, frame]),
      reconciliationState: 'ORDER_OPEN',
    });
    for (const order of first.input.openOrders) {
      const owned = buildDecibelExecutionIntentV1({
        sessionId: first.input.sessionId,
        cycleSequence: 0,
        action: 'PLACE',
        market: 'BTC/USD',
        side: order.side,
        price: order.price,
        quantity: order.quantity,
        tickSize: first.input.metadata.tickSize,
        lotSize: first.input.metadata.lotSize,
        clientOrderId: order.clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: order.venueOrderId,
        strategyDecisionHash: order.venueOrderId,
        createdAt: 1000,
        reduceOnly: order.reduceOnly,
        executionRole: order.reduceOnly ? 'INVENTORY_REDUCING_MAKER' : 'STANDARD_MAKER',
      });
      test.journal.prepare(owned);
      test.journal.transition(owned.intentId, 'ACKNOWLEDGED', 1000, order.venueOrderId);
    }
    test.orchestrator.requestRiskReduction(true);
    let result = await test.orchestrator.evaluateOnce();
    expect(result.controlSnapshot.cancelReason).toBe('RISK_INVALID:REDUCE_ONLY_REQUIRED');
    expect(result.tpPricing?.TP_REPRICE_DECISION).toBe('KEEP');
    for (let i = 1; i < 48; i++) result = await test.orchestrator.evaluateOnce();
    expect(result.tpPricing?.TP_REPRICE_DECISION).toBe('KEEP');
    expect(result.controlSnapshot.cancelReason).toBe('RISK_INVALID:REDUCE_ONLY_REQUIRED');
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });
  it('reserves a $50 remaining target for BOTH flat quotes instead of spending it all on the first side', async () => {
    const snapshot = twoSidedSnapshot(0, 50),
      test = make({ snapshots: [snapshot, snapshot] });
    const result = await test.orchestrator.evaluateOnce();
    const bid = result.evaluation!.desiredBid!,
      ask = result.evaluation!.desiredAsk!;
    expect(bid).not.toBeNull();
    expect(ask).not.toBeNull();
    expect(bid.quantity * bid.price + ask.quantity * ask.price).toBeLessThanOrEqual(50 + 1e-8);
    expect(bid.quantity * bid.price).toBeGreaterThanOrEqual(10);
    expect(ask.quantity * ask.price).toBeGreaterThanOrEqual(10);
    await test.orchestrator.close();
  });

  it('justifies one-sided flat planning when the remaining target cannot fund two executable minimums', async () => {
    const snapshot = twoSidedSnapshot(0, 15),
      test = make({ snapshots: [snapshot, snapshot] });
    const result = await test.orchestrator.evaluateOnce();
    const e = result.evaluation!;
    const orders = [e.desiredBid, e.desiredAsk].filter((order) => order !== null);
    expect(orders).toHaveLength(1);
    expect(orders[0]!.quantity * orders[0]!.price).toBeGreaterThanOrEqual(10);
    expect(orders[0]!.quantity * orders[0]!.price).toBeLessThanOrEqual(15);
    expect([e.bidEligibilityReason, e.askEligibilityReason]).toContain(
      'COMBINED_BUDGET_BELOW_TWO_SIDE_MINIMUM',
    );
    await test.orchestrator.close();
  });
  it('releases an ACK side only from exact terminal cancellation and preserves release across restart', async () => {
    const snapshot = twoSidedSnapshot(0, 50);
    const path = join(mkdtempSync(join(tmpdir(), 'decibel-side-release-')), 'journal.sqlite');
    const test = make({
      journalPath: path,
      snapshots: [snapshot, snapshot],
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
    });
    const first = await test.orchestrator.evaluateOnce();
    const body = test.journal.getIntent(first.intentId!)!;
    const row = test.journal.get(first.intentId!)!;
    expect(test.journal.findNonTerminalPlaceBySide(body.side)?.intentId).toBe(body.intentId);
    // No OPEN projection or FLAT inventory alone is allowed to release the ACK.
    expect(snapshot.input.openOrders).toHaveLength(0);
    expect(test.journal.findNonTerminalPlaceBySide(body.side)).not.toBeNull();
    const exact = {
      intentId: body.intentId,
      reconciliationState: 'ORDER_CANCELLED',
      terminalStatus: 'CANCELLED_EXTERNALLY' as const,
      source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
      matchedIdentifier: `venueOrderId:${row.venueOrderId}`,
      venueStatus: 'CANCELLED',
      remainingQuantity: body.quantity,
      transactionHash: null,
      venueOrderId: row.venueOrderId,
      clientOrderId: body.clientOrderId,
      observedAt: snapshot.input.now + 1,
      fills: [],
    };
    test.journal.applyAuthoritativeReconciliation(exact);
    test.journal.applyAuthoritativeReconciliation(exact);
    expect(test.journal.findNonTerminalPlaceBySide(body.side)).toBeNull();
    await test.orchestrator.close();
    const reopened = new decibel_execution_lifecycle_journal_v1(path);
    expect(reopened.findNonTerminalPlaceBySide(body.side)).toBeNull();
    expect(reopened.getActiveIdentityConflict()).toBeNull();
    reopened.close();
  });
  it('adds the second flat quote without double-reserving the first ACK/resting order', async () => {
    const snapshot = twoSidedSnapshot(0, 50),
      next = { ...snapshot };
    const test = make({
      snapshots: [snapshot, snapshot, next, next],
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      reconciliationState: 'ORDER_OPEN',
    });
    const first = await test.orchestrator.evaluateOnce();
    expect(first.action).toBe('ACKNOWLEDGED');
    const body = test.journal.getIntent(first.intentId!)!;
    const row = test.journal.get(first.intentId!)!;
    const open = {
      ...body,
      venueOrderId: row.venueOrderId!,
      strategyConfigId: snapshot.input.strategyConfigId,
      market: snapshot.input.market,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    };
    Object.assign(next, {
      sourceStateHash: 'second-side-snapshot',
      availableMarginUsd: snapshot.availableMarginUsd - (body.price * body.quantity) / 40,
      authenticatedAvailableMarginUsd: 8.05 - (body.price * body.quantity) / 40,
      strategyAllocationRemainingUsd: 2.54 - (body.price * body.quantity) / 40,
      input: { ...snapshot.input, openOrders: [open] },
    });
    const second = await test.orchestrator.evaluateOnce();
    expect(second.action, JSON.stringify({ reason: second.blocker, e: second.evaluation })).toBe(
      'ACKNOWLEDGED',
    );
    const other = test.journal.getIntent(second.intentId!)!;
    expect(other.side).not.toBe(body.side);
    expect(test.calls()).toBe(2);
    expect(body.price * body.quantity + other.price * other.quantity).toBeLessThanOrEqual(
      50 + 1e-8,
    );
    expect(second.evaluation?.desiredBid).not.toBeNull();
    expect(second.evaluation?.desiredAsk).not.toBeNull();
    const partial = {
      ...next,
      input: {
        ...next.input,
        actualInventoryBase: body.side === 'BUY' ? 0.0001 : -0.0001,
        openOrders: [
          open,
          {
            ...other,
            venueOrderId: 'v2',
            strategyConfigId: snapshot.input.strategyConfigId,
            market: snapshot.input.market,
            orderType: 'LIMIT' as const,
            timeInForce: 'PostOnly' as const,
            postOnly: true,
          },
        ],
      },
    };
    const safety = selectDecibelInventoryCrossingSafetyCancelV1(partial);
    expect(safety?.action?.action).toBe('WOULD_CANCEL');
    expect(safety?.reason).toBe('INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT');
    await test.orchestrator.close();
  });
  it('excludes adverse estimates from both sides of ENTRY admission', async () => {
    const base = twoSidedSnapshot();
    const probe = make({ snapshots: [base, base] });
    const initial = await probe.orchestrator.evaluateOnce();
    const distances = initial.evaluation!.askCandidateCosts.map((row) => row.distanceBps);
    await probe.orchestrator.close();
    const snapshot = {
      ...base,
      economicInputs: {
        ...base.economicInputs!,
        candidateAdverseSelection: distances.map((distanceBps) => ({
          side: 'SELL' as const,
          distanceBps,
          p95AdverseSelectionBps: 30,
          sampleCount: 100,
          observedAt: base.input.now,
        })),
      },
    };
    const test = make({ snapshots: [snapshot, snapshot] });
    const result = await test.orchestrator.evaluateOnce();
    expect(result.tradingDecision.bidEligible).toBe(true);
    expect(result.tradingDecision.askEligible).toBe(true);
    expect(result.evaluation?.askCandidateCosts.length).toBeGreaterThan(0);
    expect(
      result.evaluation?.askCandidateCosts.every(
        (row) => row.adverseSelectionBps === 0 && row.adverseSource === 'NOT_APPLIED',
      ),
    ).toBe(true);
    await test.orchestrator.close();
  });
  it('respects Max Loss for both proposed sides', async () => {
    const snapshot = twoSidedSnapshot();
    const stopped = {
      ...snapshot,
      sessionConfiguration: {
        ...snapshot.sessionConfiguration!,
        pnlUsd: -2,
        riskBlocker: 'SESSION_MAX_LOSS_REACHED',
      },
    };
    const test = make({ snapshots: [stopped, stopped] });
    const result = await test.orchestrator.evaluateOnce();
    expect(result.tradingDecision.state).toBe('STOP');
    expect(result.tradingDecision.bidEligible).toBe(false);
    expect(result.tradingDecision.askEligible).toBe(false);
    expect(test.calls()).toBe(0);
    await test.orchestrator.close();
  });
  it.each([-0.00073, 0.00073])(
    'keeps a strict inventory exit executable at zero entry headroom (%s)',
    async (inventory) => {
      const base = makeDecisionSnapshot();
      const snapshot: decibel_production_live_snapshot_v1 = {
        ...base,
        availableMarginUsd: 0,
        authenticatedAvailableMarginUsd: 7.8,
        maximumNotionalUsd: 0,
        maximumReductionNotionalUsd: 200,
        maximumAbsPositionBase: 0,
        input: { ...base.input, actualInventoryBase: inventory },
        sessionConfiguration: {
          ...base.sessionConfiguration!,
          exposureLimits: {
            ...base.sessionConfiguration!.exposureLimits!,
            effectivePositionLimitUsd: 0,
            currentExposureUsd: 58.4,
            availableHeadroomUsd: 0,
          },
        },
      };
      const side = inventory < 0 ? ('BUY' as const) : ('SELL' as const);
      const price = side === 'BUY' ? 79900 : 80100;
      const decision = evaluateTradingDecision(snapshot, {
        ...context,
        candidate: { side, price, quantity: 0.0005, reduceOnly: true },
      });
      expect(decision).toMatchObject({
        state: 'TRADE',
        newExposurePermitted: false,
        capital: {
          authenticatedAvailableMarginUsd: 7.8,
          strategyAllocationRemainingUsd: 0,
          incrementalExposureHeadroomUsd: 0,
          existingReductionQuantityBtc: 0.00073,
        },
        actionPlan: { [side]: { kind: 'REDUCE', eligible: true } },
      });
      const entering = inventory < 0 ? ('SELL' as const) : ('BUY' as const);
      expect(
        evaluateTradingDecision(snapshot, {
          ...context,
          candidate: {
            side: entering,
            price: entering === 'BUY' ? 79900 : 80100,
            quantity: 0.0005,
          },
        }).state,
      ).toBe('WAIT');
      const test = make({ snapshots: [snapshot, snapshot] });
      const result = await test.orchestrator.evaluateOnce();
      expect(
        result.action,
        JSON.stringify({
          reason: result.blocker,
          evaluation: result.evaluation,
          decision: result.tradingDecision,
        }),
      ).toBe('DRY_RUN_PREPARED');
      const intent = test.journal.getIntent(result.intentId!);
      expect(intent).toMatchObject({
        side,
        reduceOnly: true,
        executionRole: 'INVENTORY_REDUCING_MAKER',
      });
      expect(intent!.quantity).toBeLessThanOrEqual(Math.abs(inventory));
      expect(result.latency?.authenticatedReadMs).toBeGreaterThanOrEqual(0);
      expect(result.tradingDecision.actionPlan[side].kind).toBe('REDUCE');
      await test.orchestrator.close();
    },
  );

  it('replays the $7+ margin SHORT through reducing quote, partial fill, cancel and canonical unwind', async () => {
    const root = mkdtempSync(join(tmpdir(), 'decibel-short-replay-'));
    const journal = new decibel_execution_lifecycle_journal_v1(join(root, 'journal.sqlite'));
    let now = 20000,
      inventory = -0.00073,
      writes = 0,
      iocs = 0;
    let ledger = createDecibelActualFillLedgerV1([]);
    const open = new Map<
      string,
      decibel_production_live_snapshot_v1['input']['openOrders'][number]
    >();
    const terminal = new Map<string, 'FULL_FILL' | 'ORDER_CANCELLED'>();
    journal.applyFill({
      fillId: 'fixture-baseline-short',
      intentId: null,
      side: 'SELL',
      quantity: 0.00073,
      price: 80000,
      strategyLineage: false,
      makerProven: false,
      externalCounterparty: false,
      observedAt: 19000,
    });
    const snapshot = (): decibel_production_live_snapshot_v1 => {
      now += 10;
      const base = makeDecisionSnapshot(now);
      return {
        ...base,
        sourceStateHash: `short-replay-${now}`,
        availableMarginUsd: 0,
        authenticatedAvailableMarginUsd: 7.8,
        maximumNotionalUsd: 0,
        maximumReductionNotionalUsd: 200,
        maximumAbsPositionBase: 0,
        input: {
          ...base.input,
          actualInventoryBase: inventory,
          actualFillLedger: ledger,
          openOrders: [...open.values()],
        },
        sessionConfiguration: {
          ...base.sessionConfiguration!,
          exposureLimits: {
            ...base.sessionConfiguration!.exposureLimits!,
            effectivePositionLimitUsd: 0,
            currentExposureUsd: Math.abs(inventory) * 80000,
            availableHeadroomUsd: 0,
          },
        },
      };
    };
    const fill = (
      order: {
        venueOrderId: string;
        clientOrderId: string;
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
      },
      maker: boolean,
    ) => {
      inventory = Number(
        (inventory + (order.side === 'BUY' ? order.quantity : -order.quantity)).toFixed(12),
      );
      ledger = {
        ...ledger,
        orders: [
          ...ledger.orders,
          {
            venueOrderId: order.venueOrderId,
            localIntentId: order.clientOrderId,
            localExecutionRequestId: order.clientOrderId,
            marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
            side: order.side,
            requestedQuantity: order.quantity,
          },
        ],
      };
      const exact = {
        venueFillId: `fragment-${order.venueOrderId}`,
        venueOrderId: order.venueOrderId,
        localExecutionRequestId: order.clientOrderId,
        marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
        side: order.side,
        executedPrice: order.price,
        executedBaseQuantity: order.quantity,
        executedUsdNotional: order.price * order.quantity,
        makerOrTaker: maker ? ('MAKER' as const) : ('TAKER' as const),
        receivedAt: new Date(now),
        venueTimestamp: new Date(now),
        transactionVersion: String(9000 + writes),
        fee: { availability: 'AVAILABLE' as const, amount: 0, currency: 'USD' },
        rebate: { availability: 'AVAILABLE' as const, amount: 0, currency: 'USD' },
        executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
      };
      ledger = applyDecibelActualFillTruthV1(ledger, exact);
      expect(applyDecibelActualFillTruthV1(ledger, exact)).toBe(ledger);
    };
    const source: DecibelProductionLiveStateSourceV1 = {
      readAuthenticatedSnapshot: () => Promise.resolve(snapshot()),
      readAuthenticatedSnapshotAfterMutation: () => Promise.resolve(snapshot()),
      reconcileIntent: (_intent, _snapshot, id) =>
        Promise.resolve(
          id && open.has(id) ? 'PARTIAL_FILL' : (terminal.get(id ?? '') ?? 'ORDER_NOT_FOUND'),
        ),
      revalidateCancelTarget: (intent) =>
        Promise.resolve(
          open.has(intent.expectedPreviousVenueOrderId)
            ? 'ORDER_OPEN'
            : (terminal.get(intent.expectedPreviousVenueOrderId) ?? 'UNRESOLVED'),
        ),
    };
    const executor: DecibelProductionExecutionExecutorV1 = {
      placePostOnlyLimit: (intent) => {
        writes++;
        expect(intent).toMatchObject({ side: 'BUY', reduceOnly: true });
        expect(intent.quantity).toBeLessThanOrEqual(Math.abs(inventory));
        const id = `maker-${writes}`;
        open.set(id, {
          ...intent,
          venueOrderId: id,
          strategyConfigId: makeSnapshot().input.strategyConfigId,
          market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
          orderType: 'LIMIT',
        });
        return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: id });
      },
      cancelExactOrder: (intent) => {
        writes++;
        open.delete(intent.expectedPreviousVenueOrderId);
        terminal.set(intent.expectedPreviousVenueOrderId, 'ORDER_CANCELLED');
        return Promise.resolve({ outcome: 'CANCEL_CONFIRMED' });
      },
      placeReduceOnlyImmediateOrCancel: (intent) => {
        writes++;
        iocs++;
        expect(intent).toMatchObject({ side: 'BUY', reduceOnly: true });
        expect(intent.quantity).toBeLessThanOrEqual(Math.abs(inventory));
        const id = `ioc-${writes}`;
        fill({ ...intent, venueOrderId: id }, false);
        terminal.set(id, 'FULL_FILL');
        return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: id });
      },
    };
    const config = parseDecibelProductionLiveConfigurationV1({
      DECIBEL_EXECUTION_MODE: 'production',
      DECIBEL_EXECUTION_RELEASE_STAGE: 'CANARY',
      DECIBEL_EXECUTOR_ENABLED: 'true',
      DECIBEL_EXECUTOR_DRY_RUN: 'false',
    });
    const actor = new decibel_production_live_orchestrator_v1(
      journal,
      source,
      executor,
      config,
      {
        maxPlaceAttemptsPerMinute: 20,
        maxCancelAttemptsPerMinute: 20,
        maxTotalMutationAttemptsPerMinute: 40,
        maxConsecutiveUnknownOutcomes: 1,
        maxKnownLiveOrders: 2,
      },
      undefined,
      () => now,
    );
    expect((await actor.evaluateOnce()).action).toBe('ACKNOWLEDGED');
    const resting = [...open.values()][0]!;
    const partial = Math.min(0.0003, resting.quantity);
    fill({ ...resting, quantity: partial }, true);
    open.set(resting.venueOrderId, {
      ...resting,
      quantity: Number((resting.quantity - partial).toFixed(12)),
    });
    const count = writes;
    const managed = await actor.evaluateOnce();
    expect(writes).toBe(count); // owned resting residual, never duplicate the BUY
    expect(managed.blocker).not.toBe('ORDER_IDENTITY_CONFLICT');
    actor.requestSessionUnwind();
    for (let i = 0; i < 20 && !actor.isSessionUnwindComplete(); i++) await actor.evaluateOnce();
    expect(actor.isSessionUnwindComplete()).toBe(true);
    expect(inventory).toBe(0);
    expect(open.size).toBe(0);
    expect(iocs).toBe(1);
    expect(journal.nonTerminal()).toHaveLength(0);
    expect(journal.ledger().inventory).toBeCloseTo(0, 12);
    await actor.close();
    const restarted = new decibel_execution_lifecycle_journal_v1(join(root, 'journal.sqlite'));
    expect(restarted.ledger().inventory).toBeCloseTo(0, 12);
    expect(restarted.nonTerminal()).toHaveLength(0);
    restarted.close();
  });
  it('keeps reducing orders fail-closed when exit evidence is stale or ownership conflicts', () => {
    const base = makeDecisionSnapshot();
    const snapshot = {
      ...base,
      maximumNotionalUsd: 0,
      maximumReductionNotionalUsd: 200,
      input: { ...base.input, actualInventoryBase: -0.00073 },
    };
    const candidate = { side: 'BUY' as const, price: 79900, quantity: 0.0005, reduceOnly: true };
    const stale = {
      ...snapshot,
      practicalCapacityInputs: {
        ...snapshot.practicalCapacityInputs!,
        venueMarginRules: {
          ...snapshot.practicalCapacityInputs!.venueMarginRules!,
          observedAt: 10000,
          markObservedAt: 10000,
        },
      },
    };
    expect(evaluateTradingDecision(stale, { ...context, candidate }).state).toBe('WAIT');
    expect(
      evaluateTradingDecision(snapshot, {
        ...context,
        candidate,
        identityConflict: 'ORDER_IDENTITY_CONFLICT',
      }).state,
    ).toBe('STOP');
    expect(
      evaluateTradingDecision(snapshot, { ...context, candidate, unresolvedIntentCount: 1 }).state,
    ).toBe('WAIT');
    const pending = {
      ...snapshot,
      input: {
        ...snapshot.input,
        openOrders: [
          {
            ...makeSnapshot().input.openOrders[0]!,
            strategyConfigId: snapshot.input.strategyConfigId,
            side: 'BUY' as const,
            price: 79900,
            quantity: 0.0003,
          },
        ],
      },
    };
    expect(evaluateTradingDecision(pending, { ...context, candidate }).bidEligible).toBe(false);
  });
  it('is pure, includes executable sizes/provenance and does not use legacy $50', () => {
    const source = makeDecisionSnapshot();
    const original = JSON.stringify(source);
    const first = evaluateTradingDecision(source, context);
    expect(first).toMatchObject({
      state: 'TRADE',
      newExposurePermitted: true,
      executablePositionLimitUsd: 118.4,
      perOrder: { BUY: 0.0005, SELL: null },
      evidence: { ledgerVersion: '123', sessionId: 'session' },
    });
    expect(first).toEqual(evaluateTradingDecision(source, context));
    expect(JSON.stringify(source)).toBe(original);
  });
  it('automatically moves WAIT -> TRADE when lifecycle costs improve, without a session restart', () => {
    const base = makeDecisionSnapshot();
    const source = { ...base, economicInputs: { ...base.economicInputs!, makerFeeBps: 9.5 } };
    const small = { ...context, candidate: { ...context.candidate, quantity: 0.00013 } };
    const expensive = evaluateTradingDecision(source, small);
    expect(expensive).toMatchObject({
      state: 'WAIT',
      primaryReason: 'LIFECYCLE_COST_BUDGET_EXCEEDED',
      newExposurePermitted: false,
    });
    expect(expensive.costs.bidBps).toBeCloseTo(
      1.5 + (2 * 0.0004662997 * 10000) / (79900 * 0.00013) + 8 + 1,
    );
    expect(expensive.costs.remainingSessionLossUsd).toBe(2);
    expect(
      evaluateTradingDecision(
        { ...source, economicInputs: { ...source.economicInputs, makerFeeBps: 1.5 } },
        small,
      ).state,
    ).toBe('TRADE');
  });
  it.each(['MISSING', 'STALE'] as const)(
    'recovers %s capacity evidence when fresh inputs arrive',
    (reason) => {
      const source = makeDecisionSnapshot();
      const impaired: decibel_production_live_snapshot_v1 =
        reason === 'MISSING'
          ? (() => {
              const missing = { ...source };
              delete missing.practicalCapacityInputs;
              return missing;
            })()
          : {
              ...source,
              practicalCapacityInputs: {
                ...source.practicalCapacityInputs!,
                venueMarginRules: {
                  ...source.practicalCapacityInputs!.venueMarginRules!,
                  observedAt: 10000,
                  markObservedAt: 10000,
                },
              },
            };
      expect(evaluateTradingDecision(impaired, context)).toMatchObject({
        state: 'WAIT',
        evidenceComplete: false,
        newExposurePermitted: false,
      });
      const later = 20000 + DECIBEL_EVIDENCE_FAILURE_STOP_AFTER_MS_V1;
      expect(
        evaluateTradingDecision(impaired, {
          ...context,
          now: later,
          mandatoryEvidenceFailureSince: 20000,
        }).state,
      ).toBe('STOP');
      expect(
        evaluateTradingDecision(makeDecisionSnapshot(later), {
          ...context,
          now: later,
          mandatoryEvidenceFailureSince: 20000,
        }).state,
      ).toBe('TRADE');
    },
  );
  it.each(['MISSING', 'STALE', 'COST'])(
    'automatically resumes the same runtime after %s recovery',
    async (reason) => {
      const healthy = makeDecisionSnapshot();
      const impaired = { ...healthy };
      if (reason === 'MISSING') delete impaired.practicalCapacityInputs;
      else if (reason === 'STALE')
        impaired.practicalCapacityInputs = {
          ...healthy.practicalCapacityInputs!,
          venueMarginRules: {
            ...healthy.practicalCapacityInputs!.venueMarginRules!,
            observedAt: 10000,
            markObservedAt: 10000,
          },
        };
      else impaired.economicInputs = { ...healthy.economicInputs!, makerFeeBps: 999 };
      const Runtime = make({
        snapshots: [impaired, impaired, healthy, healthy, healthy, healthy, healthy, healthy],
      });
      const first = await Runtime.orchestrator.evaluateOnce();
      expect(first.tradingDecision.state).toBe('WAIT');
      expect(first.mutationInvocations).toBe(0);
      let resumed = false;
      for (let retry = 0; retry < 4 && !resumed; retry++) {
        const next = await Runtime.orchestrator.evaluateOnce();
        resumed = next.tradingDecision.state === 'TRADE';
      }
      expect(resumed).toBe(true);
      expect(Runtime.calls()).toBe(0); // Fake executor remains in dry-run mode.
      await Runtime.orchestrator.close();
    },
  );
  it('returns WAIT for zero headroom, below-minimum sizes and temporary insufficient margin', () => {
    const source = makeDecisionSnapshot();
    for (const change of [
      {
        ...source,
        input: {
          ...source.input,
          openOrders: [
            {
              venueOrderId: 'capacity-held-buy',
              clientOrderId: 'd1b' + 'b'.repeat(29),
              strategyConfigId: source.input.strategyConfigId,
              market: source.input.market,
              side: 'BUY' as const,
              price: 79900,
              quantity: 118.4 / 80000,
              orderType: 'LIMIT' as const,
              timeInForce: 'PostOnly' as const,
              postOnly: true,
            },
          ],
        },
        sessionConfiguration: {
          ...source.sessionConfiguration!,
          exposureLimits: {
            ...source.sessionConfiguration!.exposureLimits!,
            availableHeadroomUsd: 0,
          },
        },
      },
      { ...source, maximumNotionalUsd: 0 },
      { ...source, maximumNotionalUsd: 5 },
    ])
      expect(evaluateTradingDecision(change, context).state).toBe('WAIT');
    expect(
      evaluateTradingDecision(source, {
        ...context,
        blocker: 'INSUFFICIENT_LEVERAGED_BUYING_POWER',
      }).state,
    ).toBe('WAIT');
  });
  it.each([1, 2, 3, 5])('uses Settings Max Loss %s, never a default $2', (maxLossUsd) => {
    const source = makeDecisionSnapshot();
    const breached = {
      ...source,
      sessionConfiguration: { ...source.sessionConfiguration!, maxLossUsd, pnlUsd: -maxLossUsd },
    };
    expect(evaluateTradingDecision(breached, context)).toMatchObject({
      state: 'STOP',
      primaryReason: 'SESSION_MAX_LOSS_REACHED',
      recoveryStatus: 'TERMINAL',
    });
    expect(
      evaluateTradingDecision(source, { ...context, terminalReason: 'SESSION_MAX_LOSS_REACHED' })
        .state,
    ).toBe('STOP');
  });
  it('never assumes a remaining loss budget when active PnL evidence is unknown', () => {
    const healthy = makeDecisionSnapshot();
    const unknown = {
      ...healthy,
      sessionConfiguration: { ...healthy.sessionConfiguration!, pnlUsd: null },
    };
    expect(evaluateTradingDecision(unknown, context)).toMatchObject({
      state: 'WAIT',
      primaryReason: 'SESSION_PNL_EVIDENCE_REQUIRED',
      evidenceComplete: false,
      newExposurePermitted: false,
    });
    expect(evaluateTradingDecision(healthy, { ...context, settingsRevision: 8 })).toMatchObject({
      state: 'STOP',
      primaryReason: 'SESSION_SETTINGS_MISMATCH',
    });
  });
  it('preserves identity/TP ownership and never treats manual FLAT as fill/terminal evidence', () => {
    const source = makeDecisionSnapshot();
    expect(
      evaluateTradingDecision(source, {
        ...context,
        identityConflict: 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
      }).state,
    ).toBe('STOP');
    expect(
      evaluateTradingDecision(
        { ...source, input: { ...source.input, authenticatedSubaccount: 'other' } },
        context,
      ).state,
    ).toBe('STOP');
    const tp = {
      venueOrderId: 'unattributed-tp',
      clientOrderId: '',
      strategyConfigId: null,
      market: source.input.market,
      side: 'SELL' as const,
      price: Number.NaN,
      quantity: Number.NaN,
    };
    expect(
      evaluateTradingDecision(
        { ...source, input: { ...source.input, actualInventoryBase: 0.00073, openOrders: [tp] } },
        context,
      ),
    ).toMatchObject({ state: 'STOP', primaryReason: 'UNRESOLVED_EXTERNAL_ORDER_ACTIVITY' });
    expect(
      evaluateTradingDecision(source, { ...context, identityConflict: 'POSITION_JOURNAL_MISMATCH' })
        .state,
    ).toBe('STOP');
    expect(evaluateTradingDecision(source, { ...context, state: 'STOPPING' })).toMatchObject({
      state: 'STOP',
      newExposurePermitted: false,
    });
  });
});

describe('Authenticated inventory coverage and TP preservation', () => {
  const fixture = (position: number, exitQuantity: number) => {
    const base = makeSnapshot();
    const exitSide = position > 0 ? ('SELL' as const) : ('BUY' as const);
    return {
      ...base.input,
      actualInventoryBase: position,
      openOrders: [
        {
          venueOrderId: 'verified-tp',
          clientOrderId: (exitSide === 'SELL' ? 'd1s' : 'd1b') + 'a'.repeat(29),
          strategyConfigId: base.input.strategyConfigId,
          market: base.input.market,
          side: exitSide,
          price: exitSide === 'SELL' ? 101 : 99,
          quantity: exitQuantity,
          reduceOnly: true,
          orderType: 'LIMIT' as const,
          timeInForce: 'PostOnly' as const,
          postOnly: true,
        },
      ],
    };
  };
  const sizing = {
    minimumNotionalUsd: 0.01,
    maximumNotionalUsd: 100,
    entryHeadroomUsd: 100,
    availableMarginUsd: 100,
    maximumEffectiveLeverage: 1,
    maximumAbsPositionBase: 2,
    maximumAggregateCollateralFraction: 0.5,
    halfSpreadBps: 5,
    makerFeeBps: 0,
    estimatedGasCostUsd: 0,
    adverseSelectionBufferBps: 0,
    safetyMarginBps: 0,
  };
  it.each([1, -1])(
    'replays 5 -> 7 units and restores coverage without price churn (%s)',
    (sign) => {
      const before = fixture(sign * 0.005, 0.005);
      const exitSide = sign > 0 ? 'SELL' : 'BUY';
      const entrySide = sign > 0 ? 'BUY' : 'SELL';
      expect(calculateDecibelExitCoverageV1(before).entryPaused).toBe(false);
      const initial = evaluateDecibelAuthenticatedPassiveRecyclingV1(before, sizing);
      expect(initial.actions.find((a) => a.side === exitSide)).toMatchObject({
        action: 'NO_OP',
        reason: 'KEEP:VALID_REDUCE_ONLY_EXIT',
      });
      const after = { ...before, actualInventoryBase: sign * 0.007 };
      expect(calculateDecibelExitCoverageV1(after)).toMatchObject({
        CONFIRMED_EXIT_COVERAGE_QTY: 0.005,
        PENDING_EXIT_QTY: 0,
        entryPaused: true,
      });
      expect(calculateDecibelExitCoverageV1(after).UNCOVERED_INVENTORY_QTY).toBeCloseTo(0.002);
      const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(after, sizing);
      const replacement = evaluation.actions.find((a) => a.side === exitSide)!;
      expect(replacement).toMatchObject({
        action: 'WOULD_REPLACE',
        reason: 'EXIT_COVERAGE_UPSIZE',
        desired: { quantity: 0.007, price: before.openOrders[0]!.price },
      });
      expect(
        evaluation.actions
          .filter((a) => a.side === entrySide)
          .every((a) => a.action !== 'WOULD_PLACE'),
      ).toBe(true);
      const snapshot = makeSnapshot({ input: after });
      snapshot.authenticatedPositions = [
        {
          market: 'BTC/USD',
          size: after.actualInventoryBase,
          source: 'BOT',
          entryPrice: sign > 0 ? 98 : 102,
        },
      ];
      snapshot.practicalCapacityInputs = {
        accountObservedAt: after.now,
        marketObservedAt: after.now,
        maximumAgeMs: after.maxBboAgeMs,
        actualLeverage: 1,
        venueMaximumLeverage: 1,
        maintenanceMarginUsd: 0,
        marginDeficitUsd: 0,
        equityUsd: 1,
        liquidationPrice: null,
        bids: [{ price: after.book.bestBid, size: 1 }],
        asks: [{ price: after.book.bestAsk, size: 1 }],
        recentMidpoints: [100.1],
        costObservations: (['MAKER_FEE', 'TAKER_FEE'] as const).map((kind) => ({
          kind,
          unit: 'BPS',
          value: 0,
          source: 'AUTHENTICATED_REPLAY_FEE_TIER',
          observedAt: after.now,
          validUntil: after.now + after.maxBboAgeMs,
        })),
      };
      // 5 of 7 units (71%) is below the 75% threshold: replaced at the same price.
      expect(
        evaluateDecibelReplacementDecisionV1(replacement, snapshot, 0, 30000, 50)?.cancel,
      ).toBe(true);
      expect(classifyDecibelCancelV1(replacement)).toBe('STRATEGIC_REPRICE_CANCEL');
      // Cancel remains pending: no replacement can claim working coverage or resubmit.
      const cancelling = {
        ...after,
        pendingCancelOrderIds: ['verified-tp'],
        pendingExitQuantityBase: 0.007,
      };
      expect(calculateDecibelExitCoverageV1(cancelling)).toMatchObject({
        CONFIRMED_EXIT_COVERAGE_QTY: 0,
        PENDING_EXIT_QTY: 0.007,
        entryPaused: true,
      });
      expect(
        evaluateDecibelAuthenticatedPassiveRecyclingV1(cancelling, sizing).actions.find(
          (a) => a.side === exitSide,
        ),
      ).toMatchObject({ action: 'BLOCKED', reason: 'EXIT_CANCEL_RECONCILIATION_PENDING' });
      // Only a newly authenticated working order restores coverage; repeated updates keep it.
      const restored = fixture(sign * 0.007, 0.007);
      for (let i = 0; i < 5; i++) {
        expect(calculateDecibelExitCoverageV1(restored).entryPaused).toBe(false);
        expect(
          evaluateDecibelAuthenticatedPassiveRecyclingV1(restored, sizing).actions.find(
            (a) => a.side === exitSide,
          ),
        ).toMatchObject({ action: 'NO_OP', reason: 'KEEP:VALID_REDUCE_ONLY_EXIT' });
      }
      // Partial TP fill decreases authenticated position and remaining exit together.
      expect(
        calculateDecibelExitCoverageV1(fixture(sign * 0.005, 0.005)).UNCOVERED_INVENTORY_QTY,
      ).toBe(0);
    },
  );
  it.each([1, -1])('rests one maker DCA level only with an admitted growth limit (%s)', (sign) => {
    const covered = fixture(sign * 0.005, 0.005);
    const entrySide = sign > 0 ? 'BUY' : 'SELL';
    const desiredEntry = (
      evaluation: ReturnType<typeof evaluateDecibelAuthenticatedPassiveRecyclingV1>,
    ) => (entrySide === 'BUY' ? evaluation.desiredBid : evaluation.desiredAsk);
    const reason = (
      evaluation: ReturnType<typeof evaluateDecibelAuthenticatedPassiveRecyclingV1>,
    ) => (entrySide === 'BUY' ? evaluation.bidEligibilityReason : evaluation.askEligibilityReason);
    const blocked = evaluateDecibelAuthenticatedPassiveRecyclingV1(covered, sizing);
    expect(desiredEntry(blocked)).toBeNull();
    expect(reason(blocked)).toBe('POSITION_GROWTH_DISABLED');
    // The maker price is beyond the DCA limit: one growth level rests.
    const admitted = evaluateDecibelAuthenticatedPassiveRecyclingV1(covered, {
      ...sizing,
      positionGrowth: { side: entrySide, priceLimit: sign > 0 ? 1e9 : 1e-9 },
    });
    expect(desiredEntry(admitted)).not.toBeNull();
    expect(
      admitted.actions.filter((a) => a.side === entrySide && a.action === 'WOULD_PLACE'),
    ).toHaveLength(1);
    // Not far enough adverse yet.
    const near = evaluateDecibelAuthenticatedPassiveRecyclingV1(covered, {
      ...sizing,
      positionGrowth: { side: entrySide, priceLimit: sign > 0 ? 1e-9 : 1e9 },
    });
    expect(desiredEntry(near)).toBeNull();
    expect(reason(near)).toBe('DCA_ADVERSE_DISTANCE_REQUIRED');
  });
  it.each([1, -1])('keeps the exit and ignores the entry filter with a position (%s)', (sign) => {
    const covered = fixture(sign * 0.005, 0.005);
    const exitSide = sign > 0 ? 'SELL' : 'BUY';
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(covered, {
      ...sizing,
      entryCandleBlockers: { BUY: 'ENTRY_REQUIRES_NEW_LOW', SELL: 'ENTRY_REQUIRES_NEW_HIGH' },
    });
    expect(evaluation.actions.find((a) => a.side === exitSide)?.action).not.toBe('WOULD_CANCEL');
    expect(
      exitSide === 'SELL' ? evaluation.askEligibilityReason : evaluation.bidEligibilityReason,
    ).not.toMatch(/^ENTRY_REQUIRES/);
  });

  it.each([1, -1])(
    'pauses opening orders in extreme volatility and shows the DCA blocker (%s)',
    (sign) => {
      const entrySide = sign > 0 ? 'BUY' : 'SELL';
      const exitSide = sign > 0 ? 'SELL' : 'BUY';
      const reasonOf = (
        evaluation: ReturnType<typeof evaluateDecibelAuthenticatedPassiveRecyclingV1>,
        side: 'BUY' | 'SELL',
      ) => (side === 'BUY' ? evaluation.bidEligibilityReason : evaluation.askEligibilityReason);
      const covered = fixture(sign * 0.005, 0.005);
      const labelled = evaluateDecibelAuthenticatedPassiveRecyclingV1(covered, {
        ...sizing,
        positionGrowthBlocker: 'DCA_RISK_CAPACITY_EXHAUSTED',
      });
      expect(reasonOf(labelled, entrySide)).toBe('DCA_RISK_CAPACITY_EXHAUSTED');
      // With a position, the pause blocks growth but keeps the exit.
      const paused = evaluateDecibelAuthenticatedPassiveRecyclingV1(covered, {
        ...sizing,
        positionGrowth: { side: entrySide, priceLimit: sign > 0 ? 1e9 : 1e-9 },
        entryPauseReason: 'ENTRY_VOLATILITY_PAUSE',
      });
      expect(entrySide === 'BUY' ? paused.desiredBid : paused.desiredAsk).toBeNull();
      expect(reasonOf(paused, entrySide)).toBe('ENTRY_VOLATILITY_PAUSE');
      expect(paused.actions.find((a) => a.side === exitSide)?.action).not.toBe('WOULD_CANCEL');
    },
  );
  it('does not count duplicate order projections or inflight exits as confirmed coverage', () => {
    const source = fixture(0.007, 0.005);
    const duplicated = {
      ...source,
      openOrders: [...source.openOrders, ...source.openOrders],
      pendingExitQuantityBase: 0.002,
      pendingEntryQuantityBase: 0.001,
    };
    expect(calculateDecibelExitCoverageV1(duplicated)).toMatchObject({
      CONFIRMED_EXIT_COVERAGE_QTY: 0.005,
      PENDING_EXIT_QTY: 0.002,
      SAME_DIRECTION_ENTRY_QTY: 0.001,
      entryPaused: true,
    });
  });
  it('keeps valid exits during entry WAIT and requires reconciliation for unknown reduce-only metadata', () => {
    const source = fixture(0.005, 0.005);
    const e = evaluateDecibelAuthenticatedPassiveRecyclingV1(source, {
      ...sizing,
      entryHeadroomUsd: 0,
    });
    expect(e.actions.find((a) => a.side === 'SELL')).toMatchObject({
      action: 'NO_OP',
      reason: 'KEEP:VALID_REDUCE_ONLY_EXIT',
    });
    const unknown = {
      ...source,
      openOrders: source.openOrders.map(({ reduceOnly, ...order }) => {
        expect(reduceOnly).toBe(true);
        return order;
      }),
    };
    expect(calculateDecibelExitCoverageV1(unknown)).toMatchObject({
      metadataUnknown: true,
      entryPaused: true,
      CONFIRMED_EXIT_COVERAGE_QTY: 0,
    });
    expect(
      evaluateDecibelAuthenticatedPassiveRecyclingV1(unknown, sizing).actions.find(
        (a) => a.side === 'SELL',
      ),
    ).toMatchObject({ action: 'BLOCKED', reason: 'EXIT_REDUCE_ONLY_METADATA_UNVERIFIED' });
  });
  it('converts a proven non-reduce-only opposite order instead of treating it as guaranteed coverage', () => {
    const source = fixture(0.005, 0.005);
    const nonreducing = {
      ...source,
      openOrders: source.openOrders.map((order) => ({ ...order, reduceOnly: false })),
    };
    expect(calculateDecibelExitCoverageV1(nonreducing)).toMatchObject({
      CONFIRMED_EXIT_COVERAGE_QTY: 0,
      entryPaused: true,
    });
    expect(
      evaluateDecibelAuthenticatedPassiveRecyclingV1(nonreducing, sizing).actions.find(
        (a) => a.side === 'SELL',
      ),
    ).toMatchObject({ action: 'WOULD_CANCEL', reason: 'RISK_INVALID:REDUCE_ONLY_REQUIRED' });
  });
  it.each([1, -1])(
    'detects and repairs 73/72 coverage before another exit can leave one lot (%s)',
    (sign) => {
      const base = fixture(sign * 0.00073, 0.00072);
      const source = {
        ...base,
        metadata: { ...base.metadata, lotSize: 0.00001, minimumSize: 0.00002 },
      };
      expect(calculateDecibelExitCoverageV1(source)).toMatchObject({
        UNCOVERED_INVENTORY_QTY: 0.00001,
        entryPaused: true,
        uncoveredBelowMinimum: true,
      });
      const result = evaluateDecibelAuthenticatedPassiveRecyclingV1(source, sizing);
      const action = result.actions.find((a) => a.side === (sign > 0 ? 'SELL' : 'BUY'));
      expect(action).toMatchObject({
        action: 'WOULD_REPLACE',
        reason: 'EXIT_COVERAGE_UPSIZE',
        desired: { quantity: 0.00073 },
      });
    },
  );
  it('paces even subminimum uncovered dust and does not weaken canonical unwind', () => {
    const source = fixture(0.0055, 0.005);
    expect(calculateDecibelExitCoverageV1(source).entryPaused).toBe(true);
    const stopping = evaluateDecibelAuthenticatedPassiveRecyclingV1(fixture(0.005, 0.005), {
      ...sizing,
      entryHeadroomUsd: 0,
      sessionUnwindRequested: true,
    });
    expect(stopping.operatingState).toBe('SESSION_UNWIND');
    expect(stopping.desiredAsk?.timeInForce).toBe('ImmediateOrCancel');
    expect(stopping.desiredAsk!.quantity).toBeLessThanOrEqual(source.actualInventoryBase);
  });
});

describe('Authenticated exit reduce-only provenance normalization', () => {
  const row = {
    market: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
    order_id: 'exact-order',
    client_order_id: 'd1s' + 'a'.repeat(29),
    orig_size: 0.0007,
    remaining_size: 0.0005,
    price: 80100,
    is_buy: false,
    is_tpsl: false,
  };
  const history = { ...row, client_order_id: row.client_order_id, is_reduce_only: true };
  it('recovers an omitted live flag only from exact authenticated immutable order identity', () => {
    const result = normalizeDecibelAuthenticatedOpenOrdersV1([row], row.market, 'strategy', [
      history,
    ]);
    expect(result[0]).toMatchObject({ reduceOnly: true, quantity: 0.0005 });
    expect(
      normalizeDecibelAuthenticatedOpenOrdersV1([row], row.market, 'strategy')[0]?.reduceOnly,
    ).toBeUndefined();
  });
  it.each(['order_id', 'client_order_id', 'market', 'price', 'orig_size', 'is_buy'] as const)(
    'does not borrow reduce-only provenance across mismatched %s',
    (field) => {
      const changed = {
        ...history,
        [field]:
          typeof history[field] === 'string'
            ? 'other'
            : typeof history[field] === 'number'
              ? 123
              : true,
      };
      expect(
        normalizeDecibelAuthenticatedOpenOrdersV1([row], row.market, 'strategy', [changed])[0]
          ?.reduceOnly,
      ).toBeUndefined();
    },
  );
  it('fails closed on contradictory flags rather than cancelling a supposedly non-reducing TP', () => {
    expect(() =>
      normalizeDecibelAuthenticatedOpenOrdersV1(
        [{ ...row, is_reduce_only: false }],
        row.market,
        'strategy',
        [history],
      ),
    ).toThrow('PRODUCTION_ORDER_REDUCE_ONLY_IDENTITY_CONFLICT');
  });
});

it('persists exact entry/exit residuals idempotently across journal restart', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'decibel-exact-residual-')), 'journal.sqlite');
  const journal = new decibel_execution_lifecycle_journal_v1(path);
  const fill = {
    intentId: null,
    quantity: 0.00073,
    price: 79700,
    strategyLineage: false,
    makerProven: true,
    externalCounterparty: true,
    observedAt: 1000,
  };
  journal.applyFill({ ...fill, fillId: 'entry-73', side: 'BUY' });
  const exit = { ...fill, fillId: 'exit-72', side: 'SELL' as const, quantity: 0.00072 };
  expect(journal.applyFill(exit).inventory).toBe(0.00001);
  expect(journal.applyFill(exit).duplicate).toBe(true);
  journal.close();
  const restarted = new decibel_execution_lifecycle_journal_v1(path);
  expect(restarted.ledger().inventory).toBe(0.00001);
  expect(restarted.applyFill(exit).inventory).toBe(0.00001);
  restarted.close();
});

describe('Economic startup evidence recovery', () => {
  afterEach(() => vi.restoreAllMocks());
  const createReplay = () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const root = mkdtempSync(join(tmpdir(), 'economic-startup-replay-'));
    const path = join(root, 'evidence.json');
    const environment = { DECIBEL_PRODUCTION_ECONOMIC_EVIDENCE_PATH: path };
    const store = new decibel_raw_ws_bbo_store_v1(
      join(root, 'decibel_production_raw_ws_bbo_v1.jsonl'),
    );
    const runInputsAudit = vi.fn(() =>
      Promise.resolve({
        observedAt: now,
        makerFeeObservedAt: now,
        makerFeeBps: 1.5,
        makerFeeSource: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        gasCostObservedAt: now,
        conservativeGasCostUsd: 0.0005,
        gasCostSource: 'HISTORICAL_SUCCESSFUL_TX_P95',
        aptUsd: 4.25,
        aptUsdSource: 'COINBASE_EXCHANGE_APT_USD_TICKER',
        aptUsdObservedAt: now,
      }),
    );
    const add = (index: number) => {
      now = 1_800_000_000_000 + index * 30_000;
      store.append({
        timestamp: now,
        bestBid: 80000 + index,
        bestAsk: 80001 + index,
        regime: 'NORMAL',
        source: 'DECIBEL_WS_BBO',
      });
    };
    const refresh = () =>
      refreshDecibelProductionEconomicEvidenceV1(environment, { runInputsAudit });
    return {
      path,
      environment,
      add,
      refresh,
      runInputsAudit,
      advance: (ms: number) => {
        now += ms;
      },
    };
  };
  it('admits execution-cost readiness at cold start while adverse samples are warming', async () => {
    const replay = createReplay();
    const result = await bootstrapDecibelProductionEconomicEvidenceV1(replay.environment, {
      runInputsAudit: replay.runInputsAudit,
    });
    expect(result).toMatchObject({
      lastKnownGoodFound: false,
      economicEvidenceReady: true,
      refreshResult: 'PASS',
      blocker: null,
    });
    expect(readDecibelProductionEconomicLkgReadinessV1(replay.environment).ready).toBe(true);
    expect(inspectDecibelAdverseEvidenceReadinessV1(replay.environment).status).toBe('WARMING');
  });
  it('continues collecting optional adverse evidence without blocking ENTRY readiness', async () => {
    const replay = createReplay();
    for (let index = 0; index <= 30; index++) {
      replay.add(index);
      if ([0, 1, 2, 29, 30].includes(index)) {
        await expect(replay.refresh()).resolves.toMatchObject({ aptUsd: 4.25 });
        expect(readDecibelProductionEconomicLkgReadinessV1(replay.environment).ready).toBe(true);
      }
    }
    expect(inspectDecibelAdverseEvidenceReadinessV1(replay.environment)).toMatchObject({
      status: 'READY',
      globalEffectiveSampleCount: 30,
    });
  });
  it('reuses fresh fee/gas LKG on restart and remains fail-closed when those costs expire', async () => {
    const replay = createReplay();
    await replay.refresh();
    expect(resolveDecibelProductionEconomicColdStartV1(replay.environment).ready).toBe(true);
    const result = await bootstrapDecibelProductionEconomicEvidenceV1(replay.environment, {
      runInputsAudit: () => Promise.reject(new Error('OFFLINE_TRANSIENT')),
    });
    expect(result).toMatchObject({
      lastKnownGoodReady: true,
      economicEvidenceReady: true,
      refreshResult: 'FAIL',
    });
    replay.advance(3_600_001);
    expect(resolveDecibelProductionEconomicColdStartV1(replay.environment).ready).toBe(false);
    await replay.refresh();
    expect(readDecibelProductionEconomicLkgReadinessV1(replay.environment).ready).toBe(true);
  });
  it('ignores malformed optional adverse data without discarding valid fee/gas', async () => {
    const replay = createReplay();
    await replay.refresh();
    const partial = JSON.parse(readFileSync(replay.path, 'utf8')) as Record<string, unknown>;
    writeFileSync(replay.path, JSON.stringify({ ...partial, adverseSelectionBufferBps: -1 }));
    await expect(replay.refresh()).resolves.toMatchObject({ aptUsd: 4.25 });
    expect(readDecibelProductionEconomicLkgReadinessV1(replay.environment).ready).toBe(true);
  });
});

it('releases a hung capacity refresh and never publishes late venue rules', async () => {
  vi.useFakeTimers();
  try {
    let release!: (value: unknown) => void;
    let reads = 0;
    const late = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const Reader = {
      readVenueMarginRules: () => {
        reads++;
        return reads === 1 ? late : Promise.resolve(undefined);
      },
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(Reader, {
      DECIBEL_SUBACCOUNT_ADDRESS: '0x123',
      DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS: '2000',
    });
    const first = Source['refreshAccountRiskInputs']();
    await vi.advanceTimersByTimeAsync(1000);
    await first;
    expect(Source['CapacitySettingsRead']).toBeNull();
    await Source['refreshAccountRiskInputs']();
    expect(reads).toBe(2);
    release({ observedAt: Date.now(), markObservedAt: Date.now() });
    await vi.advanceTimersByTimeAsync(0);
    expect(Source['CapacityVenueRules']).toBeNull();
    await Source.close();
  } finally {
    vi.useRealTimers();
  }
});

it('cleans authenticated stage ownership after synchronous rejection and shutdown', async () => {
  const Reader = {} as DecibelProductionLiveAuthenticatedReaderV1;
  const Source = new decibel_production_live_state_source_v1(Reader, {
    DECIBEL_SUBACCOUNT_ADDRESS: '0x123',
  });
  await expect(
    Source['readAuthenticatedStage']('SYNC', () => {
      throw new Error('SYNC');
    }),
  ).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_STAGE:SYNC');
  expect(Source['ActiveReadControllers'].size).toBe(0);
  await expect(
    Source['readAuthenticatedStage']('RECOVERED', () => Promise.resolve('FRESH')),
  ).resolves.toBe('FRESH');
  const pending = Source['readAuthenticatedStage']('HUNG', () => new Promise(() => undefined));
  const rejected = expect(pending).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_STAGE:HUNG');
  await Source.close();
  await rejected;
  expect(Source['ActiveReadControllers'].size).toBe(0);
});

it('bounds position revalidation without converting a failed read into FLAT', async () => {
  vi.useFakeTimers();
  try {
    const readPositions = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce([]);
    const Source = new decibel_production_live_state_source_v1(
      { readPositions } as unknown as DecibelProductionLiveAuthenticatedReaderV1,
      { DECIBEL_SUBACCOUNT_ADDRESS: '0x123', DECIBEL_PRODUCTION_LIVE_READ_TIMEOUT_MS: '2000' },
    );
    const failed = expect(Source.readAuthenticatedPosition()).rejects.toThrow(
      'POSITION_REVALIDATION',
    );
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
    await expect(Source.readAuthenticatedPosition()).resolves.toMatchObject({
      positionBase: 0,
      source: 'AUTHENTICATED_POSITION_READ',
    });
    expect(readPositions).toHaveBeenCalledTimes(2);
    await Source.close();
  } finally {
    vi.useRealTimers();
  }
});

describe('Two ENTRY recovery precision regression', () => {
  it.each([0, 1])(
    'recovers SELL ACK at tick-equivalent price; rejects a genuine one-tick mismatch %s',
    async (tickOffset) => {
      const snapshot = makeSnapshot();
      const clientOrderId = 'd1s8290b5a77d88d871a6dae49a4c2a5';
      const venueOrderId = '170141591643962509397391306721247363072';
      const tickSize = 0.1;
      const fresh = makeSnapshot({
        input: {
          ...snapshot.input,
          metadata: { ...snapshot.input.metadata, tickSize, lotSize: 0.00001 },
          book: { ...snapshot.input.book, bestBid: 81400, bestAsk: 81500 },
        },
      });
      const test = make({
        snapshots: [fresh],
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationError: new Error('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'),
        timeoutVerification: 'ORDER_OPEN',
        directOpenOrder: {
          venueOrderId,
          clientOrderId,
          strategyConfigId: fresh.input.strategyConfigId,
          market: fresh.input.market,
          side: 'SELL',
          price: 81494.9 + tickOffset * tickSize,
          quantity: 0.00071,
          reduceOnly: false,
          orderType: 'LIMIT',
          timeInForce: 'PostOnly',
          postOnly: true,
        },
      });
      const intent = buildDecibelExecutionIntentV1({
        sessionId: fresh.input.sessionId,
        cycleSequence: 1,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'SELL',
        price: 81494.90000000001,
        quantity: 0.00071,
        tickSize,
        lotSize: 0.00001,
        clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: 'incident',
        strategyDecisionHash: 'incident',
        createdAt: 1,
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, venueOrderId);
      try {
        if (tickOffset === 0) {
          await expect(test.orchestrator.evaluateOnce()).resolves.toMatchObject({
            action: 'RECONCILE_ONLY',
            blocker: null,
            mutationInvocations: 0,
          });
          expect(test.journal.get(intent.intentId)?.status).toBe('ACKNOWLEDGED');
        } else
          await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
            'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
          );
        expect(test.calls()).toBe(0);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it('reconciles the exact two canceled ENTRY identities without fills or order mutations', async () => {
    const rows = JSON.parse(
      readFileSync('tests/fixtures/two_entry_order_history_v1.json', 'utf8'),
    ) as Parameters<typeof normalizeDecibelTerminalOrderEvidenceV1>[0];
    const terminalOrderEvidence = normalizeDecibelTerminalOrderEvidenceV1(rows);
    expect(terminalOrderEvidence).toHaveLength(2);
    const root = mkdtempSync(join(tmpdir(), 'two-entry-finalization-'));
    const Sessions = new decibel_production_session_store_v1(join(root, 'sessions.sqlite'));
    const Settings = new decibel_operator_settings_store_v1(join(root, 'settings.json'), {
      capitalToUseUsd: 8,
      maxLossUsd: 2,
      targetMakerVolumeUsd: -1,
      orderNotionalUsd: 10,
      maxPositionUsd: 50,
    });
    const Controller = new decibel_production_session_controller_v1(Sessions, Settings, () =>
      Promise.resolve({
        stop: () => Promise.resolve({ safeToEnd: false, blocker: 'WAITING_FOR_RECONCILIATION' }),
      }),
    );
    const session = await Controller.start(0);
    const snapshot = makeSnapshot({ terminalOrderEvidence });
    await Controller.end('OPERATOR_END');
    expect(Sessions.get(session.sessionId)?.status).toBe('STOPPING');
    const Reader = {} as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(Reader, {
      DECIBEL_SUBACCOUNT_ADDRESS: '0x123',
    });
    const test = make({
      snapshots: [snapshot, snapshot],
      readFailuresAt: new Map([
        [
          1,
          Object.assign(new Error('HTTP Error 500: Service temporarily unavailable'), {
            status: 500,
          }),
        ],
      ]),
      reconciliationState: 'CANCELLED_EXTERNALLY',
    });
    const ids: string[] = [];
    for (const row of rows.filter((row) => row.status === 'Open')) {
      const intent = buildDecibelExecutionIntentV1({
        sessionId: snapshot.input.sessionId,
        cycleSequence: ids.length + 1,
        action: 'PLACE',
        market: 'BTC/USD',
        side: row.is_buy ? 'BUY' : 'SELL',
        price: row.price!,
        quantity: row.orig_size!,
        tickSize: 0.1,
        lotSize: 0.00001,
        clientOrderId: row.client_order_id,
        knownVenueOrderId: null,
        sourceStateHash: 'incident',
        strategyDecisionHash: 'incident',
        createdAt: 1,
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, row.order_id);
      ids.push(intent.intentId);
      await expect(
        Source.reconcileIntent(intent.intentId, snapshot, row.order_id, {
          clientOrderId: row.client_order_id,
          createdAt: 1,
          transactionHash: null,
          requestedQuantity: 0.00071,
          side: intent.side,
        }),
      ).resolves.toBe('CANCELLED_EXTERNALLY');
    }
    expect(
      finalizeDecibelVerifiedSessionV1(snapshot, test.journal.nonTerminal().length, () => {
        throw new Error('PREMATURE_END');
      }),
    ).toBe(false);
    test.orchestrator.requestSessionUnwind();
    await expect(test.orchestrator.evaluateOnce()).rejects.toThrow(
      'PRODUCTION_AUTHENTICATED_READ_TRANSIENT',
    );
    expect(test.journal.nonTerminal()).toHaveLength(2);
    expect(Sessions.get(session.sessionId)?.status).toBe('STOPPING');
    await test.orchestrator.evaluateOnce();
    await test.orchestrator.evaluateOnce();
    expect(test.journal.nonTerminal()).toHaveLength(0);
    expect(ids.map((id) => test.journal.get(id)?.status)).toEqual([
      'CANCELLED_EXTERNALLY',
      'CANCELLED_EXTERNALLY',
    ]);
    expect(test.calls()).toBe(0);
    expect(
      finalizeDecibelVerifiedSessionV1(snapshot, test.journal.nonTerminal().length, () => {
        Controller.completeUnwind(
          session.sessionId,
          { finalPositionBase: 0, unresolvedExecutionCount: 0, finalBotState: 'ENDED' },
          'OPERATOR_END',
        );
      }),
    ).toBe(true);
    expect(Sessions.get(session.sessionId)?.status).toBe('ENDED');
    expect(Sessions.getActive()).toBeNull();
    Sessions.close();
    await test.orchestrator.close();
    await Source.close();
  });
});

it('cancels all five child reads after HTTP 500 before the next authenticated retry', async () => {
  const Supervisor = new decibel_runtime_supervisor_v1();
  let active = 0;
  let maximumActive = 0;
  let fail = true;
  const calls = new Map<string, number>();
  const read = (
    stage: string,
    signal: AbortSignal | undefined,
    value: unknown,
  ): Promise<unknown> => {
    calls.set(stage, (calls.get(stage) ?? 0) + 1);
    if (stage === 'ACCOUNT_OVERVIEW' && fail)
      return Promise.reject(
        Object.assign(new Error('HTTP Error 500: Service temporarily unavailable'), {
          status: 500,
        }),
      );
    if (!fail) return Promise.resolve(value);
    active++;
    maximumActive = Math.max(active, maximumActive);
    return new Promise((_resolve, reject) =>
      signal?.addEventListener(
        'abort',
        () => {
          active--;
          reject(signal.reason instanceof Error ? signal.reason : new Error('READ_ABORTED'));
        },
        { once: true },
      ),
    );
  };
  const Reader = {
    readAccountOverview: (_account: string, signal?: AbortSignal) =>
      read('ACCOUNT_OVERVIEW', signal, {
        perp_equity_balance: 25,
        total_margin: 0,
        cross_available_to_trade: 25,
      }),
    readMarketMetadata: () => Promise.resolve(makeSnapshot().input.metadata),
    readPositions: (_account: string, _market: string | undefined, signal?: AbortSignal) =>
      read('POSITIONS', signal, []),
    readOpenOrders: (_account: string, signal?: AbortSignal) => read('OPEN_ORDERS', signal, []),
    readOrderHistory: (_account: string, _start: number, _end: number, signal?: AbortSignal) =>
      read(
        'ORDER_HISTORY',
        signal,
        JSON.parse(
          readFileSync('tests/fixtures/two_entry_order_history_v1.json', 'utf8'),
        ) as unknown,
      ),
    readTradeHistory: (_account: string, _start: number, _end: number, signal?: AbortSignal) =>
      read('TRADE_HISTORY', signal, []),
  } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
  const Source = new decibel_production_live_state_source_v1(
    Reader,
    { DECIBEL_SUBACCOUNT_ADDRESS: '0x123' },
    Date.now,
    makeDecibelActivityBaselineFixtureV1,
  );
  const refresh = () =>
    Supervisor.runAuthenticatedRefresh((signal) =>
      Promise.all([
        Source.readAuthenticatedAccountState(signal),
        Source.readAuthenticatedFillLedger(Date.now() - 1000, signal),
      ]),
    );
  await expect(refresh()).rejects.toThrow('PRODUCTION_AUTHENTICATED_READ_REQUIRED');
  expect(active).toBe(0);
  expect(maximumActive).toBe(4);
  fail = false;
  const [account, history] = await refresh();
  expect(account.actualInventoryBase).toBe(0);
  expect(history.terminalOrderEvidence).toHaveLength(2);
  expect(history.terminalOrderEvidence.map((row) => row.state)).toEqual(['CANCELLED', 'CANCELLED']);
  expect([...calls.values()]).toEqual([2, 2, 2, 2, 2]);
  expect(active).toBe(0);
  Supervisor.stopScheduler();
  await Source.close();
});

it('keeps fresh WS publication independent of HTTP cooldown without re-aging an idle feed', async () => {
  let now = 20000;
  let lastBboAt = 20000;
  const metadata = { ...makeSnapshot().input.metadata, maximumLeverage: 40 };
  const Reader = {
    readMarketMetadata: () => Promise.resolve(metadata),
    readCurrentBook: () =>
      Promise.resolve({
        market: metadata.marketAddress,
        unix_ms: lastBboAt,
        best_bid: 80000,
        best_ask: 80000.1,
        bids: [{ price: 80000, size: 1 }],
        asks: [{ price: 80000.1, size: 1 }],
      }),
    readMarketDataDiagnostics: () => ({
      wsConnectionState: 'CONNECTED',
      wsSubscriptionState: 'SUBSCRIBED',
      lastWsMessageAgeMs: now - lastBboAt,
      lastValidBboAgeMs: now - lastBboAt,
      wsReconnectCount: 0,
      wsLastDisconnectReason: null,
    }),
  } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
  const Source = new decibel_production_live_state_source_v1(
    Reader,
    { DECIBEL_SUBACCOUNT_ADDRESS: '0x123' },
    () => now,
  );
  enterDecibelHTTPReadBackoffV1(30000, now);
  await expect(Source.readPublicMarketState()).resolves.toMatchObject({
    observedAt: 20000,
    bestBid: 80000,
  });
  await expect(Source.readAuthenticatedAccountState()).rejects.toThrow(
    'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
  );
  now = 26000;
  await expect(Source.readPublicMarketState()).rejects.toThrow('PRODUCTION_LIVE_SOURCE_BOOK_STALE');
  lastBboAt = 26000;
  await expect(Source.readPublicMarketState()).resolves.toMatchObject({ observedAt: 26000 });
  await Source.close();
});
import {
  mergeDecibelVenueReconciliationSnapshotV1,
  projectDecibelVenueDecisionSnapshotV1,
  assertDecibelVenueReconciliationFreshV1,
} from '../src/decibel_venue_reconciliation_snapshot_v1.js';
import { reconcileDecibelAcknowledgedTerminalOrdersV1 } from '../src/decibel_production_web_telemetry_v1.js';

describe('PID6812 capacity admission and ACK publication replay', () => {
  it.each(['ORDER_OPEN', 'PENDING'] as const)(
    'prioritizes the incident SELL RECONCILING over the older BUY ACK: %s',
    async (evidence) => {
      const base = makeSnapshot();
      const selected: string[] = [];
      const test = make({
        readSnapshot: () => base,
        reconcileIntent: (id) => {
          selected.push(id);
          return evidence === 'ORDER_OPEN'
            ? Promise.resolve('ORDER_OPEN')
            : Promise.reject(new Error('PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING'));
        },
      });
      try {
        const intents = [
          {
            side: 'BUY' as const,
            price: 75540.8,
            id: '170141599249866109810101889545734717440',
            client: 'd1b18473238f397a824ad2f2521a21b0',
          },
          {
            side: 'SELL' as const,
            price: 75951.4,
            id: '170141591643962507099208910846541430784',
            client: 'd1sc035f1949f3471c942bd4bdccb204',
          },
        ].map((order, index) => {
          const intent = buildDecibelExecutionIntentV1({
            sessionId: base.input.sessionId,
            cycleSequence: index + 1,
            action: 'PLACE',
            market: 'BTC/USD',
            side: order.side,
            price: order.price,
            quantity: 0.00047,
            tickSize: 0.1,
            lotSize: 0.00001,
            clientOrderId: order.client,
            knownVenueOrderId: null,
            sourceStateHash: 'incident',
            strategyDecisionHash: 'incident',
            createdAt: index + 1,
          });
          test.journal.prepare(intent);
          test.journal.transition(
            intent.intentId,
            index === 0 ? 'ACKNOWLEDGED' : 'RECONCILING',
            3,
            order.id,
          );
          return { intent, order };
        });
        const snapshot = {
          ...base,
          input: {
            ...base.input,
            openOrders: intents.map(({ intent, order }) => ({
              venueOrderId: order.id,
              clientOrderId: order.client,
              market: base.input.market,
              strategyConfigId: base.input.strategyConfigId,
              side: order.side,
              price: order.price,
              quantity: intent.quantity,
              reduceOnly: false,
              orderType: 'LIMIT' as const,
              timeInForce: 'PostOnly' as const,
              postOnly: true as const,
            })),
          },
        };
        Object.assign(base, snapshot);
        test.orchestrator.setPaused(true);
        expect(test.journal.getExecutionReconciliationBlocker()).toBe('RECONCILIATION_REQUIRED');
        await test.orchestrator.evaluateOnce();
        expect(selected[0]).toBe(intents[1]!.intent.intentId);
        expect(test.journal.get(intents[1]!.intent.intentId)?.status).toBe(
          evidence === 'ORDER_OPEN' ? 'ACKNOWLEDGED' : 'RECONCILING',
        );
        expect(test.journal.getExecutionReconciliationBlocker()).toBe(
          evidence === 'ORDER_OPEN' ? null : 'RECONCILIATION_REQUIRED',
        );
        expect(test.submitted()).toEqual([]);
      } finally {
        await test.orchestrator.close();
      }
    },
  );
  it('keeps a fresh PLACE ACK pending through the actual post-mutation source path without releasing or resubmitting it', async () => {
    let snapshot: decibel_production_live_snapshot_v1 = makeSnapshot();
    let placed: Extract<execution_intent_v1, { action: 'PLACE' }> | undefined;
    let submissions = 0;
    const Reader = {
      readOrderHistory: () => Promise.resolve([]),
      readTradeHistory: () => Promise.resolve([]),
      readTransactionByHash: () => Promise.resolve('COMMITTED' as const),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_SUBACCOUNT_ADDRESS: 'subaccount' },
      () => snapshot.input.now,
    );
    const test = make({
      readSnapshot: () => snapshot,
      postMutationRead: true,
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      reconcileIntent: (...args) => Source.reconcileIntent(...args),
      executor: {
        placePostOnlyLimit: (intent) => {
          placed = intent;
          submissions++;
          return Promise.resolve({
            outcome: 'PLACE_ACKNOWLEDGED',
            venueOrderId: 'publication-pending',
            transactionHash: '0xfake-committed',
            expirationTimestampMs: 10000,
          });
        },
        cancelExactOrder: () => {
          throw Error('UNEXPECTED_CANCEL');
        },
      },
    });
    try {
      const ack = await test.orchestrator.evaluateOnce();
      expect(ack.action).toBe('ACKNOWLEDGED');
      expect(test.journal.get(ack.intentId!)?.status).toBe('RECONCILING');
      expect(test.journal.getExecutionReconciliationBlocker()).toBe('RECONCILIATION_REQUIRED');
      expect(test.journal.getLatestReconciliationProvenance(ack.intentId!)).toBeNull();
      expect((await test.orchestrator.evaluateOnce()).blocker).toBe(
        'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
      );
      expect(submissions).toBe(1);
      if (!placed) throw Error('PLACE_REQUIRED');
      snapshot = {
        ...snapshot,
        input: {
          ...snapshot.input,
          openOrders: [
            {
              venueOrderId: 'publication-pending',
              clientOrderId: placed.clientOrderId,
              market: snapshot.input.market,
              strategyConfigId: snapshot.input.strategyConfigId,
              side: placed.side,
              price: placed.price,
              quantity: placed.quantity,
              reduceOnly: false,
              orderType: 'LIMIT',
              timeInForce: 'PostOnly',
              postOnly: true,
            },
          ],
        },
      };
      test.orchestrator.setPaused(true);
      await test.orchestrator.evaluateOnce();
      expect(test.journal.getLatestReconciliationProvenance(ack.intentId!)).toMatchObject({
        venueStatus: 'OPEN',
        venueOrderId: 'publication-pending',
      });
      expect(submissions).toBe(1);
    } finally {
      await test.orchestrator.close();
      await Source.close();
    }
  });
  it('joins the in-flight risk refresh at ENTRY capacity admission without stalling account publication', async () => {
    let now = 20000,
      reads = 0,
      release: ((value: unknown) => void) | undefined;
    const market = makeSnapshot().input.market;
    const rules = (at: number) => ({
      observedAt: at,
      markObservedAt: at,
      ledgerVersion: '123',
      maximumLeverage: 40,
      maintenanceMultiplier: 1,
      maintenanceDivisor: 2,
      markPrice: 76000,
      remainingOpenInterestBase: 100,
      sizeModel: 'FIXED_LEVERAGE_V1',
    });
    const Reader = {
      readCurrentBook: () =>
        Promise.resolve({
          market,
          unix_ms: now,
          best_bid: 75999,
          best_ask: 76001,
          bids: [{ price: 75999, size: 1 }],
          asks: [{ price: 76001, size: 1 }],
        }),
      readMarketDataDiagnostics: () => ({
        wsConnectionState: 'CONNECTED',
        wsSubscriptionState: 'SUBSCRIBED',
        lastWsMessageAgeMs: 0,
        lastValidBboAgeMs: 0,
        wsReconnectCount: 0,
        wsLastDisconnectReason: null,
      }),
      readMarketMetadata: () => Promise.resolve(makeSnapshot().input.metadata),
      readAccountOverview: () =>
        Promise.resolve({
          perp_equity_balance: 25,
          total_margin: 0,
          cross_available_to_trade: 25,
          secondary_collateral: null,
        }),
      readPositions: () => Promise.resolve([]),
      readOpenOrders: () => Promise.resolve([]),
      readAccountRiskInputs: () =>
        Promise.resolve({
          leverage: {
            source: 'AUTHENTICATED_BTC_POSITION_SETTINGS',
            observedAt: now,
            userLeverage: 40,
            positionBase: 0,
            isIsolated: false,
            market,
            subaccount: '0x123',
          },
          fees: {
            source: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
            observedAt: now,
            makerFeeBps: 1.5,
            takerFeeBps: 4.5,
            tier: 0,
            referralDiscount: 0,
            subaccount: '0x123',
          },
        }),
      readVenueMarginRules: () => {
        reads++;
        return reads === 2
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve(rules(reads > 2 ? 23000 : now));
      },
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_SUBACCOUNT_ADDRESS: '0x123' },
      () => now,
    );
    try {
      await Source.readAuthenticatedAccountState();
      await Source['CapacitySettingsRead'];
      await Source.readPublicMarketState();
      now = 23000;
      await Source.readAuthenticatedAccountState(); // The account remains independently publishable.
      await Source.readPublicMarketState();
      expect(reads).toBe(2);
      let completed = false;
      const admission = Source.readCapacityProduction({
        sessionId: 'session',
        probeNotionalUsd: 72,
        manifest: [],
      }).then((value) => {
        completed = true;
        return value;
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(completed).toBe(false);
      expect(Source.readNextSessionCapacityInputs()?.venueMarginRules?.observedAt).toBe(20000);
      now = 26000;
      expect(now - Source['CapacityVenueRules']!.observedAt).toBeGreaterThan(5000);
      release!(rules(23000));
      await admission;
      expect(Source.readNextSessionCapacityInputs()?.venueMarginRules?.observedAt).toBe(23000);
      expect(now - Source['CapacityVenueRules']!.observedAt).toBeLessThanOrEqual(5000);
      expect(reads).toBe(2); // One owner, no second RPC cohort.
      now = 29000;
      await Source.readAuthenticatedAccountState();
      await Source.readCapacityProduction({
        sessionId: 'session',
        probeNotionalUsd: 72,
        manifest: [],
      });
      expect(Source['CapacityVenueRules']?.observedAt).toBe(23000); // Do not renew stale venue clocks.
    } finally {
      await Source.close();
    }
  });

  it('preserves the exact recorded BUY claim while committed ACK awaits visibility, including restart', async () => {
    const fixture = JSON.parse(readFileSync('tests/fixtures/pid6812_buy_ack_v1.json', 'utf8')) as {
      intent: Extract<execution_intent_v1, { action: 'PLACE' }>;
      venueOrderId: string;
      outcome: unknown;
      ackAt: number;
      openAt: number;
    };
    let now = fixture.ackAt,
      visible = false,
      txState: 'COMMITTED' | 'NOT_FOUND' = 'COMMITTED';
    const Reader = {
      readOrderHistory: () => Promise.resolve([]),
      readTradeHistory: () => Promise.resolve([]),
      readTransactionByHash: () => Promise.resolve(txState),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_SUBACCOUNT_ADDRESS: 'subaccount' },
      () => now,
    );
    const path = join(mkdtempSync(join(tmpdir(), 'pid6812-ack-')), 'journal.sqlite');
    const read = () => {
      const base = makeSnapshot();
      return makeSnapshot({
        sourceStateHash: `ack-${now}-${visible}`,
        maximumNotionalUsd: 72,
        maximumAbsPositionBase: 0.00095,
        minimumNotionalUsd: 10,
        availableMarginUsd: 5.55,
        maximumEffectiveLeverage: 40,
        venueReadWindow: {
          account: { startedAt: now, completedAt: now },
          history: { startedAt: now, completedAt: now },
        },
        input: {
          ...base.input,
          sessionId: fixture.intent.sessionId,
          now,
          metadata: {
            ...base.input.metadata,
            lotSize: 0.00001,
            minimumSize: 0.00002,
            observedAt: now,
          },
          book: { bestBid: 76150, bestAsk: 76152, observedAt: now },
          openOrders: visible
            ? [
                {
                  venueOrderId: fixture.venueOrderId,
                  clientOrderId: fixture.intent.clientOrderId,
                  strategyConfigId: base.input.strategyConfigId,
                  market: base.input.market,
                  side: 'BUY' as const,
                  price: fixture.intent.price,
                  quantity: fixture.intent.quantity,
                  reduceOnly: false,
                  orderType: 'LIMIT' as const,
                  timeInForce: 'PostOnly' as const,
                  postOnly: true,
                },
              ]
            : [],
        },
      });
    };
    const create = () =>
      make({
        journalPath: path,
        readSnapshot: read,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconcileIntent: (...args) => Source.reconcileIntent(...args),
      });
    let test = create();
    test.journal.prepare(fixture.intent);
    test.journal.transition(fixture.intent.intentId, 'ACKNOWLEDGED', now, fixture.venueOrderId);
    test.journal.recordOutcome(fixture.intent.intentId, fixture.outcome, now);
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        const pending = await test.orchestrator.evaluateOnce();
        expect(pending.blocker).toBe('PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING');
        expect(test.journal.get(fixture.intent.intentId)?.status).toBe('RECONCILING');
        expect(test.journal.getLatestReconciliationProvenance(fixture.intent.intentId)).toBeNull();
        expect(test.calls()).toBe(0);
        now += 200;
      }
      await test.orchestrator.close();
      test = create();
      test.orchestrator.setPaused(true);
      visible = true;
      now = fixture.openAt;
      await test.orchestrator.evaluateOnce();
      expect(test.journal.getLatestReconciliationProvenance(fixture.intent.intentId)).toMatchObject(
        {
          venueStatus: 'OPEN',
          venueOrderId: fixture.venueOrderId,
          clientOrderId: fixture.intent.clientOrderId,
        },
      );
      expect(test.journal.getActiveIdentityConflict()).toBeNull();
      expect(test.calls()).toBe(0);
      visible = false;
      txState = 'NOT_FOUND';
      await expect(
        Source.reconcileIntent(fixture.intent.intentId, read(), fixture.venueOrderId, {
          clientOrderId: fixture.intent.clientOrderId,
          createdAt: fixture.intent.createdAt,
          side: 'BUY',
          requestedQuantity: fixture.intent.quantity,
          transactionHash: '0xunknown',
        }),
      ).rejects.toThrow('PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK');
    } finally {
      await test.orchestrator.close();
      await Source.close();
    }
  });
});

describe('ENTRY continuation economics churn replay', () => {
  it('cancels a verified position-limit violation even when continuation economics are profitable', () => {
    const base = makeSnapshot();
    const order = {
      venueOrderId: 'risk-owned',
      clientOrderId: 'd1s' + 'b'.repeat(29),
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side: 'SELL' as const,
      price: 101,
      quantity: 0.001,
      reduceOnly: false,
      postOnly: true,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
    };
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      {
        ...base.input,
        metadata: { ...base.input.metadata, lotSize: 0.0001, minimumSize: 0.0001 },
        openOrders: [order],
      },
      {
        minimumNotionalUsd: 0.01,
        maximumNotionalUsd: 100,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 1,
        maximumAbsPositionBase: 0.0005,
        halfSpreadBps: 5,
        makerFeeBps: 0,
        estimatedGasCostUsd: 0,
        adverseSelectionBufferBps: 0,
        safetyMarginBps: 0,
      },
    );
    expect(
      evaluation.actions.find((action) => action.current?.venueOrderId === order.venueOrderId),
    ).toMatchObject({
      action: 'WOULD_CANCEL',
      reason: 'RISK_INVALID:RESTING_ENTRY_EXCEEDS_POSITION_LIMIT',
    });
  });
  it.each(['BUY', 'SELL'] as const)(
    'excludes sunk placement gas and keeps hypothetical midpoint fee shortfalls (%s)',
    (side) => {
      const midpoint = 76020.75,
        price = midpoint + (side === 'SELL' ? 91.25 : -91.25),
        quantity = 0.00047;
      const input = {
        side,
        price,
        quantity,
        midpoint,
        makerFeeBps: 1.5,
        gasCostUsd: 0.000369096,
        adverseSelectionBps: 8.6,
        safetyMarginBps: 1,
      };
      expect(
        calculateDecibelLifecycleCostBpsV1({ ...input, notionalUsd: price * quantity }),
      ).toBeGreaterThan(11.25);
      expect(assessDecibelRestingEntryEconomicsV1(input).decision).toBe('KEEP');
      expect(assessDecibelRestingEntryEconomicsV1({ ...input, makerFeeBps: 12 }).decision).toBe(
        'KEEP',
      );
      expect(assessDecibelRestingEntryEconomicsV1({ ...input, makerFeeBps: null }).decision).toBe(
        'RECONCILE',
      );
    },
  );

  it('distinguishes unverified capacity, resting reservations and pending cancel from exhausted funds', () => {
    const base = makeSnapshot({ maximumNotionalUsd: 0 });
    const decide = (snapshot: decibel_production_live_snapshot_v1, blocker: string | null = null) =>
      evaluateTradingDecision(snapshot, { now: 1000, sessionId: 'session', blocker });
    expect(decide(base, 'CAPACITY_VENUE_MARGIN_RULES_STALE').capacityState).toBe('UNVERIFIED');
    expect(decide(base, 'CAPACITY_VENUE_MARGIN_RULES_STALE').detailedReasons).not.toContain(
      'NO_NEW_QUOTE_HEADROOM',
    );
    expect(decide(base).capacityState).toBe('NO_AVAILABLE_CAPITAL');
    const resting = {
      venueOrderId: 'owned',
      clientOrderId: 'd1s' + 'a'.repeat(29),
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side: 'SELL' as const,
      price: 101,
      quantity: 0.001,
      reduceOnly: false,
      postOnly: true,
      timeInForce: 'PostOnly' as const,
      orderType: 'LIMIT' as const,
    };
    expect(decide({ ...base, input: { ...base.input, openOrders: [resting] } }).capacityState).toBe(
      'RESERVED_BY_RESTING_ORDERS',
    );
    expect(
      decide({ ...base, input: { ...base.input, pendingCancelOrderIds: ['owned'] } }).capacityState,
    ).toBe('CANCEL_FINALITY_PENDING');
  });
  type frame = {
    at: number;
    action: string;
    price: number;
    quantity: number;
    bid: number;
    ask: number;
    bookAt: number;
    fee: number;
    gas: number;
    adverse: number;
    safety: number;
    askCost: number;
    restingAge: number | null;
  };
  const recorded = JSON.parse(
    readFileSync('tests/fixtures/entry_churn_recorded_v1.json', 'utf8'),
  ) as frame[];

  it('separates the admission safety buffer from recorded 76112 and 76124 continuation costs', () => {
    for (const row of recorded.filter((row) => row.action === 'CANCEL')) {
      const review = assessDecibelRestingEntryEconomicsV1({
        side: 'SELL',
        price: row.price,
        quantity: row.quantity,
        midpoint: (row.bid + row.ask) / 2,
        makerFeeBps: row.fee,
        gasCostUsd: row.gas,
        adverseSelectionBps: row.adverse,
        safetyMarginBps: row.safety,
      });
      const expected =
        row.price === 76112
          ? { decision: 'KEEP', net: 0.01209624400000137 }
          : { decision: 'CANCEL', net: -0.0013236659999999994 };
      const continuationNet = expected.net + (row.price * row.quantity * row.safety) / 10000;
      expect(review.decision).toBe('KEEP');
      expect(review.conditionalNetUsd).toBeCloseTo(continuationNet, 12);
    }
  });

  it('keeps ENTRY through adverse-only changes and reconciles durable ownership after restart', async () => {
    const runReplay = async () => {
      const first = recorded[0]!;
      let now = first.at,
        adverse = 8.3;
      const midpoint = (first.bid + first.ask) / 2;
      const orders = new Map<
        string,
        { intent: Extract<execution_intent_v1, { action: 'PLACE' }>; open: boolean; at: number }
      >();
      const events: Array<{
        action: 'PLACE' | 'CANCEL';
        at: number;
        id: string;
        reason: string | null;
      }> = [];
      const root = join(mkdtempSync(join(tmpdir(), 'entry-continuation-')), 'journal.sqlite');
      const read = (): decibel_production_live_snapshot_v1 => {
        const base = makeSnapshot();
        return makeSnapshot({
          sourceStateHash: `entry-${now}-${adverse}-${orders.size}-${events.length}`,
          minimumNotionalUsd: 10,
          maximumNotionalUsd: 72.22,
          maximumAbsPositionBase: 0.00095,
          availableMarginUsd: 5,
          maximumEffectiveLeverage: 40,
          economicInputs: {
            ...base.economicInputs,
            makerFeeBps: first.fee,
            estimatedGasCostUsd: first.gas,
            adverseSelectionBufferBps: adverse,
            safetyMarginBps: first.safety,
          },
          venueReadWindow: {
            account: { startedAt: now, completedAt: now },
            history: { startedAt: now, completedAt: now },
          },
          terminalOrderEvidence: [...orders]
            .filter(([, order]) => !order.open)
            .map(([venueOrderId, order]) => ({
              venueOrderId,
              clientOrderId: order.intent.clientOrderId,
              state: 'CANCELLED' as const,
              originalQuantity: order.intent.quantity,
              remainingQuantity: 0,
            })),
          input: {
            ...base.input,
            now,
            metadata: {
              ...base.input.metadata,
              lotSize: 0.00001,
              minimumSize: 0.00002,
              observedAt: now,
            },
            book: { bestBid: midpoint - 4, bestAsk: midpoint + 4, observedAt: now },
            openOrders: [...orders]
              .filter(([, order]) => order.open)
              .map(([venueOrderId, order]) => ({
                venueOrderId,
                clientOrderId: order.intent.clientOrderId,
                strategyConfigId: base.input.strategyConfigId,
                market: base.input.market,
                side: order.intent.side,
                price: order.intent.price,
                quantity: order.intent.quantity,
                reduceOnly: false,
                orderType: 'LIMIT' as const,
                timeInForce: 'PostOnly' as const,
                postOnly: true,
              })),
          },
        });
      };
      let test: ReturnType<typeof make>;
      const create = () => {
        const current = make({
          journalPath: root,
          readSnapshot: read,
          environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
          executor: {
            placePostOnlyLimit: (intent) => {
              const id = `replay-${events.length + 1}`;
              orders.set(id, { intent, open: true, at: now });
              events.push({ action: 'PLACE', at: now, id, reason: null });
              return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: id });
            },
            cancelExactOrder: (intent) => {
              const order = orders.get(intent.expectedPreviousVenueOrderId);
              if (!order?.open || order.intent.clientOrderId !== intent.clientOrderId)
                throw Error('WRONG_CANCEL');
              order.open = false;
              events.push({
                action: 'CANCEL',
                at: now,
                id: intent.expectedPreviousVenueOrderId,
                reason: intent.cancelReason,
              });
              return Promise.resolve({ outcome: 'CANCEL_CONFIRMED' });
            },
          },
          cancelTargetState: 'ORDER_OPEN',
          reconcileIntent: (intentId) => {
            const id = current.journal.get(intentId)!.venueOrderId;
            return Promise.resolve(
              orders.get(id ?? '')?.open ? 'ORDER_OPEN' : 'CANCELLED_EXTERNALLY',
            );
          },
        });
        return current;
      };
      test = create();
      const cycle = async () => {
        now += 1000;
        return test.orchestrator.evaluateOnce();
      };
      try {
        const opening = await cycle();
        expect(
          opening.action,
          JSON.stringify({
            blocker: opening.blocker,
            decision: opening.tradingDecision,
            evaluation: opening.evaluation,
          }),
        ).toBe('ACKNOWLEDGED');
        adverse = 8.6;
        const mild = await cycle();
        expect(mild.evaluation?.askEligibilityReason).toBe('VOLUME_COST_BUDGET_ELIGIBLE');
        expect(
          mild.evaluation?.actions.some(
            (action) => action.action === 'NO_OP' && action.entryEconomics?.decision === 'KEEP',
          ),
        ).toBe(true);
        await cycle();
        await cycle();
        await test.orchestrator.close();
        test = create(); // Durable original ownership, same fake venue.
        adverse = 8.3;
        await cycle();
        await cycle();
        adverse = 12;
        await cycle();
        await cycle();
        await cycle();
        const denied = events.length;
        await cycle();
        expect(events).toHaveLength(denied);
        adverse = 8.3;
        await cycle();
        await cycle();
        return {
          place: events.filter((event) => event.action === 'PLACE').length,
          cancel: events.filter((event) => event.action === 'CANCEL').length,
          fill: 0,
          executedTurnoverUsd: 0,
          gasEstimateUsd: events.length * first.gas,
          totalTimeRestingMs: [...orders].reduce(
            (sum, [id, order]) =>
              sum +
              ((events.find((event) => event.action === 'CANCEL' && event.id === id)?.at ?? now) -
                order.at),
            0,
          ),
          submittedEntryNotionalUsd: [...orders.values()].reduce(
            (sum, order) => sum + order.intent.price * order.intent.quantity,
            0,
          ),
          restingMs: events
            .filter((event) => event.action === 'CANCEL')
            .map((event) => event.at - orders.get(event.id)!.at),
          cancelReasons: events
            .filter((event) => event.action === 'CANCEL')
            .map((event) => event.reason),
        };
      } finally {
        await test.orchestrator.close();
      }
    };
    const after = await runReplay();
    expect(after.cancel).toBe(0);
    expect(after.place).toBe(2);
    expect(after.fill).toBe(0);
    expect(after.gasEstimateUsd).toBeCloseTo(2 * recorded[0]!.gas, 12);
  });
});

describe('PID20984 authenticated ownership production-path replay', () => {
  it('publishes account/orders without awaiting expired ENTRY risk inputs, while close aborts their independent deadline', async () => {
    const riskSignals: AbortSignal[] = [];
    const Reader = {
      readMarketMetadata: () => Promise.resolve(makeSnapshot().input.metadata),
      readAccountOverview: () =>
        Promise.resolve({ perp_equity_balance: 25, total_margin: 0, cross_available_to_trade: 25 }),
      readPositions: () => Promise.resolve([]),
      readOpenOrders: () => Promise.resolve([]),
      readAccountRiskInputs: (_account: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          riskSignals.push(signal);
          signal.addEventListener(
            'abort',
            () => reject(new Error('BACKGROUND_RISK_READ_ABORTED')),
            { once: true },
          );
        }),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_SUBACCOUNT_ADDRESS: 'subaccount' },
      () => 20000,
    );
    try {
      const account = await Source.readAuthenticatedAccountState();
      expect(account.readWindow).toEqual({ startedAt: 20000, completedAt: 20000 });
      expect(account.openOrders).toEqual([]);
      expect(riskSignals).toHaveLength(1);
      expect(riskSignals[0]!.aborted).toBe(false);
      expect(Source.readNextSessionCapacityInputs()).toBeNull();
    } finally {
      await Source.close();
    }
    expect(riskSignals[0]!.aborted).toBe(true);
  });
  const rows = JSON.parse(
    readFileSync('tests/fixtures/pid20984_place_intents_v1.json', 'utf8'),
  ) as Array<{
    venueOrderId: string;
    intent: Extract<execution_intent_v1, { action: 'PLACE' }>;
  }>;
  const buildSnapshot = () => {
    const base = makeSnapshot();
    const now = 1793905836608;
    return makeSnapshot({
      sourceStateHash: 'pid20984-reconstructed-before-terminal',
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      authenticatedPositions: [],
      economicInputs: { ...base.economicInputs, makerFeeBps: 100 },
      venueReadWindow: {
        account: { startedAt: now - 50, completedAt: now },
        history: { startedAt: now - 50, completedAt: now },
      },
      input: {
        ...base.input,
        sessionId: rows[0]!.intent.sessionId,
        now,
        metadata: {
          ...base.input.metadata,
          lotSize: 0.00001,
          minimumSize: 0.00001,
          observedAt: now - 50,
        },
        book: { bestBid: 75850, bestAsk: 75851, observedAt: now },
        openOrders: rows.map(({ intent, venueOrderId }) => ({
          venueOrderId,
          clientOrderId: intent.clientOrderId,
          strategyConfigId: base.input.strategyConfigId,
          market: base.input.market,
          side: intent.side,
          price: intent.priceTicks * intent.tickSize,
          quantity: intent.quantity,
          reduceOnly: false,
          orderType: 'LIMIT' as const,
          timeInForce: 'PostOnly' as const,
          postOnly: true,
        })),
      },
    });
  };
  const seedOwners = (Journal: decibel_execution_lifecycle_journal_v1, entries = rows) => {
    for (const { intent, venueOrderId } of entries) {
      Journal.prepare(intent);
      Journal.applyAuthoritativeReconciliation({
        intentId: intent.intentId,
        reconciliationState: 'ORDER_OPEN',
        terminalStatus: 'ACKNOWLEDGED',
        source: 'AUTHENTICATED_OPEN_ORDERS',
        matchedIdentifier: `venueOrderId:${venueOrderId}`,
        venueStatus: 'OPEN',
        remainingQuantity: intent.quantity,
        transactionHash: null,
        venueOrderId,
        clientOrderId: intent.clientOrderId,
        observedAt: intent.createdAt + 100,
      });
    }
  };

  it('recovers exact original PLACE ownership across restart, not from a client prefix', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'pid20984-ownership-')), 'copy.sqlite');
    const snapshot = buildSnapshot();
    let Journal = new decibel_execution_lifecycle_journal_v1(path);
    seedOwners(Journal);
    Journal.close();
    Journal = new decibel_execution_lifecycle_journal_v1(path);
    try {
      expect(() => assertDecibelExposureRecoveryCompleteV1(Journal, snapshot)).not.toThrow();
      expect(assessDecibelProtectiveRecoveryV1(Journal, snapshot, snapshot.input.now).allowed).toBe(
        true,
      );
      for (const order of snapshot.input.openOrders) {
        expect(
          getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, order)?.body?.clientOrderId,
        ).toBe(order.clientOrderId);
        const partial = { ...order, quantity: 0.00031 };
        expect(getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, partial)).not.toBeNull();
        expect(
          getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, {
            ...order,
            clientOrderId: 'd1s' + 'f'.repeat(29),
          }),
        ).toBeNull();
        expect(
          getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, {
            ...order,
            price: order.price + 0.1,
          }),
        ).toBeNull();
      }
      const foreign = {
        ...snapshot,
        input: {
          ...snapshot.input,
          openOrders: [{ ...snapshot.input.openOrders[0]!, venueOrderId: 'external-order' }],
        },
      };
      expect(() => assertDecibelExposureRecoveryCompleteV1(Journal, foreign)).toThrow(
        'PRODUCTION_EXPOSURE_RECOVERY_INCOMPLETE',
      );
      expect(assessDecibelProtectiveRecoveryV1(Journal, foreign, foreign.input.now).allowed).toBe(
        false,
      );
      Journal.transition(rows[0]!.intent.intentId, 'CANCELLED_EXTERNALLY', snapshot.input.now);
      expect(
        getDecibelVerifiedCurrentPlaceOwnerV1(Journal, snapshot, snapshot.input.openOrders[0]!),
      ).toBeNull();
    } finally {
      Journal.close();
    }
  });

  it.each(
    [false, true].flatMap((partial) => rows.map((row) => ({ partial, side: row.intent.side }))),
  )(
    'admits only exact owned risk-invalid ENTRY cancellation during recovery ($side, partial=$partial)',
    async ({ partial, side }) => {
      let snapshot = buildSnapshot();
      snapshot = {
        ...snapshot,
        maximumAbsPositionBase: 0.0004,
        input: {
          ...snapshot.input,
          openOrders: snapshot.input.openOrders.filter((order) => order.side === side),
        },
      };
      const test = make({
        readSnapshot: () => snapshot,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
        cancelTargetState: 'ORDER_OPEN',
        validateSubmission: (intent) => {
          if (partial && intent.action === 'CANCEL') {
            const original = rows.find((row) => row.intent.side === side)!;
            const quantity = 0.00016;
            const ledger = applyDecibelActualFillTruthV1(
              createDecibelActualFillLedgerV1([
                {
                  venueOrderId: original.venueOrderId,
                  localIntentId: original.intent.intentId,
                  localExecutionRequestId: original.intent.clientOrderId,
                  marketAddress: snapshot.input.market,
                  side,
                  requestedQuantity: original.intent.quantity,
                },
              ]),
              {
                venueFillId: 'fake-partial-before-cancel',
                venueOrderId: original.venueOrderId,
                localExecutionRequestId: original.intent.clientOrderId,
                marketAddress: snapshot.input.market,
                side,
                executedPrice: original.intent.price,
                executedBaseQuantity: quantity,
                executedUsdNotional: original.intent.price * quantity,
                makerOrTaker: 'MAKER',
                receivedAt: new Date(snapshot.input.now),
                venueTimestamp: new Date(snapshot.input.now),
                transactionVersion: '123456789',
                executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
                fee: { availability: 'UNAVAILABLE', amount: null, currency: null },
                rebate: { availability: 'UNAVAILABLE', amount: null, currency: null },
              },
            );
            snapshot = {
              ...snapshot,
              authenticatedPositions: [
                {
                  market: 'BTC/USD',
                  size: ledger.inventoryBase,
                  entryPrice: original.intent.price,
                  source: 'BOT',
                },
              ],
              input: {
                ...snapshot.input,
                actualFillLedger: ledger,
                actualInventoryBase: ledger.inventoryBase,
                openOrders: snapshot.input.openOrders.map((order) =>
                  order.venueOrderId === intent.expectedPreviousVenueOrderId
                    ? { ...order, quantity: 0.00031 }
                    : order,
                ),
              },
            };
          }
          assertDecibelRecoveryIntentV1(test.journal, intent, snapshot);
          return {
            assertSubmissionStillAuthorized: () => undefined,
            preflight: {
              tickSize: 0.1,
              lotSize: 0.00001,
              minimumSize: 0.00001,
              minimumNotionalUsd: 0.01,
              maximumNotionalUsd: 100,
              currentPositionBase: snapshot.input.actualInventoryBase,
              openOrders: snapshot.input.openOrders,
              permittedSide: intent.side,
              bestBid: 75850,
              bestAsk: 75851,
            },
          };
        },
      });
      seedOwners(
        test.journal,
        rows.filter((row) => row.intent.side === side),
      );
      const historical = buildDecibelExecutionIntentV1({
        ...rows[0]!.intent,
        cycleSequence: 900001,
        clientOrderId: 'verified-old-client',
        createdAt: snapshot.input.now - 20000,
        knownVenueOrderId: null,
      });
      test.journal.prepare(historical);
      test.journal.applyAuthoritativeReconciliation({
        intentId: historical.intentId,
        reconciliationState: 'CANCELLED_EXTERNALLY',
        terminalStatus: 'CANCELLED_EXTERNALLY',
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
        matchedIdentifier: 'venueOrderId:verified-old-order',
        venueStatus: 'CANCELLED',
        remainingQuantity: 0,
        transactionHash: null,
        venueOrderId: 'verified-old-order',
        clientOrderId: historical.clientOrderId,
        observedAt: snapshot.input.now - 10000,
      });
      const historicalCancel = buildDecibelExecutionIntentV1({
        ...historical,
        action: 'CANCEL',
        cycleSequence: 900002,
        knownVenueOrderId: 'verified-old-order',
        cancelReason: 'HISTORICAL_CANCEL',
        createdAt: snapshot.input.now - 9000,
      });
      test.journal.prepare(historicalCancel);
      test.journal.transition(
        historicalCancel.intentId,
        'ACKNOWLEDGED',
        snapshot.input.now - 8000,
        'verified-old-order',
      );
      test.journal.markUnresolvableAcknowledgement(
        historicalCancel.intentId,
        snapshot.input.now - 7000,
      );
      test.journal.recordIdentityConflict(historicalCancel.intentId, snapshot.input.now - 6000);
      test.orchestrator.setHistoricalRecoveryBlocker('VERIFIED_HISTORICAL_RECOVERY_REPLAY');
      try {
        const result = await test.orchestrator.evaluateOnce();
        expect(
          result.action,
          JSON.stringify({ blocker: result.blocker, actions: result.evaluation?.actions }),
        ).toBe('ACKNOWLEDGED');
        expect(test.submitted()).toEqual([{ action: 'CANCEL', side }]);
        const intent = test.journal.getIntent(result.intentId!);
        expect(intent).toMatchObject({
          action: 'CANCEL',
          expectedPreviousVenueOrderId: rows.find((row) => row.intent.side === side)!.venueOrderId,
          cancelReason: 'RISK_INVALID:RESTING_ENTRY_EXCEEDS_POSITION_LIMIT',
        });
        // A later early recovery return must not re-emit the old cancel plan.
        snapshot = {
          ...snapshot,
          input: {
            ...snapshot.input,
            metadata: { ...snapshot.input.metadata, observedAt: snapshot.input.now - 6000 },
          },
        };
        const stale = await test.orchestrator.evaluateOnce();
        expect(stale.blocker).toBe('PROTECTIVE_AUTHORITATIVE_EVIDENCE_STALE');
        expect(stale.controlSnapshot.cancelReason).toBeNull();
        expect(test.submitted()).toHaveLength(1);
      } finally {
        await test.orchestrator.close();
      }
    },
  );

  it('publishes genuinely refreshed market rules through merge and projection, retaining stale read clocks', async () => {
    const base = buildSnapshot();
    base.input.metadata.observedAt = base.input.now - 6000;
    const metadata = { ...base.input.metadata };
    const readMetadata = vi.fn((signal?: AbortSignal) => {
      signal?.throwIfAborted();
      return Promise.resolve(metadata);
    });
    const Reader = {
      readMarketMetadata: readMetadata,
      readAccountOverview: () =>
        Promise.resolve({
          perp_equity_balance: 100,
          total_margin: 0,
          cross_available_to_trade: 100,
        }),
      readPositions: () => Promise.resolve([]),
      readOpenOrders: () => Promise.resolve([]),
    } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
    let clock = base.input.now + 1;
    const Source = new decibel_production_live_state_source_v1(
      Reader,
      { DECIBEL_SUBACCOUNT_ADDRESS: 'subaccount' },
      () => clock,
    );
    const Journal = new decibel_execution_lifecycle_journal_v1(
      join(mkdtempSync(join(tmpdir(), 'pid20984-rules-')), 'journal.sqlite'),
    );
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        const account = await Source.readAuthenticatedAccountState();
        const venue = mergeDecibelVenueReconciliationSnapshotV1(base, account, {
          observedAt: clock,
          readWindow: { startedAt: clock, completedAt: clock },
          ledger: base.input.actualFillLedger,
          terminalOrderEvidence: [],
        })!;
        const projected = projectDecibelVenueDecisionSnapshotV1(
          base,
          venue,
          { bestBid: 75850, bestAsk: 75851, observedAt: clock },
          base.economicInputs,
          base.input.sessionId,
          clock,
        );
        expect(projected.input.metadata.observedAt).toBe(clock);
        expect(assessDecibelProtectiveRecoveryV1(Journal, projected, clock).allowed).toBe(true);
        expect(assessDecibelProtectiveRecoveryV1(Journal, projected, clock + 6000).allowed).toBe(
          false,
        );
        clock += 10000;
      }
      expect(readMetadata).toHaveBeenCalledTimes(2);
    } finally {
      Journal.close();
      await Source.close();
    }
  });
});

describe('PID 22692 execution priority repair', () => {
  const record = JSON.parse(
    readFileSync('tests/fixtures/entry_priority_22692_v1.json', 'utf8'),
  ) as {
    facts: Array<{
      timestamp: number;
      bestBid: number;
      bestAsk: number;
      bookObservedAt: number;
      makerFeeBps: number;
      estimatedGasCostUsd: number;
      safetyMarginBps: number;
      desiredBid: { price: number; quantity: number };
      desiredAsk: { price: number; quantity: number };
      orderDecisions: Array<{
        ORDER_ID: string;
        RESTING_PRICE: number;
        ORDER_AGE_MS: number;
        RESTING_ENTRY_ECONOMICS: { decision: string; conditionalNetUsd: number };
      }>;
    }>;
  };
  const sellId = '170141599249866108650159253122449408000';
  const buildInput = (row: (typeof record.facts)[number]) => ({
    midpoint: (row.bestBid + row.bestAsk) / 2,
    makerFeeBps: row.makerFeeBps,
    gasCostUsd: row.estimatedGasCostUsd,
    safetyMarginBps: row.safetyMarginBps,
    bestBid: row.bestBid,
    bestAsk: row.bestAsk,
    tickSize: 0.1,
  });
  it('removes the recorded false SELL invalidation over every observed cycle', () => {
    let before = 0;
    let after = 0;
    for (const row of record.facts) {
      const order = row.orderDecisions.find((o) => o.ORDER_ID === sellId);
      if (!order) continue;
      const result = assessDecibelRestingEntryEconomicsV1({
        ...buildInput(row),
        side: 'SELL',
        price: 76043.2,
        quantity: 0.00047,
      });
      if (order.RESTING_ENTRY_ECONOMICS?.decision === 'CANCEL') {
        before++;
        expect(order.ORDER_AGE_MS).toBe(47205);
        expect(order.RESTING_ENTRY_ECONOMICS.conditionalNetUsd).toBeCloseTo(-0.000075676, 12);
        expect(result.conditionalNetUsd).toBeCloseTo(0.0034983544, 12);
      }
      if (result.decision !== 'KEEP') after++;
      expect(result.decision).toBe('KEEP');
    }
    expect({ before, after }).toEqual({ before: 1, after: 0 });
  });
  it('keeps intermediate BUY without depth and keeps farther SELL', () => {
    const row = record.facts.find((r) => r.desiredBid.price === 76002.7)!;
    expect(row).toBeDefined();
    const buy = assessDecibelEntryReplacementEconomicsV1({
      ...buildInput(row),
      side: 'BUY',
      restingPrice: 75984.8,
      candidatePrice: 76002.7,
      restingQuantity: 0.00047,
      candidateQuantity: 0.00047,
    });
    expect(buy).toMatchObject({
      decision: 'KEEP',
      fillProbability: null,
      expectedValueUsd: null,
    });
    expect(buy.executionImprovementUsd).toBeCloseTo(17.9 * 0.00047, 12);
    expect(buy.replacementCostUsd).toBe(0.0007992);
    expect(
      assessDecibelEntryReplacementEconomicsV1({
        ...buildInput(row),
        side: 'SELL',
        restingPrice: 76043.2,
        candidatePrice: 76044.3,
        restingQuantity: 0.00047,
        candidateQuantity: 0.00047,
      }).decision,
    ).toBe('KEEP');
  });
  it('keeps hypothetical mark losses and refuses noise, crossing and unknown books', () => {
    const row = record.facts.find((r) => r.desiredBid.price === 76002.7)!;
    const common = {
      ...buildInput(row),
      side: 'BUY' as const,
      restingPrice: 75984.8,
      candidatePrice: 75985.1,
      restingQuantity: 0.00047,
      candidateQuantity: 0.00047,
    };
    expect(assessDecibelEntryReplacementEconomicsV1(common).decision).toBe('KEEP');
    expect(
      assessDecibelEntryReplacementEconomicsV1({ ...common, candidatePrice: row.bestAsk }).decision,
    ).toBe('KEEP');
    expect(
      assessDecibelEntryReplacementEconomicsV1({
        ...common,
        bestBid: row.bestAsk,
        bestAsk: row.bestBid,
      }).decision,
    ).toBe('KEEP');
    expect(
      assessDecibelRestingEntryEconomicsV1({
        ...buildInput(row),
        side: 'SELL',
        price: 76043.2,
        midpoint: 76043.2,
        quantity: 0.00047,
      }).decision,
    ).toBe('KEEP');
  });
  it('replaces an attainable BUY with synthetic depth proof and refuses stale evidence', () => {
    const row = record.facts.find((r) => r.desiredBid.price === 76002.7)!;
    const base = makeSnapshot();
    const current = {
      venueOrderId: 'recorded-buy',
      clientOrderId: 'd1b' + 'a'.repeat(29),
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side: 'BUY' as const,
      price: 75984.8,
      quantity: 0.00047,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true as const,
      reduceOnly: false,
    };
    const snapshot = makeSnapshot({
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 40,
      economicInputs: {
        ...base.economicInputs,
        makerFeeBps: row.makerFeeBps,
        estimatedGasCostUsd: row.estimatedGasCostUsd,
        safetyMarginBps: 1,
      },
      input: {
        ...base.input,
        metadata: { ...base.input.metadata, lotSize: 0.00001, minimumSize: 0.00001 },
        book: {
          bestBid: row.bestBid,
          bestAsk: row.bestAsk,
          observedAt: base.input.now,
          // Synthetic depth extension: the historical tape contains BBO only.
          depth: {
            observedAt: base.input.now,
            bids: [
              { price: row.bestBid, size: 1 },
              { price: 76010, size: 1 },
              { price: 76000, size: 1 },
              { price: 75984.8, size: 0.00047 },
            ],
            asks: [{ price: row.bestAsk, size: 1 }],
          },
        },
        openOrders: [current],
      },
    });
    const sizing = {
      entryHeadroomUsd: 100,
      candidateSearchDepthPerSide: 7,
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 100,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 40,
      maximumAbsPositionBase: 0.001,
      flatPairSharedBaseQuantity: 0.00047,
      makerFeeBps: row.makerFeeBps,
      estimatedGasCostUsd: row.estimatedGasCostUsd,
      safetyMarginBps: 1,
    };
    const evaluation = evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, sizing);
    const action = evaluation.actions.find((a) => a.side === 'BUY')!;
    expect(action, JSON.stringify(evaluation)).toBeDefined();
    expect(action.action, JSON.stringify(action)).toBe('WOULD_REPLACE');
    // Anti-chase band: the resting BUY is ~2.4 bps (17.9 USD) behind the candidate. A 2 bps
    // band still replaces it; the 3 bps floor band and a fast-market band keep it resting.
    const banded = (bps: number) =>
      evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
        ...sizing,
        entryReplacementMinimumBps: bps,
      }).actions.find((a) => a.side === 'BUY')?.action;
    expect(banded(2)).toBe('WOULD_REPLACE');
    expect(banded(getDecibelEntryReplacementBandBpsV1(null))).not.toBe('WOULD_REPLACE');
    expect(banded(getDecibelEntryReplacementBandBpsV1(400))).not.toBe('WOULD_REPLACE');
    expect(evaluateDecibelReplacementDecisionV1(action, snapshot, 0, 60000, 75)?.cancel).toBe(true);
    expect(
      evaluateDecibelReplacementDecisionV1(
        action,
        {
          ...snapshot,
          input: { ...snapshot.input, book: { ...snapshot.input.book, observedAt: -10000 } },
        },
        0,
        60000,
        75,
      )?.cancel,
    ).not.toBe(true);
  });
});

it.each([
  'NORMAL',
  'PARTIAL',
  'RESTART',
  'WORSE',
  'INTERMEDIATE',
  'DEPTH_LOST',
  'ADMISSION_CHANGED',
  'STALE',
] as const)('PID 22692 live replay: finality, fresh maker and no duplicate (%s)', async (mode) => {
  const base = makeSnapshot();
  let terminal = false;
  let moved = false;
  let worsened = false,
    depthLost = false,
    costChanged = false,
    bookStale = false;
  let ledger = base.input.actualFillLedger;
  const replayPath = join(mkdtempSync(join(tmpdir(), 'entry-priority-')), 'journal.sqlite');
  const events: execution_intent_v1[] = [];
  const current = {
    venueOrderId: 'fake-priority-buy',
    clientOrderId: 'd1b' + 'c'.repeat(29),
    strategyConfigId: base.input.strategyConfigId,
    market: base.input.market,
    side: 'BUY' as const,
    price: 75964.8, // ~5 bps below the recorded candidate: outside the anti-chase band
    quantity: 0.00047,
    orderType: 'LIMIT' as const,
    timeInForce: 'PostOnly' as const,
    postOnly: true as const,
    reduceOnly: false,
  };
  const snapshot = (): decibel_production_live_snapshot_v1 =>
    makeSnapshot({
      sourceStateHash: 'priority-' + terminal + '-' + moved + '-' + events.length,
      halfSpreadBps: 3,
      sessionConfiguration: {
        revision: 1,
        capitalToUseUsd: 100,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 1000,
        maxPositionUsd: 72,
        marginUsedUsd: 0,
        makerVolumeUsd: 0,
        totalExecutedVolumeUsd: 0,
        pnlUsd: 0,
        riskBlocker: null,
        exposureLimits: {
          configuredMaximumPositionUsd: 72,
          effectivePositionLimitUsd: 72,
          currentExposureUsd: 0,
          pendingExposureUsd: terminal ? 0 : 35.72,
          availableHeadroomUsd: 72,
          capacityBlocker: null,
        },
      },
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 72,
      maximumAbsPositionBase: 0.00094,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 40,
      economicInputs: {
        ...base.economicInputs,
        makerFeeBps: mode === 'INTERMEDIATE' || mode === 'DEPTH_LOST' || costChanged ? 1.5 : 0,
        estimatedGasCostUsd:
          mode === 'INTERMEDIATE' || mode === 'DEPTH_LOST' || costChanged ? 0.0003996 : 0,
        safetyMarginBps: mode === 'INTERMEDIATE' || mode === 'DEPTH_LOST' || costChanged ? 1 : 0,
      },
      authenticatedPositions:
        ledger.inventoryBase === 0
          ? []
          : [
              {
                market: 'BTC/USD',
                size: ledger.inventoryBase,
                entryPrice: current.price,
                source: 'BOT',
              },
            ],
      terminalOrderEvidence: terminal
        ? [
            {
              venueOrderId: current.venueOrderId,
              clientOrderId: current.clientOrderId,
              status: 'CANCELLED',
              observedAt: 1000,
              remainingQuantity: 0,
            },
          ]
        : [],
      input: {
        ...base.input,
        actualInventoryBase: ledger.inventoryBase,
        actualFillLedger: ledger,
        metadata: { ...base.input.metadata, lotSize: 0.00001, minimumSize: 0.00001 },
        book: {
          bestBid: worsened ? 75950 : moved ? 76025 : 76023,
          bestAsk: worsened ? 75950.8 : moved ? 76025.8 : 76023.8,
          observedAt: bookStale ? -10000 : 1000,
          ...((mode === 'INTERMEDIATE' || mode === 'DEPTH_LOST') && !depthLost
            ? {
                depth: {
                  observedAt: 1000,
                  bids: [
                    { price: moved ? 76025 : 76023, size: 1 },
                    { price: 76010, size: 1 },
                    { price: 76000, size: 1 },
                    { price: 75964.8, size: 0.00047 },
                  ],
                  asks: [{ price: moved ? 76025.8 : 76023.8, size: 1 }],
                },
              }
            : {}),
        },
        openOrders: terminal
          ? []
          : [
              {
                ...current,
                quantity: Number((current.quantity - ledger.inventoryBase).toFixed(8)),
              },
            ],
      },
    });
  const buildHarness = () =>
    make({
      journalPath: replayPath,
      readSnapshot: snapshot,
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      cancelTargetState: 'ORDER_OPEN',
      reconcileIntent: () =>
        Promise.resolve(
          terminal ? 'ORDER_CANCELLED' : ledger.inventoryBase > 0 ? 'PARTIAL_FILL' : 'ORDER_OPEN',
        ),
      executor: {
        cancelExactOrder: (i) => {
          events.push(i);
          return Promise.resolve({ outcome: 'CANCEL_CONFIRMED' });
        },
        placePostOnlyLimit: (i) => {
          events.push(i);
          return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId: 'fake-new' });
        },
      },
    });
  let test = buildHarness();
  const owner = buildDecibelExecutionIntentV1({
    ...current,
    market: 'BTC/USD',
    sessionId: 'session',
    cycleSequence: 1,
    action: 'PLACE',
    tickSize: 0.1,
    lotSize: 0.00001,
    knownVenueOrderId: null,
    sourceStateHash: 'fake-owner',
    strategyDecisionHash: 'fake-owner',
    createdAt: 900,
  });
  test.journal.prepare(owner);
  test.journal.transition(owner.intentId, 'ACKNOWLEDGED', 950, current.venueOrderId);
  try {
    const first = await test.orchestrator.evaluateOnce();
    expect(
      events.map((i) => i.action),
      JSON.stringify(first),
    ).toEqual(['CANCEL']);
    if (mode === 'INTERMEDIATE') {
      const proof = first.evaluation?.actions.find(
        (action) => action.current?.venueOrderId === current.venueOrderId,
      )?.entryReplacementEconomics;
      expect(proof?.priorityEvidence).toBe('VISIBLE_PRICE_LEVELS_PASSED');
      expect(proof?.crossedVisibleLevelCount).toBe(1);
    }
    const frozenPrice = test.orchestrator['FrozenReprice']?.action.desired?.price;
    // The runtime uses this id to run the next cycle early while the place is pending.
    expect(test.orchestrator.getPendingReplacementDecisionId()).toBe(
      test.orchestrator['FrozenReprice']?.decisionId ?? null,
    );
    for (let i = 0; i < 5; i++) await test.orchestrator.evaluateOnce();
    expect(events.map((i) => i.action)).toEqual(['CANCEL']);
    if (mode === 'RESTART') {
      await test.orchestrator.close();
      test = buildHarness();
      for (let i = 0; i < 5; i++) await test.orchestrator.evaluateOnce();
      expect(events.map((i) => i.action)).toEqual(['CANCEL']);
    }
    if (mode === 'PARTIAL') {
      ledger = applyDecibelActualFillTruthV1(
        createDecibelActualFillLedgerV1([
          {
            venueOrderId: current.venueOrderId,
            localIntentId: owner.intentId,
            localExecutionRequestId: current.clientOrderId,
            marketAddress: current.market,
            side: 'BUY',
            requestedQuantity: current.quantity,
          },
        ]),
        {
          venueFillId: 'fake-priority-partial',
          venueOrderId: current.venueOrderId,
          localExecutionRequestId: current.clientOrderId,
          marketAddress: current.market,
          side: 'BUY',
          executedPrice: current.price,
          executedBaseQuantity: 0.00016,
          executedUsdNotional: current.price * 0.00016,
          makerOrTaker: 'MAKER',
          receivedAt: new Date(1000),
          venueTimestamp: new Date(1000),
          transactionVersion: '12345',
          executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM',
          fee: { availability: 'UNAVAILABLE', amount: null, currency: null },
          rebate: { availability: 'UNAVAILABLE', amount: null, currency: null },
        },
      );
      await test.orchestrator.evaluateOnce();
      expect(events.map((i) => i.action)).toEqual(['CANCEL']);
    }
    terminal = true;
    if (mode === 'STALE') {
      bookStale = true;
      for (let cycle = 0; cycle < 3; cycle++) await test.orchestrator.evaluateOnce();
      expect(events.map((i) => i.action)).toEqual(['CANCEL']);
      bookStale = false;
    }
    if (mode === 'DEPTH_LOST' || mode === 'ADMISSION_CHANGED') {
      depthLost = true;
      costChanged = mode === 'ADMISSION_CHANGED';
      let aborted;
      for (let cycle = 0; cycle < 5 && test.orchestrator['FrozenReprice'] !== null; cycle++)
        aborted = await test.orchestrator.evaluateOnce();
      expect(aborted?.blocker).toBe('ENTRY_REPLACEMENT_PRIORITY_NO_LONGER_IMPROVED');
      expect(test.orchestrator['FrozenReprice']).toBeNull();
      expect(events.map((i) => i.action)).toEqual(['CANCEL']);
      for (let cycle = 0; cycle < 5 && events.length < 2; cycle++)
        await test.orchestrator.evaluateOnce();
      expect(events.map((i) => i.action)).toEqual(['CANCEL', 'PLACE']);
      if (mode === 'ADMISSION_CHANGED') expect(events[1]!.price).not.toBe(frozenPrice);
      const fresh = snapshot(),
        placed = events[1]!;
      expect(
        assessDecibelEntryPhaseEconomicsV1({
          phase: 'PLACE',
          side: placed.side,
          price: placed.price,
          quantity: placed.quantity,
          midpoint: (fresh.input.book.bestBid + fresh.input.book.bestAsk) / 2,
          makerFeeBps: fresh.economicInputs!.makerFeeBps,
          gasCostUsd: fresh.economicInputs!.estimatedGasCostUsd,
          safetyMarginBps: fresh.economicInputs!.safetyMarginBps,
        }).conditionalNetUsd,
      ).toBeGreaterThanOrEqual(0);
      return;
    }
    if (mode === 'WORSE') {
      worsened = true;
      let aborted;
      for (let cycle = 0; cycle < 5 && test.orchestrator['FrozenReprice'] !== null; cycle++)
        aborted = await test.orchestrator.evaluateOnce();
      expect(aborted?.blocker).toBe('ENTRY_REPLACEMENT_PRIORITY_NO_LONGER_IMPROVED');
      expect(events.map((i) => i.action)).toEqual(['CANCEL']);
      expect(test.orchestrator['FrozenReprice']).toBeNull();
      // The stale strategy commitment is gone. A fresh admitted maker is
      // independent of the cancelled price, even at a less competitive price.
      const next = await test.orchestrator.evaluateOnce();
      expect(next.blocker).not.toBe('ENTRY_REPLACEMENT_PRIORITY_NO_LONGER_IMPROVED');
      expect(events.map((i) => i.action)).toEqual(['CANCEL', 'PLACE']);
      expect(events[1]!.price).not.toBe(frozenPrice);
      return;
    }
    moved = true;
    const results = [];
    for (let i = 0; i < 5 && events.length < 2; i++)
      results.push(await test.orchestrator.evaluateOnce());
    if (mode === 'PARTIAL') {
      expect(ledger.inventoryBase).toBe(0.00016);
      expect(test.orchestrator['FrozenReprice']).toBeNull();
      for (const place of events.filter((i) => i.action === 'PLACE')) {
        expect(place.reduceOnly).toBe(true);
        expect(place.quantity).toBeLessThanOrEqual(ledger.inventoryBase);
      }
      return;
    }
    if (mode === 'RESTART') {
      expect(events.map((i) => i.action)).toEqual(['CANCEL', 'PLACE']);
      const fresh = events[1]!;
      expect(fresh.timeInForce).toBe('PostOnly');
      expect(fresh.side === 'BUY' ? fresh.price < 76025.8 : fresh.price > 76025.2).toBe(true);
      return;
    }
    expect(
      events[1]?.side,
      JSON.stringify(
        results.map((r) => ({
          action: r.action,
          blocker: r.blocker,
          selected: r.controlSnapshot,
          frozen: test.orchestrator['FrozenReprice'],
        })),
      ),
    ).toBe('BUY');
    expect(events.map((i) => i.action)).toEqual(['CANCEL', 'PLACE']);
    const replacement = events[1]!;
    expect(replacement.price).not.toBe(frozenPrice);
    expect(replacement.price).toBeGreaterThan(current.price);
    expect(replacement.price).toBeLessThan(76025.8);
    if (mode === 'INTERMEDIATE') {
      expect(replacement.price).toBeLessThan(76025);
      const market = snapshot();
      const assess = (price: number) =>
        assessDecibelEntryPhaseEconomicsV1({
          phase: 'PLACE',
          side: 'BUY',
          price,
          quantity: replacement.quantity,
          midpoint: (market.input.book.bestBid + market.input.book.bestAsk) / 2,
          makerFeeBps: market.economicInputs!.makerFeeBps,
          gasCostUsd: market.economicInputs!.estimatedGasCostUsd,
          safetyMarginBps: market.economicInputs!.safetyMarginBps,
        });
      expect(assess(76025).conditionalNetUsd).toBeLessThan(0);
      expect(assess(replacement.price).conditionalNetUsd).toBeGreaterThanOrEqual(0);
    }

    expect(replacement.timeInForce).toBe('PostOnly');
    expect(replacement.quantity).toBeLessThanOrEqual(current.quantity);
  } finally {
    await test.orchestrator.close();
  }
});

describe('PID 3108 fresh admission after economic cancellation', () => {
  it('admits SELL and BUY using current evidence after a terminal cancellation and restart', async () => {
    const journalPath = join(mkdtempSync(join(tmpdir(), 'readmission-11816-')), 'journal.sqlite');
    const base = makeSnapshot();
    let restored = false;
    const openOrders: decibel_production_live_snapshot_v1['input']['openOrders'][number][] = [];
    const setup = () =>
      make({
        journalPath,
        readSnapshot: read,
        environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
        reconciliationState: 'ORDER_OPEN',
        executor: {
          placePostOnlyLimit: (intent) => {
            const venueOrderId = 'fake-' + intent.side;
            openOrders.push({
              ...intent,
              venueOrderId,
              market: base.input.market,
              strategyConfigId: base.input.strategyConfigId,
              orderType: 'LIMIT',
            });
            return Promise.resolve({ outcome: 'PLACE_ACKNOWLEDGED', venueOrderId });
          },
          cancelExactOrder: () => {
            throw new Error('UNEXPECTED_CANCEL');
          },
        },
      });
    const read = () =>
      makeSnapshot({
        sourceStateHash: restored ? 'restored-market' : 'same-market',
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 40,
        availableMarginUsd: 5,
        maximumEffectiveLeverage: 40,
        maximumAbsPositionBase: 0.0005,
        economicInputs: {
          ...base.economicInputs,
          makerFeeBps: 1.5,
          estimatedGasCostUsd: 0.0003657,
          safetyMarginBps: 1,
        },
        input: {
          ...base.input,
          openOrders,
          metadata: { ...base.input.metadata, lotSize: 0.00001, minimumSize: 0.00001 },
          book: {
            bestBid: restored ? 75813.7 : 75783.7,
            bestAsk: restored ? 75814 : 75784,
            observedAt: base.input.now,
          },
        },
      });
    let test = setup();
    const cancel = buildDecibelExecutionIntentV1({
      sessionId: base.input.sessionId,
      cycleSequence: 0,
      action: 'CANCEL',
      market: 'BTC/USD',
      side: 'SELL',
      price: 75772.6,
      quantity: 0.00047,
      tickSize: 0.1,
      lotSize: 0.00001,
      clientOrderId: 'pid11816',
      knownVenueOrderId: '170141591643962507426772427001999392768',
      sourceStateHash: 'cancel',
      strategyDecisionHash: 'cancel',
      createdAt: 1,
      cancelReason: 'ECONOMIC_INVALID:RESTING_ENTRY_FUTURE_EDGE_INSUFFICIENT',
    });
    test.journal.prepare(cancel);
    test.journal.transition(cancel.intentId, 'APPLIED', 2);
    await test.orchestrator.close();
    test = setup();
    try {
      const results = [];
      for (let cycle = 0; cycle < 4; cycle++) results.push(await test.orchestrator.evaluateOnce());
      expect(results.some((row) => row.blocker?.includes('ENTRY_READMISSION'))).toBe(false);
      expect(openOrders.some((row) => row.side === 'SELL')).toBe(true);
      expect(openOrders.some((row) => row.side === 'BUY')).toBe(true);
      expect(new Set(openOrders.map((row) => row.side)).size).toBe(openOrders.length);
      restored = true; // Rising market; keep the authenticated SELL pending fills.
      for (let cycle = 0; cycle < 4; cycle++) await test.orchestrator.evaluateOnce();
      expect(openOrders).toHaveLength(2);
    } finally {
      await test.orchestrator.close();
    }
  });
});

it.each(['BUY', 'SELL'] as const)(
  'keeps PID 11816 BUY / rising-market SELL mark shortfalls; cancels independently invalid %s exposure',
  (side) => {
    const base = makeSnapshot();
    const midpoint = side === 'BUY' ? 75772.6 / (1 - 1.484485 / 10000) : 75840;
    const current = {
      venueOrderId: side === 'BUY' ? '170141591643962507426772427001999392768' : 'rising-sell',
      clientOrderId: 'd1' + (side === 'BUY' ? 'b' : 's') + 'a'.repeat(29),
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side,
      price: side === 'BUY' ? 75772.6 : 75827.4,
      quantity: 0.00047,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    };
    const input = {
      ...base.input,
      metadata: { ...base.input.metadata, lotSize: 0.00001, minimumSize: 0.00001 },
      book: { bestBid: midpoint - 0.15, bestAsk: midpoint + 0.15, observedAt: base.input.now },
      openOrders: [current],
    };
    const sizing = {
      minimumNotionalUsd: 10,
      maximumNotionalUsd: 40,
      entryHeadroomUsd: 40,
      availableMarginUsd: 100,
      maximumEffectiveLeverage: 40,
      maximumAbsPositionBase: 0.0006,
      flatPairSharedBaseQuantity: current.quantity,
      makerFeeBps: 1.5,
      estimatedGasCostUsd: 0.0003657,
      safetyMarginBps: 1,
    };
    const action = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, sizing).actions.find(
      (row) => row.current?.venueOrderId === current.venueOrderId,
    )!;
    expect(action.action).toBe('NO_OP');
    expect(action.entryEconomics?.conditionalNetUsd).toBeLessThan(0);
    if (side === 'BUY')
      expect(action.entryEconomics?.conditionalNetUsd).toBeCloseTo(-0.0004201803, 7);
    const invalid = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, {
      ...sizing,
      maximumAbsPositionBase: 0.0004,
    });
    expect(
      invalid.actions.find((row) => row.current?.venueOrderId === current.venueOrderId),
    ).toMatchObject({
      action: 'WOULD_CANCEL',
      reason: 'RISK_INVALID:RESTING_ENTRY_EXCEEDS_POSITION_LIMIT',
    });
  },
);

describe('PID 14112 timestamped maker lifecycle replay', () => {
  const record = JSON.parse(
    readFileSync('tests/fixtures/maker_entry_14112_replay_v1.json', 'utf8'),
  ) as {
    restingPrice: number;
    quantity: number;
    bestAskAtReview: number;
    frames: Array<{ elapsedMs: number; midpointOffset: number; candidatePrice: number }>;
    syntheticCancelFinalityMs: number;
  };
  it('keeps the exact 1-tick / 3-tick episode and 10000 oscillating authenticated controller cycles', async () => {
    const base = makeSnapshot();
    let now = 1000,
      offset = 0;
    const midpoint = record.bestAskAtReview - 0.15;
    // Choose known test costs so the algebraic admission boundary lies halfway
    // between .6 and .7. These are reconstructed inputs, not claimed venue fees.
    const gas = ((75854.65 * (1 - 2.5 / 10000) - midpoint) * record.quantity) / 2;
    const orders = (['BUY', 'SELL'] as const).map((side) => ({
      venueOrderId: 'pid14112-' + side,
      clientOrderId: 'd1' + (side === 'BUY' ? 'b' : 's') + 'a'.repeat(29),
      strategyConfigId: base.input.strategyConfigId,
      market: base.input.market,
      side,
      price: side === 'BUY' ? 75830 : record.restingPrice,
      quantity: record.quantity,
      reduceOnly: false,
      orderType: 'LIMIT' as const,
      timeInForce: 'PostOnly' as const,
      postOnly: true,
    }));
    const read = (): decibel_production_live_snapshot_v1 =>
      makeSnapshot({
        sourceStateHash: '14112-' + now + '-' + offset,
        minimumNotionalUsd: 10,
        maximumNotionalUsd: 72,
        maximumAbsPositionBase: 0.00094,
        availableMarginUsd: 100,
        maximumEffectiveLeverage: 40,
        economicInputs: {
          ...base.economicInputs,
          makerFeeBps: 1.5,
          estimatedGasCostUsd: gas,
          safetyMarginBps: 1,
        },
        input: {
          ...base.input,
          now,
          metadata: {
            ...base.input.metadata,
            lotSize: 0.00001,
            minimumSize: 0.00001,
            observedAt: now,
          },
          book: {
            bestBid: record.bestAskAtReview - 0.3 + offset,
            bestAsk: record.bestAskAtReview + offset,
            observedAt: now,
            depth: {
              observedAt: now,
              bids: [
                { price: Number((record.bestAskAtReview - 0.3 + offset).toFixed(1)), size: 1 },
                { price: 75830, size: record.quantity },
              ],
              asks: [
                { price: Number((record.bestAskAtReview + offset).toFixed(1)), size: 1 },
                ...(offset === -0.2 ? [{ price: 75854.6, size: 0.00001 }] : []),
                { price: record.restingPrice, size: record.quantity },
                { price: 75860, size: 1 },
              ],
            },
          },
          openOrders: orders,
        },
      });
    const events: execution_intent_v1[] = [];
    const test = make({
      journalPath: ':memory:',
      readSnapshot: read,
      reconciliationState: 'ORDER_OPEN',
      environment: { DECIBEL_EXECUTOR_DRY_RUN: 'false' },
      cancelTargetState: 'ORDER_OPEN',
      executor: {
        placePostOnlyLimit: (intent) => {
          events.push(intent);
          throw Error('UNEXPECTED_PLACE');
        },
        cancelExactOrder: (intent) => {
          events.push(intent);
          throw Error('UNEXPECTED_CANCEL');
        },
      },
    });
    for (const order of orders) {
      const owner = buildDecibelExecutionIntentV1({
        ...order,
        market: 'BTC/USD',
        sessionId: base.input.sessionId,
        action: 'PLACE',
        cycleSequence: order.side === 'BUY' ? 1 : 2,
        tickSize: 0.1,
        lotSize: 0.00001,
        knownVenueOrderId: null,
        sourceStateHash: 'original',
        strategyDecisionHash: 'original',
        createdAt: 1,
      });
      test.journal.prepare(owner);
      test.journal.transition(owner.intentId, 'ACKNOWLEDGED', 2, order.venueOrderId);
    }
    const trace: Array<{
      elapsedMs: number;
      candidatePrice: number | undefined;
      decision: string | undefined;
    }> = [];
    let blocked = 0;
    let legacyRestingPrice = record.restingPrice,
      legacyPendingAt: number | null = null;
    const baseline = { cancel: 0, place: 0, entryAbsentMs: 0, tickOnlyReplacements: 0 };
    const replayPreviousPolicy = (candidate: decibel_recycling_action_v1['priceCandidate']) => {
      if (!candidate) return;
      if (legacyPendingAt !== null) {
        if (now - legacyPendingAt >= record.syntheticCancelFinalityMs) {
          baseline.place++;
          baseline.entryAbsentMs += now - legacyPendingAt;
          legacyRestingPrice = candidate.price;
          legacyPendingAt = null;
        }
        return;
      }
      const current = read();
      const review = assessDecibelEntryReplacementEconomicsV1({
        side: 'SELL',
        restingPrice: legacyRestingPrice,
        candidatePrice: candidate.price,
        restingQuantity: record.quantity,
        candidateQuantity: candidate.quantity,
        midpoint: (current.input.book.bestBid + current.input.book.bestAsk) / 2,
        bestBid: current.input.book.bestBid,
        bestAsk: current.input.book.bestAsk,
        tickSize: 0.1,
        makerFeeBps: 1.5,
        gasCostUsd: gas,
        safetyMarginBps: 1,
        depth: current.input.book.depth!,
        now,
        bookObservedAt: now,
        maximumBookAgeMs: 5000,
      });
      // Exact c143 predicate for this episode: admission, better maker price,
      // and any strictly passed visible level; no liquidity/price stability test.
      if (
        candidate.price < legacyRestingPrice &&
        candidate.price > current.input.book.bestBid &&
        review.candidateAdmission.conditionalNetUsd !== null &&
        review.candidateAdmission.conditionalNetUsd >= 0 &&
        (candidate.price <= current.input.book.bestAsk || review.crossedVisibleLevelCount > 0)
      ) {
        baseline.cancel++;
        baseline.tickOnlyReplacements++;
        legacyPendingAt = now;
      }
    };
    try {
      for (const frame of record.frames) {
        now = 1000 + frame.elapsedMs;
        offset = frame.midpointOffset;
        const result = await test.orchestrator.evaluateOnce();
        const sell = result.evaluation?.actions.find((action) => action.side === 'SELL');
        replayPreviousPolicy(sell?.priceCandidate);
        trace.push({
          elapsedMs: frame.elapsedMs,
          candidatePrice: sell?.priceCandidate?.price,
          decision: sell?.action,
        });
        expect(sell?.priceCandidate?.price).toBeCloseTo(frame.candidatePrice, 7);
        expect(sell?.desired?.price).toBe(record.restingPrice);
        // Reproduce all predicates that made the old boundary-only comparison
        // cancel this valid order; the new decision differs only on book priority.
        expect(
          sell?.entryReplacementEconomics?.candidateAdmission.conditionalNetUsd,
        ).toBeGreaterThanOrEqual(0);
        expect(sell?.entryReplacementEconomics?.closestAdmissiblePrice).toBeCloseTo(
          frame.candidatePrice,
          7,
        );
        expect(sell!.priceCandidate!.price).toBeLessThan(record.restingPrice);

        expect(sell?.entryReplacementEconomics?.crossedVisibleLevelCount).toBe(
          frame.midpointOffset === -0.2 ? 1 : 0,
        );
        expect(sell?.action).toBe('NO_OP');
        expect(result.action, JSON.stringify(result.controlSnapshot)).toBe('HOLD');
      }
      for (let cycle = 0; cycle < 10000; cycle++) {
        now += 100;
        offset = (cycle % 3) * -0.1;
        const result = await test.orchestrator.evaluateOnce();
        const sell = result.evaluation?.actions.find((action) => action.side === 'SELL');
        replayPreviousPolicy(sell?.priceCandidate);
        expect(sell?.desired?.price).toBe(record.restingPrice);
        if (result.action === 'BLOCKED') blocked++;
        expect(result.action).toBe('HOLD');
      }
      expect(events).toEqual([]);
      expect(blocked).toBe(0);
      expect(test.orchestrator['FrozenReprice']).toBeNull();
      expect(trace.map((row) => row.decision)).toEqual(['NO_OP', 'NO_OP', 'NO_OP']);
      expect(baseline).toEqual({
        cancel: 1,
        place: 1,
        entryAbsentMs: record.syntheticCancelFinalityMs,
        tickOnlyReplacements: 1,
      });
      const after = {
        cancel: events.filter((row) => row.action === 'CANCEL').length,
        place: events.filter((row) => row.action === 'PLACE').length,
        entryAbsentMs: 0,
        tickOnlyReplacements: 0,
        blockedControllerCycles: blocked,
      };
      const metrics = {
        replay: 'PID14112_RECONSTRUCTED',
        trace,
        soakCycles: 10000,
        baselineBuild: 'c143dcba9cf93102',
        baselineFinalityProvenance:
          'Synthetic 2000ms finality with a constructed dust level at 75854.6; not historical PID14112 depth',
        baseline,
        after,
      };
      writeFileSync('.tmp_entry_stability_metrics.log', JSON.stringify(metrics, null, 2) + '\n');
    } finally {
      await test.orchestrator.close();
    }
  }, 120000);
});

it('publishes current venue depth through the market projection without re-aging an older depth frame', async () => {
  const base = makeSnapshot();
  let now = 1000,
    withDepth = true;
  const reader = {
    readMarketMetadata: () => Promise.resolve({ ...base.input.metadata, maximumLeverage: 40 }),
    readCurrentBook: () =>
      Promise.resolve({
        market: base.input.market,
        best_bid: 100,
        best_ask: 100.2,
        unix_ms: now,
        ...(withDepth
          ? {
              bids: [
                { price: 100, size: 1 },
                { price: 99, size: 1 },
              ],
              asks: [
                { price: 100.2, size: 1 },
                { price: 101, size: 1 },
              ],
            }
          : {}),
      }),
    readMarketDataDiagnostics: () => ({
      wsConnectionState: 'CONNECTED',
      wsSubscriptionState: 'SUBSCRIBED',
      lastWsMessageAgeMs: 0,
      lastValidBboAgeMs: 0,
      wsReconnectCount: 0,
      wsLastDisconnectReason: null,
    }),
  } as unknown as DecibelProductionLiveAuthenticatedReaderV1;
  const Source = new decibel_production_live_state_source_v1(
    reader,
    { DECIBEL_NETWORK: 'mainnet', DECIBEL_SUBACCOUNT_ADDRESS: '0x123' },
    () => now,
  );
  try {
    const market = await Source.readPublicMarketState();
    expect(market.depth?.bids).toHaveLength(2);
    expect(market.depth?.observedAt).toBe(now);
    const projected = projectDecibelVenueDecisionSnapshotV1(
      base,
      base,
      market,
      base.economicInputs,
      'session',
      now,
    );
    expect(projected.input.book.depth).toEqual(market.depth);
    withDepth = false;
    now++;
    const next = await Source.readPublicMarketState();
    const cleared = projectDecibelVenueDecisionSnapshotV1(
      projected,
      base,
      next,
      base.economicInputs,
      'session',
      now,
    );
    expect(cleared.input.book.depth).toBeUndefined();
    expect(cleared.sourceStateHash).not.toBe(projected.sourceStateHash);
  } finally {
    await Source.close();
  }
});

describe('PID 24216 bounded read-only production evidence replay', () => {
  const evidence = JSON.parse(
    readFileSync('tests/fixtures/entry_stability_24216_v1.json', 'utf8'),
  ) as {
    actualCancels: Array<{
      orderId: string;
      side: 'BUY' | 'SELL';
      restingPrice: number;
      quantity: number;
      placeAt: number;
      cancelAt: number;
      ageSincePlaceMs: number;
      candidatePrice: number;
      reason: string;
      observedTerminalToReplacementAckMs: number;
      mutationAttemptCount: number;
      sessionMatchesObservedRuntime: boolean;
      executorOutcomes: Array<{ outcome: string }>;
      replacement: { price: number; reduceOnly: boolean };
    }>;
    observedKeeps: Array<{
      at: number;
      bestBid: number;
      bestAsk: number;
      orders: Array<{
        restingPrice: number;
        candidatePrice: number;
        decision: string;
        crossedVisibleLevelCount: number;
      }>;
    }>;
  };
  it('keeps the observed SELL and worse BUY; the supplied KEEP segment is not cancellation evidence', () => {
    expect(evidence.observedKeeps).toHaveLength(1);
    const row = evidence.observedKeeps[0]!;
    for (const order of row.orders) {
      const side = order.restingPrice > row.bestAsk ? 'SELL' : 'BUY';
      const result = assessDecibelEntryReplacementEconomicsV1({
        side,
        restingPrice: order.restingPrice,
        candidatePrice: order.candidatePrice,
        restingQuantity: 0.00047,
        candidateQuantity: 0.00047,
        bestBid: row.bestBid,
        bestAsk: row.bestAsk,
        midpoint: (row.bestBid + row.bestAsk) / 2,
        tickSize: 0.1,
        makerFeeBps: 1.5,
        gasCostUsd: 0.0003869796,
        safetyMarginBps: 1,
      });
      expect(order.decision).toBe('NO_OP');
      expect(order.crossedVisibleLevelCount).toBe(0);
      expect(result.decision).toBe('KEEP');
    }
  });
  it('retains four actual strategic cancels and their replacement outcomes separately from missing historical depth', () => {
    expect(evidence.actualCancels).toHaveLength(4);
    const sell = evidence.actualCancels.find(
      (row) => row.orderId === '170141599249866108165711654172879749120',
    )!;
    expect(sell).toMatchObject({
      side: 'SELL',
      restingPrice: 75685.9,
      candidatePrice: 75681.2,
      ageSincePlaceMs: 11993,
      reason: 'REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED',
      replacement: { price: 75681.2, reduceOnly: false },
      observedTerminalToReplacementAckMs: 4961,
    });
    for (const row of evidence.actualCancels) {
      expect(row.ageSincePlaceMs).toBe(row.cancelAt - row.placeAt);
      expect(row.mutationAttemptCount).toBe(1);
      expect(row.sessionMatchesObservedRuntime).toBe(true);
      expect(row.executorOutcomes.some((outcome) => outcome.outcome === 'CANCEL_CONFIRMED')).toBe(
        true,
      );
      expect(row.observedTerminalToReplacementAckMs).toBeGreaterThanOrEqual(0);
    }
    // Aggregate crossed-depth counts do not reconstruct the missing full frame;
    // this fixture makes no counterfactual before/after mutation claim for it.
  });
});

describe('re-entry after a TP fill', () => {
  const sizing = {
    minimumNotionalUsd: 0.01,
    maximumNotionalUsd: 200,
    availableMarginUsd: 100,
    maximumEffectiveLeverage: 1,
    maximumAbsPositionBase: 2,
    maximumAggregateCollateralFraction: 0.5,
    halfSpreadBps: 5,
    makerFeeBps: 0,
    estimatedGasCostUsd: 0,
    adverseSelectionBufferBps: 0,
    safetyMarginBps: 0,
  };

  it('rests flat entries at or beyond the limits and ignores them with inventory', () => {
    const input = makeSnapshot().input;
    const free = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, sizing);
    expect(free.desiredBid).not.toBeNull();
    expect(free.desiredAsk).not.toBeNull();
    const bidLimit = free.desiredBid!.price - 1;
    const askLimit = free.desiredAsk!.price + 1;
    const limited = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, {
      ...sizing,
      entryPriceLimits: { BUY: bidLimit, SELL: askLimit },
    });
    expect(limited.desiredBid!.price).toBeLessThanOrEqual(bidLimit);
    expect(limited.desiredAsk!.price).toBeGreaterThanOrEqual(askLimit);
    // A looser limit never moves the entry toward the market.
    const loose = evaluateDecibelAuthenticatedPassiveRecyclingV1(input, {
      ...sizing,
      entryPriceLimits: { BUY: free.desiredBid!.price + 5, SELL: free.desiredAsk!.price - 5 },
    });
    expect(loose.desiredBid!.price).toBe(free.desiredBid!.price);
    expect(loose.desiredAsk!.price).toBe(free.desiredAsk!.price);
    // With inventory the limits do not apply.
    const positioned = { ...input, actualInventoryBase: 0.5, inventoryDirectionProven: true };
    expect(
      evaluateDecibelAuthenticatedPassiveRecyclingV1(positioned, {
        ...sizing,
        entryPriceLimits: { BUY: bidLimit, SELL: askLimit },
      }).desiredAsk?.price,
    ).toBe(evaluateDecibelAuthenticatedPassiveRecyclingV1(positioned, sizing).desiredAsk?.price);
  });

  it('anchors the limits on the last exit fill of the current session only', async () => {
    const base = makeSnapshot();
    const exitFill = (venueOrderId: string, clientOrderId: string, price: number) => ({
      venueFillId: `fill-${venueOrderId}`,
      venueOrderId,
      localExecutionRequestId: clientOrderId,
      marketAddress: DECIBEL_BTC_USD_MARKET_ADDRESS_V1,
      side: 'SELL' as const,
      executedPrice: price,
      executedBaseQuantity: 1,
      executedUsdNotional: price,
      makerOrTaker: 'MAKER' as const,
      receivedAt: new Date(1_000),
      venueTimestamp: new Date(1_000),
      fee: { availability: 'AVAILABLE' as const, amount: 0, currency: 'USD' },
      rebate: { availability: 'UNAVAILABLE' as const, amount: null, currency: null },
      executionProvenance: 'AUTHENTICATED_OWN_FILL_STREAM' as const,
    });
    const test = make({ snapshots: [base] });
    const place = (
      sessionId: string,
      clientOrderId: string,
      venueOrderId: string,
      cycleSequence: number,
    ) => {
      const intent = buildDecibelExecutionIntentV1({
        sessionId,
        cycleSequence,
        action: 'PLACE',
        market: 'BTC/USD',
        side: 'SELL',
        price: 100,
        quantity: 1,
        tickSize: base.input.metadata.tickSize,
        lotSize: base.input.metadata.lotSize,
        clientOrderId,
        knownVenueOrderId: null,
        sourceStateHash: `state-${venueOrderId}`,
        strategyDecisionHash: `decision-${venueOrderId}`,
        createdAt: 1,
        reduceOnly: true,
        executionRole: 'INVENTORY_REDUCING_MAKER',
      });
      test.journal.prepare(intent);
      test.journal.transition(intent.intentId, 'ACKNOWLEDGED', 2, venueOrderId);
    };
    place(base.input.sessionId, `d1s${'b'.repeat(29)}`, 'own-exit', 7001);
    place('another-session', `d1s${'c'.repeat(29)}`, 'foreign-exit', 7002);
    const limitsFor = (fills: ReturnType<typeof exitFill>[], inventory = 0) =>
      (
        test.orchestrator as unknown as {
          getReentryPriceLimits(s: typeof base): { BUY: number; SELL: number } | null;
        }
      ).getReentryPriceLimits({
        ...base,
        input: {
          ...base.input,
          actualInventoryBase: inventory,
          actualFillLedger: { ...base.input.actualFillLedger, fills },
        },
      });
    const tick = base.input.metadata.tickSize;
    expect(limitsFor([exitFill('own-exit', `d1s${'b'.repeat(29)}`, 100)])).toEqual({
      BUY: getDecibelReentryPriceLimitV1('BUY', 100, 5, tick),
      SELL: getDecibelReentryPriceLimitV1('SELL', 100, 5, tick),
    });
    expect(limitsFor([exitFill('foreign-exit', `d1s${'c'.repeat(29)}`, 100)])).toBeNull();
    expect(limitsFor([])).toBeNull();
    expect(limitsFor([exitFill('own-exit', `d1s${'b'.repeat(29)}`, 100)], 0.5)).toBeNull();
    await test.orchestrator.close();
  });
});
