import {
  floorDecibelQuantityToLotV1,
  getDecibelQuantityUnitsV1,
} from './decibel_chain_units_v1.js';
import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import {
  calculateDecibelPassiveVolumeQuotesV1,
  type decibel_passive_volume_quote_policy_result_v1,
} from './decibel_passive_volume_recycling_v1.js';
import { calculateDecibelFairPriceV1 } from './decibel_fair_price_engine_v1.js';
import { calculateDecibelInventoryConstraintsV1 } from './decibel_inventory_controller_v1.js';
import { buildDecibelMarketStateV1 } from './decibel_market_state_v1.js';
import { DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 } from './decibel_minimal_live_canary_v1.js';
import type { decibel_actual_fill_ledger_v1 } from './decibel_actual_fill_truth_v1.js';
import {
  buildDecibelSmartLadderV1,
  calculateDecibelLadderPriceV1,
  calculateDecibelLifecycleCostBpsV1,
  resolveDecibelCandidateAdverseSelectionV1,
  DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1,
  evaluateDecibelLifecycleCostAdmissionV1,
  assessDecibelRestingEntryEconomicsV1,
  assessDecibelEntryReplacementEconomicsV1,
  calculateDecibelClosestEntryPriceV1,
  type decibel_entry_priority_depth_v1,
} from './decibel_smart_ladder_v1.js';

export const DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1 =
  'DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1' as const;
export const LIVE_EXECUTION_ENABLED = false as const;
export const VENUE_MUTATION_ENABLED = false as const;

const DECIBEL_PASSIVE_RECYCLING_CLIENT_ORDER_ID_V1 =
  /^(?:dpvr1-[bs]-\d+-[0-9a-f]{32}|d1[bs][0-9a-f]{29})$/;

export function isDecibelPassiveRecyclingClientOrderIdV1(value: string): boolean {
  return DECIBEL_PASSIVE_RECYCLING_CLIENT_ORDER_ID_V1.test(value);
}

export type decibel_authenticated_strategy_order_v1 = Readonly<{
  venueOrderId: string;
  clientOrderId: string;
  strategyConfigId: string | null;
  market: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  orderType: 'LIMIT';
  timeInForce: 'PostOnly' | 'ImmediateOrCancel';
  postOnly: boolean;
  reduceOnly?: boolean;
}>;

/** Optional verified venue semantics. The current SDK does not supply this proof;
 * production therefore keeps the ACK-safe replacement fallback. */
export function supportsDecibelMultipleReductionsV1(
  input: decibel_authenticated_passive_recycling_input_v1,
): boolean {
  const rule = input.reductionOrderRules;
  return (
    !!rule &&
    [rule.observedAt, rule.validUntil].every(Number.isFinite) &&
    rule.market === input.market &&
    rule.source.length > 0 &&
    rule.observedAt <= input.now &&
    rule.validUntil >= input.now &&
    rule.multipleOrders &&
    rule.enforcesReduceOnlyOnEveryFill &&
    Number.isSafeInteger(rule.maximumOrders) &&
    rule.maximumOrders > 1 &&
    rule.minimumSize >= input.metadata.minimumSize &&
    rule.minimumNotionalUsd >= 0 &&
    Number.isFinite(rule.minimumSize) &&
    Number.isFinite(rule.minimumNotionalUsd)
  );
}

// Only authenticated remaining quantities count as working coverage. Intent reservations
// remain separate until exact reconciliation confirms the order on the venue.
export function calculateDecibelExitCoverageV1(
  input: Pick<
    decibel_authenticated_passive_recycling_input_v1,
    | 'actualInventoryBase'
    | 'openOrders'
    | 'metadata'
    | 'strategyConfigId'
    | 'market'
    | 'pendingCancelOrderIds'
    | 'pendingExitQuantityBase'
    | 'pendingEntryQuantityBase'
  >,
) {
  const position = input.actualInventoryBase;
  const exitSide = position > 0 ? 'SELL' : position < 0 ? 'BUY' : null;
  const cancelling = new Set(input.pendingCancelOrderIds ?? []);
  const seen = new Set<string>();
  let confirmedUnits = 0n;
  let entryUnits = getDecibelQuantityUnitsV1(input.pendingEntryQuantityBase ?? 0);
  let unknown = false;
  for (const order of input.openOrders) {
    if (seen.has(order.venueOrderId)) continue;
    seen.add(order.venueOrderId);
    if (order.market !== input.market || order.strategyConfigId !== input.strategyConfigId)
      continue;
    if (order.side === exitSide) {
      if (order.reduceOnly === undefined) unknown = true;
      if (order.reduceOnly === true && !cancelling.has(order.venueOrderId))
        confirmedUnits += getDecibelQuantityUnitsV1(order.quantity);
    } else if (position !== 0) entryUnits += getDecibelQuantityUnitsV1(order.quantity);
  }
  const positionUnits = getDecibelQuantityUnitsV1(Math.abs(position));
  const uncoveredUnits = positionUnits > confirmedUnits ? positionUnits - confirmedUnits : 0n;
  const uncovered = Number(uncoveredUnits) / 1e8;
  const confirmed = Number(confirmedUnits) / 1e8;
  const entries = Number(entryUnits) / 1e8;
  // No new tolerance policy: any venue-executable reducing residual pauses entries.
  // Below-minimum dust cannot be covered by a legal reduce-only order.
  const minimum =
    Math.ceil(input.metadata.minimumSize / input.metadata.lotSize - 1e-9) * input.metadata.lotSize;
  return Object.freeze({
    POSITION_QTY: position,
    CONFIRMED_EXIT_COVERAGE_QTY: confirmed,
    UNCOVERED_INVENTORY_QTY: uncovered,
    PENDING_EXIT_QTY: input.pendingExitQuantityBase ?? 0,
    SAME_DIRECTION_ENTRY_QTY: entries,
    pendingCancelOrderIds: Object.freeze([...cancelling]),
    metadataUnknown: unknown,
    overCovered: confirmedUnits > positionUnits,
    entryPaused:
      position !== 0 && (unknown || uncoveredUnits > 0n || confirmedUnits > positionUnits),
    uncoveredBelowMinimum: uncovered > 0 && uncovered < minimum,
  });
}

export type decibel_desired_recycling_order_v1 = Readonly<{
  side: 'BUY' | 'SELL';
  market: string;
  price: number;
  quantity: number;
  orderType: 'LIMIT';
  timeInForce: 'PostOnly' | 'ImmediateOrCancel';
  postOnly: boolean;
  clientOrderId: string;
  strategyConfigId: string;
  generation: number;
  levelId?: string;
  skewStatus?: 'NEUTRAL' | 'INVENTORY_INCREASING_SIDE_REDUCED' | 'INVENTORY_REDUCING_SIDE';
}>;

export type decibel_recycling_action_v1 = Readonly<{
  action: 'WOULD_PLACE' | 'WOULD_CANCEL' | 'WOULD_REPLACE' | 'NO_OP' | 'BLOCKED';
  /** Price review is independent from an exact coverage quantity transition. */
  priceCandidate?: decibel_desired_recycling_order_v1;
  entryEconomics?: ReturnType<typeof assessDecibelRestingEntryEconomicsV1>;
  entryReplacementEconomics?: ReturnType<typeof assessDecibelEntryReplacementEconomicsV1>;
  side: 'BUY' | 'SELL' | null;
  current: decibel_authenticated_strategy_order_v1 | null;
  desired: decibel_desired_recycling_order_v1 | null;
  reason: string;
}>;

export type decibel_authenticated_passive_recycling_input_v1 = Readonly<{
  sessionId: string;
  strategyConfigId: string;
  configuredSubaccount: string;
  authenticatedSubaccount: string;
  configuredNetwork: 'mainnet';
  observedNetwork: string;
  now: number;
  market: string;
  metadata: Readonly<{
    marketAddress: string;
    symbol: string;
    tickSize: number;
    lotSize: number;
    minimumSize: number;
    minimumNotionalUsd?: number;
    priceDecimals?: number;
    sizeDecimals?: number;
    mode: string;
    observedAt: number;
  }>;
  book: Readonly<{
    bestBid: number;
    bestAsk: number;
    observedAt: number;
    depth?: decibel_entry_priority_depth_v1;
    bestBidSize?: number;
    bestAskSize?: number;
    microprice?: number;
    topBookImbalance?: number;
    recentTradeIntensity?: number;
  }>;
  maxBboAgeMs: number;
  actualInventoryBase: number;
  inventoryDirectionProven: boolean;
  openOrders: readonly decibel_authenticated_strategy_order_v1[];
  pendingCancelOrderIds?: readonly string[];
  pendingExitQuantityBase?: number;
  pendingEntryQuantityBase?: number;
  reductionOrderRules?: Readonly<{
    market: string;
    source: string;
    observedAt: number;
    validUntil: number;
    multipleOrders: boolean;
    enforcesReduceOnlyOnEveryFill: boolean;
    maximumOrders: number;
    minimumSize: number;
    minimumNotionalUsd: number;
  }>;
  activeTwapCount: number;
  activeTpSlCount: number;
  activeBulkOrderCount: number;
  manualOrDelegatedActivityCount: number;
  unresolvedExecutionPlanCount: number;
  persistenceAvailable: boolean;
  targetExternalMakerVolumeUsd: number | null;
  targetExternalMakerVolumeBaselineUsd?: number;
  actualFillLedger: decibel_actual_fill_ledger_v1;
  generationBySide?: Readonly<{ BUY: number; SELL: number }>;
}>;

export type DecibelAuthenticatedPassiveRecyclingEvaluationV1 = Readonly<{
  version: typeof DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1;
  sessionId: string;
  mode: 'AUTHENTICATED_DRY_RUN';
  status: 'READY' | 'FAIL_CLOSED' | 'STOPPING' | 'SESSION_COMPLETE';
  strategyState: decibel_passive_volume_quote_policy_result_v1['state'] | 'BLOCKED' | 'STOPPING';
  operatingState:
    | 'NORMAL_MM'
    | 'INVENTORY_PRESSURE'
    | 'RISK_REDUCTION'
    | 'SESSION_UNWIND'
    | 'DUST_BELOW_MIN_SIZE'
    | 'HALTED';
  actualInventoryBase: number;
  maximumAbsPositionBase: number | null;
  riskReductionTrigger:
    | 'NONE'
    | 'POSITION_LIMIT_REACHED'
    | 'EXPLICIT_RISK_REDUCTION_REQUEST'
    | 'REDUCTION_MINIMUM_NOTIONAL_DEAD_ZONE'
    | 'SESSION_UNWIND'
    | 'FAIL_CLOSED';
  fairPrice: number | null;
  fairPriceSource: 'BBO_MIDPOINT' | 'BOUNDED_MICROPRICE' | 'UNKNOWN';
  inventoryPressure: number | null;
  inventoryPriceSkewBps: number | null;
  inventoryBidSizeMultiplier: number | null;
  inventoryAskSizeMultiplier: number | null;
  volatilitySpreadMultiplier: number | null;
  entryPriceMovementBps?: number;
  marketRegime:
    | 'RISING'
    | 'FALLING'
    | 'NEUTRAL'
    | 'QUIET'
    | 'NORMAL'
    | 'FAST'
    | 'ONE_SIDED'
    | 'THIN'
    | 'WARMING'
    | 'UNKNOWN';
  bidEvidenceSampleCount: number;
  askEvidenceSampleCount: number;
  makerFeeBps: number | null;
  estimatedGasCostUsd: number | null;
  adverseSelectionBufferBps: number | null;
  safetyMarginBps: number;
  expectedBidEdgeBps: number | null;
  expectedAskEdgeBps: number | null;
  requiredBidEdgeBps: number | null;
  requiredAskEdgeBps: number | null;
  bidLifecycleCostBps: number | null;
  askLifecycleCostBps: number | null;
  bidCandidatesEvaluated: number;
  askCandidatesEvaluated: number;
  bidCandidateCosts: readonly Readonly<{
    distanceBps: number;
    adverseSelectionBps: number;
    lifecycleCostBps: number;
    adverseSource: 'CANDIDATE_P95' | 'GLOBAL_FALLBACK' | 'NOT_APPLIED';
  }>[];
  askCandidateCosts: readonly Readonly<{
    distanceBps: number;
    adverseSelectionBps: number;
    lifecycleCostBps: number;
    adverseSource: 'CANDIDATE_P95' | 'GLOBAL_FALLBACK' | 'NOT_APPLIED';
  }>[];
  flatPairCohortId: string | null;
  flatPairSharedBaseQuantity: number | null;
  flatPairBudgetUsd: number | null;
  bidRawBudgetUsd: number | null;
  askRawBudgetUsd: number | null;
  bidEligibilityReason: string;
  askEligibilityReason: string;
  desiredBid: decibel_desired_recycling_order_v1 | null;
  desiredAsk: decibel_desired_recycling_order_v1 | null;
  desiredBidLadder: readonly decibel_desired_recycling_order_v1[];
  desiredAskLadder: readonly decibel_desired_recycling_order_v1[];
  actions: readonly decibel_recycling_action_v1[];
  blockers: readonly string[];
  actualMakerFillCount: number;
  actualExternalMakerVolumeUsd: number;
  volumeCycles: decibel_actual_fill_ledger_v1['cycles'];
  trace: readonly Readonly<{ type: string; at: number; detail: string }>[];
  selfTradePermitted: false;
  externalCounterpartyRequired: true;
  liveExecutionEnabled: false;
  venueMutationEnabled: false;
}>;

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function roundPriceDownToTick(value: number, tickSize: number): number {
  return Number((Math.floor((value + Number.EPSILON) / tickSize) * tickSize).toFixed(12));
}

