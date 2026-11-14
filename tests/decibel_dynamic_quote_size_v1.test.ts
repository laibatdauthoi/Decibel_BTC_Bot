import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calculateDecibelDynamicQuoteSizeV1,
  allocateDecibelTwoSidedQuoteBudgetV1,
  calculateDecibelSidePositionBudgetBtcV1,
  type decibel_quote_size_input_v1,
} from '../src/decibel_dynamic_quote_size_v1.js';

const input: decibel_quote_size_input_v1 = {
  side: 'BUY',
  price: 80_000,
  proposedSizeBtc: 0.00031,
  inventoryBase: 0,
  maximumAbsPositionBase: 0.000625,
  availableMarginUsd: 8,
  maximumEffectiveLeverage: 25,
  maximumNotionalUsd: 50,
  minimumNotionalUsd: 10,
  minimumSize: 0.00002,
  lotSize: 0.00001,
  openOrders: [],
  remainingTargetUsd: 50,
};
describe('Deterministic dynamic quote size budgets', () => {
  it('preserves legitimate $25 strategy allocation instead of manufacturing size variation', () => {
    const result = calculateDecibelDynamicQuoteSizeV1(input);
    expect(result).toMatchObject({
      finalSizeBtc: 0.00031,
      finalNotionalUsd: 24.8,
      bindingConstraint: 'STRATEGY_ALLOCATION',
    });
  });
  it('reduces size with inventory pressure and same-side pending exposure', () => {
    const inventory = calculateDecibelDynamicQuoteSizeV1({ ...input, inventoryBase: 0.0004 });
    expect(inventory.finalSizeBtc).toBe(0.00022);
    expect(inventory.bindingConstraint).toBe('POSITION_HEADROOM');
    const pending = calculateDecibelDynamicQuoteSizeV1({
      ...input,
      inventoryBase: 0.0004,
      openOrders: [{ side: 'BUY', price: 80_000, quantity: 0.00005 }],
    });
    expect(pending.finalSizeBtc).toBe(0.00017);
    expect(pending.positionBudgetBtc).toBeLessThan(inventory.positionBudgetBtc);
  });
  it('responds to remaining margin without relaxing leverage or notional limits', () => {
    const result = calculateDecibelDynamicQuoteSizeV1({ ...input, availableMarginUsd: 0.5 });
    expect(result).toMatchObject({
      finalSizeBtc: 0.00015,
      bindingConstraint: 'AVAILABLE_MARGIN',
      marginBudgetUsd: 12.5,
    });
    expect(result.finalNotionalUsd).toBeLessThanOrEqual(12.5);
  });
  it('keeps the normal entry size for the last trade when only a small remainder is missing', () => {
    // $3 missing with a $10 preferred entry: overshoot the target instead of shrinking.
    const last = calculateDecibelDynamicQuoteSizeV1({
      ...input,
      proposedSizeBtc: 0.00013,
      preferredEntrySizeUsd: 10,
      remainingTargetUsd: 3,
    });
    expect(last.finalSizeBtc).toBe(0.00013);
    expect(last.finalNotionalUsd).toBeCloseTo(10.4, 6);
    expect(last.bindingConstraint).not.toBe('REMAINING_TRADING_VOLUME');
    // Nothing opens once the target is covered.
    expect(
      calculateDecibelDynamicQuoteSizeV1({
        ...input,
        preferredEntrySizeUsd: 10,
        remainingTargetUsd: 0,
      }).finalSizeBtc,
    ).toBe(0);
    // A large remainder still caps the size exactly as before.
    expect(
      calculateDecibelDynamicQuoteSizeV1({
        ...input,
        preferredEntrySizeUsd: 10,
        remainingTargetUsd: 20,
      }).finalNotionalUsd,
    ).toBeLessThanOrEqual(20 + 1e-9);
  });
  it('uses V2 maker + taker executions and reserves only same-side opening volume', () => {
    const totalExecutedVolumeUsd = 20 + 10;
    const result = calculateDecibelDynamicQuoteSizeV1({
      ...input,
      remainingTargetUsd: 50 - totalExecutedVolumeUsd,
    });
    expect(result).toMatchObject({
      finalSizeBtc: 0.00025,
      bindingConstraint: 'REMAINING_TRADING_VOLUME',
    });
    const pending = calculateDecibelDynamicQuoteSizeV1({
      ...input,
      remainingTargetUsd: 20,
      openOrders: [{ side: 'BUY', price: 80_000, quantity: 0.00005 }],
    });
    expect(pending).toMatchObject({ volumeBudgetUsd: 16, finalSizeBtc: 0.0002 });
    // The opposite-side entry is the alternative and a reduce-only exit never counts.
    for (const order of [
      { side: 'SELL' as const, price: 80_000, quantity: 0.00005 },
      { side: 'BUY' as const, price: 80_000, quantity: 0.00005, reduceOnly: true },
    ])
      expect(
        calculateDecibelDynamicQuoteSizeV1({
          ...input,
          remainingTargetUsd: 20,
          openOrders: [order],
        }),
      ).toMatchObject({ volumeBudgetUsd: 20, finalSizeBtc: 0.00025 });
  });
  it('releases only the exact cancelled replacement reservation for planning', () => {
    const openOrders = [
      { venueOrderId: 'bid', side: 'BUY' as const, price: 80_000, quantity: 0.00031 },
      { venueOrderId: 'ask', side: 'SELL' as const, price: 80_000, quantity: 0.00025 },
    ];
    // Replacing the resting BUY releases it; the opposite-side entry never counts.
    const result = calculateDecibelDynamicQuoteSizeV1({
      ...input,
      openOrders,
      replacingVenueOrderId: 'bid',
    });
    expect(result.pendingVolumeUsd).toBe(0);
    expect(result.finalSizeBtc).toBe(0.00031);
    // Without the replacement the resting BUY ($24.80) still holds its share of the target.
    const kept = calculateDecibelDynamicQuoteSizeV1({ ...input, openOrders });
    expect(kept.pendingVolumeUsd).toBeCloseTo(24.8, 9);
    expect(kept.volumeBudgetUsd).toBeCloseTo(50 - 24.8, 9);
  });
  it('never rounds above a budget and finishes a tiny remainder with one minimum trade', () => {
    const rounded = calculateDecibelDynamicQuoteSizeV1({ ...input, remainingTargetUsd: 19.99 });
    expect(rounded.finalSizeBtc).toBe(0.00024);
    expect(rounded.finalNotionalUsd).toBeLessThanOrEqual(19.99);
    expect(rounded.roundingReason).toBe('ROUNDED_DOWN_TO_LOT');
    const residual = calculateDecibelDynamicQuoteSizeV1({ ...input, remainingTargetUsd: 0.101749 });
    expect(residual.finalSizeBtc).toBe(0.00013);
  });
  it('is restart/replay deterministic and has no dependence on a previous cohort', () => {
    const state = { ...input, remainingTargetUsd: 15, inventoryBase: 0.0002 };
    const first = calculateDecibelDynamicQuoteSizeV1(state);
    const restored = calculateDecibelDynamicQuoteSizeV1(
      JSON.parse(JSON.stringify(state)) as decibel_quote_size_input_v1,
    );
    expect(restored).toEqual(first);
    expect(restored.finalSizeBtc).toBe(0.00018);
  });
  it('fails closed on incomplete or invalid budgets', () => {
    expect(() =>
      calculateDecibelDynamicQuoteSizeV1({ ...input, availableMarginUsd: Number.NaN }),
    ).toThrow('DYNAMIC_QUOTE_SIZE_INPUT_INVALID');
  });
});

