import { z } from 'zod';

import { alignTimestamp, getIntervalMilliseconds } from './candle_interval.js';
import type { BTC_candlestick } from './decibel_client.js';

const FIFTEEN_MINUTES_MS = getIntervalMilliseconds('15m');

const BreakoutSetupConfigSchema = z
  .object({
    rangeWindow: z.number().int().positive().max(500),
    shortATRWindow: z.number().int().positive().max(500),
    longATRWindow: z.number().int().positive().max(500),
    compressionRatio: z.number().positive().max(1).finite(),
    volumeMultiple: z.number().positive().finite(),
  })
  .superRefine((config, context) => {
    if (config.shortATRWindow >= config.longATRWindow) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'shortATRWindow must be less than longATRWindow',
      });
    }
  });

const BreakoutSetupEnvironmentSchema = z.object({
  BREAKOUT_RANGE_WINDOW: z.coerce.number().int().positive().max(500).default(20),
  BREAKOUT_SHORT_ATR_WINDOW: z.coerce.number().int().positive().max(500).default(5),
  BREAKOUT_LONG_ATR_WINDOW: z.coerce.number().int().positive().max(500).default(14),
  BREAKOUT_COMPRESSION_RATIO: z.coerce.number().positive().max(1).default(0.75),
  BREAKOUT_VOLUME_MULTIPLE: z.coerce.number().positive().default(1.5),
});

const FifteenMinuteCandleSchema = z
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

export type breakout_setup_config = z.infer<typeof BreakoutSetupConfigSchema>;
export type breakout_setup = {
  direction: 'BULLISH' | 'BEARISH';
  breakoutLevel: number;
  breakoutCandleTime: Date;
  confirmedAtTime: Date;
  volatilityRatio: number;
  volumeRatio: number;
};

export function loadBreakoutSetupConfig(
  environment: Record<string, string | undefined> = process.env,
): breakout_setup_config {
  const parsed = BreakoutSetupEnvironmentSchema.parse(environment);
  return BreakoutSetupConfigSchema.parse({
    rangeWindow: parsed.BREAKOUT_RANGE_WINDOW,
    shortATRWindow: parsed.BREAKOUT_SHORT_ATR_WINDOW,
    longATRWindow: parsed.BREAKOUT_LONG_ATR_WINDOW,
    compressionRatio: parsed.BREAKOUT_COMPRESSION_RATIO,
    volumeMultiple: parsed.BREAKOUT_VOLUME_MULTIPLE,
  });
}

function hasValidCandles(candles: readonly BTC_candlestick[]): boolean {
  for (let index = 0; index < candles.length; index += 1) {
    const parsed = FifteenMinuteCandleSchema.safeParse(candles[index]);
    if (!parsed.success) return false;
    const timestamp = parsed.data.timestamp.getTime();
    if (!Number.isSafeInteger(timestamp) || alignTimestamp(timestamp, '15m') !== timestamp) {
      return false;
    }
    const previous = candles[index - 1];
    if (previous !== undefined && timestamp - previous.timestamp.getTime() !== FIFTEEN_MINUTES_MS) {
      return false;
    }
  }
  return true;
}

function calculateTrueRange(candle: BTC_candlestick, previousClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - previousClose),
    Math.abs(candle.low - previousClose),
  );
}

function calculateAverage(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateMedian(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const right = sorted[middle];
  if (right === undefined) return 0;
  return sorted.length % 2 === 1 ? right : ((sorted[middle - 1] ?? right) + right) / 2;
}

export function detectBreakoutSetups(
  sourceCandles: readonly BTC_candlestick[],
  config: breakout_setup_config,
  now: Date = new Date(),
): breakout_setup[] {
  const validatedConfig = BreakoutSetupConfigSchema.parse(config);
  const nowTimestamp = now.getTime();
  if (!Number.isSafeInteger(nowTimestamp)) throw new Error('Breakout cutoff is invalid');
  const candles = sourceCandles.filter(
    (candle) => candle.timestamp.getTime() + FIFTEEN_MINUTES_MS <= nowTimestamp,
  );
  if (!hasValidCandles(candles)) return [];

  const minimumIndex = Math.max(validatedConfig.rangeWindow, validatedConfig.longATRWindow) + 1;
  const setups: breakout_setup[] = [];
  for (let index = minimumIndex; index < candles.length; index += 1) {
    const breakoutCandle = candles[index];
    if (breakoutCandle === undefined) continue;
    const rangeCandles = candles.slice(index - validatedConfig.rangeWindow, index);
    const longTrueRanges: number[] = [];
    for (
      let rangeIndex = index - validatedConfig.longATRWindow;
      rangeIndex < index;
      rangeIndex += 1
    ) {
      const candle = candles[rangeIndex];
      const previous = candles[rangeIndex - 1];
      if (candle === undefined || previous === undefined) continue;
      longTrueRanges.push(calculateTrueRange(candle, previous.close));
    }
    if (
      rangeCandles.length !== validatedConfig.rangeWindow ||
      longTrueRanges.length !== validatedConfig.longATRWindow
    ) {
      continue;
    }
    const shortTrueRanges = longTrueRanges.slice(-validatedConfig.shortATRWindow);
    const longATR = calculateAverage(longTrueRanges);
    if (longATR <= 0) continue;
    const volatilityRatio = calculateAverage(shortTrueRanges) / longATR;
    if (volatilityRatio > validatedConfig.compressionRatio) continue;

    const medianVolume = calculateMedian(rangeCandles.map((candle) => candle.volume));
    if (medianVolume <= 0) continue;
    const volumeRatio = breakoutCandle.volume / medianVolume;
    if (volumeRatio <= validatedConfig.volumeMultiple) continue;

    const highestHigh = Math.max(...rangeCandles.map((candle) => candle.high));
    const lowestLow = Math.min(...rangeCandles.map((candle) => candle.low));
    const breakoutCandleTime = breakoutCandle.timestamp;
    const confirmedAtTime = new Date(breakoutCandleTime.getTime() + FIFTEEN_MINUTES_MS);
    if (breakoutCandle.close > highestHigh) {
      setups.push({
        direction: 'BULLISH',
        breakoutLevel: highestHigh,
        breakoutCandleTime,
        confirmedAtTime,
        volatilityRatio,
        volumeRatio,
      });
    } else if (breakoutCandle.close < lowestLow) {
      setups.push({
        direction: 'BEARISH',
        breakoutLevel: lowestLow,
        breakoutCandleTime,
        confirmedAtTime,
        volatilityRatio,
        volumeRatio,
      });
    }
  }
  return setups;
}
