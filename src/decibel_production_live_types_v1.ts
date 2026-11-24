/**
 * Shared data types of the production live loop: the authenticated snapshot, the state
 * source contract and the cycle result (moved out of the orchestrator on 2026-11-16 so
 * strategy, risk and telemetry modules do not depend on the orchestrator file).
 */
import type { deriveDecibelExitCoverageWorkflowV1 } from './decibel_exit_coverage_workflow_v1.js';
import type { trading_decision_v1 } from './decibel_trading_decision_v1.js';
import type { assembleDecibelCapacityCertificateV1 } from './decibel_capacity_producers_v1.js';
import type { decibel_capacity_evidence_v1 } from './decibel_risk_capacity_v1.js';
import type { decibel_quote_size_assessment_v1 } from './decibel_dynamic_quote_size_v1.js';
import type {
  DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  decibel_authenticated_passive_recycling_input_v1,
  decibel_authenticated_strategy_order_v1,
} from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import type { execution_intent_v1 } from './decibel_execution_intent_v1.js';
import type { reconciliation_state_v1 } from './decibel_execution_lifecycle_v1.js';
import type { decibel_market_identity_diagnostic_v1 } from './decibel_btc_market_activity_scope_v1.js';
import type { decibel_raw_ws_bbo_observation_v1 } from './decibel_adverse_selection_evidence_v1.js';
import type {
  decibel_tp_price_review_v1,
  decibel_inventory_exit_decision_v1,
} from './decibel_production_order_decisions_v1.js';

import type { buildDecibelOrderDecisionTraceV1 } from './decibel_order_decision_trace_v1.js';

export const DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1 =
  'DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1' as const;

