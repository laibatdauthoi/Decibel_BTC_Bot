import { z } from 'zod';

import { alignTimestamp, getIntervalMilliseconds } from './candle_interval.js';
import type { BTC_candlestick } from './decibel_client.js';

export type aggregate_interval = '15m' | '1h';
export type BTC_timeframes = {
  '5m': BTC_candlestick[];
  '15m': BTC_candlestick[];
  '1h': BTC_candlestick[];
};

const FIVE_MINUTES_MS = getIntervalMilliseconds('5m');
const CandleSchema = z
  .object({
    timestamp: z.date(),
    open: z.number().positive().finite(),
    high: z.number().positive().finite(),
    low: z.number().positive().finite(),
    close: z.number().positive().finite(),
    volume: z.number().nonnegative().finite(),
  })
  .superRefine((candle, context) => {
    if (candle.high < Math.max(candle.open, candle.close, candle.low)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'High price is inconsistent' });
    }
    if (candle.low > Math.min(candle.open, candle.close, candle.high)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Low price is inconsistent' });
    }
  });

function validateFiveMinuteCandles(candles: readonly BTC_candlestick[]): void {
  for (let index = 0; index < candles.length; index += 1) {
    const candle = CandleSchema.parse(candles[index]);
    const timestamp = candle.timestamp.getTime();
    if (!Number.isSafeInteger(timestamp) || alignTimestamp(timestamp, '5m') !== timestamp) {
      throw new Error('BTC/USD 5m candle timestamp is misaligned');
    }
    const previous = candles[index - 1];
    if (previous === undefined) continue;
    const difference = timestamp - previous.timestamp.getTime();
    if (difference === 0) throw new Error('BTC/USD 5m candles contain duplicate timestamps');
    if (difference < 0) throw new Error('BTC/USD 5m candles are unordered');
    if (difference !== FIVE_MINUTES_MS) {
      const previousTimestamp = previous.timestamp.getTime();
      const expectedTimestamp = previousTimestamp + FIVE_MINUTES_MS;
      const missingIntervalCount = Math.max(0, difference / FIVE_MINUTES_MS - 1);
      throw new Error(
        `BTC/USD 5m candles contain a gap: previousTimestamp=${new Date(previousTimestamp).toISOString()}, nextTimestamp=${new Date(timestamp).toISOString()}, expectedTimestamp=${new Date(expectedTimestamp).toISOString()}, missingIntervalCount=${missingIntervalCount}`,
      );
    }
  }
}

function sumDecimalValues(values: readonly number[]): number {
  const parts = values.map((value) => {
    const [coefficient = '', exponentText = '0'] = value.toString().toLowerCase().split('e');
    const [whole = '', fraction = ''] = coefficient.split('.');
    const exponent = Number(exponentText);
    const scale = fraction.length - exponent;
    const digits = BigInt(`${whole}${fraction}`);
    return scale < 0 ? { digits: digits * 10n ** BigInt(-scale), scale: 0 } : { digits, scale };
  });
  const maximumScale = Math.max(0, ...parts.map((part) => part.scale));
  const total = parts.reduce(
    (sum, part) => sum + part.digits * 10n ** BigInt(maximumScale - part.scale),
    0n,
  );
  if (maximumScale === 0) return Number(total);
  const padded = total.toString().padStart(maximumScale + 1, '0');
  return Number(`${padded.slice(0, -maximumScale)}.${padded.slice(-maximumScale)}`);
}

export function aggregateCompletedCandles(
  candles: readonly BTC_candlestick[],
  interval: aggregate_interval,
): BTC_candlestick[] {
  validateFiveMinuteCandles(candles);
  const intervalMilliseconds = getIntervalMilliseconds(interval);
  const groupSize = intervalMilliseconds / FIVE_MINUTES_MS;
  if (candles.length % groupSize !== 0) {
    throw new Error(`Incomplete ${interval} candle group`);
  }
  const aggregated: BTC_candlestick[] = [];
  for (let index = 0; index < candles.length; index += groupSize) {
    const group = candles.slice(index, index + groupSize);
    const first = group[0];
    const last = group.at(-1);
    if (first === undefined || last === undefined || group.length !== groupSize) {
      throw new Error(`Incomplete ${interval} candle group`);
    }
    const timestamp = first.timestamp.getTime();
    if (alignTimestamp(timestamp, interval) !== timestamp) {
      throw new Error(`${interval} candle group is not UTC-aligned`);
    }
    for (let offset = 0; offset < group.length; offset += 1) {
      if (group[offset]?.timestamp.getTime() !== timestamp + offset * FIVE_MINUTES_MS) {
        throw new Error(`Incomplete ${interval} candle group`);
      }
    }
    aggregated.push({
      timestamp: first.timestamp,
      open: first.open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: last.close,
      volume: sumDecimalValues(group.map((candle) => candle.volume)),
    });
  }
  return aggregated;
}

function aggregateAvailableRange(
  candles: readonly BTC_candlestick[],
  interval: aggregate_interval,
): BTC_candlestick[] {
  const first = candles[0];
  const last = candles.at(-1);
  if (first === undefined || last === undefined) return [];
  const intervalMilliseconds = getIntervalMilliseconds(interval);
  const firstTimestamp = first.timestamp.getTime();
  const alignedStart =
    alignTimestamp(firstTimestamp, interval) === firstTimestamp
      ? firstTimestamp
      : alignTimestamp(firstTimestamp, interval) + intervalMilliseconds;
  const coverageEnd = last.timestamp.getTime() + FIVE_MINUTES_MS;
  const alignedEnd = alignTimestamp(coverageEnd, interval);
  if (alignedStart >= alignedEnd) return [];
  return aggregateCompletedCandles(
    candles.filter((candle) => {
      const timestamp = candle.timestamp.getTime();
      return timestamp >= alignedStart && timestamp < alignedEnd;
    }),
    interval,
  );
}

export function buildBTCTimeframes(
  sourceCandles: readonly BTC_candlestick[],
  now: Date = new Date(),
): BTC_timeframes {
  const nowTimestamp = now.getTime();
  if (!Number.isSafeInteger(nowTimestamp)) throw new Error('Timeframe cutoff is invalid');
  const completedFiveMinuteCandles = sourceCandles.filter(
    (candle) => candle.timestamp.getTime() + FIVE_MINUTES_MS <= nowTimestamp,
  );
  validateFiveMinuteCandles(completedFiveMinuteCandles);
  return {
    '5m': [...completedFiveMinuteCandles],
    '15m': aggregateAvailableRange(completedFiveMinuteCandles, '15m'),
    '1h': aggregateAvailableRange(completedFiveMinuteCandles, '1h'),
  };
}
