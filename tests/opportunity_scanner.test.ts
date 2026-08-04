import { describe, expect, it } from 'vitest';

import type { BTC_candlestick } from '../src/decibel_client.js';
import {
  loadOpportunityScannerConfig,
  scanBTCOpportunities,
  summarizeOpportunityCandidates,
  type opportunity_candidate,
  type opportunity_scanner_config,
} from '../src/opportunity_scanner.js';
import type { BTC_timeframes } from '../src/timeframe_aggregation.js';

const FIVE_MINUTES_MS = 300_000;
const FIFTEEN_MINUTES_MS = 900_000;
const ONE_HOUR_MS = 3_600_000;
const structureConfig = { leftBars: 1, rightBars: 1 };
const baseConfig: opportunity_scanner_config = {
  breakoutRangeBars: 3,
  breakoutVolumeRatio: 1.2,
  breakoutMinimumScore: 0,
  pullbackLookbackBars: 3,
  pullbackMinimumMoveRatio: 0.01,
  pullbackMinimumScore: 0,
  retestToleranceRatio: 0.001,
  retestMinimumRejectionRatio: 0.3,
  retestMinimumScore: 0,
  expansionLookbackBars: 3,
  expansionVolatilityRatio: 99,
  expansionVolumeRatio: 99,
  expansionMinimumScore: 0,
};

function makeCandle(
  timestamp: number,
  overrides: Partial<Omit<BTC_candlestick, 'timestamp'>> = {},
): BTC_candlestick {
  return {
    timestamp: new Date(timestamp),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 10,
    ...overrides,
  };
}

function makeTimeframes(
  fiveMinuteCandles: BTC_candlestick[],
  fifteenMinuteCandles: BTC_candlestick[] = [],
  hourlyCandles: BTC_candlestick[] = [],
): BTC_timeframes {
  return {
    '5m': fiveMinuteCandles,
    '15m': fifteenMinuteCandles,
    '1h': hourlyCandles,
  };
}