it('blocks increases at zero effective cap while permitting position reduction', () => {
  expect(
    calculateDecibelDynamicQuoteSizeV1({ ...input, maximumAbsPositionBase: 0 }).finalSizeBtc,
  ).toBe(0);
  expect(
    calculateDecibelDynamicQuoteSizeV1({
      ...input,
      maximumAbsPositionBase: 0,
      inventoryBase: 0.0004,
    }).finalSizeBtc,
  ).toBe(0);
  expect(
    calculateDecibelDynamicQuoteSizeV1({
      ...input,
      side: 'SELL',
      maximumAbsPositionBase: 0,
      inventoryBase: 0.0004,
    }).finalSizeBtc,
  ).toBeGreaterThan(0);
});

describe('Production-derived dynamic activation exposure budgets', () => {
  const f = JSON.parse(
    readFileSync(
      new URL('./fixtures/decibel_dynamic_activation_incident_v1.json', import.meta.url),
      'utf8',
    ),
  ) as {
    positionBase: number;
    bestBid: number;
    aggregateCapacityUsd: number;
    availableMarginUsd: number;
    selectedLeverage: number;
    targetUsd: number;
    executedVolumeUsd: number;
  };
  const positioned = {
    ...input,
    price: f.bestBid,
    inventoryBase: f.positionBase,
    maximumAbsPositionBase: f.aggregateCapacityUsd / f.bestBid,
    proposedSizeBtc: 0.002,
    maximumNotionalUsd: f.aggregateCapacityUsd,
    availableMarginUsd: f.availableMarginUsd,
    maximumEffectiveLeverage: f.selectedLeverage,
    remainingTargetUsd: f.targetUsd - f.executedVolumeUsd,
  };
  it('returns zero quote for exhausted pending exposure without throwing invalid limits', () => {
    const remaining = positioned.maximumAbsPositionBase - f.positionBase;
    const result = calculateDecibelDynamicQuoteSizeV1({
      ...positioned,
      openOrders: [{ side: 'BUY', price: f.bestBid, quantity: remaining }],
    });
    expect(result.finalSizeBtc).toBe(0);
    expect(result.positionBudgetBtc).toBeCloseTo(0);
    expect(result.bindingConstraint).toBe('POSITION_HEADROOM');
  });
  it('finishes a remainder below minimum with one executable trade and keeps malformed inputs invalid', () => {
    expect(
      calculateDecibelDynamicQuoteSizeV1({ ...positioned, remainingTargetUsd: 0.22 }).finalSizeBtc,
    ).toBeGreaterThan(0);
    expect(() =>
      calculateDecibelDynamicQuoteSizeV1({ ...positioned, maximumNotionalUsd: Number.NaN }),
    ).toThrow('DYNAMIC_QUOTE_SIZE_INPUT_INVALID');
  });
});

