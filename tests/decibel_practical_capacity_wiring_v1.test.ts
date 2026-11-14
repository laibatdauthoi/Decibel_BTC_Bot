import { describe, expect, it } from 'vitest';
import { calculateDecibelDynamicQuoteSizeV1 } from '../src/decibel_dynamic_quote_size_v1.js';
import { deriveDecibelSessionTradingLimitsV1 } from '../src/decibel_operator_settings_v1.js';
import { projectDecibelNextSessionPositionLimitV1 } from '../src/run_decibel_production_web_v1.js';
import type { decibel_production_live_snapshot_v1 } from '../src/decibel_production_live_orchestrator_v1.js';
import type { decibel_capacity_inputs_v1 } from '../src/decibel_risk_capacity_v1.js';
const observation = (now = Date.now()): decibel_capacity_inputs_v1 => ({
  accountObservedAt: now,
  marketObservedAt: now,
  maximumAgeMs: 5000,
  actualLeverage: 20,
  venueMaximumOrderNotionalUsd: 10000,
  postOrderMargin: {
    source: 'AUTHENTICATED_POST_ORDER_MARGIN_TIER',
    observedAt: now,
    validUntil: now + 5000,
    maximumNotionalUsd: 10000,
    initialMarginRate: 0.05,
    reservedCollateralUsd: 0,
    liquidationDistanceBps: 1000,
    maintenanceMarginUsd: 0,
    tierBoundaryNotionalUsd: 10000,
  },
  venueMaximumLeverage: 40,
  maintenanceMarginUsd: 0,
  marginDeficitUsd: 0,
  equityUsd: 10.22,
  liquidationPrice: null,
  bids: [{ price: 79999, size: 1 }],
  asks: [{ price: 80001, size: 1 }],
  recentMidpoints: [80000],
});
describe('Approved production capacity wiring', () => {
  it.each([1, 2, 3, 5])(
    'shares Settings Max Loss %s between executable projection and session limits',
    (maxLossUsd) => {
      const o = observation();
      for (const targetMakerVolumeUsd of [50, 100, 200, 1000, 5000]) {
        const settings = Object.freeze({
          capitalToUseUsd: 8,
          maxLossUsd,
          targetMakerVolumeUsd,
          orderNotionalUsd: 10,
          maxPositionUsd: 50,
        });
        const limits = deriveDecibelSessionTradingLimitsV1({
          settings,
          venueAvailableMarginUsd: 10.22,
          positionBase: 0,
          openOrders: [],
          midpoint: 80000,
          maximumEffectiveLeverage: 40,
          venueMaximumNotionalUsd: 50,
          maximumAggregateCollateralFraction: 0.5,
          capacityInputs: o,
          now: Date.now(),
          pnlUsd: 0,
          lotSize: 0.00001,
        });
        const snapshot = {
          availableMarginUsd: 10.22,
          maximumEffectiveLeverage: 40,
          practicalCapacityInputs: o,
          accountMetrics: { collateralUsd: 10.22 },
          input: {
            now: Date.now() - 100,
            actualInventoryBase: 0,
            openOrders: [],
            metadata: { lotSize: 0.00001 },
            book: { bestBid: 79999, bestAsk: 80001 },
          },
        } as unknown as decibel_production_live_snapshot_v1;
        expect(
          projectDecibelNextSessionPositionLimitV1({
            settings,
            snapshot,
            accountReady: true,
            marketReady: true,
            venueMaximumNotionalUsd: 50,
            maximumAggregateCollateralFraction: 0.5,
          }),
        ).toBe(limits.effectivePositionLimitUsd);
        expect(limits.capacityBlocker).toBeNull();
        expect(limits.effectivePositionLimitUsd).toBeGreaterThan(50);
        expect(limits.maximumOrderNotionalUsd).toBeGreaterThan(50);
        expect(limits.maximumAbsPositionBase * 80000).toBeCloseTo(
          limits.effectivePositionLimitUsd,
          10,
        );
        expect(limits.capacityDiagnostics?.marginCapacityUsd).toBeLessThan(8 * 0.5 * 20);
        expect(settings.maxLossUsd).toBe(maxLossUsd);
      }
    },
  );
  it('uses dynamic capacity and keeps missing post-fill venue margin evidence blocked', () => {
    const base = {
      settings: {
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 5000,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      },
      venueAvailableMarginUsd: 10.22,
      positionBase: 0,
      openOrders: [],
      midpoint: 80000,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 50,
      maximumAggregateCollateralFraction: 0.5,
      capacityInputs: observation(),
      now: Date.now(),
      pnlUsd: 0,
      lotSize: 0.00001,
    };
    const size = (overrides: Partial<typeof base> = {}, target = 5000) => {
      const limits = deriveDecibelSessionTradingLimitsV1({
        ...base,
        ...overrides,
        now: Date.now(),
      });
      return calculateDecibelDynamicQuoteSizeV1({
        side: 'BUY',
        price: 80000,
        proposedSizeBtc: limits.availableHeadroomUsd / 80000,
        inventoryBase: 0,
        maximumAbsPositionBase: limits.maximumAbsPositionBase,
        availableMarginUsd: limits.availableMarginUsd,
        maximumEffectiveLeverage: 20,
        maximumNotionalUsd: limits.maximumOrderNotionalUsd,
        minimumNotionalUsd: 1,
        minimumSize: 0.00001,
        lotSize: 0.00001,
        openOrders: [],
        remainingTargetUsd: target,
      }).finalNotionalUsd;
    };
    expect(size()).toBeGreaterThan(50);
    expect(size({ settings: { ...base.settings, capitalToUseUsd: 2 } })).toBeLessThan(size());
    // Max Loss does not size entries (decibel_entry_size_v1); it bounds DCA and the unwind.
    expect(size({ settings: { ...base.settings, maxLossUsd: 0.5 } })).toBe(size());
    expect(size({ venueAvailableMarginUsd: 1 })).toBeLessThan(size());
    expect(
      size({
        capacityInputs: {
          ...observation(),
          bids: [{ price: 79999, size: 0.0002 }],
          asks: [{ price: 80001, size: 0.0002 }],
        },
      }),
    ).toBeLessThan(size());
    for (const target of [50, 100, 200, 1000, 5000])
      expect(size({}, target)).toBeLessThanOrEqual(target);
    const missing = observation();
    delete missing.postOrderMargin;
    const blocked = deriveDecibelSessionTradingLimitsV1({
      ...base,
      capacityInputs: missing,
      now: Date.now(),
    });
    expect(blocked.maximumOrderNotionalUsd).toBe(0);
    expect(blocked.capacityBlocker).toBe('CAPACITY_POST_ORDER_MARGIN_TIER_UNVERIFIED');
  });
  it('uses candidate post-fill venue margin and liquidation headroom without an invented order maximum', () => {
    const o = observation();
    delete o.venueMaximumOrderNotionalUsd;
    const base = {
      settings: {
        capitalToUseUsd: 8,
        maxLossUsd: 2,
        targetMakerVolumeUsd: 200,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      },
      venueAvailableMarginUsd: 10.222805,
      positionBase: 0,
      openOrders: [],
      midpoint: 80000,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 50,
      maximumAggregateCollateralFraction: 0.5,
      capacityInputs: o,
      now: Date.now(),
      pnlUsd: 0,
      lotSize: 0.00001,
    };
    const normal = deriveDecibelSessionTradingLimitsV1(base);
    expect(normal.capacityBlocker).toBeNull();
    expect(normal.maximumOrderNotionalUsd).toBeGreaterThan(50);
    const tighter = deriveDecibelSessionTradingLimitsV1({
      ...base,
      capacityInputs: { ...o, postOrderMargin: { ...o.postOrderMargin!, initialMarginRate: 0.1 } },
    });
    expect(tighter.effectivePositionLimitUsd).toBeLessThan(normal.effectivePositionLimitUsd);
    const nearLiquidation = deriveDecibelSessionTradingLimitsV1({
      ...base,
      capacityInputs: {
        ...o,
        postOrderMargin: { ...o.postOrderMargin!, liquidationDistanceBps: 100 },
      },
    });
    expect(nearLiquidation.maximumOrderNotionalUsd).toBe(0);
    expect(nearLiquidation.capacityBlocker).toBe(
      'SESSION_CAPACITY_LIQUIDATION_BUFFER_INSUFFICIENT',
    );
    const stale = deriveDecibelSessionTradingLimitsV1({
      ...base,
      capacityInputs: {
        ...o,
        postOrderMargin: { ...o.postOrderMargin!, observedAt: 1, validUntil: 2 },
      },
    });
    expect(stale.maximumOrderNotionalUsd).toBe(0);
    expect(stale.capacityBlocker).toBe('CAPACITY_MARGIN_TIER_STALE_OR_INVALID');
    for (const positionBase of [-0.0001, 0.0001]) {
      const loaded = deriveDecibelSessionTradingLimitsV1({
        ...base,
        positionBase,
        openOrders: [
          { side: 'BUY', price: 80000, quantity: 0.00005 },
          { side: 'SELL', price: 80000, quantity: 0.00005 },
        ],
        capacityInputs: { ...o, liquidationPrice: positionBase > 0 ? 65000 : 94000 },
      });
      expect(loaded.capacityBlocker).toBeNull();
      expect(loaded.availableHeadroomUsd).toBeLessThan(normal.availableHeadroomUsd);
    }
  });
  it('wires real-rule producer into the same projection and shrinks unsafe candidate lots', () => {
    const now = Date.now();
    const o = {
      ...observation(now),
      actualLeverage: 40,
      venueMarginRules: {
        observedAt: now,
        ledgerVersion: '123',
        maximumLeverage: 40,
        maintenanceMultiplier: 1,
        maintenanceDivisor: 2,
        markPrice: 80200,
        markObservedAt: now,
        remainingOpenInterestBase: 100,
        sizeModel: 'FIXED_LEVERAGE_V1' as const,
      },
    };
    delete o.postOrderMargin;
    delete o.venueMaximumOrderNotionalUsd;
    const settings = {
      capitalToUseUsd: 8,
      maxLossUsd: 2,
      targetMakerVolumeUsd: 200,
      orderNotionalUsd: 10,
      maxPositionUsd: 50,
    };
    const args = {
      settings,
      venueAvailableMarginUsd: 10.222805,
      positionBase: 0,
      openOrders: [],
      midpoint: 80000,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 50,
      maximumAggregateCollateralFraction: 0.5,
      capacityInputs: o,
      now,
      pnlUsd: 0,
      lotSize: 0.00001,
    };
    const result = deriveDecibelSessionTradingLimitsV1(args);
    expect(result.capacityBlocker).toBeNull();
    expect(result.maximumOrderNotionalUsd).toBeGreaterThan(50);
    expect(result.maximumOrderNotionalUsd).toBeLessThan(118.4);
    expect(
      result.postFillDiagnostics?.scenarios?.every(
        (s) => s.availableStrategyCollateralUsd >= -1e-9,
      ),
    ).toBe(true);
    const snapshot = {
      availableMarginUsd: 10.222805,
      maximumEffectiveLeverage: 40,
      practicalCapacityInputs: o,
      accountMetrics: { collateralUsd: 10.222805 },
      input: {
        now,
        actualInventoryBase: 0,
        openOrders: [],
        metadata: { lotSize: 0.00001 },
        book: { bestBid: 79999, bestAsk: 80001 },
      },
    } as unknown as decibel_production_live_snapshot_v1;
    expect(
      projectDecibelNextSessionPositionLimitV1({
        settings,
        snapshot,
        accountReady: true,
        marketReady: true,
        venueMaximumNotionalUsd: 50,
        maximumAggregateCollateralFraction: 0.5,
      }),
    ).toBe(result.effectivePositionLimitUsd);
    const stale = deriveDecibelSessionTradingLimitsV1({
      ...args,
      capacityInputs: {
        ...o,
        venueMarginRules: { ...o.venueMarginRules, observedAt: 1, markObservedAt: 1 },
      },
    });
    expect(stale.capacityBlocker).toBe('CAPACITY_VENUE_MARGIN_RULES_STALE');
    expect(stale.maximumOrderNotionalUsd).toBe(0);
  });
  it('keeps missing authenticated leverage fail-closed in the prepared branch', () => {
    const limits = deriveDecibelSessionTradingLimitsV1({
      settings: {
        capitalToUseUsd: 8,
        maxLossUsd: 3,
        targetMakerVolumeUsd: 5000,
        orderNotionalUsd: 10,
        maxPositionUsd: 50,
      },
      venueAvailableMarginUsd: 10.22,
      positionBase: 0,
      openOrders: [],
      midpoint: 80000,
      maximumEffectiveLeverage: 40,
      venueMaximumNotionalUsd: 50,
      maximumAggregateCollateralFraction: 0.5,
      capacityInputs: { ...observation(), actualLeverage: null },
      now: Date.now(),
      pnlUsd: 0,
      lotSize: 0.00001,
    });
    expect(limits.capacityBlocker).not.toBeNull();
    expect(limits.effectivePositionLimitUsd).toBe(0);
  });
});