describe('opportunity scanner', () => {
  it('detects bullish and bearish short-range breakouts on completed candles', () => {
    const prior = [0, 1, 2].map((index) => makeCandle(index * FIVE_MINUTES_MS));
    const bullish = makeCandle(3 * FIVE_MINUTES_MS, {
      high: 104,
      low: 99,
      close: 103,
      volume: 20,
    });
    const bearish = makeCandle(3 * FIVE_MINUTES_MS, {
      high: 101,
      low: 96,
      close: 97,
      volume: 20,
    });

    const long = scanBTCOpportunities(
      makeTimeframes([...prior, bullish]),
      baseConfig,
      structureConfig,
      new Date(4 * FIVE_MINUTES_MS),
    );
    const short = scanBTCOpportunities(
      makeTimeframes([...prior, bearish]),
      baseConfig,
      structureConfig,
      new Date(4 * FIVE_MINUTES_MS),
    );

    expect(long[0]).toMatchObject({
      direction: 'LONG',
      candidateType: 'SHORT_RANGE_BREAKOUT',
      detectedAtTime: bullish.timestamp,
      availableAtTime: new Date(4 * FIVE_MINUTES_MS),
      regime: 'UNKNOWN',
      volumeRatio: 2,
    });
    expect(short[0]).toMatchObject({
      direction: 'SHORT',
      candidateType: 'SHORT_RANGE_BREAKOUT',
    });
    expect(long[0]?.score).toBeGreaterThanOrEqual(0);
    expect(long[0]?.score).toBeLessThanOrEqual(100);
  });

  it('detects trend pullback continuation using only completed 15m context', () => {
    const candles = Array.from({ length: 7 }, (_, index) => makeCandle(index * FIVE_MINUTES_MS));
    candles[4] = makeCandle(4 * FIVE_MINUTES_MS, { high: 110 });
    candles[5] = makeCandle(5 * FIVE_MINUTES_MS, {
      open: 102,
      high: 103,
      low: 100,
      close: 101,
    });
    candles[6] = makeCandle(6 * FIVE_MINUTES_MS, {
      open: 101,
      high: 105,
      low: 100,
      close: 104,
    });
    const fifteen = [
      makeCandle(0, { close: 100 }),
      makeCandle(FIFTEEN_MINUTES_MS, { close: 102, high: 103 }),
    ];
    const config = { ...baseConfig, breakoutVolumeRatio: 99 };

    const candidates = scanBTCOpportunities(
      makeTimeframes(candles, fifteen),
      config,
      structureConfig,
      new Date(7 * FIVE_MINUTES_MS),
    );

    expect(candidates.at(-1)).toMatchObject({
      direction: 'LONG',
      candidateType: 'TREND_PULLBACK_CONTINUATION',
      detectedAtTime: candles[6]?.timestamp,
    });
  });

  it('detects a retest only after the hourly swing is confirmed', () => {
    const candles = Array.from({ length: 37 }, (_, index) => makeCandle(index * FIVE_MINUTES_MS));
    candles[34] = makeCandle(34 * FIVE_MINUTES_MS, {
      open: 80.5,
      high: 81.5,
      low: 80.05,
      close: 81,
    });
    candles[36] = makeCandle(36 * FIVE_MINUTES_MS, {
      open: 80.5,
      high: 81.5,
      low: 80.05,
      close: 81,
    });
    const hours = [
      makeCandle(0, { open: 95, high: 110, low: 90, close: 95 }),
      makeCandle(ONE_HOUR_MS, { open: 90, high: 100, low: 80, close: 90 }),
      makeCandle(2 * ONE_HOUR_MS, { open: 95, high: 110, low: 90, close: 95 }),
    ];
    const config = {
      ...baseConfig,
      breakoutVolumeRatio: 99,
      pullbackMinimumMoveRatio: 0.1,
    };

    expect(
      scanBTCOpportunities(
        makeTimeframes(candles, [], hours),
        config,
        structureConfig,
        new Date(36 * FIVE_MINUTES_MS),
      ).filter((candidate) => candidate.candidateType === 'SWING_LEVEL_RETEST_REJECTION'),
    ).toEqual([]);
    const confirmed = scanBTCOpportunities(
      makeTimeframes(candles, [], hours),
      config,
      structureConfig,
      new Date(37 * FIVE_MINUTES_MS),
    );
    expect(confirmed.at(-1)).toMatchObject({
      direction: 'LONG',
      candidateType: 'SWING_LEVEL_RETEST_REJECTION',
      regime: 'UNKNOWN',
    });
  });

  it('detects volatility expansion and deduplicates an overlapping breakout', () => {
    const prior = [0, 1, 2].map((index) => makeCandle(index * FIVE_MINUTES_MS));
    const expansion = makeCandle(3 * FIVE_MINUTES_MS, {
      high: 105,
      low: 96,
      close: 104,
      volume: 20,
    });
    const config = {
      ...baseConfig,
      expansionVolatilityRatio: 2,
      expansionVolumeRatio: 1.5,
    };

    const candidates = scanBTCOpportunities(
      makeTimeframes([...prior, expansion]),
      config,
      structureConfig,
      new Date(4 * FIVE_MINUTES_MS),
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.candidateType).toBe('VOLATILITY_EXPANSION');
    expect(candidates[0]?.reasons).toContain('overlap:SHORT_RANGE_BREAKOUT');
    expect(candidates[0]?.volatilityRatio).toBe(4.5);
    expect(candidates[0]?.volumeRatio).toBe(2);
  });

  it('does not expose a candidate before the completed 5m close', () => {
    const candles = [0, 1, 2].map((index) => makeCandle(index * FIVE_MINUTES_MS));
    const breakout = makeCandle(3 * FIVE_MINUTES_MS, {
      high: 104,
      low: 99,
      close: 103,
      volume: 20,
    });
    const timeframes = makeTimeframes([...candles, breakout]);

    expect(
      scanBTCOpportunities(
        timeframes,
        baseConfig,
        structureConfig,
        new Date(4 * FIVE_MINUTES_MS - 1),
      ),
    ).toEqual([]);
    const confirmed = scanBTCOpportunities(
      timeframes,
      baseConfig,
      structureConfig,
      new Date(4 * FIVE_MINUTES_MS),
    );
    expect(confirmed[0]?.availableAtTime).toEqual(new Date(4 * FIVE_MINUTES_MS));
  });

  it('summarizes daily frequency, distributions, and nearest-rank score percentiles', () => {
    const makeCandidate = (
      day: number,
      score: number,
      candidateType: opportunity_candidate['candidateType'],
    ): opportunity_candidate => ({
      direction: day % 2 === 0 ? 'LONG' : 'SHORT',
      candidateType,
      detectedAtTime: new Date(Date.UTC(2026, 0, day, 0, 0)),
      availableAtTime: new Date(Date.UTC(2026, 0, day, 0, 5)),
      score,
      regime: 'RANGE',
      volatilityRatio: 1,
      volumeRatio: 1,
      reasons: [],
    });
    const candidates = [
      makeCandidate(1, 40, 'SHORT_RANGE_BREAKOUT'),
      makeCandidate(1, 60, 'VOLATILITY_EXPANSION'),
      makeCandidate(2, 80, 'TREND_PULLBACK_CONTINUATION'),
      makeCandidate(2, 100, 'SWING_LEVEL_RETEST_REJECTION'),
    ];

    expect(summarizeOpportunityCandidates(candidates)).toMatchObject({
      totalCandidateCount: 4,
      averageCandidatesPerDay: 2,
      candidatesPerDay: [
        { date: '2026-01-01', count: 2 },
        { date: '2026-01-02', count: 2 },
      ],
      distributionByDirection: { LONG: 2, SHORT: 2 },
      distributionByRegime: { TREND_UP: 0, TREND_DOWN: 0, RANGE: 4, UNKNOWN: 0 },
      scorePercentiles: { p25: 40, p50: 60, p75: 80, p90: 100 },
    });
  });

  it('loads deterministic defaults without a trade-count target', () => {
    expect(loadOpportunityScannerConfig({})).toEqual({
      breakoutRangeBars: 6,
      breakoutVolumeRatio: 1.2,
      breakoutMinimumScore: 85,
      pullbackLookbackBars: 6,
      pullbackMinimumMoveRatio: 0.001,
      pullbackMinimumScore: 85,
      retestToleranceRatio: 0.001,
      retestMinimumRejectionRatio: 0.35,
      retestMinimumScore: 85,
      expansionLookbackBars: 12,
      expansionVolatilityRatio: 1.6,
      expansionVolumeRatio: 1.2,
      expansionMinimumScore: 85,
    });
  });

  it('applies fixed per-type research score thresholds without a daily quota', () => {
    const candles = [0, 1, 2].map((index) => makeCandle(index * FIVE_MINUTES_MS));
    candles.push(makeCandle(3 * FIVE_MINUTES_MS, { high: 104, low: 99, close: 103, volume: 20 }));

    expect(
      scanBTCOpportunities(
        makeTimeframes(candles),
        { ...baseConfig, breakoutMinimumScore: 100 },
        structureConfig,
        new Date(4 * FIVE_MINUTES_MS),
      ),
    ).toEqual([]);
  });
});