export type decibel_production_live_snapshot_v1 = Readonly<{
  tpAdverseProgress?: import('./decibel_execution_intent_v1.js').tp_adverse_progress_v1 | null;
  /** Midpoint range over the last 5 minutes (bps); null without enough history. */
  priceRangeBps?: number | null;
  /** While flat: why each side may not open now (entry candle filter), or null. */
  entryCandleBlockers?: Readonly<{ BUY: string | null; SELL: string | null }> | null;
  /** While flat: entries against the recent trend (decibel_entry_trend_v1), or null. */
  entryTrendBlockers?: Readonly<{ BUY: string | null; SELL: string | null }> | null;
  /** Set while the gas wallet is below the entry reserve (decibel_gas_reserve_v1). */
  executionGasBlocker?: string | null;
  /** Candle rules' market structure (decibel_market_structure_v1), built once per cycle. */
  marketStructure?: import('./decibel_market_structure_v1.js').decibel_market_structure_v1;
  venueReadWindow?: Readonly<{
    account: import('./decibel_venue_reconciliation_snapshot_v1.js').decibel_venue_read_window_v1;
    history?: import('./decibel_venue_reconciliation_snapshot_v1.js').decibel_venue_read_window_v1;
  }>;
  tradingDecision?: trading_decision_v1;
  input: decibel_authenticated_passive_recycling_input_v1;
  sourceStateHash: string;
  minimumNotionalUsd: number;
  maximumNotionalUsd: number;
  /** Unallocated authenticated margin, separate from the entry allocation. */
  authenticatedAvailableMarginUsd?: number;
  strategyAllocationRemainingUsd?: number;
  /** Verified venue/order ceiling for strict inventory reduction, never entry headroom. */
  maximumReductionNotionalUsd?: number;
  /** The position's full-size catastrophe stop (decibel_catastrophe_stop_v1), or null. */
  catastropheStop?:
    import('./decibel_catastrophe_stop_v1.js').decibel_catastrophe_stop_state_v1 | null;
  reductionCapacity?: Readonly<{
    maximumQuantityBtc: number;
    venueMaximumOrderNotionalUsd: number | null;
    observedAt: number;
  }>;
  availableMarginUsd: number;
  maximumEffectiveLeverage: number;
  capacityEvidence?: decibel_capacity_evidence_v1;
  practicalCapacityInputs?: import('./decibel_risk_capacity_v1.js').decibel_capacity_inputs_v1;
  capacityModelRequired?: boolean;
  capacityProduction?: ReturnType<typeof assembleDecibelCapacityCertificateV1>;
  sessionConfiguration?: Readonly<{
    preferredEntrySizeUsd?: number;
    entryCycleBlocker?: string | null;
    revision: number;
    capitalToUseUsd: number;
    maxLossUsd: number;
    targetMakerVolumeUsd: number;
    maxPositionUsd: number;
    exposureLimits?: Readonly<{
      capacityBlocker?: string | null;
      capacityDiagnostics?: unknown;
      riskCapacityUsd?: number;
      configuredMaximumPositionUsd: number;
      effectivePositionLimitUsd: number;
      currentExposureUsd: number;
      pendingExposureUsd: number;
      availableHeadroomUsd: number;
    }>;
    marginUsedUsd: number;
    makerVolumeUsd: number;
    takerVolumeUsd?: number;
    totalExecutedVolumeUsd?: number;
    targetVolumeUsd?: number;
    pnlUsd: number | null;
    exitAccounting?: Readonly<{
      inventoryBase: number;
      entryBasis: number;
      realizedPnlAfterFeesUsd: number;
    }> | null;
    riskBlocker: string | null;
  }>;
  economicInputs?: Readonly<{
    makerFeeBps: number | null;
    makerFeeSource:
      | 'CONFIG'
      | 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES'
      | 'DECIBEL_AUTHENTICATED_STRATEGY_MAKER_FILL_HISTORY'
      | 'UNKNOWN';
    estimatedGasCostUsd: number | null;
    estimatedGasCostSource:
      'CONFIG' | 'HISTORICAL_SUCCESSFUL_TX_P95' | 'BOOTSTRAP_CONSERVATIVE_PRIOR' | 'UNKNOWN';
    adverseSelectionBufferBps: number | null;
    adverseSelectionSource:
      'CONFIG' | 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95' | 'GLOBAL_FALLBACK' | 'UNKNOWN';
    candidateAdverseSelection?: readonly Readonly<{
      side: 'BUY' | 'SELL';
      distanceBps: number;
      p95AdverseSelectionBps: number;
      sampleCount: number;
      observedAt: number;
    }>[];
    safetyMarginBps: number;
  }>;
  quoteSizing?: Readonly<{
    BUY: decibel_quote_size_assessment_v1 | null;
    SELL: decibel_quote_size_assessment_v1 | null;
  }>;
  warnings?: readonly string[];
  halfSpreadBps?: number;
  maximumAbsPositionBase?: number;
  accountMetrics?: Readonly<{
    collateralUsd: number;
    totalMarginUsd: number;
    unrealizedPnlUsd: number | null;
    masterAptGas: number | null;
  }>;
  authenticatedPositions?: readonly Readonly<{
    market: string;
    size: number;
    source: 'BOT' | 'EXTERNAL' | 'UNKNOWN';
    entryPrice?: number | null;
  }>[];
  terminalOrderEvidence?: readonly Readonly<{
    venueOrderId: string;
    clientOrderId?: string | null;
    state: 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';
    originalQuantity: number | null;
    remainingQuantity: number | null;
  }>[];
  authenticatedFlatNeutralization?: Readonly<{
    checkpointBodyHashSha256: string;
    resyncTimestamp: number;
    outOfBandFillIds: readonly string[];
  }>;
  marketScopeDiagnostics?: Readonly<{
    rawPositionMarketIdentities: readonly decibel_market_identity_diagnostic_v1[];
    rawOpenOrderMarketIdentities: readonly decibel_market_identity_diagnostic_v1[];
    rawFillMarketIdentities: readonly decibel_market_identity_diagnostic_v1[];
    rawTwapMarketIdentities: readonly decibel_market_identity_diagnostic_v1[];
    rawTpSlMarketIdentities: readonly decibel_market_identity_diagnostic_v1[];
    historicalOutOfBandBTCFillCount: number;
    activeTwapCount: number;
    activeTpSlCount: number;
    activeBulkOrderCount: number;
  }>;
}>;