it('separates strict reduction quantity from entry headroom and reserves partial/resting reductions', () => {
  const reducing = {
    ...input,
    inventoryBase: -0.00073,
    maximumAbsPositionBase: 0,
    availableMarginUsd: 7.8,
    maximumEffectiveLeverage: 40,
    maximumNotionalUsd: 200,
    proposedSizeBtc: 0.002,
    reduceOnly: true,
    remainingTargetUsd: 201,
  };
  expect(calculateDecibelDynamicQuoteSizeV1(reducing)).toMatchObject({
    finalSizeBtc: 0.00073,
    reduceOnly: true,
  });
  expect(
    calculateDecibelDynamicQuoteSizeV1({
      ...reducing,
      openOrders: [{ side: 'BUY', price: 80000, quantity: 0.0004 }],
    }).finalSizeBtc,
  ).toBe(0.00033);
  expect(
    calculateDecibelDynamicQuoteSizeV1({ ...reducing, inventoryBase: -0.00033 }).finalSizeBtc,
  ).toBe(0.00033);
  expect(calculateDecibelDynamicQuoteSizeV1({ ...reducing, side: 'SELL' }).finalSizeBtc).toBe(0);
  expect(
    calculateDecibelDynamicQuoteSizeV1({
      ...reducing,
      remainingTargetUsd: 0.22,
      availableMarginUsd: 0,
    }).finalSizeBtc,
  ).toBe(0.00073);
});

it('shares combined volume/collateral between two minimum-valid quotes without netting them', () => {
  const base = {
    bid: { price: 79999, quantity: 0.0007 },
    ask: { price: 80001, quantity: 0.0007 },
    lotSize: 0.00001,
    minimumSize: 0.00002,
    minimumNotionalUsd: 10,
    combinedBudgetUsd: 50,
    preferredSide: 'BUY' as const,
  };
  const pair = allocateDecibelTwoSidedQuoteBudgetV1(base);
  expect(pair.BUY).toBeGreaterThanOrEqual(0.00013);
  expect(pair.SELL).toBeGreaterThanOrEqual(0.00013);
  expect(pair.BUY * base.bid.price + pair.SELL * base.ask.price).toBeLessThanOrEqual(50);
  expect(pair.reason).toBe('COMBINED_BUDGET_SHARED');
  const one = allocateDecibelTwoSidedQuoteBudgetV1({ ...base, combinedBudgetUsd: 15 });
  expect(one.BUY).toBeGreaterThan(0);
  expect(one.SELL).toBe(0);
  expect(one.reason).toBe('COMBINED_BUDGET_BELOW_TWO_SIDE_MINIMUM');
  const none = allocateDecibelTwoSidedQuoteBudgetV1({ ...base, combinedBudgetUsd: 0.22 });
  expect(none.BUY).toBe(0);
  expect(none.SELL).toBe(0);
});

