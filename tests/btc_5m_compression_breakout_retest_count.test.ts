import { describe, expect, it } from 'vitest';

import {
  BTC5MCompressionBreakoutRetestCount,
  buildBTC5MCompressionBreakoutRetestCount,
  calculateCompressionContext,
  classifyCompressionFrequency,
  detectCompressionBreakout,
  findFirstRetest,
} from '../src/btc_5m_compression_breakout_retest_count.js';
import {
  aggregateBTCOneMinuteCandles,
  type five_minute_candle,
} from '../src/btc_5m_wick_rejection_research.js';
import type { BTC_candlestick } from '../src/decibel_client.js';

const minute = 60_000;
const candle1m = (
  timestamp: number,
  values: Partial<Omit<BTC_candlestick, 'timestamp'>> = {},
): BTC_candlestick => ({
  timestamp: new Date(timestamp),
  open: values.open ?? 100,
  high: values.high ?? 101,
  low: values.low ?? 99,
  close: values.close ?? 100,
  volume: values.volume ?? 1,
});
const candle5m = (
  index: number,
  values: Partial<Omit<five_minute_candle, 'timestamp' | 'endTimestamp'>> = {},
): five_minute_candle => ({
  timestamp: new Date(index * 5 * minute),
  endTimestamp: new Date((index + 1) * 5 * minute),
  open: values.open ?? 100,
  high: values.high ?? 105,
  low: values.low ?? 95,
  close: values.close ?? 100,
  volume: values.volume ?? 5,
});
function expand5m(candle: five_minute_candle): BTC_candlestick[] {
  return Array.from({ length: 5 }, (_, index) =>
    candle1m(candle.timestamp.getTime() + index * minute, {
      open: index === 0 ? candle.open : candle.close,
      high: candle.high,
      low: candle.low,
      close: index === 4 ? candle.close : candle.open,
      volume: candle.volume / 5,
    }),
  );
}
function fullFixture(): BTC_candlestick[] {
  const values = Array.from({ length: 28 }, (_, index) => candle5m(index));
  values[0] = candle5m(0, { high: 120, low: 80 });
  for (let index = 1; index < 12; index += 1)
    values[index] = candle5m(index, { high: 115, low: 85 });
  for (let index = 12; index < 24; index += 1)
    values[index] = candle5m(index, { high: 110, low: 90 });
  values[24] = candle5m(24, { open: 109, high: 112, low: 105, close: 111 });
  values[25] = candle5m(25, { open: 111, high: 114, low: 109, close: 113 });
  values[26] = candle5m(26, { open: 113, high: 114, low: 111, close: 112 });
  values[27] = candle5m(27, { open: 112, high: 113, low: 111, close: 112 });
  const distant = candle5m(576, { high: 105, low: 95, close: 100 });
  return [...values.flatMap(expand5m), ...expand5m(distant)];
}