export interface DecibelProductionLiveStateSourceV1 {
  /** Read-only preview inputs. Never consumed by ACTIVE execution or sizing. */
  readNextSessionCapacityInputs?():
    import('./decibel_risk_capacity_v1.js').decibel_capacity_inputs_v1 | null;
  assertAuthenticatedTransport?(): Promise<Readonly<{ transportId: string; baseUrl: string }>>;
  readAuthenticatedTransportDiagnostics?(): Promise<Readonly<Record<string, unknown>>>;
  readAuthenticatedEvidenceDiagnostics?(): Readonly<Record<string, unknown>>;
  readCapacityProduction?(
    input: Readonly<{
      sessionId: string;
      probeNotionalUsd: number;
      manifest: readonly { hash: string | null }[] | null;
    }>,
  ): Promise<ReturnType<typeof assembleDecibelCapacityCertificateV1>>;
  readAuthenticatedSnapshot(signal?: AbortSignal): Promise<decibel_production_live_snapshot_v1>;
  readAuthenticatedAccountState?(signal?: AbortSignal): Promise<
    Readonly<{
      readWindow?: import('./decibel_venue_reconciliation_snapshot_v1.js').decibel_venue_read_window_v1;
      observedAt: number;
      availableMarginUsd?: number;
      marketMetadata?: decibel_production_live_snapshot_v1['input']['metadata'];
      accountMetrics: NonNullable<decibel_production_live_snapshot_v1['accountMetrics']>;
      authenticatedPositions: NonNullable<
        decibel_production_live_snapshot_v1['authenticatedPositions']
      >;
      actualInventoryBase: number;
      openOrders: decibel_production_live_snapshot_v1['input']['openOrders'];
      catastropheStop?: decibel_production_live_snapshot_v1['catastropheStop'];
      activeTpSlCount?: number;
    }>
  >;
  /** Closed venue 1-minute candles (decibel_exchange_candles_v1); optional. */
  readExchangeCandles1m?(
    startMs: number,
    endMs: number,
  ): Promise<readonly import('./decibel_exchange_candles_v1.js').decibel_exchange_candle_v1[]>;
  /** Closed venue 5-minute candles for the entry trend filter; optional. */
  readExchangeCandles5m?(
    startMs: number,
    endMs: number,
  ): Promise<readonly import('./decibel_exchange_candles_v1.js').decibel_exchange_candle_v1[]>;
  readAuthenticatedFillLedger?(
    startedAt?: number,
    signal?: AbortSignal,
    endedAt?: number,
  ): Promise<
    Readonly<{
      readWindow?: import('./decibel_venue_reconciliation_snapshot_v1.js').decibel_venue_read_window_v1;
      observedAt: number;
      ledger: decibel_production_live_snapshot_v1['input']['actualFillLedger'];
      terminalOrderEvidence?: decibel_production_live_snapshot_v1['terminalOrderEvidence'];
    }>
  >;
  validateSubmission?(
    intent: execution_intent_v1,
  ):
    | Promise<
        void | import('./decibel_execution_lifecycle_v1.js').execution_submission_validation_v1
      >
    | void
    | import('./decibel_execution_lifecycle_v1.js').execution_submission_validation_v1;
  readAuthenticatedSnapshotAfterMutation?(): Promise<decibel_production_live_snapshot_v1>;
  readAuthenticatedPosition?(): Promise<
    Readonly<{ positionBase: number; observedAt: number; source: 'AUTHENTICATED_POSITION_READ' }>
  >;
  readOrderIdentityEvidence?(
    input: Readonly<{
      venueOrderId: string;
      clientOrderId: string;
      createdAt: number;
      transactionHash: string | null;
    }>,
  ): Promise<
    Readonly<{
      observedAt: number;
      openOrders: readonly unknown[];
      terminalOrders: readonly Readonly<{
        venueOrderId: string;
        clientOrderId: string;
        state: 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'REJECTED';
        side?: 'BUY' | 'SELL';
        originalQuantity: number | null;
        remainingQuantity: number | null;
      }>[];
      fills: readonly Readonly<{
        venueFillId: string;
        quantity: number;
        price: number;
        transactionTimestamp: number;
        transactionVersion?: string;
      }>[];
      transactionState: 'COMMITTED' | 'NOT_FOUND' | null;
    }>
  >;
  readPublicMarketPrice?(): Promise<number>;
  readPublicMarketState?(): Promise<
    Readonly<{
      observedAt: number;
      venueTimestamp?: number;
      depth?: NonNullable<decibel_authenticated_passive_recycling_input_v1['book']['depth']>;
      bestBid: number;
      bestAsk: number;
      wsConnectionState?: 'CONNECTED';
      wsSubscriptionState?: 'SUBSCRIBED';
      lastWsMessageAgeMs?: number;
      lastValidBboAgeMs?: number;
      wsReconnectCount?: number;
      wsLastDisconnectReason?: string | null;
    }>
  >;
  readMarketDataDiagnostics?(): Readonly<{
    wsConnectionState: 'INIT' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'STALLED';
    wsSubscriptionState: 'UNSUBSCRIBED' | 'SUBSCRIBING' | 'SUBSCRIBED';
    lastWsMessageAgeMs: number | null;
    lastValidBboAgeMs: number | null;
    wsReconnectCount: number;
    wsLastDisconnectReason: string | null;
  }>;
  reconcileIntent(
    intentId: string,
    snapshot: decibel_production_live_snapshot_v1,
    venueOrderId?: string | null,
    identity?: Readonly<{
      clientOrderId: string;
      createdAt: number;
      transactionHash: string | null;
      requestedQuantity?: number;
      side?: 'BUY' | 'SELL';
    }>,
  ): Promise<reconciliation_state_v1>;
  revalidateCancelTarget?(
    intent: execution_intent_v1,
  ): Promise<reconciliation_state_v1 | 'UNRESOLVED'>;
  verifyTimedOutIntent?(
    intent: execution_intent_v1,
    venueOrderId: string | null,
    telemetry: Readonly<{ transactionHash: string; expirationTimestampMs: number }> | null,
  ): Promise<
    | Readonly<{ state: 'ORDER_OPEN'; openOrder: decibel_authenticated_strategy_order_v1 }>
    | Readonly<{ state: 'INTENT_FAILED_TIMEOUT' }>
    | Readonly<{ state: 'DROPPED_EXPIRED' }>
    | Readonly<{ state: 'UNRESOLVED' }>
  >;
  close?(): Promise<void> | void;
}