it('chooses the executable side if only its rounded minimum fits the combined budget', () => {
  const pair = allocateDecibelTwoSidedQuoteBudgetV1({
    bid: { price: 79999, quantity: 0.001 },
    ask: { price: 80001, quantity: 0.001 },
    lotSize: 0.00001,
    minimumSize: 0.00002,
    minimumNotionalUsd: 10,
    combinedBudgetUsd: 10.4,
    preferredSide: 'SELL',
  });
  expect(pair.BUY).toBe(0.00013);
  expect(pair.SELL).toBe(0);
});

it('does not subtract opposite pending risk or charge a replacement against its own reservation twice', () => {
  const orders = [
    { side: 'BUY' as const, price: 80000, quantity: 0.00148, venueOrderId: 'held-buy' },
  ];
  const base = {
    side: 'SELL' as const,
    inventoryBase: 0,
    maximumAbsPositionBase: 0.00148,
    openOrders: orders,
  };
  expect(calculateDecibelSidePositionBudgetBtcV1(base)).toBe(0.00148);
  expect(calculateDecibelSidePositionBudgetBtcV1({ ...base, side: 'BUY' })).toBe(0);
  expect(
    calculateDecibelSidePositionBudgetBtcV1({
      ...base,
      side: 'BUY',
      replacingVenueOrderId: 'held-buy',
    }),
  ).toBe(0.00148);
});
it('does not spend the assumed savings of a resting order shrink before CANCEL ACK', () => {
  const pair = allocateDecibelTwoSidedQuoteBudgetV1({
    bid: { price: 80000, quantity: 0.0007 },
    ask: { price: 80000, quantity: 0.0007 },
    reservedBid: { quantity: 0.0014, notionalUsd: 112 },
    lotSize: 0.00001,
    minimumSize: 0.00002,
    minimumNotionalUsd: 10,
    combinedBudgetUsd: 140,
    preferredSide: 'BUY',
  });
  expect(112 + pair.SELL * 80000).toBeLessThanOrEqual(140 + 1e-8);
  expect(pair.SELL).toBeGreaterThanOrEqual(0.00013);
});

describe('Exact reducing quantities and unavoidable residuals', () => {
  it.each([1, -1])(
    'covers all 73 lots at the exit price without BBO-dollar recapping (%s)',
    (sign) => {
      const exit = {
        ...input,
        side: sign > 0 ? ('SELL' as const) : ('BUY' as const),
        reduceOnly: true,
        inventoryBase: sign * 0.00073,
        proposedSizeBtc: 0.00073,
        price: sign > 0 ? 79764.9 : 79500,
        maximumNotionalUsd: 200,
        remainingTargetUsd: null,
      };
      expect(calculateDecibelDynamicQuoteSizeV1(exit).finalSizeBtc).toBe(0.00073);
      const capped = calculateDecibelDynamicQuoteSizeV1({
        ...exit,
        maximumNotionalUsd: 0.00073 * 79700,
      });
      if (sign > 0)
        expect(capped).toMatchObject({
          finalSizeBtc: 0,
          bindingConstraint: 'EXIT_WOULD_LEAVE_UNEXECUTABLE_RESIDUAL',
        });
      expect(
        calculateDecibelDynamicQuoteSizeV1({ ...exit, proposedSizeBtc: 0.00072 }),
      ).toMatchObject({
        finalSizeBtc: 0,
        bindingConstraint: 'EXIT_WOULD_LEAVE_UNEXECUTABLE_RESIDUAL',
      });
    },
  );
  it('uses an explicitly supplied reducing minimum independently of entry notional, without assuming a dust exemption', () => {
    const dust = {
      ...input,
      side: 'SELL' as const,
      reduceOnly: true,
      inventoryBase: 0.00001,
      proposedSizeBtc: 0.00001,
      minimumNotionalUsd: 0,
      maximumNotionalUsd: 200,
      remainingTargetUsd: null,
    };
    expect(calculateDecibelDynamicQuoteSizeV1(dust).finalSizeBtc).toBe(0); // actual known min 2 lots
    expect(calculateDecibelDynamicQuoteSizeV1({ ...dust, minimumSize: 0.00001 }).finalSizeBtc).toBe(
      0.00001,
    ); // synthetic venue rule only
    expect(
      calculateDecibelDynamicQuoteSizeV1({ ...dust, inventoryBase: -0.00001 }).finalSizeBtc,
    ).toBe(0);
    expect(
      calculateDecibelDynamicQuoteSizeV1({
        ...dust,
        inventoryBase: 0.00002,
        proposedSizeBtc: 0.00002,
      }).finalSizeBtc,
    ).toBe(0.00002);
  });
});
