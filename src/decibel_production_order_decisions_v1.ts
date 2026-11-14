/**
 * Pure order decisions for the production orchestrator: TP price review, inventory exit
 * coordination, replacement decisions, cancel classification and intent building
 * (split from the orchestrator; behaviour unchanged).
 */
import { createHash } from 'node:crypto';
import { DECIBEL_STRATEGY_POLICY_V1 } from './decibel_strategy_policy_v1.js';
import { getDecibelEntryReplacementBandBpsV1 } from './decibel_volatility_targets_v1.js';
import {
  assessDecibelExitEconomicsV1,
  constructDecibelAdaptiveTPPriceV1,
  assessDecibelAdaptiveTPV1,
  planDecibelPatientTPV1,
} from './decibel_exit_economics_v1.js';
import { getDecibelRestingCoveragePriceV1 } from './decibel_order_action_v1.js';
import { floorDecibelQuantityToLotV1 } from './decibel_chain_units_v1.js';
import { evaluateTradingDecision } from './decibel_trading_decision_v1.js';
import { DECIBEL_CAPACITY_POLICY_V1 } from './decibel_risk_capacity_v1.js';
import { assessDecibelEntryReplacementEconomicsV1 } from './decibel_smart_ladder_v1.js';

import {
  calculateDecibelExitCoverageV1,
  supportsDecibelMultipleReductionsV1,
  isDecibelPassiveRecyclingClientOrderIdV1,
  type DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  type decibel_authenticated_strategy_order_v1,
  type decibel_recycling_action_v1,
} from './decibel_authenticated_passive_recycling_orchestrator_v1.js';
import {
  buildDecibelExecutionIntentV1,
  type execution_intent_v1,
} from './decibel_execution_intent_v1.js';
import { DECIBEL_PRODUCTION_CANDIDATE_DISTANCE_BPS_V1 } from './decibel_smart_ladder_v1.js';
import type { decibel_production_live_snapshot_v1 } from './decibel_production_live_orchestrator_v1.js';