function roundPriceUpToTick(value: number, tickSize: number): number {
  return Number((Math.ceil((value - Number.EPSILON) / tickSize) * tickSize).toFixed(12));
}

function semanticallyEqual(
  current: decibel_authenticated_strategy_order_v1,
  desired: decibel_desired_recycling_order_v1,
): boolean {
  return (
    current.market === desired.market &&
    current.side === desired.side &&
    current.price === desired.price &&
    current.quantity === desired.quantity &&
    current.orderType === desired.orderType &&
    current.timeInForce === desired.timeInForce &&
    current.postOnly &&
    current.strategyConfigId === desired.strategyConfigId
  );
}

function desiredOrder(input: {
  sessionId: string;
  strategyConfigId: string;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  generation: number;
  levelId?: string;
  skewStatus?: decibel_desired_recycling_order_v1['skewStatus'];
  timeInForce?: decibel_desired_recycling_order_v1['timeInForce'];
}): decibel_desired_recycling_order_v1 {
  const identity = hash([
    input.sessionId,
    input.strategyConfigId,
    input.side,
    input.generation,
    DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    input.price,
    input.quantity,
    input.levelId ?? null,
  ]).slice(0, 29);
  return Object.freeze({
    side: input.side,
    market: DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1,
    price: input.price,
    quantity: input.quantity,
    orderType: 'LIMIT',
    timeInForce: input.timeInForce ?? 'PostOnly',
    postOnly: (input.timeInForce ?? 'PostOnly') === 'PostOnly',
    clientOrderId: `d1${input.side === 'BUY' ? 'b' : 's'}${identity}`,
    strategyConfigId: input.strategyConfigId,
    generation: input.generation,
    ...(input.levelId === undefined ? {} : { levelId: input.levelId }),
    ...(input.skewStatus === undefined ? {} : { skewStatus: input.skewStatus }),
  });
}

function capInventoryReductionToNeutralBandV1(
  order: decibel_desired_recycling_order_v1 | null,
  input: decibel_authenticated_passive_recycling_input_v1,
  midpoint: number,
  minimumNotionalUsd: number,
  respectCandidateQuantity = false,
): Readonly<{
  order: decibel_desired_recycling_order_v1 | null;
  reason: string | null;
}> {
  if (
    order === null ||
    Math.abs(input.actualInventoryBase) * midpoint <=
      DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1 ||
    (input.actualInventoryBase < 0 && order.side !== 'BUY') ||
    (input.actualInventoryBase > 0 && order.side !== 'SELL')
  )
    return Object.freeze({ order, reason: null });
  const lotSize = input.metadata.lotSize;
  const maximumNoFlipLots = Number(
    getDecibelQuantityUnitsV1(
      floorDecibelQuantityToLotV1(Math.abs(input.actualInventoryBase), lotSize),
    ) / getDecibelQuantityUnitsV1(lotSize),
  );
  const minimumLots = Math.max(
    Math.ceil((input.metadata.minimumSize - Number.EPSILON) / lotSize),
    Math.ceil((minimumNotionalUsd / order.price - Number.EPSILON) / lotSize),
  );
  // Reduce all authenticated, lot-aligned inventory instead of retaining neutral-band dust.
  const quantityLots = respectCandidateQuantity
    ? Math.min(
        maximumNoFlipLots,
        Number(
          getDecibelQuantityUnitsV1(floorDecibelQuantityToLotV1(order.quantity, lotSize)) /
            getDecibelQuantityUnitsV1(lotSize),
        ),
      )
    : maximumNoFlipLots;
  const quantity = Number((quantityLots * lotSize).toFixed(12));
  if (
    quantityLots < minimumLots ||
    quantity < input.metadata.minimumSize ||
    quantity * order.price + Number.EPSILON < minimumNotionalUsd
  )
    return Object.freeze({
      order: null,
      reason: 'REDUCTION_MINIMUM_NOTIONAL_UNAVAILABLE_WITHOUT_INVENTORY_FLIP',
    });
  return Object.freeze({
    order: desiredOrder({
      sessionId: input.sessionId,
      strategyConfigId: input.strategyConfigId,
      side: order.side,
      price: order.price,
      quantity,
      generation: order.generation,
      ...(order.levelId === undefined ? {} : { levelId: order.levelId }),
      ...(order.skewStatus === undefined ? {} : { skewStatus: order.skewStatus }),
    }),
    reason: null,
  });
}

function diffSide(
  side: 'BUY' | 'SELL',
  desired: decibel_desired_recycling_order_v1 | null,
  current: decibel_authenticated_strategy_order_v1 | null,
  missingDesiredReason = 'INVENTORY_INVALID:SIDE_SUPPRESSED',
): decibel_recycling_action_v1 {
  if (desired === null && current === null)
    return Object.freeze({ action: 'NO_OP', side, current, desired, reason: 'SIDE_ABSENT' });
  if (desired === null)
    if (missingDesiredReason === 'KEEP:NO_NEW_QUOTE_CANDIDATE_EXISTING_ORDER_VALID')
      return Object.freeze({
        action: 'NO_OP',
        side,
        current,
        desired,
        reason: missingDesiredReason,
      });
    else
      return Object.freeze({
        action: 'WOULD_CANCEL',
        side,
        current,
        desired,
        reason: missingDesiredReason,
      });
  if (current === null)
    return Object.freeze({
      action: 'WOULD_PLACE',
      side,
      current,
      desired,
      reason: 'DESIRED_ORDER_ABSENT',
    });
  if (semanticallyEqual(current, desired))
    return Object.freeze({ action: 'NO_OP', side, current, desired, reason: 'SEMANTIC_MATCH' });
  return Object.freeze({
    action: 'WOULD_REPLACE',
    side,
    current,
    desired,
    reason: 'SEMANTIC_ORDER_CHANGED_CANCEL_THEN_PLACE',
  });
}

