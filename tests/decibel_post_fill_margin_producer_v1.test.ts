import { normalizeDecibelVenueMarginTimestampV1 } from '../src/decibel_production_live_state_source_v1.js';
import { readFileSync } from 'node:fs';
import { loadDecibelSdkRuntimeV1 } from '../src/decibel_sdk_runtime_v1.js';
import { describe, expect, it } from 'vitest';
import {
  parseDecibelVenueMarginRulesV1,
  produceDecibelPostFillMarginV1,
  type capacity_venue_margin_rules_v1,
} from '../src/decibel_capacity_producers_v1.js';
const rules: capacity_venue_margin_rules_v1 = {
  observedAt: 1000,
  ledgerVersion: '123',
  maximumLeverage: 40,
  maintenanceMultiplier: 1,
  maintenanceDivisor: 2,
  markPrice: 80000,
  markObservedAt: 1000,
  remainingOpenInterestBase: 100,
  sizeModel: 'FIXED_LEVERAGE_V1',
};
const base = {
  rules,
  now: 1000,
  maximumAgeMs: 5000,
  equityUsd: 10.222805,
  availableMarginUsd: 10.222805,
  leverage: 40,
  capitalUsd: 8,
  collateralFraction: 0.5,
  maxLossUsd: 2,
  midpoint: 80000,
  positionBase: 0,
  candidateHeadroomUsd: 50,
  candidatePositionLimitUsd: 50,
  orders: [],
  feeAndExitCostBps: 45,
  collateralReserveFraction: 0.1,
  transactionReserveFraction: 0.05,
};
describe('Production fixed-rule post-fill margin producer', () => {
  it.each([1, -1])(
    'retains exit costs without reserving a second position for a bounded reduce-only TP (%s)',
    (sign) => {
      const order = {
        side: sign > 0 ? ('SELL' as const) : ('BUY' as const),
        quantity: 0.0007,
        price: 80314.4,
        reduceOnly: true,
      };
      const common = { ...base, positionBase: sign * 0.0007, candidateHeadroomUsd: 0 };
      const clean = produceDecibelPostFillMarginV1(common);
      const covered = produceDecibelPostFillMarginV1({ ...common, orders: [order] });
      expect(covered.scenarios?.map((s) => s.positionBase)).toEqual(
        clean.scenarios?.map((s) => s.positionBase),
      );
      expect(covered.scenarios?.[0]?.equityAfterCostsUsd).toBeLessThan(
        clean.scenarios![0]!.equityAfterCostsUsd,
      );
      const unverified = produceDecibelPostFillMarginV1({
        ...common,
        orders: [{ ...order, reduceOnly: false }],
      });
      expect(unverified.scenarios?.map((s) => s.positionBase)).not.toEqual(
        clean.scenarios?.map((s) => s.positionBase),
      );
    },
  );
  it('parses actual deployed fixed rules and fails closed on a new tier schema', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL('./fixtures/decibel_venue_margin_rules_v1.json', import.meta.url),
        'utf8',
      ),
    ) as Parameters<typeof parseDecibelVenueMarginRulesV1>[0];
    expect(parseDecibelVenueMarginRulesV1(raw)).toMatchObject({
      maximumLeverage: 40,
      maintenanceMultiplier: 1,
      maintenanceDivisor: 2,
      sizeModel: 'FIXED_LEVERAGE_V1',
    });
    const market = raw.market as { risk: Record<string, unknown> };
    expect(() =>
      parseDecibelVenueMarginRulesV1({
        ...raw,
        market: { ...market, risk: { ...market.risk, tiers: [] } },
      }),
    ).toThrow();
  });
  it('matches installed SDK liquidation calculation for both candidate directions', async () => {
    await loadDecibelSdkRuntimeV1();
    const { calculateLiquidationPrice } = await import('@decibeltrade/sdk');
    const result = produceDecibelPostFillMarginV1(base);
    for (const scenario of result.scenarios ?? []) {
      const sdk = calculateLiquidationPrice({
        accountEquity: scenario.equityAfterCostsUsd,
        positions: [{ marketAddr: 'BTC', size: scenario.positionBase, entryPrice: 80000 }],
        markets: [{ marketAddr: 'BTC', marketName: 'BTC/USD', maxLeverage: 40 }],
        marketContexts: [{ marketName: 'BTC/USD', markPrice: 80000 }],
        targetMarketAddr: 'BTC',
        orderSize: 0,
      });
      expect(scenario.liquidationPrice).toBeCloseTo(sdk, 6);
    }
  });
  it.each([50, 100, 200])(
    'calculates both LONG/SHORT for %s and respects strategy allocation',
    (notional) => {
      const result = produceDecibelPostFillMarginV1({
        ...base,
        candidateHeadroomUsd: notional,
        candidatePositionLimitUsd: notional,
      });
      expect(result.scenarios).toHaveLength(2);
      for (const s of result.scenarios ?? []) {
        expect(s.initialMarginUsd).toBeCloseTo(notional / 40);
        expect(s.maintenanceMarginUsd).toBeCloseTo(notional / 80);
      }
      expect(result.blocker).toBe(notional === 200 ? 'CAPACITY_POST_FILL_MARGIN_UNSAFE' : null);
    },
  );
  it('includes both-side resting and inflight quantities without netting opposite fills', () => {
    const result = produceDecibelPostFillMarginV1({
      ...base,
      orders: [
        { side: 'BUY', quantity: 0.0001, price: 80000 },
        { side: 'SELL', quantity: 0.0002, price: 80000 },
      ],
      positionBase: 0.0001,
    });
    expect(result.scenarios?.map((s) => Number(s.positionBase.toFixed(12)))).toEqual([
      0.000825, -0.000725,
    ]);
  });
  it('normalizes bounded venue clock skew without refreshing old observations or accepting excessive future marks', () => {
    const normalized = normalizeDecibelVenueMarginTimestampV1(
      { ...rules, markObservedAt: 1405 },
      1000,
      5000,
    );
    expect(normalized).toMatchObject({
      observedAt: 1000,
      rawMarkObservedAt: 1405,
      markObservedAt: 1000,
      markClockSkewMs: 405,
    });
    expect(produceDecibelPostFillMarginV1({ ...base, rules: normalized }).blocker).toBeNull();
    expect(() =>
      normalizeDecibelVenueMarginTimestampV1({ ...rules, markObservedAt: 6001 }, 1000, 5000),
    ).toThrow('BOOK_FUTURE');
    expect(
      produceDecibelPostFillMarginV1({ ...base, now: 7000, rules: normalized }).blocker,
    ).toContain('STALE');
  });
  it('rejects invalid account exposure and invalid risk-policy units', () => {
    expect(produceDecibelPostFillMarginV1({ ...base, positionBase: Number.NaN }).blocker).toBe(
      'CAPACITY_POST_FILL_INPUT_INVALID',
    );
    expect(produceDecibelPostFillMarginV1({ ...base, collateralReserveFraction: 10 }).blocker).toBe(
      'CAPACITY_POST_FILL_INPUT_INVALID',
    );
    expect(
      produceDecibelPostFillMarginV1({ ...base, availableMarginUsd: Number.NaN }).blocker,
    ).toBe('CAPACITY_POST_FILL_INPUT_INVALID');
  });
  it('fails closed on stale rules, tier/schema transition, unavailable margin and OI bounds', () => {
    expect(produceDecibelPostFillMarginV1({ ...base, now: 7000 }).blocker).toContain('STALE');
    expect(produceDecibelPostFillMarginV1({ ...base, equityUsd: 0 }).blocker).toBe(
      'CAPACITY_POST_FILL_MARGIN_UNSAFE',
    );
    expect(
      produceDecibelPostFillMarginV1({
        ...base,
        rules: { ...rules, remainingOpenInterestBase: 0.0001 },
      }).blocker,
    ).toContain('OPEN_INTEREST');
    expect(() =>
      parseDecibelVenueMarginRulesV1({
        global: {},
        expectedPrimaryAssetType: 'test-primary',
        market: { risk: { tiers: [] } },
        interest: {},
        prices: {},
        observedAt: 1000,
        ledgerVersion: '1',
      }),
    ).toThrow();
  });
});
