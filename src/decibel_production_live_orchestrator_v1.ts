import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
import { calculateDecibelEntrySizeV1 } from './decibel_entry_size_v1.js';
import { assessDecibelSnapshotDCAV1 } from './decibel_dca_v1.js';
import { buildDecibelMarketStructureV1 } from './decibel_market_structure_v1.js';
import {
  DECIBEL_EXCHANGE_CANDLE_LOOKBACK_MS_V1,
  DECIBEL_EXCHANGE_CANDLE_REFRESH_MS_V1,
  type decibel_exchange_candle_v1,
} from './decibel_exchange_candles_v1.js';
import {
  DECIBEL_GAS_BALANCE_REFRESH_MS_V1,
  getDecibelGasEntryBlockerV1,
} from './decibel_gas_reserve_v1.js';
import {
  DECIBEL_CATASTROPHE_STOP_RETRY_INTERVAL_MS_V1,
  planDecibelCatastropheStopV1,
  validateDecibelCatastropheStopV1,
} from './decibel_catastrophe_stop_v1.js';
import { deriveDecibelExitCoverageWorkflowV1 } from './decibel_exit_coverage_workflow_v1.js';
import {
  calculateDecibelMidpointRangeBpsV1,
  getDecibelEntryCandleBlockerV1,
  getDecibelEntryVolatilityPauseReasonV1,
  getDecibelReentryDistanceBpsV1,
  getDecibelReentryPriceLimitV1,
} from './decibel_volatility_targets_v1.js';
import {
  assessDecibelProtectiveRecoveryV1,
  assertDecibelRecoveryIntentV1,
  getDecibelVerifiedCurrentPlaceOwnerV1,
  reconcileDecibelCurrentProtectiveEvidenceV1,
} from './decibel_protective_recovery_admission_v1.js';
import {
  assessDecibelExitEconomicsV1,
  constructDecibelAdaptiveTPPriceV1,
  assessDecibelAdaptiveTPV1,
  getDecibelTPPositionKeyV1,
} from './decibel_exit_economics_v1.js';
import {
  classifyDecibelOrderActionV1,
  getDecibelReductionOrderLimitV1,
  assessDecibelTPActionV1,
  getDecibelRestingCoveragePriceV1,
} from './decibel_order_action_v1.js';
import { assertDecibelVenueReconciliationFreshV1 } from './decibel_venue_reconciliation_snapshot_v1.js';
import { getDecibelQuantityUnitsV1 } from './decibel_chain_units_v1.js';
import {
  evaluateTradingDecision,
  type trading_decision_v1,
} from './decibel_trading_decision_v1.js';
import type { assembleDecibelCapacityCertificateV1 } from './decibel_capacity_producers_v1.js';
import type { decibel_capacity_evidence_v1 } from './decibel_risk_capacity_v1.js';
import {
  calculateDecibelDynamicQuoteSizeV1,
  allocateDecibelTwoSidedQuoteBudgetV1,
  calculateDecibelSidePositionBudgetBtcV1,
  type decibel_quote_size_assessment_v1,
} from './decibel_dynamic_quote_size_v1.js';
import {
  getDecibelSessionTargetTerminalReasonV1,
  synchronizeDecibelSessionAccountingV1,
} from './decibel_session_accounting_v1.js';
import {
  assessDecibelEntryReplacementEconomicsV1,
  assessDecibelEntryPhaseEconomicsV1,
} from './decibel_smart_ladder_v1.js';

import {
  calculateDecibelExitCoverageV1,
  evaluateDecibelAuthenticatedPassiveRecyclingV1,
  type DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  type decibel_authenticated_passive_recycling_input_v1,
  type decibel_authenticated_strategy_order_v1,
  type decibel_recycling_action_v1,
} from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import {
  execution_preflight_rejection_v1,
  validateDecibelPlaceIntentV1,
  type execution_intent_v1,
  type place_intent_v1,
} from './decibel_execution_intent_v1.js';
import {
  assertDecibelHTTPReadAllowedV1,
  enterDecibelHTTPReadBackoffForErrorV1,
} from './decibel_http_read_backoff_v1.js';
import {
  decibel_execution_lifecycle_v1,
  type execution_mutation_budget_v1,
  type reconciliation_state_v1,
} from './decibel_execution_lifecycle_v1.js';
import type { decibel_execution_lifecycle_journal_v1 } from './decibel_execution_lifecycle_journal_v1.js';
import {
  reconcileDecibelActiveIdentityConflictV1,
  requireDecibelFillTransactionVersionV1,
  reconcileDecibelAcknowledgedTerminalOrdersV1,
  reconcileAllDecibelAcknowledgedOrdersV1,
} from './decibel_production_web_telemetry_v1.js';
import {
  decibel_production_executor_gate_v1,
  type DecibelProductionExecutionExecutorV1,
} from './decibel_production_executor_handoff_v1.js';
import type { decibel_market_identity_diagnostic_v1 } from './decibel_btc_market_activity_scope_v1.js';
import {
  classifyDecibelOperationalMarketRegimeV1,
  type decibel_market_regime_observation_v1,
  type decibel_market_regime_result_v1,
} from './decibel_market_regime_v1.js';
import type { decibel_raw_ws_bbo_observation_v1 } from './decibel_adverse_selection_evidence_v1.js';
import { DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1 } from './decibel_smart_ladder_v1.js';
import { resolveDecibelAuthoritativeOrderEvidenceV1 } from './decibel_authoritative_order_reconciliation_v1.js';

import type { decibel_production_live_configuration_v1 } from './decibel_production_live_configuration_v1.js';
import {
  getErrorChain,
  isDecibelHttpRateLimitErrorV1,
  isUnrecoverableDecibelAuthenticationErrorV1,
  getPermanentAuthenticatedReadIntegrityBlockerV1,
} from './decibel_authenticated_read_errors_v1.js';
import {
  hashDecibelProductionValueV1 as hash,
  isAligned,
  hasVerifiedAccountMarginBreach,
  adaptCandidateDistances,
  buildDecibelCanonicalOrderKeyV1,
  decibel_tp_price_review_v1,
  decibel_inventory_exit_decision_v1,
  coordinateDecibelInventoryExitV1,
  evaluateDecibelTPPriceSuitabilityV1,
  evaluateDecibelReplacementDecisionV1,
  isDecibelTPCoverageSeverelyUndersizedV1,
  classifyDecibelCancelV1,
  decibel_mutation_selection_v1,
  findDecibelInventoryCrossingOpenOrderV1,
  selectMutation,
  selectDecibelInventoryCrossingSafetyCancelV1,
  buildIntent,
  buildAdoptedOpenOrderIntent,
  remainingTargetBudgetUsd,
  entryReplacementBandFor,
  entryReplacementStabilityFor,
} from './decibel_production_order_decisions_v1.js';
// Public API kept on the orchestrator module after the split.
export { assessDecibelExitEconomicsV1 } from './decibel_exit_economics_v1.js';
export {
  parseDecibelProductionLiveConfigurationV1,
  type decibel_production_live_configuration_v1,
} from './decibel_production_live_configuration_v1.js';
export {
  isDecibelHttpRateLimitErrorV1,
  isTransientDecibelAuthenticatedReadErrorV1,
  isUnrecoverableDecibelAuthenticationErrorV1,
} from './decibel_authenticated_read_errors_v1.js';
export {
  DECIBEL_TP_COVERAGE_REPLACE_FRACTION_V1,
  buildDecibelCanonicalOrderKeyV1,
  classifyDecibelCancelV1,
  coordinateDecibelInventoryExitV1,
  evaluateDecibelReplacementDecisionV1,
  evaluateDecibelTPPriceSuitabilityV1,
  findDecibelInventoryCrossingOpenOrderV1,
  isDecibelTPCoverageSeverelyUndersizedV1,
  selectDecibelInventoryCrossingSafetyCancelV1,
  type decibel_cancel_class_v1,
  type decibel_inventory_exit_decision_v1,
  type decibel_tp_price_review_v1,
} from './decibel_production_order_decisions_v1.js';

export const DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1 =
  'DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1' as const;
export const DECIBEL_PRODUCTION_REPRICE_POLICY_V1 = 'BEHIND_5_TICKS' as const;