export function evaluateDecibelAuthenticatedPassiveRecyclingV1(
  input: decibel_authenticated_passive_recycling_input_v1,
  sizing?: Readonly<{
    minimumNotionalUsd: number;
    maximumNotionalUsd: number;
    entryHeadroomUsd?: number;
    /** While flat after a TP fill: BUY entries rest at or below BUY, SELL at or above SELL. */
    entryPriceLimits?: Readonly<{ BUY?: number; SELL?: number }>;
    /** Volatility floor for repricing a resting entry toward the market (bps). */
    entryReplacementMinimumBps?: number;
    availableMarginUsd: number;
    maximumEffectiveLeverage: number;
    halfSpreadBps?: number;
    bidHalfSpreadBps?: number;
    askHalfSpreadBps?: number;
    maximumAbsPositionBase?: number;
    maximumLadderLevelsPerSide?: number;
    candidateSearchDepthPerSide?: number;
    candidateDistanceBps?: readonly number[];
    bidCandidateDistanceBps?: readonly number[];
    askCandidateDistanceBps?: readonly number[];
    maximumAggregateCollateralFraction?: number;
    ladderLevelAllocations?: readonly number[];
    volatilitySpreadMultiplier?: number;
    entryPriceMovementBps?: number;
    maximumVolatilitySpreadMultiplier?: number;
    riskReductionRequired?: boolean;
    committedCoveragePrice?: number;
    constructReducingCandidate?: (
      candidate: Readonly<{ side: 'BUY' | 'SELL'; quantity: number; price: number }>,
    ) => Readonly<{ price: number | null; blocker: string | null }>;
    assessReducingCandidate?: (
      candidate: Readonly<{ side: 'BUY' | 'SELL'; quantity: number; price: number }>,
    ) => string | null;
    /** Unavailable entry evidence freezes admission; it is not a proven risk breach. */
    entryEvidenceBlocker?: string | null;
    sessionUnwindRequested?: boolean;
    /** Target reached: stop new exposure and let resting TP close; no taker unwind. */
    sessionDrainOnTarget?: boolean;
    /** The runtime is draining after a target: entry capacity is irrelevant. */
    sessionDrainRequested?: boolean;
    makerFeeBps?: number | null;
    estimatedGasCostUsd?: number | null;
    adverseSelectionBufferBps?: number | null;
    candidateAdverseSelection?: readonly Readonly<{
      side: 'BUY' | 'SELL';
      distanceBps: number;
      p95AdverseSelectionBps: number;
      sampleCount: number;
      observedAt: number;
    }>[];
    bidAdverseSelectionBufferBps?: number | null;
    askAdverseSelectionBufferBps?: number | null;
    bidEvidenceSufficient?: boolean;
    askEvidenceSufficient?: boolean;
    safetyMarginBps?: number;
    maximumInventoryPriceSkewBps?: number;
    marketRegime?:
      | 'RISING'
      | 'FALLING'
      | 'NEUTRAL'
      | 'QUIET'
      | 'NORMAL'
      | 'FAST'
      | 'ONE_SIDED'
      | 'THIN'
      | 'WARMING'
      | 'UNKNOWN';
    bidEvidenceSampleCount?: number;
    askEvidenceSampleCount?: number;
    flatPairCohortId?: string;
    flatPairSharedBaseQuantity?: number;
    flatPairBudgetUsd?: number;
    constrainQuoteQuantity?: (
      candidate: Readonly<{
        side: 'BUY' | 'SELL';
        price: number;
        quantity: number;
        rawBudgetUsd?: number;
      }>,
    ) => number;
  }>,
): DecibelAuthenticatedPassiveRecyclingEvaluationV1 {
  const blockers: string[] = [];
  if (!input.sessionId || !input.strategyConfigId || !input.configuredSubaccount)
    blockers.push('ACCOUNT_SCOPE_INVALID');
  if (input.configuredSubaccount !== input.authenticatedSubaccount)
    blockers.push('AUTHENTICATED_ACCOUNT_MISMATCH');
  if (input.configuredNetwork !== 'mainnet' || input.observedNetwork !== 'mainnet')
    blockers.push('NETWORK_MISMATCH');
  if (
    input.market !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1 ||
    input.metadata.marketAddress !== DECIBEL_MINIMAL_LIVE_CANARY_MARKET_V1
  )
    blockers.push('MARKET_MISMATCH');
  if (
    !(input.metadata.tickSize > 0) ||
    !(input.metadata.lotSize > 0) ||
    !(input.metadata.minimumSize > 0)
  )
    blockers.push('METADATA_INVALID');
  if (input.metadata.mode !== 'Open') blockers.push('MARKET_HALTED');
  if (!(input.book.bestBid > 0) || !(input.book.bestAsk > input.book.bestBid))
    blockers.push('BBO_CROSSED_OR_INVALID');
  if (
    input.now - input.book.observedAt < 0 ||
    input.now - input.book.observedAt > input.maxBboAgeMs
  )
    blockers.push('MARKET_DATA_STALE');
  if (!Number.isFinite(input.actualInventoryBase)) blockers.push('POSITION_MISMATCH');
  if (input.actualInventoryBase !== 0 && !input.inventoryDirectionProven)
    blockers.push('INVENTORY_DIRECTION_UNPROVEN');
  if (!input.persistenceAvailable) blockers.push('PERSISTENCE_UNAVAILABLE');
  if (input.unresolvedExecutionPlanCount !== 0) blockers.push('UNRESOLVED_EXECUTION_PLAN');
  if (
    input.activeTwapCount !== 0 ||
    input.activeTpSlCount !== 0 ||
    input.activeBulkOrderCount !== 0 ||
    input.manualOrDelegatedActivityCount !== 0
  )
    blockers.push('STRATEGY_ACTIVITY_EXCLUSIVITY_LOST');
  if (
    input.openOrders.some(
      (order) =>
        !isDecibelPassiveRecyclingClientOrderIdV1(order.clientOrderId) ||
        order.strategyConfigId !== input.strategyConfigId ||
        order.market !== input.market,
    )
  )
    blockers.push('UNRESOLVED_EXTERNAL_ORDER_ACTIVITY');
  const metadataMinimumLots = Math.ceil(input.metadata.minimumSize / input.metadata.lotSize);
  const targetReached =
    input.targetExternalMakerVolumeUsd !== null &&
    Math.max(
      0,
      input.actualFillLedger.actualExternalMakerVolumeUsd -
        (input.targetExternalMakerVolumeBaselineUsd ?? 0),
    ) >= input.targetExternalMakerVolumeUsd;
  const sessionUnwindRequested =
    (targetReached && sizing?.sessionDrainOnTarget !== true) ||
    sizing?.sessionUnwindRequested === true;
  // Draining opens nothing, so entry-capacity limits must not fail the cycle closed.
  const sessionDrain =
    !sessionUnwindRequested &&
    ((targetReached && sizing?.sessionDrainOnTarget === true) ||
      sizing?.sessionDrainRequested === true);
  const reusableOpenOrderMarginUsd =
    sizing === undefined ||
    !Number.isFinite(sizing.maximumEffectiveLeverage) ||
    sizing.maximumEffectiveLeverage <= 0
      ? 0
      : input.openOrders.reduce(
          (sum, order) => sum + (order.price * order.quantity) / sizing.maximumEffectiveLeverage,
          0,
        );
  let quoteLots = metadataMinimumLots;
  if (
    sizing !== undefined &&
    !sessionUnwindRequested &&
    !sessionDrain &&
    !(
      (sizing.riskReductionRequired === true || sizing.assessReducingCandidate !== undefined) &&
      input.actualInventoryBase !== 0
    )
  ) {
    if (
      !Number.isFinite(sizing.minimumNotionalUsd) ||
      sizing.minimumNotionalUsd <= 0 ||
      !Number.isFinite(sizing.maximumNotionalUsd) ||
      sizing.maximumNotionalUsd < 0 ||
      !Number.isFinite(sizing.availableMarginUsd) ||
      sizing.availableMarginUsd < 0 ||
      !Number.isFinite(sizing.maximumEffectiveLeverage) ||
      sizing.maximumEffectiveLeverage < 1 ||
      sizing.maximumEffectiveLeverage > 40
    )
      blockers.push('QUOTE_SIZING_LIMITS_INVALID');
    else if (sizing.maximumNotionalUsd < sizing.minimumNotionalUsd)
      blockers.push(
        sizing.maximumNotionalUsd === 0
          ? 'NO_NEW_QUOTE_HEADROOM'
          : 'QUOTE_CAPACITY_BELOW_MINIMUM_ORDER',
      );
    else if (input.book.bestBid > 0) {
      const minimumNotionalLots = Math.ceil(
        sizing.minimumNotionalUsd / input.book.bestBid / input.metadata.lotSize,
      );
      quoteLots = Math.max(metadataMinimumLots, minimumNotionalLots);
      const maximumQuoteNotionalUsd = quoteLots * input.metadata.lotSize * input.book.bestAsk;
      const leveragedBuyingPowerUsd =
        (sizing.availableMarginUsd + reusableOpenOrderMarginUsd) * sizing.maximumEffectiveLeverage;
      if (maximumQuoteNotionalUsd > sizing.maximumNotionalUsd + Number.EPSILON)
        blockers.push('MINIMUM_NOTIONAL_EXCEEDS_MAXIMUM_NOTIONAL');
      if (maximumQuoteNotionalUsd > leveragedBuyingPowerUsd + Number.EPSILON)
        blockers.push('INSUFFICIENT_LEVERAGED_BUYING_POWER');
    }
  }
  const quantity = Number((quoteLots * input.metadata.lotSize).toFixed(12));
  const midpoint = (input.book.bestBid + input.book.bestAsk) / 2;
  const ladderMaximumAbsPositionBase =
    sizing?.maximumAbsPositionBase ??
    (sizing === undefined ? quantity * 2 : sizing.maximumNotionalUsd / midpoint);
  // This bound describes only the existing position during unwind. It is not
  // permission to increase exposure; unwind orders below are reduce-only IOC.
  // Draining keeps the existing position above the cap so TP logic, not risk reduction,
  // manages the exit; opening orders are refused separately by the growth and drain gates.
  const maximumAbsPositionBase = sessionUnwindRequested
    ? Math.max(Math.abs(input.actualInventoryBase), input.metadata.minimumSize)
    : sessionDrain
      ? Math.max(
          ladderMaximumAbsPositionBase,
          Math.abs(input.actualInventoryBase) + input.metadata.minimumSize,
        )
      : ladderMaximumAbsPositionBase;
  if (!Number.isFinite(maximumAbsPositionBase) || maximumAbsPositionBase < 0)
    blockers.push('INVENTORY_CAP_EXCEEDED');
  else if (maximumAbsPositionBase === 0 && !blockers.includes('NO_NEW_QUOTE_HEADROOM'))
    blockers.push('NO_NEW_QUOTE_HEADROOM');

  const trace = [
    { type: 'SESSION_START', at: input.now, detail: input.sessionId },
    { type: 'AUTH_RECONCILIATION', at: input.now, detail: blockers.join(',') || 'CLEAR' },
    { type: 'MARKET_STATE', at: input.now, detail: `${input.book.bestBid}/${input.book.bestAsk}` },
    { type: 'INVENTORY_STATE', at: input.now, detail: String(input.actualInventoryBase) },
  ];
  if (blockers.length > 0) {
    trace.push({ type: 'BLOCKED', at: input.now, detail: blockers[0] ?? 'FAIL_CLOSED' });
    return Object.freeze({
      version: DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1,
      sessionId: input.sessionId,
      mode: 'AUTHENTICATED_DRY_RUN',
      status: 'FAIL_CLOSED',
      strategyState: 'BLOCKED',
      operatingState: 'HALTED',
      actualInventoryBase: input.actualInventoryBase,
      maximumAbsPositionBase: null,
      riskReductionTrigger: 'FAIL_CLOSED',
      fairPrice: null,
      fairPriceSource: 'UNKNOWN',
      inventoryPressure: null,
      inventoryPriceSkewBps: null,
      inventoryBidSizeMultiplier: null,
      inventoryAskSizeMultiplier: null,
      volatilitySpreadMultiplier: sizing?.volatilitySpreadMultiplier ?? null,
      marketRegime: sizing?.marketRegime ?? 'UNKNOWN',
      bidEvidenceSampleCount: sizing?.bidEvidenceSampleCount ?? 0,
      askEvidenceSampleCount: sizing?.askEvidenceSampleCount ?? 0,
      makerFeeBps: sizing?.makerFeeBps ?? null,
      estimatedGasCostUsd: sizing?.estimatedGasCostUsd ?? null,
      adverseSelectionBufferBps: sizing?.adverseSelectionBufferBps ?? null,
      safetyMarginBps: sizing?.safetyMarginBps ?? 1,
      expectedBidEdgeBps: null,
      expectedAskEdgeBps: null,
      requiredBidEdgeBps: null,
      requiredAskEdgeBps: null,
      bidLifecycleCostBps: null,
      askLifecycleCostBps: null,
      bidCandidatesEvaluated: 0,
      askCandidatesEvaluated: 0,
      bidCandidateCosts: Object.freeze([]),
      askCandidateCosts: Object.freeze([]),
      flatPairCohortId: sizing?.flatPairCohortId ?? null,
      flatPairSharedBaseQuantity: sizing?.flatPairSharedBaseQuantity ?? null,
      flatPairBudgetUsd: sizing?.flatPairBudgetUsd ?? null,
      bidRawBudgetUsd: null,
      askRawBudgetUsd: null,
      bidEligibilityReason: 'FAIL_CLOSED',
      askEligibilityReason: 'FAIL_CLOSED',
      desiredBid: null,
      desiredAsk: null,
      desiredBidLadder: Object.freeze([]),
      desiredAskLadder: Object.freeze([]),
      actions: Object.freeze([
        Object.freeze({
          action: 'BLOCKED',
          side: null,
          current: null,
          desired: null,
          reason: blockers[0] ?? 'FAIL_CLOSED',
        }),
      ]),
      blockers: Object.freeze(blockers),
      actualMakerFillCount: input.actualFillLedger.fills.length,
      actualExternalMakerVolumeUsd: input.actualFillLedger.actualExternalMakerVolumeUsd,
      volumeCycles: input.actualFillLedger.cycles,
      trace: Object.freeze(trace),
      selfTradePermitted: false,
      externalCounterpartyRequired: true,
      liveExecutionEnabled: false,
      venueMutationEnabled: false,
    });
  }

  const at = new Date(input.now);
  const observed = new Date(input.book.observedAt);
  const marketState = buildDecibelMarketStateV1({
    constructedAt: at,
    metadata: {
      marketAddress: input.market,
      exchangeSymbol: input.metadata.symbol,
      tickSize: input.metadata.tickSize,
      lotSize: input.metadata.lotSize,
      minimumSize: input.metadata.minimumSize,
      priceDecimals: 8,
      sizeDecimals: 8,
      mode: 'Open',
      observedAt: new Date(input.metadata.observedAt),
    },
    book: {
      marketAddress: input.market,
      exchangeTimestamp: observed,
      receivedAt: observed,
      bestBid: input.book.bestBid,
      bestAsk: input.book.bestAsk,
      spread: input.book.bestAsk - input.book.bestBid,
      midPrice: midpoint,
      microprice: midpoint,
      bestBidSize: 1,
      bestAskSize: 1,
      top5DepthImbalance: 0,
    },
    prices: null,
    sequence: {
      connectionEpoch: null,
      sequenceNumber: null,
      previousSequenceNumber: null,
      status: 'SEQUENCE_UNAVAILABLE',
    },
    connectionHealthy: true,
    persistenceAvailable: true,
    configuration: {
      maximumBookAgeMs: input.maxBboAgeMs,
      maximumPriceAgeMs: input.maxBboAgeMs,
      maximumTradeAgeMs: input.maxBboAgeMs,
      maximumClockSkewMs: 1_000,
      tradesRequired: false,
      pricesRequired: false,
    },
  });
  const fair = calculateDecibelFairPriceV1(marketState, {
    micropriceWeight: 0,
    maximumMicropriceAdjustmentBps: 0,
    maximumFairToMarkDeviationBps: 1,
    maximumFairToOracleDeviationBps: 1,
    maximumMarkToOracleDeviationBps: 1,
  });
  const inventory = calculateDecibelInventoryConstraintsV1(
    { signedBaseInventory: input.actualInventoryBase, neutralTargetBase: 0 },
    {
      softInventoryLimitBase: maximumAbsPositionBase / 2,
      hardInventoryLimitBase: maximumAbsPositionBase,
      maximumPriceSkewBps: sizing?.maximumInventoryPriceSkewBps ?? 2,
      minimumInventoryIncreasingSizeMultiplier: 0,
    },
  );
  const halfSpreadTicks = Math.max(
    0,
    Math.ceil(((sizing?.halfSpreadBps ?? 0) * midpoint) / 10_000 / input.metadata.tickSize),
  );
  const policy = calculateDecibelPassiveVolumeQuotesV1(marketState, fair, inventory, {
    targetInventoryBase: 0,
    nearFlatToleranceBase: 0,
    flatBidOffsetTicks: halfSpreadTicks,
    flatAskOffsetTicks: halfSpreadTicks,
    recyclingBidOffsetTicks: halfSpreadTicks,
    recyclingAskOffsetTicks: halfSpreadTicks,
  });
  const generation = input.generationBySide ?? { BUY: 0, SELL: 0 };
  const ladder = buildDecibelSmartLadderV1({
    bestBid: input.book.bestBid,
    bestAsk: input.book.bestAsk,
    tickSize: input.metadata.tickSize,
    lotSize: input.metadata.lotSize,
    minimumSize: input.metadata.minimumSize,
    inventoryBase: input.actualInventoryBase,
    maximumAbsPositionBase,
    availableCollateralUsd:
      sizing === undefined
        ? quantity * midpoint * 2
        : sizing.availableMarginUsd + reusableOpenOrderMarginUsd,
    maximumEffectiveLeverage: sizing?.maximumEffectiveLeverage ?? 1,
    maximumNotionalUsd: sizing?.maximumNotionalUsd ?? quantity * midpoint * 2,
    ...(sizing?.entryHeadroomUsd === undefined
      ? {}
      : { entryHeadroomUsd: sessionUnwindRequested ? 0 : sizing.entryHeadroomUsd }),
    fairPrice: fair.fairPrice ?? midpoint,
    maximumInventoryPriceSkewBps: sizing?.maximumInventoryPriceSkewBps ?? 2,
    configuration: {
      maximumLevelsPerSide: sizing?.maximumLadderLevelsPerSide ?? 3,
      maximumAggregateCollateralFraction: sizing?.maximumAggregateCollateralFraction ?? 0.5,
      levelAllocations: sizing?.ladderLevelAllocations ?? [0.5, 0.3, 0.2],
      baseHalfSpreadBps: sizing?.halfSpreadBps ?? 0,
      ...(sizing?.bidHalfSpreadBps === undefined
        ? {}
        : { bidHalfSpreadBps: sizing.bidHalfSpreadBps }),
      ...(sizing?.askHalfSpreadBps === undefined
        ? {}
        : { askHalfSpreadBps: sizing.askHalfSpreadBps }),
      volatilitySpreadMultiplier: sizing?.volatilitySpreadMultiplier ?? 1,
      maximumVolatilitySpreadMultiplier: sizing?.maximumVolatilitySpreadMultiplier ?? 3,
      minimumTierOneNotionalUsd:
        sizing?.entryHeadroomUsd === undefined && (sizing?.minimumNotionalUsd ?? 0) >= 10
          ? (sizing?.minimumNotionalUsd ?? 0) + 0.5
          : (sizing?.minimumNotionalUsd ?? 0),
    },
  });
  const configuredCandidateDistances = sizing?.candidateDistanceBps?.filter(
    (distance) => Number.isFinite(distance) && distance > 0,
  );
  const configuredBidCandidateDistances =
    sizing?.bidCandidateDistanceBps?.filter(
      (distance) => Number.isFinite(distance) && distance > 0,
    ) ?? configuredCandidateDistances;
  const configuredAskCandidateDistances =
    sizing?.askCandidateDistanceBps?.filter(
      (distance) => Number.isFinite(distance) && distance > 0,
    ) ?? configuredCandidateDistances;
  const candidateSearchDepth = Math.max(
    1,
    Math.min(
      12,
      Math.floor(
        Math.max(
          configuredBidCandidateDistances?.length ?? 0,
          configuredAskCandidateDistances?.length ?? 0,
          sizing?.candidateSearchDepthPerSide ?? 1,
        ),
      ),
    ),
  );
  let candidateLevels =
    candidateSearchDepth === 1
      ? ladder.levels
      : Array.from({ length: candidateSearchDepth }, (_value, index) => {
          const minimumPriceStepBps = (input.metadata.tickSize / midpoint) * 10_000;
          const baseBidDistanceBps = sizing?.bidHalfSpreadBps ?? sizing?.halfSpreadBps ?? 0;
          const baseAskDistanceBps = sizing?.askHalfSpreadBps ?? sizing?.halfSpreadBps ?? 0;
          const bidDistanceBps =
            configuredBidCandidateDistances?.[index] ??
            baseBidDistanceBps + index * Math.max(baseBidDistanceBps, minimumPriceStepBps);
          const askDistanceBps =
            configuredAskCandidateDistances?.[index] ??
            baseAskDistanceBps + index * Math.max(baseAskDistanceBps, minimumPriceStepBps);
          return buildDecibelSmartLadderV1({
            bestBid: input.book.bestBid,
            bestAsk: input.book.bestAsk,
            tickSize: input.metadata.tickSize,
            lotSize: input.metadata.lotSize,
            minimumSize: input.metadata.minimumSize,
            inventoryBase: input.actualInventoryBase,
            maximumAbsPositionBase,
            availableCollateralUsd:
              sizing === undefined
                ? quantity * midpoint * 2
                : sizing.availableMarginUsd + reusableOpenOrderMarginUsd,
            maximumEffectiveLeverage: sizing?.maximumEffectiveLeverage ?? 1,
            maximumNotionalUsd: sizing?.maximumNotionalUsd ?? quantity * midpoint * 2,
            ...(sizing?.entryHeadroomUsd === undefined
              ? {}
              : { entryHeadroomUsd: sessionUnwindRequested ? 0 : sizing.entryHeadroomUsd }),
            fairPrice: fair.fairPrice ?? midpoint,
            maximumInventoryPriceSkewBps: sizing?.maximumInventoryPriceSkewBps ?? 2,
            configuration: {
              maximumLevelsPerSide: 1,
              maximumAggregateCollateralFraction: sizing?.maximumAggregateCollateralFraction ?? 0.5,
              levelAllocations: [1],
              baseHalfSpreadBps: sizing?.halfSpreadBps ?? 0,
              bidHalfSpreadBps: bidDistanceBps,
              askHalfSpreadBps: askDistanceBps,
              volatilitySpreadMultiplier: sizing?.volatilitySpreadMultiplier ?? 1,
              maximumVolatilitySpreadMultiplier: sizing?.maximumVolatilitySpreadMultiplier ?? 3,
              minimumTierOneNotionalUsd:
                sizing?.entryHeadroomUsd === undefined && (sizing?.minimumNotionalUsd ?? 0) >= 10
                  ? (sizing?.minimumNotionalUsd ?? 0) + 0.5
                  : (sizing?.minimumNotionalUsd ?? 0),
            },
          }).levels.map((level) => ({
            ...level,
            levelId: `${level.side}-CANDIDATE-${index + 1}`,
          }));
        }).flat();
  // A protective candidate must exist independently of entry ladder funding.
  // Reuse the identical price policy, then apply authenticated reduction sizing
  // and TP economics below. This is a candidate, never confirmed coverage.
  if (sizing?.assessReducingCandidate && input.actualInventoryBase !== 0) {
    const side = input.actualInventoryBase > 0 ? 'SELL' : 'BUY';
    const exitQuantity = floorDecibelQuantityToLotV1(
      Math.abs(input.actualInventoryBase),
      input.metadata.lotSize,
    );
    if (
      !candidateLevels.some((level) => level.side === side) &&
      exitQuantity >= input.metadata.minimumSize
    ) {
      const distance =
        side === 'BUY' ? configuredBidCandidateDistances : configuredAskCandidateDistances;
      const halfSpreadBps =
        (candidateSearchDepth > 1 ? distance?.[0] : undefined) ??
        (side === 'BUY' ? sizing.bidHalfSpreadBps : sizing.askHalfSpreadBps) ??
        sizing.halfSpreadBps ??
        0;
      const price = calculateDecibelLadderPriceV1({
        side,
        bestBid: input.book.bestBid,
        bestAsk: input.book.bestAsk,
        tickSize: input.metadata.tickSize,
        fairPrice: fair.fairPrice ?? midpoint,
        pressure: Math.max(-1, Math.min(1, input.actualInventoryBase / maximumAbsPositionBase)),
        maximumInventoryPriceSkewBps: sizing.maximumInventoryPriceSkewBps ?? 2,
        halfSpreadBps,
        spreadMultiplier: Math.max(
          1,
          Math.min(
            sizing.maximumVolatilitySpreadMultiplier ?? 3,
            sizing.volatilitySpreadMultiplier ?? 1,
          ),
        ),
        level: 1,
      });
      candidateLevels = [
        ...candidateLevels,
        {
          side,
          levelId: `${side}-1`,
          price,
          quantity: exitQuantity,
          notionalUsd: exitQuantity * price,
          rawBudgetUsd: exitQuantity * price,
          skewStatus: 'INVENTORY_REDUCING_SIDE',
        },
      ];
    }
  }
  const bidRawBudgetUsd =
    candidateLevels.find((level) => level.side === 'BUY')?.rawBudgetUsd ?? null;
  const askRawBudgetUsd =
    candidateLevels.find((level) => level.side === 'SELL')?.rawBudgetUsd ?? null;
  if (input.actualInventoryBase === 0 && sizing?.flatPairSharedBaseQuantity !== undefined) {
    const sharedQuantity = sizing.flatPairSharedBaseQuantity;
    candidateLevels = candidateLevels
      .map((level) => ({
        ...level,
        quantity: sharedQuantity,
        notionalUsd: level.price * sharedQuantity,
      }))
      .filter(
        (level) =>
          sharedQuantity + Number.EPSILON >= input.metadata.minimumSize &&
          level.notionalUsd + Number.EPSILON >= (sizing.minimumNotionalUsd ?? 0) &&
          level.notionalUsd <= sizing.maximumNotionalUsd + Number.EPSILON,
      );
  }
  // Apply current budgets after cohort normalization and before economic admission.
  const getActionMinimumNotional = (side: 'BUY' | 'SELL') =>
    sizing?.assessReducingCandidate !== undefined &&
    ((input.actualInventoryBase > 0 && side === 'SELL') ||
      (input.actualInventoryBase < 0 && side === 'BUY'))
      ? 0
      : (sizing?.minimumNotionalUsd ?? 0);
  if (sizing?.constrainQuoteQuantity !== undefined)
    candidateLevels = candidateLevels.flatMap((level) => {
      const quantity = sizing.constrainQuoteQuantity!(level);
      return quantity > 0 ? [{ ...level, quantity, notionalUsd: quantity * level.price }] : [];
    });
  let desiredBidLadder = candidateLevels
    .filter(
      (level) =>
        level.side === 'BUY' &&
        policy.desiredBidPrice !== null &&
        level.notionalUsd + Number.EPSILON >= getActionMinimumNotional('BUY'),
    )
    .map((level, index) =>
      desiredOrder({
        sessionId: input.sessionId,
        strategyConfigId: input.strategyConfigId,
        side: 'BUY',
        price: level.price,
        quantity: level.quantity,
        generation: generation.BUY + index,
        levelId: level.levelId,
        skewStatus: level.skewStatus,
      }),
    );
  let desiredAskLadder = candidateLevels
    .filter(
      (level) =>
        level.side === 'SELL' &&
        policy.desiredAskPrice !== null &&
        level.notionalUsd + Number.EPSILON >= getActionMinimumNotional('SELL'),
    )
    .map((level, index) =>
      desiredOrder({
        sessionId: input.sessionId,
        strategyConfigId: input.strategyConfigId,
        side: 'SELL',
        price: level.price,
        quantity: level.quantity,
        generation: generation.SELL + index,
        levelId: level.levelId,
        skewStatus: level.skewStatus,
      }),
    );
  let desiredBid: decibel_desired_recycling_order_v1 | null = desiredBidLadder[0] ?? null;
  let desiredAsk: decibel_desired_recycling_order_v1 | null = desiredAskLadder[0] ?? null;
  const cappedBid = capInventoryReductionToNeutralBandV1(
    desiredBid,
    input,
    midpoint,
    getActionMinimumNotional('BUY'),
    sizing?.entryHeadroomUsd !== undefined,
  );
  const cappedAsk = capInventoryReductionToNeutralBandV1(
    desiredAsk,
    input,
    midpoint,
    getActionMinimumNotional('SELL'),
    sizing?.entryHeadroomUsd !== undefined,
  );
  if (sizing?.entryHeadroomUsd !== undefined) {
    const capCandidates = (orders: readonly decibel_desired_recycling_order_v1[]) =>
      orders.flatMap((order) => {
        const capped = capInventoryReductionToNeutralBandV1(
          order,
          input,
          midpoint,
          getActionMinimumNotional(order.side),
          true,
        ).order;
        return capped === null ? [] : [capped];
      });
    desiredBidLadder = capCandidates(desiredBidLadder);
    desiredAskLadder = capCandidates(desiredAskLadder);
  } else {
    if (cappedBid.order !== desiredBid)
      desiredBidLadder = cappedBid.order === null ? [] : [cappedBid.order];
    if (cappedAsk.order !== desiredAsk)
      desiredAskLadder = cappedAsk.order === null ? [] : [cappedAsk.order];
  }
  const fairPrice = fair.fairPrice ?? null;
  const makerFeeBps = sizing?.makerFeeBps ?? null;
  const estimatedGasCostUsd = sizing?.estimatedGasCostUsd ?? null;
  const adverseSelectionBufferBps = sizing?.adverseSelectionBufferBps ?? null;
  const bidAdverseSelectionBufferBps =
    sizing?.bidAdverseSelectionBufferBps ?? adverseSelectionBufferBps;
  const askAdverseSelectionBufferBps =
    sizing?.askAdverseSelectionBufferBps ?? adverseSelectionBufferBps;
  const safetyMarginBps = sizing?.safetyMarginBps ?? 1;
  // Replace the distance target for new exposure with the nearest price that
  // pays the unchanged admission costs. Keep the admitted quantity and all caps.
  const priceEntry = (order: decibel_desired_recycling_order_v1) => {
    if (sizing === undefined || input.actualInventoryBase * (order.side === 'BUY' ? 1 : -1) < 0)
      return order;
    const price = calculateDecibelClosestEntryPriceV1({
      side: order.side,
      quantity: order.quantity,
      midpoint,
      bestBid: input.book.bestBid,
      bestAsk: input.book.bestAsk,
      tickSize: input.metadata.tickSize,
      makerFeeBps,
      gasCostUsd: estimatedGasCostUsd,
      safetyMarginBps,
    });
    if (
      price === null ||
      price * order.quantity > sizing.maximumNotionalUsd ||
      price * order.quantity < sizing.minimumNotionalUsd
    )
      return order;
    const candidate = { ...order, price };
    if (sizing.constrainQuoteQuantity && sizing.constrainQuoteQuantity(candidate) < order.quantity)
      return order;
    return candidate;
  };
  desiredBidLadder = desiredBidLadder.map(priceEntry);
  desiredAskLadder = desiredAskLadder.map(priceEntry);
  // After a TP fill the next entry rests at least the re-entry distance away from that
  // exit price (A - x for BUY, A + x for SELL) instead of at the closest admissible price.
  const entryLimits = input.actualInventoryBase === 0 ? sizing?.entryPriceLimits : undefined;
  const limitEntry = (order: decibel_desired_recycling_order_v1) => {
    const limit = order.side === 'BUY' ? entryLimits?.BUY : entryLimits?.SELL;
    if (limit === undefined || !(limit > 0)) return order;
    const price =
      order.side === 'BUY' ? Math.min(order.price, limit) : Math.max(order.price, limit);
    return price === order.price ? order : { ...order, price };
  };
  desiredBidLadder = desiredBidLadder.map(limitEntry);
  desiredAskLadder = desiredAskLadder.map(limitEntry);
  const getCandidateAdverse = (
    order: decibel_desired_recycling_order_v1,
    fallback: number | null,
  ): Readonly<{
    distanceBps: number;
    adverseSelectionBps: number | null;
    source: 'CANDIDATE_P95' | 'GLOBAL_FALLBACK' | 'NOT_APPLIED';
  }> => {
    // ENTRY carries no adverse estimate. The legacy resolver below is retained
    // only for reducing candidates; position/TP economics are unchanged.
    if (input.actualInventoryBase * (order.side === 'BUY' ? 1 : -1) >= 0)
      return Object.freeze({
        distanceBps: Math.abs(((order.price - midpoint) / midpoint) * 10000),
        adverseSelectionBps: 0,
        source: 'NOT_APPLIED' as const,
      });
    return resolveDecibelCandidateAdverseSelectionV1({
      side: order.side,
      price: order.price,
      fairPrice,
      midpoint,
      tickSize: input.metadata.tickSize,
      now: input.now,
      fallback,
      observations: sizing?.candidateAdverseSelection,
    });
  };
  const requiredEdge = (
    order: decibel_desired_recycling_order_v1 | null,
    adverseSelectionBps: number | null,
  ): number | null => {
    const cost = lifecycleCost(order, adverseSelectionBps);
    return cost === null || order === null ? null : (cost * order.price) / midpoint;
  };
  const lifecycleCost = (
    order: decibel_desired_recycling_order_v1 | null,
    candidateAdverseSelectionBps: number | null,
  ): number | null =>
    order === null
      ? null
      : calculateDecibelLifecycleCostBpsV1({
          notionalUsd: order.price * order.quantity,
          makerFeeBps,
          gasCostUsd: estimatedGasCostUsd,
          adverseSelectionBps: candidateAdverseSelectionBps,
          safetyMarginBps,
        });
  const bidCandidatesEvaluated = desiredBidLadder.length;
  const askCandidatesEvaluated = desiredAskLadder.length;
  const buildCandidateCosts = (
    candidates: readonly decibel_desired_recycling_order_v1[],
    fallback: number | null,
  ) =>
    Object.freeze(
      candidates.flatMap((candidate) => {
        const adverse = getCandidateAdverse(candidate, fallback);
        const cost = lifecycleCost(candidate, adverse.adverseSelectionBps);
        return cost === null || adverse.adverseSelectionBps === null
          ? []
          : [
              Object.freeze({
                order: candidate,
                distanceBps: adverse.distanceBps,
                adverseSelectionBps: adverse.adverseSelectionBps,
                lifecycleCostBps: cost,
                adverseSource: adverse.source,
              }),
            ];
      }),
    );
  const bidCandidateEvaluations = buildCandidateCosts(
    desiredBidLadder,
    bidAdverseSelectionBufferBps,
  );
  const askCandidateEvaluations = buildCandidateCosts(
    desiredAskLadder,
    askAdverseSelectionBufferBps,
  );
  const dynamicAdmission = sizing?.entryHeadroomUsd !== undefined;
  const candidateAdverseForAdmission = (
    order: decibel_desired_recycling_order_v1,
    fallback: number | null,
  ) =>
    input.actualInventoryBase * (order.side === 'BUY' ? 1 : -1) >= 0
      ? 0
      : dynamicAdmission
        ? getCandidateAdverse(order, fallback).adverseSelectionBps
        : fallback;
  const selectExecutableCandidate = (
    candidates: readonly decibel_desired_recycling_order_v1[],
    globalAdverseSelectionBps: number | null,
  ): decibel_desired_recycling_order_v1 | null =>
    [...candidates].sort((left, right) => {
      const edgeEligible = (order: decibel_desired_recycling_order_v1) => {
        // A TP is admitted against its authenticated entry basis below, not
        // against entry edge or adverse distance reserves around current fair.
        if (
          !dynamicAdmission ||
          (sizing?.assessReducingCandidate &&
            input.actualInventoryBase * (order.side === 'BUY' ? 1 : -1) < 0)
        )
          return 1;
        const edge =
          fairPrice === null
            ? -Infinity
            : ((order.side === 'BUY' ? fairPrice - order.price : order.price - fairPrice) /
                fairPrice) *
              10000;
        const required = requiredEdge(
          order,
          candidateAdverseForAdmission(order, globalAdverseSelectionBps),
        );
        const admission = evaluateDecibelLifecycleCostAdmissionV1(
          lifecycleCost(order, candidateAdverseForAdmission(order, globalAdverseSelectionBps)),
          input.openOrders.some((current) => current.side === order.side),
        );
        return Number(
          required !== null &&
            edge + 1e-9 >= required &&
            admission === 'VOLUME_COST_BUDGET_ELIGIBLE',
        );
      };
      return (
        edgeEligible(right) - edgeEligible(left) ||
        // Once admission is met, USD gas dilution is not a reason to quote
        // farther away. Prefer the most competitive maker price, not extra
        // theoretical edge or a larger notional denominator.
        (dynamicAdmission
          ? left.side === 'BUY'
            ? right.price - left.price
            : left.price - right.price
          : 0) ||
        (lifecycleCost(left, candidateAdverseForAdmission(left, globalAdverseSelectionBps)) ??
          Number.POSITIVE_INFINITY) -
          (lifecycleCost(right, candidateAdverseForAdmission(right, globalAdverseSelectionBps)) ??
            Number.POSITIVE_INFINITY) ||
        (left.levelId ?? '').localeCompare(right.levelId ?? '')
      );
    })[0] ?? null;
  desiredBid = selectExecutableCandidate(desiredBidLadder, bidAdverseSelectionBufferBps);
  desiredAsk = selectExecutableCandidate(desiredAskLadder, askAdverseSelectionBufferBps);
  // Recover only an already committed quantity repair, at its existing price.
  // Candidate quantity still comes from fresh inventory and shared sizing.
  if (sizing?.committedCoveragePrice !== undefined && input.actualInventoryBase !== 0) {
    if (input.actualInventoryBase > 0 && desiredAsk)
      desiredAsk = { ...desiredAsk, price: sizing.committedCoveragePrice };
    if (input.actualInventoryBase < 0 && desiredBid)
      desiredBid = { ...desiredBid, price: sizing.committedCoveragePrice };
  }
  let constructedTPBlocker: string | null = null;
  if (
    sizing?.constructReducingCandidate &&
    sizing.committedCoveragePrice === undefined &&
    input.actualInventoryBase !== 0 &&
    !sizing.riskReductionRequired &&
    !sizing.sessionUnwindRequested
  ) {
    const candidate = input.actualInventoryBase > 0 ? desiredAsk : desiredBid;
    if (candidate) {
      const constructed = sizing.constructReducingCandidate(candidate);
      constructedTPBlocker = constructed.blocker;
      if (constructed.price !== null) {
        if (candidate.side === 'SELL') desiredAsk = { ...candidate, price: constructed.price };
        else desiredBid = { ...candidate, price: constructed.price };
      }
    }
  }
  const expectedBidEdgeBps =
    fairPrice === null || desiredBid === null
      ? null
      : ((fairPrice - desiredBid.price) / fairPrice) * 10_000;
  const expectedAskEdgeBps =
    fairPrice === null || desiredAsk === null
      ? null
      : ((desiredAsk.price - fairPrice) / fairPrice) * 10_000;
  desiredBidLadder = desiredBid === null ? [] : [desiredBid];
  desiredAskLadder = desiredAsk === null ? [] : [desiredAsk];
  const selectedBidAdverse =
    desiredBid === null
      ? bidAdverseSelectionBufferBps
      : candidateAdverseForAdmission(desiredBid, bidAdverseSelectionBufferBps);
  const selectedAskAdverse =
    desiredAsk === null
      ? askAdverseSelectionBufferBps
      : candidateAdverseForAdmission(desiredAsk, askAdverseSelectionBufferBps);
  const requiredBidEdgeBps = requiredEdge(desiredBid, selectedBidAdverse);
  const requiredAskEdgeBps = requiredEdge(desiredAsk, selectedAskAdverse);
  const bidLifecycleCostBps = lifecycleCost(desiredBid, selectedBidAdverse);
  const askLifecycleCostBps = lifecycleCost(desiredAsk, selectedAskAdverse);
  const bidHasRestingOrder = input.openOrders.some((order) => order.side === 'BUY');
  const askHasRestingOrder = input.openOrders.some((order) => order.side === 'SELL');
  const bidLifecycleAdmission = evaluateDecibelLifecycleCostAdmissionV1(
    bidLifecycleCostBps,
    bidHasRestingOrder,
  );
  const askLifecycleAdmission = evaluateDecibelLifecycleCostAdmissionV1(
    askLifecycleCostBps,
    askHasRestingOrder,
  );
  const withoutCandidateOrder = (candidate: (typeof bidCandidateEvaluations)[number]) =>
    Object.freeze({
      distanceBps: candidate.distanceBps,
      adverseSelectionBps: candidate.adverseSelectionBps,
      lifecycleCostBps: candidate.lifecycleCostBps,
      adverseSource: candidate.adverseSource,
    });
  const bidCandidateCosts = Object.freeze(bidCandidateEvaluations.map(withoutCandidateOrder));
  const askCandidateCosts = Object.freeze(askCandidateEvaluations.map(withoutCandidateOrder));
  let bidEligibilityReason =
    cappedBid.reason ??
    (desiredBid === null
      ? 'NO_QUOTE_CANDIDATE'
      : sizing?.bidEvidenceSufficient === false
        ? 'REGIME_SIDE_EVIDENCE_INSUFFICIENT'
        : requiredBidEdgeBps === null
          ? 'ECONOMIC_INPUT_UNKNOWN'
          : dynamicAdmission &&
              bidLifecycleAdmission === 'VOLUME_COST_BUDGET_ELIGIBLE' &&
              expectedBidEdgeBps !== null &&
              expectedBidEdgeBps + 1e-9 < requiredBidEdgeBps
            ? 'SPREAD_EDGE_INSUFFICIENT'
            : bidLifecycleAdmission);
  let askEligibilityReason =
    cappedAsk.reason ??
    (desiredAsk === null
      ? 'NO_QUOTE_CANDIDATE'
      : sizing?.askEvidenceSufficient === false
        ? 'REGIME_SIDE_EVIDENCE_INSUFFICIENT'
        : requiredAskEdgeBps === null
          ? 'ECONOMIC_INPUT_UNKNOWN'
          : dynamicAdmission &&
              askLifecycleAdmission === 'VOLUME_COST_BUDGET_ELIGIBLE' &&
              expectedAskEdgeBps !== null &&
              expectedAskEdgeBps + 1e-9 < requiredAskEdgeBps
            ? 'SPREAD_EDGE_INSUFFICIENT'
            : askLifecycleAdmission);
  const bidTP = input.actualInventoryBase < 0 && sizing?.assessReducingCandidate !== undefined;
  const askTP = input.actualInventoryBase > 0 && sizing?.assessReducingCandidate !== undefined;
  const bidTPReason =
    bidTP && desiredBid
      ? (constructedTPBlocker ?? sizing.assessReducingCandidate(desiredBid))
      : null;
  const askTPReason =
    askTP && desiredAsk
      ? (constructedTPBlocker ?? sizing.assessReducingCandidate(desiredAsk))
      : null;
  if (bidTP && desiredBid) bidEligibilityReason = bidTPReason ?? 'TP_COVERAGE_REPAIR_ELIGIBLE';
  if (askTP && desiredAsk) askEligibilityReason = askTPReason ?? 'TP_COVERAGE_REPAIR_ELIGIBLE';
  if (
    bidTP
      ? bidTPReason !== null
      : sizing?.bidEvidenceSufficient === false ||
        requiredBidEdgeBps === null ||
        bidLifecycleAdmission !== 'VOLUME_COST_BUDGET_ELIGIBLE' ||
        (dynamicAdmission &&
          requiredBidEdgeBps !== null &&
          expectedBidEdgeBps !== null &&
          expectedBidEdgeBps + 1e-9 < requiredBidEdgeBps)
  ) {
    desiredBid = null;
    desiredBidLadder = [];
  }
  if (
    askTP
      ? askTPReason !== null
      : sizing?.askEvidenceSufficient === false ||
        requiredAskEdgeBps === null ||
        askLifecycleAdmission !== 'VOLUME_COST_BUDGET_ELIGIBLE' ||
        (dynamicAdmission &&
          requiredAskEdgeBps !== null &&
          expectedAskEdgeBps !== null &&
          expectedAskEdgeBps + 1e-9 < requiredAskEdgeBps)
  ) {
    desiredAsk = null;
    desiredAskLadder = [];
  }
  let status: DecibelAuthenticatedPassiveRecyclingEvaluationV1['status'] = 'READY';
  let strategyState: DecibelAuthenticatedPassiveRecyclingEvaluationV1['strategyState'] =
    policy.state;
  const sessionUnwind = sessionUnwindRequested;
  const inventoryNotionalUsd = Math.abs(input.actualInventoryBase) * midpoint;
  const targetReductionNotionalUsd = Math.max(
    0,
    inventoryNotionalUsd - DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1,
  );
  const reductionMinimumNotionalDeadZone =
    !sessionUnwind &&
    inventoryNotionalUsd > DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1 &&
    targetReductionNotionalUsd + Number.EPSILON < (sizing?.minimumNotionalUsd ?? 0);
  const unwindDustBelowMinimum =
    sessionUnwind &&
    input.actualInventoryBase !== 0 &&
    Math.abs(input.actualInventoryBase) + Number.EPSILON < input.metadata.minimumSize;
  const positionLimitReached =
    !sizing?.entryEvidenceBlocker &&
    input.actualInventoryBase !== 0 &&
    Math.abs(input.actualInventoryBase) >= maximumAbsPositionBase;
  const riskReduction =
    !sessionUnwind &&
    (sizing?.riskReductionRequired === true ||
      positionLimitReached ||
      reductionMinimumNotionalDeadZone);
  const riskReductionTrigger: DecibelAuthenticatedPassiveRecyclingEvaluationV1['riskReductionTrigger'] =
    sessionUnwind
      ? 'SESSION_UNWIND'
      : sizing?.riskReductionRequired === true
        ? 'EXPLICIT_RISK_REDUCTION_REQUEST'
        : positionLimitReached
          ? 'POSITION_LIMIT_REACHED'
          : reductionMinimumNotionalDeadZone
            ? 'REDUCTION_MINIMUM_NOTIONAL_DEAD_ZONE'
            : 'NONE';
  let operatingState: DecibelAuthenticatedPassiveRecyclingEvaluationV1['operatingState'] =
    riskReduction
      ? 'RISK_REDUCTION'
      : Math.abs(input.actualInventoryBase) >= maximumAbsPositionBase / 2
        ? 'INVENTORY_PRESSURE'
        : 'NORMAL_MM';
  if (unwindDustBelowMinimum) {
    desiredBid = null;
    desiredAsk = null;
    desiredBidLadder = [];
    desiredAskLadder = [];
    status = 'STOPPING';
    strategyState = 'STOPPING';
    operatingState = 'DUST_BELOW_MIN_SIZE';
    bidEligibilityReason = 'DUST_BELOW_MIN_SIZE';
    askEligibilityReason = 'DUST_BELOW_MIN_SIZE';
  } else if (sessionUnwind && input.actualInventoryBase === 0) {
    desiredBid = null;
    desiredAsk = null;
    desiredBidLadder = [];
    desiredAskLadder = [];
    status = 'SESSION_COMPLETE';
    strategyState = 'STOPPING';
    operatingState = 'SESSION_UNWIND';
    bidEligibilityReason = 'SESSION_COMPLETE_FLAT';
    askEligibilityReason = 'SESSION_COMPLETE_FLAT';
  } else if (sessionUnwind || riskReduction) {
    const reducingQuantity = floorDecibelQuantityToLotV1(
      Math.abs(input.actualInventoryBase),
      input.metadata.lotSize,
    );
    const buildUnwindOrder = (side: 'BUY' | 'SELL') =>
      reducingQuantity < input.metadata.minimumSize
        ? null
        : desiredOrder({
            sessionId: input.sessionId,
            strategyConfigId: input.strategyConfigId,
            side,
            price:
              side === 'BUY'
                ? roundPriceUpToTick(input.book.bestAsk, input.metadata.tickSize)
                : roundPriceDownToTick(input.book.bestBid, input.metadata.tickSize),
            quantity: reducingQuantity,
            timeInForce: 'ImmediateOrCancel',
            generation: generation[side],
            levelId: `${side}-UNWIND`,
            skewStatus: 'INVENTORY_REDUCING_SIDE',
          });
    const buildRiskReductionMakerOrder = (side: 'BUY' | 'SELL') => {
      if (reducingQuantity < input.metadata.minimumSize) return null;
      const price = side === 'BUY' ? policy.desiredBidPrice : policy.desiredAskPrice;
      if (price === null) return null;
      return desiredOrder({
        sessionId: input.sessionId,
        strategyConfigId: input.strategyConfigId,
        side,
        price,
        quantity: reducingQuantity,
        generation: generation[side],
        levelId: `${side}-RISK-REDUCTION`,
        skewStatus: 'INVENTORY_REDUCING_SIDE',
      });
    };
    desiredBidLadder = sessionUnwind
      ? []
      : ladder.levels
          .filter((level) => level.side === 'BUY')
          .map((level, index) =>
            desiredOrder({
              sessionId: input.sessionId,
              strategyConfigId: input.strategyConfigId,
              side: 'BUY',
              price: level.price,
              quantity: level.quantity,
              generation: generation.BUY + index,
              levelId: level.levelId,
              skewStatus: level.skewStatus,
            }),
          );
    desiredAskLadder = sessionUnwind
      ? []
      : ladder.levels
          .filter((level) => level.side === 'SELL')
          .map((level, index) =>
            desiredOrder({
              sessionId: input.sessionId,
              strategyConfigId: input.strategyConfigId,
              side: 'SELL',
              price: level.price,
              quantity: level.quantity,
              generation: generation.SELL + index,
              levelId: level.levelId,
              skewStatus: level.skewStatus,
            }),
          );
    if (input.actualInventoryBase > 0) {
      desiredBid = null;
      desiredBidLadder = [];
      const unwindOrder = sessionUnwind
        ? buildUnwindOrder('SELL')
        : (desiredAskLadder[0] ?? buildRiskReductionMakerOrder('SELL'));
      desiredAskLadder =
        unwindOrder === undefined || unwindOrder === null
          ? []
          : [
              sessionUnwind
                ? unwindOrder
                : desiredOrder({
                    sessionId: input.sessionId,
                    strategyConfigId: input.strategyConfigId,
                    side: 'SELL',
                    price: unwindOrder.price,
                    quantity: Math.min(unwindOrder.quantity, reducingQuantity),
                    generation: unwindOrder.generation,
                    ...(unwindOrder.levelId === undefined ? {} : { levelId: unwindOrder.levelId }),
                    ...(unwindOrder.skewStatus === undefined
                      ? {}
                      : { skewStatus: unwindOrder.skewStatus }),
                  }),
            ];
      desiredAsk = desiredAskLadder[0] ?? null;
      bidEligibilityReason = 'INVENTORY_REDUCTION_SIDE_ONLY';
      askEligibilityReason =
        desiredAsk === null ? 'REDUCTION_QUOTE_UNAVAILABLE' : 'REDUCTION_QUOTE_ELIGIBLE';
    } else if (input.actualInventoryBase < 0) {
      desiredAsk = null;
      desiredAskLadder = [];
      const unwindOrder = sessionUnwind
        ? buildUnwindOrder('BUY')
        : (desiredBidLadder[0] ?? buildRiskReductionMakerOrder('BUY'));
      desiredBidLadder =
        unwindOrder === undefined || unwindOrder === null
          ? []
          : [
              sessionUnwind
                ? unwindOrder
                : desiredOrder({
                    sessionId: input.sessionId,
                    strategyConfigId: input.strategyConfigId,
                    side: 'BUY',
                    price: unwindOrder.price,
                    quantity: Math.min(unwindOrder.quantity, reducingQuantity),
                    generation: unwindOrder.generation,
                    ...(unwindOrder.levelId === undefined ? {} : { levelId: unwindOrder.levelId }),
                    ...(unwindOrder.skewStatus === undefined
                      ? {}
                      : { skewStatus: unwindOrder.skewStatus }),
                  }),
            ];
      desiredBid = desiredBidLadder[0] ?? null;
      askEligibilityReason = 'INVENTORY_REDUCTION_SIDE_ONLY';
      bidEligibilityReason =
        desiredBid === null ? 'REDUCTION_QUOTE_UNAVAILABLE' : 'REDUCTION_QUOTE_ELIGIBLE';
    } else {
      desiredBid = null;
      desiredAsk = null;
      desiredBidLadder = [];
      desiredAskLadder = [];
      bidEligibilityReason = 'SESSION_COMPLETE_FLAT';
      askEligibilityReason = 'SESSION_COMPLETE_FLAT';
    }
    if (sessionUnwind) {
      status = 'STOPPING';
      strategyState = 'STOPPING';
      operatingState = 'SESSION_UNWIND';
    }
  }
  const coverage = calculateDecibelExitCoverageV1(input);
  // DCA was removed: an open position is never grown, only reduced.
  if (input.actualInventoryBase !== 0) {
    if (input.actualInventoryBase > 0 && desiredBid !== null) {
      desiredBid = null;
      desiredBidLadder = [];
      bidEligibilityReason = 'POSITION_GROWTH_DISABLED';
    } else if (input.actualInventoryBase < 0 && desiredAsk !== null) {
      desiredAsk = null;
      desiredAskLadder = [];
      askEligibilityReason = 'POSITION_GROWTH_DISABLED';
    }
  }
  if (sizing?.entryHeadroomUsd !== undefined && coverage.entryPaused && !sessionUnwind) {
    if (input.actualInventoryBase > 0) {
      desiredBid = null;
      desiredBidLadder = [];
      bidEligibilityReason = 'INVENTORY_EXIT_COVERAGE_REQUIRED';
    } else {
      desiredAsk = null;
      desiredAskLadder = [];
      askEligibilityReason = 'INVENTORY_EXIT_COVERAGE_REQUIRED';
    }
  }
  if ((input.pendingExitQuantityBase ?? 0) > 0 && !sessionUnwind) {
    if (input.actualInventoryBase > 0) {
      desiredAsk = null;
      desiredAskLadder = [];
      askEligibilityReason = 'PENDING_EXIT_RECONCILIATION_REQUIRED';
    } else if (input.actualInventoryBase < 0) {
      desiredBid = null;
      desiredBidLadder = [];
      bidEligibilityReason = 'PENDING_EXIT_RECONCILIATION_REQUIRED';
    }
  }
  let actions: readonly decibel_recycling_action_v1[] = Object.freeze(
    (['BUY', 'SELL'] as const).flatMap((side) => {
      const current = input.openOrders
        .filter((order) => order.side === side)
        .sort((left, right) =>
          side === 'BUY' ? right.price - left.price : left.price - right.price,
        );
      const desired = (side === 'BUY' ? desiredBidLadder : desiredAskLadder).slice();
      const eligibilityReason = side === 'BUY' ? bidEligibilityReason : askEligibilityReason;
      const inventoryNotionalUsd = Math.abs(input.actualInventoryBase) * midpoint;
      const exposureIncreasingOutsideNeutralBand =
        sizing?.entryHeadroomUsd === undefined &&
        inventoryNotionalUsd > DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1 &&
        ((input.actualInventoryBase > 0 && side === 'BUY') ||
          (input.actualInventoryBase < 0 && side === 'SELL'));
      const count = Math.max(current.length, desired.length);
      return Array.from({ length: count }, (_value, index) => {
        const currentOrder = current[index] ?? null;
        const desiredOrderAtIndex = desired[index] ?? null;
        const reductionMode =
          operatingState === 'RISK_REDUCTION' || operatingState === 'SESSION_UNWIND';
        const exitSide = input.actualInventoryBase > 0 ? 'SELL' : 'BUY';
        const verifiedExit =
          currentOrder !== null &&
          currentOrder.reduceOnly === true &&
          side === exitSide &&
          currentOrder.quantity <= Math.abs(input.actualInventoryBase) + 1e-12;
        if (
          verifiedExit &&
          reductionMode &&
          ((input.pendingCancelOrderIds ?? []).includes(currentOrder.venueOrderId) ||
            (input.pendingExitQuantityBase ?? 0) > 0)
        )
          return Object.freeze({
            action: 'BLOCKED' as const,
            side,
            current: currentOrder,
            desired: null,
            reason: 'EXIT_CANCEL_RECONCILIATION_PENDING',
          });
        if (coverage.overCovered && currentOrder?.reduceOnly === true && !sessionUnwind)
          return Object.freeze({
            action: 'BLOCKED' as const,
            side,
            current: currentOrder,
            desired: null,
            reason: 'AGGREGATE_EXIT_COVERAGE_RECONCILIATION_REQUIRED',
          });
        if (
          currentOrder !== null &&
          side === exitSide &&
          input.actualInventoryBase !== 0 &&
          currentOrder.reduceOnly === undefined &&
          operatingState !== 'SESSION_UNWIND'
        )
          return Object.freeze({
            action: 'BLOCKED' as const,
            side,
            current: currentOrder,
            desired: desiredOrderAtIndex,
            reason: 'EXIT_REDUCE_ONLY_METADATA_UNVERIFIED',
          });
        if (
          verifiedExit &&
          !reductionMode &&
          (index === 0 || supportsDecibelMultipleReductionsV1(input))
        ) {
          if ((input.pendingCancelOrderIds ?? []).includes(currentOrder.venueOrderId))
            return Object.freeze({
              action: 'BLOCKED' as const,
              side,
              current: currentOrder,
              desired: null,
              reason: 'EXIT_CANCEL_RECONCILIATION_PENDING',
            });
          if ((input.pendingExitQuantityBase ?? 0) > 0)
            return Object.freeze({
              action: 'NO_OP' as const,
              side,
              current: currentOrder,
              desired: null,
              reason: 'KEEP:EXIT_RECONCILIATION_PENDING',
            });
          const price = currentOrder.price;
          const crossing =
            side === 'SELL' ? price <= input.book.bestBid : price >= input.book.bestAsk;
          if (!crossing) {
            const quantity = Math.min(
              Math.max(
                0,
                Math.abs(input.actualInventoryBase) -
                  current
                    .filter((order) => order.venueOrderId !== currentOrder.venueOrderId)
                    .reduce((sum, order) => sum + order.quantity, 0),
              ),
              (sizing?.maximumNotionalUsd ?? Infinity) / price,
              sizing?.constrainQuoteQuantity?.({
                side,
                price,
                quantity: Math.abs(input.actualInventoryBase),
              }) ??
                desiredOrderAtIndex?.quantity ??
                currentOrder.quantity,
            );
            const rounded = floorDecibelQuantityToLotV1(quantity, input.metadata.lotSize);
            if (
              coverage.entryPaused &&
              rounded > currentOrder.quantity + 1e-12 &&
              rounded + 1e-12 >= input.metadata.minimumSize
            )
              return Object.freeze({
                action: 'WOULD_REPLACE' as const,
                side,
                current: currentOrder,
                desired: Object.freeze({
                  ...(desiredOrderAtIndex ??
                    desiredOrder({
                      sessionId: input.sessionId,
                      strategyConfigId: input.strategyConfigId,
                      side,
                      price,
                      quantity: rounded,
                      generation: 0,
                    })),
                  price,
                  quantity: rounded,
                }),
                reason: 'EXIT_COVERAGE_UPSIZE',
                ...(desiredOrderAtIndex === null
                  ? {}
                  : {
                      priceCandidate: Object.freeze({ ...desiredOrderAtIndex, quantity: rounded }),
                    }),
              });
            if (
              desiredOrderAtIndex !== null &&
              desiredOrderAtIndex.quantity === currentOrder.quantity &&
              desiredOrderAtIndex.price !== currentOrder.price
            )
              return Object.freeze({
                action: 'WOULD_REPLACE' as const,
                side,
                current: currentOrder,
                desired: desiredOrderAtIndex,
                reason: 'TP_PRICE_REVIEW_REQUIRED',
              });
            return Object.freeze({
              action: 'NO_OP' as const,
              side,
              current: currentOrder,
              desired: desiredOrderAtIndex,
              reason: 'KEEP:VALID_REDUCE_ONLY_EXIT',
            });
          }
        }
        if (verifiedExit && !reductionMode)
          return Object.freeze({
            action: 'NO_OP' as const,
            side,
            current: currentOrder,
            desired: desiredOrderAtIndex,
            reason: 'KEEP:EXIT_ALREADY_EXECUTABLE_AWAIT_RECONCILIATION',
          });
        if (
          currentOrder !== null &&
          currentOrder.reduceOnly === false &&
          (reductionMode || (input.actualInventoryBase !== 0 && side === exitSide))
        )
          return Object.freeze({
            action: 'WOULD_CANCEL' as const,
            side,
            current: currentOrder,
            desired: desiredOrderAtIndex,
            reason: 'RISK_INVALID:REDUCE_ONLY_REQUIRED',
          });
        if (eligibilityReason === 'PENDING_EXIT_RECONCILIATION_REQUIRED')
          return Object.freeze({
            action: 'BLOCKED' as const,
            side,
            current: currentOrder,
            desired: null,
            reason: eligibilityReason,
          });
        const unavailableEvidence =
          (input.actualInventoryBase !== 0 && side === exitSide && sizing?.assessReducingCandidate
            ? null
            : sizing?.entryEvidenceBlocker) ??
          (/EVIDENCE|UNKNOWN|UNAVAILABLE|STALE/u.test(eligibilityReason)
            ? eligibilityReason
            : null);
        if (unavailableEvidence && !reductionMode && index === 0)
          return Object.freeze({
            action: 'BLOCKED' as const,
            side,
            current: currentOrder,
            desired: null,
            reason: `RECONCILE:${unavailableEvidence}`,
          });
        let entryEconomics: ReturnType<typeof assessDecibelRestingEntryEconomicsV1> | undefined;
        if (
          currentOrder?.reduceOnly === false &&
          !reductionMode &&
          index === 0 &&
          !exposureIncreasingOutsideNeutralBand
        ) {
          if (
            sizing?.maximumAbsPositionBase !== undefined &&
            Number.isFinite(sizing.maximumAbsPositionBase) &&
            currentOrder.quantity +
              Math.max(0, input.actualInventoryBase * (side === 'BUY' ? 1 : -1)) >
              sizing.maximumAbsPositionBase + 1e-12
          )
            return Object.freeze({
              action: 'WOULD_CANCEL' as const,
              side,
              current: currentOrder,
              desired: null,
              reason: 'RISK_INVALID:RESTING_ENTRY_EXCEEDS_POSITION_LIMIT',
            });
          entryEconomics = assessDecibelRestingEntryEconomicsV1({
            side,
            price: currentOrder.price,
            quantity: currentOrder.quantity,
            midpoint,
            makerFeeBps,
            gasCostUsd: estimatedGasCostUsd,
            safetyMarginBps,
          });
          if (entryEconomics.decision !== 'KEEP')
            return Object.freeze({
              action: 'BLOCKED' as const,
              side,
              current: currentOrder,
              desired: null,
              entryEconomics,
              reason: `RECONCILE:${entryEconomics.reason}`,
            });
          const entryReplacementEconomics = desiredOrderAtIndex
            ? assessDecibelEntryReplacementEconomicsV1({
                side,
                restingPrice: currentOrder.price,
                candidatePrice: desiredOrderAtIndex.price,
                restingQuantity: currentOrder.quantity,
                candidateQuantity: desiredOrderAtIndex.quantity,
                midpoint,
                makerFeeBps,
                gasCostUsd: estimatedGasCostUsd,
                safetyMarginBps,
                bestBid: input.book.bestBid,
                bestAsk: input.book.bestAsk,
                tickSize: input.metadata.tickSize,
                ...(input.book.depth === undefined ? {} : { depth: input.book.depth }),
                bookObservedAt: input.book.observedAt,
                now: input.now,
                maximumBookAgeMs: input.maxBboAgeMs,
                observedPriceMovementBps: sizing?.entryPriceMovementBps ?? 0,
                ...(sizing?.entryReplacementMinimumBps === undefined
                  ? {}
                  : { minimumStabilityBps: sizing.entryReplacementMinimumBps }),
              })
            : undefined;
          return Object.freeze({
            action:
              entryReplacementEconomics?.decision === 'REPLACE'
                ? ('WOULD_REPLACE' as const)
                : ('NO_OP' as const),
            side,
            current: currentOrder,
            // The fresh admission candidate and the working quote are distinct.
            // A KEEP plan preserves the authenticated price/time priority; raw
            // opportunity prices may still track the market for new PLACE.
            desired:
              desiredOrderAtIndex === null || entryReplacementEconomics?.decision === 'REPLACE'
                ? desiredOrderAtIndex
                : Object.freeze({
                    ...desiredOrderAtIndex,
                    price: currentOrder.price,
                    quantity: currentOrder.quantity,
                    clientOrderId: currentOrder.clientOrderId ?? desiredOrderAtIndex.clientOrderId,
                  }),
            ...(desiredOrderAtIndex === null ? {} : { priceCandidate: desiredOrderAtIndex }),
            entryEconomics,
            ...(entryReplacementEconomics ? { entryReplacementEconomics } : {}),
            reason: entryReplacementEconomics
              ? `${entryReplacementEconomics.decision === 'REPLACE' ? 'REPRICE' : 'KEEP'}:${entryReplacementEconomics.reason}`
              : `KEEP:${entryEconomics.reason}`,
          });
        }
        const missingDesiredReason =
          index > 0
            ? 'RISK_INVALID:MAX_ONE_ACTIVE_ORDER_PER_SIDE'
            : exposureIncreasingOutsideNeutralBand
              ? 'INVENTORY_INVALID:EXPOSURE_INCREASE_OUTSIDE_NEUTRAL_BAND'
              : eligibilityReason === 'NO_QUOTE_CANDIDATE'
                ? 'KEEP:NO_NEW_QUOTE_CANDIDATE_EXISTING_ORDER_VALID'
                : eligibilityReason === 'SESSION_COMPLETE_FLAT'
                  ? 'SESSION_END'
                  : eligibilityReason.includes('ECONOMIC') ||
                      eligibilityReason.includes('LIFECYCLE_COST') ||
                      eligibilityReason.includes('EVIDENCE')
                    ? `ECONOMIC_INVALID:${eligibilityReason}`
                    : operatingState === 'RISK_REDUCTION' || operatingState === 'SESSION_UNWIND'
                      ? `RISK_INVALID:${eligibilityReason}`
                      : `INVENTORY_INVALID:${eligibilityReason}`;
        const action = Object.freeze({
          ...diffSide(side, desiredOrderAtIndex, currentOrder, missingDesiredReason),
          ...(entryEconomics ? { entryEconomics } : {}),
        });
        return verifiedExit &&
          operatingState === 'RISK_REDUCTION' &&
          action.action === 'WOULD_REPLACE'
          ? Object.freeze({ ...action, reason: 'REPRICE:CANONICAL_RISK_REDUCTION' })
          : action;
      });
    }),
  );
  // Adding exact uncovered lots preserves the confirmed TP. Never infer this
  // capability from the presence of an SDK reduceOnly flag alone.
  if (
    supportsDecibelMultipleReductionsV1(input) &&
    !sessionUnwind &&
    !riskReduction &&
    coverage.entryPaused &&
    !coverage.metadataUnknown &&
    (input.pendingExitQuantityBase ?? 0) === 0 &&
    (input.pendingCancelOrderIds ?? []).length === 0
  ) {
    const side = input.actualInventoryBase > 0 ? 'SELL' : 'BUY';
    const exits = input.openOrders.filter((o) => o.side === side);
    const rule = input.reductionOrderRules!;
    const delta = coverage.UNCOVERED_INVENTORY_QTY;
    const existing = exits[0];
    if (
      existing &&
      exits.every((o) => o.reduceOnly === true) &&
      exits.length < rule.maximumOrders &&
      delta >= rule.minimumSize &&
      delta * existing.price >= rule.minimumNotionalUsd &&
      delta === floorDecibelQuantityToLotV1(delta, input.metadata.lotSize)
    ) {
      const target = side === 'BUY' ? desiredBid : desiredAsk;
      const desiredDelta = desiredOrder({
        sessionId: input.sessionId,
        strategyConfigId: input.strategyConfigId,
        side,
        price: existing.price,
        quantity: delta,
        generation: generation[side],
      });
      actions = Object.freeze([
        ...actions.map((a) =>
          a.side === side && a.current?.reduceOnly === true
            ? Object.freeze({
                ...a,
                action: 'NO_OP' as const,
                reason: 'KEEP:ADD_EXACT_EXIT_COVERAGE_DELTA',
              })
            : a,
        ),
        Object.freeze({
          action: 'WOULD_PLACE' as const,
          side,
          current: null,
          desired: desiredDelta,
          ...(target ? { priceCandidate: { ...target, quantity: delta } } : {}),
          reason: 'EXIT_COVERAGE_ADD',
        }),
      ]);
    }
  }
  trace.push(
    { type: 'STRATEGY_EVALUATION', at: input.now, detail: operatingState },
    {
      type: 'DESIRED_ORDER_STATE',
      at: input.now,
      detail: `${desiredBid !== null}/${desiredAsk !== null}`,
    },
    { type: 'VENUE_ORDER_STATE', at: input.now, detail: String(input.openOrders.length) },
    {
      type: 'EXECUTION_DIFF',
      at: input.now,
      detail: actions.map((action) => `${action.action}:${action.reason}`).join(','),
    },
  );
  if (status === 'SESSION_COMPLETE')
    trace.push({ type: 'SESSION_COMPLETE', at: input.now, detail: 'TARGET_REACHED_FLAT' });
  return Object.freeze({
    version: DECIBEL_AUTHENTICATED_PASSIVE_RECYCLING_ORCHESTRATOR_V1,
    sessionId: input.sessionId,
    mode: 'AUTHENTICATED_DRY_RUN',
    status,
    strategyState,
    operatingState,
    actualInventoryBase: input.actualInventoryBase,
    maximumAbsPositionBase,
    riskReductionTrigger,
    fairPrice,
    fairPriceSource: 'BBO_MIDPOINT',
    inventoryPressure: inventory.inventoryPressure,
    inventoryPriceSkewBps: inventory.inventoryPriceSkewBps,
    inventoryBidSizeMultiplier:
      (1 - inventory.inventoryPressure) * (1 - Math.max(0, inventory.inventoryPressure)),
    inventoryAskSizeMultiplier:
      (1 + inventory.inventoryPressure) * (1 - Math.max(0, -inventory.inventoryPressure)),
    volatilitySpreadMultiplier: sizing?.volatilitySpreadMultiplier ?? 1,
    entryPriceMovementBps: sizing?.entryPriceMovementBps ?? 0,
    marketRegime: sizing?.marketRegime ?? 'UNKNOWN',
    bidEvidenceSampleCount: sizing?.bidEvidenceSampleCount ?? 0,
    askEvidenceSampleCount: sizing?.askEvidenceSampleCount ?? 0,
    makerFeeBps,
    estimatedGasCostUsd,
    adverseSelectionBufferBps,
    safetyMarginBps,
    expectedBidEdgeBps,
    expectedAskEdgeBps,
    requiredBidEdgeBps,
    requiredAskEdgeBps,
    bidLifecycleCostBps,
    askLifecycleCostBps,
    bidCandidatesEvaluated,
    askCandidatesEvaluated,
    bidCandidateCosts,
    askCandidateCosts,
    flatPairCohortId: sizing?.flatPairCohortId ?? null,
    flatPairSharedBaseQuantity: sizing?.flatPairSharedBaseQuantity ?? null,
    flatPairBudgetUsd: sizing?.flatPairBudgetUsd ?? null,
    bidRawBudgetUsd,
    askRawBudgetUsd,
    bidEligibilityReason,
    askEligibilityReason,
    desiredBid,
    desiredAsk,
    desiredBidLadder: Object.freeze(desiredBidLadder),
    desiredAskLadder: Object.freeze(desiredAskLadder),
    actions,
    blockers: Object.freeze([]),
    actualMakerFillCount: input.actualFillLedger.fills.length,
    actualExternalMakerVolumeUsd: input.actualFillLedger.actualExternalMakerVolumeUsd,
    volumeCycles: input.actualFillLedger.cycles,
    trace: Object.freeze(trace),
    selfTradePermitted: false,
    externalCounterpartyRequired: true,
    liveExecutionEnabled: false,
    venueMutationEnabled: false,
  });
}

