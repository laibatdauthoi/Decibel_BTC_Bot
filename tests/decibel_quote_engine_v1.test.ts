import { describe, expect, it } from 'vitest';

import {
  buildDecibelSmartLadderV1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_HYSTERESIS_BPS_V1,
  DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1,
  evaluateDecibelLifecycleCostAdmissionV1,
} from '../src/decibel_smart_ladder_v1.js';

describe('buildDecibelSmartLadderV1', () => {
  it('keeps replay and production admission identical for persisted shadow costs', () => {
    const persistedShadowCosts = Array.from({ length: 300 }, (_, index) =>
      index % 2 === 0 ? 26.31331047755156 : 26.317006481574264,
    );
    const replay = persistedShadowCosts.map((cost) =>
      evaluateDecibelLifecycleCostAdmissionV1(cost, false),
    );
    const production = persistedShadowCosts.map((cost) =>
      evaluateDecibelLifecycleCostAdmissionV1(cost, false),
    );
    expect(replay).toEqual(production);
    expect(replay.filter((reason) => reason === 'VOLUME_COST_BUDGET_ELIGIBLE')).toHaveLength(0);
  });
  const input = {
    bestBid: 99.9,
    bestAsk: 100.1,
    tickSize: 0.1,
    lotSize: 0.01,
    minimumSize: 0.01,
    inventoryBase: 0,
    maximumAbsPositionBase: 2,
    availableCollateralUsd: 1_000,
    maximumEffectiveLeverage: 1,
    maximumNotionalUsd: 200,
    configuration: {
      maximumLevelsPerSide: 3,
      maximumAggregateCollateralFraction: 0.5,
      levelAllocations: [0.5, 0.3, 0.2],
      baseHalfSpreadBps: 10,
      volatilitySpreadMultiplier: 1,
      maximumVolatilitySpreadMultiplier: 3,
    },
  } as const;

  it('builds at most three decreasing levels per side within aggregate commitment', () => {
    const result = buildDecibelSmartLadderV1(input);
    const bids = result.levels.filter((level) => level.side === 'BUY');
    const asks = result.levels.filter((level) => level.side === 'SELL');
    expect(bids).toHaveLength(3);
    expect(asks).toHaveLength(3);
    expect(bids.map((level) => level.quantity)).toEqual([0.5, 0.3, 0.2]);
    expect(result.aggregateNotionalUsd).toBeLessThanOrEqual(
      result.maximumAggregateNotionalUsd + input.tickSize * input.minimumSize,
    );
    expect(bids.every((level) => level.price <= input.bestBid)).toBe(true);
    expect(asks.every((level) => level.price >= input.bestAsk)).toBe(true);
  });

  it('pushes and reduces the inventory-increasing side inside the neutral band', () => {
    const neutral = buildDecibelSmartLadderV1(input);
    const long = buildDecibelSmartLadderV1({
      ...input,
      inventoryBase: 0.01,
      lotSize: 0.001,
      minimumSize: 0.001,
    });
    const neutralBid = neutral.levels.find((level) => level.levelId === 'BUY-1')!;
    const longBid = long.levels.find((level) => level.levelId === 'BUY-1')!;
    expect(longBid.price).toBeLessThan(neutralBid.price);
    expect(longBid.quantity).toBeLessThan(neutralBid.quantity);
    expect(longBid.skewStatus).toBe('INVENTORY_INCREASING_SIDE_REDUCED');
  });

  it('suppresses exposure-increasing admission outside the fixed USD neutral band', () => {
    const bandInBase = DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1 / 100;
    const long = buildDecibelSmartLadderV1({ ...input, inventoryBase: bandInBase });
    const short = buildDecibelSmartLadderV1({ ...input, inventoryBase: -bandInBase });

    expect(long.levels.some((level) => level.side === 'BUY')).toBe(false);
    expect(long.levels.some((level) => level.side === 'SELL')).toBe(true);
    expect(short.levels.some((level) => level.side === 'SELL')).toBe(false);
    expect(short.levels.some((level) => level.side === 'BUY')).toBe(true);
    expect(DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1).toBe(11.25);
    expect(DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1).toBe(11.035);
    expect(DECIBEL_PRODUCTION_LIFECYCLE_COST_HYSTERESIS_BPS_V1).toBe(0.215);
  });

  it('keeps both sides structurally available just inside the neutral band', () => {
    const midpoint = (79_015.3 + 79_015.4) / 2;
    const result = buildDecibelSmartLadderV1({
      bestBid: 79_015.3,
      bestAsk: 79_015.4,
      tickSize: 0.1,
      lotSize: 0.00001,
      minimumSize: 0.00001,
      inventoryBase: 2.369 / midpoint,
      maximumAbsPositionBase: 50 / midpoint,
      availableCollateralUsd: 1.59,
      maximumEffectiveLeverage: 40,
      maximumNotionalUsd: 50,
      fairPrice: midpoint,
      configuration: {
        maximumLevelsPerSide: 1,
        maximumAggregateCollateralFraction: 0.5,
        levelAllocations: [1],
        baseHalfSpreadBps: 5,
        volatilitySpreadMultiplier: 1,
        maximumVolatilitySpreadMultiplier: 3,
        minimumTierOneNotionalUsd: 10.5,
      },
    });

    expect(result.levels.some((level) => level.side === 'BUY')).toBe(true);
    expect(result.levels.some((level) => level.side === 'SELL')).toBe(true);
    expect(result.levels.every((level) => level.notionalUsd + Number.EPSILON >= 10.5)).toBe(true);
    const ask = result.levels.find((level) => level.side === 'SELL')!;
    const inventoryAfterFullAskUsd = (2.369 / midpoint - ask.quantity) * ask.price;
    expect(ask.notionalUsd).toBeLessThan(11.4);
    expect(inventoryAfterFullAskUsd).toBeGreaterThan(-9.1);
  });

  it('applies mirrored mild skew without discounting the reducing-side quote', () => {
    const neutral = buildDecibelSmartLadderV1(input);
    const long = buildDecibelSmartLadderV1({
      ...input,
      inventoryBase: 0.01,
      lotSize: 0.001,
      minimumSize: 0.001,
    });
    const short = buildDecibelSmartLadderV1({
      ...input,
      inventoryBase: -0.01,
      lotSize: 0.001,
      minimumSize: 0.001,
    });
    const level = (result: typeof neutral, levelId: string) =>
      result.levels.find((candidate) => candidate.levelId === levelId)!;

    expect(level(long, 'BUY-1').price).toBeLessThan(level(neutral, 'BUY-1').price);
    expect(level(long, 'SELL-1').price).toBe(level(neutral, 'SELL-1').price);
    expect(level(short, 'SELL-1').price).toBeGreaterThan(level(neutral, 'SELL-1').price);
    expect(level(short, 'BUY-1').price).toBe(level(neutral, 'BUY-1').price);
    expect(level(long, 'BUY-1').quantity).toBeLessThan(level(neutral, 'BUY-1').quantity);
    expect(level(short, 'SELL-1').quantity).toBeLessThan(level(neutral, 'SELL-1').quantity);
  });

  it('caps volatility expansion at three times the base spacing', () => {
    const result = buildDecibelSmartLadderV1({
      ...input,
      configuration: { ...input.configuration, volatilitySpreadMultiplier: 10 },
    });
    expect(result.levels.find((level) => level.levelId === 'BUY-1')?.price).toBe(99.7);
  });

  it('rounds BTC tier one up in lot units to the buffered venue minimum', () => {
    const result = buildDecibelSmartLadderV1({
      bestBid: 79_499.9,
      bestAsk: 79_500.1,
      tickSize: 0.1,
      lotSize: 0.00001,
      minimumSize: 0.00001,
      inventoryBase: 0,
      maximumAbsPositionBase: 0.001,
      availableCollateralUsd: 100,
      maximumEffectiveLeverage: 1,
      maximumNotionalUsd: 100,
      configuration: {
        maximumLevelsPerSide: 3,
        maximumAggregateCollateralFraction: 0.5,
        levelAllocations: [0.5, 0.3, 0.2],
        baseHalfSpreadBps: 5,
        volatilitySpreadMultiplier: 1,
        maximumVolatilitySpreadMultiplier: 3,
        minimumTierOneNotionalUsd: 10.5,
      },
    });

    const tierOne = result.levels.filter((level) => level.levelId.endsWith('-1'));
    expect(tierOne).toHaveLength(2);
    expect(tierOne.every((level) => level.quantity >= 0.00014)).toBe(true);
    expect(tierOne.every((level) => level.notionalUsd >= 10.5)).toBe(true);
    expect(result.aggregateNotionalUsd).toBeLessThanOrEqual(result.maximumAggregateNotionalUsd);
  });

  it('does not exceed the risk budget to manufacture a minimum tier one quote', () => {
    const result = buildDecibelSmartLadderV1({
      ...input,
      maximumAbsPositionBase: 0.1,
      maximumNotionalUsd: 10,
      configuration: { ...input.configuration, minimumTierOneNotionalUsd: 10.5 },
    });
    expect(result.levels).toEqual([]);
  });
});

