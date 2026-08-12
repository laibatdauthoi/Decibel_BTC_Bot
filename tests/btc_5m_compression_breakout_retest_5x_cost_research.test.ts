import { describe, expect, it } from 'vitest';

import {
  BTC5MCompressionBreakoutRetest5XCostExperiment,
  classifyCompression5XCost,
  runBTC5MCompressionBreakoutRetest5XCostReplay,
  type compression_cost_metrics,
} from '../src/btc_5m_compression_breakout_retest_5x_cost_research.js';
import {
  calculateCompressionContext,
  detectCompressionBreakout,
} from '../src/btc_5m_compression_breakout_retest_count.js';
import { calculateFiveCostGeometry } from '../src/btc_5m_impulse_pullback_5x_cost_research.js';
import {
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  type btc_research_market,
  type five_minute_candle,
} from '../src/btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from '../src/decibel_client.js';

const start = Date.UTC(2026, 0, 1),
  minute = 60_000;
const Market: btc_research_market = {
  marketAddress: 'btc',
  tickSize: 0.1,
  lotSize: 0.0001,
  minimumSize: 0.0001,
  maximumLeverage: 53,
  makerFeeRate: 0.001,
  takerFeeRate: 0.002,
};
const one = (index: number, open = 100, high = 101, low = 99, close = 100): BTC_candlestick => ({
  timestamp: new Date(start + index * minute),
  open,
  high,
  low,
  close,
  volume: 1,
});
const five = (
  index: number,
  open = 100,
  high = 105,
  low = 95,
  close = 100,
): five_minute_candle => ({
  timestamp: new Date(start + index * 5 * minute),
  endTimestamp: new Date(start + (index + 1) * 5 * minute),
  open,
  high,
  low,
  close,
  volume: 5,
});
const expand = (candle: five_minute_candle) =>
  Array.from({ length: 5 }, (_, offset) =>
    one(
      candle.timestamp.getTime() / minute - start / minute + offset,
      offset === 0 ? candle.open : candle.close,
      candle.high,
      candle.low,
      candle.close,
    ),
  );
function setup(direction: 'LONG_BTC' | 'SHORT_BTC' = 'LONG_BTC'): five_minute_candle[] {
  const candles = Array.from({ length: 25 }, (_, index) => five(index));
  candles[0] = five(0, 100, 120, 80, 100);
  for (let index = 1; index < 12; index += 1) candles[index] = five(index, 100, 115, 85, 100);
  for (let index = 12; index < 24; index += 1) candles[index] = five(index, 100, 110, 90, 100);
  candles[24] = direction === 'LONG_BTC' ? five(24, 109, 112, 105, 111) : five(24, 91, 95, 88, 89);
  return candles;
}
const history = (tail: BTC_candlestick[], direction: 'LONG_BTC' | 'SHORT_BTC' = 'LONG_BTC') => [
  ...setup(direction).flatMap(expand),
  ...tail,
];
const emptyMetrics = (
  overrides: Partial<compression_cost_metrics> = {},
): compression_cost_metrics => ({
  rawBreakoutCount: 0,
  signalAcceptedWhileFlatCount: 0,
  signalIgnoredWhilePendingCount: 0,
  signalIgnoredWhileActiveCount: 0,
  entryAttemptCount: 0,
  entryFilledCount: 0,
  entryFailedCount: 0,
  entryFillRate: 0,
  completedCampaignCount: 0,
  takeProfitCount: 0,
  stopLossCount: 0,
  marginGuardCount: 0,
  tpRate: 0,
  grossProfitSum: 0,
  grossLossSumAbs: 0,
  grossPnLSum: 0,
  grossProfitFactor: null,
  netProfitSum: 0,
  netLossSumAbs: 0,
  netPnLSum: 0,
  netProfitFactor: null,
  meanHoldingMinutes: 0,
  medianHoldingMinutes: 0,
  meanTotalFees: 0,
  medianTotalFees: 0,
  ...overrides,
});

