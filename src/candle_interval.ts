import { z } from 'zod';

export const CandleIntervalSchema = z.enum([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1mo',
]);

export type candle_interval = z.infer<typeof CandleIntervalSchema>;

const fixedIntervalMilliseconds: Record<Exclude<candle_interval, '1mo'>, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
};

export function getIntervalMilliseconds(interval: candle_interval): number {
  if (interval === '1mo') {
    throw new Error('Monthly candles do not have a fixed millisecond duration');
  }
  return fixedIntervalMilliseconds[interval];
}

export function alignTimestamp(timestamp: number, interval: candle_interval): number {
  if (interval === '1mo') {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  }
  const duration = getIntervalMilliseconds(interval);
  return Math.floor(timestamp / duration) * duration;
}

export function getNextTimestamp(timestamp: number, interval: candle_interval): number {
  if (interval === '1mo') {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return timestamp + getIntervalMilliseconds(interval);
}
