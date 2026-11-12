import { describe, expect, it } from 'vitest';

import {
  calculateDecibelFairPriceV1,
  type decibel_fair_price_configuration_v1,
} from '../src/decibel_fair_price_engine_v1.js';
import {
  calculateDecibelInventoryConstraintsV1,
  type decibel_inventory_configuration_v1,
} from '../src/decibel_inventory_controller_v1.js';
import {
  buildDecibelMarketStateV1,
  type decibel_market_state_v1,
} from '../src/decibel_market_state_v1.js';
import {
  calculateDecibelQuoteIntentsV1,
  type decibel_quote_policy_configuration_v1,
} from '../src/decibel_quote_engine_v1.js';
import {
  buildDecibelSmartLadderV1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_BUDGET_BPS_V1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_ENTRY_BPS_V1,
  DECIBEL_PRODUCTION_LIFECYCLE_COST_HYSTERESIS_BPS_V1,
  DECIBEL_PRODUCTION_NEUTRAL_INVENTORY_BAND_USD_V1,
  evaluateDecibelLifecycleCostAdmissionV1,
} from '../src/decibel_smart_ladder_v1.js';

const Time = 1_800_000_000_000;
const FairConfiguration: decibel_fair_price_configuration_v1 = {
  micropriceWeight: 0.5,
  maximumMicropriceAdjustmentBps: 10,
  maximumFairToMarkDeviationBps: 1_000,
  maximumFairToOracleDeviationBps: 1_000,
  maximumMarkToOracleDeviationBps: 1_000,
};
const InventoryConfiguration: decibel_inventory_configuration_v1 = {
  softInventoryLimitBase: 0.025,
  hardInventoryLimitBase: 0.05,
  maximumPriceSkewBps: 4,
  minimumInventoryIncreasingSizeMultiplier: 0.2,
};
const QuoteConfiguration: decibel_quote_policy_configuration_v1 = {
  baseHalfSpreadBps: 1,
  baseOrderSizeBase: 0.0127,
};

function createState(
  options: {
    bestBid?: number;
    bestAsk?: number;
    microprice?: number;
    tickSize?: number;
    priceDecimals?: number;
    lotSize?: number;
    sizeDecimals?: number;
    minimumSize?: number;
    connectionHealthy?: boolean;
  } = {},
): decibel_market_state_v1 {
  const bestBid = options.bestBid ?? 67_123.17;
  const bestAsk = options.bestAsk ?? 67_123.83;
  const midpoint = (bestBid + bestAsk) / 2;
  return buildDecibelMarketStateV1({
    constructedAt: new Date(Time),
    metadata: {
      marketAddress: '0xbtc',
      exchangeSymbol: 'BTC/USD',
      tickSize: options.tickSize ?? 0.05,
      lotSize: options.lotSize ?? 0.001,
      minimumSize: options.minimumSize ?? 0.001,
      priceDecimals: options.priceDecimals ?? 2,
      sizeDecimals: options.sizeDecimals ?? 3,
      mode: 'Open',
      observedAt: new Date(Time - 20),
    },
    book: {
      marketAddress: '0xbtc',
      exchangeTimestamp: new Date(Time - 15),
      receivedAt: new Date(Time - 10),
      bestBid,
      bestAsk,
      spread: bestAsk - bestBid,
      midPrice: midpoint,
      microprice: options.microprice ?? midpoint,
      bestBidSize: 3,
      bestAskSize: 1,
      top5DepthImbalance: 0.5,
    },
    prices: {
      marketAddress: '0xbtc',
      exchangeTimestamp: new Date(Time - 15),
      receivedAt: new Date(Time - 10),
      markPrice: midpoint,
      midPrice: midpoint,
      oraclePrice: midpoint,
      fundingRate: 0,
      openInterest: 10,
    },
    sequence: {
      connectionEpoch: null,
      sequenceNumber: null,
      previousSequenceNumber: null,
      status: 'SEQUENCE_UNAVAILABLE',
    },
    connectionHealthy: options.connectionHealthy ?? true,
    persistenceAvailable: true,
    configuration: {
      maximumBookAgeMs: 100,
      maximumPriceAgeMs: 100,
      maximumTradeAgeMs: 100,
      maximumClockSkewMs: 100,
      tradesRequired: false,
    },
  });
}

