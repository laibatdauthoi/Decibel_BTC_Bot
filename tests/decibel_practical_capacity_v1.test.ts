import { describe, expect, it } from 'vitest';
import {
  calculateDecibelRiskCapacityV1,
  type decibel_capacity_inputs_v1,
} from '../src/decibel_risk_capacity_v1.js';
import { calculateDecibelDynamicQuoteSizeV1 } from '../src/decibel_dynamic_quote_size_v1.js';
import { deriveDecibelSessionTradingLimitsV1 } from '../src/decibel_operator_settings_v1.js';
import { DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED } from '../src/decibel_risk_capacity_v1.js';

const observations: decibel_capacity_inputs_v1 = {
  accountObservedAt: 10000,
  marketObservedAt: 10000,
  maximumAgeMs: 5000,
  actualLeverage: 40,
  venueMaximumLeverage: 40,
  maintenanceMarginUsd: 0,
  marginDeficitUsd: 0,
  equityUsd: 10.22,
  liquidationPrice: null,
  bids: [{ price: 79999, size: 1 }],
  asks: [{ price: 80001, size: 1 }],
  recentMidpoints: [80000, 80001, 79999],
};
const input = {
  now: 10000,
  observations,
  capitalUsd: 8,
  availableMarginUsd: 10.22,
  leverage: 40,
  maxLossUsd: 2,
  netSessionPnlAfterFeesUsd: 0,
  midpoint: 80000,
  lotSize: 0.00001,
  collateralFraction: 0.5,
  safetyNotionalCeilingUsd: 1000,
  positionBase: 0,
  orders: [],
};
describe('Approved practical capacity and historical snapshot isolation', () => {
  it.each([1, -1])(
    'reconciles PID1528 collateral without charging its reduce-only TP twice (%s)',
    (sign) => {
      const midpoint = 80078.85;
      const common = {
        settings: {
          capitalToUseUsd: 5,
          maxLossUsd: 2,
          targetMakerVolumeUsd: 500,
          orderNotionalUsd: 10,
          maxPositionUsd: 50,
        },
        venueAvailableMarginUsd: 4.2,
        positionBase: sign * 0.0007,
        midpoint,
        maximumEffectiveLeverage: 40,
        venueMaximumNotionalUsd: 100,
        maximumAggregateCollateralFraction: 0.5,
        now: 10000,
        lotSize: 0.00001,
        capacityInputs: {
          ...observations,
          bids: [{ price: midpoint - 0.05, size: 1 }],
          asks: [{ price: midpoint + 0.05, size: 1 }],
        },
        targetSemanticsVersion: 2 as const,
        capacityPolicyVersion: 1 as const,
        pnlUsd: 0,
      };
      const TP = {
        side: sign > 0 ? ('SELL' as const) : ('BUY' as const),
        price: 80314.4,
        quantity: 0.0007,
        reduceOnly: true,
      };
      const result = deriveDecibelSessionTradingLimitsV1({ ...common, openOrders: [TP] });
      expect(result.marginUsedUsd).toBeCloseTo(1.401379875, 10);
      expect(result.strategyAllocationRemainingUsd).toBeCloseTo(1.098620125, 10);
      expect(result.pendingExposureUsd).toBe(0);
      const unknown = deriveDecibelSessionTradingLimitsV1({
        ...common,
        openOrders: [{ ...TP, reduceOnly: false }],
      });
      expect(unknown.strategyAllocationRemainingUsd).toBe(0);
      for (const unproven of [
        { side: TP.side, price: TP.price, quantity: TP.quantity },
        { ...TP, side: sign > 0 ? ('BUY' as const) : ('SELL' as const) },
        { ...TP, quantity: 0.0008 },
      ]) {
        expect(
          deriveDecibelSessionTradingLimitsV1({ ...common, openOrders: [unproven] })
            .strategyAllocationRemainingUsd,
        ).toBe(0);
      }
      const pending = deriveDecibelSessionTradingLimitsV1({
        ...common,
        openOrders: [TP],
        inflightOrders: [
          {
            side: sign > 0 ? 'BUY' : 'SELL',
            price: 80000,
            quantity: 0.00013,
            reduceOnly: false,
          },
        ],
      });
      expect(pending.marginUsedUsd).toBeCloseTo(result.marginUsedUsd + 0.26, 10);
      expect(pending.strategyAllocationRemainingUsd).toBeCloseTo(
        result.strategyAllocationRemainingUsd - 0.26,
        10,
      );
      const exhausted = deriveDecibelSessionTradingLimitsV1({
        ...common,
        positionBase: sign * 0.0013,
        openOrders: [],
      });
      expect(exhausted.strategyAllocationRemainingUsd).toBe(0);
      expect(common.venueAvailableMarginUsd).toBeGreaterThan(0);
    },
  );
  it('labels a configured notional ceiling accurately instead of inventing an exchange position limit', () => {
    const result = calculateDecibelRiskCapacityV1({ ...input, safetyNotionalCeilingUsd: 50 });
    expect(result.effectivePositionLimitUsd).toBeLessThanOrEqual(50);
    expect(result.bindingConstraint).toBe('CONFIGURED_EXECUTION_NOTIONAL_CEILING');
  });
  it('does not upgrade an unversioned historical snapshot with preview inputs', () => {
    expect(DECIBEL_PRACTICAL_CAPACITY_LIVE_POLICY_ENABLED).toBe(true);
    const result = deriveDecibelSessionTradingLimitsV1({
      settings: {
        capitalToUseUsd: 8,
        maxLossUsd: 3,
        targetMakerVolumeUsd: 1000,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      },
      venueAvailableMarginUsd: 10.22,
      positionBase: 0,
      openOrders: [],
      midpoint: 80000,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 1000,
      maximumAggregateCollateralFraction: 0.5,
      capacityInputs: observations,
      now: 10000,
      targetSemanticsVersion: 2,
      pnlUsd: 0,
      lotSize: 0.00001,
    });
    expect(result.capacityBlocker).toBe('SESSION_CAPACITY_EVIDENCE_REQUIRED');
    expect(result.effectivePositionLimitUsd).toBe(0);
  });
  it.each([50, 100, 200, 1000, 5000])('keeps capacity independent of target %s', (target) => {
    const result = calculateDecibelRiskCapacityV1(input);
    expect(result.capacityBlocker).toBeNull();
    expect(result.effectivePositionLimitUsd).toBeCloseTo(118.4);
    expect(result.riskCapacityUsd).toBeCloseTo(1.9 / 0.0153);
    expect(result.availableHeadroomUsd).toBeCloseTo(118.4);
    expect(result).toEqual(
      calculateDecibelRiskCapacityV1(JSON.parse(JSON.stringify(input)) as typeof input),
    );
    const quote = calculateDecibelDynamicQuoteSizeV1({
      side: 'BUY',
      price: 80000,
      proposedSizeBtc: result.effectivePositionLimitUsd / 80000,
      inventoryBase: 0,
      maximumAbsPositionBase: result.effectivePositionLimitUsd / 80000,
      availableMarginUsd: input.availableMarginUsd,
      maximumEffectiveLeverage: 40,
      maximumNotionalUsd: 1000,
      minimumNotionalUsd: 10,
      minimumSize: 0.00001,
      lotSize: 0.00001,
      openOrders: [],
      remainingTargetUsd: target,
    });
    expect(quote.finalNotionalUsd).toBeLessThanOrEqual(target);
    expect(quote.finalNotionalUsd).toBeLessThanOrEqual(result.effectivePositionLimitUsd);
  });
  it('reacts to capital, loss budget, margin and high volatility', () => {
    const base = calculateDecibelRiskCapacityV1(input);
    for (const change of [
      { capitalUsd: 4 },
      { maxLossUsd: 0.5 },
      { availableMarginUsd: 1 },
      { netSessionPnlAfterFeesUsd: -1.8 },
      { observations: { ...observations, recentMidpoints: [76000, 84000] } },
    ]) {
      expect(
        calculateDecibelRiskCapacityV1({ ...input, ...change }).effectivePositionLimitUsd,
      ).toBeLessThan(base.effectivePositionLimitUsd);
    }
  });
  it.each([1, 2, 3, 5])('uses configured Max Loss %s without a $2 fallback', (maxLossUsd) => {
    const result = calculateDecibelRiskCapacityV1({ ...input, maxLossUsd });
    expect(result.riskCapacityUsd).toBeCloseTo((maxLossUsd * 0.95) / 0.0153);
    expect(result.modeledCosts?.transactionReserveUsd).toBeCloseTo(maxLossUsd * 0.05);
    expect(
      calculateDecibelRiskCapacityV1({
        ...input,
        maxLossUsd,
        netSessionPnlAfterFeesUsd: -maxLossUsd,
      }).effectivePositionLimitUsd,
    ).toBe(0);
  });
  it('uses fresh authenticated fees and applicable observed costs as conservative lower bounds', () => {
    const costs = [
      {
        kind: 'MAKER_FEE' as const,
        unit: 'BPS' as const,
        value: 15,
        source: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        observedAt: 10000,
        validUntil: 15000,
      },
      {
        kind: 'TAKER_FEE' as const,
        unit: 'BPS' as const,
        value: 20,
        source: 'DECIBEL_AUTHENTICATED_REST_USER_FEE_RATES',
        observedAt: 10000,
        validUntil: 15000,
      },
      {
        kind: 'ADVERSE_SELECTION' as const,
        unit: 'BPS' as const,
        value: 12,
        source: 'SYNTHETIC_BBO_BLOCK_AWARE_REGIME_P95',
        observedAt: 10000,
        validUntil: 15000,
      },
      {
        kind: 'TRANSACTION_COST' as const,
        unit: 'USD' as const,
        value: 0.25,
        source: 'HISTORICAL_SUCCESSFUL_TX_P95',
        observedAt: 10000,
        validUntil: 15000,
      },
    ];
    const result = calculateDecibelRiskCapacityV1({
      ...input,
      observations: { ...observations, costObservations: costs },
    });
    expect(result.modeledCosts).toMatchObject({
      entryFeeBps: 15,
      exitFeeBps: 20,
      adverseSelectionBps: 12,
      transactionReserveUsd: 0.25,
    });
    expect(result.effectivePositionLimitUsd).toBeLessThan(
      calculateDecibelRiskCapacityV1(input).effectivePositionLimitUsd,
    );
    expect(
      calculateDecibelRiskCapacityV1({
        ...input,
        observations: { ...observations, costObservations: [{ ...costs[2]!, value: 7.56 }] },
      }).modeledCosts?.adverseSelectionBps,
    ).toBe(8);
    expect(
      calculateDecibelRiskCapacityV1({
        ...input,
        observations: {
          ...observations,
          costObservations: costs.map((c) => ({ ...c, validUntil: 9000, observedAt: 8000 })),
        },
      }).appliedCostObservations,
    ).toEqual([]);
    expect(
      calculateDecibelRiskCapacityV1({
        ...input,
        observations: {
          ...observations,
          costObservations: [{ ...costs[0]!, source: 'UNAUTHENTICATED' }],
        },
      }).capacityBlocker,
    ).toBe('SESSION_CAPACITY_FEE_PROVENANCE_INVALID');
  });
  it.each([1, 5, 20, 40])('respects actual leverage %s without modifying it', (leverage) => {
    const result = calculateDecibelRiskCapacityV1({
      ...input,
      leverage,
      observations: { ...observations, actualLeverage: leverage },
    });
    expect(result.effectivePositionLimitUsd).toBeLessThanOrEqual(8 * 0.5 * leverage);
    expect(result.capacityBlocker).toBeNull();
  });
  it('uses worst-case simultaneous fills and separates aggregate cap from headroom', () => {
    const before = calculateDecibelRiskCapacityV1({
      ...input,
      positionBase: 0.0002,
      orders: [
        { side: 'BUY', quantity: 0.0001, price: 80000 },
        { side: 'SELL', quantity: 0.0003, price: 80000 },
      ],
      inflight: [{ side: 'BUY', quantity: 0.0001, price: 80000 }],
      observations: { ...observations, liquidationPrice: 60000 },
    });
    expect(before.worstCaseExposureUsd).toBe(32);
    expect(before.availableHeadroomUsd).toBeCloseTo(before.effectivePositionLimitUsd - 32);
    const after = calculateDecibelRiskCapacityV1({
      ...input,
      positionBase: 0.00025,
      orders: [{ side: 'BUY', quantity: 0.00005, price: 80000 }],
      observations: { ...observations, liquidationPrice: 60000 },
    });
    expect(after.worstCaseExposureUsd).toBeCloseTo(24);
  });
  it('blocks missing/stale authenticated inputs, unsafe margins and near liquidation', () => {
    for (const change of [
      { actualLeverage: null },
      { accountObservedAt: 0 },
      { marketObservedAt: 0 },
      { maintenanceMarginUsd: null },
      { marginDeficitUsd: 1 },
      { equityUsd: 0 },
      { bids: [] },
      { recentMidpoints: [Number.NaN] },
    ]) {
      expect(
        calculateDecibelRiskCapacityV1({ ...input, observations: { ...observations, ...change } })
          .capacityBlocker,
      ).not.toBeNull();
    }
    for (const positionBase of [0.0002, -0.0002]) {
      expect(
        calculateDecibelRiskCapacityV1({
          ...input,
          positionBase,
          observations: { ...observations, liquidationPrice: positionBase > 0 ? 79900 : 80100 },
        }).capacityBlocker,
      ).toBe('SESSION_CAPACITY_LIQUIDATION_BUFFER_INSUFFICIENT');
    }
    expect(
      calculateDecibelRiskCapacityV1({ ...input, netSessionPnlAfterFeesUsd: -2 })
        .effectivePositionLimitUsd,
    ).toBe(0);
  });
  it('respects thin depth and finishes residual targets with one minimum trade', () => {
    const result = calculateDecibelRiskCapacityV1({
      ...input,
      observations: { ...observations, asks: [{ price: 80001, size: 0.0002 }] },
    });
    expect(result.effectivePositionLimitUsd).toBe(16);
    expect(result.bindingConstraint).toBe('EXIT_DEPTH');
    const quote = calculateDecibelDynamicQuoteSizeV1({
      side: 'BUY',
      price: 80000,
      proposedSizeBtc: 0.001,
      inventoryBase: 0,
      maximumAbsPositionBase: 0.001,
      availableMarginUsd: 8,
      maximumEffectiveLeverage: 40,
      maximumNotionalUsd: 1000,
      minimumNotionalUsd: 10,
      minimumSize: 0.00001,
      lotSize: 0.00001,
      openOrders: [],
      remainingTargetUsd: 0.22,
    });
    expect(quote.finalSizeBtc).toBe(0.00013);
  });
});
