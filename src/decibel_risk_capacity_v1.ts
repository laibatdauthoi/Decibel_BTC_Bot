import {
  produceDecibelMarginTierV1,
  type capacity_verified_margin_v1,
  type capacity_venue_margin_rules_v1,
} from './decibel_capacity_producers_v1.js';
import { isDecibelPositionReductionV1 } from './decibel_order_action_v1.js';
export type decibel_capacity_cost_observation_v1 = Readonly<{
  kind: 'MAKER_FEE' | 'TAKER_FEE' | 'ADVERSE_SELECTION' | 'TRANSACTION_COST';
  value: number;
  unit: 'BPS' | 'USD';
  source: string;
  observedAt: number;
  validUntil: number;
}>;
export type decibel_capacity_inputs_v1 = Readonly<{
  accountObservedAt: number;
  marketObservedAt: number;
  maximumAgeMs: number;
  actualLeverage: number | null;
  venueMaximumLeverage: number;
  maintenanceMarginUsd: number | null;
  marginDeficitUsd: number | null;
  equityUsd: number;
  liquidationPrice: number | null;
  bids: readonly Readonly<{ price: number; size: number }>[];
  asks: readonly Readonly<{ price: number; size: number }>[];
  recentMidpoints: readonly number[];
  /** Timestamped existing 60s book window, for TP regime evidence only. */
  tpRegimePrices?: readonly Readonly<{ observedAt: number; midpoint: number }>[];
  costObservations?: readonly decibel_capacity_cost_observation_v1[];
  /** Explicit venue evidence, never the legacy strategy ENV ceiling. */
  venueMaximumOrderNotionalUsd?: number;
  postOrderMargin?: capacity_verified_margin_v1;
  venueMarginRules?: capacity_venue_margin_rules_v1;
}>;

// Estimates, never authenticated facts. 100 bps = 1% exit-window move floor;
// use twice the observed range when larger. Reserve 10% collateral, 5% of
// Max Loss for transaction costs, 10 bps per fee leg and 8 bps adverse selection.
export const DECIBEL_CAPACITY_POLICY_V1 = Object.freeze({
  modeledExitHorizonMs: 30_000,
  adverseMoveFloorBps: 100,
  observedRangeMultiplier: 2,
  feePerLegBps: 10,
  adverseSelectionBps: 8,
  collateralReserveFraction: 0.1,
  transactionLossReserveFraction: 0.05,
  maximumBookSlippageBps: 25,
});
// Operator explicitly approved this policy and production activation on 2026-10-26. No ENV/API override.
export const DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED: boolean = true;

export type decibel_capacity_evidence_v1 = Readonly<{
  source:
    'AUTHENTICATED_DEPTH_AND_EMPIRICAL_EXIT_STRESS_V1' | 'OBSERVED_INPUTS_WITH_POLICY_ESTIMATES_V1';
  observedAt: number;
  validUntil: number;
  exitHorizonMs: number;
  horizonSource: string;
  stressSource: string;
  adverseMoveBps: number;
  entryFeeBps: number;
  exitFeeBps: number;
  exitSlippageBps: number;
  adverseSelectionBps: number;
  fixedExitCostUsd: number;
  collateralReserveUsd: number;
  liquidationReserveUsd: number;
  liquidationDistanceBps: number;
  initialMarginRate: number;
  reservedCollateralUsd: number;
  maximumExecutableExitNotionalUsd: number;
  exchangeMaximumPositionNotionalUsd: number;
  sessionGasPaidUsd: number;
}>;

