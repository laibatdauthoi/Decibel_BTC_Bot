import { describe, expect, it } from 'vitest';
import {
  BTC5MImpulsePullback2RExperiment,
  classifyPullback2RReport,
  runBTC5MImpulsePullback2RReplay,
} from '../src/btc_5m_impulse_pullback_2r_research.js';
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

describe('BTC 5m impulse pullback 2R research', () => {
  it('reuses the identical impulse detector, body midpoint, and five-minute pending fill', () => {
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
    const report = runBTC5MImpulsePullback2RReplay({
      candles: source,
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]?.entryFillMinuteIndex).toBe(3);
    expect(report.signalAccounting.filledOnMinute3Count).toBe(1);
  });

  it('expires unchanged pending entry after minute five and never fills minute six', () => {
    const source = history();
    for (let index = 65; index < 70; index += 1) source.push(one(index, 108, 109, 105, 108));
    source.push(one(70, 105, 106, 104, 105));
    const report = runBTC5MImpulsePullback2RReplay({
      candles: source,
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]?.outcome).toBe('ENTRY_FAILED');
    expect(report.campaigns[0]?.entryFillPrice).toBeNull();
  });

  it('uses unchanged stop/risk but exactly 2R LONG TP, not 1R or signal close', () => {
    const report = runBTC5MImpulsePullback2RReplay({
      candles: [...history(), one(65, 106, 108, 104.3, 106)],
      market: Market,
      leverageSource: 'TEST',
    });
    const campaign = report.campaigns[0]!;
    expect(campaign).toEqual(
      expect.objectContaining({
        entryFillPrice: 104.5,
        stopTriggerPrice: 100,
        riskDistance: 4.5,
        oneRPrice: 109,
        takeProfitTriggerPrice: 113.5,
        entryLeverage: 53,
      }),
    );
    expect(campaign.takeProfitTriggerPrice).not.toBe(campaign.oneRPrice);
    expect(campaign.takeProfitTriggerPrice).not.toBe(campaign.signalClose);
  });

  it('uses unchanged stop/risk but exactly 2R SHORT TP', () => {
    const report = runBTC5MImpulsePullback2RReplay({
      candles: [...history(true), one(65, 103, 104.7, 101, 103)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]).toEqual(
      expect.objectContaining({
        entryFillPrice: 104.5,
        stopTriggerPrice: 109,
        riskDistance: 4.5,
        oneRPrice: 100,
        takeProfitTriggerPrice: 95.5,
      }),
    );
  });

  it('keeps entry-candle and later same-candle ambiguity conservatively STOP_LOSS', () => {
    const entryAmbiguous = runBTC5MImpulsePullback2RReplay({
      candles: [...history(), one(65, 106, 114, 99, 105)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(entryAmbiguous.campaigns[0]?.outcome).toBe('STOP_LOSS');
    expect(entryAmbiguous.winnerContinuationDiagnostic.overall.reached1RFirstCount).toBe(0);
  });

  it('tracks causal 1R then 2R continuation without changing the trade result', () => {
    const report = runBTC5MImpulsePullback2RReplay({
      candles: [...history(), one(65, 106, 109, 104.3, 108), one(66, 109, 114, 108, 113.5)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]?.outcome).toBe('TAKE_PROFIT');
    expect(report.winnerContinuationDiagnostic.overall).toEqual({
      reached1RFirstCount: 1,
      thenReached2RBeforeStopCount: 1,
      thenStoppedBefore2RCount: 0,
      openAtDatasetEndAfter1RCount: 0,
      oneRToTwoRContinuationRate: 1,
    });
  });

  it('excludes unresolved-after-1R cases from continuation-rate denominator', () => {
    const report = runBTC5MImpulsePullback2RReplay({
      candles: [...history(), one(65, 106, 109, 104.3, 108)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(report.campaigns[0]?.outcome).toBe('OPEN_AT_DATASET_END');
    expect(report.winnerContinuationDiagnostic.overall).toEqual(
      expect.objectContaining({
        reached1RFirstCount: 1,
        openAtDatasetEndAfter1RCount: 1,
        oneRToTwoRContinuationRate: 0,
      }),
    );
  });

  it('preserves metadata leverage, sizing, strict margin rule, and top-up accounting', () => {
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
    const loss = runBTC5MImpulsePullback2RReplay({
      candles: [...history(), one(65, 106, 108, 99, 100)],
      market: Market,
      leverageSource: 'TEST',
    });
    expect(loss.overall.depositCount).toBe(1);
    expect(loss.overall.totalDeposited).toBe(15);
    expect(loss.overall.economicPnL).toBeCloseTo(loss.campaigns[0]!.netPnL);
  });

  it('calculates fee burden and direction/seven-day diagnostics exactly', () => {
    const report = runBTC5MImpulsePullback2RReplay({
      candles: [...history(), one(65, 106, 109, 104.3, 108), one(66, 109, 114, 108, 113.5)],
      market: Market,
      leverageSource: 'TEST',
    });
    const campaign = report.campaigns[0]!;
    expect(report.feeBurdenDiagnostic.overall.totalFeesSum).toBeCloseTo(campaign.totalFees);
    expect(report.feeBurdenDiagnostic.overall.netPnLSum).toBeCloseTo(campaign.netPnL);
    expect(report.byDirection.LONG_BTC.completedCampaignCount).toBe(1);
    expect(report.bySevenDayBlock).toHaveLength(1);
  });

  it('reads optional 1R comparison without requiring or mutating it', () => {
    const unavailable = runBTC5MImpulsePullback2RReplay({
      candles: history(),
      market: Market,
      leverageSource: 'TEST',
    });
    expect(unavailable.comparisonTo1R).toEqual({ available: false });
    const old = {
      overall: {
        completedCampaignCount: 1,
        takeProfitCount: 1,
        stopLossCount: 0,
        tpRate: 1,
        grossProfitFactor: 2,
        netProfitFactor: 1.5,
        grossPnLSum: 2,
        netPnLSum: 1,
        meanHoldingMinutes: 1,
        medianHoldingMinutes: 1,
      },
      holdout: {
        completedCampaignCount: 1,
        tpRate: 1,
        grossProfitFactor: 2,
        netProfitFactor: 1.5,
        grossPnLSum: 2,
        netPnLSum: 1,
        meanHoldingMinutes: 1,
        medianHoldingMinutes: 1,
      },
    };
    const available = runBTC5MImpulsePullback2RReplay({
      candles: history(),
      market: Market,
      leverageSource: 'TEST',
      oneRReport: old,
    });
    expect(available.comparisonTo1R.available).toBe(true);
    expect(old.overall.netPnLSum).toBe(1);
  });

  it('implements exact frozen classification thresholds', () => {
    expect(
      classifyPullback2RReport(
        metrics({
          completedCampaignCount: 30,
          grossProfitFactor: 1,
          netProfitFactor: 1,
          netPnLSum: 1,
        }),
        1,
      ),
    ).toBe('BTC_5M_IMPULSE_PULLBACK_2R_HOLDOUT_PROMISING');
    expect(
      classifyPullback2RReport(
        metrics({ completedCampaignCount: 30, grossProfitFactor: 1, netProfitFactor: 0.8 }),
        -1,
      ),
    ).toBe('BTC_5M_IMPULSE_PULLBACK_2R_HOLDOUT_INTERESTING');
    expect(
      classifyPullback2RReport(
        metrics({
          completedCampaignCount: 29,
          grossProfitFactor: 2,
          netProfitFactor: 2,
          netPnLSum: 2,
        }),
        2,
      ),
    ).toBe('NO_USEFUL_BTC_5M_IMPULSE_PULLBACK_2R_EDGE');
    expect(BTC5MImpulsePullback2RExperiment.rewardMultiple).toBe(2);
  });
});