export type decibel_production_live_snapshot_v1 = Readonly<{
  tpAdverseProgress?: import('./decibel_execution_intent_v1.js').tp_adverse_progress_v1 | null;
  /** Midpoint range over the last 5 minutes (bps); null without enough history. */
  priceRangeBps?: number | null;
  /** While flat: why each side may not open now (entry candle filter), or null. */
  entryCandleBlockers?: Readonly<{ BUY: string | null; SELL: string | null }> | null;
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
    estimatedGasCostSource: 'CONFIG' | 'HISTORICAL_SUCCESSFUL_TX_P95' | 'UNKNOWN';
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
  readAuthenticatedFillLedger?(
    startedAt?: number,
    signal?: AbortSignal,
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

export function assertDecibelProductionControlLivenessV1(
  result: decibel_production_live_cycle_result_v1,
): void {
  const control = result.controlSnapshot;
  const snapshotReady = control.gates[0]?.status === 'READY';
  const actionEligible = control.bidAdmission === 'READY' || control.askAdmission === 'READY';
  const exactBlockerExposed =
    control.exactReason.length > 0 &&
    control.exactReason !== 'HOLD' &&
    control.exactReason !== 'UNKNOWN' &&
    !control.exactReason.includes('BID_UNKNOWN') &&
    !control.exactReason.includes('ASK_UNKNOWN');
  if (snapshotReady && !actionEligible && !exactBlockerExposed)
    throw new Error('PRODUCTION_CONTROL_LOOP_LIVENESS_INVARIANT_FAILED');
}

export class decibel_production_live_orchestrator_v1 {
  private HistoricalRecoveryBlocker: string | null = null;
  private UnrelatedRecoveryIntentIds: readonly string[] = [];
  private ProtectivePlannedPosition: number | null = null;

  public setHistoricalRecoveryBlocker(blocker: string | null): void {
    this.HistoricalRecoveryBlocker = blocker;
    this.UnrelatedRecoveryIntentIds = [];
  }

  public getHistoricalRecoveryBlocker(): string | null {
    return this.HistoricalRecoveryBlocker;
  }

  /** Decision id of a precomputed cancel → place replacement still waiting for its place. */
  public getPendingReplacementDecisionId(): string | null {
    return this.FrozenReprice?.decisionId ?? null;
  }

  private async validateIndependentProtection(
    intent: execution_intent_v1,
    limits: void | import('./decibel_execution_lifecycle_v1.js').execution_submission_validation_v1,
  ) {
    if (this.HistoricalRecoveryBlocker === null) return limits;
    const snapshot = await this.readSnapshot();
    const proof = assessDecibelProtectiveRecoveryV1(
      this.Journal,
      snapshot,
      this.Config.dryRun ? snapshot.input.now : this.getDecisionNow(),
    );
    if (!proof.allowed) throw new execution_preflight_rejection_v1(proof.blocker);
    assertDecibelRecoveryIntentV1(this.Journal, intent, snapshot);
    if (
      intent.action === 'PLACE' &&
      (snapshot.input.actualInventoryBase !== this.ProtectivePlannedPosition ||
        (limits && limits.preflight.currentPositionBase !== snapshot.input.actualInventoryBase))
    )
      throw new execution_preflight_rejection_v1('PROTECTIVE_POSITION_CHANGED_BEFORE_SUBMISSION');
    const assertOwner = limits?.assertSubmissionStillAuthorized;
    if (!assertOwner)
      throw new execution_preflight_rejection_v1('PROTECTIVE_EXECUTION_OWNER_PROOF_REQUIRED');
    return {
      assertSubmissionStillAuthorized: () => {
        assertOwner();
        const now = this.Config.dryRun ? snapshot.input.now : this.getDecisionNow();
        const accountAt = snapshot.venueReadWindow!.account.startedAt;
        if (
          now < accountAt ||
          now - accountAt > snapshot.input.maxBboAgeMs ||
          now - snapshot.input.book.observedAt > snapshot.input.maxBboAgeMs
        )
          throw new execution_preflight_rejection_v1('PROTECTIVE_EVIDENCE_EXPIRED_AT_DISPATCH');
      },
      preflight: limits?.preflight ?? {
        tickSize: snapshot.input.metadata.tickSize,
        lotSize: snapshot.input.metadata.lotSize,
        minimumSize: snapshot.input.metadata.minimumSize,
        minimumNotionalUsd: snapshot.minimumNotionalUsd,
        maximumNotionalUsd: snapshot.maximumReductionNotionalUsd ?? snapshot.maximumNotionalUsd,
        maximumReductionQuantity: Math.abs(snapshot.input.actualInventoryBase),
        currentPositionBase: snapshot.input.actualInventoryBase,
        openOrders: snapshot.input.openOrders,
        permittedSide: intent.side,
        bestBid: snapshot.input.book.bestBid,
        bestAsk: snapshot.input.book.bestAsk,
      },
      observedAt: snapshot.venueReadWindow?.account.startedAt ?? snapshot.input.now,
      independentProtectiveRecoveryIntentIds: proof.unrelatedIntentIds,
      ...(intent.action === 'CANCEL'
        ? {
            verifiedEntryCancelOwnerIntentIds: snapshot.input.openOrders.map(
              (order) =>
                getDecibelVerifiedCurrentPlaceOwnerV1(this.Journal, snapshot, order)!.row.intentId,
            ),
          }
        : {}),
    };
  }
  private readonly Lifecycle: decibel_execution_lifecycle_v1;
  private readonly ExecutorGate: decibel_production_executor_gate_v1;
  private cycleSequence = 0;
  private paused = false;
  private economicWarming: string | null = null;
  private cancelAllRequested = false;
  private sessionUnwindRequested = false;
  /** Target reached: cancel resting entries, keep TP, finish when flat. No taker unwind. */
  private sessionDrainRequested = false;
  private sessionUnwindCompleted = false;
  private riskReductionRequested = false;
  private IntendedAction: decibel_recycling_action_v1 | null = null;
  private DecisionGate = 'evaluateOnceInternal';
  private LastRiskDiagnosticSignature: string | null = null;
  private FinalValidation:
    import('./decibel_execution_lifecycle_v1.js').execution_submission_validation_v1 | null = null;
  private LatestSnapshot: decibel_production_live_snapshot_v1 | null = null;
  private CatastropheStopAttemptAt = Number.NEGATIVE_INFINITY;
  private ExchangeCandles: readonly decibel_exchange_candle_v1[] = [];
  private ExchangeCandlesCheckedAt = Number.NEGATIVE_INFINITY;
  private GasBalanceApt: number | null = null;

  /** Re-read venue candles at most once per refresh interval; failures keep the last set. */
  private async refreshExchangeCandles(): Promise<void> {
    const read = this.Source.readExchangeCandles1m?.bind(this.Source);
    if (read === undefined) return;
    const now = this.getDecisionNow();
    if (now - this.ExchangeCandlesCheckedAt < DECIBEL_EXCHANGE_CANDLE_REFRESH_MS_V1) return;
    this.ExchangeCandlesCheckedAt = now;
    try {
      const candles = await read(now - DECIBEL_EXCHANGE_CANDLE_LOOKBACK_MS_V1, now);
      if (candles.length > 0) this.ExchangeCandles = candles;
    } catch {
      // Keep the last set; freshness decides whether the BBO fallback takes over.
    }
  }

  private GasBalanceCheckedAt = Number.NEGATIVE_INFINITY;

  /** Re-read the gas wallet at most once per refresh interval; failures keep the last value. */
  private async refreshGasBalance(): Promise<void> {
    const read = this.ExternalExecutor.readAccountDiagnostics?.bind(this.ExternalExecutor);
    if (read === undefined || this.Config.dryRun) return;
    const now = Date.now();
    if (now - this.GasBalanceCheckedAt < DECIBEL_GAS_BALANCE_REFRESH_MS_V1) return;
    this.GasBalanceCheckedAt = now;
    let Timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const diagnostics = await Promise.race([
        read(),
        new Promise<null>((resolve) => {
          Timeout = setTimeout(() => resolve(null), 5_000);
        }),
      ]);
      if (diagnostics !== null && Number.isFinite(diagnostics.primaryAccountAptBalance))
        this.GasBalanceApt = diagnostics.primaryAccountAptBalance;
    } catch {
      // Keep the last known balance; a read failure must not block or unblock entries.
    } finally {
      if (Timeout !== undefined) clearTimeout(Timeout);
    }
  }
  /** Latest catastrophe stop plan reason, for telemetry. */
  public CatastropheStopStatus: string | null = null;
  private readonly MidpointHistory: decibel_market_regime_observation_v1[] = [];
  private readonly OpenOrderFirstObservedAt = new Map<string, number>();
  private readonly LastPolicyCancelledOrderKeyBySide = new Map<'BUY' | 'SELL', string>();
  private mutationBudgetCooldownUntil = 0;
  private DecisionSnapshot: decibel_production_live_snapshot_v1 | null = null;
  private TPSuitabilityWindows = new Map<string, { key: string; since: number; last: number }>();
  private LastTPRepriceAt = new Map<'BUY' | 'SELL', number>();
  private LatestTPReview: decibel_tp_price_review_v1 | null = null;
  private InventoryRiskEpoch: { key: string; since: number } | null = null;
  private CoverageGapObservedSince: number | undefined;

  public evaluateAuthenticatedSnapshot(
    snapshot: decibel_production_live_snapshot_v1,
    operationalRegime = this.LatestOperationalRegime ?? this.getOperationalMarketRegime(snapshot),
  ): DecibelAuthenticatedPassiveRecyclingEvaluationV1 {
    this.LatestOperationalRegime = operationalRegime;
    const volatilitySpreadMultiplier = Math.min(
      this.Config.maximumVolatilitySpreadMultiplier,
      operationalRegime.policy.volatilitySpreadMultiplier,
    );
    const regimeEdge = this.getRegimeAdmissionInputs();
    return this.evaluateWithFlatPairCohort(snapshot, {
      minimumNotionalUsd: snapshot.minimumNotionalUsd,
      maximumNotionalUsd: snapshot.maximumNotionalUsd,
      availableMarginUsd: snapshot.availableMarginUsd,
      maximumEffectiveLeverage: snapshot.maximumEffectiveLeverage,
      ...(snapshot.halfSpreadBps === undefined ? {} : { halfSpreadBps: snapshot.halfSpreadBps }),
      ...(snapshot.maximumAbsPositionBase === undefined
        ? {}
        : { maximumAbsPositionBase: snapshot.maximumAbsPositionBase }),
      bidCandidateDistanceBps: adaptCandidateDistances(
        operationalRegime.policy.bidDistanceMultiplier,
      ),
      askCandidateDistanceBps: adaptCandidateDistances(
        operationalRegime.policy.askDistanceMultiplier,
      ),
      maximumAggregateCollateralFraction:
        this.Config.maximumAggregateCollateralFraction * operationalRegime.policy.sizeMultiplier,
      maximumInventoryPriceSkewBps: operationalRegime.policy.maximumInventoryPriceSkewBps,
      volatilitySpreadMultiplier,
      entryPriceMovementBps: operationalRegime.inputs.realizedVolatilityBps,
      maximumVolatilitySpreadMultiplier: this.Config.maximumVolatilitySpreadMultiplier,
      makerFeeBps: snapshot.economicInputs?.makerFeeBps ?? null,
      estimatedGasCostUsd: snapshot.economicInputs?.estimatedGasCostUsd ?? null,
      adverseSelectionBufferBps: snapshot.economicInputs?.adverseSelectionBufferBps ?? null,
      ...(snapshot.economicInputs?.candidateAdverseSelection === undefined
        ? {}
        : { candidateAdverseSelection: snapshot.economicInputs.candidateAdverseSelection }),
      ...(regimeEdge.bid.distanceBps === null
        ? {}
        : { bidHalfSpreadBps: regimeEdge.bid.distanceBps }),
      ...(regimeEdge.ask.distanceBps === null
        ? {}
        : { askHalfSpreadBps: regimeEdge.ask.distanceBps }),
      bidAdverseSelectionBufferBps: regimeEdge.bid.adverseSelectionBps,
      askAdverseSelectionBufferBps: regimeEdge.ask.adverseSelectionBps,
      bidEvidenceSufficient: regimeEdge.bid.eligible,
      askEvidenceSufficient: regimeEdge.ask.eligible,
      marketRegime: regimeEdge.regime,
      bidEvidenceSampleCount: regimeEdge.bid.sampleCount,
      askEvidenceSampleCount: regimeEdge.ask.sampleCount,
      safetyMarginBps: snapshot.economicInputs?.safetyMarginBps ?? 1,
      riskReductionRequired:
        this.riskReductionRequested || hasVerifiedAccountMarginBreach(snapshot),
      sessionUnwindRequested: this.sessionUnwindRequested,
      sessionDrainOnTarget: true,
      ...entryReplacementBandFor(snapshot),
      ...((limits) => (limits === null ? {} : { entryPriceLimits: limits }))(
        this.getReentryPriceLimits(snapshot),
      ),
      sessionDrainRequested: this.sessionDrainRequested,
    });
  }

  private coordinateInventoryExit(
    snapshot: decibel_production_live_snapshot_v1,
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  ): DecibelAuthenticatedPassiveRecyclingEvaluationV1 {
    const reserved = this.withExitReservations(snapshot);
    const coverage = calculateDecibelExitCoverageV1(reserved.input);
    const key = JSON.stringify([
      Math.sign(snapshot.input.actualInventoryBase),
      snapshot.authenticatedPositions?.map((p) => [p.market, p.entryPrice]),
    ]);
    if (snapshot.input.actualInventoryBase === 0) this.InventoryRiskEpoch = null;
    else if (this.InventoryRiskEpoch?.key !== key)
      this.InventoryRiskEpoch = { key, since: snapshot.input.now };
    if (coverage.UNCOVERED_INVENTORY_QTY > 0) this.CoverageGapObservedSince ??= snapshot.input.now;
    else this.CoverageGapObservedSince = undefined;
    // result() builds inventory diagnostics from the current snapshot and epoch.
    // Inventory assessment is observational. Entry eligibility and sizing
    // remain owned by the pre-existing strategy and canonical risk checks.
    return evaluation;
  }

  private observeTPPrice(
    action: decibel_recycling_action_v1,
    snapshot: decibel_production_live_snapshot_v1,
    minimumAgeMs: number,
    minimumTicks: number,
  ): number | null {
    snapshot = this.withExitReservations(snapshot);
    snapshot = {
      ...snapshot,
      input: {
        ...snapshot.input,
        unresolvedExecutionPlanCount:
          snapshot.input.unresolvedExecutionPlanCount +
          this.Journal.nonTerminal().filter((row) => row.status !== 'ACKNOWLEDGED').length,
      },
    };
    const order = action.current;
    if (!order) return null;
    if (order.reduceOnly !== true) return null;
    const now = snapshot.input.book.observedAt;
    const lastAt = this.LastTPRepriceAt.get(order.side);
    const lastAge = lastAt === undefined ? null : Math.max(0, snapshot.input.now - lastAt);
    const priceAction = action.priceCandidate
      ? { ...action, desired: action.priceCandidate }
      : action;
    const probe = evaluateDecibelTPPriceSuitabilityV1(
      priceAction,
      snapshot,
      Number.POSITIVE_INFINITY,
      minimumAgeMs,
      minimumTicks,
      Number.POSITIVE_INFINITY,
      lastAge,
    );
    let age: number | null = null;
    if (probe?.TP_REPRICE_DECISION === 'REPRICE') {
      const key = JSON.stringify([
        order.clientOrderId,
        order.quantity,
        order.price,
        order.market,
        order.side,
      ]);
      const previous = this.TPSuitabilityWindows.get(order.venueOrderId);
      const since =
        previous &&
        previous.key === key &&
        now >= previous.last &&
        now - previous.last <= snapshot.input.maxBboAgeMs
          ? previous.since
          : now;
      this.TPSuitabilityWindows.set(order.venueOrderId, { key, since, last: now });
      age = now - since;
    } else this.TPSuitabilityWindows.delete(order.venueOrderId);
    this.LatestTPReview = evaluateDecibelTPPriceSuitabilityV1(
      priceAction,
      snapshot,
      this.getOrderRestingAgeMs(order.venueOrderId, snapshot.input.now),
      minimumAgeMs,
      minimumTicks,
      age,
      lastAge,
    );
    return age;
  }
  private SelectedAction: decibel_recycling_action_v1 | null = null;
  private SelectionReason: string | null = null;
  private RepriceDecisionId: string | null = null;
  private RepriceCommitSnapshotId: string | null = null;
  private RepriceOldPrice: number | null = null;
  private FrozenReplacementPrice: number | null = null;
  private RepriceImprovementTicks: number | null = null;
  private RepriceAbortReason: string | null = null;
  private CancelToReplacementAckMs: number | null = null;
  private FrozenReprice: {
    decisionId: string;
    commitSnapshotId: string;
    committedAt: number;
    cancelledAt: number | null;
    positionBase: number;
    action: decibel_recycling_action_v1;
  } | null = null;
  private LatestOperationalRegime: decibel_market_regime_result_v1 | null = null;
  private MarketRegimeState: 'WARMING' | 'READY' = 'WARMING';
  private readonly EnforceMarketRegimeReadiness: boolean;
  private FlatPairCohort: {
    id: string;
    sharedBaseQuantity: number;
    budgetUsd: number;
    issuedSides: Set<'BUY' | 'SELL'>;
  } | null = null;

  private CycleStartedAt = 0;
  private DecisionSelectedAt: number | null = null;
  private CancelToReplacementReadyMs: number | null = null;
  private AuthenticatedReadMs = 0;
  private SeenFillIds: Set<string> | null = null;
  private PendingCoverageFills = new Map<string, number>();
  private PendingOppositeDecisions = new Map<
    string,
    { side: 'BUY' | 'SELL'; receivedAt: number }
  >();
  private MandatoryEvidenceFailureSince: number | null = null;
  private LatestTradingDecision: trading_decision_v1 | null = null;
  private TerminalDecisionReason: string | null = null;
  private withTPProgress(
    snapshot: decibel_production_live_snapshot_v1,
  ): decibel_production_live_snapshot_v1 {
    const key = getDecibelTPPositionKeyV1(snapshot);
    return { ...snapshot, tpAdverseProgress: key ? this.Journal.getTPAdverseProgress(key) : null };
  }
  private getCoveragePrice(snapshot: decibel_production_live_snapshot_v1, side: 'BUY' | 'SELL') {
    const resting = getDecibelRestingCoveragePriceV1(snapshot, side);
    if (resting) return resting;
    // A still-live TP cannot be replaced using a previous cancellation witness.
    if (snapshot.input.openOrders.some((order) => order.side === side)) return null;
    return this.Journal.getCommittedCoveragePrice(
      snapshot.input.sessionId,
      side,
      snapshot.terminalOrderEvidence ?? [],
    );
  }
  private evaluateDecision(
    snapshot: decibel_production_live_snapshot_v1 | null,
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1 | null,
    blocker: string | null = null,
    candidate?: place_intent_v1,
  ): trading_decision_v1 {
    const now = this.Config.dryRun
      ? (snapshot?.input.now ?? this.getDecisionNow())
      : this.getDecisionNow();
    const context = {
      now,
      sessionId: snapshot?.input.sessionId ?? null,
      state: this.sessionUnwindRequested ? 'STOPPING' : 'RUNNING',
      evaluation,
      blocker,
      identityConflict: this.UnrelatedRecoveryIntentIds.includes(
        this.Journal.getActiveIdentityConflict()?.intentId ?? '',
      )
        ? null
        : (this.Journal.getActiveIdentityConflict()?.blocker ?? null),
      unresolvedIntentCount: this.Journal.nonTerminal().filter(
        (row) =>
          !this.UnrelatedRecoveryIntentIds.includes(row.intentId) &&
          !['ACKNOWLEDGED'].includes(row.status),
      ).length,
      mandatoryEvidenceFailureSince: this.MandatoryEvidenceFailureSince,
      terminalReason: this.TerminalDecisionReason,
      ...(candidate ? { candidate } : {}),
      coveragePriceAuthorization: snapshot
        ? this.getCoveragePrice(
            snapshot,
            candidate?.side ?? (snapshot.input.actualInventoryBase > 0 ? 'SELL' : 'BUY'),
          )
        : null,
    };
    const decisionSnapshot =
      snapshot === null
        ? null
        : {
            ...this.withExitReservations(snapshot),
            quoteSizing: Object.freeze({ ...this.QuoteSizing }),
          };
    let decision = evaluateTradingDecision(decisionSnapshot, context);
    if (!decision.evidenceComplete) {
      this.MandatoryEvidenceFailureSince ??= now;
      decision = evaluateTradingDecision(decisionSnapshot, {
        ...context,
        mandatoryEvidenceFailureSince: this.MandatoryEvidenceFailureSince,
      });
    } else this.MandatoryEvidenceFailureSince = null;
    if (decision.detailedReasons.includes('SESSION_MAX_LOSS_REACHED'))
      this.TerminalDecisionReason = 'SESSION_MAX_LOSS_REACHED';
    this.LatestTradingDecision = decision;
    return decision;
  }

  private QuoteSizing: {
    BUY: decibel_quote_size_assessment_v1 | null;
    SELL: decibel_quote_size_assessment_v1 | null;
  } = { BUY: null, SELL: null };
  private withExitReservations(
    snapshot: decibel_production_live_snapshot_v1,
  ): decibel_production_live_snapshot_v1 {
    snapshot = this.withTPProgress(snapshot);
    const nonterminal = this.Journal.nonTerminal()
      .filter((row) => !this.UnrelatedRecoveryIntentIds.includes(row.intentId))
      .flatMap((row) => {
        const intent = this.Journal.getIntent(row.intentId);
        return intent === null ? [] : [{ ...row, intent }];
      });
    const pending = nonterminal.reduce(
      (totals, row) => {
        const intent = row.intent;
        if (
          intent.action !== 'PLACE' ||
          snapshot.input.openOrders.some((order) => order.clientOrderId === intent.clientOrderId)
        )
          return totals;
        const filled = snapshot.input.actualFillLedger.fills
          .filter((fill) => fill.venueOrderId === row.venueOrderId)
          .reduce((sum, fill) => sum + getDecibelQuantityUnitsV1(fill.executedBaseQuantity), 0n);
        const remaining = getDecibelQuantityUnitsV1(intent.quantity) - filled;
        if (remaining <= 0n) return totals;
        if (intent.reduceOnly) totals.exit += remaining;
        else if (
          (snapshot.input.actualInventoryBase > 0 && intent.side === 'BUY') ||
          (snapshot.input.actualInventoryBase < 0 && intent.side === 'SELL')
        )
          totals.entry += remaining;
        return totals;
      },
      { entry: 0n, exit: 0n },
    );
    return {
      ...snapshot,
      input: {
        ...snapshot.input,
        pendingCancelOrderIds: nonterminal.flatMap((row) =>
          row.intent.action === 'CANCEL' ? [row.intent.expectedPreviousVenueOrderId] : [],
        ),
        pendingEntryQuantityBase: Number(pending.entry) / 1e8,
        pendingExitQuantityBase: Number(pending.exit) / 1e8,
      },
    };
  }

  private evaluateWithFlatPairCohort(
    snapshot: decibel_production_live_snapshot_v1,
    sizing: NonNullable<Parameters<typeof evaluateDecibelAuthenticatedPassiveRecyclingV1>[1]>,
  ): DecibelAuthenticatedPassiveRecyclingEvaluationV1 {
    snapshot = this.withExitReservations(snapshot);
    this.QuoteSizing = { BUY: null, SELL: null };
    const target = snapshot.sessionConfiguration?.targetMakerVolumeUsd;
    const executed = snapshot.sessionConfiguration?.totalExecutedVolumeUsd;
    const assessments = new Map<string, decibel_quote_size_assessment_v1>();
    const reductionNotional = Math.min(
      Math.abs(snapshot.input.actualInventoryBase) *
        Math.max(snapshot.input.book.bestAsk, snapshot.input.book.bestBid),
      snapshot.maximumReductionNotionalUsd ?? snapshot.maximumNotionalUsd,
    );
    // A planner bound for existing inventory only. The per-side callback below
    // still enforces the original entry cap/headroom for every increasing order.
    const limits = snapshot.sessionConfiguration?.exposureLimits;
    const verifiedDynamicBudget =
      limits !== undefined &&
      !limits.capacityBlocker &&
      Number.isFinite(limits.availableHeadroomUsd) &&
      Number.isFinite(limits.effectivePositionLimitUsd);
    let jointCaps: ReturnType<typeof allocateDecibelTwoSidedQuoteBudgetV1> | null = null;
    const exitSide = snapshot.input.actualInventoryBase > 0 ? 'SELL' : 'BUY';
    const partialPrice = snapshot.input.actualInventoryBase
      ? constructDecibelAdaptiveTPPriceV1(
          snapshot,
          exitSide,
          Math.abs(snapshot.input.actualInventoryBase),
          exitSide === 'SELL' ? snapshot.input.book.bestAsk : snapshot.input.book.bestBid,
        ).price
      : null;
    const adaptivePrice = assessDecibelAdaptiveTPV1(
      snapshot,
      exitSide,
      partialPrice ??
        (exitSide === 'SELL' ? snapshot.input.book.bestAsk : snapshot.input.book.bestBid),
    );
    // Single DCA addition: admitted only far enough adverse and within the risk capacity
    // left after the current position (never a raised limit).
    const dca =
      snapshot.input.actualInventoryBase !== 0 &&
      !this.sessionUnwindRequested &&
      !this.riskReductionRequested &&
      snapshot.sessionConfiguration?.preferredEntrySizeUsd !== undefined
        ? assessDecibelSnapshotDCAV1(snapshot)
        : null;
    const constrainedSizing = {
      ...sizing,
      positionGrowth:
        dca?.allowed && dca.side !== null && dca.priceLimit !== null
          ? { side: dca.side, priceLimit: dca.priceLimit }
          : null,
      positionGrowthBlocker: dca !== null && !dca.allowed ? dca.reason : null,
      entryCandleBlockers: snapshot.entryCandleBlockers ?? null,
      entryPauseReason:
        getDecibelEntryVolatilityPauseReasonV1(snapshot.priceRangeBps) ??
        snapshot.executionGasBlocker ??
        null,
      entryEvidenceBlocker: limits?.capacityBlocker ?? null,
      ...(snapshot.reductionCapacity
        ? {
            ...(!adaptivePrice.allowed &&
            this.getCoveragePrice(snapshot, snapshot.input.actualInventoryBase > 0 ? 'SELL' : 'BUY')
              ? {
                  committedCoveragePrice: this.getCoveragePrice(
                    snapshot,
                    snapshot.input.actualInventoryBase > 0 ? 'SELL' : 'BUY',
                  )!.price,
                }
              : {}),
            assessReducingCandidate: (
              candidate: Readonly<{ side: 'BUY' | 'SELL'; quantity: number; price: number }>,
            ) =>
              assessDecibelTPActionV1(
                snapshot,
                candidate.side,
                candidate.quantity,
                candidate.price,
                this.getCoveragePrice(snapshot, candidate.side),
              ),
            constructReducingCandidate: (
              candidate: Readonly<{ side: 'BUY' | 'SELL'; quantity: number; price: number }>,
            ) =>
              constructDecibelAdaptiveTPPriceV1(
                snapshot,
                candidate.side,
                candidate.quantity,
                candidate.price,
              ),
          }
        : {}),

      ...(this.FlatPairCohort !== null &&
      snapshot.input.actualInventoryBase === 0 &&
      (snapshot.input.openOrders.length > 0 ||
        this.Journal.findNonTerminalPlaceBySide('BUY') !== null ||
        this.Journal.findNonTerminalPlaceBySide('SELL') !== null)
        ? { flatPairSharedBaseQuantity: this.FlatPairCohort.sharedBaseQuantity }
        : {}),
      ...(verifiedDynamicBudget
        ? {
            entryHeadroomUsd:
              snapshot.input.actualInventoryBase === 0
                ? limits.availableHeadroomUsd
                : calculateDecibelSidePositionBudgetBtcV1({
                    side: snapshot.input.actualInventoryBase > 0 ? 'BUY' : 'SELL',
                    inventoryBase: snapshot.input.actualInventoryBase,
                    maximumAbsPositionBase:
                      limits.effectivePositionLimitUsd /
                      ((snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2),
                    openOrders: snapshot.input.openOrders,
                    replacingVenueOrderId: snapshot.input.openOrders.find(
                      (o) => o.side === (snapshot.input.actualInventoryBase > 0 ? 'BUY' : 'SELL'),
                    )?.venueOrderId,
                  }) *
                  ((snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2),
          }
        : {}),
      maximumNotionalUsd: Math.max(
        sizing.maximumNotionalUsd,
        snapshot.maximumReductionNotionalUsd ?? reductionNotional,
      ),
      ...(snapshot.input.actualInventoryBase === 0
        ? {}
        : {
            maximumAbsPositionBase: Math.max(
              sizing.maximumAbsPositionBase ??
                sizing.maximumNotionalUsd /
                  ((snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2),
              Math.abs(snapshot.input.actualInventoryBase),
            ),
          }),
      availableMarginUsd: snapshot.authenticatedAvailableMarginUsd ?? sizing.availableMarginUsd,
      constrainQuoteQuantity: (
        candidate: Readonly<{
          side: 'BUY' | 'SELL';
          price: number;
          quantity: number;
          rawBudgetUsd?: number;
        }>,
      ) => {
        if (
          snapshot.sessionConfiguration === undefined ||
          this.sessionUnwindRequested ||
          this.riskReductionRequested
        )
          return candidate.quantity;
        if (target !== undefined && target > 0 && executed === undefined)
          throw new Error('DYNAMIC_SIZE_VOLUME_EVIDENCE_REQUIRED');
        const reducing =
          (snapshot.input.actualInventoryBase < 0 && candidate.side === 'BUY') ||
          (snapshot.input.actualInventoryBase > 0 && candidate.side === 'SELL');
        // Sessions carry their preferred entry size (decibel_entry_size_v1); snapshots
        // without one (tests, previews) size from the candidate.
        const dynamicEntry =
          !reducing && snapshot.sessionConfiguration.preferredEntrySizeUsd !== undefined;
        const currentEntry = snapshot.input.openOrders.find(
          (order) =>
            order.side === candidate.side &&
            order.strategyConfigId === snapshot.input.strategyConfigId &&
            order.reduceOnly !== true,
        );
        const partialEntry =
          currentEntry &&
          snapshot.input.actualFillLedger.fills.some(
            (fill) => fill.venueOrderId === currentEntry.venueOrderId,
          );
        const entry = dynamicEntry
          ? calculateDecibelEntrySizeV1({
              preferredEntrySizeUsd: snapshot.sessionConfiguration.preferredEntrySizeUsd!,
              price: candidate.price,
              minimumSize: snapshot.input.metadata.minimumSize,
              minimumNotionalUsd: snapshot.input.metadata.minimumNotionalUsd ?? 0,
              lotSize: snapshot.input.metadata.lotSize,
              maximumExecutableNotionalUsd: Math.min(
                sizing.availableMarginUsd * sizing.maximumEffectiveLeverage +
                  (currentEntry ? currentEntry.price * currentEntry.quantity : 0),
                sizing.maximumNotionalUsd,
              ),
              // Shrink to the stress-loss capacity the risk gate enforces instead of
              // proposing an entry it would block outright. A DCA addition gets only the
              // capacity left after the current position.
              ...(snapshot.input.actualInventoryBase !== 0
                ? { riskCapacityUsd: dca?.allowed ? dca.maximumNotionalUsd : 0 }
                : snapshot.sessionConfiguration.exposureLimits?.riskCapacityUsd === undefined
                  ? {}
                  : {
                      riskCapacityUsd: snapshot.sessionConfiguration.exposureLimits.riskCapacityUsd,
                    }),
            })
          : null;
        let assessment = calculateDecibelDynamicQuoteSizeV1({
          side: candidate.side,
          ...(dynamicEntry
            ? {
                preferredEntrySizeUsd: snapshot.sessionConfiguration.preferredEntrySizeUsd!,
              }
            : {}),
          reduceOnly: reducing,
          price: candidate.price,
          proposedSizeBtc: reducing
            ? Math.abs(snapshot.input.actualInventoryBase)
            : entry
              ? Math.min(
                  entry.quantity || entry.minimumExecutableNotionalUsd / candidate.price,
                  partialEntry ? currentEntry.quantity : Infinity,
                )
              : Math.max(candidate.quantity, (candidate.rawBudgetUsd ?? 0) / candidate.price),
          inventoryBase: snapshot.input.actualInventoryBase,
          maximumAbsPositionBase:
            snapshot.sessionConfiguration?.exposureLimits !== undefined
              ? snapshot.sessionConfiguration.exposureLimits.effectivePositionLimitUsd /
                ((snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2)
              : (snapshot.maximumAbsPositionBase ??
                sizing.maximumNotionalUsd /
                  ((snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2)),
          availableMarginUsd: reducing
            ? (snapshot.authenticatedAvailableMarginUsd ?? sizing.availableMarginUsd)
            : sizing.availableMarginUsd,
          maximumEffectiveLeverage: sizing.maximumEffectiveLeverage,
          maximumNotionalUsd: reducing
            ? getDecibelReductionOrderLimitV1(snapshot, candidate.price)
            : sizing.maximumNotionalUsd,
          minimumNotionalUsd: reducing
            ? 0
            : dynamicEntry
              ? (snapshot.input.metadata.minimumNotionalUsd ?? 0)
              : sizing.minimumNotionalUsd,
          ...(reducing && snapshot.reductionCapacity
            ? {
                venueMaximumOrderNotionalUsd:
                  snapshot.reductionCapacity.venueMaximumOrderNotionalUsd,
              }
            : {}),
          minimumSize: snapshot.input.metadata.minimumSize,
          lotSize: snapshot.input.metadata.lotSize,
          openOrders: snapshot.input.openOrders,
          replacingVenueOrderId: snapshot.input.openOrders.find(
            (order) =>
              order.side === candidate.side &&
              order.strategyConfigId === snapshot.input.strategyConfigId,
          )?.venueOrderId,

          remainingTargetUsd:
            target === undefined || target <= 0 ? null : Math.max(0, target - (executed ?? 0)),
        });
        if (jointCaps !== null && assessment.finalSizeBtc > jointCaps[candidate.side])
          assessment = Object.freeze({
            ...assessment,
            finalSizeBtc: jointCaps[candidate.side],
            finalNotionalUsd: jointCaps[candidate.side] * candidate.price,
            bindingConstraint: jointCaps.reason,
          });
        const key = `${candidate.side}:${candidate.price}`;
        if (!assessments.has(key)) assessments.set(key, assessment);
        this.QuoteSizing[candidate.side] ??= assessment;
        return reducing || dynamicEntry
          ? assessment.finalSizeBtc
          : Math.min(candidate.quantity, assessment.finalSizeBtc);
      },
    };
    let baseline = evaluateDecibelAuthenticatedPassiveRecyclingV1(
      snapshot.input,
      constrainedSizing,
    );
    if (
      // Only two opening orders share incremental entry collateral/volume.
      // A non-flat pair contains a reduction, already bounded independently
      // against the authenticated position and the venue order limit above.
      snapshot.input.actualInventoryBase === 0 &&
      baseline.desiredBid !== null &&
      baseline.desiredAsk !== null &&
      baseline.operatingState !== 'SESSION_UNWIND'
    ) {
      const pendingUsd = snapshot.input.openOrders.reduce(
        (sum, order) => sum + order.price * order.quantity,
        0,
      );
      const collateralNotional =
        snapshot.input.actualInventoryBase === 0
          ? (snapshot.strategyAllocationRemainingUsd ??
              sizing.availableMarginUsd *
                (sizing.maximumAggregateCollateralFraction ??
                  this.Config.maximumAggregateCollateralFraction)) * sizing.maximumEffectiveLeverage
          : (snapshot.authenticatedAvailableMarginUsd ?? sizing.availableMarginUsd) *
            sizing.maximumEffectiveLeverage;
      jointCaps = allocateDecibelTwoSidedQuoteBudgetV1({
        bid: baseline.desiredBid,
        ask: baseline.desiredAsk,
        reservedBid: {
          quantity: snapshot.input.openOrders
            .filter((o) => o.side === 'BUY')
            .reduce((sum, o) => sum + o.quantity, 0),
          notionalUsd: snapshot.input.openOrders
            .filter((o) => o.side === 'BUY')
            .reduce((sum, o) => sum + o.quantity * o.price, 0),
        },
        reservedAsk: {
          quantity: snapshot.input.openOrders
            .filter((o) => o.side === 'SELL')
            .reduce((sum, o) => sum + o.quantity, 0),
          notionalUsd: snapshot.input.openOrders
            .filter((o) => o.side === 'SELL')
            .reduce((sum, o) => sum + o.quantity * o.price, 0),
        },
        lotSize: snapshot.input.metadata.lotSize,
        minimumSize: snapshot.input.metadata.minimumSize,
        minimumNotionalUsd: snapshot.minimumNotionalUsd,
        combinedBudgetUsd: Math.max(
          0,
          Math.min(
            collateralNotional + pendingUsd,
            // Each side may rest one full entry toward the target: the two entries are
            // alternatives, so the volume allowance is per side, not shared (2026-11-14).
            (snapshot.input.actualInventoryBase === 0 ? 2 : 1) *
              remainingTargetBudgetUsd(
                target,
                executed,
                snapshot.sessionConfiguration?.preferredEntrySizeUsd,
                Math.max(
                  snapshot.input.metadata.minimumSize *
                    Math.max(baseline.desiredBid.price, baseline.desiredAsk.price),
                  snapshot.minimumNotionalUsd,
                ),
              ),
          ),
        ),
        preferredSide:
          snapshot.input.actualInventoryBase < 0
            ? 'BUY'
            : snapshot.input.actualInventoryBase > 0
              ? 'SELL'
              : (baseline.expectedBidEdgeBps ?? 0) >= (baseline.expectedAskEdgeBps ?? 0)
                ? 'BUY'
                : 'SELL',
      });
      if (jointCaps.reason !== 'COMBINED_BUDGET_VALID') {
        assessments.clear();
        this.QuoteSizing = { BUY: null, SELL: null };
        baseline = evaluateDecibelAuthenticatedPassiveRecyclingV1(
          snapshot.input,
          constrainedSizing,
        );
        baseline = Object.freeze({
          ...baseline,
          ...(jointCaps.BUY === 0 ? { bidEligibilityReason: jointCaps.reason } : {}),
          ...(jointCaps.SELL === 0 ? { askEligibilityReason: jointCaps.reason } : {}),
        });
      }
    }
    for (const side of ['BUY', 'SELL'] as const) {
      const desired = side === 'BUY' ? baseline.desiredBid : baseline.desiredAsk;
      if (desired !== null)
        this.QuoteSizing[side] = assessments.get(`${side}:${desired.price}`) ?? null;
    }
    if (snapshot.input.actualInventoryBase !== 0) {
      this.FlatPairCohort = null;
      return baseline;
    }
    if (baseline.status === 'FAIL_CLOSED') return baseline;

    const ownedOrderExists = (side: 'BUY' | 'SELL'): boolean =>
      snapshot.input.openOrders.some((order) => order.side === side) ||
      this.Journal.findNonTerminalPlaceBySide(side) !== null;
    if (
      this.FlatPairCohort !== null &&
      this.FlatPairCohort.issuedSides.size > 0 &&
      !ownedOrderExists('BUY') &&
      !ownedOrderExists('SELL')
    )
      this.FlatPairCohort = null;

    const cohortFits = (quantity: number): boolean =>
      baseline.desiredBid !== null &&
      baseline.desiredAsk !== null &&
      quantity <= baseline.desiredBid.quantity + 1e-12 &&
      quantity <= baseline.desiredAsk.quantity + 1e-12 &&
      quantity + Number.EPSILON >= snapshot.input.metadata.minimumSize &&
      baseline.desiredBid.price * quantity + Number.EPSILON >= snapshot.minimumNotionalUsd &&
      baseline.desiredAsk.price * quantity + Number.EPSILON >= snapshot.minimumNotionalUsd &&
      baseline.desiredBid.price * quantity <= snapshot.maximumNotionalUsd + Number.EPSILON &&
      baseline.desiredAsk.price * quantity <= snapshot.maximumNotionalUsd + Number.EPSILON;
    if (this.FlatPairCohort !== null && !cohortFits(this.FlatPairCohort.sharedBaseQuantity))
      this.FlatPairCohort = null;

    if (
      this.FlatPairCohort === null &&
      baseline.desiredBid !== null &&
      baseline.desiredAsk !== null
    ) {
      const sharedBaseQuantity = Math.min(
        baseline.desiredBid.quantity,
        baseline.desiredAsk.quantity,
      );
      const budgetUsd = Math.max(
        baseline.desiredBid.price * sharedBaseQuantity,
        baseline.desiredAsk.price * sharedBaseQuantity,
      );
      this.FlatPairCohort = {
        id: `flat-pair-${hash({
          sessionId: snapshot.input.sessionId,
          cycleSequence: this.cycleSequence,
          sharedBaseQuantity,
          createdAt: snapshot.input.now,
        }).slice(0, 20)}`,
        sharedBaseQuantity,
        budgetUsd,
        issuedSides: new Set<'BUY' | 'SELL'>(),
      };
    }
    const cohort = this.FlatPairCohort;
    if (cohort === null) return baseline;
    return evaluateDecibelAuthenticatedPassiveRecyclingV1(snapshot.input, {
      ...constrainedSizing,
      flatPairCohortId: cohort.id,
      flatPairSharedBaseQuantity: cohort.sharedBaseQuantity,
      flatPairBudgetUsd: cohort.budgetUsd,
    });
  }

  public constructor(
    private readonly Journal: decibel_execution_lifecycle_journal_v1,
    private readonly Source: DecibelProductionLiveStateSourceV1,
    private readonly ExternalExecutor: DecibelProductionExecutionExecutorV1,
    private readonly Config: decibel_production_live_configuration_v1,
    private readonly Budget: execution_mutation_budget_v1,
    regimeBootstrap?: decibel_market_regime_bootstrap_v1,
    private readonly getDecisionNow: () => number = Date.now,
  ) {
    this.cycleSequence = Journal.maximumCycleSequence();
    this.EnforceMarketRegimeReadiness = regimeBootstrap?.enforceReadiness ?? false;
    const bootstrapObservedAt = regimeBootstrap?.observedAt ?? Date.now();
    const bootstrapCutoff = bootstrapObservedAt - Config.volatilityLookbackMs;
    for (const observation of regimeBootstrap?.observations ?? []) {
      if (observation.timestamp < bootstrapCutoff || observation.timestamp > bootstrapObservedAt)
        continue;
      this.MidpointHistory.push({
        at: observation.timestamp,
        midpoint: (observation.bestBid + observation.bestAsk) / 2,
        bestBid: observation.bestBid,
        bestAsk: observation.bestAsk,
        bestBidSize: null,
        bestAskSize: null,
        microprice: null,
        topBookImbalance: null,
        recentTradeIntensity: null,
      });
    }
    this.MarketRegimeState = this.MidpointHistory.length >= 2 ? 'READY' : 'WARMING';
    Journal.terminalizeLegacyUnsubmittedIntents(Date.now());
    if (Config.releaseStage === 'DISABLED' || !Config.executorEnabled) {
      // The constructor remains non-mutating; evaluateOnce records the blocker.
    }
    const Gate = new decibel_production_executor_gate_v1(ExternalExecutor, {
      executorEnabled: Config.executorEnabled,
      releaseStage: Config.releaseStage === 'AUTONOMOUS' ? 'AUTONOMOUS' : 'CANARY',
      ...(Config.reconciledCanaryEvidenceHash
        ? { reconciledCanaryEvidenceHash: Config.reconciledCanaryEvidenceHash }
        : {}),
      ...(Config.requiredCanaryEvidenceHash
        ? { requiredCanaryEvidenceHash: Config.requiredCanaryEvidenceHash }
        : {}),
    });
    this.ExecutorGate = Gate;
    this.Lifecycle = new decibel_execution_lifecycle_v1(
      Journal,
      Gate,
      {
        ...this.Budget,
        submissionTimeoutMs: this.Budget.submissionTimeoutMs ?? Config.submissionTimeoutMs,
      },
      Date.now,
      (intent) => {
        const checkUnwind = () => {
          if (
            this.sessionUnwindRequested &&
            intent.action === 'PLACE' &&
            !(intent.reduceOnly && intent.executionRole === 'SESSION_UNWIND_IOC')
          )
            throw new execution_preflight_rejection_v1('SESSION_TARGET_OR_UNWIND_PLACE_BLOCKED');
          if (this.sessionDrainRequested && intent.action === 'PLACE' && !intent.reduceOnly)
            throw new execution_preflight_rejection_v1('SESSION_TARGET_DRAINING');
        };
        this.DecisionGate = 'Source.validateSubmission';
        const validation = this.Source.validateSubmission?.(intent);
        if (validation !== undefined)
          return Promise.resolve(validation).then((limits) => {
            checkUnwind();
            this.FinalValidation = limits ?? null;
            this.DecisionGate = 'decibel_execution_lifecycle_v1.submit';
            return this.validateIndependentProtection(intent, limits);
          });
        checkUnwind();
        this.DecisionGate = 'decibel_execution_lifecycle_v1.submit';
        if (this.HistoricalRecoveryBlocker !== null)
          return this.validateIndependentProtection(intent, undefined);
      },
    );
  }

  /**
   * Offline protection: keep one wide full-size stop on an open position. Runs after the
   * cycle, never in the same cycle as another submission, never while a submission is in flight
   * and at most once per retry interval; each attempt is decided from a fresh venue read
   * (the venue keeps at most one full-size SL, so a repeat cannot duplicate it). Never throws.
   */
  private async maintainCatastropheStop(
    cycle: decibel_production_live_cycle_result_v1,
  ): Promise<void> {
    try {
      const snapshot = this.LatestSnapshot;
      if (
        !this.Config.catastropheStopEnabled ||
        this.Config.dryRun ||
        !this.Config.executorEnabled ||
        this.Config.releaseStage === 'DISABLED' ||
        snapshot === null ||
        snapshot.catastropheStop === undefined
      )
        return;
      const position = snapshot.input.actualInventoryBase;
      const basis = snapshot.authenticatedPositions?.filter(
        (p) => p.market === 'BTC/USD' && p.size === position,
      );
      const book = snapshot.input.book;
      const markPrice = (book.bestBid + book.bestAsk) / 2;
      const plan = planDecibelCatastropheStopV1({
        positionBase: position,
        entryBasis: basis?.length === 1 ? basis[0]!.entryPrice : null,
        markPrice,
        maxLossUsd: snapshot.sessionConfiguration?.maxLossUsd,
        tickSize: snapshot.input.metadata.tickSize,
        existing: snapshot.catastropheStop,
        foreignTpSlCount: snapshot.input.activeTpSlCount,
      });
      this.CatastropheStopStatus = plan.reason;
      if (plan.action !== 'PLACE') return;
      const now = this.getDecisionNow();
      if (
        cycle.action === 'ACKNOWLEDGED' ||
        // A resting order (ACKNOWLEDGED) is fine; a submission still in flight or unresolved
        // is not.
        this.Journal.nonTerminal().some((row) => row.status !== 'ACKNOWLEDGED') ||
        now - this.CatastropheStopAttemptAt < DECIBEL_CATASTROPHE_STOP_RETRY_INTERVAL_MS_V1 ||
        now - book.observedAt > snapshot.input.maxBboAgeMs
      )
        return;
      const blocker = validateDecibelCatastropheStopV1(plan, position, markPrice);
      if (blocker !== null) {
        this.CatastropheStopStatus = blocker;
        return;
      }
      this.CatastropheStopAttemptAt = now;
      const result = await this.ExecutorGate.placeCatastropheStop({
        side: plan.side!,
        triggerPrice: plan.triggerPrice!,
        limitPrice: plan.limitPrice!,
      });
      this.CatastropheStopStatus = `CATASTROPHE_STOP_${result.outcome}`;
      console.info(
        JSON.stringify({
          event: 'DECIBEL_CATASTROPHE_STOP',
          positionBase: position,
          side: plan.side,
          triggerPrice: plan.triggerPrice,
          limitPrice: plan.limitPrice,
          outcome: result.outcome,
          transactionHash: result.transactionHash ?? null,
          detail: result.detail ?? null,
        }),
      );
    } catch (error) {
      this.CatastropheStopStatus = 'CATASTROPHE_STOP_ERROR';
      console.error(
        `DECIBEL_CATASTROPHE_STOP=ERROR DETAIL=${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`,
      );
    }
  }

  public async evaluateOnce(): Promise<decibel_production_live_cycle_result_v1> {
    this.IntendedAction = null;
    this.FinalValidation = null;
    this.DecisionGate = 'evaluateOnceInternal';
    this.CycleStartedAt = performance.now();
    this.AuthenticatedReadMs = 0;
    this.DecisionSelectedAt = null;
    this.CancelToReplacementReadyMs = null;
    try {
      await this.refreshGasBalance();
      await this.refreshExchangeCandles();
      const cycle = await this.evaluateOnceInternal();
      await this.maintainCatastropheStop(cycle);
      return cycle;
    } catch (error) {
      if (
        getErrorChain(error).some(
          (candidate) =>
            candidate instanceof Error &&
            [
              'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
              'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
            ].includes(candidate.message),
        ) &&
        this.Journal.nonTerminal().some(
          (row) => this.Journal.getIntent(row.intentId)?.action === 'CANCEL',
        )
      )
        this.setHistoricalRecoveryBlocker(
          error instanceof Error ? error.message : 'PRODUCTION_HISTORICAL_RECOVERY_PENDING',
        );
      const rateLimited =
        isDecibelHttpRateLimitErrorV1(error) ||
        getErrorChain(error).some(
          (candidate) =>
            candidate instanceof Error &&
            candidate.message === 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
        );
      if (!rateLimited) throw error;
      const now = Date.now();
      enterDecibelHTTPReadBackoffForErrorV1(error, this.Config.rateLimitBackoffMs, now);
      this.Journal.recordBlocker(null, 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED', now);
      const unresolved = this.Journal.nonTerminal()[0] ?? null;
      return this.result(
        'HOLD',
        unresolved?.intentId ?? null,
        'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED',
        null,
        0,
      );
    }
  }

  private async evaluateOnceInternal(): Promise<decibel_production_live_cycle_result_v1> {
    // Recovery can return before normal planning. Never retain a prior cycle's
    // action/snapshot and report it as the action blocked by today's evidence.
    this.DecisionSnapshot = null;
    this.SelectedAction = null;
    this.SelectionReason = null;
    this.LatestTPReview = null;
    this.UnrelatedRecoveryIntentIds = [];
    this.ProtectivePlannedPosition = null;
    if (
      this.HistoricalRecoveryBlocker === null &&
      this.Journal.nonTerminal().some(
        (row) =>
          row.status === 'UNRESOLVABLE_ACK' &&
          this.Journal.getIntent(row.intentId)?.action === 'CANCEL',
      )
    )
      this.setHistoricalRecoveryBlocker('PRODUCTION_HISTORICAL_RECOVERY_PENDING');
    if (this.HistoricalRecoveryBlocker !== null) {
      const current = await this.readSnapshot();
      const proof = assessDecibelProtectiveRecoveryV1(
        this.Journal,
        current,
        this.Config.dryRun ? current.input.now : this.getDecisionNow(),
      );
      if (!proof.allowed) {
        // Current order reconciliation is independent of the historical intent.
        // Only authoritative OPEN or exact terminal/fill evidence can advance it.
        if (
          [
            'PROTECTIVE_OUTSTANDING_SUBMISSION_UNRESOLVED',
            'PROTECTIVE_CURRENT_ORDER_OWNERSHIP_UNVERIFIED',
          ].includes(proof.blocker)
        ) {
          const reconciled = reconcileDecibelCurrentProtectiveEvidenceV1(this.Journal, current);
          if (reconciled !== null) {
            this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
            return this.result('RECONCILE_ONLY', reconciled, proof.blocker, null, 0);
          }
        }
        return this.result('BLOCKED', null, proof.blocker, null, 0);
      }
      this.UnrelatedRecoveryIntentIds = proof.unrelatedIntentIds;
      if (current.input.actualInventoryBase === 0 && current.input.openOrders.length === 0)
        return this.result('HOLD', null, 'PROTECTIVE_ONLY_FLAT_NEW_EXPOSURE_BLOCKED', null, 0);
    }
    this.cycleSequence += 1;
    this.LatestOperationalRegime = null;
    this.DecisionSnapshot = null;
    this.LatestTPReview = null;
    this.SelectedAction = null;
    this.SelectionReason = null;
    this.RepriceAbortReason = null;
    this.CancelToReplacementAckMs = null;
    if (this.FrozenReprice === null) {
      this.RepriceDecisionId = null;
      this.RepriceCommitSnapshotId = null;
      this.RepriceOldPrice = null;
      this.FrozenReplacementPrice = null;
      this.RepriceImprovementTicks = null;
    }
    if (this.Config.dryRun) this.Journal.supersedeDryRunOnlyPrepared(Date.now());
    // Terminal intents are absent from Lifecycle.recover(). Resolve their durable
    // conflicts with the same exact-evidence boundary used by startup recovery.
    // This cycle performs reconciliation only, never a strategic mutation.
    const durableConflict = this.Journal.getActiveIdentityConflict();
    if (
      durableConflict !== null &&
      !this.UnrelatedRecoveryIntentIds.includes(durableConflict.intentId) &&
      this.Source.readOrderIdentityEvidence !== undefined
    ) {
      const repaired = await reconcileDecibelActiveIdentityConflictV1(this.Journal, this.Source);
      if (repaired.reconciled !== null)
        return this.result('RECONCILE_ONLY', repaired.reconciled, repaired.blocker, null, 0);
    }
    const recoveries = this.Lifecycle.recover().filter(
      (row) => !this.UnrelatedRecoveryIntentIds.includes(row.intentId),
    );
    if (recoveries.length === 0 && Date.now() < this.mutationBudgetCooldownUntil)
      return this.result('HOLD', null, 'EXECUTION_MUTATION_BUDGET_COOLDOWN', null, 0);
    let recovery = recoveries[0];
    let snapshot: decibel_production_live_snapshot_v1;
    if (recovery !== undefined) {
      snapshot = await this.readSnapshot();
      // OPEN visibility does not resolve a durable uncertainty until its owner
      // passes reconciliation. Do not let an older ACK starve that owner.
      recovery =
        recoveries.find((candidate) => {
          const status = this.Journal.get(candidate.intentId)?.status;
          return (
            status === 'UNRESOLVABLE_ACK' ||
            status === 'SUBMIT_UNKNOWN' ||
            status === 'SUBMITTING' ||
            status === 'RECONCILING'
          );
        }) ??
        recoveries.find(
          (candidate) => this.Journal.getIntent(candidate.intentId)?.action === 'CANCEL',
        ) ??
        recoveries.find((candidate) => {
          const persisted = this.Journal.get(candidate.intentId);
          return (
            persisted !== null &&
            (persisted.venueOrderId === null ||
              !snapshot.input.openOrders.some(
                (order) => order.venueOrderId === persisted.venueOrderId,
              ))
          );
        }) ??
        recovery;
      const recoveredIntent = this.Journal.get(recovery.intentId);
      let reconciliation: reconciliation_state_v1 | undefined;
      try {
        reconciliation = await this.Source.reconcileIntent(
          recovery.intentId,
          snapshot,
          recoveredIntent?.venueOrderId,
          this.getReconciliationIdentity(recovery.intentId),
        );
      } catch (error) {
        if (
          getErrorChain(error).some(
            (candidate) =>
              candidate instanceof Error &&
              candidate.message === 'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
          )
        ) {
          const current = this.Journal.get(recovery.intentId);
          if (
            current &&
            [
              'ACKNOWLEDGED',
              'RECONCILING',
              'SUBMITTING',
              'SUBMIT_UNKNOWN',
              'UNRESOLVABLE_ACK',
            ].includes(current.status)
          )
            this.Journal.transition(recovery.intentId, 'RECONCILING', snapshot.input.now);
          return this.result(
            'RECONCILE_ONLY',
            recovery.intentId,
            'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
            null,
            0,
          );
        }
        const unresolvableAcknowledgement = getErrorChain(error).some(
          (candidate) =>
            candidate instanceof Error &&
            candidate.message === 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
        );
        if (unresolvableAcknowledgement) {
          if (this.Source.readOrderIdentityEvidence !== undefined) {
            await reconcileAllDecibelAcknowledgedOrdersV1(this.Journal, this.Source, snapshot);
            const resolved = this.Journal.get(recovery.intentId)?.status;
            if (
              resolved === 'APPLIED' ||
              resolved === 'CANCELLED_EXTERNALLY' ||
              resolved === 'EXTERNALLY_NEUTRALIZED'
            ) {
              this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
              return this.result('RECONCILE_ONLY', recovery.intentId, null, null, 0);
            }
          }
          // A lagging snapshot/history projection is not a failed submission.
          // Use the existing direct authenticated reader before latching UNKNOWN;
          // only an exact OPEN identity may clear it here, never SDK success/FLAT.
          const body = this.Journal.getIntent(recovery.intentId);
          if (body && this.Source.verifyTimedOutIntent) {
            const direct = await this.Source.verifyTimedOutIntent(
              body,
              recoveredIntent?.venueOrderId ?? null,
              null,
            );
            if (direct.state === 'ORDER_OPEN') {
              const open = direct.openOrder;
              if (
                open.clientOrderId !== body.clientOrderId ||
                (recoveredIntent?.venueOrderId != null &&
                  open.venueOrderId !== recoveredIntent.venueOrderId) ||
                open.market !== snapshot.input.market ||
                body.market !== snapshot.input.metadata.symbol ||
                open.side !== body.side ||
                !isAligned(open.price, snapshot.input.metadata.tickSize) ||
                Math.round(open.price / snapshot.input.metadata.tickSize) !== body.priceTicks ||
                !Number.isFinite(open.quantity) ||
                open.quantity <= 0 ||
                open.quantity > body.quantity ||
                !isAligned(open.quantity, snapshot.input.metadata.lotSize) ||
                (body.action === 'PLACE' &&
                  open.reduceOnly !== undefined &&
                  open.reduceOnly !== body.reduceOnly)
              )
                throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT', {
                  cause: error,
                });
              snapshot = Object.freeze({
                ...snapshot,
                input: Object.freeze({
                  ...snapshot.input,
                  openOrders: Object.freeze([
                    ...snapshot.input.openOrders.filter(
                      (o) => o.venueOrderId !== direct.openOrder.venueOrderId,
                    ),
                    direct.openOrder,
                  ]),
                }),
                sourceStateHash: hash({
                  previous: snapshot.sourceStateHash,
                  direct: direct.openOrder,
                }),
              });
              this.LatestSnapshot = snapshot;
              this.applyOpenOrderReconciliationProvenance(
                recovery.intentId,
                'ORDER_OPEN',
                snapshot,
              );
              this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
              return this.result('RECONCILE_ONLY', recovery.intentId, null, null, 0);
            }
          }
          this.Journal.markUnresolvableAcknowledgement(recovery.intentId, snapshot.input.now);
          return this.result(
            'RECONCILE_ONLY',
            recovery.intentId,
            'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
            null,
            0,
          );
        }
        if (
          recoveredIntent !== null &&
          getErrorChain(error).some(
            (candidate) =>
              candidate instanceof Error &&
              candidate.message === 'PRODUCTION_RECONCILIATION_AMBIGUOUS',
          )
        ) {
          const elapsedMs = Math.max(0, snapshot.input.now - recoveredIntent.createdAt);
          if (
            elapsedMs >= this.Config.reconciliationConfirmationTimeoutMs &&
            this.Source.verifyTimedOutIntent !== undefined
          ) {
            const recoveredIntentBody = this.Journal.getIntent(recovery.intentId);
            if (recoveredIntentBody === null)
              throw new Error('EXECUTION_INTENT_NOT_FOUND', { cause: error });
            const fallback = await this.Source.verifyTimedOutIntent(
              recoveredIntentBody,
              recoveredIntent.venueOrderId,
              elapsedMs >= this.Config.maximumReconciliationAgeMs
                ? this.Journal.getSubmissionTelemetry(recovery.intentId)
                : null,
            );
            if (fallback.state !== 'UNRESOLVED') {
              reconciliation = fallback.state;
              if (
                fallback.state === 'INTENT_FAILED_TIMEOUT' ||
                fallback.state === 'DROPPED_EXPIRED'
              ) {
                this.recordAuthenticatedFillsForIntent(recovery.intentId, snapshot);
                this.Lifecycle.reconcile(recovery.intentId, fallback.state, snapshot.input.now);
                this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
                return this.result(
                  'RECONCILE_ONLY',
                  recovery.intentId,
                  fallback.state === 'DROPPED_EXPIRED'
                    ? `INTENT_EXPIRED_DROPPED: Cleared phantom intent ${recovery.intentId} after max age exceeded`
                    : null,
                  null,
                  0,
                );
              }
              snapshot = Object.freeze({
                ...snapshot,
                input: Object.freeze({
                  ...snapshot.input,
                  openOrders: Object.freeze([
                    ...snapshot.input.openOrders.filter(
                      (order) => order.venueOrderId !== fallback.openOrder.venueOrderId,
                    ),
                    fallback.openOrder,
                  ]),
                }),
                sourceStateHash: hash({
                  priorSourceStateHash: snapshot.sourceStateHash,
                  directlyVerifiedOpenOrder: fallback.openOrder,
                }),
              });
              this.LatestSnapshot = snapshot;
              this.recordAuthenticatedFillsForIntent(recovery.intentId, snapshot);
              this.applyOpenOrderReconciliationProvenance(
                recovery.intentId,
                reconciliation,
                snapshot,
              );
              this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
              return this.result('HOLD', recovery.intentId, null, null, 0);
            } else {
              return this.result(
                'RECONCILE_ONLY',
                recovery.intentId,
                getErrorChain(error).some(
                  (candidate) =>
                    candidate instanceof Error &&
                    candidate.message === 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
                )
                  ? 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'
                  : 'PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT',
                null,
                0,
              );
            }
          } else {
            return this.result(
              'RECONCILE_ONLY',
              recovery.intentId,
              elapsedMs >= this.Config.reconciliationConfirmationTimeoutMs
                ? 'PRODUCTION_RECONCILIATION_CONFIRMATION_TIMEOUT'
                : 'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING',
              null,
              0,
            );
          }
        }
        if (reconciliation === undefined) throw error;
      }
      if (reconciliation === undefined) throw new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS');
      if (
        reconciliation === 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED' &&
        (recoveredIntent === null ||
          snapshot.authenticatedFlatNeutralization === undefined ||
          snapshot.authenticatedFlatNeutralization.resyncTimestamp < recoveredIntent.createdAt)
      )
        throw new Error('PRODUCTION_RECONCILIATION_AMBIGUOUS');
      this.recordAuthenticatedFillsForIntent(recovery.intentId, snapshot);
      this.applyOpenOrderReconciliationProvenance(recovery.intentId, reconciliation, snapshot);
      this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
      if (
        this.Journal.getIntent(recovery.intentId)?.action === 'CANCEL' &&
        (reconciliation === 'ORDER_OPEN' || reconciliation === 'PARTIAL_FILL')
      )
        return this.result(
          'RECONCILE_ONLY',
          recovery.intentId,
          'PRODUCTION_RECONCILIATION_CANCEL_FINALITY_PENDING',
          null,
          0,
        );
      // A partial fill with a verified live residual remains an owned OPEN
      // order. Continue through SESSION_UNWIND so the residual can be cancelled;
      // returning RECONCILE_ONLY here forever stranded End Session.
      if (reconciliation !== 'ORDER_OPEN' && reconciliation !== 'PARTIAL_FILL')
        return this.result('RECONCILE_ONLY', recovery.intentId, null, null, 0);
    } else {
      snapshot = await this.readSnapshot();
      // A separate authenticated telemetry reconciler may have terminalized the prior intent.
      // With no non-terminal journal state remaining, the fresh snapshot is sufficient to
      // release only the canary sequencing latch. Unknown submissions remain non-terminal.
      this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
    }
    const terminalIdentityKeys = new Set<string>();
    for (const terminal of snapshot.terminalOrderEvidence ?? []) {
      if (terminal.clientOrderId === null || terminal.clientOrderId === undefined) continue;
      const open = snapshot.input.openOrders.find(
        (candidate) =>
          candidate.venueOrderId === terminal.venueOrderId &&
          candidate.clientOrderId === terminal.clientOrderId,
      );
      if (open === undefined) continue;
      const identityKey = `${terminal.venueOrderId}:${terminal.clientOrderId}`;
      const owner = this.Journal.findPlaceByExactIdentity(
        terminal.venueOrderId,
        terminal.clientOrderId,
      );
      if (owner === null) continue;
      const intent = this.Journal.getIntent(owner.intentId);
      if (intent === null) {
        this.Journal.recordIdentityConflict(owner.intentId, snapshot.input.now);
        return this.result(
          'RECONCILE_ONLY',
          owner.intentId,
          'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
          null,
          0,
        );
      }
      const canonical = resolveDecibelAuthoritativeOrderEvidenceV1({
        identity: {
          market: 'BTC/USD',
          venueOrderId: terminal.venueOrderId,
          clientOrderId: terminal.clientOrderId,
          intentId: owner.intentId,
          side: intent.side,
          originalQuantity: intent.quantity,
        },
        observations: [
          {
            source: 'AUTHENTICATED_OPEN_ORDERS',
            sourceTimestamp: null,
            observedAt: snapshot.input.now,
            market: 'BTC/USD',
            venueOrderId: open.venueOrderId,
            clientOrderId: open.clientOrderId,
            side: open.side,
            originalQuantity: null,
            remainingQuantity: open.quantity,
            terminalStatus: null,
          },
          {
            source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
            sourceTimestamp: null,
            observedAt: snapshot.input.now,
            market: 'BTC/USD',
            venueOrderId: terminal.venueOrderId,
            clientOrderId: terminal.clientOrderId,
            side: intent.side,
            originalQuantity: terminal.originalQuantity,
            remainingQuantity: terminal.remainingQuantity,
            terminalStatus: terminal.state,
          },
        ],
        fills: snapshot.input.actualFillLedger.fills
          .filter((fill) => fill.venueOrderId === terminal.venueOrderId)
          .map((fill) => ({
            source: 'AUTHENTICATED_OWN_FILL_STREAM',
            observedAt: fill.receivedAt.getTime(),
            venueTimestamp: fill.venueTimestamp?.getTime() ?? null,
            market: 'BTC/USD',
            venueOrderId: fill.venueOrderId,
            clientOrderId: terminal.clientOrderId!,
            fillId: fill.venueFillId,
            quantity: fill.executedBaseQuantity,
            price: fill.executedPrice,
          })),
      });
      if (canonical.state === 'CONFLICT') {
        this.Journal.recordIdentityConflict(owner.intentId, snapshot.input.now);
        return this.result(
          'RECONCILE_ONLY',
          owner.intentId,
          'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT',
          null,
          0,
        );
      }
      if (canonical.state === 'PARTIAL_FILL') {
        this.applyOpenOrderReconciliationProvenance(owner.intentId, 'PARTIAL_FILL', snapshot);
        continue;
      }
      if (canonical.state !== 'FULL_FILL' && canonical.state !== 'CANCELLED') continue;
      terminalIdentityKeys.add(identityKey);
      const filled = canonical.state === 'FULL_FILL';
      const priorProvenance = this.Journal.getLatestReconciliationProvenance(owner.intentId);
      this.Journal.applyAuthoritativeReconciliation({
        intentId: owner.intentId,
        reconciliationState: filled ? 'FULL_FILL' : 'CANCELLED_EXTERNALLY',
        terminalStatus: filled ? 'APPLIED' : 'CANCELLED_EXTERNALLY',
        source: 'AUTHENTICATED_TERMINAL_ORDER_HISTORY',
        matchedIdentifier: `venueOrderId:${terminal.venueOrderId}`,
        venueStatus: terminal.state,
        remainingQuantity: terminal.remainingQuantity,
        transactionHash:
          priorProvenance?.transactionHash ??
          this.Journal.getSubmissionTelemetry(owner.intentId)?.transactionHash ??
          null,
        venueOrderId: terminal.venueOrderId,
        clientOrderId: terminal.clientOrderId,
        observedAt: snapshot.input.now,
        fills: canonical.fills.map((fill) => ({
          fillId: fill.fillId,
          quantity: fill.quantity,
          price: fill.price,
          transactionVersion: requireDecibelFillTransactionVersionV1(
            snapshot.input.actualFillLedger.fills.find(
              (candidate) =>
                candidate.venueFillId === fill.fillId &&
                candidate.venueOrderId === terminal.venueOrderId,
            )?.transactionVersion,
          ),
          ...(fill.venueTimestamp === null ? {} : { transactionTimestamp: fill.venueTimestamp }),
        })),
      });
    }
    if (terminalIdentityKeys.size > 0) {
      snapshot = Object.freeze({
        ...snapshot,
        input: Object.freeze({
          ...snapshot.input,
          openOrders: Object.freeze(
            snapshot.input.openOrders.filter(
              (order) =>
                !terminalIdentityKeys.has(`${order.venueOrderId}:${order.clientOrderId ?? ''}`),
            ),
          ),
        }),
        sourceStateHash: hash({
          priorSourceStateHash: snapshot.sourceStateHash,
          terminalOpenOverlapsRemoved: [...terminalIdentityKeys].sort(),
        }),
      });
      this.LatestSnapshot = snapshot;
    }
    this.syncOpenOrderObservations(snapshot);
    for (const openOrder of snapshot.input.openOrders) {
      // A strategy-shaped client ID is not ownership evidence. Recovery must
      // retain an existing durable PLACE identity, never invent one from OPEN.
      // Existing non-terminal ownership continues through the normal reconciliation path.
      // Terminal ownership deliberately falls through to the durable identity boundary below.
      const originalOwner = this.Journal.findPlaceByExactIdentity(
        openOrder.venueOrderId,
        openOrder.clientOrderId,
      );
      if (originalOwner && ['ACKNOWLEDGED', 'RECONCILING'].includes(originalOwner.status)) continue;
      const adopted = buildAdoptedOpenOrderIntent(snapshot, this.cycleSequence, openOrder);
      if (adopted === null)
        return this.result(
          'BLOCKED',
          null,
          'PRODUCTION_CURRENT_ORDER_OWNERSHIP_UNVERIFIED',
          null,
          0,
        );
      const adoption = this.Journal.adoptAuthoritativeOpenOrder({
        intent: adopted,
        venueOrderId: openOrder.venueOrderId,
        observedAt: snapshot.input.now,
        remainingQuantity: openOrder.quantity,
      });
      if (adoption.outcome === 'UNOWNED')
        return this.result(
          'BLOCKED',
          null,
          'PRODUCTION_CURRENT_ORDER_OWNERSHIP_UNVERIFIED',
          null,
          0,
        );
      if (adoption.outcome === 'ALREADY_OWNED' || adoption.outcome === 'STALE_OPEN_IGNORED')
        continue;
      if (adoption.outcome === 'IDENTITY_CONFLICT') {
        const blocker = 'PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT';
        this.Journal.recordIdentityConflict(adoption.intentId, snapshot.input.now);
        return this.result('RECONCILE_ONLY', adoption.intentId, blocker, null, 0);
      }
    }
    snapshot = await this.refreshAuthenticatedPosition(snapshot);
    const inventoryCrossingOrder = findDecibelInventoryCrossingOpenOrderV1(snapshot);
    if (inventoryCrossingOrder !== null)
      this.Journal.recordBlocker(
        null,
        `INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT:${inventoryCrossingOrder.venueOrderId}`,
        snapshot.input.now,
      );
    this.latchAuthenticatedSessionUnwind(snapshot);
    const operationalRegime = this.getOperationalMarketRegime(snapshot);
    let evaluation = this.evaluateAuthenticatedSnapshot(snapshot, operationalRegime);
    this.LatestOperationalRegime = operationalRegime;
    if (evaluation.status === 'FAIL_CLOSED') {
      const blocker = evaluation.blockers[0] ?? 'PRODUCTION_AUTHENTICATED_READ_REQUIRED';
      this.Journal.recordBlocker(null, blocker, snapshot.input.now);
      return this.result(
        'BLOCKED',
        null,
        blocker,
        evaluation,
        0,
        blocker === 'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST'
          ? snapshot.marketScopeDiagnostics
          : undefined,
      );
    }
    evaluation = this.coordinateInventoryExit(snapshot, evaluation);
    if (this.cancelAllRequested && snapshot.input.openOrders.length === 0) {
      this.cancelAllRequested = false;
      return this.result('HOLD', null, null, evaluation, 0);
    }
    if (
      this.sessionUnwindRequested &&
      evaluation.status === 'SESSION_COMPLETE' &&
      snapshot.input.openOrders.length === 0
    ) {
      this.sessionUnwindRequested = false;
      this.sessionUnwindCompleted = true;
      this.paused = true;
      return this.result('HOLD', null, null, evaluation, 0);
    }
    if (
      this.sessionDrainRequested &&
      !this.sessionUnwindRequested &&
      snapshot.input.actualInventoryBase === 0 &&
      snapshot.input.openOrders.length === 0 &&
      this.Journal.nonTerminal().length === 0
    ) {
      this.sessionDrainRequested = false;
      this.sessionUnwindCompleted = true;
      this.paused = true;
      return this.result('HOLD', null, 'SESSION_TARGET_DRAIN_COMPLETE', evaluation, 0);
    }
    if (this.paused && !this.cancelAllRequested)
      return this.result('HOLD', null, 'OPERATOR_PAUSED', evaluation, 0);
    if (
      this.economicWarming &&
      this.HistoricalRecoveryBlocker === null &&
      !this.cancelAllRequested &&
      !this.sessionUnwindRequested &&
      evaluation.operatingState !== 'RISK_REDUCTION'
    )
      return this.result('HOLD', null, this.economicWarming, evaluation, 0);
    const cancellation =
      this.cancelAllRequested || this.sessionUnwindRequested
        ? snapshot.input.openOrders[0]
          ? {
              action: 'WOULD_CANCEL' as const,
              side: snapshot.input.openOrders[0].side,
              current: snapshot.input.openOrders[0],
              desired: null,
              reason: this.sessionUnwindRequested
                ? 'SESSION_UNWIND_CANCEL_OPEN'
                : 'OPERATOR_CANCEL_ALL',
            }
          : null
        : this.selectDrainCancellation(snapshot);
    let selection: decibel_mutation_selection_v1 =
      selectDecibelInventoryCrossingSafetyCancelV1(snapshot) ??
      (cancellation === null
        ? selectMutation(
            evaluation,
            snapshot,
            (venueOrderId) => this.getOrderRestingAgeMs(venueOrderId, snapshot.input.now),
            Math.max(
              this.Config.minimumActiveOrderLifetimeMs,
              operationalRegime.policy.minimumRestingAgeMs,
            ),
            Math.max(this.Config.repriceMinimumTicks, operationalRegime.policy.repriceMinimumTicks),
            this.Config.requoteHysteresisFraction,
            this.cycleSequence % 2 === 1 ? 'BUY' : 'SELL',
            (action, age, ticks) => this.observeTPPrice(action, snapshot, age, ticks),
          )
        : Object.freeze({ action: cancellation, reason: cancellation.reason }));
    let action = selection.action;
    this.DecisionGate = 'selectMutation';
    this.IntendedAction = action;
    this.DecisionSnapshot = snapshot;
    this.SelectedAction = action;
    this.SelectionReason = selection.reason;
    if (action === null)
      return this.result(
        selection.blocker ? 'BLOCKED' : 'HOLD',
        null,
        selection.blocker ??
          (evaluation.operatingState === 'DUST_BELOW_MIN_SIZE' ? 'DUST_BELOW_MIN_SIZE' : null),
        evaluation,
        0,
      );
    if (this.Config.releaseStage === 'DISABLED' || !this.Config.executorEnabled) {
      this.Journal.recordBlocker(null, 'EXECUTION_KILL_SWITCH_ACTIVE', snapshot.input.now);
      return this.result('BLOCKED', null, 'EXECUTION_KILL_SWITCH_ACTIVE', evaluation, 0);
    }
    const current = await this.refreshAuthenticatedPosition(await this.readSnapshot());
    const refreshedInventoryCrossingOrder = findDecibelInventoryCrossingOpenOrderV1(current);
    if (refreshedInventoryCrossingOrder !== null) {
      const isExactSafetyCancel =
        action?.action === 'WOULD_CANCEL' &&
        action.current?.venueOrderId === refreshedInventoryCrossingOrder.venueOrderId &&
        classifyDecibelCancelV1(action) === 'SAFETY_CANCEL';
      if (!isExactSafetyCancel) {
        const blocker = `INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT:${refreshedInventoryCrossingOrder.venueOrderId}`;
        this.Journal.recordBlocker(null, blocker, current.input.now);
        return this.result('BLOCKED', null, blocker, evaluation, 0);
      }
    }
    if (current.sourceStateHash !== snapshot.sourceStateHash) {
      this.latchAuthenticatedSessionUnwind(current);
      const refreshedOperationalRegime = this.getOperationalMarketRegime(current);
      let refreshedEvaluation = this.evaluateAuthenticatedSnapshot(
        current,
        refreshedOperationalRegime,
      );
      this.LatestOperationalRegime = refreshedOperationalRegime;
      if (refreshedEvaluation.status === 'FAIL_CLOSED') {
        const blocker = refreshedEvaluation.blockers[0] ?? 'PRODUCTION_AUTHENTICATED_READ_REQUIRED';
        this.DecisionSnapshot = current;
        this.SelectedAction = null;
        this.SelectionReason = `RECONCILE:${blocker}`;
        this.Journal.recordBlocker(null, blocker, current.input.now);
        return this.result(
          'BLOCKED',
          null,
          blocker,
          refreshedEvaluation,
          0,
          blocker === 'STRATEGY_ACTIVITY_EXCLUSIVITY_LOST'
            ? current.marketScopeDiagnostics
            : undefined,
        );
      }
      refreshedEvaluation = this.coordinateInventoryExit(current, refreshedEvaluation);
      const refreshedCancellation =
        this.cancelAllRequested || this.sessionUnwindRequested
          ? current.input.openOrders[0]
            ? {
                action: 'WOULD_CANCEL' as const,
                side: current.input.openOrders[0].side,
                current: current.input.openOrders[0],
                desired: null,
                reason: this.sessionUnwindRequested
                  ? 'SESSION_UNWIND_CANCEL_OPEN'
                  : 'OPERATOR_CANCEL_ALL',
              }
            : null
          : this.selectDrainCancellation(current);
      snapshot = current;
      this.syncOpenOrderObservations(current);
      evaluation = refreshedEvaluation;
      selection =
        selectDecibelInventoryCrossingSafetyCancelV1(current) ??
        (refreshedCancellation === null
          ? selectMutation(
              refreshedEvaluation,
              current,
              (venueOrderId) => this.getOrderRestingAgeMs(venueOrderId, current.input.now),
              Math.max(
                this.Config.minimumActiveOrderLifetimeMs,
                refreshedOperationalRegime.policy.minimumRestingAgeMs,
              ),
              Math.max(
                this.Config.repriceMinimumTicks,
                refreshedOperationalRegime.policy.repriceMinimumTicks,
              ),
              this.Config.requoteHysteresisFraction,
              this.cycleSequence % 2 === 1 ? 'BUY' : 'SELL',
              (action, age, ticks) => this.observeTPPrice(action, current, age, ticks),
            )
          : Object.freeze({
              action: refreshedCancellation,
              reason: refreshedCancellation.reason,
            }));
      action = selection.action;
      this.DecisionGate = 'selectMutation:refreshed';
      this.IntendedAction = action;
      this.DecisionSnapshot = snapshot;
      this.SelectedAction = action;
      this.SelectionReason = selection.reason;
      if (action === null)
        return this.result(
          selection.blocker ? 'BLOCKED' : 'HOLD',
          null,
          selection.blocker ??
            (refreshedEvaluation.operatingState === 'DUST_BELOW_MIN_SIZE'
              ? 'DUST_BELOW_MIN_SIZE'
              : null),
          refreshedEvaluation,
          0,
        );
    }

    if (this.FrozenReprice !== null && action?.action !== 'WOULD_CANCEL') {
      this.DecisionGate = 'evaluateOnceInternal.frozenReplacement';
      const frozen = this.FrozenReprice;
      const desired = frozen.action.desired;
      const sideEligibleOrder =
        frozen.action.side === 'BUY' ? evaluation.desiredBid : evaluation.desiredAsk;
      // Reconstruct strategic ENTRY and adaptive TP quotes after terminal cancel.
      // Only a committed quantity-only repair retains its authorized old price.
      const entry = frozen.action.current?.reduceOnly === false;
      const replacement =
        entry && sideEligibleOrder && desired
          ? Object.freeze({
              ...sideEligibleOrder,
              quantity: Math.min(
                sideEligibleOrder.quantity,
                desired.quantity,
                frozen.action.current!.quantity,
              ),
            })
          : frozen.action.reason.startsWith('REPRICE:TP_') && sideEligibleOrder
            ? sideEligibleOrder
            : desired;
      const abortReason =
        desired === null || frozen.action.side === null
          ? 'FROZEN_REPLACEMENT_MISSING'
          : snapshot.input.actualInventoryBase !== frozen.positionBase
            ? 'AUTHENTICATED_INVENTORY_CHANGED'
            : frozen.action.current?.reduceOnly === false &&
                replacement !== null &&
                assessDecibelEntryReplacementEconomicsV1({
                  side: replacement.side,
                  restingPrice: frozen.action.current.price,
                  restingQuantity: frozen.action.current.quantity,
                  candidatePrice: replacement.price,
                  candidateQuantity: replacement.quantity,
                  midpoint: (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2,
                  bestBid: snapshot.input.book.bestBid,
                  bestAsk: snapshot.input.book.bestAsk,
                  tickSize: snapshot.input.metadata.tickSize,
                  ...(snapshot.input.book.depth === undefined
                    ? {}
                    : { depth: snapshot.input.book.depth }),
                  bookObservedAt: snapshot.input.book.observedAt,
                  now: snapshot.input.now,
                  maximumBookAgeMs: snapshot.input.maxBboAgeMs,
                  observedPriceMovementBps:
                    this.LatestOperationalRegime?.inputs.realizedVolatilityBps ?? 0,
                  ...entryReplacementStabilityFor(snapshot),
                  makerFeeBps: snapshot.economicInputs?.makerFeeBps ?? null,
                  gasCostUsd: snapshot.economicInputs?.estimatedGasCostUsd ?? null,
                  safetyMarginBps: snapshot.economicInputs?.safetyMarginBps ?? 1,
                }).decision !== 'REPLACE'
              ? 'ENTRY_REPLACEMENT_PRIORITY_NO_LONGER_IMPROVED'
              : frozen.action.reason === 'REPRICE:CANONICAL_RISK_REDUCTION' &&
                  evaluation.operatingState !== 'RISK_REDUCTION'
                ? 'CANONICAL_RISK_REDUCTION_NO_LONGER_REQUIRED'
                : sideEligibleOrder === null
                  ? 'REPLACEMENT_SIDE_NO_LONGER_ELIGIBLE'
                  : !entry &&
                      desired.quantity - sideEligibleOrder.quantity >
                        snapshot.input.metadata.lotSize * 1e-8
                    ? 'REPLACEMENT_QUANTITY_NO_LONGER_VALID'
                    : frozen.action.reason.startsWith('REPRICE:TP_') &&
                        !(
                          replacement &&
                          assessDecibelTPActionV1(
                            snapshot,
                            replacement.side,
                            replacement.quantity,
                            replacement.price,
                          ) === null
                        )
                      ? 'TP_NET_PROFIT_NO_LONGER_PROVEN'
                      : replacement?.side === 'BUY' &&
                          replacement.price >= snapshot.input.book.bestAsk
                        ? 'FROZEN_REPLACEMENT_NOT_PASSIVE'
                        : replacement?.side === 'SELL' &&
                            replacement.price <= snapshot.input.book.bestBid
                          ? 'FROZEN_REPLACEMENT_NOT_PASSIVE'
                          : null;
      if (abortReason !== null) {
        this.RepriceAbortReason = abortReason;
        // Finality/reconciliation have already released the cancelled order.
        // Abort an obsolete strategy commitment; the next cycle may independently
        // admit a new maker without needing to improve on a cancelled price.
        this.FrozenReprice = null;
        this.SelectedAction = null;
        this.SelectionReason = null;
        return this.result('BLOCKED', null, abortReason, evaluation, 0);
      }
      action = Object.freeze({
        action: 'WOULD_PLACE' as const,
        side: frozen.action.side,
        current: null,
        desired: replacement,
        reason: `FROZEN_STRATEGIC_REPRICE:${frozen.decisionId}`,
      });
      this.SelectedAction = action;
      this.IntendedAction = action;
      this.SelectionReason = action.reason;
    }
    this.DecisionSelectedAt = this.getDecisionNow();
    // Capture readiness before an ACK clears the frozen replacement state.
    this.CancelToReplacementReadyMs =
      this.FrozenReprice?.cancelledAt == null || action.action !== 'WOULD_PLACE'
        ? null
        : Math.max(0, Date.now() - this.FrozenReprice.cancelledAt);
    if (
      action.action === 'WOULD_REPLACE' &&
      action.current?.reduceOnly === true &&
      action.desired &&
      action.desired.quantity > action.current.quantity + 1e-12 &&
      !(
        action.reason === 'EXIT_COVERAGE_UPSIZE' &&
        action.desired.price === action.current.price &&
        isDecibelTPCoverageSeverelyUndersizedV1(action.current.quantity, action.desired.quantity)
      ) &&
      evaluation.operatingState !== 'RISK_REDUCTION' &&
      evaluation.operatingState !== 'SESSION_UNWIND' &&
      calculateDecibelExitCoverageV1(snapshot.input).UNCOVERED_INVENTORY_QTY > 0 &&
      evaluateDecibelTPPriceSuitabilityV1(action, snapshot, null, 0, 0)?.TP_REPRICE_DECISION !==
        'REPRICE'
    )
      return this.result(
        'BLOCKED',
        null,
        'TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD',
        evaluation,
        0,
      );
    if (this.isDrainBlockedOpening(action, snapshot))
      return this.result('BLOCKED', null, 'SESSION_TARGET_DRAINING', evaluation, 0);
    const intent = buildIntent(action, evaluation, snapshot, this.cycleSequence);
    if (this.HistoricalRecoveryBlocker !== null) {
      if (action.current?.reduceOnly === true)
        return this.result(
          'BLOCKED',
          null,
          'PROTECTIVE_REPAIR_REQUIRES_VERIFIED_ADDITIVE_OR_ATOMIC_SUPPORT',
          evaluation,
          0,
        );
      try {
        assertDecibelRecoveryIntentV1(this.Journal, intent, snapshot);
      } catch (error) {
        return this.result(
          'BLOCKED',
          null,
          error instanceof Error ? error.message : 'PROTECTIVE_ACTION_UNVERIFIED',
          evaluation,
          0,
        );
      }
      this.ProtectivePlannedPosition = snapshot.input.actualInventoryBase;
    }
    if (action.reason === 'EXIT_COVERAGE_ADD')
      return this.result(
        'BLOCKED',
        null,
        'MULTIPLE_REDUCE_ONLY_CANONICAL_ADMISSION_UNVERIFIED',
        evaluation,
        0,
      );
    // Preserve the frozen resting price only for the committed coverage repair.
    // Historical/restarted or different-price replacements retain the PnL gate.
    const samePriceCoverageReplacement =
      this.getCoveragePrice(snapshot, intent.side)?.price === intent.price ||
      (action.reason.startsWith('FROZEN_STRATEGIC_REPRICE:') &&
        this.FrozenReprice?.action.reason === 'EXIT_COVERAGE_UPSIZE' &&
        this.FrozenReprice.action.current !== null &&
        this.FrozenReprice.action.desired !== null &&
        Math.round(intent.price / snapshot.input.metadata.tickSize) ===
          Math.round(this.FrozenReprice.action.current.price / snapshot.input.metadata.tickSize));
    if (
      intent.action === 'PLACE' &&
      intent.reduceOnly &&
      intent.timeInForce === 'PostOnly' &&
      evaluation.operatingState !== 'RISK_REDUCTION' &&
      evaluation.operatingState !== 'SESSION_UNWIND' &&
      this.Journal.hasTPRepriceCancellation(intent.sessionId, intent.side) &&
      !samePriceCoverageReplacement &&
      assessDecibelTPActionV1(snapshot, intent.side, intent.quantity, intent.price) !== null
    )
      return this.result('BLOCKED', null, 'TP_REPLACEMENT_NET_PROFIT_NOT_PROVEN', evaluation, 0);
    if (intent.action === 'PLACE' && intent.timeInForce === 'PostOnly') {
      this.DecisionGate = 'evaluateTradingDecision.finalPlan';
      const assessment = this.QuoteSizing[intent.side];
      if (assessment !== null)
        this.QuoteSizing[intent.side] = Object.freeze({
          ...assessment,
          finalSizeBtc: intent.quantity,
          finalNotionalUsd: intent.quantity * intent.price,
          bindingConstraint:
            intent.quantity < assessment.finalSizeBtc - 1e-12
              ? snapshot.input.actualInventoryBase === 0
                ? 'FLAT_PAIR_COHORT'
                : 'INVENTORY_REDUCTION_CAP'
              : assessment.bindingConstraint,
        });
    }

    if (intent.action === 'PLACE') {
      this.DecisionGate = 'evaluateOnceInternal.canonicalRecreate';
      const canonicalKey = buildDecibelCanonicalOrderKeyV1({
        ...intent,
        tickSize: snapshot.input.metadata.tickSize,
        lotSize: snapshot.input.metadata.lotSize,
      });
      const lastCancelledKey = intent.reduceOnly
        ? this.LastPolicyCancelledOrderKeyBySide.get(intent.side)
        : undefined;
      if (lastCancelledKey === canonicalKey) {
        this.SelectedAction = null;
        this.SelectionReason = `KEEP:NOOP_RECREATE_AFTER_CANCEL ORDER_KEY=${canonicalKey}`;
        return this.result('BLOCKED', null, this.SelectionReason, evaluation, 0);
      }
      if (lastCancelledKey !== undefined)
        this.LastPolicyCancelledOrderKeyBySide.delete(intent.side);
      this.DecisionGate = 'Journal.findNonTerminalPlaceBySide';
      const sideOwner = this.Journal.findNonTerminalPlaceBySide(intent.side);
      if (sideOwner !== null) {
        this.SelectedAction = null;
        this.SelectionReason = null;
        return this.result(
          'DUPLICATE_SUPPRESSED',
          sideOwner.intentId,
          `SIDE_OCCUPIED_${intent.side}_${sideOwner.status}`,
          evaluation,
          0,
        );
      }
    }
    const submissionPreflight =
      intent.action === 'PLACE'
        ? {
            tickSize: snapshot.input.metadata.tickSize,
            lotSize: snapshot.input.metadata.lotSize,
            minimumSize: snapshot.input.metadata.minimumSize,
            minimumNotionalUsd: snapshot.minimumNotionalUsd,
            maximumNotionalUsd: snapshot.maximumNotionalUsd,
            maximumReductionQuantity: Math.abs(snapshot.input.actualInventoryBase),
            currentPositionBase: snapshot.input.actualInventoryBase,
            openOrders: snapshot.input.openOrders,
            ...(snapshot.maximumAbsPositionBase === undefined
              ? {}
              : { maximumAbsPositionBase: snapshot.maximumAbsPositionBase }),
            permittedSide: intent.side,
            bestBid: snapshot.input.book.bestBid,
            bestAsk: snapshot.input.book.bestAsk,
          }
        : undefined;
    this.DecisionGate = 'Journal.getActiveIdentityConflict';
    const activeIdentityConflict = this.Journal.getActiveIdentityConflict();
    if (
      activeIdentityConflict !== null &&
      !this.UnrelatedRecoveryIntentIds.includes(activeIdentityConflict.intentId) &&
      (intent.action === 'PLACE' ||
        (intent.action === 'CANCEL' &&
          classifyDecibelCancelV1(action) === 'STRATEGIC_REPRICE_CANCEL'))
    ) {
      this.SelectedAction = null;
      this.SelectionReason = null;
      return this.result(
        'RECONCILE_ONLY',
        activeIdentityConflict.intentId,
        activeIdentityConflict.blocker,
        evaluation,
        0,
      );
    }
    if (intent.action === 'PLACE' && intent.timeInForce === 'PostOnly') {
      this.DecisionGate = 'evaluateTradingDecision.finalPlan';
      const decision = this.evaluateDecision(snapshot, evaluation, null, intent);
      const eligible = intent.side === 'BUY' ? decision.bidEligible : decision.askEligible;
      if (decision.state !== 'TRADE' || !eligible) {
        const diagnostics = decision.riskDiagnostics ?? [];
        // Evidence ages change each cycle. Log changes to rules, economic operands
        // or missing evidence, rather than repeating the same rejection forever.
        const signature = JSON.stringify(diagnostics, (key, value: unknown) => {
          if (['evidenceAgeMs', 'observedAt', 'validUntil'].includes(key)) return undefined;
          return typeof value === 'number' && Number.isFinite(value)
            ? Number(value.toPrecision(6))
            : value;
        });
        if (signature !== this.LastRiskDiagnosticSignature)
          for (const diagnostic of diagnostics)
            console.info(
              JSON.stringify({ gate: 'evaluateTradingDecision.finalPlan', ...diagnostic }),
            );
        this.LastRiskDiagnosticSignature = signature;
        const riskBlocker = diagnostics.find(
          (diagnostic) => diagnostic.candidateSide === intent.side,
        )?.blockerCode;
        return this.result(
          'BLOCKED',
          null,
          decision.primaryReason === 'RISK_BLOCKED' && typeof riskBlocker === 'string'
            ? riskBlocker
            : decision.primaryReason,
          evaluation,
          0,
        );
      }
      this.LastRiskDiagnosticSignature = null;
    }
    if (this.Config.dryRun) {
      this.DecisionGate = 'evaluateOnceInternal.dryRun';
      const budgetState = this.Lifecycle.getMutationBudgetState(intent.action, snapshot.input.now);
      if (!budgetState.available)
        return this.result('BLOCKED', null, 'EXECUTION_MUTATION_BUDGET_BLOCKED', evaluation, 0);
      if (intent.action === 'PLACE' && submissionPreflight !== undefined) {
        if (
          this.Journal.countKnownLiveOrders(intent.intentId) >=
          (this.Budget.maxKnownLiveOrders ?? 1)
        )
          return this.result('BLOCKED', null, 'EXECUTION_SINGLE_LIVE_ORDER_BLOCKED', evaluation, 0);
        try {
          validateDecibelPlaceIntentV1(intent, submissionPreflight);
        } catch (error) {
          return this.result(
            'BLOCKED',
            null,
            error instanceof Error ? error.message : 'EXECUTION_PREFLIGHT_REJECTED',
            evaluation,
            0,
          );
        }
      }
      const prepared = this.Journal.prepare(intent);
      if (!prepared.duplicate) {
        this.Journal.recordBlocker(
          intent.intentId,
          'PRODUCTION_DRY_RUN_MUTATION_BLOCKED',
          snapshot.input.now,
        );
        this.Journal.transition(intent.intentId, 'SUPERSEDED', snapshot.input.now);
      }
      return this.result(
        prepared.duplicate ? 'DUPLICATE_SUPPRESSED' : 'DRY_RUN_PREPARED',
        intent.intentId,
        null,
        evaluation,
        0,
      );
    }
    if (intent.action === 'CANCEL' && this.Source.revalidateCancelTarget !== undefined) {
      this.DecisionGate = 'Source.revalidateCancelTarget';
      const cancelTargetState = await this.Source.revalidateCancelTarget(intent);
      if (cancelTargetState !== 'ORDER_OPEN') {
        this.RepriceAbortReason = `CANCEL_TARGET_${cancelTargetState}`;
        this.SelectedAction = null;
        this.SelectionReason = null;
        if (cancelTargetState === 'UNRESOLVED')
          return this.result(
            'RECONCILE_ONLY',
            null,
            'PRODUCTION_PRE_CANCEL_REVALIDATION_AMBIGUOUS',
            evaluation,
            0,
          );
        const targetIntent = this.Journal.findNonTerminalByVenueOrderId(
          intent.expectedPreviousVenueOrderId,
        );
        if (targetIntent !== null) {
          // The pre-cancel read proves that the target is no longer OPEN, but
          // its state enum alone does not carry identity-specific provenance.
          // Re-read through the canonical resolver and atomically publish the
          // resulting evidence. The former Lifecycle.reconcile shortcut wrote
          // APPLIED without terminal provenance; a delayed OPEN projection then
          // looked like a genuine identity contradiction.
          const canonicalSnapshot = await this.readSnapshot();
          const targetBody = this.Journal.getIntent(targetIntent.intentId);
          if (targetBody === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
          const canonicalState = await this.Source.reconcileIntent(
            targetIntent.intentId,
            canonicalSnapshot,
            targetIntent.venueOrderId,
            this.getReconciliationIdentity(targetIntent.intentId),
          );
          if (canonicalState === 'ORDER_OPEN')
            return this.result(
              'RECONCILE_ONLY',
              targetIntent.intentId,
              'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING',
              evaluation,
              0,
            );
          this.recordAuthenticatedFillsForIntent(targetIntent.intentId, canonicalSnapshot);
          this.applyOpenOrderReconciliationProvenance(
            targetIntent.intentId,
            canonicalState,
            canonicalSnapshot,
          );
          this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
        }
        return this.result(
          'RECONCILE_ONLY',
          targetIntent?.intentId ?? null,
          'CANCEL_SUPPRESSED_TARGET_TERMINAL',
          evaluation,
          0,
        );
      }
    }
    if (
      intent.action === 'CANCEL' &&
      classifyDecibelCancelV1(action) === 'STRATEGIC_REPRICE_CANCEL'
    ) {
      // A direct cancel-target read can itself consume the market/account TTL.
      // Do not destroy queue priority using a plan that expired while awaiting it.
      const commitNow = this.Config.dryRun ? snapshot.input.now : this.getDecisionNow();
      const practical = snapshot.practicalCapacityInputs;
      const reducingReplacement =
        action.current?.reduceOnly === true &&
        action.desired !== null &&
        action.desired.quantity > 0 &&
        action.desired.quantity <= Math.abs(snapshot.input.actualInventoryBase) &&
        ((snapshot.input.actualInventoryBase > 0 && action.desired.side === 'SELL') ||
          (snapshot.input.actualInventoryBase < 0 && action.desired.side === 'BUY'));
      const fresh = (at: number) =>
        at <= commitNow && practical !== undefined && commitNow - at <= practical.maximumAgeMs;
      if (
        !this.isAuthenticatedSnapshotFresh(snapshot, commitNow) ||
        (snapshot.capacityModelRequired &&
          !reducingReplacement &&
          (!practical ||
            !fresh(practical.accountObservedAt) ||
            !fresh(practical.marketObservedAt) ||
            !practical.venueMarginRules ||
            !fresh(practical.venueMarginRules.observedAt) ||
            !fresh(practical.venueMarginRules.markObservedAt)))
      ) {
        this.RepriceAbortReason = 'STRATEGIC_REPRICE_EVIDENCE_STALE';
        return this.result(
          'RECONCILE_ONLY',
          null,
          'STRATEGIC_REPRICE_EVIDENCE_STALE',
          evaluation,
          0,
        );
      }
      this.DecisionGate = 'evaluateDecibelReplacementDecisionV1.commit';
      const revalidated = evaluateDecibelReplacementDecisionV1(
        action,
        snapshot,
        this.getOrderRestingAgeMs(intent.expectedPreviousVenueOrderId, snapshot.input.now),
        Math.max(
          this.Config.minimumActiveOrderLifetimeMs,
          this.LatestOperationalRegime?.policy.minimumRestingAgeMs ?? 0,
        ),
        Math.max(
          this.Config.repriceMinimumTicks,
          this.LatestOperationalRegime?.policy.repriceMinimumTicks ?? 0,
        ),
        evaluation.operatingState === 'RISK_REDUCTION' ||
          evaluation.operatingState === 'SESSION_UNWIND',
        this.observeTPPrice(
          action,
          snapshot,
          Math.max(
            this.Config.minimumActiveOrderLifetimeMs,
            this.LatestOperationalRegime?.policy.minimumRestingAgeMs ?? 0,
          ),
          Math.max(
            this.Config.repriceMinimumTicks,
            this.LatestOperationalRegime?.policy.repriceMinimumTicks ?? 0,
          ),
        ),
        evaluation,
      );
      const owned = this.Journal.findNonTerminalByVenueOrderId(intent.expectedPreviousVenueOrderId);
      if (
        revalidated === null ||
        !revalidated.cancel ||
        owned === null ||
        action.desired === null
      ) {
        this.RepriceAbortReason =
          owned === null
            ? 'RESTING_ORDER_NOT_OWNED'
            : (revalidated?.reason ?? 'COMMIT_REVALIDATION_FAILED');
        this.SelectedAction = null;
        this.SelectionReason = null;
        return this.result('BLOCKED', null, this.RepriceAbortReason, evaluation, 0);
      }
      const decisionId = `reprice-${hash({
        cycleSequence: this.cycleSequence,
        sourceStateHash: snapshot.sourceStateHash,
        current: action.current,
        desired: action.desired,
      }).slice(0, 24)}`;
      this.RepriceDecisionId = decisionId;
      this.RepriceCommitSnapshotId = snapshot.sourceStateHash;
      this.RepriceOldPrice = action.current?.price ?? null;
      this.FrozenReplacementPrice = action.desired.price;
      this.RepriceImprovementTicks = revalidated.priceDriftTicks;
      this.FrozenReprice = {
        decisionId,
        commitSnapshotId: snapshot.sourceStateHash,
        committedAt: snapshot.input.now,
        cancelledAt: null,
        positionBase: snapshot.input.actualInventoryBase,
        action: Object.freeze({ ...action, desired: Object.freeze({ ...action.desired }) }),
      };
    }
    let outcome;
    const cancelledPolicyOrderKey =
      intent.action === 'CANCEL' &&
      (action.reason.startsWith('REPRICE:') || action.reason.startsWith('UNSAFE:')) &&
      action.current?.reduceOnly === true
        ? buildDecibelCanonicalOrderKeyV1({
            ...action.current,
            tickSize: snapshot.input.metadata.tickSize,
            lotSize: snapshot.input.metadata.lotSize,
            reduceOnly: action.current.reduceOnly === true,
          })
        : null;
    try {
      outcome = await this.Lifecycle.submit(intent, {
        now: snapshot.input.now,
        ...(submissionPreflight === undefined ? {} : { preflight: submissionPreflight }),
      });
    } catch (error) {
      if (
        intent.action === 'CANCEL' &&
        classifyDecibelCancelV1(action) === 'STRATEGIC_REPRICE_CANCEL'
      )
        this.FrozenReprice = null;
      if (error instanceof Error && error.message === 'EXECUTION_MUTATION_BUDGET_BLOCKED') {
        const budgetState = this.Lifecycle.getMutationBudgetState(
          intent.action,
          snapshot.input.now,
        );
        if (budgetState.reason === 'UNKNOWN_OUTCOME_LIMIT') {
          const unresolved = this.Journal.nonTerminal()[0] ?? null;
          return this.result(
            'RECONCILE_ONLY',
            unresolved?.intentId ?? null,
            unresolved === null
              ? 'EXECUTION_UNKNOWN_OUTCOME_RECONCILIATION_REQUIRED'
              : 'EXECUTION_SUBMISSION_EXCEPTION_OUTCOME_UNKNOWN',
            evaluation,
            0,
          );
        }
        this.mutationBudgetCooldownUntil =
          budgetState.nextAvailableAt ?? snapshot.input.now + 1_000;
        return this.result('BLOCKED', null, 'EXECUTION_MUTATION_BUDGET_BLOCKED', evaluation, 0);
      }
      if (
        error instanceof execution_preflight_rejection_v1 &&
        error.rejectionCode === 'SESSION_TARGET_OR_UNWIND_PLACE_BLOCKED' &&
        !this.sessionUnwindRequested
      )
        this.requestSessionDrain();
      if (error instanceof execution_preflight_rejection_v1)
        return this.result('BLOCKED', null, error.rejectionCode, evaluation, 0);
      const persisted = this.Journal.get(intent.intentId);
      // Validation runs before submission is claimed. A failed authenticated
      // refresh here has no pending venue identity and must not invent one.
      if (persisted === null || persisted.status === 'PREPARED')
        return this.result(
          'BLOCKED',
          persisted?.intentId ?? null,
          error instanceof Error ? error.message : 'EXECUTION_VALIDATION_FAILED',
          evaluation,
          0,
        );
      if (persisted?.status === 'REJECTED')
        return this.result(
          'BLOCKED',
          intent.intentId,
          error instanceof execution_preflight_rejection_v1
            ? error.rejectionCode
            : error instanceof Error
              ? error.message
              : 'EXECUTION_PREFLIGHT_REJECTED',
          evaluation,
          0,
        );
      await this.reconcileAfterMutation(intent.intentId);
      return this.result(
        'RECONCILE_ONLY',
        intent.intentId,
        'EXECUTION_SUBMISSION_EXCEPTION_OUTCOME_UNKNOWN',
        evaluation,
        1,
      );
    }
    if (outcome.status === 'DUPLICATE_SUPPRESSED') {
      if (intent.action === 'CANCEL') this.FrozenReprice = null;
      this.SelectedAction = null;
      this.SelectionReason = null;
    } else if (
      intent.action === 'CANCEL' &&
      classifyDecibelCancelV1(action) === 'STRATEGIC_REPRICE_CANCEL' &&
      this.FrozenReprice !== null
    ) {
      this.FrozenReprice.cancelledAt = Date.now();
    } else if (
      intent.action === 'PLACE' &&
      this.FrozenReprice !== null &&
      action.reason.startsWith('FROZEN_STRATEGIC_REPRICE:')
    ) {
      this.CancelToReplacementAckMs = Math.max(
        0,
        Date.now() - (this.FrozenReprice.cancelledAt ?? this.FrozenReprice.committedAt),
      );
      if (
        this.FrozenReprice.action.reason.startsWith('REPRICE:TP_') &&
        outcome.status === 'ACKNOWLEDGED'
      )
        this.LastTPRepriceAt.set(intent.side, snapshot.input.now);
      this.FrozenReprice = null;
    }
    if (cancelledPolicyOrderKey !== null && outcome.status !== 'DUPLICATE_SUPPRESSED')
      this.LastPolicyCancelledOrderKeyBySide.set(intent.side, cancelledPolicyOrderKey);
    if (
      intent.action === 'PLACE' &&
      outcome.status !== 'DUPLICATE_SUPPRESSED' &&
      snapshot.input.actualInventoryBase === 0
    )
      this.FlatPairCohort?.issuedSides.add(intent.side);
    // A suppressed candidate may never have been persisted. Reconcile the actual
    // journal owner returned by claimForSubmission, never the discarded candidate.
    await this.reconcileAfterMutation(outcome.intentId);
    const duplicateBlocker =
      outcome.status === 'DUPLICATE_SUPPRESSED'
        ? (this.Journal.getExecutionReconciliationBlocker() ??
          'EXECUTION_DUPLICATE_OWNER_RECONCILIATION_REQUIRED')
        : null;
    return this.result(
      outcome.status,
      outcome.intentId,
      'blocker' in outcome ? (outcome.blocker ?? null) : duplicateBlocker,
      evaluation,
      outcome.status === 'DUPLICATE_SUPPRESSED' ? 0 : 1,
    );
  }

  private getReconciliationIdentity(intentId: string) {
    const body = this.Journal.getIntent(intentId);
    if (body === null) return undefined;
    const telemetry = this.Journal.getSubmissionTelemetry(intentId);
    if (body.action === 'PLACE')
      return {
        clientOrderId: body.clientOrderId,
        createdAt: body.createdAt,
        transactionHash: telemetry?.transactionHash ?? null,
        requestedQuantity: body.quantity,
        side: body.side,
      };
    // CANCEL.quantity is the observed residual, not the submitted order size.
    // Use the durable PLACE identity even after it has become terminal.
    const persisted = this.Journal.get(intentId);
    const owners = this.Journal.getOrderLineageByVenueOrderId(body.expectedPreviousVenueOrderId)
      .map((row) => this.Journal.getIntent(row.intentId))
      .filter((owner) => owner?.action === 'PLACE');
    if (
      owners.length > 1 ||
      (persisted?.venueOrderId != null &&
        persisted.venueOrderId !== body.expectedPreviousVenueOrderId)
    )
      throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
    const owner = owners[0];
    if (
      owner &&
      (owner.clientOrderId !== body.clientOrderId ||
        owner.side !== body.side ||
        owner.market !== body.market ||
        body.quantity > owner.quantity + 1e-12)
    )
      throw new Error('PRODUCTION_RECONCILIATION_ORDER_IDENTITY_CONFLICT');
    return {
      clientOrderId: body.clientOrderId,
      createdAt: owner?.createdAt ?? body.createdAt,
      transactionHash: telemetry?.transactionHash ?? null,
      side: body.side,
      // With no local PLACE, require the source's authenticated original-size
      // evidence; never substitute the cancellation residual as original size.
      ...(owner ? { requestedQuantity: owner.quantity } : {}),
    };
  }

  private async reconcileAfterMutation(intentId: string): Promise<void> {
    if (this.Source.readAuthenticatedSnapshotAfterMutation === undefined) return;
    const persisted = this.Journal.get(intentId);
    if (persisted === null || persisted.status === 'REJECTED' || persisted.status === 'SUPERSEDED')
      return;
    try {
      const snapshot = await this.readSnapshot(true);
      reconcileDecibelAcknowledgedTerminalOrdersV1(this.Journal, snapshot);
      if (!this.Journal.nonTerminal().some((row) => row.intentId === intentId)) {
        this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
        this.syncOpenOrderObservations(snapshot);
        return;
      }
      const reconciliation = await this.Source.reconcileIntent(
        intentId,
        snapshot,
        persisted.venueOrderId,
        this.getReconciliationIdentity(intentId),
      );
      this.recordAuthenticatedFillsForIntent(intentId, snapshot);
      this.applyOpenOrderReconciliationProvenance(intentId, reconciliation, snapshot);
      this.ExecutorGate.acknowledgeAuthenticatedReconciliation();
      this.syncOpenOrderObservations(snapshot);
    } catch (error) {
      if (
        getErrorChain(error).some(
          (candidate) =>
            candidate instanceof Error &&
            candidate.message === 'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
        )
      ) {
        // A committed transaction is not OPEN evidence. Keep the durable claim
        // and executor latch; subsequent fresh reads must resolve the identity.
        const current = this.Journal.get(intentId);
        if (
          !current ||
          ![
            'ACKNOWLEDGED',
            'RECONCILING',
            'SUBMITTING',
            'SUBMIT_UNKNOWN',
            'UNRESOLVABLE_ACK',
          ].includes(current.status)
        )
          return;
        this.Journal.transition(intentId, 'RECONCILING', Date.now());
        this.Journal.recordBlocker(
          intentId,
          'PRODUCTION_ACK_AUTHORITATIVE_VISIBILITY_PENDING',
          Date.now(),
        );
        return;
      }
      const unresolvable = getErrorChain(error).some(
        (candidate) =>
          candidate instanceof Error &&
          candidate.message === 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK',
      );
      if (
        unresolvable &&
        ['ACKNOWLEDGED', 'RECONCILING'].includes(this.Journal.get(intentId)?.status ?? '')
      )
        this.Journal.markUnresolvableAcknowledgement(intentId, Date.now());
      if (
        getErrorChain(error).some(
          (candidate) =>
            candidate instanceof Error &&
            (candidate.message === 'PRODUCTION_RECONCILIATION_AMBIGUOUS' ||
              candidate.message === 'PRODUCTION_RECONCILIATION_CONFIRMATION_PENDING' ||
              candidate.message === 'PRODUCTION_RECONCILIATION_UNRESOLVABLE_ACK'),
        )
      )
        return;
      throw error;
    }
  }

  private applyOpenOrderReconciliationProvenance(
    intentId: string,
    reconciliation: reconciliation_state_v1,
    snapshot: decibel_production_live_snapshot_v1,
  ): void {
    if (reconciliation !== 'ORDER_OPEN') {
      const persisted = this.Journal.get(intentId);
      const body = this.Journal.getIntent(intentId);
      if (persisted === null || body === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
      const terminal = snapshot.terminalOrderEvidence?.find(
        (candidate) =>
          candidate.venueOrderId === persisted.venueOrderId &&
          (candidate.clientOrderId == null || candidate.clientOrderId === body.clientOrderId),
      );
      const open = snapshot.input.openOrders.find(
        (candidate) =>
          candidate.venueOrderId === persisted.venueOrderId &&
          candidate.clientOrderId === body.clientOrderId,
      );
      const terminalStatus =
        reconciliation === 'PARTIAL_FILL' && open !== undefined
          ? ('ACKNOWLEDGED' as const)
          : reconciliation === 'CANCELLED_EXTERNALLY' || reconciliation === 'ORDER_CANCELLED'
            ? ('CANCELLED_EXTERNALLY' as const)
            : reconciliation === 'EXTERNALLY_NEUTRALIZED' ||
                reconciliation === 'AUTHENTICATED_FLAT_CHECKPOINT_NEUTRALIZED'
              ? ('EXTERNALLY_NEUTRALIZED' as const)
              : ('APPLIED' as const);
      this.Journal.applyAuthoritativeReconciliation({
        intentId,
        reconciliationState: reconciliation,
        terminalStatus,
        source:
          reconciliation === 'PARTIAL_FILL'
            ? 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION'
            : terminal !== undefined
              ? 'AUTHENTICATED_TERMINAL_ORDER_HISTORY'
              : 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION',
        matchedIdentifier:
          persisted.venueOrderId === null
            ? `clientOrderId:${body.clientOrderId}`
            : `venueOrderId:${persisted.venueOrderId}`,
        venueStatus:
          reconciliation === 'FULL_FILL'
            ? 'FILLED'
            : reconciliation === 'PARTIAL_FILL'
              ? 'PARTIAL_FILL'
              : (terminal?.state ?? reconciliation),
        remainingQuantity:
          reconciliation === 'FULL_FILL'
            ? 0
            : reconciliation === 'PARTIAL_FILL'
              ? (open?.quantity ?? terminal?.remainingQuantity ?? null)
              : (terminal?.remainingQuantity ?? open?.quantity ?? null),
        transactionHash: this.Journal.getSubmissionTelemetry(intentId)?.transactionHash ?? null,
        venueOrderId: terminal?.venueOrderId ?? open?.venueOrderId ?? persisted.venueOrderId,
        clientOrderId: terminal?.clientOrderId ?? open?.clientOrderId ?? body.clientOrderId,
        observedAt: snapshot.input.now,
        fills: snapshot.input.actualFillLedger.fills
          .filter((fill) => body.action === 'PLACE' && fill.venueOrderId === persisted.venueOrderId)
          .map((fill) => ({
            fillId: fill.venueFillId,
            quantity: fill.executedBaseQuantity,
            price: fill.executedPrice,
            transactionVersion: requireDecibelFillTransactionVersionV1(fill.transactionVersion),
            ...(fill.venueTimestamp === null
              ? {}
              : { transactionTimestamp: fill.venueTimestamp.getTime() }),
          })),
        decision: {
          reason:
            reconciliation === 'FULL_FILL'
              ? 'TERMINAL_FILL_CONFIRMED'
              : reconciliation === 'PARTIAL_FILL'
                ? 'PARTIAL_FILL_CONFIRMED'
                : 'TERMINAL_CANCEL_CONFIRMED',
          evidenceAgeMs: 0,
          nextAction: 'APPLY',
        },
      });
      this.mutationBudgetCooldownUntil = 0;
      return;
    }
    const persisted = this.Journal.get(intentId);
    const body = this.Journal.getIntent(intentId);
    if (persisted === null || body === null) throw new Error('EXECUTION_INTENT_NOT_FOUND');
    const openOrder = snapshot.input.openOrders.find(
      (order) =>
        order.venueOrderId === persisted.venueOrderId || order.clientOrderId === body.clientOrderId,
    );
    this.Journal.applyAuthoritativeReconciliation({
      intentId,
      reconciliationState: 'ORDER_OPEN',
      terminalStatus: 'ACKNOWLEDGED',
      source:
        openOrder === undefined
          ? 'AUTHENTICATED_ORDER_FILL_TX_RECONCILIATION'
          : 'AUTHENTICATED_OPEN_ORDERS',
      matchedIdentifier:
        openOrder === undefined
          ? persisted.venueOrderId === null
            ? `clientOrderId:${body.clientOrderId}`
            : `venueOrderId:${persisted.venueOrderId}`
          : openOrder.venueOrderId === persisted.venueOrderId
            ? `venueOrderId:${openOrder.venueOrderId}`
            : `clientOrderId:${openOrder.clientOrderId}`,
      venueStatus: 'OPEN',
      remainingQuantity: openOrder?.quantity ?? null,
      transactionHash: this.Journal.getSubmissionTelemetry(intentId)?.transactionHash ?? null,
      venueOrderId: openOrder?.venueOrderId ?? persisted.venueOrderId,
      clientOrderId: openOrder?.clientOrderId ?? body.clientOrderId,
      observedAt: snapshot.input.now,
    });
    this.Lifecycle.acknowledgeAuthoritativeReconciliation();
    this.mutationBudgetCooldownUntil = 0;
  }

  public async close(): Promise<void> {
    await this.Source.close?.();
    this.Journal.close();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public setEconomicWarming(
    warming: boolean,
    reason = 'PRODUCTION_ECONOMIC_INITIALIZATION_REQUIRED',
  ): void {
    this.economicWarming = warming ? reason : null;
  }

  public isEconomicWarming(): boolean {
    return this.economicWarming !== null;
  }

  public requestCancelAll(): void {
    this.paused = true;
    this.cancelAllRequested = true;
  }

  public requestSessionUnwind(): void {
    this.paused = false;
    this.sessionUnwindCompleted = false;
    this.sessionUnwindRequested = true;
    // An explicit unwind (operator END, Max Loss) overrides a target drain.
    this.sessionDrainRequested = false;
  }

  /** Target reached: stop new exposure, keep reduce-only TP, complete when flat. */
  public requestSessionDrain(): void {
    if (this.sessionUnwindRequested) return;
    this.paused = false;
    this.sessionUnwindCompleted = false;
    this.sessionDrainRequested = true;
  }

  public isSessionDraining(): boolean {
    return this.sessionDrainRequested && !this.sessionUnwindRequested;
  }

  private selectDrainCancellation(snapshot: decibel_production_live_snapshot_v1) {
    if (!this.isSessionDraining()) return null;
    const entry = snapshot.input.openOrders.find((order) => order.reduceOnly !== true);
    return entry
      ? {
          action: 'WOULD_CANCEL' as const,
          side: entry.side,
          current: entry,
          desired: null,
          reason: 'SESSION_TARGET_DRAIN_CANCEL_ENTRY',
        }
      : null;
  }

  /** While draining, any action that would open or grow exposure is refused. */
  private isDrainBlockedOpening(
    action: decibel_recycling_action_v1,
    snapshot: decibel_production_live_snapshot_v1,
  ): boolean {
    if (!this.isSessionDraining()) return false;
    if (action.action !== 'WOULD_PLACE' && action.action !== 'WOULD_REPLACE') return false;
    const desired = action.desired;
    if (desired === null) return false;
    const inventory = snapshot.input.actualInventoryBase;
    return inventory === 0 || (inventory > 0 ? desired.side === 'BUY' : desired.side === 'SELL');
  }

  public abortSessionUnwind(): void {
    this.sessionUnwindRequested = false;
    this.sessionUnwindCompleted = false;
  }

  public isSessionUnwindComplete(): boolean {
    return (
      this.sessionUnwindCompleted &&
      !this.sessionUnwindRequested &&
      (this.LatestSnapshot?.input.actualInventoryBase ?? Number.NaN) === 0 &&
      (this.LatestSnapshot?.input.openOrders.length ?? 0) === 0 &&
      this.Journal.nonTerminal().length === 0
    );
  }

  public requestRiskReduction(required = true): void {
    this.riskReductionRequested = required;
  }

  public isCancelAllComplete(): boolean {
    return !this.cancelAllRequested && (this.LatestSnapshot?.input.openOrders.length ?? 0) === 0;
  }

  public getTradingDecision(): trading_decision_v1 | null {
    return this.LatestTradingDecision;
  }

  public getLatestSnapshot(): decibel_production_live_snapshot_v1 | null {
    return this.LatestSnapshot;
  }

  private latchAuthenticatedSessionUnwind(snapshot: decibel_production_live_snapshot_v1): void {
    const target =
      snapshot.sessionConfiguration?.targetMakerVolumeUsd ??
      snapshot.input.targetExternalMakerVolumeUsd;
    if (target === null || target <= 0) return;
    const baseline = snapshot.input.targetExternalMakerVolumeBaselineUsd ?? 0;
    const configuration = snapshot.sessionConfiguration;
    const authenticatedSessionMakerVolume =
      configuration !== undefined
        ? configuration.totalExecutedVolumeUsd
        : Math.max(0, snapshot.input.actualFillLedger.actualExternalMakerVolumeUsd - baseline);
    if (
      authenticatedSessionMakerVolume === undefined ||
      !Number.isFinite(authenticatedSessionMakerVolume)
    )
      throw new Error('SESSION_EXECUTED_VOLUME_EVIDENCE_REQUIRED');
    if (getDecibelSessionTargetTerminalReasonV1(target, authenticatedSessionMakerVolume) !== null) {
      this.requestSessionDrain();
    }
  }

  private recordAuthenticatedFillsForIntent(
    intentId: string,
    snapshot: decibel_production_live_snapshot_v1,
  ): void {
    if (snapshot.sessionConfiguration !== undefined) {
      synchronizeDecibelSessionAccountingV1(
        this.Journal,
        snapshot.input.actualFillLedger,
        snapshot.input.sessionId,
        (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2,
      );
      return;
    }
    const venueOrderId = this.Journal.get(intentId)?.venueOrderId;
    if (venueOrderId === null || venueOrderId === undefined) return;
    const owner = this.Journal.getOrderLineageByVenueOrderId(venueOrderId)
      .map((row) => this.Journal.getIntent(row.intentId))
      .find((body) => body?.action === 'PLACE');
    for (const fill of snapshot.input.actualFillLedger.fills.filter(
      (candidate) => candidate.venueOrderId === venueOrderId,
    )) {
      this.Journal.applyFill({
        fillId: fill.venueFillId,
        intentId: owner?.intentId ?? intentId,
        side: fill.side,
        quantity: fill.executedBaseQuantity,
        price: fill.executedPrice,
        strategyLineage: true,
        makerProven:
          fill.makerOrTaker === 'MAKER' &&
          owner?.action === 'PLACE' &&
          owner.postOnly &&
          owner.timeInForce === 'PostOnly',
        externalCounterparty: true,
        observedAt: (fill.venueTimestamp ?? fill.receivedAt).getTime(),
      });
    }
  }

  /**
   * While flat shortly after an exit fill in this session, the next entry rests at least the
   * volatility-scaled re-entry distance away from that exit price.
   */
  private getReentryPriceLimits(
    snapshot: decibel_production_live_snapshot_v1,
  ): Readonly<{ BUY: number; SELL: number }> | null {
    if (snapshot.input.actualInventoryBase !== 0) return null;
    const at = (fill: (typeof snapshot.input.actualFillLedger.fills)[number]) =>
      new Date(fill.venueTimestamp ?? fill.receivedAt).getTime();
    let last: (typeof snapshot.input.actualFillLedger.fills)[number] | null = null;
    for (const fill of snapshot.input.actualFillLedger.fills)
      if (last === null || at(fill) > at(last)) last = fill;
    if (last === null || !(last.executedPrice > 0)) return null;
    // The anti-chase distance only holds shortly after the exit; later the market has moved.
    if (snapshot.input.now - at(last) > DECIBEL_STRATEGY_POLICY_V1.entry.reentryExpiryMs)
      return null;
    const owner = this.Journal.findPlaceByExactIdentity(
      last.venueOrderId,
      last.localExecutionRequestId,
    );
    if (!owner || this.Journal.getIntent(owner.intentId)?.sessionId !== snapshot.input.sessionId)
      return null;
    const distanceBps = getDecibelReentryDistanceBpsV1(snapshot.priceRangeBps);
    const tick = snapshot.input.metadata.tickSize;
    return {
      BUY: getDecibelReentryPriceLimitV1('BUY', last.executedPrice, distanceBps, tick),
      SELL: getDecibelReentryPriceLimitV1('SELL', last.executedPrice, distanceBps, tick),
    };
  }

  private withPriceRange(
    snapshot: decibel_production_live_snapshot_v1,
  ): decibel_production_live_snapshot_v1 {
    const now = snapshot.input.now;
    const structure = buildDecibelMarketStructureV1({
      exchangeCandles: this.ExchangeCandles,
      bboSamples: this.MidpointHistory,
      now,
    });
    return {
      ...snapshot,
      priceRangeBps: calculateDecibelMidpointRangeBpsV1(structure.samples, now),
      executionGasBlocker: getDecibelGasEntryBlockerV1(this.GasBalanceApt),
      entryCandleBlockers:
        this.Config.entryCandleFilterEnabled && snapshot.input.actualInventoryBase === 0
          ? Object.freeze({
              BUY: getDecibelEntryCandleBlockerV1('BUY', structure.closedCandles),
              SELL: getDecibelEntryCandleBlockerV1('SELL', structure.closedCandles),
            })
          : null,
      marketStructure: structure,
    };
  }

  private getOperationalMarketRegime(
    snapshot: decibel_production_live_snapshot_v1,
  ): decibel_market_regime_result_v1 {
    const midpoint = (snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2;
    const cutoff = snapshot.input.now - this.Config.volatilityLookbackMs;
    this.MidpointHistory.push({
      at: snapshot.input.now,
      midpoint,
      bestBid: snapshot.input.book.bestBid,
      bestAsk: snapshot.input.book.bestAsk,
      bestBidSize: snapshot.input.book.bestBidSize ?? null,
      bestAskSize: snapshot.input.book.bestAskSize ?? null,
      microprice: snapshot.input.book.microprice ?? null,
      topBookImbalance: snapshot.input.book.topBookImbalance ?? null,
      recentTradeIntensity: snapshot.input.book.recentTradeIntensity ?? null,
    });
    while (this.MidpointHistory[0] !== undefined && this.MidpointHistory[0].at < cutoff)
      this.MidpointHistory.shift();
    this.MarketRegimeState = this.MidpointHistory.length >= 2 ? 'READY' : 'WARMING';
    return classifyDecibelOperationalMarketRegimeV1(
      this.MidpointHistory,
      snapshot.input.actualInventoryBase,
    );
  }

  /** Production uses the inventory-neutral admission policy: no regime edge model, only
   * the operational regime's readiness. */
  private getRegimeAdmissionInputs() {
    const regime =
      this.MarketRegimeState === 'READY' && this.LatestOperationalRegime !== null
        ? this.LatestOperationalRegime.regime
        : ('WARMING' as const);
    const eligible = !this.EnforceMarketRegimeReadiness || this.MarketRegimeState === 'READY';
    return Object.freeze({
      regime,
      bid: Object.freeze({
        eligible,
        reason: eligible ? 'OPERATIONAL_REGIME_READY' : 'MARKET_REGIME_WARMING',
        distanceBps: null,
        adverseSelectionBps: null,
        sampleCount: 0,
      }),
      ask: Object.freeze({
        eligible,
        reason: eligible ? 'OPERATIONAL_REGIME_READY' : 'MARKET_REGIME_WARMING',
        distanceBps: null,
        adverseSelectionBps: null,
        sampleCount: 0,
      }),
    });
  }

  private syncOpenOrderObservations(snapshot: decibel_production_live_snapshot_v1): void {
    const activeIds = new Set(snapshot.input.openOrders.map((order) => order.venueOrderId));
    for (const venueOrderId of activeIds) {
      if (!this.OpenOrderFirstObservedAt.has(venueOrderId))
        this.OpenOrderFirstObservedAt.set(venueOrderId, snapshot.input.now);
    }
    for (const id of this.TPSuitabilityWindows.keys())
      if (!activeIds.has(id)) this.TPSuitabilityWindows.delete(id);
    for (const venueOrderId of this.OpenOrderFirstObservedAt.keys()) {
      if (!activeIds.has(venueOrderId)) this.OpenOrderFirstObservedAt.delete(venueOrderId);
    }
  }

  private getOrderRestingAgeMs(venueOrderId: string, now: number): number | null {
    const firstObservedAt = this.OpenOrderFirstObservedAt.get(venueOrderId);
    return firstObservedAt === undefined ? null : Math.max(0, now - firstObservedAt);
  }

  private async refreshAuthenticatedPosition(
    snapshot: decibel_production_live_snapshot_v1,
  ): Promise<decibel_production_live_snapshot_v1> {
    if (
      snapshot.input.actualInventoryBase === 0 ||
      this.Source.readAuthenticatedPosition === undefined ||
      (this.sessionUnwindRequested && this.isAuthenticatedSnapshotFresh(snapshot, Date.now()))
    )
      return snapshot;
    assertDecibelHTTPReadAllowedV1();
    const verified = await this.Source.readAuthenticatedPosition();
    if (!Number.isFinite(verified.positionBase))
      throw new Error('PRODUCTION_AUTHENTICATED_POSITION_INVALID');
    if (verified.positionBase === snapshot.input.actualInventoryBase) return snapshot;
    // A changed position invalidates the entire read set, including orders,
    // fills, entry basis and margin. Never splice a single endpoint into it.
    const refreshed = await this.readSnapshot();
    if (refreshed.input.actualInventoryBase !== verified.positionBase)
      throw new Error('PRODUCTION_AUTHENTICATED_READ_TRANSIENT', {
        cause: new Error('AUTHENTICATED_POSITION_READ_SET_INCONSISTENT'),
      });
    return refreshed;
  }

  private isAuthenticatedSnapshotFresh(
    snapshot: decibel_production_live_snapshot_v1,
    now: number,
  ): boolean {
    const maximumAgeMs = Math.min(snapshot.input.maxBboAgeMs, this.Config.readTimeoutMs);
    return (
      snapshot.input.now <= now &&
      now - snapshot.input.now <= maximumAgeMs &&
      (snapshot.venueReadWindow?.account.startedAt ??
        snapshot.practicalCapacityInputs?.accountObservedAt ??
        snapshot.input.now) <= now &&
      now -
        (snapshot.venueReadWindow?.account.startedAt ??
          snapshot.practicalCapacityInputs?.accountObservedAt ??
          snapshot.input.now) <=
        maximumAgeMs &&
      snapshot.input.book.observedAt <= now &&
      now - snapshot.input.book.observedAt <= snapshot.input.maxBboAgeMs
    );
  }

  private async readSnapshot(afterMutation = false): Promise<decibel_production_live_snapshot_v1> {
    assertDecibelHTTPReadAllowedV1();
    try {
      const snapshot = this.withPriceRange(
        this.withTPProgress(await this.readSnapshotAttempt(afterMutation)),
      );
      assertDecibelVenueReconciliationFreshV1(snapshot, this.getDecisionNow());
      this.LatestSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      if (isDecibelHttpRateLimitErrorV1(error)) {
        const now = Date.now();
        enterDecibelHTTPReadBackoffForErrorV1(error, this.Config.rateLimitBackoffMs, now);
        this.Journal.recordBlocker(null, 'PRODUCTION_DECIBEL_HTTP_RATE_LIMITED', now);
        throw new Error('PRODUCTION_DECIBEL_HTTP_RATE_LIMITED', { cause: error });
      }
      const staleBook = getErrorChain(error).some(
        (candidate) =>
          candidate instanceof Error && candidate.message === 'PRODUCTION_LIVE_SOURCE_BOOK_STALE',
      );
      const authenticationFailure = isUnrecoverableDecibelAuthenticationErrorV1(error);
      const integrityBlocker = getPermanentAuthenticatedReadIntegrityBlockerV1(error);
      const now = Date.now();
      const blocker = staleBook
        ? 'PRODUCTION_LIVE_SOURCE_BOOK_STALE'
        : authenticationFailure
          ? 'PRODUCTION_AUTHENTICATED_READ_REQUIRED'
          : (integrityBlocker ?? 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT');
      this.Journal.recordBlocker(null, blocker, now);
      const tradingDecision = this.evaluateDecision(this.LatestSnapshot, null, blocker);
      if (this.LatestSnapshot !== null)
        this.LatestSnapshot = Object.freeze({ ...this.LatestSnapshot, tradingDecision });
      throw new Error(blocker, { cause: error });
    }
  }

  private async readSnapshotAttempt(
    afterMutation = false,
  ): Promise<decibel_production_live_snapshot_v1> {
    const startedAt = performance.now();
    const Controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        const error = new Error('PRODUCTION_AUTHENTICATED_READ_TIMEOUT');
        Controller.abort(error);
        reject(error);
      }, this.Config.readTimeoutMs);
    });
    try {
      const read =
        afterMutation && this.Source.readAuthenticatedSnapshotAfterMutation !== undefined
          ? this.Source.readAuthenticatedSnapshotAfterMutation()
          : this.Source.readAuthenticatedSnapshot(Controller.signal);
      return await Promise.race([read, expiry]);
    } finally {
      this.AuthenticatedReadMs += performance.now() - startedAt;
      if (timeout !== undefined) clearTimeout(timeout);
      Controller.abort();
    }
  }

  private result(
    action: decibel_production_live_cycle_result_v1['action'],
    intentId: string | null,
    blocker: string | null,
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1 | null,
    mutationInvocations: number,
    marketScopeDiagnostics?: decibel_production_live_snapshot_v1['marketScopeDiagnostics'],
  ): decibel_production_live_cycle_result_v1 {
    if (this.LatestSnapshot !== null)
      this.LatestSnapshot = Object.freeze({
        ...this.LatestSnapshot,
        quoteSizing: Object.freeze({ ...this.QuoteSizing }),
      });
    const source = this.DecisionSnapshot ?? this.LatestSnapshot;
    const intended = this.IntendedAction ?? this.SelectedAction;
    const desired = intended?.desired;
    const actionClass =
      source && intended && intended.side
        ? classifyDecibelOrderActionV1({
            action: intended.action,
            side: intended.side,
            position: source.input.actualInventoryBase,
            quantity: desired?.quantity ?? intended.current?.quantity ?? 0,
            reduceOnly:
              !!desired &&
              ((source.input.actualInventoryBase > 0 && intended.side === 'SELL') ||
                (source.input.actualInventoryBase < 0 && intended.side === 'BUY')),
            defensive:
              evaluation?.operatingState === 'RISK_REDUCTION' ||
              evaluation?.operatingState === 'SESSION_UNWIND',
            reason: intended.reason,
          })
        : 'TP_COVERAGE_REPAIR';
    const side =
      source?.input.actualInventoryBase && source.input.actualInventoryBase > 0 ? 'SELL' : 'BUY';
    const sizing = this.QuoteSizing[side];
    const sideReason =
      side === 'SELL' ? evaluation?.askEligibilityReason : evaluation?.bidEligibilityReason;
    const exitCoverageWorkflow = source
      ? deriveDecibelExitCoverageWorkflowV1({
          snapshot: this.withExitReservations(source),
          now: this.getDecisionNow(),
          action,
          actionClass,
          pendingCount: this.Journal.nonTerminal().filter((row) => row.status !== 'ACKNOWLEDGED')
            .length,
          reason:
            blocker ??
            (sizing?.finalSizeBtc === 0
              ? `EXIT_SIZING:${sizing.roundingReason}:${sizing.bindingConstraint}`
              : (sideReason ?? null)),
        })
      : null;
    if (
      source &&
      source.input.actualInventoryBase !== 0 &&
      action === 'HOLD' &&
      blocker === null &&
      exitCoverageWorkflow?.outcome === 'BLOCKED'
    ) {
      action = 'BLOCKED';
      blocker = exitCoverageWorkflow.reason;
    }
    const midpoint =
      source === null ? null : (source.input.book.bestBid + source.input.book.bestAsk) / 2;
    const getAdmission = (
      desired: unknown,
      reason: string | undefined,
    ): 'READY' | 'BLOCKED' | 'UNKNOWN' =>
      evaluation === null ? 'UNKNOWN' : desired !== null ? 'READY' : reason ? 'BLOCKED' : 'UNKNOWN';
    const bidAdmission = getAdmission(evaluation?.desiredBid, evaluation?.bidEligibilityReason);
    const askAdmission = getAdmission(evaluation?.desiredAsk, evaluation?.askEligibilityReason);
    const keepReason = evaluation?.actions.find(
      (candidate) =>
        candidate.action === 'NO_OP' &&
        candidate.current !== null &&
        candidate.reason.startsWith('KEEP:'),
    )?.reason;
    const exactReason =
      blocker ??
      evaluation?.blockers[0] ??
      keepReason ??
      (bidAdmission === 'BLOCKED' ? evaluation?.bidEligibilityReason : undefined) ??
      (askAdmission === 'BLOCKED' ? evaluation?.askEligibilityReason : undefined) ??
      (evaluation === null ? `CONTROL_EVALUATION_NOT_RUN_${action}` : action);
    const tpSource = this.LatestSnapshot ?? source;
    if (
      tpSource !== null &&
      this.LatestTPReview?.TP_EVIDENCE_VERSION !== tpSource.sourceStateHash
    ) {
      this.LatestTPReview = null;
      const tp = tpSource.input.openOrders.find(
        (order) =>
          order.reduceOnly === true &&
          ((tpSource.input.actualInventoryBase > 0 && order.side === 'SELL') ||
            (tpSource.input.actualInventoryBase < 0 && order.side === 'BUY')),
      );
      if (tp)
        this.LatestTPReview = evaluateDecibelTPPriceSuitabilityV1(
          {
            action: 'NO_OP',
            side: tp.side,
            current: tp,
            desired:
              source?.sourceStateHash !== tpSource.sourceStateHash
                ? null
                : tp.side === 'BUY'
                  ? (evaluation?.desiredBid ?? null)
                  : (evaluation?.desiredAsk ?? null),
            reason: 'TP_PRICE_REVIEW',
          },
          tpSource,
          this.getOrderRestingAgeMs(tp.venueOrderId, tpSource.input.now),
          this.Config.minimumActiveOrderLifetimeMs,
          this.Config.repriceMinimumTicks,
          null,
          null,
          this.sessionUnwindRequested,
        );
    }
    const tradingDecision = this.evaluateDecision(source, evaluation, blocker);
    const exitSource = this.LatestSnapshot ?? source;
    let inventoryExit = exitSource
      ? coordinateDecibelInventoryExitV1(this.withExitReservations(exitSource), {
          emergency: this.sessionUnwindRequested,
          evaluation,
          positionObservedSince: this.InventoryRiskEpoch?.since,
          samples: this.MidpointHistory.map((o) => ({ at: o.at, midpoint: o.midpoint })),
          gapObservedSince: this.CoverageGapObservedSince,
          tpReview: this.LatestTPReview,
          selectedAction: this.SelectedAction,
          executionBlocker: blocker,
        })
      : null;
    if (
      inventoryExit &&
      exitSource &&
      !this.isAuthenticatedSnapshotFresh(
        exitSource,
        this.Config.dryRun ? exitSource.input.now : this.getDecisionNow(),
      )
    ) {
      inventoryExit = Object.freeze({
        ...inventoryExit,
        EXIT_MODE: this.sessionUnwindRequested ? 'EMERGENCY' : 'RECONCILE',
        AUTHENTICATED_POSITION_QTY: null,
        AUTHENTICATED_ENTRY_BASIS: null,
        CONFIRMED_EXIT_COVERAGE_QTY: null,
        UNCOVERED_INVENTORY_QTY: null,
        COVERAGE_TRANSITION_STATE: 'UNKNOWN',
        COVERAGE_GAP_MS: null,
        DEFENSIVE_EXIT_ELIGIBLE: false,
        ESTIMATED_DEFENSIVE_EXIT_PNL: null,
        REMAINING_LOSS_BUDGET: null,
        FINAL_EXIT_DECISION: 'RECONCILE:FRESH_INVENTORY_EXIT_EVIDENCE_REQUIRED',
        BLOCKING_EVIDENCE: ['FRESH_AUTHENTICATED_ACCOUNT_AND_MARKET_REQUIRED'],
      });
    }
    if (this.LatestSnapshot !== null)
      this.LatestSnapshot = Object.freeze({ ...this.LatestSnapshot, tradingDecision });
    const gates = Object.freeze([
      Object.freeze({
        gate: 'AUTHORITATIVE_SNAPSHOT',
        status: source === null ? ('UNKNOWN' as const) : ('READY' as const),
        numericInputs: Object.freeze({
          bookAgeMs:
            source === null ? null : Math.max(0, source.input.now - source.input.book.observedAt),
          inventoryBase: source?.input.actualInventoryBase ?? null,
        }),
        reason: source === null ? 'AUTHORITATIVE_SNAPSHOT_UNAVAILABLE' : 'FRESH_SNAPSHOT_AVAILABLE',
        persistence: 'TRANSIENT' as const,
        clearCondition: 'A fresh authenticated account and market snapshot is required',
      }),
      Object.freeze({
        gate: 'ECONOMIC_EVIDENCE',
        status:
          evaluation === null
            ? ('UNKNOWN' as const)
            : evaluation.makerFeeBps === null || evaluation.estimatedGasCostUsd === null
              ? ('UNKNOWN' as const)
              : ('READY' as const),
        numericInputs: Object.freeze({
          makerFeeBps: evaluation?.makerFeeBps ?? null,
          estimatedGasCostUsd: evaluation?.estimatedGasCostUsd ?? null,
          adverseSelectionBufferBps: evaluation?.adverseSelectionBufferBps ?? null,
          safetyMarginBps: evaluation?.safetyMarginBps ?? null,
        }),
        reason:
          evaluation === null
            ? exactReason
            : evaluation.makerFeeBps === null || evaluation.estimatedGasCostUsd === null
              ? 'ECONOMIC_INPUT_UNKNOWN'
              : 'ECONOMIC_EVIDENCE_COMPLETE',
        persistence: 'TRANSIENT' as const,
        clearCondition: 'All provenance-labeled economic inputs must be fresh',
      }),
      ...(['BID', 'ASK'] as const).map((side) => {
        const cost =
          side === 'BID'
            ? (evaluation?.bidLifecycleCostBps ?? null)
            : (evaluation?.askLifecycleCostBps ?? null);
        const admission = side === 'BID' ? bidAdmission : askAdmission;
        const reason =
          side === 'BID'
            ? (evaluation?.bidEligibilityReason ?? exactReason)
            : (evaluation?.askEligibilityReason ?? exactReason);
        return Object.freeze({
          gate: `${side}_ADMISSION`,
          status: admission,
          numericInputs: Object.freeze({
            lifecycleCostBps: cost,
            lifecycleCostBudgetBps: DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1,
            inventoryBase: source?.input.actualInventoryBase ?? null,
            residualInventoryUsd:
              source === null || midpoint === null
                ? null
                : Math.abs(source.input.actualInventoryBase) * midpoint,
            minimumNotionalUsd: source?.minimumNotionalUsd ?? null,
            minimumSize: source?.input.metadata.minimumSize ?? null,
          }),
          reason,
          persistence:
            reason === 'LIFECYCLE_COST_BUDGET_EXCEEDED' || reason === 'DUST_BELOW_MIN_SIZE'
              ? ('PERSISTENT' as const)
              : ('TRANSIENT' as const),
          clearCondition:
            reason === 'DUST_BELOW_MIN_SIZE'
              ? 'An explicit session policy transition or abort is required'
              : reason === 'LIFECYCLE_COST_BUDGET_EXCEEDED'
                ? `${side} candidate lifecycle cost must be at or below ${DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1} bps`
                : `${side} candidate must pass fresh evidence, inventory, and lifecycle gates`,
        });
      }),
    ]);
    const selectedCurrent = this.SelectedAction?.current ?? null;
    const selectedDesired = this.SelectedAction?.desired ?? null;
    const restingAgeMs =
      selectedCurrent === null || source === null
        ? null
        : this.getOrderRestingAgeMs(selectedCurrent.venueOrderId, source.input.now);
    const priceDriftTicks =
      selectedCurrent === null || selectedDesired === null || source === null
        ? null
        : Math.abs(
            Math.round(selectedDesired.price / source.input.metadata.tickSize) -
              Math.round(selectedCurrent.price / source.input.metadata.tickSize),
          );
    const cancelReason =
      this.SelectedAction?.action === 'WOULD_CANCEL' ||
      this.SelectedAction?.action === 'WOULD_REPLACE'
        ? this.SelectedAction.reason.split(' RESTING_AGE_MS=')[0]!
        : null;
    const controlSnapshot = Object.freeze({
      observedAt: source?.input.now ?? Date.now(),
      sourceStateHash: source?.sourceStateHash ?? null,
      strategyState: evaluation?.operatingState ?? ('HALTED' as const),
      bidAdmission,
      askAdmission,
      exactReason,
      restingAgeMs,
      priceDriftTicks,
      cancelReason,
      gates,
    });
    const orderDecisions = (source?.input.openOrders ?? []).map((order) => {
      const planned = evaluation?.actions.find(
        (a) => a.current?.venueOrderId === order.venueOrderId,
      );
      const selected = this.SelectedAction?.current?.venueOrderId === order.venueOrderId;
      const owned = this.Journal.findPlaceByExactIdentity(order.venueOrderId, order.clientOrderId);
      const provenance = owned
        ? this.Journal.getLatestReconciliationProvenance(owned.intentId)
        : null;
      const tpResting =
        planned && order.reduceOnly === true
          ? assessDecibelExitEconomicsV1(source!, order.side, order.quantity, order.price)
          : null;
      const tpCandidate =
        planned?.desired && order.reduceOnly === true
          ? assessDecibelExitEconomicsV1(source!, order.side, order.quantity, planned.desired.price)
          : null;
      const age = this.getOrderRestingAgeMs(order.venueOrderId, source!.input.now);
      const review = planned
        ? evaluateDecibelReplacementDecisionV1(
            planned,
            source!,
            age,
            Math.max(
              this.Config.minimumActiveOrderLifetimeMs,
              this.LatestOperationalRegime?.policy.minimumRestingAgeMs ?? 0,
            ),
            Math.max(
              this.Config.repriceMinimumTicks,
              this.LatestOperationalRegime?.policy.repriceMinimumTicks ?? 0,
            ),
            evaluation?.operatingState === 'RISK_REDUCTION' ||
              evaluation?.operatingState === 'SESSION_UNWIND',
            null,
            evaluation ?? undefined,
          )
        : null;
      const reason = selected
        ? blocker
          ? `RECONCILE:${blocker}`
          : (this.SelectionReason ?? planned?.reason ?? 'RECONCILE')
        : planned?.action === 'WOULD_REPLACE'
          ? (review?.reason ?? 'KEEP:NO_MATERIAL_IMPROVEMENT')
          : (planned?.reason ?? 'RECONCILE:ORDER_NOT_EVALUATED');
      const candidatePrice =
        order.reduceOnly === false
          ? (planned?.priceCandidate?.price ?? planned?.desired?.price ?? null)
          : (planned?.desired?.price ?? null);
      return Object.freeze({
        ORDER_ID: order.venueOrderId,
        ORDER_ROLE:
          order.reduceOnly === true
            ? 'REDUCE_ONLY_EXIT'
            : order.reduceOnly === false
              ? 'ENTRY'
              : 'UNKNOWN',
        ORDER_AGE_MS: age,
        RESTING_PRICE: order.price,
        CANDIDATE_PRICE: candidatePrice,
        PLANNED_WORKING_PRICE: planned?.desired?.price ?? null,
        DELTA_TICKS:
          candidatePrice !== null
            ? Math.round(candidatePrice / source!.input.metadata.tickSize) -
              Math.round(order.price / source!.input.metadata.tickSize)
            : null,
        EVIDENCE_VERSION: `${source!.sourceStateHash}:${source!.input.now}:${source!.input.book.observedAt}:${source!.practicalCapacityInputs?.accountObservedAt ?? 'UNKNOWN'}`,
        PLAN_DECISION: planned?.action ?? 'NOT_EVALUATED',
        RISK_VALIDATION_DECISION:
          blocker || planned?.action === 'BLOCKED'
            ? 'RECONCILE'
            : planned?.action === 'WOULD_CANCEL'
              ? 'CANCEL_REQUIRED'
              : 'NO_CONFIRMED_INVALIDATION',
        FINAL_KEEP_CANCEL_REPLACE_REASON: reason,
        REPLACEMENT_NET_BENEFIT:
          order.reduceOnly === true &&
          tpCandidate?.netPnlUsd != null &&
          tpResting?.netPnlUsd != null
            ? tpCandidate.netPnlUsd -
              tpResting.netPnlUsd -
              2 * (source!.economicInputs?.estimatedGasCostUsd ?? 0)
            : null,
        RESTING_ENTRY_ECONOMICS: planned?.entryEconomics ?? null,
        BEST_MAKER_ENTRY_ADMISSION:
          order.reduceOnly === false && source !== null && midpoint !== null
            ? assessDecibelEntryPhaseEconomicsV1({
                phase: 'PLACE',
                side: order.side,
                price: order.side === 'BUY' ? source.input.book.bestBid : source.input.book.bestAsk,
                quantity: planned?.desired?.quantity ?? order.quantity,
                midpoint,
                makerFeeBps: source.economicInputs?.makerFeeBps ?? null,
                gasCostUsd: source.economicInputs?.estimatedGasCostUsd ?? null,
                safetyMarginBps: source.economicInputs?.safetyMarginBps ?? 1,
              })
            : null,
        ENTRY_REPLACEMENT_ECONOMICS: planned?.entryReplacementEconomics ?? null,
        RESTING_TP_COST_BREAKDOWN: tpResting?.breakdown ?? null,
        CANDIDATE_TP_COST_BREAKDOWN: tpCandidate?.breakdown ?? null,
        ACK_RECONCILIATION_STATE: `${owned?.status ?? 'UNOWNED'}:${provenance?.venueStatus ?? 'UNVERIFIED'}`,
      });
    });
    this.Journal.recordDecisionSnapshot(
      this.cycleSequence,
      Object.freeze({
        cycleSequence: this.cycleSequence,
        timestamp: source?.input.now ?? Date.now(),
        authenticatedPositionBase: source?.input.actualInventoryBase ?? null,
        bestBid: source?.input.book.bestBid ?? null,
        bestAsk: source?.input.book.bestAsk ?? null,
        marketSpreadBps:
          midpoint === null || midpoint <= 0 || source === null
            ? null
            : ((source.input.book.bestAsk - source.input.book.bestBid) / midpoint) * 10_000,
        bookObservedAt: source?.input.book.observedAt ?? null,
        bookAgeMs:
          source === null ? null : Math.max(0, source.input.now - source.input.book.observedAt),
        fairPriceInputs: Object.freeze({
          midpoint,
          microprice: null,
          markPrice: null,
          oraclePrice: null,
        }),
        fairPrice: evaluation?.fairPrice ?? null,
        fairPriceSource: evaluation?.fairPriceSource ?? 'UNKNOWN',
        marketRegime: evaluation?.marketRegime ?? 'UNKNOWN',
        operationalMarketRegime: this.LatestOperationalRegime?.regime ?? 'WARMING',
        operationalMarketRegimeInputs: this.LatestOperationalRegime?.inputs ?? null,
        operationalMarketRegimePolicy: this.LatestOperationalRegime?.policy ?? null,
        bidEvidenceSampleCount: evaluation?.bidEvidenceSampleCount ?? 0,
        askEvidenceSampleCount: evaluation?.askEvidenceSampleCount ?? 0,
        volatilitySpreadMultiplier: evaluation?.volatilitySpreadMultiplier ?? null,
        inventoryPressure: evaluation?.inventoryPressure ?? null,
        inventoryPriceSkewBps: evaluation?.inventoryPriceSkewBps ?? null,
        inventoryBidSizeMultiplier: evaluation?.inventoryBidSizeMultiplier ?? null,
        inventoryAskSizeMultiplier: evaluation?.inventoryAskSizeMultiplier ?? null,
        riskState: evaluation?.operatingState ?? 'HALTED',
        riskReductionTrigger: evaluation?.riskReductionTrigger ?? 'FAIL_CLOSED',
        maximumAbsPositionBase: evaluation?.maximumAbsPositionBase ?? null,
        makerFeeBps: evaluation?.makerFeeBps ?? source?.economicInputs?.makerFeeBps ?? null,
        makerFeeSource: source?.economicInputs?.makerFeeSource ?? 'UNKNOWN',
        estimatedGasCostUsd:
          evaluation?.estimatedGasCostUsd ?? source?.economicInputs?.estimatedGasCostUsd ?? null,
        estimatedGasCostSource: source?.economicInputs?.estimatedGasCostSource ?? 'UNKNOWN',
        adverseSelectionBufferBps:
          evaluation?.adverseSelectionBufferBps ??
          source?.economicInputs?.adverseSelectionBufferBps ??
          null,
        adverseSelectionSource: source?.economicInputs?.adverseSelectionSource ?? 'UNKNOWN',
        safetyMarginBps:
          evaluation?.safetyMarginBps ?? source?.economicInputs?.safetyMarginBps ?? 1,
        desiredBid: evaluation?.desiredBid ?? null,
        desiredAsk: evaluation?.desiredAsk ?? null,
        FLAT_PAIR_COHORT_ID: evaluation?.flatPairCohortId ?? null,
        FLAT_PAIR_SHARED_BASE_QTY: evaluation?.flatPairSharedBaseQuantity ?? null,
        FLAT_PAIR_BUDGET_USD: evaluation?.flatPairBudgetUsd ?? null,
        quoteSizing: this.QuoteSizing,
        BID_RAW_BUDGET_USD: evaluation?.bidRawBudgetUsd ?? null,
        ASK_RAW_BUDGET_USD: evaluation?.askRawBudgetUsd ?? null,
        quoteSpreadBps:
          midpoint === null ||
          midpoint <= 0 ||
          evaluation?.desiredBid == null ||
          evaluation?.desiredAsk == null
            ? null
            : ((midpoint - evaluation.desiredBid.price) / midpoint) * 10_000 +
              ((evaluation.desiredAsk.price - midpoint) / midpoint) * 10_000,
        expectedBidEdgeBps: evaluation?.expectedBidEdgeBps ?? null,
        expectedAskEdgeBps: evaluation?.expectedAskEdgeBps ?? null,
        requiredBidEdgeBps: evaluation?.requiredBidEdgeBps ?? null,
        requiredAskEdgeBps: evaluation?.requiredAskEdgeBps ?? null,
        bidLifecycleCostBps: evaluation?.bidLifecycleCostBps ?? null,
        bidCandidateCosts: evaluation?.bidCandidateCosts ?? [],
        askCandidateCosts: evaluation?.askCandidateCosts ?? [],
        askLifecycleCostBps: evaluation?.askLifecycleCostBps ?? null,
        sizingInputs:
          source === null
            ? null
            : {
                minimumNotionalUsd: source.minimumNotionalUsd,
                maximumNotionalUsd: source.maximumNotionalUsd,
                maximumAbsPositionBase: source.maximumAbsPositionBase ?? null,
                availableMarginUsd: source.availableMarginUsd,
                maximumEffectiveLeverage: source.maximumEffectiveLeverage,
                capacityBlocker:
                  source.sessionConfiguration?.exposureLimits?.capacityBlocker ?? null,
                availableHeadroomUsd:
                  source.sessionConfiguration?.exposureLimits?.availableHeadroomUsd ?? null,
              },
        admissionPipeline: gates,
        bidEligibilityReason: evaluation?.bidEligibilityReason ?? 'EVALUATION_UNAVAILABLE',
        askEligibilityReason: evaluation?.askEligibilityReason ?? 'EVALUATION_UNAVAILABLE',
        repriceResult: this.SelectionReason ?? 'NOT_SELECTED',
        restingAgeMs,
        priceDriftTicks,
        cancelReason,
        selectedMutation: this.SelectedAction?.action ?? action,
        selectedSide: this.SelectedAction?.side ?? null,
        exactReasonCode: this.SelectedAction?.reason ?? this.SelectionReason ?? blocker ?? action,
        REPRICE_DECISION_ID: this.RepriceDecisionId,
        REPRICE_COMMIT_SNAPSHOT_ID: this.RepriceCommitSnapshotId,
        OLD_PRICE: this.RepriceOldPrice,
        FROZEN_REPLACEMENT_PRICE: this.FrozenReplacementPrice,
        REPRICE_IMPROVEMENT_TICKS: this.RepriceImprovementTicks,
        REPRICE_ABORT_REASON: this.RepriceAbortReason,
        CANCEL_TO_REPLACEMENT_ACK_MS: this.CancelToReplacementAckMs,
        orderDecisions,
        actionClass,
        exitCoverageWorkflow,
      }),
      source?.input.now ?? Date.now(),
    );
    const stages = intentId === null ? [] : this.Journal.getExecutionStageTimings(intentId);
    const submittedAt = stages.find(
      (stage) => stage.stage === 'EXECUTOR_SUBMISSION_STARTED',
    )?.observedAt;
    const acknowledgedAt = stages.find((stage) => stage.stage === 'VENUE_ACK_RECEIVED')?.observedAt;
    const decisionNow = this.getDecisionNow();
    const fills = source?.input.actualFillLedger.fills ?? [];
    if (this.SeenFillIds === null)
      this.SeenFillIds = new Set(fills.map((fill) => fill.venueFillId));
    for (const fill of fills) {
      if (this.SeenFillIds.has(fill.venueFillId)) continue;
      this.SeenFillIds.add(fill.venueFillId);
      if (
        source &&
        ((source.input.actualInventoryBase > 0 && fill.side === 'BUY') ||
          (source.input.actualInventoryBase < 0 && fill.side === 'SELL')) &&
        fill.receivedAt.getTime() <= decisionNow
      )
        this.PendingCoverageFills.set(fill.venueFillId, fill.receivedAt.getTime());
      const receivedAt = fill.receivedAt.getTime();
      if (Number.isFinite(receivedAt) && receivedAt <= decisionNow)
        this.PendingOppositeDecisions.set(fill.venueFillId, {
          side: fill.side === 'BUY' ? 'SELL' : 'BUY',
          receivedAt,
        });
    }
    let fillToOppositeDecisionMs: number | null = null;
    for (const [id, fill] of this.PendingOppositeDecisions) {
      if (!(fill.side === 'BUY' ? tradingDecision.bidEligible : tradingDecision.askEligible))
        continue;
      fillToOppositeDecisionMs = Math.max(
        fillToOppositeDecisionMs ?? 0,
        decisionNow - fill.receivedAt,
      );
      this.PendingOppositeDecisions.delete(id);
    }
    let fillToExitCoverageMs: number | null = null;
    if (source) {
      const coverage = calculateDecibelExitCoverageV1(source.input);
      if (!coverage.entryPaused && tradingDecision.exitCoverage !== null) {
        for (const at of this.PendingCoverageFills.values())
          fillToExitCoverageMs = Math.max(fillToExitCoverageMs ?? 0, decisionNow - at);
        this.PendingCoverageFills.clear();
      }
    }
    const latency = Object.freeze({
      fillToExitCoverageMs,
      cycleMs: Math.max(0, performance.now() - this.CycleStartedAt),
      authenticatedReadMs: this.AuthenticatedReadMs,
      marketToDecisionMs:
        source && decisionNow >= source.input.book.observedAt
          ? decisionNow - source.input.book.observedAt
          : null,
      fillToOppositeDecisionMs,
      decisionToExecutorSubmissionMs:
        submittedAt === undefined ||
        this.DecisionSelectedAt === null ||
        submittedAt < this.DecisionSelectedAt
          ? null
          : submittedAt - this.DecisionSelectedAt,
      executorSubmissionToAckMs:
        submittedAt === undefined || acknowledgedAt === undefined
          ? null
          : Math.max(0, acknowledgedAt - submittedAt),
      cancelToReplacementReadyMs: this.CancelToReplacementReadyMs,
    });
    const result = Object.freeze({
      orderDecisionTrace: buildDecibelOrderDecisionTraceV1({
        action,
        intentId,
        blocker,
        intended:
          this.IntendedAction ??
          this.SelectedAction ??
          evaluation?.actions.find((candidate) => candidate.action !== 'NO_OP') ??
          null,
        selectionReason: this.SelectionReason,
        gate: this.DecisionGate,
        snapshot: source,
        decision: tradingDecision,
        finalPreflight: this.FinalValidation?.preflight ?? null,
        finalObservedAt: this.FinalValidation?.observedAt ?? null,
      }),
      latency,
      tpPricing:
        this.LatestTPReview && inventoryExit?.AUTHENTICATED_POSITION_QTY === null
          ? Object.freeze({
              ...this.LatestTPReview,
              AUTHENTICATED_ENTRY_BASIS: null,
              RESTING_TP_NET_PNL: null,
              CANDIDATE_TP_NET_PNL: null,
              RESTING_TP_COST_BREAKDOWN: null,
              CANDIDATE_TP_COST_BREAKDOWN: null,
              TP_EXPECTED_NET_BENEFIT: null,
              TP_PRICE_SUITABILITY: 'UNKNOWN' as const,
              TP_REPRICE_DECISION: 'KEEP' as const,
              TP_REPRICE_REASON: 'KEEP:TP_FRESH_EVIDENCE_REQUIRED',
              BLOCKING_EVIDENCE: inventoryExit.BLOCKING_EVIDENCE,
            })
          : this.LatestTPReview,
      inventoryExit,
      exitCoverageWorkflow,
      orderDecisions,
      version: DECIBEL_PRODUCTION_LIVE_ORCHESTRATOR_V1,
      action,
      intentId,
      blocker,
      evaluation,
      controlSnapshot,
      tradingDecision,
      mutationInvocations,
      ...(marketScopeDiagnostics === undefined ? {} : { marketScopeDiagnostics }),
    });
    assertDecibelProductionControlLivenessV1(result);
    return result;
  }
}

export async function runDecibelProductionLiveLoopV1(input: {
  orchestrator: Pick<decibel_production_live_orchestrator_v1, 'evaluateOnce' | 'close'>;
  configuration: decibel_production_live_configuration_v1;
  signal: AbortSignal;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onCycle?: (result: decibel_production_live_cycle_result_v1) => void;
}): Promise<Readonly<{ cycles: number; mutationInvocations: number; stopped: true }>> {
  const sleep =
    input.sleep ??
    ((milliseconds: number, signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        const timeout = setTimeout(resolve, milliseconds);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
      }));
  let cycles = 0;
  let mutationInvocations = 0;
  let consecutiveReadFailures = 0;
  try {
    while (!input.signal.aborted && (input.configuration.maxCycles ?? Infinity) > cycles) {
      try {
        const result = await input.orchestrator.evaluateOnce();
        cycles += 1;
        mutationInvocations += result.mutationInvocations;
        consecutiveReadFailures = 0;
        input.onCycle?.(result);
      } catch (error) {
        consecutiveReadFailures += 1;
        if (
          consecutiveReadFailures >= input.configuration.maxConsecutiveReadFailures ||
          !(error instanceof Error) ||
          error.message !== 'PRODUCTION_AUTHENTICATED_READ_TRANSIENT'
        )
          throw error;
      }
      if (!input.signal.aborted && (input.configuration.maxCycles ?? Infinity) > cycles)
        await sleep(input.configuration.pollIntervalMs, input.signal);
    }
    return Object.freeze({ cycles, mutationInvocations, stopped: true as const });
  } finally {
    await input.orchestrator.close();
  }
}
import { buildDecibelOrderDecisionTraceV1 } from './decibel_order_decision_trace_v1.js';