/** One calculator for projection and execution; observed inputs use explicit estimates. */
export type decibel_capacity_result_v1 = Readonly<{
  effectivePositionLimitUsd: number;
  marginCapacityUsd: number;
  riskCapacityUsd: number;
  lossModel?: Readonly<{
    lossRemainingUsd: number;
    lossBps: number;
    fixedExitCostUsd: number;
    sessionGasPaidUsd: number;
    stressMoveFraction: number;
    stressSource: string;
    entryFeeBps: number;
    exitFeeBps: number;
    observedAt: number;
    validUntil: number;
  }>;
  availableHeadroomUsd: number;
  worstCaseExposureUsd: number | null;
  bindingConstraint: string;
  capacityBlocker: string | null;
  riskPolicy?: typeof DECIBEL_CAPACITY_POLICY_V1;
  estimatedAdverseMoveBps?: number;
  assumptionsSource?: 'DETERMINISTIC_POLICY_ESTIMATES';
  appliedCostObservations?: readonly decibel_capacity_cost_observation_v1[];
  modeledCosts?: Readonly<{
    entryFeeBps: number;
    exitFeeBps: number;
    adverseSelectionBps: number;
    exitSlippageBps: number;
    transactionReserveUsd: number;
  }>;
}>;
export function calculateDecibelRiskCapacityV1(
  input: Readonly<{
    now: number;
    evidence?: decibel_capacity_evidence_v1;
    observations?: decibel_capacity_inputs_v1;
    capitalUsd: number;
    availableMarginUsd: number;
    leverage: number;
    maxLossUsd: number;
    sizingPolicyVersion?: 1;
    netSessionPnlAfterFeesUsd: number | null;
    midpoint: number;
    lotSize: number;
    collateralFraction: number;
    safetyNotionalCeilingUsd: number;
    positionBase: number;
    orders: readonly Readonly<{
      side?: 'BUY' | 'SELL';
      quantity: number;
      price: number;
      reduceOnly?: boolean;
    }>[];
    inflight?: readonly Readonly<{
      side?: 'BUY' | 'SELL';
      quantity: number;
      price: number;
      reduceOnly?: boolean;
    }>[];
  }>,
): decibel_capacity_result_v1 {
  const fail = (blocker: string) =>
    Object.freeze({
      effectivePositionLimitUsd: 0,
      marginCapacityUsd: 0,
      riskCapacityUsd: 0,
      availableHeadroomUsd: 0,
      worstCaseExposureUsd: null as number | null,
      bindingConstraint: blocker,
      capacityBlocker: blocker,
    });
  let e = input.evidence;
  const appliedCosts: decibel_capacity_cost_observation_v1[] = [];
  const o = input.observations;
  if (o) {
    if (o.postOrderMargin) {
      const margin = produceDecibelMarginTierV1(o.postOrderMargin, input.now, 0);
      if (margin.blocker) return fail(margin.blocker);
    }
    if (
      ![o.accountObservedAt, o.marketObservedAt, o.maximumAgeMs].every(Number.isFinite) ||
      o.maximumAgeMs <= 0 ||
      o.accountObservedAt > input.now ||
      o.marketObservedAt > input.now ||
      input.now - o.accountObservedAt > o.maximumAgeMs ||
      input.now - o.marketObservedAt > o.maximumAgeMs
    )
      return fail('SESSION_CAPACITY_ACCOUNT_OR_MARKET_STALE');
    if (
      o.actualLeverage === null ||
      !Number.isFinite(o.actualLeverage) ||
      o.actualLeverage < 1 ||
      !Number.isFinite(o.venueMaximumLeverage) ||
      o.venueMaximumLeverage < o.actualLeverage ||
      input.leverage > o.actualLeverage
    )
      return fail('SESSION_CAPACITY_AUTHENTICATED_LEVERAGE_REQUIRED');
    if (
      o.maintenanceMarginUsd === null ||
      o.marginDeficitUsd === null ||
      ![o.equityUsd, o.maintenanceMarginUsd, o.marginDeficitUsd].every(
        (v) => Number.isFinite(v) && v >= 0,
      ) ||
      o.equityUsd <= o.maintenanceMarginUsd ||
      o.marginDeficitUsd > 0
    )
      return fail('SESSION_CAPACITY_ACCOUNT_MARGIN_UNSAFE');
    const validSide = (levels: typeof o.bids, buy: boolean) =>
      levels.length > 0 &&
      levels.every(
        (l, i) =>
          Number.isFinite(l.price) &&
          l.price > 0 &&
          Number.isFinite(l.size) &&
          l.size > 0 &&
          (i === 0 || (buy ? l.price > levels[i - 1]!.price : l.price < levels[i - 1]!.price)),
      );
    if (
      !validSide(o.bids, false) ||
      !validSide(o.asks, true) ||
      o.bids[0]!.price >= o.asks[0]!.price ||
      o.recentMidpoints.some((p) => !Number.isFinite(p) || p <= 0)
    )
      return fail('SESSION_CAPACITY_DEPTH_INVALID');
    const mid = (o.bids[0]!.price + o.asks[0]!.price) / 2;
    if (Math.abs(mid - input.midpoint) > input.midpoint * 1e-8)
      return fail('SESSION_CAPACITY_MARKET_IDENTITY_MISMATCH');
    const p = DECIBEL_CAPACITY_POLICY_V1;
    for (const cost of o.costObservations ?? []) {
      if (
        !Number.isFinite(cost.value) ||
        cost.value < 0 ||
        !cost.source.trim() ||
        !Number.isSafeInteger(cost.observedAt) ||
        !Number.isSafeInteger(cost.validUntil) ||
        cost.validUntil < cost.observedAt ||
        cost.unit !== (cost.kind === 'TRANSACTION_COST' ? 'USD' : 'BPS')
      )
        return fail('SESSION_CAPACITY_COST_OBSERVATION_INVALID');
      // Stale/future observations cannot qualify as current facts.
      if (cost.observedAt > input.now || cost.validUntil < input.now) continue;
      if (
        (cost.kind === 'MAKER_FEE' || cost.kind === 'TAKER_FEE') &&
        cost.source !== 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES' &&
        !(
          cost.kind === 'MAKER_FEE' &&
          cost.source === 'DECIBEL_AUTHENTICATED_STRATEGY_MAKER_FILL_HISTORY'
        )
      )
        return fail('SESSION_CAPACITY_FEE_PROVENANCE_INVALID');
      appliedCosts.push(cost);
    }
    const costFloor = (kind: decibel_capacity_cost_observation_v1['kind'], floor: number) =>
      Math.max(floor, ...appliedCosts.filter((c) => c.kind === kind).map((c) => c.value));
    const prices = [mid, ...o.recentMidpoints];
    const rangeBps = ((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 10000;
    const stress = Math.max(p.adverseMoveFloorBps, rangeBps * p.observedRangeMultiplier);
    const depth = (levels: typeof o.bids) =>
      levels
        .filter((l) => Math.abs(l.price / mid - 1) * 10000 <= p.maximumBookSlippageBps)
        .reduce((s, l) => s + l.size * mid, 0);
    const liquidationDistanceBps =
      input.positionBase === 0
        ? Number.MAX_SAFE_INTEGER
        : o.liquidationPrice !== null &&
            Number.isFinite(o.liquidationPrice) &&
            o.liquidationPrice > 0 &&
            (input.positionBase > 0 ? o.liquidationPrice < mid : o.liquidationPrice > mid)
          ? (Math.abs(mid - o.liquidationPrice) / mid) * 10000
          : 0;
    // Do not add estimated reserved collateral back to authenticated free margin.
    // This is conservative under existing exposure and avoids double credit.
    e = {
      source: 'OBSERVED_INPUTS_WITH_POLICY_ESTIMATES_V1',
      observedAt: Math.min(o.accountObservedAt, o.marketObservedAt),
      validUntil: Math.min(o.accountObservedAt, o.marketObservedAt) + o.maximumAgeMs,
      exitHorizonMs: p.modeledExitHorizonMs,
      horizonSource: 'POLICY_ESTIMATE_NOT_CERTIFICATE',
      stressSource: 'POLICY_FLOOR_AND_RECENT_RANGE',
      adverseMoveBps: stress,
      entryFeeBps: costFloor('MAKER_FEE', p.feePerLegBps),
      exitFeeBps: costFloor('TAKER_FEE', p.feePerLegBps),
      exitSlippageBps: p.maximumBookSlippageBps,
      adverseSelectionBps: costFloor('ADVERSE_SELECTION', p.adverseSelectionBps),
      fixedExitCostUsd: costFloor(
        'TRANSACTION_COST',
        input.maxLossUsd * p.transactionLossReserveFraction,
      ),
      collateralReserveUsd:
        Math.min(input.capitalUsd * input.collateralFraction, input.availableMarginUsd) *
        p.collateralReserveFraction,
      liquidationReserveUsd: 0,
      liquidationDistanceBps: Math.min(
        liquidationDistanceBps,
        o.postOrderMargin?.liquidationDistanceBps ?? Number.MAX_SAFE_INTEGER,
      ),
      initialMarginRate: Math.max(1 / o.actualLeverage, o.postOrderMargin?.initialMarginRate ?? 0),
      reservedCollateralUsd: 0,
      maximumExecutableExitNotionalUsd: Math.min(depth(o.bids), depth(o.asks)),
      exchangeMaximumPositionNotionalUsd: Math.min(
        input.safetyNotionalCeilingUsd,
        o.postOrderMargin?.maximumNotionalUsd ?? input.safetyNotionalCeilingUsd,
        o.postOrderMargin?.tierBoundaryNotionalUsd ?? input.safetyNotionalCeilingUsd,
      ),
      sessionGasPaidUsd: 0,
    };
  }
  if (!e) return fail('SESSION_CAPACITY_EVIDENCE_REQUIRED');
  if (
    (e.source !== 'AUTHENTICATED_DEPTH_AND_EMPIRICAL_EXIT_STRESS_V1' &&
      !(o && e.source === 'OBSERVED_INPUTS_WITH_POLICY_ESTIMATES_V1')) ||
    !e.horizonSource ||
    !e.stressSource ||
    !Number.isSafeInteger(e.observedAt) ||
    !Number.isSafeInteger(e.validUntil) ||
    e.observedAt > input.now ||
    e.validUntil < input.now ||
    !Number.isFinite(e.exitHorizonMs) ||
    e.exitHorizonMs <= 0 ||
    (!o && e.validUntil - e.observedAt < e.exitHorizonMs)
  )
    return fail('SESSION_CAPACITY_STRESS_STALE_OR_INVALID');
  const nonnegative = [
    e.adverseMoveBps,
    e.entryFeeBps,
    e.exitFeeBps,
    e.exitSlippageBps,
    e.adverseSelectionBps,
    e.initialMarginRate,
    e.reservedCollateralUsd,
    e.fixedExitCostUsd,
    e.collateralReserveUsd,
    e.liquidationReserveUsd,
    e.liquidationDistanceBps,
    e.maximumExecutableExitNotionalUsd,
    e.exchangeMaximumPositionNotionalUsd,
    e.sessionGasPaidUsd,
    input.availableMarginUsd,
    input.maxLossUsd,
  ];
  if (
    !nonnegative.every((v) => Number.isFinite(v) && v >= 0) ||
    e.adverseMoveBps <= 0 ||
    e.initialMarginRate <= 0 ||
    e.initialMarginRate > 1 ||
    ![input.now, input.positionBase].every(Number.isFinite) ||
    ![
      input.capitalUsd,
      input.leverage,
      input.midpoint,
      input.lotSize,
      input.safetyNotionalCeilingUsd,
    ].every((v) => Number.isFinite(v) && v > 0) ||
    input.leverage > 40 ||
    input.collateralFraction <= 0 ||
    input.collateralFraction > 0.5 ||
    !Number.isFinite(input.collateralFraction) ||
    input.netSessionPnlAfterFeesUsd === null ||
    !Number.isFinite(input.netSessionPnlAfterFeesUsd)
  )
    return fail('SESSION_CAPACITY_ACCOUNT_EVIDENCE_INVALID');
  const orders = [...input.orders, ...(input.inflight ?? [])];
  if (
    orders.some(
      (o) =>
        !o.side ||
        !Number.isFinite(o.quantity) ||
        o.quantity < 0 ||
        !Number.isFinite(o.price) ||
        o.price <= 0,
    )
  )
    return fail('SESSION_CAPACITY_PENDING_EVIDENCE_REQUIRED');
  const lossBps =
    e.adverseMoveBps + e.entryFeeBps + e.exitFeeBps + e.exitSlippageBps + e.adverseSelectionBps;
  if (e.liquidationDistanceBps <= lossBps)
    return fail('SESSION_CAPACITY_LIQUIDATION_BUFFER_INSUFFICIENT');
  // Venue available margin is free margin. Reconstitute total aggregate backing once;
  // configured collateral allocation is a ceiling, not an additional subtraction.
  const allocated = Math.min(
    input.capitalUsd * input.collateralFraction,
    input.availableMarginUsd + e.reservedCollateralUsd,
  );
  const marginTransactionReserve =
    input.sizingPolicyVersion === 1 && o
      ? (appliedCosts.find((cost) => cost.kind === 'TRANSACTION_COST')?.value ?? 0)
      : e.fixedExitCostUsd;
  const fixed = e.collateralReserveUsd + e.liquidationReserveUsd + marginTransactionReserve;
  const marginCapacityUsd =
    Math.max(0, allocated - fixed) /
    (Math.max(1 / input.leverage, e.initialMarginRate) +
      (e.entryFeeBps + e.exitFeeBps + e.exitSlippageBps) / 10000);
  const lossRemaining = Math.max(
    0,
    input.maxLossUsd +
      Math.min(0, input.netSessionPnlAfterFeesUsd) -
      e.sessionGasPaidUsd -
      e.fixedExitCostUsd,
  );
  const riskCapacityUsd = lossRemaining / (lossBps / 10000);
  const caps = [
    { name: 'MARGIN', value: marginCapacityUsd },
    ...(input.sizingPolicyVersion === 1 ? [] : [{ name: 'STRESS_LOSS', value: riskCapacityUsd }]),
    { name: 'EXIT_DEPTH', value: e.maximumExecutableExitNotionalUsd },
    {
      name: o ? 'CONFIGURED_EXECUTION_NOTIONAL_CEILING' : 'EXCHANGE',
      value: e.exchangeMaximumPositionNotionalUsd,
    },
    { name: 'NON_STRATEGY_SAFETY_CEILING', value: input.safetyNotionalCeilingUsd },
  ];
  const binding = caps.reduce((a, b) => (b.value < a.value ? b : a));
  const lot = input.midpoint * input.lotSize;
  const effectivePositionLimitUsd = Math.floor(binding.value / lot) * lot;
  const openingOrders = orders.filter(
    (order) => !isDecibelPositionReductionV1(input.positionBase, order),
  );
  const buys = openingOrders.filter((o) => o.side === 'BUY').reduce((s, o) => s + o.quantity, 0);
  const sells = openingOrders.filter((o) => o.side === 'SELL').reduce((s, o) => s + o.quantity, 0);
  // Every subset can fill: do not net opposite resting orders to zero.
  const worstCaseExposureUsd =
    Math.max(Math.abs(input.positionBase + buys), Math.abs(input.positionBase - sells)) *
    input.midpoint;
  return Object.freeze({
    effectivePositionLimitUsd,
    marginCapacityUsd,
    riskCapacityUsd,
    lossModel: {
      lossRemainingUsd: lossRemaining,
      lossBps,
      fixedExitCostUsd: e.fixedExitCostUsd,
      sessionGasPaidUsd: e.sessionGasPaidUsd,
      stressMoveFraction: e.adverseMoveBps / 10000,
      stressSource: e.stressSource,
      entryFeeBps: e.entryFeeBps,
      exitFeeBps: e.exitFeeBps,
      observedAt: e.observedAt,
      validUntil: e.validUntil,
    },
    worstCaseExposureUsd,
    availableHeadroomUsd: Math.max(0, effectivePositionLimitUsd - worstCaseExposureUsd),
    bindingConstraint: binding.name,
    capacityBlocker: null as string | null,
    ...(o
      ? {
          riskPolicy: DECIBEL_CAPACITY_POLICY_V1,
          estimatedAdverseMoveBps: e.adverseMoveBps,
          assumptionsSource: 'DETERMINISTIC_POLICY_ESTIMATES' as const,
          appliedCostObservations: appliedCosts,
          modeledCosts: {
            entryFeeBps: e.entryFeeBps,
            exitFeeBps: e.exitFeeBps,
            adverseSelectionBps: e.adverseSelectionBps,
            exitSlippageBps: e.exitSlippageBps,
            transactionReserveUsd: e.fixedExitCostUsd,
          },
        }
      : {}),
  });
}