function quote(state = createState(), inventoryBase = 0, quoteConfiguration = QuoteConfiguration) {
  const fair = calculateDecibelFairPriceV1(state, FairConfiguration);
  const inventory = calculateDecibelInventoryConstraintsV1(
    { signedBaseInventory: inventoryBase, neutralTargetBase: 0 },
    InventoryConfiguration,
  );
  return {
    fair,
    inventory,
    result: calculateDecibelQuoteIntentsV1(state, fair, inventory, quoteConfiguration),
  };
}

describe('calculateDecibelQuoteIntentsV1', () => {
  it('produces deterministic two-sided passive intents from usable neutral inputs', () => {
    const state = createState();
    const first = quote(state).result;
    const second = quote(state).result;
    expect(first).toEqual(second);
    expect(first.status).toBe('QUOTES_READY');
    expect(first.intents.map((intent) => intent.side)).toEqual(['BUY', 'SELL']);
    expect(first.intents.every((intent) => intent.orderType === 'LIMIT')).toBe(true);
    expect(first.intents.every((intent) => intent.timeInForce === 'POST_ONLY')).toBe(true);
    expect(first.intents.map((intent) => intent.intentId)).toEqual(
      second.intents.map((intent) => intent.intentId),
    );
  });

  it('returns INPUT_UNUSABLE for unusable MarketState without rescue', () => {
    const state = createState({ connectionHealthy: false });
    const { result } = quote(state);
    expect(result.status).toBe('INPUT_UNUSABLE');
    expect(result.setFailureReasons).toContain('MARKET_STATE_UNUSABLE');
    expect(result.intents).toEqual([]);
  });

  it('returns INPUT_UNUSABLE for unusable FairPrice', () => {
    const state = createState({ microprice: 67_123.8 });
    const fair = calculateDecibelFairPriceV1(state, {
      ...FairConfiguration,
      maximumFairToMarkDeviationBps: 0,
    });
    const inventory = calculateDecibelInventoryConstraintsV1(
      { signedBaseInventory: 0, neutralTargetBase: 0 },
      InventoryConfiguration,
    );
    const result = calculateDecibelQuoteIntentsV1(state, fair, inventory, QuoteConfiguration);
    expect(result.status).toBe('INPUT_UNUSABLE');
    expect(result.setFailureReasons).toContain('FAIR_PRICE_UNUSABLE');
  });

  it('rejects FairPrice and MarketState identity mismatch', () => {
    const state = createState();
    const otherState = createState({ bestBid: 68_000, bestAsk: 68_001, microprice: 68_000.5 });
    const fair = calculateDecibelFairPriceV1(otherState, FairConfiguration);
    const inventory = calculateDecibelInventoryConstraintsV1(
      { signedBaseInventory: 0, neutralTargetBase: 0 },
      InventoryConfiguration,
    );
    const result = calculateDecibelQuoteIntentsV1(state, fair, inventory, QuoteConfiguration);
    expect(result.status).toBe('INPUT_UNUSABLE');
    expect(result.setFailureReasons).toContain('MARKET_STATE_ID_MISMATCH');
  });

  it('centers neutral quotes around fair price before directional rounding', () => {
    const { fair, result } = quote();
    expect(result.reservationPrice).toBe(fair.fairPrice);
    expect(result.rawBidPrice).toBeCloseTo((fair.fairPrice ?? 0) * 0.9999, 10);
    expect(result.rawAskPrice).toBeCloseTo((fair.fairPrice ?? 0) * 1.0001, 10);
  });

  it('moves long reservation down, making bid less aggressive and ask more aggressive', () => {
    const neutral = quote().result;
    const long = quote(createState(), 0.01).result;
    expect(long.reservationPrice).toBeLessThan(neutral.reservationPrice ?? -Infinity);
    expect(long.rawBidPrice).toBeLessThan(neutral.rawBidPrice ?? -Infinity);
    expect(long.rawAskPrice).toBeLessThan(neutral.rawAskPrice ?? -Infinity);
    expect(long.rawBidSize).toBeLessThan(long.rawAskSize ?? -Infinity);
  });

  it('mirrors long behavior for short inventory', () => {
    const neutral = quote().result;
    const short = quote(createState(), -0.01).result;
    expect(short.reservationPrice).toBeGreaterThan(neutral.reservationPrice ?? Infinity);
    expect(short.rawBidPrice).toBeGreaterThan(neutral.rawBidPrice ?? Infinity);
    expect(short.rawAskPrice).toBeGreaterThan(neutral.rawAskPrice ?? Infinity);
    expect(short.rawAskSize).toBeLessThan(short.rawBidSize ?? -Infinity);
  });

  it('rounds bid down and ask up to exact awkward decimal ticks', () => {
    const { result } = quote(createState({ tickSize: 0.05, priceDecimals: 2 }));
    expect(result.candidateBidPrice).toBeLessThanOrEqual(result.rawBidPrice ?? -Infinity);
    expect(result.candidateAskPrice).toBeGreaterThanOrEqual(result.rawAskPrice ?? Infinity);
    expect(Math.round((result.candidateBidPrice ?? 0) * 100) % 5).toBe(0);
    expect(Math.round((result.candidateAskPrice ?? 0) * 100) % 5).toBe(0);
  });

  it('suppresses a bid at the opposite BBO instead of converting it to taker', () => {
    const state = createState({
      bestBid: 100,
      bestAsk: 101,
      microprice: 101,
      tickSize: 1,
      priceDecimals: 0,
    });
    const fair = { ...calculateDecibelFairPriceV1(state, FairConfiguration), fairPrice: 101 };
    const inventory = calculateDecibelInventoryConstraintsV1(
      { signedBaseInventory: 0, neutralTargetBase: 0 },
      InventoryConfiguration,
    );
    const result = calculateDecibelQuoteIntentsV1(state, fair, inventory, {
      baseHalfSpreadBps: 0,
      baseOrderSizeBase: 0.01,
    });
    expect(result.bidSuppressionReasons).toContain('BID_WOULD_TAKE_LIQUIDITY');
    expect(result.intents.some((intent) => intent.side === 'BUY')).toBe(false);
    expect(result.intents.every((intent) => intent.timeInForce === 'POST_ONLY')).toBe(true);
  });

  it('suppresses an ask at the opposite BBO instead of converting it to taker', () => {
    const state = createState({
      bestBid: 100,
      bestAsk: 101,
      microprice: 100,
      tickSize: 1,
      priceDecimals: 0,
    });
    const fair = { ...calculateDecibelFairPriceV1(state, FairConfiguration), fairPrice: 100 };
    const inventory = calculateDecibelInventoryConstraintsV1(
      { signedBaseInventory: 0, neutralTargetBase: 0 },
      InventoryConfiguration,
    );
    const result = calculateDecibelQuoteIntentsV1(state, fair, inventory, {
      baseHalfSpreadBps: 0,
      baseOrderSizeBase: 0.01,
    });
    expect(result.askSuppressionReasons).toContain('ASK_WOULD_TAKE_LIQUIDITY');
    expect(result.intents.some((intent) => intent.side === 'SELL')).toBe(false);
  });

  it('suppresses an internally equal two-sided set deterministically', () => {
    const state = createState({
      bestBid: 99,
      bestAsk: 101,
      microprice: 100,
      tickSize: 1,
      priceDecimals: 0,
    });
    const { result } = quote(state, 0, { baseHalfSpreadBps: 0, baseOrderSizeBase: 0.01 });
    expect(result.status).toBe('NO_QUOTES');
    expect(result.setFailureReasons).toEqual(['INTERNAL_QUOTE_CROSS']);
    expect(result.intents).toEqual([]);
  });

  it('applies only controller multipliers and rounds size down without increasing exposure', () => {
    const neutral = quote().result;
    const long = quote(createState(), 0.01).result;
    const short = quote(createState(), -0.01).result;
    expect(neutral.rawBidSize).toBe(QuoteConfiguration.baseOrderSizeBase);
    expect(neutral.rawAskSize).toBe(QuoteConfiguration.baseOrderSizeBase);
    expect(long.rawBidSize).toBeCloseTo(
      QuoteConfiguration.baseOrderSizeBase * quote(createState(), 0.01).inventory.bidSizeMultiplier,
      15,
    );
    expect(long.rawAskSize).toBe(QuoteConfiguration.baseOrderSizeBase);
    expect(short.rawBidSize).toBe(QuoteConfiguration.baseOrderSizeBase);
    expect(short.rawAskSize).toBeLessThan(QuoteConfiguration.baseOrderSizeBase);
    expect(neutral.candidateBidSize).toBeLessThanOrEqual(neutral.rawBidSize ?? -Infinity);
    expect(Math.round((neutral.candidateBidSize ?? 0) * 1_000) % 1).toBe(0);
  });

  it.each([
    [0.0015, 0.002],
    [0.0005, 0.001],
  ])(
    'suppresses rounded quantity below minimum without raising it (%s)',
    (baseSize, minimumSize) => {
      const state = createState({ lotSize: 0.001, sizeDecimals: 3, minimumSize });
      const { result } = quote(state, 0, { baseHalfSpreadBps: 1, baseOrderSizeBase: baseSize });
      expect(result.status).toBe('NO_QUOTES');
      expect(result.bidSuppressionReasons).toContain('BID_BELOW_MINIMUM_SIZE');
      expect(result.askSuppressionReasons).toContain('ASK_BELOW_MINIMUM_SIZE');
      expect(result.candidateBidSize).toBeLessThan(minimumSize);
      expect(result.candidateAskSize).toBeLessThan(minimumSize);
    },
  );

  it('emits only ASK at hard long and only BID at hard short', () => {
    const widePolicy = { baseHalfSpreadBps: 10, baseOrderSizeBase: 0.0127 };
    const hardLong = quote(createState(), 0.05, widePolicy).result;
    const hardShort = quote(createState(), -0.05, widePolicy).result;
    expect(hardLong.status).toBe('QUOTES_READY');
    expect(hardLong.bidSuppressionReasons).toContain('BID_INVENTORY_INCREASE_NOT_ALLOWED');
    expect(hardLong.intents.map((intent) => intent.side)).toEqual(['SELL']);
    expect(hardShort.status).toBe('QUOTES_READY');
    expect(hardShort.askSuppressionReasons).toContain('ASK_INVENTORY_INCREASE_NOT_ALLOWED');
    expect(hardShort.intents.map((intent) => intent.side)).toEqual(['BUY']);
  });

  it('does not invent reduce-only, execution, fill, order ID, transaction, or PnL fields', () => {
    const { result } = quote();
    const keys = Object.keys(result.intents[0] ?? {});
    expect(keys).not.toContain('reduceOnly');
    expect(keys).not.toContain('exchangeOrderId');
    expect(keys).not.toContain('transactionHash');
    expect(keys).not.toContain('fillState');
    expect(keys).not.toContain('pnl');
  });

  it('does not mutate source objects and returns deeply frozen arrays and intents', () => {
    const state = createState();
    const { fair, inventory, result } = quote(state);
    expect(state.usable).toBe(true);
    expect(fair.usable).toBe(true);
    expect(inventory.inventoryDeviation).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.intents)).toBe(true);
    expect(Object.isFrozen(result.intents[0])).toBe(true);
    expect(Object.isFrozen(result.bidSuppressionReasons)).toBe(true);
  });

  it.each([
    { baseHalfSpreadBps: -1, baseOrderSizeBase: 0.01 },
    { baseHalfSpreadBps: Number.NaN, baseOrderSizeBase: 0.01 },
    { baseHalfSpreadBps: 1, baseOrderSizeBase: 0 },
    { baseHalfSpreadBps: 1, baseOrderSizeBase: Number.POSITIVE_INFINITY },
  ])('rejects invalid explicit quote policy', (configuration) => {
    const state = createState();
    const fair = calculateDecibelFairPriceV1(state, FairConfiguration);
    const inventory = calculateDecibelInventoryConstraintsV1(
      { signedBaseInventory: 0, neutralTargetBase: 0 },
      InventoryConfiguration,
    );
    expect(() => calculateDecibelQuoteIntentsV1(state, fair, inventory, configuration)).toThrow(
      'DECIBEL_QUOTE_ENGINE_INVALID_CONFIGURATION',
    );
  });
});

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