export type decibel_production_live_cycle_result_v1 = Readonly<{
  orderDecisionTrace?: ReturnType<typeof buildDecibelOrderDecisionTraceV1>;
  version: typeof DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1;
  tradingDecision: trading_decision_v1;
  action:
    | 'RECONCILE_ONLY'
    | 'HOLD'
    | 'BLOCKED'
    | 'DRY_RUN_PREPARED'
    | 'DUPLICATE_SUPPRESSED'
    | 'RECONCILIATION_REQUIRED'
    | 'ACKNOWLEDGED'
    | 'REJECTED';
  intentId: string | null;
  blocker: string | null;
  evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1 | null;
  controlSnapshot: Readonly<{
    observedAt: number;
    sourceStateHash: string | null;
    strategyState: DecibelAuthenticatedPassiveRecyclingEvaluationV1['operatingState'];
    bidAdmission: 'READY' | 'BLOCKED' | 'UNKNOWN';
    askAdmission: 'READY' | 'BLOCKED' | 'UNKNOWN';
    exactReason: string;
    restingAgeMs: number | null;
    priceDriftTicks: number | null;
    cancelReason: string | null;
    gates: readonly Readonly<{
      gate: string;
      status: 'READY' | 'BLOCKED' | 'UNKNOWN';
      numericInputs: Readonly<Record<string, number | null>>;
      reason: string;
      persistence: 'TRANSIENT' | 'PERSISTENT';
      clearCondition: string;
    }>[];
  }>;
  mutationInvocations: number;
  latency?: Readonly<{
    cycleMs: number;
    authenticatedReadMs: number;
    marketToDecisionMs: number | null;
    fillToOppositeDecisionMs: number | null;
    fillToExitCoverageMs: number | null;
    decisionToExecutorSubmissionMs: number | null;
    executorSubmissionToAckMs: number | null;
    cancelToReplacementReadyMs: number | null;
  }>;
  tpPricing?: decibel_tp_price_review_v1 | null;
  inventoryExit?: decibel_inventory_exit_decision_v1 | null;
  exitCoverageWorkflow?: ReturnType<typeof deriveDecibelExitCoverageWorkflowV1> | null;
  orderDecisions?: readonly Readonly<{
    ORDER_ID: string;
    ORDER_ROLE: string;
    ORDER_AGE_MS: number | null;
    RESTING_PRICE: number;
    CANDIDATE_PRICE: number | null;
    DELTA_TICKS: number | null;
    EVIDENCE_VERSION: string;
    PLAN_DECISION: string;
    RISK_VALIDATION_DECISION: string;
    FINAL_KEEP_CANCEL_REPLACE_REASON: string;
    REPLACEMENT_NET_BENEFIT: number | null;
    ACK_RECONCILIATION_STATE: string;
  }>[];
  marketScopeDiagnostics?: decibel_production_live_snapshot_v1['marketScopeDiagnostics'];
}>;

export type decibel_market_regime_bootstrap_v1 = Readonly<{
  observations: readonly decibel_raw_ws_bbo_observation_v1[];
  enforceReadiness: boolean;
  observedAt: number;
}>;
