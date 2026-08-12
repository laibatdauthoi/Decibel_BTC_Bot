import { describe, expect, it } from 'vitest';

import {
  BTC5MImpulsePullbackExperiment,
  buildCloseEntryComparison,
  calculateBodyMidpointEntry,
  classifyPullbackReport,
  runBTC5MImpulsePullbackReplay,
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
const context = () => Array.from({ length: 12 }, (_, index) => five(index));
const historyThroughSignal = (short = false): BTC_candlestick[] => {
  const prior = context().flatMap((candle, index) =>
    expand(index, candle.open, candle.high, candle.low, candle.close),
  );
  return [...prior, ...expand(12, short ? 109 : 100, 110, 99, short ? 100 : 109)];
};
const Market: btc_research_market = {
  marketAddress: 'btc',
  tickSize: 0.1,
  lotSize: 0.0001,
  minimumSize: 0.0001,
  maximumLeverage: 53,
  makerFeeRate: 0.001,
  takerFeeRate: 0.002,
};
const emptyMetrics = (overrides: Partial<pullback_metrics> = {}): pullback_metrics => ({
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

describe('BTC 5m impulse pullback research', () => {
  it('uses the exact unchanged impulse detector', () => {
    const candles = [...context(), five(12, 100, 110, 99, 109)];
    expect(detectImpulseSignal(candles, 12)?.direction).toBe('LONG_BTC');
    expect(detectImpulseSignal([...context(), five(12, 109, 110, 99, 100)], 12)?.direction).toBe(
      'SHORT_BTC',
    );
  });

  it('uses body midpoint rather than candle midpoint and places pullback on the correct side', () => {
    expect(calculateBodyMidpointEntry(100, 105)).toBe(102.5);
    expect(calculateBodyMidpointEntry(105, 100)).toBe(102.5);
    expect(calculateBodyMidpointEntry(100, 105)).not.toBe((110 + 90) / 2);
    expect(calculateBodyMidpointEntry(100, 105)).toBeLessThan(105);
    expect(calculateBodyMidpointEntry(105, 100)).toBeGreaterThan(100);
  });

  for (const fillMinute of [1, 2, 3, 4, 5] as const) {
    it(`fills chronologically on eligible minute ${fillMinute} without moving the LIMIT`, () => {
      const history = historyThroughSignal();
      for (let index = 1; index <= 5; index += 1)
        history.push(one(64 + index, 108, 108, index === fillMinute ? 104.3 : 105, 106));
      const report = runBTC5MImpulsePullbackReplay({
        candles: history,
        market: Market,
        leverageSource: 'TEST',
      });
      const campaign = report.campaigns[0]!;
      expect(campaign.entryLimitPrice).toBe(104.5);
      expect(campaign.entryFillPrice).toBe(104.5);
      expect(campaign.entryFillMinuteIndex).toBe(fillMinute);
      expect(report.signalAccounting[`filledOnMinute${fillMinute}Count`]).toBe(1);
    });
  }

  it('expires after minute 5 and never fills or chases on minute 6', () => {
    const history = historyThroughSignal();
    for (let index = 1; index <= 5; index += 1) history.push(one(64 + index, 108, 109, 105, 108));
    history.push(one(70, 105, 106, 104, 105));
    const report = runBTC5MImpulsePullbackReplay({
      candles: history,
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]).toEqual(
      expect.objectContaining({
        outcome: 'ENTRY_FAILED',
        entryFillPrice: null,
        entryLimitPrice: 104.5,
        entryWindowStartTimestamp: start + 65 * 60_000,
        entryWindowEndTimestamp: start + 70 * 60_000,
      }),
    );
    expect(report.signalAccounting).toEqual(
      expect.objectContaining({
        entryAttemptCount: 1,
        entryFilledCount: 0,
        entryFailedCount: 1,
        entryFillRate: 0,
      }),
    );
  });

  it('records pending-at-dataset-end without fabricating a fill', () => {
    const report = runBTC5MImpulsePullbackReplay({
      candles: [...historyThroughSignal(), one(65, 108, 109, 105, 108)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]?.outcome).toBe('PENDING_AT_DATASET_END');
    expect(report.campaigns[0]?.entryFillPrice).toBeNull();
  });

  it('uses signal-open stop, actual fill risk, and exactly 1R for LONG and SHORT', () => {
    const long = runBTC5MImpulsePullbackReplay({
      candles: [...historyThroughSignal(), one(65, 106, 109, 104.3, 108)],
      market: Market,
      leverageSource: 'TEST',
    }).campaigns[0]!;
    const short = runBTC5MImpulsePullbackReplay({
      candles: [...historyThroughSignal(true), one(65, 103, 104.7, 100, 102)],
      market: Market,
      leverageSource: 'TEST',
    }).campaigns[0]!;
    expect(long).toEqual(
      expect.objectContaining({
        stopTriggerPrice: 100,
        entryFillPrice: 104.5,
        riskDistance: 4.5,
        takeProfitTriggerPrice: 109,
      }),
    );
    expect(short).toEqual(
      expect.objectContaining({
        stopTriggerPrice: 109,
        entryFillPrice: 104.5,
        riskDistance: 4.5,
        takeProfitTriggerPrice: 100,
      }),
    );
  });

  it('resolves entry-candle TP/SL ambiguity adversely as STOP_LOSS', () => {
    const report = runBTC5MImpulsePullbackReplay({
      candles: [...historyThroughSignal(), one(65, 106, 109, 99, 105)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]?.outcome).toBe('STOP_LOSS');
    expect(report.campaigns[0]?.holdingMinutes).toBe(0);
  });

  it('reuses unchanged metadata leverage, sizing, and strict maintenance semantics', () => {
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

  it('keeps active position sequential, ignores later signal, and never fabricates closure', () => {
    const narrowContext = Array.from({ length: 12 }, (_, index) =>
      five(index, 100, 102.5, 97.5, 101),
    );
    const candles = [...narrowContext, five(12, 100, 110, 99, 109), five(13, 101, 108, 101, 107.5)];
    const report = runBTC5MImpulsePullbackReplay({
      candles: candles.flatMap((candle, index) =>
        expand(index, candle.open, candle.high, candle.low, candle.close),
      ),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns).toHaveLength(1);
    expect(report.campaigns[0]?.outcome).toBe('OPEN_AT_DATASET_END');
    expect(report.signalAccounting.signalIgnoredWhileActiveCount).toBe(1);
  });

  it('applies exact external deposit accounting after sequential realization', () => {
    const report = runBTC5MImpulsePullbackReplay({
      candles: [...historyThroughSignal(), one(65, 106, 108, 99, 100)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.overall.depositCount).toBe(1);
    expect(report.overall.totalDeposited).toBe(15);
    expect(report.overall.economicPnL).toBeCloseTo(report.campaigns[0]!.netPnL);
  });

  it('populates entry timing, split, direction, and seven-day diagnostics', () => {
    const report = runBTC5MImpulsePullbackReplay({
      candles: [...historyThroughSignal(), one(65, 106, 109, 104.3, 108)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.signalAccounting).toEqual(
      expect.objectContaining({
        signalAcceptedWhileFlatCount: 1,
        entryAttemptCount: 1,
        entryFilledCount: 1,
        entryFillRate: 1,
      }),
    );
    expect(report.entryTimingDiagnostics).toEqual({
      meanPullbackDistanceFromSignalClose: 4.5,
      medianPullbackDistanceFromSignalClose: 4.5,
      meanPullbackFractionOfSignalBody: 0.5,
    });
    expect(report.holdout.rawSignalCount).toBe(1);
    expect(report.byDirection.LONG_BTC.signalCount).toBe(1);
    expect(report.bySevenDayBlock).toHaveLength(1);
  });

  it('compares a prior close-entry artifact read-only and tolerates its absence', () => {
    const current = emptyMetrics({
      completedCampaignCount: 2,
      tpRate: 0.5,
      grossProfitFactor: 1.2,
      netProfitFactor: 1.1,
      netPnLSum: 3,
      meanHoldingMinutes: 4,
    });
    expect(buildCloseEntryComparison(current, current, undefined)).toEqual({ available: false });
    const old = {
      overall: {
        completedCampaignCount: 1,
        tpRate: 0.4,
        grossProfitFactor: 1,
        netProfitFactor: 0.9,
        netPnLSum: 2,
        meanHoldingMinutes: 5,
      },
      holdout: {
        completedCampaignCount: 1,
        tpRate: 0.4,
        grossProfitFactor: 1,
        netProfitFactor: 0.9,
        netPnLSum: 2,
        meanHoldingMinutes: 5,
      },
    };
    const comparison = buildCloseEntryComparison(current, current, old);
    expect(comparison.available).toBe(true);
    if (!comparison.available) throw new Error('Expected close-entry comparison');
    expect(comparison.delta.overall.completedCampaignCount).toBe(1);
    expect(comparison.delta.overall.netPnLSum).toBe(1);
  });

  it('implements exact frozen classification', () => {
    expect(
      classifyPullbackReport(
        emptyMetrics({
          completedCampaignCount: 30,
          grossProfitFactor: 1,
          netProfitFactor: 1,
          netPnLSum: 1,
        }),
        1,
      ),
    ).toBe('BTC_5M_IMPULSE_PULLBACK_1R_HOLDOUT_PROMISING');
    expect(
      classifyPullbackReport(
        emptyMetrics({ completedCampaignCount: 30, grossProfitFactor: 1, netProfitFactor: 0.8 }),
        -1,
      ),
    ).toBe('BTC_5M_IMPULSE_PULLBACK_1R_HOLDOUT_INTERESTING');
    expect(
      classifyPullbackReport(
        emptyMetrics({
          completedCampaignCount: 29,
          grossProfitFactor: 2,
          netProfitFactor: 2,
          netPnLSum: 2,
        }),
        2,
      ),
    ).toBe('NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_1R_EDGE');
    expect(BTC5MImpulsePullbackExperiment.entryWindowMinutes).toBe(5);
  });
});
