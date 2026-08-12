import { describe, expect, it } from 'vitest';
import {
  BTC5MImpulsePullback5XCostExperiment,
  calculateFiveCostGeometry,
  classify5XCost,
  runBTC5MImpulsePullback5XCostReplay,
} from '../src/btc_5m_impulse_pullback_5x_cost_research.js';
import {
  calculateBodyMidpointEntry,
  type pullback_metrics,
} from '../src/btc_5m_impulse_pullback_research.js';
import { detectImpulseSignal } from '../src/btc_5m_impulse_continuation_research.js';
import {
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  type btc_research_market,
  type five_minute_candle,
} from '../src/btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from '../src/decibel_client.js';
const start = Date.UTC(2026, 0, 1);
const one = (
  minute: number,
  open: number,
  high: number,
  low: number,
  close: number,
): BTC_candlestick => ({
  timestamp: new Date(start + minute * 60_000),
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
  close = 101,
): five_minute_candle => ({
  timestamp: new Date(start + index * 300_000),
  endTimestamp: new Date(start + (index + 1) * 300_000),
  open,
  high,
  low,
  close,
  volume: 5,
});
const expand = (index: number, open: number, high: number, low: number, close: number) =>
  Array.from({ length: 5 }, (_, offset) =>
    one(index * 5 + offset, offset === 0 ? open : close, high, low, close),
  );
const context = () => Array.from({ length: 12 }, (_, index) => five(index));
const history = (short = false) => [
  ...context().flatMap((value, index) =>
    expand(index, value.open, value.high, value.low, value.close),
  ),
  ...expand(12, short ? 109 : 100, 110, 99, short ? 100 : 109),
];
const Market: btc_research_market = {
  marketAddress: 'btc',
  tickSize: 0.1,
  lotSize: 0.0001,
  minimumSize: 0.0001,
  maximumLeverage: 53,
  makerFeeRate: 0.001,
  takerFeeRate: 0.002,
};
const metrics = (overrides: Partial<pullback_metrics> = {}): pullback_metrics => ({
  rawSignalCount: 0,
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
  grossPnLSum: 0,
  netPnLSum: 0,
  grossProfitFactor: null,
  netProfitFactor: null,
  meanHoldingMinutes: 0,
  medianHoldingMinutes: 0,
  ...overrides,
});

describe('BTC 5m impulse pullback 5x cost research', () => {
  it('keeps the exact impulse signal, midpoint entry, and five-minute fill window', () => {
    expect(detectImpulseSignal([...context(), five(12, 100, 110, 99, 109)], 12)?.direction).toBe(
      'LONG_BTC',
    );
    expect(calculateBodyMidpointEntry(100, 109)).toBe(104.5);
    const source = history();
    source.push(
      one(65, 108, 109, 105, 108),
      one(66, 108, 109, 105, 108),
      one(67, 106, 108, 104.3, 106),
    );
    const report = runBTC5MImpulsePullback5XCostReplay({
      candles: source,
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.signalAccounting.filledOnMinute3Count).toBe(1);
    expect(report.campaigns[0]?.entryLimitPrice).toBe(104.5);
  });

  it('uses canonical entry maker and conservative taker exit rates known at entry only', () => {
    const geometry = calculateFiveCostGeometry({
      direction: 'LONG_BTC',
      fillPrice: 100,
      quantity: 2,
      entryNotional: 200,
      makerFeeRate: 0.001,
      takerFeeRate: 0.002,
      tickSize: 1,
    });
    expect(geometry.expectedEntryFeeDollars).toBe(0.2);
    expect(geometry.expectedExitFeeDollars).toBe(0.4);
    expect(geometry.expectedCampaignCostDollars).toBeCloseTo(0.6);
    expect(geometry.oneCostPriceDistance).toBeCloseTo(0.3);
    expect(geometry.rawFiveCostPriceDistance).toBeCloseTo(1.5);
  });

  it('rounds LONG and SHORT TP/SL outward and preserves at least five cost multiples', () => {
    const long = calculateFiveCostGeometry({
      direction: 'LONG_BTC',
      fillPrice: 100,
      quantity: 2,
      entryNotional: 200,
      makerFeeRate: 0.001,
      takerFeeRate: 0.002,
      tickSize: 1,
    });
    const short = calculateFiveCostGeometry({
      direction: 'SHORT_BTC',
      fillPrice: 100,
      quantity: 2,
      entryNotional: 200,
      makerFeeRate: 0.001,
      takerFeeRate: 0.002,
      tickSize: 1,
    });
    expect(long).toEqual(
      expect.objectContaining({ stopTriggerPrice: 98, takeProfitTriggerPrice: 102 }),
    );
    expect(short).toEqual(
      expect.objectContaining({ stopTriggerPrice: 102, takeProfitTriggerPrice: 98 }),
    );
    expect(long.actualStopCostMultiple).toBeGreaterThanOrEqual(5);
    expect(long.actualTakeProfitCostMultiple).toBeGreaterThanOrEqual(5);
  });

  it('does not use signal open, 1R, 2R, or future realized fees for geometry', () => {
    const report = runBTC5MImpulsePullback5XCostReplay({
      candles: [...history(), one(65, 106, 106.2, 104.3, 105)],
      market: Market,
      leverageSource: 'TEST',
    });
    const campaign = report.campaigns[0]!;
    expect(campaign.stopTriggerPrice).not.toBe(campaign.signalOpen);
    expect(campaign.actualStopDistance).toBeCloseTo(campaign.actualTakeProfitDistance!);
    expect(campaign.expectedCampaignCostDollars).toBeCloseTo(campaign.entryNotional! * 0.003);
    expect(campaign.totalFees).not.toBe(campaign.expectedCampaignCostDollars);
  });

  it('resolves entry-candle TP/SL ambiguity conservatively and preserves realized fee accounting', () => {
    const report = runBTC5MImpulsePullback5XCostReplay({
      candles: [...history(), one(65, 106, 107, 102, 105)],
      market: Market,
      leverageSource: 'TEST',
    });
    const campaign = report.campaigns[0]!;
    expect(campaign.outcome).toBe('STOP_LOSS');
    expect(campaign.totalFees).toBeCloseTo(
      campaign.entryNotional! * Market.makerFeeRate +
        campaign.exitPrice! * campaign.quantity! * Market.takerFeeRate,
    );
    expect(campaign.realizedToExpectedCostRatio).toBeCloseTo(
      campaign.totalFees / campaign.expectedCampaignCostDollars!,
    );
  });

  it('preserves metadata leverage, sizing, strict maintenance, and exact top-up', () => {
    const sizing = calculateSingleLegSizing(30, 104.5, Market);
    expect(sizing?.initialMargin).toBeCloseTo((sizing?.notional ?? 0) / 53);
    expect(
      evaluateSingleLegMarginGuard({
        equity: 25,
        direction: 'LONG_BTC',
        entryPrice: 100,
        markPrice: 100,
        quantity: 1,
        maximumLeverage: 2,
      }).triggered,
    ).toBe(false);
    const loss = runBTC5MImpulsePullback5XCostReplay({
      candles: [...history(), one(65, 106, 106, 102, 103)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(loss.overall.depositCount).toBe(1);
    expect(loss.overall.totalDeposited).toBe(15);
    expect(loss.overall.economicPnL).toBeCloseTo(loss.campaigns[0]!.netPnL);
  });

  it('reports cost geometry, break-even, direction, holdout, comparisons, and seven-day diagnostics', () => {
    const artifact = { overall: {}, holdout: {} };
    const report = runBTC5MImpulsePullback5XCostReplay({
      candles: [...history(), one(65, 106, 107, 104.3, 106)],
      market: Market,
      leverageSource: 'TEST',
      oneRReport: artifact,
    });
    expect(
      report.costGeometryDiagnostics.overall.medianActualTPCostMultiple,
    ).toBeGreaterThanOrEqual(5);
    expect(report.byDirection.LONG_BTC.entryFilledCount).toBe(1);
    expect(report.holdout.entryFilledCount).toBe(1);
    expect(report.comparisonTo1R.available).toBe(true);
    expect(report.comparisonTo2R.available).toBe(false);
    expect(report.bySevenDayBlock).toHaveLength(1);
    expect(artifact).toEqual({ overall: {}, holdout: {} });
  });

  it('keeps dataset-end position open and implements exact classification', () => {
    const report = runBTC5MImpulsePullback5XCostReplay({
      candles: [...history(), one(65, 106, 106, 104.3, 105)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]?.outcome).toBe('OPEN_AT_DATASET_END');
    expect(
      classify5XCost(
        metrics({
          completedCampaignCount: 30,
          grossProfitFactor: 1,
          netProfitFactor: 1,
          netPnLSum: 1,
        }),
        1,
      ),
    ).toBe('BTC_5M_IMPULSE_PULLBACK_5X_COST_HOLDOUT_PROMISING');
    expect(
      classify5XCost(
        metrics({ completedCampaignCount: 30, grossProfitFactor: 1, netProfitFactor: 0.8 }),
        -1,
      ),
    ).toBe('BTC_5M_IMPULSE_PULLBACK_5X_COST_HOLDOUT_INTERESTING');
    expect(
      classify5XCost(
        metrics({
          completedCampaignCount: 29,
          grossProfitFactor: 2,
          netProfitFactor: 2,
          netPnLSum: 2,
        }),
        2,
      ),
    ).toBe('NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_5X_COST_EDGE');
    expect(BTC5MImpulsePullback5XCostExperiment.costMultiple).toBe(5);
  });
});
