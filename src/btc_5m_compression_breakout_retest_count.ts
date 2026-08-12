import type { BTC_candlestick } from './decibel_client.js';
import {
  aggregateBTCOneMinuteCandles,
  isResearchLimitFillable,
  type five_minute_candle,
  type wick_direction,
} from './btc_5m_wick_rejection_research.js';

export const BTC5MCompressionBreakoutRetestCount = {
  diagnosticId: 'BTC_5M_COMPRESSION_BREAKOUT_RETEST_COUNT_V1' as const,
  windowCandles: 12,
  retestMinutes: 30,
};
export type compression_context = {
  previousWindowHigh: number;
  previousWindowLow: number;
  previousWindowRange: number;
  compressionHigh: number;
  compressionLow: number;
  compressionRange: number;
  compressionRatio: number;
};
export type retest_event = compression_context & {
  breakoutTimestamp: number;
  direction: wick_direction;
  breakoutOpen: number;
  breakoutHigh: number;
  breakoutLow: number;
  breakoutClose: number;
  breakoutDistanceBps: number;
  retestLevel: number;
  retestOccurred: boolean;
  retestStatus: 'RETEST_WITHIN_30M' | 'NO_RETEST_WITHIN_30M';
  retestTimestamp: number | null;
  minutesToRetest: number | null;
};
type cohort = {
  compressedWindowCount: number;
  longBreakoutCount: number;
  shortBreakoutCount: number;
  totalBreakoutCount: number;
  retestWithin30mCount: number;
  retestRate: number;
  meanBreakoutsPerDay: number;
  medianBreakoutsPerDay: number;
};
type seven_day_block = {
  blockIndex: number;
  startTimestamp: number;
  compressedWindowCount: number;
  longBreakoutCount: number;
  shortBreakoutCount: number;
  totalBreakoutCount: number;
  retestWithin30mCount: number;
  retestRate: number;
  meanBreakoutsPerDay: number;
};
export type compression_report = {
  diagnosticId: typeof BTC5MCompressionBreakoutRetestCount.diagnosticId;
  dataRange: Record<string, number | null>;
  construction: Record<string, string>;
  compressionDefinition: Record<string, string>;
  breakoutDefinition: Record<string, string>;
  retestDefinition: Record<string, string>;
  overall: Record<string, unknown>;
  discovery: cohort;
  holdout: cohort;
  byDirection: Record<wick_direction, Record<string, number>>;
  dailyFrequency: Record<string, number>;
  bySevenDayBlock: seven_day_block[];
  events: retest_event[];
  classification:
    | 'COMPRESSION_BREAKOUT_RETEST_FREQUENCY_SUFFICIENT'
    | 'COMPRESSION_BREAKOUT_RETEST_FREQUENCY_LOW_BUT_USABLE'
    | 'COMPRESSION_BREAKOUT_RETEST_TOO_RARE';
};
const minute = 60_000,
  day = 86_400_000,
  week = 7 * day;
const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values: readonly number[], fraction: number) =>
  values.length === 0
    ? 0
    : [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]!;
const windowBounds = (candles: readonly five_minute_candle[]) => ({
  high: Math.max(...candles.map((value) => value.high)),
  low: Math.min(...candles.map((value) => value.low)),
});

export function calculateCompressionContext(
  candles: readonly five_minute_candle[],
  breakoutIndex: number,
): compression_context | null {
  if (breakoutIndex < 24 || breakoutIndex >= candles.length) return null;
  const previous = candles.slice(breakoutIndex - 24, breakoutIndex - 12),
    recent = candles.slice(breakoutIndex - 12, breakoutIndex);
  if (previous.length !== 12 || recent.length !== 12) return null;
  const prior = windowBounds(previous),
    compression = windowBounds(recent),
    previousWindowRange = prior.high - prior.low,
    compressionRange = compression.high - compression.low;
  if (
    !(previousWindowRange > 0) ||
    !(compressionRange > 0) ||
    !(compressionRange < previousWindowRange)
  )
    return null;
  return {
    previousWindowHigh: prior.high,
    previousWindowLow: prior.low,
    previousWindowRange,
    compressionHigh: compression.high,
    compressionLow: compression.low,
    compressionRange,
    compressionRatio: compressionRange / previousWindowRange,
  };
}