/** sha256 of the JSON form; used for decision and intent hashes. */
export function hashDecibelProductionValueV1(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
const hash = hashDecibelProductionValueV1;

export function isAligned(value: number, increment: number): boolean {
  const units = value / increment;
  return Number.isFinite(units) && Math.abs(units - Math.round(units)) <= 1e-8;
}

export function hasVerifiedAccountMarginBreach(
  snapshot: decibel_production_live_snapshot_v1,
): boolean {
  const account = snapshot.practicalCapacityInputs;
  if (
    !account ||
    account.accountObservedAt > snapshot.input.now ||
    snapshot.input.now - account.accountObservedAt > account.maximumAgeMs
  )
    return false;
  return (
    (account.marginDeficitUsd !== null &&
      Number.isFinite(account.marginDeficitUsd) &&
      account.marginDeficitUsd > 0) ||
    (account.maintenanceMarginUsd !== null &&
      Number.isFinite(account.maintenanceMarginUsd) &&
      Number.isFinite(account.equityUsd) &&
      account.equityUsd <= account.maintenanceMarginUsd)
  );
}

export function adaptCandidateDistances(multiplier: number): readonly number[] {
  return Object.freeze(
    DECIBEL_PRODUCTION_CANDIDATE_DISTANCE_BPS_V1.map((distance) =>
      Number((distance * multiplier).toFixed(6)),
    ),
  );
}

export function buildDecibelCanonicalOrderKeyV1(
  input: Readonly<{
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
    tickSize: number;
    lotSize: number;
    timeInForce: 'PostOnly' | 'ImmediateOrCancel';
    reduceOnly: boolean;
  }>,
): string {
  return [
    input.side,
    Math.round(input.price / input.tickSize),
    Math.round(input.quantity / input.lotSize),
    input.timeInForce,
    input.reduceOnly,
  ].join(':');
}

export type decibel_tp_price_review_v1 = Readonly<{
  TP_RESTING_PRICE: number;
  TP_CANDIDATE_PRICE: number | null;
  TP_MARKET_DISTANCE_TICKS: number;
  TP_PRICE_SUITABILITY: 'KEEP' | 'SUITABLE' | 'UNKNOWN' | 'RISK_EXIT';
  TP_REPRICE_DECISION: 'KEEP' | 'REPRICE' | 'RISK_EXIT';
  TP_REPRICE_REASON: string;
  TP_EXIT_POLICY_MODE?: 'NORMAL_TP' | 'ADVERSE_EXIT_REPRICE';
  TP_ADVERSE_MOVEMENT_BAND_USD?: number | null;
  TP_PROJECTED_SESSION_PNL_USD?: number | null;
  /** Conditional PnL change less new cancel/place costs. Moving closer can
   * reduce profit; distance is never credited as execution income. */
  TP_EXPECTED_NET_BENEFIT: number | null;
  TP_LAST_REPRICE_AGE_MS: number | null;
  TP_EVIDENCE_VERSION: string;
  AUTHENTICATED_ENTRY_BASIS: number | null;
  RESTING_TP_NET_PNL: number | null;
  CANDIDATE_TP_NET_PNL: number | null;
  TP_NET_PROFIT_REQUIRED: number;
  TP_EXPECTED_NET_BENEFIT_KIND: 'CONDITIONAL_NET_PNL_DELTA_USD';
  RESTING_TP_COST_BREAKDOWN?: ReturnType<typeof assessDecibelExitEconomicsV1>['breakdown'];
  CANDIDATE_TP_COST_BREAKDOWN?: ReturnType<typeof assessDecibelExitEconomicsV1>['breakdown'];
  BLOCKING_EVIDENCE: readonly string[];
}>;

export function calculateDecibelTPNetProfitV1(
  snapshot: decibel_production_live_snapshot_v1,
  side: 'BUY' | 'SELL',
  quantity: number,
  price: number,
): number | null {
  return assessDecibelExitEconomicsV1(snapshot, side, quantity, price).netPnlUsd;
}

export type decibel_inventory_exit_decision_v1 = Readonly<{
  EXIT_MODE: 'TP' | 'ADVERSE_EXIT_REPRICE' | 'DEFENSIVE' | 'EMERGENCY' | 'RECONCILE';
  AUTHENTICATED_POSITION_QTY: number | null;
  AUTHENTICATED_ENTRY_BASIS: number | null;
  CONFIRMED_EXIT_COVERAGE_QTY: number | null;
  UNCOVERED_INVENTORY_QTY: number | null;
  COVERAGE_TRANSITION_STATE: string;
  COVERAGE_GAP_MS: number | null;
  DEFENSIVE_EXIT_ELIGIBLE: boolean;
  DEFENSIVE_EXIT_REASON: string;
  ESTIMATED_DEFENSIVE_EXIT_PNL: number | null;
  REMAINING_LOSS_BUDGET: number | null;
  FINAL_EXIT_DECISION: string;
  BLOCKING_EVIDENCE: readonly string[];
  reductionQuantity: number | null;
}>;

/** The inventory coordinator shares TP evidence, coverage and the existing risk
 * estimates. It never upgrades policy estimates into venue facts. */
export function coordinateDecibelInventoryExitV1(
  snapshot: decibel_production_live_snapshot_v1,
  context: Readonly<{
    emergency?: boolean;
    tpReview?: decibel_tp_price_review_v1 | null;
    selectedAction?: decibel_recycling_action_v1 | null;
    executionBlocker?: string | null;
    evaluation?: DecibelAuthenticatedPassiveRecyclingEvaluationV1 | null;
    positionObservedSince?: number | undefined;
    samples?: readonly Readonly<{ at: number; midpoint: number }>[];
    gapObservedSince?: number | undefined;
  }> = {},
): decibel_inventory_exit_decision_v1 {
  const input = snapshot.input,
    config = snapshot.sessionConfiguration;
  const coverage = calculateDecibelExitCoverageV1(input);
  const now = input.now,
    account = snapshot.practicalCapacityInputs;
  const fresh =
    account &&
    account.accountObservedAt <= now &&
    now - account.accountObservedAt <= account.maximumAgeMs &&
    input.book.observedAt <= now &&
    now - input.book.observedAt <= input.maxBboAgeMs;
  const side = input.actualInventoryBase > 0 ? 'SELL' : 'BUY';
  const reference = side === 'SELL' ? input.book.bestBid : input.book.bestAsk;
  const economics =
    input.actualInventoryBase === 0
      ? null
      : assessDecibelExitEconomicsV1(
          snapshot,
          side,
          Math.abs(input.actualInventoryBase),
          reference,
          'TAKER',
        );
  const remaining =
    config && config.pnlUsd !== null && Number.isFinite(config.pnlUsd)
      ? Math.max(0, config.maxLossUsd + Math.min(0, config.pnlUsd))
      : null;
  const emergency =
    context.emergency || (config && config.pnlUsd !== null && config.pnlUsd <= -config.maxLossUsd);
  const adaptiveTP = assessDecibelAdaptiveTPV1(
    snapshot,
    side,
    (input.actualInventoryBase
      ? constructDecibelAdaptiveTPPriceV1(
          snapshot,
          side,
          Math.abs(input.actualInventoryBase),
          reference,
        ).price
      : null) ?? (side === 'BUY' ? input.book.bestBid : input.book.bestAsk),
  );
  const transition =
    input.unresolvedExecutionPlanCount > 0
      ? 'ACK_RECONCILIATION_REQUIRED'
      : (input.pendingCancelOrderIds ?? []).length
        ? 'CANCEL_ACK_PENDING'
        : (input.pendingExitQuantityBase ?? 0) > 0
          ? 'PLACEMENT_ACK_PENDING'
          : coverage.overCovered
            ? 'AGGREGATE_COVERAGE_CONFLICT'
            : coverage.uncoveredBelowMinimum
              ? 'UNRESOLVED_DUST'
              : coverage.entryPaused
                ? coverage.CONFIRMED_EXIT_COVERAGE_QTY === 0
                  ? 'ZERO_CONFIRMED_COVERAGE'
                  : 'PARTIAL_COVERAGE'
                : 'COVERED';
  const base = {
    EXIT_MODE: emergency
      ? ('EMERGENCY' as const)
      : fresh
        ? adaptiveTP.allowed
          ? ('ADVERSE_EXIT_REPRICE' as const)
          : ('TP' as const)
        : ('RECONCILE' as const),
    AUTHENTICATED_POSITION_QTY: fresh ? input.actualInventoryBase : null,
    AUTHENTICATED_ENTRY_BASIS: fresh ? (economics?.basis ?? null) : null,
    CONFIRMED_EXIT_COVERAGE_QTY: fresh ? coverage.CONFIRMED_EXIT_COVERAGE_QTY : null,
    UNCOVERED_INVENTORY_QTY: fresh ? coverage.UNCOVERED_INVENTORY_QTY : null,
    COVERAGE_TRANSITION_STATE: fresh ? transition : 'UNKNOWN',
    COVERAGE_GAP_MS:
      fresh && coverage.UNCOVERED_INVENTORY_QTY > 0 && context.gapObservedSince !== undefined
        ? Math.max(0, now - context.gapObservedSince)
        : null,
    ESTIMATED_DEFENSIVE_EXIT_PNL: null as number | null,
    REMAINING_LOSS_BUDGET: fresh ? remaining : null,
    reductionQuantity: null as number | null,
  };
  const result = (
    reason: string,
    blockers: readonly string[] = [],
    eligible = false,
    quantity: number | null = null,
    pnl: number | null = null,
  ): decibel_inventory_exit_decision_v1 =>
    Object.freeze({
      ...base,
      EXIT_MODE: emergency
        ? 'EMERGENCY'
        : context.executionBlocker
          ? 'RECONCILE'
          : eligible
            ? 'DEFENSIVE'
            : blockers.length
              ? 'RECONCILE'
              : base.EXIT_MODE,
      DEFENSIVE_EXIT_ELIGIBLE: eligible,
      DEFENSIVE_EXIT_REASON: reason,
      FINAL_EXIT_DECISION: emergency
        ? 'CANONICAL_EMERGENCY_UNWIND'
        : context.executionBlocker
          ? `RECONCILE:${context.executionBlocker}`
          : eligible
            ? 'DEFENSIVE_EXIT'
            : context.selectedAction?.reason.startsWith('EXIT_COVERAGE_') ||
                context.selectedAction?.reason.startsWith('REPRICE:TP_')
              ? context.selectedAction.reason
              : (context.tpReview?.TP_REPRICE_REASON ??
                (coverage.entryPaused
                  ? 'RECONCILE:INCOMPLETE_EXIT_COVERAGE'
                  : 'KEEP:CONFIRMED_TP_COVERAGE')),
      BLOCKING_EVIDENCE: Object.freeze([...blockers]),
      reductionQuantity: quantity,
      ESTIMATED_DEFENSIVE_EXIT_PNL: pnl,
    });
  if (emergency) return result('EMERGENCY_HAS_PRIORITY');
  if (!fresh)
    return result('FRESH_INVENTORY_EXIT_EVIDENCE_REQUIRED', [
      'FRESH_AUTHENTICATED_ACCOUNT_AND_MARKET_REQUIRED',
    ]);
  if (input.actualInventoryBase === 0) return result('NO_INVENTORY');
  if (!economics || economics.blockers.length || remaining === null)
    return result(
      'DEFENSIVE_EXIT_ECONOMICS_UNAVAILABLE',
      economics?.blockers ?? ['SESSION_LOSS_EVIDENCE_REQUIRED'],
    );
  if (context.evaluation?.operatingState === 'RISK_REDUCTION')
    return result('CANONICAL_RISK_REDUCTION', [], true, null, economics.netPnlUsd);
  // The maker loss policy has no holding timer. Canonical hard-risk exits above
  // retain priority; they are not the trigger for an intermediate maker reprice.
  if (adaptiveTP.allowed) return result('ADVERSE_EXIT_REPRICE_ACTIVE');
  const observed = (context.samples ?? []).filter(
    (s) =>
      context.positionObservedSince !== undefined &&
      s.at >= context.positionObservedSince &&
      s.at <= now &&
      Number.isFinite(s.midpoint) &&
      s.midpoint > 0,
  );
  const horizon = DECIBEL_CAPACITY_POLICY_V1.modeledExitHorizonMs;
  let start = -1;
  for (const [i, sample] of observed.entries()) if (sample.at <= now - horizon) start = i;
  const samples = start < 0 ? [] : observed.slice(start);
  if (
    samples.length < 2 ||
    now - samples[0]!.at < horizon ||
    now - samples.at(-1)!.at > input.maxBboAgeMs ||
    samples.some(
      (s, i) =>
        i > 0 && (s.at < samples[i - 1]!.at || s.at - samples[i - 1]!.at > input.maxBboAgeMs),
    )
  )
    return result('DEFENSIVE_EXIT_HOLDING_COVERAGE_REQUIRED', [
      'CONTINUOUS_POSITION_AND_MARKET_HISTORY_REQUIRED',
    ]);
  const basis = economics.basis!;
  if (
    !samples.every((s) => (input.actualInventoryBase > 0 ? s.midpoint < basis : s.midpoint > basis))
  )
    return result('HOLD:ADVERSE_MOVEMENT_NOT_SUSTAINED');
  const capacity = config?.exposureLimits;
  if (
    !capacity ||
    capacity.capacityBlocker ||
    !Number.isFinite(capacity.effectivePositionLimitUsd) ||
    capacity.effectivePositionLimitUsd < 0
  )
    return result('HOLDING_RISK_CAPACITY_EVIDENCE_REQUIRED', ['CANONICAL_CAPACITY_REQUIRED']);
  if (Math.abs(input.actualInventoryBase) * reference <= capacity.effectivePositionLimitUsd)
    return result('HOLD:HOLDING_RISK_WITHIN_CANONICAL_CAPACITY');
  // Capacity bounds entry exposure; it does not grant authority to realize an
  // intermediate loss. Execution remains owned by the existing risk lifecycle.
  return result('HOLDING_RISK_POLICY_GAP', ['INTERMEDIATE_LOSS_THRESHOLD_NOT_DEFINED']);
}

export function evaluateDecibelTPPriceSuitabilityV1(
  action: decibel_recycling_action_v1,
  snapshot: decibel_production_live_snapshot_v1,
  _restingAgeMs: number | null,
  _minimumRestingAgeMs: number,
  _minimumDistanceTicks: number,
  _sustainedAgeMs?: number | null,
  lastRepriceAgeMs: number | null = null,
  canonicalUnwindRequested = false,
): decibel_tp_price_review_v1 | null {
  const order = action.current;
  const position = snapshot.input.actualInventoryBase;
  if (
    !order ||
    order.reduceOnly !== true ||
    !((position > 0 && order.side === 'SELL') || (position < 0 && order.side === 'BUY'))
  )
    return null;
  const candidate = action.desired;
  const executable =
    order.side === 'BUY' ? snapshot.input.book.bestAsk : snapshot.input.book.bestBid;
  const tick = snapshot.input.metadata.tickSize;
  const distance = Math.abs(order.price - executable) / tick;
  const restingEconomics = assessDecibelExitEconomicsV1(
    snapshot,
    order.side,
    order.quantity,
    order.price,
  );
  const candidateEconomics = candidate
    ? assessDecibelExitEconomicsV1(snapshot, order.side, candidate.quantity, candidate.price)
    : null;
  const exitPolicy = assessDecibelAdaptiveTPV1(
    snapshot,
    order.side,
    candidate?.price ?? order.price,
  );
  const result = (
    reason: string,
    suitability: decibel_tp_price_review_v1['TP_PRICE_SUITABILITY'] = 'KEEP',
    benefit: number | null = null,
  ): decibel_tp_price_review_v1 =>
    Object.freeze({
      TP_RESTING_PRICE: order.price,
      TP_CANDIDATE_PRICE: candidate?.price ?? null,
      TP_MARKET_DISTANCE_TICKS: Math.round(distance),
      TP_PRICE_SUITABILITY: suitability,
      TP_REPRICE_DECISION: 'KEEP',
      TP_REPRICE_REASON: reason,
      TP_EXIT_POLICY_MODE: exitPolicy.mode,
      TP_ADVERSE_MOVEMENT_BAND_USD: exitPolicy.movementBandUsd,
      TP_PROJECTED_SESSION_PNL_USD: exitPolicy.projectedSessionPnlUsd,
      TP_EXPECTED_NET_BENEFIT: benefit,
      TP_LAST_REPRICE_AGE_MS: lastRepriceAgeMs,
      TP_EVIDENCE_VERSION: snapshot.sourceStateHash,
      AUTHENTICATED_ENTRY_BASIS: restingEconomics.basis,
      RESTING_TP_NET_PNL: restingEconomics.netPnlUsd,
      CANDIDATE_TP_NET_PNL: candidateEconomics?.netPnlUsd ?? null,
      TP_NET_PROFIT_REQUIRED: restingEconomics.requiredNetProfitUsd,
      TP_EXPECTED_NET_BENEFIT_KIND: 'CONDITIONAL_NET_PNL_DELTA_USD' as const,
      RESTING_TP_COST_BREAKDOWN: restingEconomics.breakdown,
      CANDIDATE_TP_COST_BREAKDOWN: candidateEconomics?.breakdown ?? null,
      BLOCKING_EVIDENCE: candidateEconomics?.blockers ?? restingEconomics.blockers,
    });
  const input = snapshot.input;
  if (
    input.unresolvedExecutionPlanCount > 0 ||
    (input.pendingExitQuantityBase ?? 0) > 0 ||
    (input.pendingCancelOrderIds ?? []).includes(order.venueOrderId) ||
    order.market !== input.market ||
    order.strategyConfigId !== input.strategyConfigId ||
    order.quantity !== floorDecibelQuantityToLotV1(order.quantity, input.metadata.lotSize) ||
    order.quantity > Math.abs(position) ||
    (input.openOrders.filter((o) => o.side === order.side).length !== 1 &&
      !supportsDecibelMultipleReductionsV1(input)) ||
    !input.openOrders.some(
      (o) =>
        o.venueOrderId === order.venueOrderId &&
        o.clientOrderId === order.clientOrderId &&
        o.quantity === order.quantity &&
        o.price === order.price &&
        o.reduceOnly === true,
    )
  )
    return result('KEEP:TP_STRUCTURE_RECONCILIATION_REQUIRED', 'UNKNOWN');
  const now = input.now;
  const practical = snapshot.practicalCapacityInputs;
  if (
    now < input.book.observedAt ||
    now - input.book.observedAt > input.maxBboAgeMs ||
    (practical &&
      (now < practical.accountObservedAt ||
        now - practical.accountObservedAt > practical.maximumAgeMs))
  )
    return result('KEEP:TP_FRESH_EVIDENCE_REQUIRED', 'UNKNOWN');
  const config = snapshot.sessionConfiguration;
  if (
    canonicalUnwindRequested ||
    action.desired?.timeInForce === 'ImmediateOrCancel' ||
    (config && typeof config.pnlUsd === 'number' && config.pnlUsd <= -config.maxLossUsd)
  )
    return Object.freeze({
      ...result('RISK_EXIT:EXISTING_CANONICAL_UNWIND', 'RISK_EXIT'),
      TP_REPRICE_DECISION: 'RISK_EXIT' as const,
    });
  if (
    (order.side === 'BUY' && order.price >= executable) ||
    (order.side === 'SELL' && order.price <= executable)
  )
    return result('KEEP:TP_ALREADY_EXECUTABLE_AWAIT_RECONCILIATION');
  if (!candidate) {
    const plan = planDecibelPatientTPV1(snapshot, order.side);
    if (plan.targetPrice === null)
      return result(`KEEP:${plan.reason}`, plan.movementBandUsd === null ? 'UNKNOWN' : 'KEEP');
    const constructed = constructDecibelAdaptiveTPPriceV1(
      snapshot,
      order.side,
      order.quantity,
      order.price,
    );
    const checked = assessDecibelAdaptiveTPV1(
      snapshot,
      order.side,
      constructed.price ?? plan.targetPrice,
    );
    return result(`KEEP:${constructed.blocker ?? checked.reason}:CANDIDATE_UNAVAILABLE`, 'UNKNOWN');
  }
  if (
    candidate.side !== order.side ||
    candidate.quantity < order.quantity ||
    candidate.quantity > Math.abs(position) ||
    !isAligned(candidate.price, tick)
  )
    return result('KEEP:TP_EXECUTABLE_CANDIDATE_REQUIRED', 'UNKNOWN');
  const passive =
    order.side === 'BUY'
      ? candidate.price < input.book.bestAsk
      : candidate.price > input.book.bestBid;
  const netProfit = calculateDecibelTPNetProfitV1(
    snapshot,
    order.side,
    candidate.quantity,
    candidate.price,
  );
  if (netProfit === null) return result('KEEP:TP_BASIS_OR_COST_EVIDENCE_REQUIRED', 'UNKNOWN');
  const adaptive = assessDecibelAdaptiveTPV1(snapshot, order.side, candidate.price);
  const improvementTicks =
    (Math.round(candidate.price / tick) - Math.round(order.price / tick)) *
    (order.side === 'BUY' ? 1 : -1);
  const gas = snapshot.economicInputs!.estimatedGasCostUsd!;
  // Compare the same residual quantity. Entry fees and original placement gas
  // are sunk and cancel in the difference; only new cancel/place gas is added.
  const comparableNet = calculateDecibelTPNetProfitV1(
    snapshot,
    order.side,
    order.quantity,
    candidate.price,
  );
  const benefit =
    comparableNet === null || restingEconomics.netPnlUsd === null
      ? null
      : comparableNet - restingEconomics.netPnlUsd - 2 * gas;
  if (
    !adaptive.allowed &&
    (!Number.isFinite(netProfit) || netProfit < restingEconomics.requiredNetProfitUsd)
  )
    return result('KEEP:TP_NET_PROFIT_NOT_PROVEN', 'KEEP', benefit);
  if (!passive) return result('KEEP:TP_NO_MATERIAL_EXECUTION_BENEFIT', 'KEEP', benefit);
  // Read-only hypothetical replacement after exact cancel ACK. This is a
  // pre-cancel eligibility check, never evidence that the resting order is gone.
  // Placement still re-reads/reconciles and passes the normal authoritative gate.
  const replacementSnapshot = {
    ...snapshot,
    ...(adaptive.allowed && adaptive.authorization
      ? { tpAdverseProgress: adaptive.authorization }
      : {}),
    input: {
      ...input,
      openOrders: input.openOrders.filter((o) => o.venueOrderId !== order.venueOrderId),
    },
  };
  const readiness = evaluateTradingDecision(replacementSnapshot, {
    now: input.now,
    sessionId: input.sessionId,
    state: 'RUNNING',
    candidate: {
      side: candidate.side,
      price: candidate.price,
      quantity: candidate.quantity,
      reduceOnly: true,
    },
  });
  if (
    readiness.state !== 'TRADE' ||
    !(candidate.side === 'BUY' ? readiness.bidEligible : readiness.askEligible)
  )
    return result('KEEP:TP_REPLACEMENT_PREFLIGHT_BLOCKED', 'UNKNOWN', benefit);
  if (adaptive.allowed && adaptive.adjustmentReady && improvementTicks > 1)
    return Object.freeze({
      ...result(adaptive.reason, 'KEEP', benefit),
      TP_PRICE_SUITABILITY: 'SUITABLE',
      TP_REPRICE_DECISION: 'REPRICE',
    });
  if (benefit === null || benefit <= 0)
    return result('KEEP:TP_NO_MATERIAL_EXECUTION_BENEFIT', 'KEEP', benefit);
  // A higher conditional payoff farther away does not establish a better
  // execution outcome. No calibrated queue/fill evidence or atomic replace
  // capability is supplied by this adapter; preserve confirmed exit coverage.
  return result('KEEP:TP_EXECUTION_EVIDENCE_REQUIRED', 'UNKNOWN', benefit);
}

export function evaluateDecibelReplacementDecisionV1(
  action: decibel_recycling_action_v1,
  snapshot: decibel_production_live_snapshot_v1,
  restingAgeMs: number | null,
  minimumRestingAgeMs: number,
  minimumDistanceTicks: number,
  reductionMode = false,
  tpSustainedAgeMs: number | null = null,
  evaluation?: DecibelAuthenticatedPassiveRecyclingEvaluationV1,
): Readonly<{
  cancel: boolean;
  reason: string;
  restingAgeMs: number | null;
  priceDriftTicks: number;
  currentOrderKey: string;
  replacementOrderKey: string;
}> | null {
  if (action.action !== 'WOULD_REPLACE' || action.current === null || action.desired === null)
    return null;
  if (action.current.reduceOnly === false) {
    if (action.reason !== 'REPRICE:ENTRY_REPLACEMENT_MAKER_PRIORITY_IMPROVED') return null;
    const input = snapshot.input;
    const current = action.current;
    const candidate = action.desired;
    const costs = snapshot.economicInputs;
    const comparison = assessDecibelEntryReplacementEconomicsV1({
      side: current.side,
      restingPrice: current.price,
      candidatePrice: candidate.price,
      restingQuantity: current.quantity,
      candidateQuantity: candidate.quantity,
      midpoint: (input.book.bestBid + input.book.bestAsk) / 2,
      makerFeeBps: costs?.makerFeeBps ?? null,
      gasCostUsd: costs?.estimatedGasCostUsd ?? null,
      safetyMarginBps: costs?.safetyMarginBps ?? 0,
      bestBid: input.book.bestBid,
      bestAsk: input.book.bestAsk,
      tickSize: input.metadata.tickSize,
      ...(input.book.depth === undefined ? {} : { depth: input.book.depth }),
      bookObservedAt: input.book.observedAt,
      now: input.now,
      maximumBookAgeMs: input.maxBboAgeMs,
      ...entryReplacementStabilityFor(snapshot),
      observedPriceMovementBps: evaluation?.entryPriceMovementBps ?? 0,
    });
    const fresh =
      input.now >= input.book.observedAt && input.now - input.book.observedAt <= input.maxBboAgeMs;
    const compatible =
      current.market === candidate.market &&
      current.side === candidate.side &&
      current.strategyConfigId === candidate.strategyConfigId &&
      candidate.postOnly &&
      candidate.timeInForce === 'PostOnly' &&
      input.unresolvedExecutionPlanCount === 0 &&
      input.openOrders.some(
        (order) =>
          order.venueOrderId === current.venueOrderId &&
          order.clientOrderId === current.clientOrderId &&
          order.market === current.market &&
          order.side === current.side &&
          order.price === current.price &&
          order.quantity === current.quantity &&
          order.reduceOnly === false,
      ) &&
      !(input.pendingCancelOrderIds ?? []).includes(current.venueOrderId);
    const readiness =
      fresh && compatible && comparison.decision === 'REPLACE'
        ? evaluateTradingDecision(
            {
              ...snapshot,
              input: {
                ...input,
                openOrders: input.openOrders.filter((o) => o.venueOrderId !== current.venueOrderId),
              },
            },
            {
              now: input.now,
              sessionId: input.sessionId,
              state: 'RUNNING',
              candidate: {
                side: candidate.side,
                price: candidate.price,
                quantity: candidate.quantity,
                reduceOnly: false,
              },
            },
          )
        : null;
    const cancel =
      readiness?.state === 'TRADE' &&
      (candidate.side === 'BUY' ? readiness.bidEligible : readiness.askEligible);
    return Object.freeze({
      cancel,
      reason: cancel
        ? action.reason
        : !fresh
          ? 'KEEP:ENTRY_REPLACEMENT_FRESH_EVIDENCE_REQUIRED'
          : !compatible
            ? 'KEEP:ENTRY_REPLACEMENT_AUTHENTICATED_IDENTITY_REQUIRED'
            : `KEEP:${readiness?.primaryReason ?? comparison.reason}`,
      restingAgeMs,
      priceDriftTicks: Math.abs(candidate.price - current.price) / input.metadata.tickSize,
      currentOrderKey: buildDecibelCanonicalOrderKeyV1({
        ...current,
        tickSize: input.metadata.tickSize,
        lotSize: input.metadata.lotSize,
        reduceOnly: false,
      }),
      replacementOrderKey: buildDecibelCanonicalOrderKeyV1({
        ...candidate,
        tickSize: input.metadata.tickSize,
        lotSize: input.metadata.lotSize,
        reduceOnly: false,
      }),
    });
  }
  if (action.current.reduceOnly !== true) return null;
  const tickSize = snapshot.input.metadata.tickSize;
  if (!isAligned(action.current.price, tickSize) || !isAligned(action.desired.price, tickSize))
    throw new Error('PRODUCTION_REPRICE_PRICE_NOT_TICK_ALIGNED');
  const currentTicks = Math.round(action.current.price / tickSize);
  const desiredTicks = Math.round(action.desired.price / tickSize);
  const bestBidTicks = Math.round(snapshot.input.book.bestBid / tickSize);
  const bestAskTicks = Math.round(snapshot.input.book.bestAsk / tickSize);
  const unsafe =
    action.side === 'BUY'
      ? currentTicks >= bestAskTicks
      : action.side === 'SELL'
        ? currentTicks <= bestBidTicks
        : true;
  const priceDriftTicks = Math.abs(desiredTicks - currentTicks);
  const currentOrderKey = buildDecibelCanonicalOrderKeyV1({
    ...action.current,
    tickSize,
    lotSize: snapshot.input.metadata.lotSize,
    reduceOnly: action.current.reduceOnly === true,
  });
  const replacementOrderKey = buildDecibelCanonicalOrderKeyV1({
    ...action.desired,
    tickSize,
    lotSize: snapshot.input.metadata.lotSize,
    reduceOnly:
      reductionMode ||
      (((snapshot.input.actualInventoryBase > 0 && action.side === 'SELL') ||
        (snapshot.input.actualInventoryBase < 0 && action.side === 'BUY')) &&
        action.desired.quantity <= Math.abs(snapshot.input.actualInventoryBase) + 1e-12),
  });
  const validExit =
    action.current.reduceOnly === true &&
    ((snapshot.input.actualInventoryBase > 0 && action.side === 'SELL') ||
      (snapshot.input.actualInventoryBase < 0 && action.side === 'BUY')) &&
    action.current.quantity <= Math.abs(snapshot.input.actualInventoryBase) + 1e-12;
  // A successful preflight is not a promise that the next maker order will rest.
  // This adapter has no verified atomic replacement primitive. Preserve confirmed
  // protection unless a fresh, budgeted adaptive maker reprice or canonical
  // unwind explicitly authorizes the existing cancel/finality/coverage workflow.
  const canonicalExit =
    reductionMode &&
    (evaluation?.operatingState === 'SESSION_UNWIND' ||
      (evaluation?.operatingState === 'RISK_REDUCTION' &&
        action.reason === 'REPRICE:CANONICAL_RISK_REDUCTION'));
  const adaptiveReview =
    validExit && !canonicalExit && !unsafe
      ? evaluateDecibelTPPriceSuitabilityV1(
          action,
          snapshot,
          restingAgeMs,
          minimumRestingAgeMs,
          minimumDistanceTicks,
          tpSustainedAgeMs,
        )
      : null;
  // Any TP smaller than the position is replaced at the same price through the verified
  // coverage workflow below (operator decision 2026-11-14): a few seconds without a TP are
  // accepted instead of leaving part of the inventory uncovered, e.g. after a partial DCA.
  const severelyUndersized =
    action.reason === 'EXIT_COVERAGE_UPSIZE' &&
    desiredTicks === currentTicks &&
    isDecibelTPCoverageSeverelyUndersizedV1(action.current.quantity, action.desired.quantity);
  if (
    validExit &&
    !canonicalExit &&
    !unsafe &&
    !severelyUndersized &&
    adaptiveReview?.TP_REPRICE_DECISION !== 'REPRICE'
  )
    return Object.freeze({
      cancel: false,
      reason:
        action.desired.quantity > action.current.quantity
          ? 'TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD'
          : 'KEEP:TP_NON_ATOMIC_REPLACEMENT_UNVERIFIED',
      restingAgeMs,
      priceDriftTicks,
      currentOrderKey,
      replacementOrderKey,
    });
  if (validExit && unsafe && action.desired.timeInForce === 'PostOnly')
    return Object.freeze({
      cancel: false,
      reason: 'KEEP:TP_ALREADY_EXECUTABLE_AWAIT_RECONCILIATION',
      restingAgeMs,
      priceDriftTicks,
      currentOrderKey,
      replacementOrderKey,
    });
  if (
    validExit &&
    action.desired.quantity <= Math.abs(snapshot.input.actualInventoryBase) + 1e-12 &&
    ((reductionMode &&
      evaluation?.operatingState === 'RISK_REDUCTION' &&
      action.reason === 'REPRICE:CANONICAL_RISK_REDUCTION') ||
      (action.reason === 'EXIT_COVERAGE_UPSIZE' &&
        action.desired.quantity > action.current.quantity &&
        desiredTicks === currentTicks))
  ) {
    // Canonical risk reduction uses its existing evaluated plan, not TP profit
    // or entry spread economics. Quantity-only repair retains candidate preflight.
    const readiness = evaluateTradingDecision(
      {
        ...snapshot,
        input: {
          ...snapshot.input,
          openOrders: snapshot.input.openOrders.filter(
            (o) => o.venueOrderId !== action.current!.venueOrderId,
          ),
        },
      },
      {
        now: snapshot.input.now,
        sessionId: snapshot.input.sessionId,
        state: 'RUNNING',
        ...(evaluation?.operatingState === 'RISK_REDUCTION'
          ? { evaluation }
          : {
              candidate: {
                side: action.desired.side,
                price: action.desired.price,
                quantity: action.desired.quantity,
                reduceOnly: true,
              },
              coveragePriceAuthorization: getDecibelRestingCoveragePriceV1(
                snapshot,
                action.desired.side,
              ),
            }),
      },
    );
    return Object.freeze({
      cancel:
        readiness.state === 'TRADE' &&
        (action.side === 'BUY' ? readiness.bidEligible : readiness.askEligible),
      reason:
        readiness.state === 'TRADE'
          ? action.reason
          : `KEEP:COVERAGE_REPLACEMENT_NOT_EXECUTABLE:${readiness.primaryReason}`,
      restingAgeMs,
      priceDriftTicks,
      currentOrderKey,
      replacementOrderKey,
    });
  }
  if (validExit && action.desired.timeInForce !== 'ImmediateOrCancel') {
    const review = evaluateDecibelTPPriceSuitabilityV1(
      action,
      snapshot,
      restingAgeMs,
      minimumRestingAgeMs,
      minimumDistanceTicks,
      tpSustainedAgeMs,
    );
    return Object.freeze({
      cancel: review?.TP_REPRICE_DECISION === 'REPRICE',
      reason: review?.TP_REPRICE_REASON ?? 'KEEP:TP_REVIEW_REQUIRED',
      restingAgeMs,
      priceDriftTicks,
      currentOrderKey,
      replacementOrderKey,
    });
  }
  return null;
}

/** Below this fraction of the desired quantity, an unchanged-price TP is replaced.
 * 1: any undersized TP (2026-11-14; earlier 0.5, then 0.75). */
export const DECIBEL_TP_COVERAGE_REPLACE_FRACTION_V1 =
  DECIBEL_STRATEGY_POLICY_V1.tp.coverageReplaceFraction;

export function isDecibelTPCoverageSeverelyUndersizedV1(
  currentQuantity: number,
  desiredQuantity: number,
): boolean {
  return (
    Number.isFinite(currentQuantity) &&
    Number.isFinite(desiredQuantity) &&
    currentQuantity > 0 &&
    currentQuantity < desiredQuantity * DECIBEL_TP_COVERAGE_REPLACE_FRACTION_V1 - 1e-12
  );
}

export type decibel_cancel_class_v1 = 'STRATEGIC_REPRICE_CANCEL' | 'SAFETY_CANCEL';

export function classifyDecibelCancelV1(
  action: decibel_recycling_action_v1,
): decibel_cancel_class_v1 {
  return action.action === 'WOULD_REPLACE' &&
    (action.reason.startsWith('REPRICE:') || action.reason === 'EXIT_COVERAGE_UPSIZE')
    ? 'STRATEGIC_REPRICE_CANCEL'
    : 'SAFETY_CANCEL';
}

export type decibel_mutation_selection_v1 = Readonly<{
  action: decibel_recycling_action_v1 | null;
  reason: string | null;
  blocker?: string;
}>;

export function findDecibelInventoryCrossingOpenOrderV1(
  snapshot: decibel_production_live_snapshot_v1,
): (typeof snapshot.input.openOrders)[number] | null {
  const position = snapshot.input.actualInventoryBase;
  if (position === 0) return null;
  const reducingSide = position > 0 ? 'SELL' : 'BUY';
  const maximumReducingQuantity = floorDecibelQuantityToLotV1(
    Math.abs(position),
    snapshot.input.metadata.lotSize,
  );
  return (
    snapshot.input.openOrders.find(
      (order) =>
        order.side === reducingSide &&
        order.quantity - maximumReducingQuantity > snapshot.input.metadata.lotSize * 1e-8,
    ) ?? null
  );
}

export function selectMutation(
  evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  snapshot: decibel_production_live_snapshot_v1,
  getRestingAgeMs: (venueOrderId: string) => number | null = () => null,
  minimumRestingAgeMs = 30_000,
  minimumRepriceTicks = 50,
  hysteresisFraction = 0.5,
  fairTieBreakSide: 'BUY' | 'SELL' = 'BUY',
  observeTP: (
    action: decibel_recycling_action_v1,
    minimumAgeMs: number,
    minimumTicks: number,
  ) => number | null = () => null,
): decibel_mutation_selection_v1 {
  let actions = evaluation.actions.filter((action) => action.action !== 'NO_OP');
  const hysteresisTicks = Math.ceil(
    (((snapshot.halfSpreadBps ?? 0) *
      ((snapshot.input.book.bestBid + snapshot.input.book.bestAsk) / 2)) /
      10_000 /
      snapshot.input.metadata.tickSize) *
      hysteresisFraction,
  );
  const tpAges = new Map(
    evaluation.actions.map((action) => [
      action.current?.venueOrderId,
      observeTP(action, minimumRestingAgeMs, Math.max(minimumRepriceTicks, hysteresisTicks)),
    ]),
  );
  actions = actions.map((action) => {
    if (action.reason === 'EXIT_COVERAGE_ADD' && action.desired) {
      const candidate = action.priceCandidate;
      const candidateNet = candidate
        ? calculateDecibelTPNetProfitV1(
            snapshot,
            action.desired.side,
            action.desired.quantity,
            candidate.price,
          )
        : null;
      const restingNet = calculateDecibelTPNetProfitV1(
        snapshot,
        action.desired.side,
        action.desired.quantity,
        action.desired.price,
      );
      if (candidateNet !== null && candidateNet >= 0)
        return Object.freeze({ ...action, desired: candidate! });
      if (restingNet !== null && restingNet >= 0) return action;
      return Object.freeze({
        ...action,
        action: 'BLOCKED' as const,
        desired: null,
        reason: 'EXIT_COVERAGE_PROFIT_EVIDENCE_REQUIRED',
      });
    }
    if (action.reason !== 'EXIT_COVERAGE_UPSIZE' || !action.priceCandidate || !action.current)
      return action;
    const priced = {
      ...action,
      desired: action.priceCandidate,
      reason: 'REPRICE:TP_PRICE_AND_COVERAGE',
    };
    const review = evaluateDecibelTPPriceSuitabilityV1(
      priced,
      snapshot,
      getRestingAgeMs(action.current.venueOrderId),
      minimumRestingAgeMs,
      Math.max(minimumRepriceTicks, hysteresisTicks),
      tpAges.get(action.current.venueOrderId) ?? null,
    );
    return review?.TP_REPRICE_DECISION === 'REPRICE' ? Object.freeze(priced) : action;
  });
  // Per-side ineligibility must not suppress an independently eligible action.
  if (actions.length > 0 && actions.every((action) => action.action === 'BLOCKED'))
    return Object.freeze({ action: null, reason: actions[0]!.reason, blocker: actions[0]!.reason });
  const cancel = actions.find((action) => action.action === 'WOULD_CANCEL');
  if (cancel !== undefined) return Object.freeze({ action: cancel, reason: cancel.reason });
  const replacementCandidates = actions.flatMap((action) => {
    if (action.action !== 'WOULD_REPLACE' || action.current === null) return [];
    const decision = evaluateDecibelReplacementDecisionV1(
      action,
      snapshot,
      getRestingAgeMs(action.current.venueOrderId),
      minimumRestingAgeMs,
      Math.max(minimumRepriceTicks, hysteresisTicks),
      evaluation.operatingState === 'RISK_REDUCTION' ||
        evaluation.operatingState === 'SESSION_UNWIND',
      tpAges.get(action.current.venueOrderId) ?? null,
      evaluation,
    );
    return decision === null ? [] : [{ action, decision }];
  });
  const getPriority = (action: decibel_recycling_action_v1): number =>
    action.side === 'BUY'
      ? (evaluation.expectedBidEdgeBps ?? Number.NEGATIVE_INFINITY)
      : (evaluation.expectedAskEdgeBps ?? Number.NEGATIVE_INFINITY);
  const selectFairly = (candidates: readonly decibel_recycling_action_v1[]) =>
    [...candidates].sort((left, right) => {
      const reduces = (action: decibel_recycling_action_v1) =>
        Number(
          (snapshot.input.actualInventoryBase < 0 && action.side === 'BUY') ||
            (snapshot.input.actualInventoryBase > 0 && action.side === 'SELL'),
        );
      const reductionDifference = reduces(right) - reduces(left);
      if (reductionDifference !== 0) return reductionDifference;
      const edgeDifference = getPriority(right) - getPriority(left);
      if (Math.abs(edgeDifference) > 1e-9) return edgeDifference;
      if (left.side === fairTieBreakSide) return -1;
      if (right.side === fairTieBreakSide) return 1;
      return 0;
    })[0];
  const cancellableReplacements = replacementCandidates.filter(
    (candidate) => candidate.decision.cancel,
  );
  const replacement = selectFairly(cancellableReplacements.map((candidate) => candidate.action));
  const reducingPlace = selectFairly(
    actions.filter(
      (action) =>
        action.action === 'WOULD_PLACE' &&
        ((snapshot.input.actualInventoryBase < 0 && action.side === 'BUY') ||
          (snapshot.input.actualInventoryBase > 0 && action.side === 'SELL')),
    ),
  );
  const replacementReduces =
    replacement !== undefined &&
    ((snapshot.input.actualInventoryBase < 0 && replacement.side === 'BUY') ||
      (snapshot.input.actualInventoryBase > 0 && replacement.side === 'SELL'));
  if (reducingPlace !== undefined && !replacementReduces)
    return Object.freeze({ action: reducingPlace, reason: reducingPlace.reason });
  if (replacement !== undefined) {
    const decision = cancellableReplacements.find(
      (candidate) => candidate.action === replacement,
    )?.decision;
    const action = Object.freeze({
      ...replacement,
      reason: decision?.reason ?? 'REPRICE:DECISION_UNAVAILABLE',
    });
    return Object.freeze({ action, reason: action.reason });
  }
  const place = selectFairly(actions.filter((action) => action.action === 'WOULD_PLACE')) ?? null;
  const suppressed = replacementCandidates.find((candidate) => !candidate.decision.cancel);
  return Object.freeze({
    action: place,
    reason: place?.reason ?? suppressed?.decision.reason ?? null,
    ...(place === null &&
    suppressed?.decision.reason === 'TP_COVERAGE_REPAIR_REQUIRES_ATOMIC_OR_VERIFIED_ADD'
      ? { blocker: suppressed.decision.reason }
      : {}),
  });
}

export function selectDecibelInventoryCrossingSafetyCancelV1(
  snapshot: decibel_production_live_snapshot_v1,
): decibel_mutation_selection_v1 | null {
  const crossing = findDecibelInventoryCrossingOpenOrderV1(snapshot);
  if (crossing === null) return null;
  const reason = 'INVENTORY_INVALID:OPEN_ORDER_CROSSES_FLAT';
  return Object.freeze({
    action: Object.freeze({
      action: 'WOULD_CANCEL' as const,
      side: crossing.side,
      current: crossing,
      desired: null,
      reason,
    }),
    reason,
  });
}

export function buildIntent(
  action: decibel_recycling_action_v1,
  evaluation: DecibelAuthenticatedPassiveRecyclingEvaluationV1,
  snapshot: decibel_production_live_snapshot_v1,
  cycleSequence: number,
): execution_intent_v1 {
  const cancel = action.action === 'WOULD_CANCEL' || action.action === 'WOULD_REPLACE';
  const order = cancel ? action.current : action.desired;
  if (order === null || action.side === null)
    throw new Error('PRODUCTION_EXECUTION_ACTION_INVALID');
  const side = action.side;
  const reductionMode =
    (!cancel &&
      ((snapshot.input.actualInventoryBase < 0 && side === 'BUY') ||
        (snapshot.input.actualInventoryBase > 0 && side === 'SELL')) &&
      order.quantity <= Math.abs(snapshot.input.actualInventoryBase) + 1e-12) ||
    evaluation.operatingState === 'RISK_REDUCTION' ||
    evaluation.operatingState === 'SESSION_UNWIND';
  const adverseAssessment =
    cancel && action.reason === 'REPRICE:TP_ADVERSE_EXIT_REPRICE' && action.desired
      ? assessDecibelAdaptiveTPV1(snapshot, side, action.desired.price)
      : null;
  const adverseAuthorization = adverseAssessment?.allowed ? adverseAssessment.authorization : null;
  if (cancel && action.reason === 'REPRICE:TP_ADVERSE_EXIT_REPRICE' && !adverseAuthorization)
    throw new Error('TP_ADVERSE_CANCEL_AUTHORIZATION_REQUIRED');
  const build = (clientOrderId: string) =>
    buildDecibelExecutionIntentV1({
      sessionId: snapshot.input.sessionId,
      cycleSequence,
      action: cancel ? 'CANCEL' : 'PLACE',
      market: 'BTC/USD',
      side,
      price: order.price,
      quantity: order.quantity,
      tickSize: snapshot.input.metadata.tickSize,
      lotSize: snapshot.input.metadata.lotSize,
      ...(snapshot.input.metadata.priceDecimals === undefined
        ? {}
        : { priceDecimals: snapshot.input.metadata.priceDecimals }),
      ...(snapshot.input.metadata.sizeDecimals === undefined
        ? {}
        : { sizeDecimals: snapshot.input.metadata.sizeDecimals }),
      clientOrderId,
      knownVenueOrderId: cancel && action.current !== null ? action.current.venueOrderId : null,
      sourceStateHash: snapshot.sourceStateHash,
      strategyDecisionHash: hash({ evaluation, action }),
      createdAt: snapshot.input.now,
      executionRole:
        evaluation.operatingState === 'SESSION_UNWIND'
          ? 'SESSION_UNWIND_IOC'
          : reductionMode
            ? 'INVENTORY_REDUCING_MAKER'
            : 'STANDARD_MAKER',
      reduceOnly: reductionMode,
      timeInForce:
        evaluation.operatingState === 'SESSION_UNWIND' ? 'ImmediateOrCancel' : 'PostOnly',
      ...(cancel ? { cancelReason: action.reason } : {}),
      ...(adverseAuthorization ? { tpAdverseProgress: adverseAuthorization } : {}),
    });
  const candidate = build(order.clientOrderId);
  if (candidate.action === 'CANCEL') return candidate;
  return build(`d1${candidate.side === 'BUY' ? 'b' : 's'}${candidate.mutationKey.slice(0, 29)}`);
}

export function buildAdoptedOpenOrderIntent(
  snapshot: decibel_production_live_snapshot_v1,
  cycleSequence: number,
  existingOrder?: decibel_authenticated_strategy_order_v1,
): execution_intent_v1 | null {
  if (existingOrder === undefined && snapshot.input.openOrders.length !== 1) return null;
  const order = existingOrder ?? snapshot.input.openOrders[0];
  if (
    order === undefined ||
    order.market !== snapshot.input.market ||
    order.strategyConfigId !== snapshot.input.strategyConfigId ||
    !isDecibelPassiveRecyclingClientOrderIdV1(order.clientOrderId) ||
    order.orderType !== 'LIMIT' ||
    order.timeInForce !== 'PostOnly' ||
    !order.postOnly
  )
    return null;
  return buildDecibelExecutionIntentV1({
    sessionId: snapshot.input.sessionId,
    cycleSequence,
    action: 'PLACE',
    market: 'BTC/USD',
    side: order.side,
    price: order.price,
    quantity: order.quantity,
    tickSize: snapshot.input.metadata.tickSize,
    lotSize: snapshot.input.metadata.lotSize,
    ...(snapshot.input.metadata.priceDecimals === undefined
      ? {}
      : { priceDecimals: snapshot.input.metadata.priceDecimals }),
    ...(snapshot.input.metadata.sizeDecimals === undefined
      ? {}
      : { sizeDecimals: snapshot.input.metadata.sizeDecimals }),
    clientOrderId: order.clientOrderId,
    knownVenueOrderId: null,
    sourceStateHash: snapshot.sourceStateHash,
    strategyDecisionHash: hash({ adoption: 'AUTHENTICATED_EXISTING_STRATEGY_ORDER', order }),
    createdAt: snapshot.input.now,
  });
}

/**
 * Entry volume budget left by the session target. While any volume is missing the last
 * entry keeps its normal size (the preferred entry, at least one venue-minimum order)
 * instead of shrinking to a remainder below the venue minimum, which would block both
 * sides and leave the session unfinished. No target: unbounded; target reached: zero.
 */
export function remainingTargetBudgetUsd(
  target: number | undefined,
  executed: number | undefined,
  preferredEntrySizeUsd: number | undefined,
  minimumOrderUsd: number,
): number {
  if (target === undefined || target <= 0) return Infinity;
  const remaining = target - (executed ?? 0);
  if (!(remaining > 1e-9)) return 0;
  return Math.max(remaining, preferredEntrySizeUsd ?? 0, minimumOrderUsd);
}

/**
 * Anti-chase band for repricing a resting entry. Every snapshot read from the venue carries
 * priceRangeBps (null without enough history, which still applies the floor); snapshots
 * without the field keep the legacy band.
 */
export function entryReplacementBandFor(snapshot: decibel_production_live_snapshot_v1): {
  entryReplacementMinimumBps?: number;
} {
  return snapshot.priceRangeBps === undefined
    ? {}
    : { entryReplacementMinimumBps: getDecibelEntryReplacementBandBpsV1(snapshot.priceRangeBps) };
}
export function entryReplacementStabilityFor(snapshot: decibel_production_live_snapshot_v1): {
  minimumStabilityBps?: number;
} {
  return snapshot.priceRangeBps === undefined
    ? {}
    : { minimumStabilityBps: getDecibelEntryReplacementBandBpsV1(snapshot.priceRangeBps) };
}