export class decibel_authenticated_passive_recycling_journal_v1 {
  private readonly database: Database.Database;

  public constructor(path: string) {
    this.database = new Database(path);
    this.database.pragma('journal_mode = WAL');
    this.database.pragma('synchronous = FULL');
    this.database.exec(`CREATE TABLE IF NOT EXISTS decibel_authenticated_passive_recycling_v1 (
      session_id TEXT PRIMARY KEY,
      strategy_config_id TEXT NOT NULL,
      evaluation_json TEXT NOT NULL,
      known_fill_ids_json TEXT NOT NULL,
      volume_cycles_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      live_execution_enabled INTEGER NOT NULL CHECK(live_execution_enabled = 0),
      venue_mutation_enabled INTEGER NOT NULL CHECK(venue_mutation_enabled = 0)
    )`);
  }

  public persist(input: {
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1;
    strategyConfigId: string;
    knownFillIds: readonly string[];
  }): void {
    const existing = this.restore(input.evaluation.sessionId);
    if (existing !== null && existing.strategyConfigId !== input.strategyConfigId)
      throw new Error('PASSIVE_RECYCLING_JOURNAL_CONFLICT');
    this.database
      .prepare(
        `INSERT INTO decibel_authenticated_passive_recycling_v1 VALUES (?,?,?,?,?,?,0,0)
        ON CONFLICT(session_id) DO UPDATE SET evaluation_json=excluded.evaluation_json,
        known_fill_ids_json=excluded.known_fill_ids_json,
        volume_cycles_json=excluded.volume_cycles_json,updated_at=excluded.updated_at`,
      )
      .run(
        input.evaluation.sessionId,
        input.strategyConfigId,
        JSON.stringify(input.evaluation),
        JSON.stringify([...new Set(input.knownFillIds)].sort()),
        JSON.stringify(input.evaluation.volumeCycles),
        input.evaluation.trace.at(-1)?.at ?? Date.now(),
      );
  }