export function detectCompressionBreakout(
  candle: five_minute_candle,
  context: compression_context,
): wick_direction | null {
  if (candle.close > context.compressionHigh) return 'LONG_BTC';
  if (candle.close < context.compressionLow) return 'SHORT_BTC';
  return null;
}

export function findFirstRetest(input: {
  oneMinuteCandles: readonly BTC_candlestick[];
  breakoutCompletedAt: number;
  direction: wick_direction;
  level: number;
  tickSize: number;
}): { timestamp: number; minutes: number } | null {
  let left = 0,
    right = input.oneMinuteCandles.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (input.oneMinuteCandles[middle]!.timestamp.getTime() < input.breakoutCompletedAt)
      left = middle + 1;
    else right = middle;
  }
  for (let offset = 0; offset < 30 && left + offset < input.oneMinuteCandles.length; offset += 1) {
    const candle = input.oneMinuteCandles[left + offset]!,
      timestamp = candle.timestamp.getTime();
    if (timestamp >= input.breakoutCompletedAt + 30 * minute) break;
    if (isResearchLimitFillable(input.direction, input.level, candle, input.tickSize))
      return { timestamp: timestamp + minute, minutes: offset + 1 };
  }
  return null;
}

function dailyCounts(events: readonly retest_event[], startTime: number, endTime: number) {
  const firstDay = Math.floor(startTime / day) * day,
    lastDay = Math.floor(Math.max(startTime, endTime - 1) / day) * day,
    days = Math.max(0, Math.floor((lastDay - firstDay) / day) + 1),
    breakouts: number[] = [],
    retests: number[] = [];
  for (let index = 0; index < days; index += 1) {
    const start = firstDay + index * day,
      end = start + day,
      values = events.filter(
        (value) => value.breakoutTimestamp >= start && value.breakoutTimestamp < end,
      );
    breakouts.push(values.length);
    retests.push(values.filter((value) => value.retestOccurred).length);
  }
  return {
    totalObservedDays: days,
    daysWithAtLeastOneBreakout: breakouts.filter((value) => value > 0).length,
    daysWithAtLeastOneRetestedBreakout: retests.filter((value) => value > 0).length,
    meanBreakoutsPerDay: mean(breakouts),
    medianBreakoutsPerDay: percentile(breakouts, 0.5),
    p25BreakoutsPerDay: percentile(breakouts, 0.25),
    p75BreakoutsPerDay: percentile(breakouts, 0.75),
    p90BreakoutsPerDay: percentile(breakouts, 0.9),
    meanRetestedBreakoutsPerDay: mean(retests),
    medianRetestedBreakoutsPerDay: percentile(retests, 0.5),
    zeroBreakoutDayCount: breakouts.filter((value) => value === 0).length,
  };
}
function cohortSummary(
  events: readonly retest_event[],
  compressed: number,
  start: number,
  end: number,
): cohort {
  const daily = dailyCounts(events, start, end),
    retested = events.filter((value) => value.retestOccurred).length;
  return {
    compressedWindowCount: compressed,
    longBreakoutCount: events.filter((value) => value.direction === 'LONG_BTC').length,
    shortBreakoutCount: events.filter((value) => value.direction === 'SHORT_BTC').length,
    totalBreakoutCount: events.length,
    retestWithin30mCount: retested,
    retestRate: events.length === 0 ? 0 : retested / events.length,
    meanBreakoutsPerDay: daily.meanBreakoutsPerDay,
    medianBreakoutsPerDay: daily.medianBreakoutsPerDay,
  };
}
export function classifyCompressionFrequency(
  holdout: cohort,
): compression_report['classification'] {
  if (
    holdout.totalBreakoutCount >= 100 &&
    holdout.retestWithin30mCount >= 50 &&
    holdout.meanBreakoutsPerDay >= 1
  )
    return 'COMPRESSION_BREAKOUT_RETEST_FREQUENCY_SUFFICIENT';
  if (
    holdout.totalBreakoutCount >= 30 &&
    holdout.retestWithin30mCount >= 15 &&
    holdout.meanBreakoutsPerDay >= 0.25
  )
    return 'COMPRESSION_BREAKOUT_RETEST_FREQUENCY_LOW_BUT_USABLE';
  return 'COMPRESSION_BREAKOUT_RETEST_TOO_RARE';
}

