import { describe, expect, it } from 'vitest';

import {
  BTC5MImpulseContinuationExperiment,
  calculateImpulseGeometry,
  calculateMedian,
  classifyImpulseReport,
  detectImpulseSignal,
  runBTC5MImpulseContinuationReplay,
  type impulse_metrics,
} from '../src/btc_5m_impulse_continuation_research.js';
import {
  aggregateBTCOneMinuteCandles,
  calculateSingleLegSizing,
  evaluateSingleLegMarginGuard,
  type btc_research_market,
  type five_minute_candle,
} from '../src/btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from '../src/decibel_client.js';

const baseTime = Date.UTC(2026, 0, 1);
const one = (
  minute: number,
  open: number,
  high: number,
  low: number,
  close: number,
): BTC_candlestick => ({
  timestamp: new Date(baseTime + minute * 60_000),
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
  timestamp: new Date(baseTime + index * 300_000),
  endTimestamp: new Date(baseTime + (index + 1) * 300_000),
  open,
  high,
  low,
  close,
  volume: 5,
});
const previous = () => Array.from({ length: 12 }, (_, index) => five(index, 100, 105, 95, 101));
const expand = (
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
): BTC_candlestick[] =>
  Array.from({ length: 5 }, (_, offset) =>
    one(index * 5 + offset, offset === 0 ? open : close, high, low, close),
  );