describe('BTC 5m compression breakout retest 5x cost research', () => {
  it('preserves exact UTC five-minute construction and excludes incomplete buckets', () => {
    const complete = Array.from({ length: 5 }, (_, index) => one(index)),
      incomplete = [5, 6, 8, 9].map((index) => one(index));
    const result = aggregateBTCOneMinuteCandles([...complete, ...incomplete]);
    expect(result).toHaveLength(1);
    expect(result[0]!.timestamp.getTime()).toBe(start);
    expect(result[0]!.endTimestamp.getTime()).toBe(start + 5 * minute);
  });

  it('uses exact preceding 12-vs-12 compression and completed-close breakout rules', () => {
    const candles = setup(),
      context = calculateCompressionContext(candles, 24)!;
    expect(context).toEqual(
      expect.objectContaining({
        previousWindowRange: 40,
        compressionRange: 20,
        compressionRatio: 0.5,
      }),
    );
    expect(detectCompressionBreakout(candles[24]!, context)).toBe('LONG_BTC');
    expect(detectCompressionBreakout(five(24, 100, 120, 91, 109), context)).toBeNull();
    expect(detectCompressionBreakout(five(24, 100, 109, 80, 91), context)).toBeNull();
    expect(detectCompressionBreakout(five(24, 100, 109, 80, 89), context)).toBe('SHORT_BTC');
    const equal = Array.from({ length: 25 }, (_, index) => five(index));
    expect(calculateCompressionContext(equal, 24)).toBeNull();
    expect(calculateCompressionContext(candles, 23)).toBeNull();
  });

  it('uses the frozen boundary limit after close and fills at minute 1 or minute 30 only', () => {
    const first = runBTC5MCompressionBreakoutRetest5XCostReplay({
      candles: history([one(125, 111, 111, 109.8, 110)]),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(first.campaigns[0]).toEqual(
      expect.objectContaining({
        entryLimitPrice: 110,
        entryWindowStartTimestamp: start + 125 * minute,
        minutesToEntry: 1,
        entryFillTimestamp: start + 126 * minute,
      }),
    );
    const tail = Array.from({ length: 30 }, (_, index) =>
      one(125 + index, 111, 111, index === 29 ? 109.8 : 110, 110),
    );
    const thirtieth = runBTC5MCompressionBreakoutRetest5XCostReplay({
      candles: history(tail),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(thirtieth.campaigns[0]?.minutesToEntry).toBe(30);
    const minute31 = [
      ...tail.slice(0, 29),
      one(154, 111, 111, 110, 110),
      one(155, 111, 111, 109.8, 110),
    ];
    const expired = runBTC5MCompressionBreakoutRetest5XCostReplay({
      candles: history(minute31),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(expired.campaigns[0]).toEqual(
      expect.objectContaining({ outcome: 'ENTRY_FAILED', entryFillPrice: null }),
    );
  });

  it('keeps one pending/active campaign, ignores new signals, and never queues or chases', () => {
    const pendingTail = expand(five(25, 111, 114, 110, 113));
    const pending = runBTC5MCompressionBreakoutRetest5XCostReplay({
      candles: history(pendingTail),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(pending.signalAccounting.signalIgnoredWhilePendingCount).toBeGreaterThanOrEqual(1);
    expect(pending.campaigns).toHaveLength(1);
    expect(pending.campaigns[0]?.entryLimitPrice).toBe(110);
    const wideCostMarket = { ...Market, makerFeeRate: 0.01, takerFeeRate: 0.02 };
    const activeTail = expand(five(25, 111, 114, 109, 113));
    const active = runBTC5MCompressionBreakoutRetest5XCostReplay({
      candles: history(activeTail),
      market: wideCostMarket,
      leverageSource: 'TEST',
    });
    expect(active.campaigns[0]?.outcome).toBe('OPEN_AT_DATASET_END');
    expect(active.signalAccounting.signalIgnoredWhileActiveCount).toBeGreaterThanOrEqual(1);
    expect(active.campaigns).toHaveLength(1);
  });

  it('uses causal maker+taker cost geometry, outward ticks, and metadata leverage/sizing', () => {
    const long = calculateFiveCostGeometry({
        direction: 'LONG_BTC',
        fillPrice: 100,
        quantity: 2,
        entryNotional: 200,
        makerFeeRate: 0.001,
        takerFeeRate: 0.002,
        tickSize: 1,
      }),
      short = calculateFiveCostGeometry({
        direction: 'SHORT_BTC',
        fillPrice: 100,
        quantity: 2,
        entryNotional: 200,
        makerFeeRate: 0.001,
        takerFeeRate: 0.002,
        tickSize: 1,
      });
    expect(long).toEqual(
      expect.objectContaining({
        expectedEntryFeeDollars: 0.2,
        expectedExitFeeDollars: 0.4,
        stopTriggerPrice: 98,
        takeProfitTriggerPrice: 102,
      }),
    );
    expect(long.oneCostPriceDistance).toBeCloseTo(0.3);
    expect(long.rawFiveCostPriceDistance).toBeCloseTo(1.5);
    expect(short).toEqual(
      expect.objectContaining({ stopTriggerPrice: 102, takeProfitTriggerPrice: 98 }),
    );
    expect(long.actualStopCostMultiple).toBeGreaterThanOrEqual(5);
    expect(short.actualTakeProfitCostMultiple).toBeGreaterThanOrEqual(5);
    const report = runBTC5MCompressionBreakoutRetest5XCostReplay({
        candles: history([one(125, 110, 112, 108, 110)]),
        market: Market,
        leverageSource: 'RESEARCH_MARKET_METADATA_SNAPSHOT',
      }),
      campaign = report.campaigns[0]!;
    expect(campaign.entryLeverage).toBe(53);
    expect(campaign.quantity).toBe(calculateSingleLegSizing(30, 110, Market)?.quantity);
    expect(campaign.expectedCampaignCostDollars).toBeCloseTo(campaign.entryNotional! * 0.003);
    expect(campaign.totalFees).not.toBe(campaign.expectedCampaignCostDollars);
  });

  it('resolves entry-candle ambiguity as stop, applies actual fees, and tops up only after close', () => {
    const report = runBTC5MCompressionBreakoutRetest5XCostReplay({
        candles: history([one(125, 110, 112, 108, 110)]),
        market: Market,
        leverageSource: 'TEST',
      }),
      campaign = report.campaigns[0]!;
    expect(campaign.outcome).toBe('STOP_LOSS');
    expect(campaign.totalFees).toBeCloseTo(
      campaign.entryNotional! * Market.makerFeeRate +
        campaign.exitPrice! * campaign.quantity! * Market.takerFeeRate,
    );
    expect(report.overall.depositCount).toBe(1);
    expect(report.overall.totalDeposited).toBe(15);
    expect(report.overall.economicPnL).toBeCloseTo(campaign.netPnL);
  });

  it('preserves strict maintenance-margin equality and sequential account invariants', () => {
    const exact = evaluateSingleLegMarginGuard({
      equity: 25,
      direction: 'LONG_BTC',
      entryPrice: 100,
      markPrice: 100,
      quantity: 1,
      maximumLeverage: 2,
    });
    expect(exact.maintenanceMargin).toBe(25);
    expect(exact.triggered).toBe(false);
    expect(
      evaluateSingleLegMarginGuard({
        equity: 24.99,
        direction: 'LONG_BTC',
        entryPrice: 100,
        markPrice: 100,
        quantity: 1,
        maximumLeverage: 2,
      }).triggered,
    ).toBe(true);
  });

  it('reports required aggregates, read-only comparison, split labels, and dataset-end states', () => {
    const artifact = {
        holdout: {
          completedCampaignCount: 10,
          tpRate: 0.5,
          grossProfitFactor: 1,
          netProfitFactor: 0.9,
          grossPnLSum: 2,
          netPnLSum: 1,
          meanHoldingMinutes: 4,
          medianHoldingMinutes: 3,
        },
      },
      report = runBTC5MCompressionBreakoutRetest5XCostReplay({
        candles: history([one(125, 110, 111, 109.8, 110)]),
        market: Market,
        leverageSource: 'TEST',
        impulse5xCostReport: artifact,
      });
    expect(report.comparisonToImpulse5xCost.available).toBe(true);
    expect(report.bySevenDayBlock[0]).toEqual(
      expect.objectContaining({
        entryAttempts: 1,
        entryFills: 1,
        completedCampaignCount: 0,
        grossPnLSum: 0,
        netPnLSum: 0,
      }),
    );
    expect(report.campaigns[0]?.outcome).toBe('OPEN_AT_DATASET_END');
    expect(report.campaigns[0]?.splitLabel).toBe(
      report.campaigns[0]!.breakoutTimestamp < report.split.discoveryEndTimestamp
        ? 'DISCOVERY'
        : 'HOLDOUT',
    );
    expect(artifact.holdout.completedCampaignCount).toBe(10);
    const pending = runBTC5MCompressionBreakoutRetest5XCostReplay({
      candles: history([]),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(pending.campaigns[0]?.outcome).toBe('PENDING_AT_DATASET_END');
    expect(
      runBTC5MCompressionBreakoutRetest5XCostReplay({
        candles: history([]),
        market: Market,
        leverageSource: 'TEST',
      }).comparisonToImpulse5xCost.available,
    ).toBe(false);
  });

  it('calculates holdout/direction/break-even metrics and exact classifications', () => {
    const report = runBTC5MCompressionBreakoutRetest5XCostReplay({
      candles: history([one(125, 110, 112, 108, 110)]),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.byDirection.LONG_BTC.entryFilledCount).toBe(1);
    expect(report.discovery.completedCampaignCount + report.holdout.completedCampaignCount).toBe(1);
    expect(report.breakEvenDiagnostic.overall.actualTpRate).toBe(0);
    expect(
      classifyCompression5XCost(
        emptyMetrics({
          completedCampaignCount: 30,
          grossProfitFactor: 1,
          netProfitFactor: 1,
          netPnLSum: 1,
        }),
        1,
      ),
    ).toBe('BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_HOLDOUT_PROMISING');
    expect(
      classifyCompression5XCost(
        emptyMetrics({ completedCampaignCount: 30, grossProfitFactor: 1, netProfitFactor: 0.8 }),
        -1,
      ),
    ).toBe('BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_HOLDOUT_INTERESTING');
    expect(
      classifyCompression5XCost(
        emptyMetrics({
          completedCampaignCount: 29,
          grossProfitFactor: 2,
          netProfitFactor: 2,
          netPnLSum: 2,
        }),
        2,
      ),
    ).toBe('NO_USEFUL_BTC_5M_COMPRESSION_BREAKOUT_RETEST_5X_COST_EDGE');
    expect(BTC5MCompressionBreakoutRetest5XCostExperiment.entryLifetimeMinutes).toBe(30);
  });
});