it.each([1, -1])(
  'keeps aggregate commitment bounded for PID 32328 inventory while retaining the reducing side (%s)',
  (sign) => {
    const result = buildDecibelSmartLadderV1({
      bestBid: 80941.5,
      bestAsk: 80943.1,
      tickSize: 0.1,
      lotSize: 0.00001,
      minimumSize: 0.00002,
      inventoryBase: sign * 0.00128,
      maximumAbsPositionBase: 0.00144,
      availableCollateralUsd: 5.88414539936,
      maximumEffectiveLeverage: 40,
      maximumNotionalUsd: 116.556912,
      entryHeadroomUsd: 13.0,
      configuration: {
        maximumLevelsPerSide: 1,
        maximumAggregateCollateralFraction: 0.5,
        levelAllocations: [1],
        baseHalfSpreadBps: 5,
        volatilitySpreadMultiplier: 1,
        maximumVolatilitySpreadMultiplier: 3,
        minimumTierOneNotionalUsd: 10,
      },
    });
    expect(result.aggregateNotionalUsd).toBeLessThanOrEqual(result.maximumAggregateNotionalUsd);
    expect(result.levels.some((level) => level.side === (sign > 0 ? 'SELL' : 'BUY'))).toBe(true);
    expect(result.levels.some((level) => level.side === (sign > 0 ? 'BUY' : 'SELL'))).toBe(false);
  },
);