const Market: btc_research_market = {
  marketAddress: 'btc',
  tickSize: 0.1,
  lotSize: 0.0001,
  minimumSize: 0.0001,
  maximumLeverage: 7,
  makerFeeRate: 0.001,
  takerFeeRate: 0.002,
};
const metrics = (overrides: Partial<impulse_metrics> = {}): impulse_metrics => ({
  rawSignalCount: 0,
  signalIgnoredWhileActiveCount: 0,
  entryFilledCount: 0,
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

describe('BTC 5m impulse continuation research', () => {
  it('reuses exact UTC-aligned five-consecutive-minute OHLCV aggregation', () => {
    const source = [
      one(0, 100, 102, 99, 101),
      one(1, 101, 104, 100, 103),
      one(2, 103, 105, 97, 98),
      one(3, 98, 101, 96, 100),
      one(4, 100, 106, 99, 105),
    ];
    expect(aggregateBTCOneMinuteCandles(source)[0]).toEqual(
      expect.objectContaining({
        timestamp: new Date(baseTime),
        open: 100,
        high: 106,
        low: 96,
        close: 105,
        volume: 5,
      }),
    );
    expect(aggregateBTCOneMinuteCandles(source.slice(0, 4))).toEqual([]);
    expect(
      aggregateBTCOneMinuteCandles([
        source[0]!,
        source[1]!,
        source[3]!,
        source[4]!,
        one(5, 1, 2, 1, 2),
      ]),
    ).toEqual([]);
  });

  it('calculates exact impulse geometry and rejects non-positive ranges', () => {
    expect(calculateImpulseGeometry(five(12, 100, 110, 90, 108))).toEqual({
      range: 20,
      body: 8,
      bodyFraction: 0.4,
      closeLocation: 0.9,
    });
    expect(detectImpulseSignal([...previous(), five(12, 100, 100, 100, 100)], 12)).toBeNull();
  });

  it('uses ordinary even median and strictly excludes the signal candle', () => {
    expect(calculateMedian([12, 1, 11, 2, 10, 3, 9, 4, 8, 5, 7, 6])).toBe(6.5);
    const candles = previous();
    candles[0] = five(0, 100, 101, 100, 101);
    const signal = detectImpulseSignal([...candles, five(12, 100, 130, 99, 129)], 12);
    expect(signal?.previous12MedianRange).toBe(10);
  });

  it('requires exactly 12 prior completed valid candles', () => {
    expect(
      detectImpulseSignal([...previous().slice(0, 11), five(11, 100, 110, 99, 109)], 11),
    ).toBeNull();
    expect(detectImpulseSignal([...previous(), five(12, 100, 110, 99, 109)], 12)?.direction).toBe(
      'LONG_BTC',
    );
  });

  it('enforces every frozen LONG condition without adding candle-color alternatives', () => {
    const valid = [...previous(), five(12, 100, 110, 99, 109)];
    expect(detectImpulseSignal(valid, 12)?.direction).toBe('LONG_BTC');
    expect(
      detectImpulseSignal([...previous(), five(12, 109, 110, 99, 100)], 12)?.direction,
    ).not.toBe('LONG_BTC');
    expect(detectImpulseSignal([...previous(), five(12, 100, 110, 99, 106)], 12)).toBeNull();
    expect(detectImpulseSignal([...previous(), five(12, 95, 105, 95, 102)], 12)).toBeNull();
    expect(detectImpulseSignal([...previous(), five(12, 100, 108, 99, 107)], 12)).toBeNull();
  });

  it('enforces every frozen SHORT condition and cannot signal both directions', () => {
    expect(detectImpulseSignal([...previous(), five(12, 109, 110, 99, 100)], 12)?.direction).toBe(
      'SHORT_BTC',
    );
    expect(
      detectImpulseSignal([...previous(), five(12, 100, 110, 99, 109)], 12)?.direction,
    ).not.toBe('SHORT_BTC');
    expect(detectImpulseSignal([...previous(), five(12, 109, 110, 99, 103)], 12)).toBeNull();
    expect(detectImpulseSignal([...previous(), five(12, 109, 110, 100, 103)], 12)).toBeNull();
    expect(detectImpulseSignal([...previous(), five(12, 108, 109, 100, 101)], 12)).toBeNull();
  });

  it('uses metadata leverage and exactly the shared single-leg sizing semantics', () => {
    const sized = calculateSingleLegSizing(30, 109, Market);
    expect(sized).not.toBeNull();
    expect(sized?.initialMargin).toBeCloseTo((sized?.notional ?? 0) / 7);
    expect(BTC5MImpulseContinuationExperiment.minimumBodyFraction).toBe(0.6);
  });

  it('uses strict maintenance inequality with equality remaining healthy', () => {
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

  it('expires an entry after only the immediate next 1m candle', () => {
    const history = previous().flatMap((candle, index) =>
      expand(index, candle.open, candle.high, candle.low, candle.close),
    );
    history.push(
      ...expand(12, 100, 110, 99, 109),
      one(65, 111, 112, 110, 111),
      one(66, 109, 120, 108, 119),
    );
    const report = runBTC5MImpulseContinuationReplay({
      candles: history,
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.signalAccounting).toEqual(
      expect.objectContaining({
        rawSignalCount: 1,
        entryAttemptCount: 1,
        entryFilledCount: 0,
        entryFailedCount: 1,
      }),
    );
  });

  it('uses signal close LIMIT, signal-open stop, actual-fill risk, exact 1R TP, and 1m exits', () => {
    const history = previous().flatMap((candle, index) =>
      expand(index, candle.open, candle.high, candle.low, candle.close),
    );
    history.push(...expand(12, 100, 110, 99, 109), one(65, 109, 119, 108, 118));
    const campaign = runBTC5MImpulseContinuationReplay({
      candles: history,
      market: Market,
      leverageSource: 'TEST',
    }).campaigns[0]!;
    expect(campaign).toEqual(
      expect.objectContaining({
        entryOrderTimestamp: baseTime + 65 * 60_000,
        entryFillPrice: 109,
        stopTriggerPrice: 100,
        riskDistance: 9,
        takeProfitTriggerPrice: 118,
        outcome: 'TAKE_PROFIT',
        entryLeverage: 7,
      }),
    );
  });

  it('resolves same-candle TP and SL conservatively to STOP_LOSS', () => {
    const history = previous().flatMap((candle, index) =>
      expand(index, candle.open, candle.high, candle.low, candle.close),
    );
    history.push(...expand(12, 100, 110, 99, 109), one(65, 109, 119, 99, 105));
    expect(
      runBTC5MImpulseContinuationReplay({
        candles: history,
        market: Market,
        leverageSource: 'TEST',
      }).campaigns[0]?.outcome,
    ).toBe('STOP_LOSS');
  });

  it('keeps an unclosed campaign open and ignores later signals without queuing', () => {
    const candles = [...previous(), five(12, 100, 110, 99, 109), five(13, 101, 112, 101, 111)];
    const history = candles.flatMap((candle, index) =>
      expand(index, candle.open, candle.high, candle.low, candle.close),
    );
    const report = runBTC5MImpulseContinuationReplay({
      candles: history,
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]?.outcome).toBe('OPEN_AT_DATASET_END');
    expect(report.signalAccounting.signalIgnoredWhileActiveCount).toBe(1);
  });

  it('populates holdout and direction accounting without redundant zero raw counts', () => {
    const history = previous().flatMap((candle, index) =>
      expand(index, candle.open, candle.high, candle.low, candle.close),
    );
    history.push(...expand(12, 100, 110, 99, 109), one(65, 109, 119, 108, 118));
    const report = runBTC5MImpulseContinuationReplay({
      candles: history,
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.holdout.rawSignalCount).toBe(1);
    expect(report.holdout.byDirection.LONG_BTC.signalCount).toBe(1);
    expect(report.holdout.byDirection.LONG_BTC).not.toHaveProperty('rawSignalCount');
    expect(report.bySevenDayBlock).toHaveLength(1);
    expect(report.overall.economicPnL).toBeCloseTo(
      report.overall.endingEquity - 30 - report.overall.totalDeposited,
    );
  });

  it('updates sequential equity and applies exactly $15 external top-up below $15', () => {
    const history = previous().flatMap((candle, index) =>
      expand(index, candle.open, candle.high, candle.low, candle.close),
    );
    history.push(...expand(12, 100, 110, 99, 109), one(65, 109, 110, 99, 100));
    const report = runBTC5MImpulseContinuationReplay({
      candles: history,
      market: { ...Market, maximumLeverage: 10 },
      leverageSource: 'TEST',
    });
    expect(report.overall.depositCount).toBe(1);
    expect(report.overall.totalDeposited).toBe(15);
    expect(report.campaigns[0]?.depositAppliedAfterCampaign).toBe(15);
    expect(report.overall.endingEquity).toBeCloseTo(
      report.campaigns[0]!.equityAfterRealization + 15,
    );
    expect(report.overall.economicPnL).toBeCloseTo(report.campaigns[0]!.netPnL);
  });

  it('implements the frozen classification thresholds exactly', () => {
    expect(
      classifyImpulseReport(
        metrics({
          completedCampaignCount: 30,
          grossProfitFactor: 1,
          netProfitFactor: 1,
          netPnLSum: 1,
        }),
        1,
      ),
    ).toBe('BTC_5M_IMPULSE_1R_HOLDOUT_PROMISING');
    expect(
      classifyImpulseReport(
        metrics({ completedCampaignCount: 30, grossProfitFactor: 1, netProfitFactor: 0.8 }),
        -1,
      ),
    ).toBe('BTC_5M_IMPULSE_1R_HOLDOUT_INTERESTING');
    expect(
      classifyImpulseReport(
        metrics({
          completedCampaignCount: 29,
          grossProfitFactor: 2,
          netProfitFactor: 2,
          netPnLSum: 2,
        }),
        2,
      ),
    ).toBe('NO_USEFUL_BTC_5M_IMPULSE_1R_EDGE');
  });
});
