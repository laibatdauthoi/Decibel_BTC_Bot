import { describe, expect, it } from 'vitest';
import type { BTC_candlestick } from '../src/decibel_client.js';
import type {
  opportunity_candidate,
  opportunity_scanner_config,
} from '../src/opportunity_scanner.js';
import { diagnoseStrategyCandidate } from '../src/strategy_candidate_diagnostics.js';
import type { BTC_timeframes } from '../src/timeframe_aggregation.js';

const config: opportunity_scanner_config = {
  breakoutRangeBars: 3,
  breakoutVolumeRatio: 1.2,
  breakoutMinimumScore: 85,
  pullbackLookbackBars: 3,
  pullbackMinimumMoveRatio: 0.001,
  pullbackMinimumScore: 85,
  retestToleranceRatio: 0.001,
  retestMinimumRejectionRatio: 0.35,
  retestMinimumScore: 85,
  expansionLookbackBars: 3,
  expansionVolatilityRatio: 1.6,
  expansionVolumeRatio: 1.2,
  expansionMinimumScore: 85,
};

function candle(index: number, overrides: Partial<BTC_candlestick> = {}): BTC_candlestick {
  return {
    timestamp: new Date(index * 300_000),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
    ...overrides,
  };
}

function timeframes(five: BTC_candlestick[]): BTC_timeframes {
  return { '5m': five, '15m': [], '1h': [] };
}

function diagnose(five: BTC_candlestick[], candidates: opportunity_candidate[] = []) {
  return diagnoseStrategyCandidate({
    timeframes: timeframes(five),
    config,
    decisionTime: new Date(five.length * 300_000),
    candidates,
  });
}

describe('strategy candidate diagnostics', () => {
  it('distinguishes insufficient history and invalid source features', () => {
    expect(diagnose([candle(0), candle(1)]).primaryReason).toBe('INSUFFICIENT_CANDLE_HISTORY');
    const invalid = [0, 1, 2, 3].map((index) => candle(index, { high: 100, low: 100, volume: 0 }));
    expect(diagnose(invalid).primaryReason).toBe('MISSING_OR_INVALID_FEATURE_DATA');
  });

  it('reports range/volatility and trend/regime evidence with the nearest miss', () => {
    const result = diagnose([0, 1, 2, 3].map((index) => candle(index)));
    expect(result.reasons).toEqual([
      'VOLATILITY_OR_RANGE_FILTER_FAILED',
      'TREND_OR_REGIME_FILTER_FAILED',
    ]);
    expect(result.evidence).toMatchObject({
      regime: 'UNKNOWN',
      nearestMiss: { breakoutVolumeDeficit: 0.2, expansionVolatilityDeficit: 0.6 },
    });
  });

  it('identifies a formed setup invalidated before candidate output', () => {
    const result = diagnose([
      candle(0),
      candle(1),
      candle(2),
      candle(3, { high: 105, close: 104, volume: 20 }),
    ]);
    expect(result.primaryReason).toBe('CANDIDATE_FORMED_BUT_INVALIDATED');
  });

  it('fails candidate feature validation when microstructure is unavailable or stale', () => {
    const candidateValue: opportunity_candidate = {
      direction: 'LONG',
      candidateType: 'SHORT_RANGE_BREAKOUT',
      detectedAtTime: new Date(900_000),
      availableAtTime: new Date(1_200_000),
      score: 90,
      regime: 'RANGE',
      volatilityRatio: 2,
      volumeRatio: 2,
      reasons: [],
    };
    const result = diagnoseStrategyCandidate({
      timeframes: timeframes([candle(0), candle(1), candle(2), candle(3)]),
      config,
      decisionTime: new Date(1_200_000),
      candidates: [candidateValue],
      microstructureWindows: [
        { seconds: 15, status: 'VALID' },
        { seconds: 60, status: 'INVALID' },
      ],
    });
    expect(result.reasons).toContain('MICROSTRUCTURE_UNAVAILABLE_OR_STALE');
    expect(result.reasons).toContain('MISSING_OR_INVALID_FEATURE_DATA');
  });
});