  public restore(sessionId: string): Readonly<{
    strategyConfigId: string;
    evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1;
    knownFillIds: readonly string[];
    volumeCycles: decibel_actual_fill_ledger_v1['cycles'];
  }> | null {
    const row = this.database
      .prepare(
        `SELECT strategy_config_id AS strategyConfigId,evaluation_json AS evaluationJson,
        known_fill_ids_json AS knownFillIdsJson,volume_cycles_json AS volumeCyclesJson
        FROM decibel_authenticated_passive_recycling_v1 WHERE session_id=?`,
      )
      .get(sessionId) as
      | {
          strategyConfigId: string;
          evaluationJson: string;
          knownFillIdsJson: string;
          volumeCyclesJson: string;
        }
      | undefined;
    return row === undefined
      ? null
      : Object.freeze({
          strategyConfigId: row.strategyConfigId,
          evaluation: JSON.parse(
            row.evaluationJson,
          ) as DecibelAuthenticatedPassiveRecyclingEvaluationV1,
          knownFillIds: Object.freeze(JSON.parse(row.knownFillIdsJson) as string[]),
          volumeCycles: Object.freeze(
            JSON.parse(row.volumeCyclesJson) as decibel_actual_fill_ledger_v1['cycles'],
          ),
        });
  }

  public close(): void {
    this.database.close();
  }
}

export function assertPassiveRecyclingVenueMutationUnavailableV1(): never {
  throw new Error('PASSIVE_RECYCLING_VENUE_MUTATION_DISABLED');
}