describe('BTC 5m compression breakout retest count', () => {
  it('constructs UTC-aligned 5m candles only from exactly five consecutive minutes', () => {
    const complete = Array.from({ length: 5 }, (_, index) => candle1m(index * minute)),
      misaligned = Array.from({ length: 5 }, (_, index) =>
        candle1m(5 * minute + index * minute + 1),
      ),
      missing = [0, 1, 3, 4].map((index) => candle1m(10 * minute + index * minute));
    const result = aggregateBTCOneMinuteCandles([...complete, ...misaligned, ...missing]);
    expect(result).toHaveLength(1);
    expect(result[0]!.timestamp.getTime()).toBe(0);
    expect(result[0]!.endTimestamp.getTime()).toBe(5 * minute);
  });

  it('uses the exact preceding 12 plus recent 12 completed candles and excludes breakout', () => {
    const candles = Array.from({ length: 25 }, (_, index) => candle5m(index));
    candles[0] = candle5m(0, { high: 120, low: 80 });
    for (let index = 1; index < 12; index += 1)
      candles[index] = candle5m(index, { high: 115, low: 85 });
    for (let index = 12; index < 24; index += 1)
      candles[index] = candle5m(index, { high: 110, low: 90 });
    candles[24] = candle5m(24, { high: 1_000, low: 1, close: 999 });
    expect(calculateCompressionContext(candles, 23)).toBeNull();
    expect(calculateCompressionContext(candles, 24)).toEqual({
      previousWindowHigh: 120,
      previousWindowLow: 80,
      previousWindowRange: 40,
      compressionHigh: 110,
      compressionLow: 90,
      compressionRange: 20,
      compressionRatio: 0.5,
    });
  });

  it('requires strict range compression and rejects equal ranges', () => {
    const candles = Array.from({ length: 25 }, (_, index) => candle5m(index));
    expect(calculateCompressionContext(candles, 24)).toBeNull();
    candles[0] = candle5m(0, { high: 106, low: 94 });
    expect(calculateCompressionContext(candles, 24)?.compressionRatio).toBeCloseTo(10 / 12);
  });

  it('requires a completed close beyond the boundary, not a wick-only break', () => {
    const context = {
      previousWindowHigh: 120,
      previousWindowLow: 80,
      previousWindowRange: 40,
      compressionHigh: 110,
      compressionLow: 90,
      compressionRange: 20,
      compressionRatio: 0.5,
    };
    expect(detectCompressionBreakout(candle5m(24, { high: 120, close: 109 }), context)).toBeNull();
    expect(detectCompressionBreakout(candle5m(24, { close: 111 }), context)).toBe('LONG_BTC');
    expect(detectCompressionBreakout(candle5m(24, { low: 80, close: 91 }), context)).toBeNull();
    expect(detectCompressionBreakout(candle5m(24, { close: 89 }), context)).toBe('SHORT_BTC');
    const incomplete = Array.from({ length: 4 }, (_, index) => candle1m(index * minute));
    expect(aggregateBTCOneMinuteCandles(incomplete)).toHaveLength(0);
  });

  it('records the first conservative retest and accepts minute 30 but not minute 31', () => {
    const start = 100 * minute,
      immediate = [candle1m(start, { low: 98 }), candle1m(start + minute, { low: 97 })];
    expect(
      findFirstRetest({
        oneMinuteCandles: immediate,
        breakoutCompletedAt: start,
        direction: 'LONG_BTC',
        level: 100,
        tickSize: 1,
      }),
    ).toEqual({ timestamp: start + minute, minutes: 1 });
    const thirty = Array.from({ length: 30 }, (_, index) =>
      candle1m(start + index * minute, { high: index === 29 ? 102 : 100 }),
    );
    expect(
      findFirstRetest({
        oneMinuteCandles: thirty,
        breakoutCompletedAt: start,
        direction: 'SHORT_BTC',
        level: 100,
        tickSize: 1,
      }),
    ).toEqual({ timestamp: start + 30 * minute, minutes: 30 });
    const minute31 = [
      ...thirty.slice(0, 29),
      candle1m(start + 29 * minute, { high: 100 }),
      candle1m(start + 30 * minute, { high: 102 }),
    ];
    expect(
      findFirstRetest({
        oneMinuteCandles: minute31,
        breakoutCompletedAt: start,
        direction: 'SHORT_BTC',
        level: 100,
        tickSize: 1,
      }),
    ).toBeNull();
  });

  it('counts overlapping breakouts independently and reports exact diagnostic formulas', () => {
    const report = buildBTC5MCompressionBreakoutRetestCount({
        candles: fullFixture(),
        tickSize: 0.1,
      }),
      first = report.events.find((event) => event.breakoutTimestamp === 25 * 5 * minute),
      second = report.events.find((event) => event.breakoutTimestamp === 26 * 5 * minute);
    expect(first).toEqual(
      expect.objectContaining({
        direction: 'LONG_BTC',
        retestLevel: 110,
        retestOccurred: true,
        minutesToRetest: 1,
        breakoutDistanceBps: ((111 - 110) / 111) * 10_000,
        compressionRatio: 0.5,
      }),
    );
    expect(second).toEqual(expect.objectContaining({ direction: 'LONG_BTC', retestLevel: 112 }));
    expect(report.events.length).toBeGreaterThanOrEqual(2);
    expect(report.discovery.totalBreakoutCount + report.holdout.totalBreakoutCount).toBe(
      report.events.length,
    );
    expect(report.bySevenDayBlock.reduce((sum, block) => sum + block.totalBreakoutCount, 0)).toBe(
      report.events.length,
    );
    expect(report.dailyFrequency.totalObservedDays).toBe(3);
    expect(report.dailyFrequency.zeroBreakoutDayCount).toBeGreaterThan(0);
    expect(report).not.toHaveProperty('pnl');
    expect(report.events[0]).not.toHaveProperty('leverage');
    expect(report.diagnosticId).toBe(BTC5MCompressionBreakoutRetestCount.diagnosticId);
  });

  it('retains an explicit no-retest result without inspecting beyond 30 minutes', () => {
    const start = 10 * minute,
      candles = Array.from({ length: 31 }, (_, index) =>
        candle1m(start + index * minute, { low: index === 30 ? 98 : 100 }),
      );
    expect(
      findFirstRetest({
        oneMinuteCandles: candles,
        breakoutCompletedAt: start,
        direction: 'LONG_BTC',
        level: 100,
        tickSize: 1,
      }),
    ).toBeNull();
  });

  it('applies the exact frequency classifications', () => {
    const cohort = (
      totalBreakoutCount: number,
      retestWithin30mCount: number,
      meanBreakoutsPerDay: number,
    ) => ({
      compressedWindowCount: 200,
      longBreakoutCount: totalBreakoutCount,
      shortBreakoutCount: 0,
      totalBreakoutCount,
      retestWithin30mCount,
      retestRate: totalBreakoutCount === 0 ? 0 : retestWithin30mCount / totalBreakoutCount,
      meanBreakoutsPerDay,
      medianBreakoutsPerDay: meanBreakoutsPerDay,
    });
    expect(classifyCompressionFrequency(cohort(100, 50, 1))).toBe(
      'COMPRESSION_BREAKOUT_RETEST_FREQUENCY_SUFFICIENT',
    );
    expect(classifyCompressionFrequency(cohort(30, 15, 0.25))).toBe(
      'COMPRESSION_BREAKOUT_RETEST_FREQUENCY_LOW_BUT_USABLE',
    );
    expect(classifyCompressionFrequency(cohort(29, 15, 1))).toBe(
      'COMPRESSION_BREAKOUT_RETEST_TOO_RARE',
    );
  });
});