export function buildBTC5MCompressionBreakoutRetestCount(input: {
  candles: readonly BTC_candlestick[];
  tickSize: number;
}): compression_report {
  const oneMinute = [...input.candles].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    ),
    fiveMinute = aggregateBTCOneMinuteCandles(oneMinute),
    first = fiveMinute[0]?.timestamp.getTime() ?? 0,
    last = fiveMinute.at(-1)?.endTimestamp.getTime() ?? first,
    split = first + (last - first) * 0.7;
  const events: retest_event[] = [],
    compressedTimes: number[] = [],
    compressionRatios: number[] = [];
  for (let index = 24; index < fiveMinute.length; index += 1) {
    const candle = fiveMinute[index]!,
      context = calculateCompressionContext(fiveMinute, index);
    if (!context) continue;
    const breakoutTimestamp = candle.endTimestamp.getTime();
    compressedTimes.push(breakoutTimestamp);
    compressionRatios.push(context.compressionRatio);
    const direction = detectCompressionBreakout(candle, context);
    if (!direction) continue;
    const retestLevel = direction === 'LONG_BTC' ? context.compressionHigh : context.compressionLow,
      retest = findFirstRetest({
        oneMinuteCandles: oneMinute,
        breakoutCompletedAt: breakoutTimestamp,
        direction,
        level: retestLevel,
        tickSize: input.tickSize,
      }),
      breakoutDistanceBps =
        direction === 'LONG_BTC'
          ? ((candle.close - context.compressionHigh) / candle.close) * 10_000
          : ((context.compressionLow - candle.close) / candle.close) * 10_000;
    events.push({
      breakoutTimestamp,
      direction,
      ...context,
      breakoutOpen: candle.open,
      breakoutHigh: candle.high,
      breakoutLow: candle.low,
      breakoutClose: candle.close,
      breakoutDistanceBps,
      retestLevel,
      retestOccurred: retest !== null,
      retestStatus: retest === null ? 'NO_RETEST_WITHIN_30M' : 'RETEST_WITHIN_30M',
      retestTimestamp: retest?.timestamp ?? null,
      minutesToRetest: retest?.minutes ?? null,
    });
  }
  const discoveryEvents = events.filter((value) => value.breakoutTimestamp < split),
    holdoutEvents = events.filter((value) => value.breakoutTimestamp >= split),
    discoveryCompressed = compressedTimes.filter((value) => value < split).length,
    holdoutCompressed = compressedTimes.length - discoveryCompressed,
    retestTimes = events.flatMap((value) =>
      value.minutesToRetest === null ? [] : [value.minutesToRetest],
    ),
    distances = events.map((value) => value.breakoutDistanceBps),
    daily = dailyCounts(events, first, last),
    discovery = cohortSummary(discoveryEvents, discoveryCompressed, first, split),
    holdout = cohortSummary(holdoutEvents, holdoutCompressed, split, last),
    direction = (side: wick_direction) => {
      const values = events.filter((value) => value.direction === side),
        times = values.flatMap((value) =>
          value.minutesToRetest === null ? [] : [value.minutesToRetest],
        );
      return {
        breakoutCount: values.length,
        retestWithin30mCount: times.length,
        retestRate: values.length === 0 ? 0 : times.length / values.length,
        meanMinutesToRetest: mean(times),
        medianMinutesToRetest: percentile(times, 0.5),
      };
    };
  const blockCount = last <= first ? 0 : Math.ceil((last - first) / week);
  return {
    diagnosticId: BTC5MCompressionBreakoutRetestCount.diagnosticId,
    dataRange: {
      firstTimestamp: oneMinute[0]?.timestamp.getTime() ?? null,
      lastTimestamp: oneMinute.at(-1)?.timestamp.getTime() ?? null,
      oneMinuteCandleCount: oneMinute.length,
    },
    construction: { timeframe: 'UTC_ALIGNED_5M_FROM_EXACTLY_FIVE_CONSECUTIVE_1M' },
    compressionDefinition: { rule: 'recent12Range<previous12Range' },
    breakoutDefinition: { long: 'close>compressionHigh', short: 'close<compressionLow' },
    retestDefinition: {
      window: 'NEXT_EXACTLY_30_1M_CANDLES',
      fill: 'PASSIVE_ONE_TICK_TRADE_THROUGH',
    },
    overall: {
      valid5mCandleCount: fiveMinute.length,
      contextEligible5mCandleCount: Math.max(0, fiveMinute.length - 24),
      compressedWindowCount: compressedTimes.length,
      compressionRate:
        fiveMinute.length <= 24 ? 0 : compressedTimes.length / (fiveMinute.length - 24),
      longBreakoutCount: events.filter((value) => value.direction === 'LONG_BTC').length,
      shortBreakoutCount: events.filter((value) => value.direction === 'SHORT_BTC').length,
      totalBreakoutCount: events.length,
      breakoutPerCompressedWindowRate:
        compressedTimes.length === 0 ? 0 : events.length / compressedTimes.length,
      longRetestWithin30mCount: events.filter(
        (value) => value.direction === 'LONG_BTC' && value.retestOccurred,
      ).length,
      shortRetestWithin30mCount: events.filter(
        (value) => value.direction === 'SHORT_BTC' && value.retestOccurred,
      ).length,
      totalRetestWithin30mCount: retestTimes.length,
      retestRate: events.length === 0 ? 0 : retestTimes.length / events.length,
      retestTiming: {
        retestWithin5mCount: retestTimes.filter((v) => v <= 5).length,
        retestWithin10mCount: retestTimes.filter((v) => v <= 10).length,
        retestWithin15mCount: retestTimes.filter((v) => v <= 15).length,
        retestWithin20mCount: retestTimes.filter((v) => v <= 20).length,
        retestWithin30mCount: retestTimes.length,
        meanMinutesToRetest: mean(retestTimes),
        medianMinutesToRetest: percentile(retestTimes, 0.5),
        p25MinutesToRetest: percentile(retestTimes, 0.25),
        p75MinutesToRetest: percentile(retestTimes, 0.75),
        p90MinutesToRetest: percentile(retestTimes, 0.9),
      },
      breakoutDistance: {
        meanBreakoutDistanceBps: mean(distances),
        medianBreakoutDistanceBps: percentile(distances, 0.5),
        p25BreakoutDistanceBps: percentile(distances, 0.25),
        p75BreakoutDistanceBps: percentile(distances, 0.75),
        p90BreakoutDistanceBps: percentile(distances, 0.9),
      },
      compressionStrength: {
        meanCompressionRatio: mean(compressionRatios),
        medianCompressionRatio: percentile(compressionRatios, 0.5),
        p10CompressionRatio: percentile(compressionRatios, 0.1),
        p25CompressionRatio: percentile(compressionRatios, 0.25),
        p75CompressionRatio: percentile(compressionRatios, 0.75),
        p90CompressionRatio: percentile(compressionRatios, 0.9),
      },
    },
    discovery,
    holdout,
    byDirection: { LONG_BTC: direction('LONG_BTC'), SHORT_BTC: direction('SHORT_BTC') },
    dailyFrequency: daily,
    bySevenDayBlock: Array.from({ length: blockCount }, (_, blockIndex) => {
      const values = events.filter(
        (value) => Math.floor((value.breakoutTimestamp - first) / week) === blockIndex,
      );
      return {
        blockIndex,
        startTimestamp: first + blockIndex * week,
        compressedWindowCount: compressedTimes.filter(
          (value) => Math.floor((value - first) / week) === blockIndex,
        ).length,
        longBreakoutCount: values.filter((value) => value.direction === 'LONG_BTC').length,
        shortBreakoutCount: values.filter((value) => value.direction === 'SHORT_BTC').length,
        totalBreakoutCount: values.length,
        retestWithin30mCount: values.filter((value) => value.retestOccurred).length,
        retestRate:
          values.length === 0
            ? 0
            : values.filter((value) => value.retestOccurred).length / values.length,
        meanBreakoutsPerDay: values.length / 7,
      };
    }),
    events,
    classification: classifyCompressionFrequency(holdout),
  };
}
